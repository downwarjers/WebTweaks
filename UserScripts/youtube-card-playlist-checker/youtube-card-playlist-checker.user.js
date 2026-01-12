// ==UserScript==
// @name         YouTube 影片卡片清單播放清單檢查器
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      5.5
// @description  在 YouTube 透過呼叫 YouTube 內部 API (`get_add_to_playlist`) 檢查狀態，並在影片標題上方顯示結果。
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-card-playlist-checker/youtube-card-playlist-checker.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-card-playlist-checker/youtube-card-playlist-checker.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==========================================
  // 1. 設定
  // ==========================================
  const CONFIG = {
    interval: 800, // 請求間隔
  };

  const workQueue = [];
  let isProcessing = false;

  // 【關鍵修改】改用 Map 來儲存 API 結果，而不是只記 ID
  // Key: videoId, Value: { text: string, color: string }
  const resultCache = new Map();

  // ==========================================
  // 2. 認證工具
  // ==========================================
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  }

  async function generateSAPISIDHASH() {
    const sapisid = getCookie('SAPISID');
    if (!sapisid) return null;
    const time = Math.floor(Date.now() / 1000);
    const origin = window.location.origin;
    const str = `${time} ${sapisid} ${origin}`;
    const buf = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest('SHA-1', buf);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `SAPISIDHASH ${time}_${hash}`;
  }

  function waitForConfig() {
    return new Promise((resolve) => {
      if (window.ytcfg && window.ytcfg.get) return resolve(window.ytcfg);
      setTimeout(() => resolve(window.ytcfg), 1000);
    });
  }

  // ==========================================
  // 3. API 請求 (VideoID 直球對決)
  // ==========================================
  async function checkVideoPlaylists(videoId) {
    try {
      const ytConfig = await waitForConfig();
      const apiKey = ytConfig.get('INNERTUBE_API_KEY');
      const context = ytConfig.get('INNERTUBE_CONTEXT');
      const authHeader = await generateSAPISIDHASH();

      if (!authHeader) return { success: false, message: '未登入' };

      const response = await fetch(
        `https://www.youtube.com/youtubei/v1/playlist/get_add_to_playlist?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            'X-Origin': window.location.origin,
          },
          body: JSON.stringify({
            context: context,
            videoIds: [videoId],
          }),
        },
      );

      if (!response.ok) throw new Error(`${response.status}`);
      const json = await response.json();

      const addedLists = [];
      function scan(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.playlistAddToOptionRenderer) {
          const p = obj.playlistAddToOptionRenderer;
          const status = p.containsSelectedVideos || p.containsSelectedVideo;
          if (status === 'ALL' || status === 'TRUE' || status === true) {
            const title = p.title.simpleText || p.title.runs?.[0]?.text;
            addedLists.push(title);
          }
        }
        for (let k in obj) scan(obj[k]);
      }
      scan(json);

      return { success: true, lists: addedLists };
    } catch (e) {
      return { success: false, message: e.message || 'Error' };
    }
  }

  // ==========================================
  // 4. 佇列處理
  // ==========================================
  async function processQueue() {
    if (isProcessing || workQueue.length === 0) return;
    isProcessing = true;

    const job = workQueue.shift();
    const { labelDiv, videoId } = job;

    // 如果這個 ID 已經在排隊過程中被別人查過了(極端情況)，直接用緩存
    if (resultCache.has(videoId)) {
      updateLabel(labelDiv, resultCache.get(videoId));
      isProcessing = false;
      processQueue();
      return;
    }

    const result = await checkVideoPlaylists(videoId);

    // 準備緩存資料
    let cacheData = {};
    if (result.success) {
      if (result.lists.length > 0) {
        cacheData = {
          html: `📂 位於：<span style="color:#fff;">${result.lists.join(', ')}</span>`,
          color: '#2ba640', // 綠色
        };
      } else {
        cacheData = {
          text: '⚪ 未收藏',
          color: '#aaa', // 灰色
        };
      }
    } else {
      cacheData = {
        text: `❌ ${result.message}`,
        color: '#ff4e45', // 紅色
      };
    }

    // 寫入緩存
    resultCache.set(videoId, cacheData);

    // 更新 UI (如果元素還在)
    if (document.body.contains(labelDiv)) {
      updateLabel(labelDiv, cacheData);
    }

    setTimeout(() => {
      isProcessing = false;
      processQueue();
    }, CONFIG.interval);
  }

  function updateLabel(div, data) {
    if (data.html) {
      div.innerHTML = data.html;
    } else {
      div.textContent = data.text;
    }
    div.style.color = data.color;
  }

  // ==========================================
  // 5. 掃描與 UI 注入
  // ==========================================
  function scanAndTagCards() {
    // 【修改點】在選擇器字串中加入 ytd-playlist-video-renderer
    const cardSelectors =
      'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-rich-grid-media, ytd-playlist-video-renderer';
    const cards = document.querySelectorAll(cardSelectors);

    cards.forEach((card) => {
      // 1. 如果這張卡片已經有標籤了，就跳過
      if (card.querySelector('.my-playlist-tag')) return;

      // 2. 抓取 Video ID
      // ytd-playlist-video-renderer 的結構中，a#thumbnail 也是存在的，且包含 href
      const link = card.querySelector('a#thumbnail') || card.querySelector('a[href*="/watch?v="]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || !href.includes('v=')) return;
      const videoId = href.split('v=')[1].split('&')[0];
      if (!videoId) return;

      // 3. 準備 UI 容器
      let targetContainer = null;
      let styleType = 'DEFAULT';

      // 檢查是否為 Lockup (Shorts 等)
      const lockupMeta = card.querySelector('.yt-lockup-metadata-view-model__text-container');
      if (lockupMeta) {
        targetContainer = lockupMeta;
        styleType = 'TYPE_LOCKUP';
      } else {
        // 一般影片與 Playlist 列表通常都有 #meta
        const metaBlock = card.querySelector('#meta');
        if (metaBlock) {
          targetContainer = metaBlock;
          styleType = 'TYPE_GRID';
        }
      }

      if (targetContainer) {
        // 建立標籤
        const labelDiv = document.createElement('div');
        labelDiv.className = 'my-playlist-tag';

        labelDiv.style.fontSize = '12px';
        labelDiv.style.fontWeight = 'bold';
        labelDiv.style.fontFamily = '"Roboto","Arial",sans-serif';
        labelDiv.style.lineHeight = '1.2';

        // --- 樣式分流 ---
        if (styleType === 'TYPE_LOCKUP') {
          labelDiv.style.marginBottom = '4px';
        } else {
          // TYPE_GRID (包含 Playlist 列表)
          labelDiv.style.display = 'flex';
          labelDiv.style.alignItems = 'center';
          labelDiv.style.height = '24px';
          // 針對 Playlist 列表，如果覺得 marginTop 太大可在此微調，目前維持原樣
          labelDiv.style.marginTop = '8px';
          labelDiv.style.marginBottom = '4px';
        }

        // 插入 UI (插在 meta 容器的最上方，即標題上方)
        targetContainer.insertBefore(labelDiv, targetContainer.firstChild);

        // 檢查緩存
        if (resultCache.has(videoId)) {
          updateLabel(labelDiv, resultCache.get(videoId));
        } else {
          labelDiv.textContent = '⏳ ...';
          labelDiv.style.color = '#f1c40f';

          workQueue.push({
            labelDiv: labelDiv,
            videoId: videoId,
          });
          processQueue();
        }
      }
    });
  }

  const observer = new MutationObserver((mutations) => {
    scanAndTagCards();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(scanAndTagCards, 1500);
})();
