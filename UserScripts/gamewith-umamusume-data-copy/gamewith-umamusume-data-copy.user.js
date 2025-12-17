// ==UserScript==
// @name         GameWith ウマ娘 選擇資料匯出
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.2.1
// @description  在 GameWith 賽馬娘攻略網頁上，抓取使用者勾選的資料（如因子、支援卡），依據 H2 標題進行分類。提供「複製到剪貼簿」與「下載 txt」功能，方便整理攻略數據。
// @author       downwarjers
// @license      MIT
// @match        https://gamewith.jp/uma-musume/*
// @grant        GM_setClipboard
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/gamewith-umamusume-data-copy/gamewith-umamusume-data-copy.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/gamewith-umamusume-data-copy/gamewith-umamusume-data-copy.user.js
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 抓取並處理選取的資料 (依 H2 標題分類)
     * @returns {string} 格式化後的字串
     */
    function processData() {
        const results = [];
        
        // 鎖定您指定的三個群組
        const groupSelectors = [
            '.w-checker-group-union1.attr-pitcher',
            '.w-checker-group-union2.attr-fielder',
            '.w-checker-group-union3.attr-fielder'
        ];

        // 獲取頁面上所有的 <h2> 標籤，並轉換為陣列
        const allH2s = Array.from(document.querySelectorAll('h2'));

        groupSelectors.forEach(selector => {
            const olElement = document.querySelector(selector);
            if (!olElement) {
                // 找不到這個 <ol>，靜默跳過
                return;
            }

            // --- 尋找對應的 <h2> 標題 ---
            let associatedH2 = null;
            // 遍歷所有 H2，找出在 DOM 結構中位於
            // <ol> 標籤 *之前* 的 *最後一個* H2
            for (const h2 of allH2s) {
                // compareDocumentPosition 會回傳一個位元遮罩
                // Node.DOCUMENT_POSITION_FOLLOWING (值為 4)
                // 表示 h2 在 olElement 之前
                if (h2.compareDocumentPosition(olElement) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    associatedH2 = h2;
                } else {
                    // 一旦 H2 出現在 olElement 之後 (or is olElement itself), 
                    // 就表示前一個 h2 (associatedH2) 是我們要的
                    break;
                }
            }

            // 取得標題文字，如果找不到 H2 則使用預設文字
            const title = associatedH2 ? associatedH2.textContent.trim() : '未分類群組';
            
            // --- 處理群組內的 <li> 項目 ---
            const items = olElement.querySelectorAll('li');
            const groupItems = [];
            let itemNumber = 1; // 每個群組的編號重新從 1 開始

            items.forEach(li => {
                const input = li.querySelector('input[type="checkbox"]');
                const img = li.querySelector('label img');

                if (input && img) {
                    const dataCount = parseInt(input.getAttribute('data-count'), 10);
                    const altText = img.getAttribute('alt') || 'N/A';

                    // 判斷是否選取 (data-count > 0)
                    if (dataCount > 0) {
                        const displayCount = dataCount - 1; // 根據要求，數值 - 1
                        // 依照範例格式 "1. <alt>：<data-count -1>"
                        const line = `${itemNumber}. ${altText}：${displayCount}`;
                        groupItems.push(line);
                        itemNumber++;
                    }
                }
            });

            // --- 組合標題和項目 ---
            // 只有當這個群組內有選取項目時，才加入到最終結果
            if (groupItems.length > 0) {
                results.push(title); // 1. 先加 <h2> 標題
                results.push(...groupItems); // 2. 再加入所有項目
                results.push(''); // 3. 增加一個空行，用來分隔不同群組
            }
        });
        
        // 將所有結果組合起來，並移除最後一個多餘的空行
        return results.join('\n').trim();
    }

    /**
     * 將資料複製到剪貼簿
     */
    function copyToClipboard() {
        const data = processData();
        if (data) {
            GM_setClipboard(data);
            alert('已依群組複製到剪貼簿！');
        } else {
            alert('沒有選取的資料！');
        }
    }

    /**
     * 將資料下載為 .txt 檔案
     */
    function downloadAsTxt() {
        const data = processData();
        if (data) {
            const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'grouped_selection_data.txt'; // 下載的檔案名稱
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            alert('沒有選取的資料！');
        }
    }

    /**
     * 在畫面右下角添加控制按鈕
     */
    function injectUI() {
        const p = document.createElement('div');
        const buttonStyle = `
            position:fixed;
            bottom:20px;
            right:20px;
            background:rgba(0,0,0,0.8);
            color:#fff;
            padding:10px;
            border-radius:8px;
            z-index:9999;
            font-family:sans-serif;
        `;
        p.style.cssText=buttonStyle;
        p.innerHTML = `<button id="copyBtn">📋 複製分類結果</button><button id="downloadBtn">📥 下載分類 txt</button>`;
        document.body.appendChild(p);
        p.querySelector('#copyBtn').onclick = () => copyToClipboard();
        p.querySelector('#downloadBtn').onclick = () => downloadAsTxt();
    }

    // 等待頁面完全載入後再執行
    window.addEventListener('load', () => setTimeout(injectUI, 500));

})();