// ==UserScript==
// @name         YouTube Save Button Logic Replacer
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      0.9.0
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

  const SAVE_ICON_SVG = `
    <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" focusable="false" style="pointer-events: none; display: block; width: 100%; height: 100%; fill: currentColor;">
      <g><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"></path></g>
    </svg>
  `;

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
    // 阻止原生行為 (阻止 400 錯誤)
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

  // === 修復各類按鈕 ===
  function fixAllSaveButtons() {
    // --- 1. 處理一般按鈕 (原生 & Script B) ---

    const buttonSelectors = [
      // 原生介面按鈕
      `ytd-watch-metadata button`,
      `ytd-video-primary-info-renderer button`,
      // Script B 的按鈕
      DOCK_SELECTOR,
    ];

    const candidates = document.querySelectorAll(buttonSelectors.join(','));

    candidates.forEach((btn) => {
      // 過濾：只處理尚未修復且符合標籤文字的按鈕
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

      console.log('[Logic Fix] 發現按鈕，進行替換:', btn);

      // 複製按鈕
      const newBtn = btn.cloneNode(true);
      newBtn.dataset.v8FixApplied = 'true';

      const iconContainer = newBtn.querySelector('.yt-spec-button-shape-next__icon, yt-icon');
      if (iconContainer && !btn.closest('#my-save-dock')) {
        iconContainer.innerHTML = SAVE_ICON_SVG;
        iconContainer.style.display = 'flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.justifyContent = 'center';
      }

      newBtn.addEventListener('click', handleUniversalClick);

      newBtn.style.transition = 'transform 0.1s';
      newBtn.addEventListener('mousedown', () => {
        return (newBtn.style.transform = 'scale(0.95)');
      });
      newBtn.addEventListener('mouseup', () => {
        return (newBtn.style.transform = 'scale(1)');
      });
      newBtn.addEventListener('mouseleave', () => {
        return (newBtn.style.transform = 'scale(1)');
      });

      if (btn.parentNode) {
        btn.parentNode.replaceChild(newBtn, btn);
      }
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

  const observer = new MutationObserver((mutations) => {
    fixAllSaveButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(fixAllSaveButtons, 1000);
  setTimeout(fixAllSaveButtons, 3000);
})();
