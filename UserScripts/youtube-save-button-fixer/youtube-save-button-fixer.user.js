// ==UserScript==
// @name         YouTube 影片儲存按鈕強制顯示
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.4.0
// @description  強制在 YouTube 影片操作列顯示「儲存」（加入播放清單）按鈕。當視窗縮放導致按鈕被收入「...」選單時，自動複製並生成一個獨立的按鈕置於操作列上。
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        GM_addStyle
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-save-button-fixer/youtube-save-button-fixer.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-save-button-fixer/youtube-save-button-fixer.user.js
// ==/UserScript==

(function () {
  'use strict';

  const MY_BTN_LABEL = '儲存';
  const CONTAINER_ID = 'my-save-dock';

  let compressionFailCount = 0; // 記錄被壓縮失敗的次數
  let stopFixing = false; // 是否停止強制顯示按鈕
  const MAX_FAILURES = 3; // 最大容許失敗次數

  const NATIVE_BTN_SELECTORS = [
    'button[aria-label="儲存至播放清單"]',
    'button[aria-label="Save to playlist"]',
  ];

  // === CSS ===
  GM_addStyle(`
        /* 獨立特區樣式 
           這個容器位於 #actions-inner 的左邊，不受內部 Flex 影響
        */
        #${CONTAINER_ID} {
            display: flex;
            align-items: center;
            flex-shrink: 0 !important; /* 絕對不准壓縮 */
            margin-right: 8px;         /* 跟右邊的按讚按鈕保持距離 */
        }

        /* 隱形點擊遮罩 */
        body.yt-proxy-clicking ytd-popup-container {
            opacity: 0 !important;
            pointer-events: none !important;
        }
    `);

  async function executeInvisibleClick(threeDotButton) {
    document.body.classList.add('yt-proxy-clicking');
    try {
      threeDotButton.click();
      const saveItem = await waitForItem(MY_BTN_LABEL);
      if (saveItem) {
        saveItem.click();
      } else {
        threeDotButton.click();
      }
    } catch (e) {
      console.error('[YouTube Save Fix] Error:', e);
    } finally {
      setTimeout(() => {
        document.body.classList.remove('yt-proxy-clicking');
      }, 200);
    }
  }

  function waitForItem(text) {
    return new Promise((resolve) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        const items = document.querySelectorAll(
          'ytd-menu-service-item-renderer, tp-yt-paper-item, yt-formatted-string',
        );
        for (let item of items) {
          if (item.innerText && item.innerText.trim() === text) {
            clearInterval(timer);
            resolve(
              item.closest('ytd-menu-service-item-renderer') ||
                item.closest('tp-yt-paper-item') ||
                item,
            );
            return;
          }
        }
        if (attempts > 50) {
          clearInterval(timer);
          resolve(null);
        }
      }, 20);
    });
  }

  // === 建立按鈕 DOM (複製 Share 按鈕樣式) ===
  function createDockButton(menuRenderer) {
    const shareBtn =
      menuRenderer.querySelector('button[aria-label="分享"]') ||
      menuRenderer.querySelector('button[aria-label="Share"]') ||
      menuRenderer.querySelector('button');

    if (!shareBtn) {
      return null;
    }
    const threeDotButtonShape = menuRenderer.querySelector('yt-button-shape#button-shape button');
    if (!threeDotButtonShape) {
      return null;
    }

    const clonedBtn = shareBtn.cloneNode(true);
    clonedBtn.id = '';
    clonedBtn.removeAttribute('title');
    clonedBtn.setAttribute('aria-label', MY_BTN_LABEL);
    clonedBtn.style.cssText = '';

    // 樣式標準化：確保是膠囊樣式
    clonedBtn.classList.remove('yt-spec-button-shape-next--icon-button');
    clonedBtn.classList.remove('yt-spec-button-shape-next--segmented-start');
    clonedBtn.classList.remove('yt-spec-button-shape-next--segmented-end');

    clonedBtn.classList.add('yt-spec-button-shape-next--tonal');
    clonedBtn.classList.add('yt-spec-button-shape-next--icon-leading');
    clonedBtn.classList.add('yt-spec-button-shape-next--size-m');

    // Icon
    let iconContainer = clonedBtn.querySelector('.yt-spec-button-shape-next__icon');
    if (iconContainer) {
      iconContainer.innerHTML = `
                <div style="width: 24px; height: 24px; display: block; fill: currentcolor;">
                <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" focusable="false" style="pointer-events: none; display: block; width: 100%; height: 100%;">
                    <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"></path>
                </svg>
                </div>`;
    }

    // Text
    let textContainer = clonedBtn.querySelector('.yt-spec-button-shape-next__button-text-content');
    if (!textContainer) {
      textContainer = document.createElement('div');
      textContainer.className = 'yt-spec-button-shape-next__button-text-content';
      clonedBtn.appendChild(textContainer);
    }
    textContainer.innerHTML = `<span class="yt-core-attributed-string yt-core-attributed-string--white-space-no-wrap" role="text">${MY_BTN_LABEL}</span>`;

    clonedBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      executeInvisibleClick(threeDotButtonShape);
    };

    return clonedBtn;
  }

  // === 主邏輯 ===
  function checkAndToggle() {
    if (stopFixing) {
      const myDock = document.getElementById(CONTAINER_ID);
      if (myDock) {
        myDock.style.display = 'none';
      }
      return;
    }

    // 1. 找到大容器 #actions (包含 actions-inner 和 menu)
    const actionsContainer = document.querySelector('#actions');
    const actionsInner = document.querySelector('#actions-inner');

    if (!actionsContainer || !actionsInner) {
      return;
    }

    const menuRenderer = actionsInner.querySelector('ytd-menu-renderer');
    if (!menuRenderer) {
      return;
    }

    // 2. 判斷原生按鈕狀態
    let isNativeVisible = false;
    let nativeBtn = null;
    for (const selector of NATIVE_BTN_SELECTORS) {
      const found = menuRenderer.querySelector(selector);
      if (found) {
        nativeBtn = found;
        break;
      }
    }

    if (nativeBtn) {
      const flexibleContainer = nativeBtn.closest('#flexible-item-buttons');
      if (flexibleContainer) {
        const rect = flexibleContainer.getBoundingClientRect();
        if (rect.width > 2 && window.getComputedStyle(flexibleContainer).display !== 'none') {
          isNativeVisible = true;
        }
      } else if (nativeBtn.offsetParent !== null) {
        isNativeVisible = true;
      }
    }

    // 3. 處理Dock
    let myDock = document.getElementById(CONTAINER_ID);

    if (!myDock) {
      const btn = createDockButton(menuRenderer);
      if (btn) {
        myDock = document.createElement('div');
        myDock.id = CONTAINER_ID;
        myDock.appendChild(btn);

        actionsContainer.insertBefore(myDock, actionsInner);
      }
    }

    if (myDock && myDock.style.display === 'flex') {
      if (myDock.offsetWidth < 10) {
        compressionFailCount++;
        console.warn(`[YouTube Save Fix] 按鈕被壓縮 (${compressionFailCount}/${MAX_FAILURES})`);

        if (compressionFailCount >= MAX_FAILURES) {
          stopFixing = true;
          console.error('[YouTube Save Fix] 空間不足，停止強制顯示以免閃爍。');
          myDock.style.display = 'none';
          return;
        }
      } else {
        compressionFailCount = 0;
      }
    }

    // 4. 切換顯示
    if (myDock) {
      if (isNativeVisible) {
        myDock.style.display = 'none';
      } else {
        myDock.style.display = 'flex';
      }
    }
  }

  // === 監聽器 ===
  let resizeObserver = null;
  let mutationObserver = null;

  function attachObservers() {
    const actionsContainer = document.querySelector('#actions');
    if (!actionsContainer) {
      return;
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    let resizeTimeout;
    resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkAndToggle, 100);
    });
    resizeObserver.observe(actionsContainer);

    mutationObserver = new MutationObserver((mutations) => {
      const isSelfMutation = mutations.some((m) => {
        return (
          m.target.id === CONTAINER_ID ||
          (m.addedNodes.length > 0 && m.addedNodes[0].id === CONTAINER_ID)
        );
      });
      if (!isSelfMutation) {
        checkAndToggle();
      }
    });

    const actionsInner = document.querySelector('#actions-inner');
    if (actionsInner) {
      mutationObserver.observe(actionsInner, { childList: true, subtree: true });
    }

    checkAndToggle();
  }

  const globalObserver = new MutationObserver(() => {
    if (document.querySelector('#actions')) {
      attachObservers();
    }
  });

  globalObserver.observe(document.body, { childList: true, subtree: true });

  setTimeout(attachObservers, 1500);
  window.addEventListener('yt-navigate-finish', () => {
    stopFixing = false;
    compressionFailCount = 0;
    setTimeout(attachObservers, 1500);
  });
})();
