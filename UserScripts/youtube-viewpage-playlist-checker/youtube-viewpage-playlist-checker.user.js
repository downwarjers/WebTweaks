// ==UserScript==
// @name         YouTube 影片頁面播放清單檢查器
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      29.11.0
// @description  在 YouTube 影片頁面顯示當前影片是否已加入使用者的任何自訂播放清單。透過呼叫 YouTube 內部 API (`get_add_to_playlist`) 檢查狀態，並在影片標題上方顯示結果。
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-viewpage-playlist-checker/youtube-viewpage-playlist-checker.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-viewpage-playlist-checker/youtube-viewpage-playlist-checker.user.js
// ==/UserScript==

(function () {
  'use strict';

  // --- CSS 設定 ---
  function addStyle(css) {
    const id = 'my-playlist-checker-style';
    if (document.getElementById(id)) {
      return;
    } // 已經有了就跳過
    const style = document.createElement('style');
    style.id = id; // 設定 ID
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  addStyle(`
        #my-playlist-status {
            margin-bottom: 20px;
            padding: 6px 12px;
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            font-size: 1.4rem;
            color: #e1e1e1;
            border-left: 3px solid #3ea6ff;
            width: fit-content;
            display: block !important;
            font-family: Roboto, Arial, sans-serif;
            transition: all 0.2s ease;
        }
        /* 同步中狀態 (黃色/灰色) */
        #my-playlist-status.syncing {
            border-left-color: #f1c40f;
            color: #ddd;
            background-color: rgba(241, 196, 15, 0.1);
        }
        /* 錯誤狀態 (紅色) */
        #my-playlist-status.error {
            border-left-color: #ff4e45;
            background-color: rgba(255, 78, 69, 0.1);
            color: #ff4e45;
        }
    `);

  let currentVideoId = null;
  let snackbarObserver = null;
  let popupObserver = null;
  let isChecking = false; // 防止重複執行的鎖

  // 🌟 新增：輪詢專用變數與控制器
  let pollTimer = null;
  let pollAttempts = 0;
  const MAX_POLLS = 6; // 總共檢查 6 次
  const POLL_INTERVAL = 4000; // 每次間隔 4 秒 (總共約 24 秒的監控期)

  function startPlaylistPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
    }
    pollAttempts = 0;

    showStatus('⏳ 伺服器同步中...', 'syncing');

    const poll = async () => {
      pollAttempts++;
      await checkPlaylists(); // 抓取並更新畫面

      if (pollAttempts < MAX_POLLS) {
        pollTimer = setTimeout(poll, POLL_INTERVAL);
      } else {
        pollAttempts = 0; // 結束輪詢
      }
    };

    // 關閉選單後，先等 2 秒發動第一次檢查
    pollTimer = setTimeout(poll, 2000);
  }

  // ==========================================
  // 1. 介面控制
  // ==========================================
  function showStatus(htmlContent, className = '') {
    let div = document.getElementById('my-playlist-status');
    const targetContainer = document.querySelector('#secondary #secondary-inner');

    if (!targetContainer) {
      return;
    }

    if (!div) {
      div = document.createElement('div');
      div.id = 'my-playlist-status';
      targetContainer.prepend(div);
    } else {
      // 如果 div 已存在但因為頁面切換脫離了原本位置，將其抓回並重新置頂
      if (div.parentNode !== targetContainer) {
        targetContainer.prepend(div);
      }
    }
    if (div.innerHTML !== htmlContent) {
      div.innerHTML = htmlContent;
    }
    div.className = className;
  }

  // ==========================================
  // 2. 核心工具：驗證與設定
  // ==========================================
  function waitForConfig(timeout = 5000) {
    return new Promise((resolve) => {
      if (window.ytcfg && window.ytcfg.get) {
        return resolve(window.ytcfg);
      }
      const start = Date.now();
      const interval = setInterval(() => {
        if (window.ytcfg && window.ytcfg.get) {
          clearInterval(interval);
          resolve(window.ytcfg);
        } else if (Date.now() - start > timeout) {
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });
  }

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

  // ==========================================
  // 3. 搜尋邏輯
  // ==========================================
  function findButtonByText(obj, targetTexts, visited = new Set()) {
    if (!obj || typeof obj !== 'object') {
      return null;
    }
    if (visited.has(obj)) {
      return null;
    }
    visited.add(obj);

    let foundText = null;
    if (obj.simpleText) {
      foundText = obj.simpleText;
    } else if (obj.runs && obj.runs[0] && obj.runs[0].text) {
      foundText = obj.runs[0].text;
    }

    if (foundText && targetTexts.includes(foundText.trim())) {
      return { found: true, text: foundText };
    }

    for (let k in obj) {
      if (
        k === 'secondaryResults' ||
        k === 'frameworkUpdates' ||
        k === 'loggingContext' ||
        k === 'playerOverlays'
      ) {
        continue;
      }
      const result = findButtonByText(obj[k], targetTexts, visited);
      if (result) {
        if (result.found) {
          const keys = [
            'addToPlaylistServiceEndpoint',
            'serviceEndpoint',
            'command',
            'navigationEndpoint',
            'showSheetCommand',
          ];
          for (let key of keys) {
            if (obj[key]) {
              return obj[key];
            }
          }
          return result;
        }
        return result;
      }
    }
    return null;
  }

  // ==========================================
  // 4. 主功能：背景檢查 API
  // ==========================================
  async function checkPlaylists() {
    if (isChecking) {
      return;
    }
    isChecking = true;

    try {
      const ytConfig = await waitForConfig();
      if (!ytConfig) {
        isChecking = false;
        return;
      }

      const app = document.querySelector('ytd-app');
      const rawData = app?.data?.response || window.ytInitialData;
      const mainVideoScope =
        rawData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
      const searchTargets = mainVideoScope
        ? [mainVideoScope]
        : [rawData, window.ytInitialPlayerResponse];

      let params = null;
      let videoIdFromEndpoint = null;

      for (let source of searchTargets) {
        let candidate = findButtonByText(source, ['儲存', 'Save', '保存']);
        if (candidate) {
          let ep = candidate;
          if (candidate.addToPlaylistServiceEndpoint) {
            ep = candidate.addToPlaylistServiceEndpoint;
          } else if (candidate.command && candidate.command.addToPlaylistServiceEndpoint) {
            ep = candidate.command.addToPlaylistServiceEndpoint;
          } else if (
            candidate.showSheetCommand &&
            candidate.showSheetCommand.panelLoadingStrategy
          ) {
            ep = candidate.showSheetCommand.panelLoadingStrategy.requestTemplate;
          } else if (candidate.panelLoadingStrategy) {
            ep = candidate.panelLoadingStrategy.requestTemplate;
          }

          if (ep && ep.params) {
            params = ep.params;
            if (ep.videoId) {
              videoIdFromEndpoint = ep.videoId;
            }
            break;
          }
        }
      }

      if (!params) {
        const menuRenderer = document.querySelector(
          'ytd-menu-renderer[class*="ytd-watch-metadata"]',
        );
        if (menuRenderer && menuRenderer.data) {
          const buttons = menuRenderer.data.topLevelButtons || [];
          for (let btn of buttons) {
            const icon =
              btn.buttonRenderer?.icon?.iconType || btn.flexibleActionsViewModel?.iconName;
            if (icon === 'PLAYLIST_ADD' || icon === 'SAVE') {
              let ep =
                btn.buttonRenderer?.serviceEndpoint ||
                btn.buttonRenderer?.command ||
                btn.flexibleActionsViewModel?.onTap?.command;
              if (ep) {
                if (ep.addToPlaylistServiceEndpoint) {
                  params = ep.addToPlaylistServiceEndpoint.params;
                } else if (ep.showSheetCommand) {
                  params = ep.showSheetCommand.panelLoadingStrategy?.requestTemplate?.params;
                } else if (ep.params) {
                  params = ep.params;
                }
              }
              if (params) {
                break;
              }
            }
          }
        }
      }

      // if (!params) {
      //   throw new Error('API Params Not Found');
      // }

      const currentUrlId = new URLSearchParams(window.location.search).get('v');
      const finalVideoId = videoIdFromEndpoint || currentUrlId;
      const apiKey = ytConfig.get('INNERTUBE_API_KEY');
      const context = JSON.parse(JSON.stringify(ytConfig.get('INNERTUBE_CONTEXT')));
      if (!context.client) {
        context.client = {};
      }
      context.client.clientMessageId = 'ytpc-' + Math.random().toString(36).substring(2, 10);
      const sessionIndex = ytConfig.get('SESSION_INDEX') || '0';
      const authHeader = await generateSAPISIDHASH();

      if (!authHeader || !apiKey) {
        throw new Error('Auth Failed');
      }

      const response = await fetch(
        `https://www.youtube.com/youtubei/v1/playlist/get_add_to_playlist?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            'X-Origin': window.location.origin,
            'X-Goog-AuthUser': sessionIndex,
          },
          credentials: 'include',
          cache: 'no-store', // 🌟 加入這行確保瀏覽器不快取
          body: JSON.stringify({
            context: context,
            videoIds: [finalVideoId],
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }
      const json = await response.json();

      function findPlaylistsRecursive(obj) {
        let results = [];
        if (!obj || typeof obj !== 'object') {
          return results;
        }
        if (obj.playlistAddToOptionRenderer) {
          results.push(obj.playlistAddToOptionRenderer);
        }
        for (let k in obj) {
          results = results.concat(findPlaylistsRecursive(obj[k]));
        }
        return results;
      }

      const playlists = findPlaylistsRecursive(json);
      const added = [];

      playlists.forEach((p) => {
        const title = p.title.simpleText || p.title.runs?.[0]?.text;
        const rawStatus = p.containsSelectedVideos || p.containsSelectedVideo;
        const isAdded = rawStatus === 'ALL' || rawStatus === 'TRUE' || rawStatus === true;
        if (isAdded) {
          added.push(title);
        }
      });

      const isPolling = pollAttempts > 0 && pollAttempts < MAX_POLLS;
      const pollText = isPolling
        ? `<span style="font-size: 0.75em; color: #aaa; margin-left: 8px;">(🔄 多次確認中 ${pollAttempts}/${MAX_POLLS})</span>`
        : '';

      const html =
        added.length > 0
          ? `✅ 本影片已存在於：<span style="color: #4af; font-weight:bold;">${added.join('、 ')}</span>${pollText}`
          : `⚪ 未加入任何自訂清單${pollText}`;

      showStatus(html, '');
    } catch (e) {
      console.error('[YT-Checker]', e);
      showStatus(`❌ 錯誤: ${e.message}`, 'error');
    } finally {
      isChecking = false;
    }
  }

  // ==========================================
  // 5. 觸發與監聽
  // ==========================================
  window.addEventListener('yt-navigate-finish', function () {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollAttempts = 0;
    }

    const newVideoId = new URLSearchParams(window.location.search).get('v');

    const statusEl = document.getElementById('my-playlist-status');
    if (statusEl) {
      statusEl.remove();
    }

    if (!location.href.includes('/watch')) {
      return;
    }

    if (currentVideoId !== newVideoId) {
      currentVideoId = newVideoId;
      initSnackbarObserver();
      initPopupContainerObserver();

      if (document.hidden) {
        document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
      } else {
        // 初始載入
        setTimeout(checkPlaylists, 1500);
      }
    }
  });

  function onVisibilityChange() {
    if (!document.hidden) {
      setTimeout(checkPlaylists, 1000);
    }
  }

  function initSnackbarObserver() {
    if (snackbarObserver) {
      return;
    }
    const container = document.querySelector('snackbar-container');
    if (!container) {
      setTimeout(initSnackbarObserver, 2000);
      return;
    }

    snackbarObserver = new MutationObserver((mutations) => {
      const hasToast = container.childElementCount > 0;
      if (hasToast) {
        if (pollTimer) {
          clearTimeout(pollTimer);
        }
        pollAttempts = 0;
        showStatus('⏳ 準備同步...', 'syncing');
      } else {
        startPlaylistPolling(); // 🌟 呼叫輪詢函數
      }
    });

    snackbarObserver.observe(container, { childList: true, subtree: true });
  }

  function initPopupContainerObserver() {
    if (popupObserver) {
      return;
    }
    const popupContainer = document.querySelector('ytd-popup-container');
    if (!popupContainer) {
      setTimeout(initPopupContainerObserver, 2000);
      return;
    }

    let wasVisible = false;
    const checkState = () => {
      const toasts = popupContainer.querySelectorAll(
        'tp-yt-paper-toast, yt-notification-action-renderer',
      );
      let isVisibleNow = false;
      toasts.forEach((toast) => {
        const style = window.getComputedStyle(toast);
        const isHidden =
          style.display === 'none' ||
          (toast.hasAttribute('aria-hidden') && toast.getAttribute('aria-hidden') === 'true') ||
          style.opacity === '0';
        if (!isHidden && toast.innerText.trim().length > 0) {
          isVisibleNow = true;
        }
      });

      if (isVisibleNow && !wasVisible) {
        if (pollTimer) {
          clearTimeout(pollTimer);
        }
        pollAttempts = 0;
        showStatus('⏳ 準備同步...', 'syncing');
      } else if (!isVisibleNow && wasVisible) {
        startPlaylistPolling(); // 🌟 呼叫輪詢函數
      }
      wasVisible = isVisibleNow;
    };

    popupObserver = new MutationObserver(() => {
      return checkState();
    });
    popupObserver.observe(popupContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden'],
    });
  }
})();
