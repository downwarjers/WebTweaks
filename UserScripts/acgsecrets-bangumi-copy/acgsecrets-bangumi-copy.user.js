// ==UserScript==
// @name        ACGSecrets Bangumi 分類抓取
// @namespace   https://github.com/downwarjers/WebTweaks
// @version     2.3.1
// @description 優先判斷跨季/家長指引與續作/新作的組合，再依據單一Tag和名稱判斷。分為八類。
// @author      downwarjers
// @license     MIT
// @match       https://acgsecrets.hk/bangumi/*
// @grant       GM_setClipboard
// @grant       GM_download
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/acgsecrets-bangumi-copy/acgsecrets-bangumi-copy.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/acgsecrets-bangumi-copy/acgsecrets-bangumi-copy.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 支援半/全形數字：[0-9０-９]，以及中文數字、羅馬數字，新增中文大寫數字
    const num = '[0-9０-９一二三四五六七八九十壹貳參肆伍陸柒捌玖拾零佰仟萬ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]';
    const numPlus = num + '+';
    const fullNum = `[${num}]`;

    // 內容續作作品模式：明確的數字或季數標示
    const contentSequelPatterns = [
        new RegExp(`第\\s*${numPlus}\\s*(季|部分|期|季度)`, 'i'),
        new RegExp(`Season\\s*${numPlus}`, 'i'),
        new RegExp(`S\\s*${numPlus}`, 'i'),
        new RegExp(`\\s*${fullNum}(\\.|、)?${fullNum}\\s*$`, 'i'),
        new RegExp(`\\s*${fullNum}$`, 'i'),
        new RegExp(`\\s*${fullNum}\\s*(後篇|前篇|下篇|上篇)$`, 'i')
    ];

    // 內容特別篇/續篇模式：包含「篇」、「幕」、「續篇」等關鍵字
    const contentArcPatterns = [
        new RegExp(`(續篇|篇|幕|章|外傳|劇場版|電影版|OVA|OAD|WEB|SP|特別篇)`, 'i'),
        new RegExp(`[\\u4E00-\\u9FFF]+\\s*(篇|幕|章)`, 'i')
    ];

    // 輔助函式：判斷名稱是否符合續作/特別篇模式
    function isContentSequelOrArc(name) {
        return contentSequelPatterns.some(p => p.test(name)) || contentArcPatterns.some(p => p.test(name));
    }

    function extractNames() {
        const workNodes = document.querySelectorAll('div.clear-both.acgs-anime-block');

        const continuingAndSequel = []; // 跨季繼續播放 且 符合續作判斷
        const continuingAndNew = [];    // 跨季繼續播放 且 為新作
        const parentalAndSequel = [];   // 家長指引 且 符合續作判斷
        const parentalAndNew = [];      // 家長指引 且 為新作
        const taggedSequels = [];       // 單純標籤續作 (未被上述組合捕獲)
        const taggedNewSeries = [];     // 單純標籤新作 (未被上述組合捕獲)
        const contentBasedSequelsArcs = []; // 無任何標籤，但名稱符合續作/特別篇
        const others = [];              // 其他作品

        workNodes.forEach(node => {
            const nameEl = node.querySelector('div.entity_localized_name');
            if (!nameEl) return;

            const name = nameEl.textContent.trim();
            if (!name) return;

            let categorized = false;

            // 檢查所有相關標籤和狀態
            const mainTags = node.querySelectorAll('tags.main_tags');
            let hasTaggedSequel = false;
            let hasTaggedNewSeries = false;
            mainTags.forEach(tag => {
                if (tag.textContent.trim() === '續作') {
                    hasTaggedSequel = true;
                }
                if (tag.textContent.trim() === '新作' && tag.classList.contains('anime_new_series')) {
                    hasTaggedNewSeries = true;
                }
            });

            // 檢查跨季繼續播放
            const animeOnairDiv = node.querySelector('div.anime_onair');
            const isContinuing = animeOnairDiv && animeOnairDiv.textContent.includes('跨季繼續播放：');

            // 檢查家長指引
            const animeTagDiv = node.querySelector('div.anime_tag');
            let hasParentalGuidance = false;
            if (animeTagDiv) {
                const allTagsInAnimeTag = animeTagDiv.querySelectorAll('tags');
                allTagsInAnimeTag.forEach(tag => {
                    if (tag.textContent.trim() === '家長指引') {
                        hasParentalGuidance = true;
                    }
                });
            }

            // 判斷是否符合內容續作模式 (用於複合判斷)
            const isNameSequelOrArc = isContentSequelOrArc(name);

            // --- 按照新的優先級順序進行判斷 ---

            // 1. 跨季繼續播放 且 符合續作判斷 (包含標籤續作 或 名稱續作)
            if (isContinuing && (hasTaggedSequel || isNameSequelOrArc)) {
                continuingAndSequel.push(name);
                categorized = true;
            } else if (isContinuing && hasTaggedNewSeries) { // 2. 跨季繼續播放 且 為新作
                continuingAndNew.push(name);
                categorized = true;
            } else if (hasParentalGuidance && (hasTaggedSequel || isNameSequelOrArc)) { // 3. 家長指引 且 符合續作判斷
                parentalAndSequel.push(name);
                categorized = true;
            } else if (hasParentalGuidance && hasTaggedNewSeries) { // 4. 家長指引 且 為新作
                parentalAndNew.push(name);
                categorized = true;
            } else if (hasTaggedSequel) { // 5. 單純標籤續作 (未被複合條件捕獲)
                taggedSequels.push(name);
                categorized = true;
            } else if (hasTaggedNewSeries) { // 6. 單純標籤新作 (未被複合條件捕獲)
                taggedNewSeries.push(name);
                categorized = true;
            } else if (isNameSequelOrArc) { // 7. 無標籤但依名稱判斷為續作/特別篇
                contentBasedSequelsArcs.push(name);
                categorized = true;
            }

            if (categorized) return;

            // 8. 其他作品 (所有上述條件都不符合)
            others.push(name);
        });

        return {
            continuingAndSequel,
            continuingAndNew,
            parentalAndSequel,
            parentalAndNew,
            taggedSequels,
            taggedNewSeries,
            contentBasedSequelsArcs,
            others
        };
    }

    function buildText({
        continuingAndSequel,
        continuingAndNew,
        parentalAndSequel,
        parentalAndNew,
        taggedSequels,
        taggedNewSeries,
        contentBasedSequelsArcs,
        others
    }) {
        const lines = [];

        const addSection = (title, items) => {
            if (items.length > 0) {
                if (lines.length > 0) lines.push('');
                lines.push(title);
                lines.push(...items);
            }
        };

        // 按照新的優先級和您的需求順序輸出
        addSection('--- (1) 標籤續作 ---', taggedSequels);
        addSection('--- (2) 標籤新作 ---', taggedNewSeries);
        addSection('--- (3) 成人向 且 為續作 ---', parentalAndSequel);
        addSection('--- (4) 成人向 且 為新作 ---', parentalAndNew);
        addSection('--- (5) 跨季繼續播放 且 為續作 ---', continuingAndSequel);
        addSection('--- (6) 跨季繼續播放 且 為新作 ---', continuingAndNew);
        addSection('--- (7) 無標籤但依名稱判斷為續作/特別篇 ---', contentBasedSequelsArcs);
        addSection('--- (8) 其他作品 ---', others);


        if (lines.length === 0) {
            lines.push('(沒有找到任何作品)');
        }

        return lines.join('\n');
    }

    function copyToClipboard(text) {
        try {
            GM_setClipboard(text);
            const workCount = text.split('\n').filter(line => !line.startsWith('---') && !line.startsWith('(') && line.trim() !== '').length;
            alert(`已複製結果，共 ${workCount} 個作品名稱`);
        } catch (e) {
            alert('複製失敗，請確認權限設定。');
        }
    }

    function downloadAsTxt(text) {
        const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
        const fn = `${location.pathname.split('/').pop()}_titles.txt`;
        if (typeof GM_download === 'function') {
            GM_download({ url: URL.createObjectURL(blob), name: fn, saveAs: true });
        } else {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fn;
            a.click();
        }
    }

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

    window.addEventListener('load', () => setTimeout(injectUI, 500));
})();