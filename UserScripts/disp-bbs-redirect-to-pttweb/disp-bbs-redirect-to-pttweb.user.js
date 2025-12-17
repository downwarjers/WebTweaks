// ==UserScript==
// @name         Disp.cc PTT 網址自動跳轉
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.4
// @description  瀏覽 Disp.cc 時，若文章來源顯示為 PTT (`ptt.cc`)，點擊該連結會自動轉址到 `pttweb.cc` (網頁版 PTT 備份站)，避免 PTT 原站的年齡驗證阻擋。精確比對「※ 文章網址:」文字，確保只針對文章底部的來源連結進行處理。
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

    console.log('[Disp.cc 腳本 v1.4] 已啟動 (MutationObserver 模式)...');

    // 核心檢查函式：傳入一個 span 元素，檢查是否為目標並執行跳轉
    function checkAndRedirect(span) {
        // 1. 確保有子節點且第一個是文字節點 (避免報錯)
        const textNode = span.childNodes[0];
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false;

        // 2. 檢查文字內容是否以 "※ 文章網址:" 開頭
        if (textNode.textContent.trim().startsWith('※ 文章網址:')) {
            
            // 3. 尋找內部的 <a> 連結
            const pttLinkElement = span.querySelector('a');
            if (pttLinkElement) {
                const originalUrl = pttLinkElement.href;

                // 4. 檢查網址是否為 ptt.cc
                if (originalUrl.startsWith('https://www.ptt.cc/')) {
                    const newUrl = originalUrl.replace('https://www.ptt.cc/', 'https://www.pttweb.cc/');

                    console.log(`[Disp.cc 腳本] 找到目標: ${textNode.textContent.trim()}`);
                    console.log(`[Disp.cc 腳本] 原始網址: ${originalUrl}`);
                    console.log(`[Disp.cc 腳本] 正在導向到: ${newUrl}`);
                    
                    // 執行跳轉
                    // 使用 replace() 取代 href，這樣使用者按「上一頁」才不會卡在無限迴圈
                    window.location.replace(newUrl); 
                    return true;
                }
            }
        }
        return false;
    }

    // 全域掃描函式 (用於初始檢查)
    function scanAll() {
        // 直接選取所有可能的目標，效率最高
        const spans = document.querySelectorAll('span.record');
        for (const span of spans) {
            if (checkAndRedirect(span)) return true;
        }
        return false;
    }

    // --- 主執行流程 ---

    // 1. 先執行一次立即檢查 (如果腳本載入時，內容已經在頁面上了)
    if (scanAll()) return;

    // 2. 如果沒找到，建立 MutationObserver 監聽後續載入的內容
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    // 確保新增的是元素節點 (Type 1)
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        
                        // 情況 A: 新增的節點本身就是 span.record
                        if (node.matches('span.record')) {
                            if (checkAndRedirect(node)) {
                                observer.disconnect(); // 任務完成，停止監聽
                                return;
                            }
                        }
                        
                        // 情況 B: span.record 包在新增的區塊裡面 (例如整個文章區塊被載入)
                        // 使用 querySelectorAll 找出該節點下所有的目標
                        const childSpans = node.querySelectorAll('span.record');
                        for (const span of childSpans) {
                            if (checkAndRedirect(span)) {
                                observer.disconnect();
                                return;
                            }
                        }
                    }
                }
            }
        }
    });

    // 開始監聽 document.body 的變化
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();