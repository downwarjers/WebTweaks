// ==UserScript==
// @name         巴哈姆特 - 自動關閉簽到視窗
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.5
// @description  自動偵測並關閉巴哈姆特（gamer.com.tw）進入時彈出的每日簽到視窗 (`dialogify_1`)。使用 `MutationObserver` 監聽 DOM 變化，發現關閉按鈕時自動觸發點擊。
// @author       downwarjers
// @license      MIT
// @match        https://*.gamer.com.tw/*
// @grant        none
// @run-at       document-body
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-close-baha-sign-window/auto-close-baha-sign-window.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-close-baha-sign-window/auto-close-baha-sign-window.user.js
// ==/UserScript==

(function () {
  'use strict';

  // 元素特徵
  const dialogId = 'dialogify_1';
  const closeButtonClass = 'dialogify__close';

  // CSS 選擇器：尋找 id 為 "dialogify_1" 元素內，class 為 "dialogify__close" 的元素
  const closeButtonSelector = `#${dialogId} .${closeButtonClass}`;

  // 建立一個監聽器 (Observer) 來觀察 DOM 的變化
  const observer = new MutationObserver((mutationsList, obs) => {
    const closeButton = document.querySelector(closeButtonSelector);

    // 如果找到了按鈕
    if (closeButton) {
      console.log('偵測到巴哈彈出視窗，自動點擊關閉...');
      closeButton.click(); // 模擬點擊

      // 任務完成，停止監聽，節省資源
      obs.disconnect();
    }
  });

  // 開始監聽 <body> 及其子節點的變化
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(() => {
    observer.disconnect();
    // console.log('Baha Sign: 監聽逾時 (可能已簽到)，停止監控以節省資源。');
  }, 30000); // 30000 毫秒 = 30 秒
})();
