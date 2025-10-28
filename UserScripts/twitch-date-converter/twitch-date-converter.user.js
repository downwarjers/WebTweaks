// ==UserScript==
// @name         Twitch 精確日期轉換器
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.5.1
// @description  使用 Twitch 原始時間戳將所有日期轉換為 yyyy-MM-dd 格式
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

    // 關鍵字列表 (第一階段檢查)
    const relativeTimeKeywords = [
        '前', 'ago', 'yesterday', '小時', '天', '週', '月', '年',
        'hour', 'day', 'week', 'month', 'year', 'just now'
    ];

    // 特殊單字列表 (針對沒有數字的相對時間)
    const specialRelativeWords = [
        '剛剛', 'just now',
        '昨天', 'yesterday',
        '前天', 'day before yesterday',
        '上週', 'last week',
        '上個月', 'last month',
        '去年', 'last year'
    ];

    /**
     * 檢查文字是否為相對時間 (v3 修正版)
     * @param {string} text
     * @returns {boolean}
     */
    function isRelativeTime(text) {
        if (!text) return false;

        const lowerText = text.toLowerCase();

        // 1. 必須包含基礎關鍵字
        const hasKeyword = relativeTimeKeywords.some(keyword => lowerText.includes(keyword));
        if (!hasKeyword) return false;

        // 2. 排除 "觀看次數" (views)
        if (lowerText.includes('觀看') || lowerText.includes('view') || lowerText.includes('visualizaç')) {
            return false;
        }

        // 3. 排除 "9:33:49" 這種時長格式 (檢查是否包含 :)
        if (text.includes(':')) {
            return false;
        }

        // 4. 檢查是否包含數字 (e.g., "12 天前")
        const hasNumber = /\d/.test(text);
        if (hasNumber) {
            return true; // "12 天前", "2 個月前" 等會在這裡通過
        }

        // 5. 如果沒有數字，檢查是否為特殊單字 (e.g., "前天", "上個月")
        const isSpecialWord = specialRelativeWords.some(word => lowerText.includes(word));

        return isSpecialWord;
    }

    /**
     * 尋找頁面上所有尚未處理的卡片
     */
    function replaceAllDates() {
        const thumbnails = document.querySelectorAll(
            'img[data-test-selector="preview-card-thumbnail__image-selector"]:not([data-thumbnail-processed])'
        );

        thumbnails.forEach(img => {
            img.dataset.thumbnailProcessed = 'true';

            // 1. 獲取日期
            const exactDate = img.title;
            if (!exactDate || !/\d/.test(exactDate) || exactDate.length < 5) {
                return;
            }

            // 2. 找到共同的卡片祖先
            const card = img.closest('article, [data-a-target^="video-tower-card-"], [data-a-target="video-list-card"]');
            if (!card) {
                return;
            }

            // 3. 在卡片內找到所有 stats
            const stats = card.querySelectorAll('.tw-media-card-stat');
            if (stats.length === 0) {
                return;
            }

            // 4. 遍歷 stats 找到 "相對時間" 並替換
            for (const statEl of stats) {
                if (statEl.dataset.dateProcessed === 'true') continue;

                const text = statEl.textContent;
                if (isRelativeTime(text)) {
                    statEl.textContent = exactDate;
                    statEl.dataset.dateProcessed = 'true';

                    // (可選) 樣式
                    statEl.style.backgroundColor = 'rgba(0,0,0,0.8)';
                    statEl.style.color = '#fff';
                    statEl.style.padding = '0 0.2rem';

                    break; 
                }
            }
        });
    }

    // --- 啟動 ---

    // MutationObserver 監聽 DOM 變化
    const observer = new MutationObserver(mutations => {
        replaceAllDates();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 頁面初次載入時執行
    setTimeout(replaceAllDates, 2000);
})();