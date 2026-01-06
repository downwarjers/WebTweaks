// ==UserScript==
// @name         AniList to OTT Sites
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.0
// @description  AniList 清單新增外部OTT按鈕，直接跳轉搜尋作品，支援巴哈自動跳轉集數
// @author       downwarjers
// @license      MIT
// @match        https://anilist.co/*
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      ani.gamer.com.tw
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/anilist-external-ott-services/anilist-external-ott-services.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/anilist-external-ott-services/anilist-external-ott-services.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // ★★★ 設定區 (以後要在這裡新增按鈕) ★★★
    // ==========================================
    const services = [
        {
            id: 'bahamut',
            label: '巴',
            color: '#00b4d8', // 藍色
            hoverColor: '#0077b6',
            tooltip: '前往巴哈姆特動畫瘋 (智慧跳轉)',
            // 定義點擊後的動作
            action: (title, progress, btn) => {
                runBahaLogic(title, progress, btn);
            }
        },
        {
            id: 'netflix',
            label: 'N',
            color: '#E50914', // 紅色
            hoverColor: '#B20710',
            tooltip: '前往 Netflix 搜尋',
            action: (title, progress, btn) => {
                const url = `https://www.netflix.com/search?q=${encodeURIComponent(title)}`;
                GM_openInTab(url, { active: true });
            }
        },
        // --- 範例：如果想新增 YouTube，把註解拿掉即可 ---
        /*
        {
            id: 'youtube',
            label: 'YT',
            color: '#FF0000',
            hoverColor: '#CC0000',
            tooltip: '搜尋 YouTube',
            action: (title, progress, btn) => {
                const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`;
                GM_openInTab(url, { active: true });
            }
        }
        */
    ];

    // ==========================================
    // === 1. 樣式注入 (CSS) ===
    // ==========================================
    const style = document.createElement('style');
    let cssRules = `
        .list-head .custom-links-col, .entry .custom-links-col {
            width: ${services.length * 30 + 20}px; /* 自動根據按鈕數量調整寬度 */
            text-align: center;
            display: flex;
            justify-content: center;
            gap: 8px;
        }
        .link-btn {
            cursor: pointer;
            font-weight: bold;
            font-family: sans-serif;
            transition: color 0.2s;
            padding: 0 2px;
        }
    `;
    
    // 自動生成每個按鈕的顏色樣式
    services.forEach(service => {
        cssRules += `
            .btn-${service.id} { color: ${service.color}; }
            .btn-${service.id}:hover { color: ${service.hoverColor}; }
        `;
    });

    style.innerHTML = cssRules;
    document.head.appendChild(style);

    // ==========================================
    // === 2. 主程式 (介面渲染) ===
    // ==========================================
    const observer = new MutationObserver(() => initButtons());
    observer.observe(document.body, { childList: true, subtree: true });

    function initButtons() {
        // 標題列
        document.querySelectorAll('.list-head').forEach(header => {
            if (!header.querySelector('.custom-links-col')) {
                const div = document.createElement('div');
                div.className = 'custom-links-col';
                div.innerText = 'Links';
                header.appendChild(div);
            }
        });

        // 列表項目
        document.querySelectorAll('.entry.row').forEach(entry => {
            if (entry.querySelector('.custom-links-col')) return;

            // 抓取標題
            const titleEl = entry.querySelector('.title a');
            if (!titleEl) return;
            const title = titleEl.innerText.trim();

            // 抓取進度
            let progress = 0;
            const progressEl = entry.querySelector('.progress span') || entry.querySelector('.progress');
            if (progressEl) {
                const raw = entry.querySelector('.progress').innerText;
                const clean = raw.replace('+', '').trim().split('/')[0];
                progress = parseInt(clean, 10) || 0;
            }

            // 建立容器
            const btnDiv = document.createElement('div');
            btnDiv.className = 'custom-links-col';

            // ★ 迴圈生成按鈕 (根據最上面的 services 設定) ★
            services.forEach(service => {
                const btn = document.createElement('span');
                btn.className = `link-btn btn-${service.id}`;
                btn.innerText = service.label;
                btn.title = `${service.tooltip}: ${title}`;
                
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // 執行設定檔中的 action
                    service.action(title, progress, btn);
                };
                
                btnDiv.appendChild(btn);
            });

            entry.appendChild(btnDiv);
        });
    }

    // ==========================================
    // === 3. 巴哈姆特 核心邏輯 (複雜功能區) ===
    // ==========================================
    function runBahaLogic(keyword, currentProgress, btnElement) {
        const originalText = btnElement.innerText;
        btnElement.innerText = '...'; 

        const searchUrl = `https://ani.gamer.com.tw/search.php?keyword=${encodeURIComponent(keyword)}`;

        GM_xmlhttpRequest({
            method: "GET",
            url: searchUrl,
            onload: function(response) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(response.responseText, "text/html");
                const results = doc.querySelectorAll('.theme-list-block');

                if (results.length === 1) {
                    const link = results[0].querySelector('a.theme-list-main');
                    if (link) {
                        const href = link.getAttribute('href');
                        const animeUrl = href.startsWith('http') ? href : 'https://ani.gamer.com.tw/' + href;
                        fetchBahaEpisode(animeUrl, currentProgress, searchUrl, btnElement, originalText);
                    } else {
                        resetBtn(btnElement, originalText);
                        GM_openInTab(searchUrl, { active: true });
                    }
                } else {
                    resetBtn(btnElement, originalText);
                    GM_openInTab(searchUrl, { active: true });
                }
            },
            onerror: function() {
                resetBtn(btnElement, originalText);
                alert('連線失敗');
            }
        });
    }

    function fetchBahaEpisode(animeUrl, currentProgress, fallbackUrl, btnElement, originalText) {
        GM_xmlhttpRequest({
            method: "GET",
            url: animeUrl,
            onload: function(response) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(response.responseText, "text/html");
                
                // 抓取連結並過濾
                const rawLinks = doc.querySelectorAll('.season ul li a, ul.anime_list li a');
                const validEpisodes = [];
                rawLinks.forEach(link => {
                    const num = parseFloat(link.innerText.trim());
                    // 過濾條件: 數字、整數、>0
                    if (!isNaN(num) && Number.isInteger(num) && num > 0) {
                        validEpisodes.push(link);
                    }
                });

                if (validEpisodes.length > 0) {
                    let targetIndex = currentProgress > 0 ? currentProgress - 1 : 0;

                    if (targetIndex < validEpisodes.length) {
                        const href = validEpisodes[targetIndex].getAttribute('href'); 
                        let finalUrl = href;
                        if (href.startsWith('?')) finalUrl = 'https://ani.gamer.com.tw/animeVideo.php' + href;
                        else if (href.startsWith('animeVideo.php')) finalUrl = 'https://ani.gamer.com.tw/' + href;
                        
                        resetBtn(btnElement, originalText);
                        GM_openInTab(finalUrl, { active: true });
                    } else {
                        resetBtn(btnElement, originalText);
                        GM_openInTab(animeUrl, { active: true });
                    }
                } else {
                    resetBtn(btnElement, originalText);
                    GM_openInTab(animeUrl, { active: true });
                }
            },
            onerror: function() {
                resetBtn(btnElement, originalText);
                GM_openInTab(fallbackUrl, { active: true });
            }
        });
    }

    function resetBtn(btn, text) {
        btn.innerText = text;
    }

})();