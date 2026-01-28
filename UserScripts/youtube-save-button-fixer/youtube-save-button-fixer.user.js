// ==UserScript==
// @name         YouTube Save Button Logic Replacer
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      0.8.1
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

  const BROKEN_LABEL = '儲存至播放清單';

  const SAVE_ICON_SVG = `
    <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" focusable="false" style="pointer-events: none; display: block; width: 100%; height: 100%; fill: currentColor;">
      <g>
        <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"></path>
      </g>
    </svg>
  `;

  function createSafeCommand(videoId) {
    return {
      addToPlaylistServiceEndpoint: {
        videoId: videoId,
      },
    };
  }

  // 主邏輯
  function fixSaveButton() {
    // 1. 鎖定播放介面下方壞掉的按鈕
    const possibleSelectors = [
      `ytd-watch-metadata button[aria-label="${BROKEN_LABEL}"]`,
      `ytd-video-primary-info-renderer button[aria-label="${BROKEN_LABEL}"]`,
    ];

    let oldBtn = null;
    for (const sel of possibleSelectors) {
      oldBtn = document.querySelector(sel);
      if (oldBtn) {
        break;
      }
    }

    // 2. 如果找到按鈕，且還沒被我們替換過
    if (oldBtn && !oldBtn.dataset.v8FixApplied) {
      console.log(`[Fix V8] 發現目標按鈕，正在替換核心邏輯...`);

      // 3. 複製按鈕 (Clone) 以移除原本所有導致 400 錯誤的事件監聽器
      const newBtn = oldBtn.cloneNode(true);
      newBtn.dataset.v8FixApplied = 'true'; // 標記已處理

      const iconContainer = newBtn.querySelector('.yt-spec-button-shape-next__icon, yt-icon');

      if (iconContainer) {
        // 使用新的原生圖示變數
        iconContainer.innerHTML = SAVE_ICON_SVG;

        // 保持排版修正
        iconContainer.style.display = 'flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.justifyContent = 'center';
      }

      // 4. 替換 DOM 元素
      oldBtn.parentNode.replaceChild(newBtn, oldBtn);

      // 5. 綁定我們自己的「安全點擊事件」
      newBtn.addEventListener('click', function (e) {
        // 阻止任何預設行為
        e.preventDefault();
        e.stopPropagation();

        // 取得當前影片 ID
        const urlParams = new URLSearchParams(window.location.search);
        const currentVideoId = urlParams.get('v');

        if (!currentVideoId) {
          console.error('[Fix V8] 錯誤：無法取得 Video ID');
          return;
        }

        console.log(`[Fix V8] 執行安全儲存指令 (Target: ${currentVideoId})`);

        // 6. 構造指令
        const safeCommand = createSafeCommand(currentVideoId);

        // 7. 呼叫 YouTube 內部 App 執行該指令
        const app = document.querySelector('ytd-app');
        if (app && app.resolveCommand) {
          app.resolveCommand(safeCommand);
        } else {
          alert('[Fix V8] 錯誤：找不到 YouTube 主程式介面 (ytd-app)');
        }
      });

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

      console.log(`[Fix V8] 按鈕修復完成。`);
    }
  }

  const observer = new MutationObserver((mutations) => {
    fixSaveButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(fixSaveButton, 1500);
})();
