// ==UserScript==
// @name         YouTube: Append Handle
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.2
// @description  搭配 "Restore YouTube Username" 使用。自動將 Handle 解碼並同步顯示在名稱後方，並支援點擊複製
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        GM_addStyle
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-append-handle/youtube-append-handle.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-append-handle/youtube-append-handle.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 1. 注入 CSS
    GM_addStyle(`
        .yt-handle-tag {
            font-size: 0.9em;
            color: #aaa;
            font-weight: normal;
            margin-left: 5px;
            cursor: copy;
            white-space: nowrap;
            display: inline-block;
            transition: all 0.2s;
            border-radius: 4px;
            padding: 0 4px;
            vertical-align: middle; /* 微調對齊 */
        }
        .yt-handle-tag:hover {
            color: #fff;
            background-color: #3ea6ff;
            text-decoration: none;
        }
        .yt-handle-tag.copied {
            background-color: #2ba640;
            color: #fff;
        }
    `);

    // 2. 核心處理邏輯
    function processHandles() {
        // 抓取所有帶有 /@ 的連結，且尚未標記 data-handle-appended 的元素
        const links = document.querySelectorAll('a[href*="/@"]:not([data-handle-appended])');

        links.forEach(link => {
            // ★ 修改點：只允許在留言區塊內
            // ytd-comment-renderer = 傳統留言區塊
            // ytd-comment-view-model = 新版留言/Shorts留言區塊
            const commentContainer = link.closest('ytd-comment-renderer') || link.closest('ytd-comment-view-model');

            // 如果不是在留言區內，直接跳過
            if (!commentContainer) return;

            // 確保是留言者的名稱連結 (過濾掉留言內容中提到的其他 @連結，如果需要的話)
            // 通常留言者名稱會有 id="author-text" 或在特定標題標籤內
            // 為了保險，這裡只要是在 commentContainer 內的 /@ 連結都視為目標 (通常只有作者名)
            
            const rawHref = link.getAttribute('href');
            if (!rawHref) return;

            try {
                let decoded = decodeURIComponent(rawHref);

                if (decoded.includes('/@')) {
                    decoded = decoded.split('/@')[1];
                    if (decoded.includes('?')) decoded = decoded.split('?')[0];
                    if (decoded.includes('/')) decoded = decoded.split('/')[0];
                    
                    const handleText = '@' + decoded;

                    // 建立 span
                    const span = document.createElement('span');
                    span.className = 'yt-handle-tag';
                    span.textContent = `(${handleText})`;
                    span.title = '點擊複製 Handle';

                    // 綁定點擊事件
                    span.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        navigator.clipboard.writeText(handleText).then(() => {
                            const originalText = span.textContent;
                            span.textContent = '(已複製!)';
                            span.classList.add('copied');
                            setTimeout(() => {
                                span.textContent = originalText;
                                span.classList.remove('copied');
                            }, 1500);
                        }).catch(err => console.error(err));
                    });

                    link.appendChild(span);
                    link.setAttribute('data-handle-appended', 'true');
                }
            } catch (e) {
                // error
            }
        });
    }

    // 3. 啟動監聽器
	let throttleTimer = null; // 用來控制執行頻率的計時器

    const observer = new MutationObserver((mutations) => {
        // 1. 先快速檢查是否有新增節點 (過濾掉單純屬性變化的雜訊)
        let hasAddedNodes = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                hasAddedNodes = true;
                break;
            }
        }

        // 2. 只有在真的有新東西載入時，才準備執行
        if (hasAddedNodes) {
            // 如果計時器已經在跑，代表「待會就會執行一次」，這次直接忽略 (節省資源)
            if (throttleTimer) return;

            // 設定 1.5 秒後執行一次 (1500ms)
            // 這能讓瀏覽器先專心處理 YouTube 的載入，等稍閒時再補上 Handle
            throttleTimer = setTimeout(() => {
                processHandles();
                throttleTimer = null; // 執行完畢，重置計時器
            }, 1500); 
        }
    });

    const startObserver = () => {
        // 1. 先停止舊的監聽 (避免重複綁定)
        observer.disconnect();

        // 2. 嘗試尋找留言區的容器
        // 根據您提供的 HTML，這個 ID 是最穩定的目標
        const commentsSection = document.querySelector('ytd-comments#comments');

        if (commentsSection) {
            // A. 如果找到了，就只監聽這個區域
            console.log('[WebTweaks] 已鎖定留言區，開始監控。');
            observer.observe(commentsSection, {
                childList: true,
                subtree: true // 必須開啟 subtree，因為留言內容是在更深層的 div 裡
            });
            
            // 立即執行一次處理，確保既有的留言被加上 Handle
            processHandles(); 
        } else {
            // B. 如果還沒出現 (例如剛開網頁)，就每 1 秒檢查一次，直到出現為止
            setTimeout(startObserver, 1000);
        }
    };

    // 3. 監聽 YouTube 的頁面切換事件 (SPA 跳轉)
    // 當使用者點擊下一部影片時，DOM 可能會重置，需要重新鎖定目標
    window.addEventListener('yt-navigate-finish', () => {
        // 給予一點緩衝時間讓 DOM 載入
        setTimeout(startObserver, 1500); 
    });

    startObserver();

})();