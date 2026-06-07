// ==UserScript==
// @name         YouTube Save Button Logic Replacer
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      0.10.0
// @description  完全替換 YouTube 影片下方的儲存按鈕，重新安裝一個直接注入 addToPlaylistServiceEndpoint 指令的新按鈕，從底層邏輯接管儲存功能。
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-save-button-logic-replacer/youtube-save-button-logic-replacer.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-save-button-logic-replacer/youtube-save-button-logic-replacer.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TARGET_LABELS = ['儲存至播放清單', 'Save to playlist', '儲存', 'Save'];
  const DOCK_SELECTOR = '#my-save-dock button';

  function executeSaveCommand() {
    // 1. 取得 Video ID
    const urlParams = new URLSearchParams(window.location.search);
    const currentVideoId = urlParams.get('v');

    if (!currentVideoId) {
      console.error('[Logic Fix] 錯誤：無法取得 Video ID');
      return;
    }

    // 2. 構造安全指令
    const safeCommand = {
      addToPlaylistServiceEndpoint: {
        videoId: currentVideoId,
      },
    };

    console.log(`[Logic Fix] 執行安全儲存指令 (Target: ${currentVideoId})`);

    // 3. 呼叫 YouTube 主程式
    const app = document.querySelector('ytd-app');
    if (app && app.resolveCommand) {
      app.resolveCommand(safeCommand);
    } else {
      alert('[Logic Fix] 錯誤：找不到 YouTube 主程式介面 (ytd-app)');
    }
  }

  // === 通用點擊處理器 ===
  function handleUniversalClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    executeSaveCommand();

    const menuPopup =
      e.target.closest('tp-yt-iron-dropdown') || document.querySelector('ytd-popup-container');
    if (menuPopup) {
      document.body.click();
    }
  }

  // === 修復各類按鈕  ===
  function fixAllSaveButtons() {
    // --- 1. 處理一般按鈕 (原生 & Script B) ---
    const buttonSelectors = [
      `ytd-watch-metadata button`,
      `ytd-video-primary-info-renderer button`,
      DOCK_SELECTOR,
    ];

    const candidates = document.querySelectorAll(buttonSelectors.join(','));

    candidates.forEach((btn) => {
      // 避免重複綁定
      if (btn.dataset.v8FixApplied) {
        return;
      }

      const label = btn.getAttribute('aria-label') || btn.innerText || '';
      if (
        !TARGET_LABELS.some((t) => {
          return label.includes(t);
        })
      ) {
        return;
      }

      console.log('[Logic Fix] 發現按鈕，注入高優先度監聽器:', btn);
      btn.dataset.v8FixApplied = 'true';

      // 使用 { capture: true } 確保在 YouTube 原生事件觸發前先執行我們的邏輯
      btn.addEventListener('click', handleUniversalClick, { capture: true });

      // 保留你的自訂點擊動效
      btn.style.transition = 'transform 0.1s';
      btn.addEventListener('mousedown', () => {
        btn.style.transform = 'scale(0.95)';
      });
      btn.addEventListener('mouseup', () => {
        btn.style.transform = 'scale(1)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'scale(1)';
      });
    });

    // --- 2. 處理選單內的選項 (Menu Item) ---
    const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer');
    menuItems.forEach((item) => {
      if (item.dataset.v8FixApplied) {
        return;
      }

      if (
        !TARGET_LABELS.some((t) => {
          return item.innerText.includes(t);
        })
      ) {
        return;
      }

      console.log('[Logic Fix] 發現選單選項，注入攔截器:', item);
      item.dataset.v8FixApplied = 'true';

      item.addEventListener('click', handleUniversalClick, { capture: true });

      const innerItem = item.querySelector('tp-yt-paper-item');
      if (innerItem) {
        innerItem.addEventListener('click', handleUniversalClick, { capture: true });
      }
    });
  }

  // 使用 MutationObserver 持續監控動態生成的元件
  const observer = new MutationObserver(() => {
    fixAllSaveButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // 確保初始載入時觸發
  setTimeout(fixAllSaveButtons, 1000);
  setTimeout(fixAllSaveButtons, 3000);
})();
