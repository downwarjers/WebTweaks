// ==UserScript==
// @name         電子發票平台 - 自動顯示100筆
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.1
// @description  自動將列表顯示筆數切換為 100 筆並執行
// @author       downwarjers
// @license      MIT
// @match        https://*.einvoice.nat.gov.tw/*
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/einvoice-auto-show-100/einvoice-auto-show-100.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/einvoice-auto-show-100/einvoice-auto-show-100.user.js
// ==/UserScript==

(function () {
  'use strict';

  // 定義目標選擇器
  const SELECT_ID = 'SelectSizes';
  const BTN_SELECTOR = 'button.pagination_btn[title="執行"]';

  function setRowsTo100() {
    const select = document.getElementById(SELECT_ID);
    const button = document.querySelector(BTN_SELECTOR);

    // 1. 確保兩個元件都存在
    if (!select || !button) return;

    // 2. 如果已經是 100 就不重複執行 (避免無窮迴圈)
    if (select.value === '100') return;

    console.log('偵測到表格控制項，自動切換為 100 筆...');

    // 3. 設定數值
    select.value = '100';

    // 4. 關鍵：觸發 change 事件通知 Vue 框架數據已變更
    const event = new Event('change', { bubbles: true });
    select.dispatchEvent(event);

    // 5. 點擊執行按鈕 (稍微延遲確保事件已處理)
    setTimeout(() => {
      button.click();
    }, 100);
  }

  // 使用 MutationObserver 監控頁面變化
  // 因為這類網站通常是 SPA (單頁應用)，切換分頁時元件會動態產生
  const observer = new MutationObserver((mutations) => {
    // 簡單的防抖動檢查，避免過度頻繁執行
    setRowsTo100();
  });

  // 開始監控
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
