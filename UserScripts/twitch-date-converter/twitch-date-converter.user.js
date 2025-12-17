// ==UserScript==
// @name         Twitch 精確日期轉換器
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.6.0
// @description  將 Twitch 影片/剪輯列表上的相對時間（如「2小時前」、「3天前」）替換為精確的日期格式（yyyy-MM-dd）。直接讀取縮圖元素中的 `title` 屬性（原始時間戳），確保日期準確。
// @author       downwarjers
// @license      MIT
// @match        *://www.twitch.tv/*
// @grant        none
// @run-at       document-idle
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/twitch-date-converter/twitch-date-converter.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/twitch-date-converter/twitch-date-converter.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 設定區 ---
    const DEBOUNCE_DELAY_MS = 300; // 防抖延遲 (毫秒)，設為 200~500 之間體感最好
    
    // --- 關鍵字列表 ---
    const relativeTimeKeywords = [
        '前', 'ago', 'yesterday', '小時', '天', '週', '月', '年',
        'hour', 'day', 'week', 'month', 'year', 'just now'
    ];

    const specialRelativeWords = [
        '剛剛', 'just now',
        '昨天', 'yesterday',
        '前天', 'day before yesterday',
        '上週', 'last week',
        '上個月', 'last month',
        '去年', 'last year'
    ];

    /**
     * 檢查文字是否為相對時間
     * @param {string} text
     * @returns {boolean}
     */
    function isRelativeTime(text) {
        if (!text) return false;
        const lowerText = text.toLowerCase();

        // 1. 必須包含基礎關鍵字
        if (!relativeTimeKeywords.some(keyword => lowerText.includes(keyword))) {
            return false;
        }

        // 2. 排除 "觀看次數" 與時間長度 (含冒號)
        if (lowerText.includes('觀看') || lowerText.includes('view') || lowerText.includes('visualizaç') || text.includes(':')) {
            return false;
        }

        // 3. 包含數字 或 特殊單字
        return /\d/.test(text) || specialRelativeWords.some(word => lowerText.includes(word));
    }

    /**
     * 核心替換邏輯
     */
    function replaceAllDates() {
        // 僅選取尚未處理過的縮圖
        const thumbnails = document.querySelectorAll(
            'img[data-test-selector="preview-card-thumbnail__image-selector"]:not([data-thumbnail-processed])'
        );

        if (thumbnails.length === 0) return;

        thumbnails.forEach(img => {
            img.dataset.thumbnailProcessed = 'true'; // 標記為已檢查

            const exactDate = img.title;
            // 簡易驗證 title 是否像是一個日期 (包含數字且長度足夠)
            if (!exactDate || !/\d/.test(exactDate) || exactDate.length < 5) {
                return;
            }

            // 尋找卡片容器
            const card = img.closest('article, [data-a-target^="video-tower-card-"], [data-a-target="video-list-card"]');
            if (!card) return;

            // 在卡片內尋找資訊欄位
            const stats = card.querySelectorAll('.tw-media-card-stat');
            
            for (const statEl of stats) {
                if (statEl.dataset.dateProcessed === 'true') continue;

                if (isRelativeTime(statEl.textContent)) {
                    // 使用 requestAnimationFrame 確保在下一次重繪前執行，減少畫面閃爍
                    requestAnimationFrame(() => {
                        statEl.textContent = exactDate;
                        statEl.dataset.dateProcessed = 'true';
                        
                        // 樣式微調 (保留你原本的設定)
                        statEl.style.backgroundColor = 'rgba(0,0,0,0.8)';
                        statEl.style.color = '#fff';
                        statEl.style.padding = '0 0.2rem';
                        statEl.style.borderRadius = '2px'; // 加一點圓角比較好看
                    });
                    break; // 一張卡片通常只有一個時間，找到後就跳出
                }
            }
        });
    }

    // --- 效能優化後的監聽器 ---

    let debounceTimer = null;

    const observer = new MutationObserver(mutations => {
        // 如果已經有計時器在跑，先清除它 (重置倒數)
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        // 設定一個新的計時器，DEBOUNCE_DELAY_MS 毫秒後才執行
        debounceTimer = setTimeout(() => {
            replaceAllDates();
            debounceTimer = null;
        }, DEBOUNCE_DELAY_MS);
    });

    // 雖然 Twitch 結構複雜，但監聽 body 配合防抖是目前最穩定的解法
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 初次執行
    setTimeout(replaceAllDates, 1000); // 等待一點時間讓初次渲染完成

})();