// ==UserScript==
// @name         YouTube: Append Handle
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.1
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