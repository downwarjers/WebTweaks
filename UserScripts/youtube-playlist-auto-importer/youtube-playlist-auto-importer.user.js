// ==UserScript==
// @name         YouTube 影片庫自動化匯入撥放清單工具
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.2.0
// @description  批次匯入影片至指定清單，並自動掃描帳號內所有播放清單，確保影片在全域收藏中不重複。
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        GM_addStyle
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-playlist-auto-importer/youtube-playlist-auto-importer.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-playlist-auto-importer/youtube-playlist-auto-importer.user.js
// ==/UserScript==

(function () {
  'use strict';

  // --- UI 樣式 ---
  GM_addStyle(`
        #yt-global-panel {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 400px;
            background: #1f1f1f;
            border: 1px solid #ff4e45;
            border-radius: 12px;
            z-index: 9999;
            padding: 15px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            color: #fff;
            font-family: Roboto, Arial, sans-serif;
            display: none;
        }
        #yt-global-panel.visible { display: block; }
        #yt-global-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        #yt-global-title { font-size: 16px; font-weight: bold; color: #ff4e45; }
        #yt-global-close { cursor: pointer; font-size: 18px; }
        
        .yt-select-container { display: flex; gap: 5px; margin-bottom: 10px; align-items: center; }
        #yt-target-select {
            flex-grow: 1;
            background: #0f0f0f;
            border: 1px solid #444;
            color: #eee;
            padding: 8px;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
        }
        #yt-refresh-list {
            cursor: pointer;
            padding: 8px;
            background: #333;
            border-radius: 4px;
            font-size: 14px;
            user-select: none;
            min-width: 20px;
            text-align: center;
        }
        #yt-refresh-list:hover { background: #444; }

        .yt-global-input {
            width: 100%;
            background: #0f0f0f;
            border: 1px solid #444;
            color: #eee;
            padding: 8px;
            margin-bottom: 10px;
            border-radius: 4px;
            box-sizing: border-box;
            resize: vertical;
            font-family: monospace;
            font-size: 12px;
        }
        #yt-global-btn {
            width: 100%;
            background: #ff4e45;
            color: #fff;
            border: none;
            padding: 8px;
            border-radius: 18px;
            cursor: pointer;
            font-weight: bold;
        }
        #yt-global-btn:disabled { background: #555; color: #888; cursor: not-allowed; }
        #yt-global-log {
            margin-top: 10px;
            font-size: 12px;
            color: #aaa;
            max-height: 250px; /* 增加高度 */
            overflow-y: auto;
            white-space: pre-wrap;
            border-top: 1px solid #333;
            padding-top: 5px;
        }
        #yt-embedded-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            cursor: pointer;
            border-radius: 50%;
            background: transparent;
            border: none;
            color: var(--yt-spec-text-primary, #fff);
            margin-right: 8px;
            vertical-align: middle;
        }
        #yt-embedded-toggle:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }
        #yt-embedded-toggle svg {
            width: 24px;
            height: 24px;
            fill: currentColor;
        }
    `);

  // --- 核心工具 ---
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop().split(';').shift();
    }
  }

  async function generateSAPISIDHASH() {
    const sapisid = getCookie('SAPISID');
    if (!sapisid) {
      return null;
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const origin = window.location.origin;
    const str = `${timestamp} ${sapisid} ${origin}`;
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => {
        return b.toString(16).padStart(2, '0');
      })
      .join('');
    return `SAPISIDHASH ${timestamp}_${hashHex}`;
  }

  // --- Auth ---
  function scanDOMForAuth() {
    const scripts = document.getElementsByTagName('script');
    let apiKey = null;
    let clientVersion = null;
    for (let i = 0; i < scripts.length; i++) {
      const content = scripts[i].innerHTML;
      if (!content) {
        continue;
      }
      if (!apiKey) {
        const matchKey = content.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
        if (matchKey) {
          apiKey = matchKey[1];
        }
      }
      if (!clientVersion) {
        const matchVer = content.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION"\s*:\s*"([^"]+)"/);
        if (matchVer) {
          clientVersion = matchVer[1];
        }
      }
      if (apiKey && clientVersion) {
        break;
      }
    }
    if (apiKey && clientVersion) {
      return {
        apiKey: apiKey,
        context: {
          client: { hl: 'zh-TW', gl: 'TW', clientName: 'WEB', clientVersion: clientVersion },
        },
        source: 'DOM_SCAN',
      };
    }
    return null;
  }

  function waitForAuth(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        let apiKey = null;
        let context = null;
        let source = '';

        if (window.ytcfg && window.ytcfg.data_ && window.ytcfg.data_.INNERTUBE_API_KEY) {
          apiKey = window.ytcfg.data_.INNERTUBE_API_KEY;
          context = {
            client: {
              hl: window.ytcfg.data_.HL,
              gl: window.ytcfg.data_.GL,
              clientName: window.ytcfg.data_.INNERTUBE_CONTEXT_CLIENT_NAME,
              clientVersion: window.ytcfg.data_.INNERTUBE_CONTEXT_CLIENT_VERSION,
            },
          };
          source = 'Global_ytcfg';
        }
        if (!apiKey && window.ytcfg && typeof window.ytcfg.get === 'function') {
          apiKey = window.ytcfg.get('INNERTUBE_API_KEY');
          if (apiKey) {
            context = {
              client: {
                hl: window.ytcfg.get('HL'),
                gl: window.ytcfg.get('GL'),
                clientName: window.ytcfg.get('INNERTUBE_CONTEXT_CLIENT_NAME'),
                clientVersion: window.ytcfg.get('INNERTUBE_CONTEXT_CLIENT_VERSION'),
              },
            };
            source = 'Global_ytcfg_get';
          }
        }
        if (!apiKey) {
          const domResult = scanDOMForAuth();
          if (domResult) {
            apiKey = domResult.apiKey;
            context = domResult.context;
            source = domResult.source;
          }
        }

        if (apiKey) {
          resolve({ apiKey, context, source });
        } else if (Date.now() - start > timeout) {
          reject(new Error('Timeout: Auth Failed'));
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  function getTitleText(obj) {
    if (!obj) {
      return null;
    }
    if (typeof obj === 'string') {
      return obj;
    }
    if (obj.simpleText) {
      return obj.simpleText;
    }
    if (obj.runs && obj.runs.length > 0) {
      return obj.runs[0].text;
    }
    if (obj.content) {
      return getTitleText(obj.content);
    }
    return null;
  }

  // --- API 1: 列表 ---
  async function fetchAccountPlaylists(apiKey, context, authHeader) {
    const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        'X-Origin': window.location.origin,
      },
      body: JSON.stringify({ context: context, browseId: 'FEplaylist_aggregation' }),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    const json = await response.json();
    const playlists = new Map();

    function findPlaylists(obj) {
      if (!obj || typeof obj !== 'object') {
        return;
      }
      if (obj.gridPlaylistRenderer || obj.playlistListItemRenderer) {
        const r = obj.gridPlaylistRenderer || obj.playlistListItemRenderer;
        const id = r.playlistId;
        const title = getTitleText(r.title) || id;
        if (id) {
          playlists.set(id, title);
        }
      }
      if (obj.lockupViewModel) {
        const r = obj.lockupViewModel;
        let id = r.contentId;
        if (
          !id &&
          r.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.browseId
        ) {
          id = r.rendererContext.commandContext.onTap.innertubeCommand.browseEndpoint.browseId;
        }
        if (id && id.startsWith('PL')) {
          let title = null;
          if (r.metadata?.lockupMetadataViewModel?.title) {
            title = getTitleText(r.metadata.lockupMetadataViewModel.title);
          }
          if (
            !title &&
            r.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.accessibility
              ?.accessibilityData?.label
          ) {
            const label =
              r.contentImage.collectionThumbnailViewModel.primaryThumbnail.accessibility
                .accessibilityData.label;
            title = label.replace(/^播放清單：/, '').replace(/^Playlist: /, '');
          }
          playlists.set(id, title || id);
        }
      }
      for (const key in obj) {
        findPlaylists(obj[key]);
      }
    }

    findPlaylists(json);
    if (!playlists.has('WL')) {
      playlists.set('WL', '稍後觀看');
    }
    if (!playlists.has('LL')) {
      playlists.set('LL', '喜歡的影片');
    }
    return playlists;
  }

  // --- API 2: 分頁抓取 (Heartbeat Update) ---
  async function fetchFullPlaylistItems(playlistId, apiKey, context, authHeader, onProgress) {
    const browseId = playlistId.startsWith('VL') ? playlistId : 'VL' + playlistId;
    const allIds = new Set();

    let continuation = null;
    let isFirst = true;
    let retryCount = 0;

    function findContinuationToken(obj) {
      if (!obj || typeof obj !== 'object') {
        return null;
      }
      if (obj.continuationCommand) {
        return obj.continuationCommand.token;
      }
      if (obj.nextContinuationData) {
        return obj.nextContinuationData.continuation;
      }

      for (const key in obj) {
        const found = findContinuationToken(obj[key]);
        if (found) {
          return found;
        }
      }
      return null;
    }

    function extractIds(obj) {
      if (!obj || typeof obj !== 'object') {
        return;
      }
      if (obj.playlistVideoRenderer && obj.playlistVideoRenderer.videoId) {
        allIds.add(obj.playlistVideoRenderer.videoId);
      }
      for (const key in obj) {
        extractIds(obj[key]);
      }
    }

    do {
      try {
        const endpoint = `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`;
        const payload = { context: context };
        if (isFirst) {
          payload.browseId = browseId;
        } else {
          payload.continuation = continuation;
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            'X-Origin': window.location.origin,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          if (response.status === 429 && retryCount < 3) {
            retryCount++;
            await new Promise((r) => {
              return setTimeout(r, 2000);
            });
            continue;
          }
          throw new Error(`Fetch error ${response.status}`);
        }

        const json = await response.json();
        extractIds(json);
        continuation = findContinuationToken(json);
        isFirst = false;

        // 即時通知
        if (onProgress) {
          onProgress(allIds.size);
        }

        // 強制讓出執行緒 0ms，讓瀏覽器有機會渲染畫面
        await new Promise((r) => {
          return setTimeout(r, 0);
        });
      } catch (e) {
        console.warn(`Error fetching playlist page: ${e.message}`);
        break;
      }
    } while (continuation);

    return allIds;
  }

  // --- API 3: 寫入 ---
  async function batchAddVideos(playlistId, videoIds, apiKey, context, authHeader) {
    const cleanPlaylistId = playlistId.replace(/^VL/, '');
    const actions = videoIds.map((vid) => {
      return { action: 'ACTION_ADD_VIDEO', addedVideoId: vid };
    });
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/browse/edit_playlist?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          'X-Origin': window.location.origin,
        },
        body: JSON.stringify({ context: context, playlistId: cleanPlaylistId, actions: actions }),
      },
    );
    if (!response.ok) {
      throw new Error('加入失敗');
    }
    return await response.json();
  }

  // --- UI 建構 ---
  function createUI() {
    // 模組 1: 初始化主控制面板
    const initPanel = () => {
      // 1. 清理舊面板
      const oldPanel = document.getElementById('yt-global-panel');
      if (oldPanel) {
        oldPanel.remove();
      }

      // 2. 建立新面板結構
      const panel = document.createElement('div');
      panel.id = 'yt-global-panel';
      panel.innerHTML = `
            <div id="yt-global-header">
                <span id="yt-global-title">Youtube 撥放清單匯入工具</span>
                <span id="yt-global-close">✕</span>
            </div>
            <div style="font-size:11px; color:#aaa; margin-bottom:5px;">選擇目標播放清單:</div>
            <div class="yt-select-container">
                <select id="yt-target-select"><option value="" disabled selected>請刷新...</option></select>
                <div id="yt-refresh-list" title="從 API 重新載入清單">↻</div>
            </div>
            <div style="font-size:11px; color:#aaa; margin-bottom:5px;">影片網址:</div>
            <textarea id="yt-urls-input" class="yt-global-input" style="height: 100px;" placeholder="https://www.youtube.com/watch?v=..."></textarea>
            <button id="yt-global-btn">掃描全部清單並加入</button>
            <div id="yt-global-log"></div>
        `;
      document.body.appendChild(panel);

      // 3. 綁定面板內部事件
      document.getElementById('yt-global-close').onclick = () => {
        panel.classList.remove('visible');
      };

      document.getElementById('yt-refresh-list').onclick = () => {
        updateSelectDropdown(true);
      };

      const selectEl = document.getElementById('yt-target-select');
      selectEl.onchange = () => {
        if (selectEl.value) {
          localStorage.setItem('yt-global-last-target', selectEl.value);
        }
      };

      document.getElementById('yt-global-btn').onclick = startGlobalProcess;
    };

    // 模組 2: 初始化 Header 按鈕
    const initHeaderButton = () => {
      // 遞迴檢查 Header 是否載入完成
      const mastheadEnd = document.querySelector('#masthead #end');
      if (!mastheadEnd) {
        setTimeout(initHeaderButton, 1000);
        return;
      }

      // 防止重複插入
      if (document.getElementById('yt-embedded-toggle')) {
        return;
      }

      // 1. 建立按鈕
      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'yt-embedded-toggle';
      toggleBtn.title = '開啟全域檢查器';
      toggleBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M19 9H2V11H19V9ZM19 5H2V7H19V5ZM15 15V13H2V15H15ZM19 13L24 22L19 22L19 13Z" d="M0 0h24v24H0z" fill="none"/>
                <path d="M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z"/>
            </svg>
        `;

      // 2. 綁定按鈕事件 (控制面板顯示)
      toggleBtn.onclick = () => {
        const panel = document.getElementById('yt-global-panel');
        if (panel) {
          const isVisible = panel.classList.toggle('visible');
          // 如果打開面板且清單是空的，自動重新整理
          if (isVisible && document.getElementById('yt-target-select').options.length <= 1) {
            updateSelectDropdown(true);
          }
        }
      };

      // 3. 插入按鈕位置
      const refNode = document.getElementById('msfy-toggle-bar-button-mkjf0pvv');
      if (refNode) {
        mastheadEnd.insertBefore(toggleBtn, refNode);
      } else {
        mastheadEnd.prepend(toggleBtn);
      }
    };

    // --- 主流程執行 ---
    initPanel(); // 執行建立面板
    initHeaderButton(); // 執行插入按鈕
  }

  function log(msg, color = '#aaa') {
    const logDiv = document.getElementById('yt-global-log');
    const line = document.createElement('div');
    line.style.color = color;
    line.style.borderBottom = '1px solid #333';
    line.style.padding = '2px 0';
    line.textContent = `[${new Date().toLocaleTimeString().split(' ')[0]}] ${msg}`;

    // 使用 prepend 讓最新的訊息在最上方
    logDiv.prepend(line);
  }

  async function updateSelectDropdown(showLog = false) {
    const select = document.getElementById('yt-target-select');
    const refreshBtn = document.getElementById('yt-refresh-list');
    const lastUsed = localStorage.getItem('yt-global-last-target');

    select.innerHTML = '<option>Auth...</option>';
    refreshBtn.textContent = '...';

    try {
      if (showLog) {
        log('🔑 正在提取 API Key...', '#aaa');
      }
      const auth = await waitForAuth();
      if (showLog) {
        log(`🔓 Key 提取成功! (${auth.source})`, '#2ecc71');
      }

      const authHeader = await generateSAPISIDHASH();
      if (showLog) {
        log('☁️ 下載清單列表...', '#3ea6ff');
      }
      const playlists = await fetchAccountPlaylists(auth.apiKey, auth.context, authHeader);

      select.innerHTML = '';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.text = `--- 選擇清單 (${playlists.size}) ---`;
      defaultOpt.disabled = true;
      if (!lastUsed) {
        defaultOpt.selected = true;
      }
      select.add(defaultOpt);

      playlists.forEach((title, id) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.text = title;
        if (lastUsed === id) {
          opt.selected = true;
        }
        select.add(opt);
      });
      if (showLog) {
        log(`✅ 列表更新完成`, '#2ecc71');
      }
    } catch (e) {
      console.error(e);
      select.innerHTML = '<option>失敗</option>';
      if (showLog) {
        log(`❌ ${e.message}`, 'red');
      }
    } finally {
      refreshBtn.textContent = '↻';
    }
  }

  async function startGlobalProcess() {
    const btn = document.getElementById('yt-global-btn');
    const targetSelect = document.getElementById('yt-target-select');
    const urlsInput = document.getElementById('yt-urls-input');
    const targetPlaylistId = targetSelect.value;
    const rawUrls = urlsInput.value;

    if (!targetPlaylistId) {
      return log('❌ 請選擇一個目標播放清單', 'red');
    }
    if (!rawUrls) {
      return log('❌ 請輸入影片網址', 'red');
    }

    // Input Pre-processing
    const videoIdRegex = /v=([a-zA-Z0-9_-]{11})/;
    const lines = rawUrls.split('\n');
    const inputVideoIds = new Set();
    let duplicateInputCount = 0;

    for (let line of lines) {
      let id = null;
      const match = line.match(videoIdRegex);
      if (match) {
        id = match[1];
      } else if (line.trim().length === 11) {
        id = line.trim();
      }

      if (id) {
        if (inputVideoIds.has(id)) {
          duplicateInputCount++;
        } else {
          inputVideoIds.add(id);
        }
      }
    }

    if (inputVideoIds.size === 0) {
      return log('❌ 找不到有效的影片 ID', 'red');
    }

    if (duplicateInputCount > 0) {
      log(`📥 過濾 ${duplicateInputCount} 個輸入重複。剩 ${inputVideoIds.size} 部。`, '#f1c40f');
    } else {
      log(`📥 輸入確認: ${inputVideoIds.size} 部不重複影片。`, '#fff');
    }

    btn.disabled = true;
    btn.textContent = 'Working...';

    try {
      const auth = await waitForAuth();
      const authHeader = await generateSAPISIDHASH();
      const allPlaylists = await fetchAccountPlaylists(auth.apiKey, auth.context, authHeader);

      const globalBlockList = new Set();
      let count = 0;
      const total = allPlaylists.size;

      log(`🔍 準備深層掃描 ${total} 個清單...`, '#3ea6ff');

      // Global Scan Loop
      for (const [pid, title] of allPlaylists) {
        count++;

        log(`▶ (${count}/${total}) 掃描: ${title}`, '#777');

        await new Promise((r) => {
          return setTimeout(r, 10);
        });

        const pItems = await fetchFullPlaylistItems(
          pid,
          auth.apiKey,
          auth.context,
          authHeader,
          (currentCount) => {
            // 更新按鈕文字
            btn.textContent = `[${count}/${total}] ${title.substring(0, 8)}... (${currentCount})`;
          },
        );

        if (pItems.size > 0) {
          pItems.forEach((vid) => {
            return globalBlockList.add(vid);
          });
        }
      }

      log(`📦 全域資料庫: 已索引 ${globalBlockList.size} 部影片`, '#f1c40f');

      // Compare
      const finalToAdd = [];
      let existCount = 0;
      inputVideoIds.forEach((vid) => {
        if (globalBlockList.has(vid)) {
          existCount++;
        } else {
          finalToAdd.push(vid);
        }
      });

      log(`📊 報告: ${existCount} 重複 / ${finalToAdd.length} 新增`, '#fff');

      // Write
      if (finalToAdd.length > 0) {
        btn.textContent = '寫入中...';
        await batchAddVideos(targetPlaylistId, finalToAdd, auth.apiKey, auth.context, authHeader);
        log(`✅ 成功加入 ${finalToAdd.length} 個影片！`, '#2ecc71');
      } else {
        log(`✅ 無需動作`, '#2ecc71');
      }
    } catch (e) {
      console.error(e);
      log(`❌ 錯誤: ${e.message}`, 'red');
    } finally {
      btn.disabled = false;
      btn.textContent = '掃描全域並加入';
    }
  }
  createUI();
})();
