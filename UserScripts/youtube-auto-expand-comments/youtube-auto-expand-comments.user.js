// ==UserScript==
// @name         YouTube 自動展開所有留言
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      3.6
// @description  自動展開 YouTube 留言。功能：1. 持續檢測整個留言區總開關 2. 單點展開 
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-end
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-auto-expand-comments/youtube-auto-expand-comments.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-auto-expand-comments/youtube-auto-expand-comments.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 設定 ---
    const MAX_RETRY_COUNT = 15; // 防卡死重試上限

    // --- 全域變數 ---
    let globalInterval = null;
    let isGlobalRunning = false;

    // --- 圖示路徑定義 (SVG Path) ---
    // 雙箭頭向下 (代表展開)
    const ICON_EXPAND = "M16.59 5.59L12 10.17 7.41 5.59 6 7l6 6 6-6z M16.59 11.59L12 16.17 7.41 11.59 6 13l6 6 6-6z";
    // 正方形 (代表停止)
    const ICON_STOP = "M6 6h12v12H6z";

    // 用來管理所有正在運行的單一留言串計時器 (Set 集合)
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
            border-radius: 18px; /* 稍微修飾按鈕 */
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
        const text = (btn.innerText || btn.getAttribute('aria-label') || "").toLowerCase();

        if (text.includes('隱藏') || text.includes('hide')) return false;
        if (btn.closest('#action-buttons')) return false;

        const isPureReplyAction = (text.trim() === '回覆' || text.trim() === 'reply');
        if (isPureReplyAction) return false;

        return (
            text.includes('查看') ||
            text.includes('view') ||
            text.includes('更多') ||
            text.includes('more') ||
            text.includes('replies') ||
            (text.includes('回覆') && /\d/.test(text))
        );
    }

    // --- 安全點擊邏輯 (針對回覆區塊) ---
    function safeClick(btn) {
        const container = btn.closest('ytd-comment-replies-renderer');
        // 如果不是回覆區塊 (例如是 "顯示完整內容")，直接點擊
        if (!container) { 
            btn.click(); 
            return true; 
        }

        let count = parseInt(container.getAttribute('data-expand-retry') || '0');

        if (count >= MAX_RETRY_COUNT) {
            console.warn('[安全防護] 放棄展開該區塊。');
            const thread = container.closest('ytd-comment-thread-renderer');
            if (thread) {
                thread.classList.remove('auto-expanding');
                thread.classList.add('expand-abandoned');
            }
            return false;
        }

        container.setAttribute('data-expand-retry', count + 1);
        btn.click();
        return true;
    }

    // --- [新增功能] 展開 "顯示完整內容" (Read More) ---
    function expandReadMore() {
        // 選擇所有處於 collapsed (摺疊) 狀態下的 more 按鈕
        const readMoreButtons = document.querySelectorAll('ytd-expander#expander[collapsed] > #more, #more-replies');
        readMoreButtons.forEach(btn => {
             // 這些按鈕通常只是 CSS 變化，不會觸發網路請求，可以直接點擊
             btn.click();
        });
    }

    // --- 功能 A：全域展開 (核心迴圈) ---
    function expandAllComments() {
        // 1. 處理回覆
        const buttons = document.querySelectorAll('ytd-comment-replies-renderer button');
        buttons.forEach(btn => {
            const thread = btn.closest('ytd-comment-thread-renderer');
            const isAbandoned = thread && thread.classList.contains('expand-abandoned');
            // 確保按鈕可見且符合條件
            if (btn.offsetParent !== null && isExpandButton(btn) && !isAbandoned) {
                 safeClick(btn);
            }
        });

        // 2. [修復] 處理過長的留言 (顯示完整內容)
        expandReadMore();
    }

    // --- 停止所有活動 ---
    function stopAllActivity() {
        if (globalInterval) {
            clearInterval(globalInterval);
            globalInterval = null;
        }

        activeThreadIntervals.forEach(intervalId => clearInterval(intervalId));
        activeThreadIntervals.clear();

        document.querySelectorAll('.auto-expanding').forEach(el => {
            el.classList.remove('auto-expanding');
        });

        console.log('[控制中心] 已停止所有展開任務');
    }

    // --- UI 更新函式 (將 UI 狀態與邏輯分離) ---
    function updateUIState(isActive) {
        const wrapper = document.getElementById('yt-expand-comments-wrapper');
        if (!wrapper) return;

        const textSpan = wrapper.querySelector('.yt-spec-button-shape-next__button-text-content');
        const iconPath = wrapper.querySelector('path'); 
        
        if (isActive) {
            if(textSpan) textSpan.innerText = '停止展開 (運作中)';
            if(iconPath) iconPath.setAttribute('d', ICON_STOP);
            wrapper.classList.add('yt-expand-active');
        } else {
            if(textSpan) textSpan.innerText = '展開所有留言';
            if(iconPath) iconPath.setAttribute('d', ICON_EXPAND);
            wrapper.classList.remove('yt-expand-active');
        }
    }

    // --- 切換邏輯 (按鈕觸發) ---
    function toggleGlobalExpansion() {
        if (!isGlobalRunning) {
            // 開啟
            isGlobalRunning = true;
            updateUIState(true);
            
            expandAllComments(); // 立即執行一次
            globalInterval = setInterval(expandAllComments, 2000); // 之後每2秒檢查一次
        } else {
            // 關閉
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

        // [修復] 單一展開時，也要順便展開該串的 "顯示完整內容"
        const localReadMore = threadElement.querySelectorAll('ytd-expander#expander[collapsed] > #more');
        localReadMore.forEach(b => b.click());

        const threadInterval = setInterval(() => {
            if (!document.body.contains(threadElement)) {
                clearInterval(threadInterval);
                activeThreadIntervals.delete(threadInterval);
                return;
            }

            if (threadElement.classList.contains('expand-abandoned')) {
                clearInterval(threadInterval);
                activeThreadIntervals.delete(threadInterval);
                return;
            }

            const replyContainer = threadElement.querySelector('ytd-comment-replies-renderer');
            if (!replyContainer) return; 

            const buttons = replyContainer.querySelectorAll('button');
            let foundExpandBtn = false;

            buttons.forEach(btn => {
                if (btn.offsetParent !== null && isExpandButton(btn)) {
                    if (safeClick(btn)) {
                        foundExpandBtn = true;
                    }
                }
            });
            
            // 檢查該串是否還有被折疊的長文
            const currentReadMores = threadElement.querySelectorAll('ytd-expander#expander[collapsed] > #more');
            currentReadMores.forEach(b => { b.click(); foundExpandBtn = true; });

            const hideBtns = Array.from(buttons).filter(b => {
                const t = (b.innerText || "").toLowerCase();
                return (t.includes('隱藏') || t.includes('hide')) && b.offsetParent !== null;
            });

            // 如果已經沒有展開按鈕，且出現了隱藏按鈕，或者原本就沒有展開按鈕
            if (hideBtns.length > 0 && !foundExpandBtn) {
                clearInterval(threadInterval);
                activeThreadIntervals.delete(threadInterval);
                threadElement.classList.remove('auto-expanding');
            }

        }, 1500);
        
        activeThreadIntervals.add(threadInterval);
        
        setTimeout(() => {
            if (activeThreadIntervals.has(threadInterval)) {
                clearInterval(threadInterval);
                activeThreadIntervals.delete(threadInterval);
                if(threadElement) threadElement.classList.remove('auto-expanding');
            }
        }, 60000);
    }

    // --- 監聽點擊 (委派) ---
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('#yt-expand-comments-wrapper')) return;

        const btn = target.closest('button');
        
        if (btn && isExpandButton(btn)) {
            const threadElement = btn.closest('ytd-comment-thread-renderer');
            if (threadElement && !threadElement.classList.contains('expand-abandoned')) {
                setTimeout(() => processThreadExpansion(threadElement), 500);
            }
        }
    }, true);

    // --- 初始化：注入按鈕 ---
    function tryInjectButton() {
        if (document.getElementById('yt-expand-comments-wrapper')) return;
        
        // 嘗試抓取各種可能的 Header 位置 (Youtube 改版頻繁)
        const targetContainer = document.querySelector('ytd-comments-header-renderer #title') || 
                                document.querySelector('ytd-comments-header-renderer #additional-section');

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
                        <yt-touch-feedback-shape aria-hidden="true" class="yt-spec-touch-feedback-shape yt-spec-touch-feedback-shape--touch-response">
                            <div class="yt-spec-touch-feedback-shape__stroke"></div>
                            <div class="yt-spec-touch-feedback-shape__fill"></div>
                        </yt-touch-feedback-shape>
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

    // --- [新增功能] 頁面切換重置邏輯 ---
    // yt-navigate-finish 是 YouTube 在 SPA 切換頁面完成時觸發的事件
    document.addEventListener('yt-navigate-finish', () => {
        // 無論之前狀態如何，切換影片後一律重置為停止狀態
        isGlobalRunning = false; 
        stopAllActivity();
        
        // 由於切換頁面後 DOM 會重建，按鈕會消失，需要依靠 Observer 再次注入
        // 這裡不需要手動移除舊按鈕，因為舊的 DOM 已經被 Youtube 移除了
        
        // 這裡只需要確保記憶體中的狀態是 Reset 的即可
        console.log('[控制中心] 偵測到頁面切換，已重置狀態');
    });

    // --- DOM 監測 (負責注入按鈕) ---
    const observer = new MutationObserver((mutations) => {
        tryInjectButton();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    setTimeout(tryInjectButton, 2000);

})();