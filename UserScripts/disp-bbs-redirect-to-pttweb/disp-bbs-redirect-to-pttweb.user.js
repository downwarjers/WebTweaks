// ==UserScript==
// @name         Disp.cc PTT 網址自動跳轉
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.3
// @description  自動將 disp.cc 上的 PTT 連結 (精準比對 "※ 文章網址:" 文字) 從 www.ptt.cc 轉址到 www.pttweb.cc
// @author       downwarjers
// @license      MIT
// @match        https://disp.cc/*
// @grant        none
// @run-at       document-idle
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/disp-bbs-redirect-to-pttweb/disp-bbs-redirect-to-pttweb.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/disp-bbs-redirect-to-pttweb/disp-bbs-redirect-to-pttweb.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Disp.cc 腳本 v1.3] 已啟動，開始輪詢 (精準比對)...');

    let checkInterval = null; // 用來存放 setInterval 的 ID
    let attempts = 0; // 嘗試次數
    const maxAttempts = 60; // 最多嘗試 60 次 (60 * 250ms = 15 秒)

    const findAndRedirect = () => {
        attempts++;

        // 1. 抓取所有 class="record" 的 span 元素
        const allRecordSpans = document.querySelectorAll('span.record');
        
        if (allRecordSpans.length === 0 && attempts < maxAttempts) {
            // 如果還沒抓到任何 span.record，就繼續等
            return;
        }

        let found = false; // 標記是否已找到並處理

        // 2. 迭代檢查每一個 span
        for (const span of allRecordSpans) {
            
            // 3. 檢查文字內容是否以 "※ 文章網址:" 開頭 (使用 trim() 移除前後空白)
            // Node.TEXT_NODE === 3
            // 我們只檢查第一個子節點 (文字節點)
            const textNode = span.childNodes[0];
            if (textNode && textNode.nodeType === Node.TEXT_NODE && textNode.textContent.trim().startsWith('※ 文章網址:')) {
                
                // 4. 如果文字符合，就在這個 span 內部尋找 <a> 連結
                const pttLinkElement = span.querySelector('a');

                if (pttLinkElement) {
                    let originalUrl = pttLinkElement.href;

                    // 5. 檢查網址是否為 ptt.cc
                    if (originalUrl.startsWith('https://www.ptt.cc/')) {
                        
                        // 停止輪詢
                        clearInterval(checkInterval);
                        found = true; // 標記已找到

                        let newUrl = originalUrl.replace('https://www.ptt.cc/', 'https://www.pttweb.cc/');

                        console.log(`[Disp.cc 腳本] 找到目標: ${textNode.textContent.trim()}`);
                        console.log(`[Disp.cc 腳本] 原始網址: ${originalUrl}`);
                        console.log(`[Disp.cc 腳本] 正在導向到: ${newUrl}`);
                        
                        // 執行跳轉
                        window.location.href = newUrl;
                        break; // 跳出 for 迴圈
                    }
                }
            }
        }

        // 6. 檢查是否輪詢超時
        if (!found && attempts > maxAttempts) {
            console.log(`[Disp.cc 腳本] 超過 ${maxAttempts} 次嘗試 (15秒)，未找到 "※ 文章網址:" 元素。停止腳本。`);
            clearInterval(checkInterval); // 停止輪詢
        }
    };

    // 啟動輪詢，每 250 毫秒執行一次
    checkInterval = setInterval(findAndRedirect, 250);

})();