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

    const DEBUG = false;
    function log(msg) { if (DEBUG) console.log(`[HandleDecoder] ${msg}`); }

    // 1. 注入 CSS
    GM_addStyle(`
        /* 一般影片留言區 */
        ytd-comment-renderer #author-text[data-decoded-handle]::after,
        a#author-text[data-decoded-handle]::after,
        /* Shorts 與新版介面 */
        ytd-comment-view-model h3 #author-text[data-decoded-handle]::after  {
            content: " (" attr(data-decoded-handle) ")";
            font-size: 1em;
            color: #aaa;
            font-weight: normal;
		    margin-left: 5px;
        }
    `);

    // 2. 核心處理邏輯
    function processHandles() {
        // 抓取所有帶有 /@ 的連結，且尚未標記 data-decoded-handle 的元素
        // 這裡放寬選擇器，不只鎖定 a#author-text，確保能抓到
        const links = document.querySelectorAll('a[href*="/@"]:not([data-decoded-handle])');
        
        if (links.length > 0) {
            log(`Found ${links.length} new handles to process.`);
        }

        links.forEach(link => {
            // 為了避免抓到不相關的連結，簡單過濾一下 (必須在評論區或作者欄)
            // 如果發現某些地方沒顯示，可以註解掉下面這行檢查
            if (!link.closest('ytd-comment-renderer') && 
                !link.closest('ytd-comment-view-model') && 
                !link.closest('#owner')) {
                return;
            }

            const rawHref = link.getAttribute('href');
            if (!rawHref) return;

            try {
                // 1. 解碼 URL (解決中文亂碼)
                let decoded = decodeURIComponent(rawHref);
                
                // 2. 擷取 Handle 部分 (移除 /channel/ 或其他前綴，雖然 href*="/@" 已經過濾了大半)
                // 通常 href 是 "/@HandleName"
                if (decoded.includes('/@')) {
                    decoded = decoded.split('/@')[1]; // 只取 @ 後面的部分
                    decoded = '@' + decoded; // 把 @ 加回來
                }

                // 3. 寫入屬性
                link.setAttribute('data-decoded-handle', decoded);
                
            } catch (e) {
                console.error('[HandleDecoder] Error:', e);
            }
        });
    }

    // 3. 啟動監聽器
    const observer = new MutationObserver((mutations) => {
        // 簡單優化：只有當有節點新增時才執行
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
        if (document.body) {
            log('Script started, observer attached.');
            observer.observe(document.body, { childList: true, subtree: true });
            processHandles(); // 第一次執行
        } else {
            log('Body not ready, retrying...');
            setTimeout(startObserver, 500);
        }
    };

    startObserver();

})();