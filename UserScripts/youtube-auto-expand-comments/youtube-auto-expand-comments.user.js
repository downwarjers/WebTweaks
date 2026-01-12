// ==UserScript==
// @name         YouTube 自動展開所有留言
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      3.9.1
// @description  自動展開 YouTube 留言。已修復畫面亂跳及無限展開隱藏的迴圈問題。
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-end
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-auto-expand-comments/youtube-auto-expand-comments.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-auto-expand-comments/youtube-auto-expand-comments.user.js
// ==/UserScript==

(function () {
  'use strict';

  // --- 設定 ---
  const MAX_RETRY_COUNT = 15; // 防卡死重試上限次數
  const MAX_THREAD_EXPAND_TIME = 60; // 每則留言的監測秒數
  const GLOBAL_CHECK_INTERVAL = 4; // 全域展開的檢查頻率秒數
  const SINGLE_CHECK_INTERVAL = 2; // 單一留言串的檢查頻率秒數

  // --- 全域變數 ---
  let globalInterval = null;
  let isGlobalRunning = false;

  // --- 圖示路徑定義 (SVG Path) ---
  const ICON_EXPAND =
    'M16.59 5.59L12 10.17 7.41 5.59 6 7l6 6 6-6z M16.59 11.59L12 16.17 7.41 11.59 6 13l6 6 6-6z';
  const ICON_STOP = 'M6 6h12v12H6z';

  // 用來管理所有正在運行的單一留言串計時器
  const activeThreadIntervals = new Set();

  // --- 樣式設定 ---
  const style = document.createElement('style');
  style.innerHTML = `
        ytd-comment-thread-renderer.auto-expanding {
            border-left: 3px solid #065fd4;
            padding-left: 10px;
            transition: border-left 0.3s;
        }
        ytd-comment-thread-renderer.expand-abandoned {
            border-left: 3px solid #aaaaaa !important;
            opacity: 0.7;
        }
        .yt-expand-active button {
            background-color: #def1ff !important;
            color: #065fd4 !important;
            border-radius: 18px;
        }
        .yt-expand-active svg {
            fill: #065fd4 !important;
        }
        #yt-expand-comments-wrapper {
            margin-left: 8px;
            display: inline-block;
        }
    `;
  document.head.appendChild(style);

  // --- 工具函式：判斷是否為展開回覆按鈕 ---
  function isExpandButton(btn) {
    if (!btn) return false;

    // 1. 檢查是否已經被標記為正在點擊 (防止短時間重複觸發)
    if (btn.hasAttribute('data-clicking')) return false;

    // 2. 檢查 ARIA 屬性 (最準確的判斷：如果已經展開，就不要回傳 true)
    const expanded = btn.getAttribute('aria-expanded');
    if (expanded === 'true') return false;

    // 3. 檢查文字內容
    const text = (btn.innerText || btn.getAttribute('aria-label') || '').toLowerCase().trim();

    // 絕對黑名單
    if (text.includes('隱藏') || text.includes('hide')) return false;
    if (btn.closest('#action-buttons')) return false; // 避免點到讚/倒讚區

    // 排除純粹的「回覆」按鈕 (那是用來輸入文字的)
    const isPureReplyAction = text === '回覆' || text === 'reply';
    if (isPureReplyAction) return false;

    // 白名單關鍵字
    return (
      text.includes('查看')
      || text.includes('view')
      || text.includes('更多')
      || text.includes('more')
      || text.includes('replies')
      || (text.includes('回覆') && /\d/.test(text)) // 例如 "5 則回覆"
    );
  }

  // --- 安全點擊邏輯 ---
  function safeClick(btn) {
    const container = btn.closest('ytd-comment-replies-renderer');

    // 如果不是回覆區塊 (例如是 "顯示完整內容")，直接點擊但加上標記
    if (!container) {
      btn.setAttribute('data-clicking', 'true');
      btn.click();
      // 短暫延遲後移除標記 (針對 Read More 這類不會消失的按鈕)
      setTimeout(() => btn.removeAttribute('data-clicking'), 1000);
      return true;
    }

    let count = parseInt(container.getAttribute('data-expand-retry') || '0');

    if (count >= MAX_RETRY_COUNT) {
      console.warn('[安全防護] 放棄展開該區塊 (重試過多)');
      const thread = container.closest('ytd-comment-thread-renderer');
      if (thread) {
        thread.classList.remove('auto-expanding');
        thread.classList.add('expand-abandoned');
      }
      return false;
    }

    container.setAttribute('data-expand-retry', count + 1);

    // **關鍵修正**：標記按鈕正在處理中，避免下一個迴圈重複抓取
    btn.setAttribute('data-clicking', 'true');
    btn.click();

    return true;
  }

  // --- 展開 "顯示完整內容" (Read More) ---
  function expandReadMore() {
    const readMoreButtons = document.querySelectorAll(
      'ytd-expander#expander[collapsed] > #more, #more-replies',
    );
    readMoreButtons.forEach((btn) => {
      // 確保可見才點擊，避免畫面亂跳
      if (btn.offsetParent !== null) {
        btn.click();
      }
    });
  }

  // --- 功能 A：全域展開 (核心迴圈) ---
  function expandAllComments() {
    // 1. 處理回覆
    const buttons = document.querySelectorAll('ytd-comment-replies-renderer button');
    buttons.forEach((btn) => {
      const thread = btn.closest('ytd-comment-thread-renderer');
      const isAbandoned = thread && thread.classList.contains('expand-abandoned');

      // 檢查 offsetParent !== null 確保按鈕是可見的
      if (btn.offsetParent !== null && !isAbandoned && isExpandButton(btn)) {
        safeClick(btn);
      }
    });

    // 2. 處理過長的留言
    expandReadMore();
  }

  // --- 停止所有活動 ---
  function stopAllActivity() {
    if (globalInterval) {
      clearInterval(globalInterval);
      globalInterval = null;
    }

    activeThreadIntervals.forEach((intervalId) => clearInterval(intervalId));
    activeThreadIntervals.clear();

    document.querySelectorAll('.auto-expanding').forEach((el) => {
      el.classList.remove('auto-expanding');
    });

    // 清除所有點擊中的標記，以免下次開始時卡住
    document.querySelectorAll('[data-clicking]').forEach((el) => {
      el.removeAttribute('data-clicking');
    });

    console.log('[控制中心] 已停止所有展開任務');
  }

  // --- UI 更新函式 ---
  function updateUIState(isActive) {
    const wrapper = document.getElementById('yt-expand-comments-wrapper');
    if (!wrapper) return;

    const textSpan = wrapper.querySelector('.yt-spec-button-shape-next__button-text-content');
    const iconPath = wrapper.querySelector('path');

    if (isActive) {
      if (textSpan) textSpan.innerText = '停止展開 (運作中)';
      if (iconPath) iconPath.setAttribute('d', ICON_STOP);
      wrapper.classList.add('yt-expand-active');
    } else {
      if (textSpan) textSpan.innerText = '展開所有留言';
      if (iconPath) iconPath.setAttribute('d', ICON_EXPAND);
      wrapper.classList.remove('yt-expand-active');
    }
  }

  // --- 切換邏輯 ---
  function toggleGlobalExpansion() {
    if (!isGlobalRunning) {
      isGlobalRunning = true;
      updateUIState(true);
      expandAllComments();
      // 放慢檢查頻率，減緩畫面跳動感
      globalInterval = setInterval(expandAllComments, GLOBAL_CHECK_INTERVAL * 1000);
    } else {
      isGlobalRunning = false;
      updateUIState(false);
      stopAllActivity();
    }
  }

  // --- 功能 B：單一留言串智慧展開 ---
  function processThreadExpansion(threadElement) {
    if (!threadElement || threadElement.classList.contains('expand-abandoned')) return;
    if (threadElement.classList.contains('auto-expanding')) return;

    threadElement.classList.add('auto-expanding');

    // 先展開該串的 Read More
    const localReadMore = threadElement.querySelectorAll(
      'ytd-expander#expander[collapsed] > #more',
    );
    localReadMore.forEach((b) => b.click());

    const threadInterval = setInterval(() => {
      // 元素消失保護
      if (!document.body.contains(threadElement)) {
        clearInterval(threadInterval);
        activeThreadIntervals.delete(threadInterval);
        return;
      }

      // 放棄保護
      if (threadElement.classList.contains('expand-abandoned')) {
        clearInterval(threadInterval);
        activeThreadIntervals.delete(threadInterval);
        return;
      }

      const replyContainer = threadElement.querySelector('ytd-comment-replies-renderer');

      // 如果沒有回覆容器，代表此留言沒回覆，直接結束
      if (!replyContainer) {
        clearInterval(threadInterval);
        activeThreadIntervals.delete(threadInterval);
        threadElement.classList.remove('auto-expanding');
        return;
      }

      const buttons = replyContainer.querySelectorAll('button');
      let foundExpandableBtn = false;

      buttons.forEach((btn) => {
        // 只有當按鈕可見且符合展開條件時才處理
        if (btn.offsetParent !== null && isExpandButton(btn)) {
          foundExpandableBtn = true;
          safeClick(btn);
        }
      });

      // 檢查長文
      const currentReadMores = threadElement.querySelectorAll(
        'ytd-expander#expander[collapsed] > #more',
      );
      if (currentReadMores.length > 0) {
        currentReadMores.forEach((b) => b.click());
        foundExpandableBtn = true;
      }

      // 終止條件優化：
      // 如果沒有找到任何「可展開」的按鈕，就視為完成。
      // 不再依賴偵測「隱藏」按鈕，因為網路延遲時隱藏按鈕可能還沒出現。
      if (!foundExpandableBtn) {
        // 稍微等待一下確認不是網路延遲 (利用 retry 機制，這裡直接計數如果連續幾次都沒按鈕才停會更好，但在這簡化處理)
        // 這裡的邏輯改為：本次檢查沒發現按鈕，就假設該串處理完畢
        // 但為了保險（可能有 loading），不立即殺死，而是依賴下面的 setTimeout 60秒強制結束
        // 檢查是否有 loading spinner，如果沒有 spinner 也沒有按鈕，那就是結束了
        const spinner = replyContainer.querySelector('ytd-continuation-item-renderer');
        if (!spinner) {
          clearInterval(threadInterval);
          activeThreadIntervals.delete(threadInterval);
          threadElement.classList.remove('auto-expanding');
        }
      }
    }, SINGLE_CHECK_INTERVAL * 1000); // 放慢單一檢查頻率

    activeThreadIntervals.add(threadInterval);

    // 超過設定秒數秒後強制停止該串偵測 (防止無限卡住)
    setTimeout(() => {
      if (activeThreadIntervals.has(threadInterval)) {
        clearInterval(threadInterval);
        activeThreadIntervals.delete(threadInterval);
        if (threadElement) threadElement.classList.remove('auto-expanding');
      }
    }, MAX_THREAD_EXPAND_TIME * 1000);
  }

  // --- 監聽點擊 ---
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target;
      if (target.closest('#yt-expand-comments-wrapper')) return;

      const btn = target.closest('button');
      if (btn && isExpandButton(btn)) {
        const threadElement = btn.closest('ytd-comment-thread-renderer');
        if (threadElement && !threadElement.classList.contains('expand-abandoned')) {
          setTimeout(() => processThreadExpansion(threadElement), 500);
        }
      }
    },
    true,
  );

  // --- 初始化：注入按鈕 ---
  function tryInjectButton() {
    if (document.getElementById('yt-expand-comments-wrapper')) return;

    const targetContainer =
      document.querySelector('ytd-comments-header-renderer #title')
      || document.querySelector('ytd-comments-header-renderer #additional-section');

    if (targetContainer) {
      const wrapper = document.createElement('div');
      wrapper.id = 'yt-expand-comments-wrapper';

      wrapper.innerHTML = `
            <yt-button-view-model class="ytd-menu-renderer">
                <button-view-model class="ytSpecButtonViewModelHost style-scope ytd-menu-renderer">
                    <button class="yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--enable-backdrop-filter-experiment" aria-label="展開所有留言" style="">
                        <div aria-hidden="true" class="yt-spec-button-shape-next__icon">
                            <span class="ytIconWrapperHost" style="width: 24px; height: 24px;">
                                <span class="yt-icon-shape ytSpecIconShapeHost">
                                    <div style="width: 100%; height: 100%; display: block; fill: currentcolor;">
                                        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
                                            <path d="${ICON_EXPAND}"></path>
                                        </svg>
                                    </div>
                                </span>
                            </span>
                        </div>
                        <div class="yt-spec-button-shape-next__button-text-content">展開所有留言</div>
                    </button>
                </button-view-model>
            </yt-button-view-model>
            `;

      const actualBtn = wrapper.querySelector('button');
      if (actualBtn) {
        actualBtn.onclick = toggleGlobalExpansion;
      }

      targetContainer.appendChild(wrapper);
    }
  }

  // --- 頁面切換重置邏輯 ---
  document.addEventListener('yt-navigate-finish', () => {
    isGlobalRunning = false;
    stopAllActivity();
    console.log('[控制中心] 偵測到頁面切換，已重置狀態');
  });

  // --- DOM 監測 ---
  const observer = new MutationObserver((mutations) => {
    tryInjectButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(tryInjectButton, 2000);
})();
