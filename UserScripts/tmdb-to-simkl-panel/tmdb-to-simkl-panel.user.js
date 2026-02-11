// ==UserScript==
// @name         TMDB to Simkl 面板
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      0.1
// @description  在 TMDB 影劇頁面插入獨立的 Simkl 控制面板，支援一鍵快速跳轉搜尋
// @author       downwarjers
// @license      MIT
// @match        https://www.themoviedb.org/movie/*
// @match        https://www.themoviedb.org/tv/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/tmdb-to-simkl-panel/tmdb-to-simkl-panel.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/tmdb-to-simkl-panel/tmdb-to-simkl-panel.user.js

// ==/UserScript==

(function () {
  'use strict';

  // ==========================================
  // 1：取得並編碼當前網址
  // ==========================================
  const currentUrl = window.location.href;
  const encodedUrl = encodeURIComponent(currentUrl);
  const simklUrl = `https://simkl.com/search/?q=${encodedUrl}`;

  // ==========================================
  // 2：建立 Simkl 專屬的獨立面板 (Panel)
  // ==========================================
  function createSimklPanel() {
    if (document.getElementById('simkl-custom-panel')) {
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'simkl-custom-panel';

    panel.style.cssText = `
            margin: 20px 0;
            padding: 16px;
            background-color: rgba(227, 183, 30, 0.05); /* 非常淡的黃色背景 */
            border-left: 5px solid #E3B71E; /* 顯眼的黃色左邊框 */
            border-radius: 0 8px 8px 0;
            display: flex;
            flex-direction: column; /* 讓標題和按鈕上下排列 */
            gap: 12px; /* 標題和按鈕列的間距 */
        `;

    const panelTitle = document.createElement('div');
    panelTitle.innerText = 'Simkl 控制面板';
    panelTitle.style.cssText = `
            font-weight: 700;
            font-size: 1.1em;
            color: #E3B71E;
        `;

    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `
            display: flex;
            flex-wrap: wrap; /* 如果未來按鈕太多會自動換行 */
            gap: 10px; /* 按鈕之間的間距 */
        `;

    // ==========================================
    // 3：建立並設定「前往搜尋」按鈕
    // ==========================================
    const searchBtn = document.createElement('a');
    searchBtn.href = simklUrl;
    searchBtn.target = '_blank';
    searchBtn.innerText = '🔍 前往 Simkl 搜尋';

    searchBtn.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background-color: #E3B71E;
            color: #000000; /* 黑字配黃底，對比更明顯 */
            font-weight: 600;
            padding: 8px 16px;
            border-radius: 6px; /* 微微的圓角，呈現區塊感 */
            text-decoration: none;
            font-size: 0.9em;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;

    searchBtn.addEventListener('mouseenter', () => {
      searchBtn.style.backgroundColor = '#C29B15';
      searchBtn.style.transform = 'translateY(-2px)'; // 懸停時稍微往上浮
    });
    searchBtn.addEventListener('mouseleave', () => {
      searchBtn.style.backgroundColor = '#E3B71E';
      searchBtn.style.transform = 'translateY(0)';
    });

    // ==========================================
    // 4：將所有元素組裝起來
    // ==========================================
    buttonGroup.appendChild(searchBtn); // 把按鈕放入按鈕容器

    /*
          const planBtn = document.createElement('button');
          buttonGroup.appendChild(planBtn);
        */

    panel.appendChild(panelTitle);
    panel.appendChild(buttonGroup);

    // ==========================================
    // 5：將面板插入到網頁中
    // ==========================================
    const headerInfo = document.querySelector('.header_info');

    if (headerInfo && headerInfo.parentNode) {
      headerInfo.parentNode.insertBefore(panel, headerInfo);
    }
  }

  window.addEventListener('load', createSimklPanel);
  setTimeout(createSimklPanel, 1000);
})();
