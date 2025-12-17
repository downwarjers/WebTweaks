// ==UserScript==
// @name         YouTube: Append Handle
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.0
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
    // 定義 Handle 的外觀、Hover 效果以及複製成功的樣式
    GM_addStyle(`
        .yt-handle-tag {
            font-size: 0.9em;
            color: #aaa;
            font-weight: normal;
            margin-left: 5px;
            cursor: copy; /* 滑鼠游標變成複製圖示 */
            white-space: nowrap;
            display: inline-block;
            transition: all 0.2s;
            border-radius: 4px;
            padding: 0 4px;
        }
        /* 滑鼠移上去的效果 */
        .yt-handle-tag:hover {
            color: #fff;
            background-color: #3ea6ff; /* YouTube 藍 */
            text-decoration: none;
        }
        /* 複製成功時的效果 */
        .yt-handle-tag.copied {
            background-color: #2ba640; /* 綠色 */
            color: #fff;
        }
    `);

    // 2. 核心處理邏輯
    function processHandles() {
        // 抓取所有帶有 /@ 的連結，且尚未標記 data-handle-appended 的元素
        const links = document.querySelectorAll('a[href*="/@"]:not([data-handle-appended])');

        links.forEach(link => {
            // 過濾邏輯：確保是在 評論區、Shorts 評論、或影片擁有者欄位
            const isComment = link.closest('ytd-comment-renderer') || link.closest('ytd-comment-view-model');
            const isOwner = link.closest('#owner') || link.closest('#upload-info');

            if (!isComment && !isOwner) return;

            const rawHref = link.getAttribute('href');
            if (!rawHref) return;

            try {
                let decoded = decodeURIComponent(rawHref);

                // 解析 Handle
                if (decoded.includes('/@')) {
                    decoded = decoded.split('/@')[1];
                    if (decoded.includes('?')) decoded = decoded.split('?')[0];
                    if (decoded.includes('/')) decoded = decoded.split('/')[0];
                    
                    const handleText = '@' + decoded;

                    // 建立實體 span 標籤
                    const span = document.createElement('span');
                    span.className = 'yt-handle-tag';
                    span.textContent = `(${handleText})`;
                    span.title = '點擊複製 Handle'; // Tooltip

                    // 綁定點擊事件
                    span.addEventListener('click', function(e) {
                        // ★ 關鍵：阻止事件冒泡，防止觸發外層 <a> 的跳轉
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        // 執行複製
                        navigator.clipboard.writeText(handleText).then(() => {
                            // 視覺回饋：變更文字與顏色
                            const originalText = span.textContent;
                            span.textContent = '(已複製!)';
                            span.classList.add('copied');

                            // 1.5秒後還原
                            setTimeout(() => {
                                span.textContent = originalText;
                                span.classList.remove('copied');
                            }, 1500);
                        }).catch(err => {
                            console.error('複製失敗:', err);
                        });
                    });

                    // 將 span 加入到 link 內部最後方
                    link.appendChild(span);
                    
                    // 標記已處理，避免重複添加
                    link.setAttribute('data-handle-appended', 'true');
                }
            } catch (e) {
                // 忽略錯誤
            }
        });
    }

    // 3. 啟動監聽器
    const observer = new MutationObserver((mutations) => {
        let shouldRun = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                shouldRun = true;
                break;
            }
        }
        if (shouldRun) {
            processHandles();
        }
    });

    const startObserver = () => {
        const targetNode = document.querySelector('ytd-app') || document.body;
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
            processHandles();
        } else {
            setTimeout(startObserver, 500);
        }
    };

    startObserver();

})();