// ==UserScript==
// @name         Manga-Zip Detail Page Follow Button
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      4.1.1
// @description  在詳情頁新增追蹤按鈕，並自動同步「已追蹤/未追蹤」的原始狀態。
// @author       downwarjers
// @license      MIT
// @match        https://*.manga-zip.info/dl/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/manga-zip-detail-page-follow-btn/manga-zip-detail-page-follow-btn.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/manga-zip-detail-page-follow-btn/manga-zip-detail-page-follow-btn.user.js
// ==/UserScript==

(function () {
  'use strict';

  function injectSmartButton() {
    // 1. 尋找「資訊欄」位置
    const infoList = document.querySelector('ul.releases');
    if (!infoList) {
      return;
    }

    // 防止重複生成
    if (document.getElementById('custom-follow-li')) {
      return;
    }

    // 2. 尋找「原始按鈕」來獲取 ID 和 目前狀態
    // 這是最重要的一步：我們參考頁面中間原本就有的那個小愛心按鈕
    const sourceBtn = document.querySelector('.share-icon.follow span[onclick*="md.follow"]');
    let mangaId = null;
    let isFollowed = false;

    if (sourceBtn) {
      // 抓 ID
      const match = sourceBtn.getAttribute('onclick').match(/md\.follow\(this,\s*(\d+)\)/);
      if (match) {
        mangaId = match[1];
      }

      // 抓狀態：如果原始按鈕有 'selected' class，代表已經追蹤了
      if (sourceBtn.classList.contains('selected')) {
        isFollowed = true;
      }
    } else {
      // 如果找不到原始按鈕 (極少見)，嘗試從檢舉按鈕抓 ID，狀態預設為未追蹤
      const reportBtn = document.querySelector('.share-icon.report a[onclick*="__report"]');
      if (reportBtn) {
        const match = reportBtn.getAttribute('onclick').match(/__report\(\s*(\d+)\)/);
        if (match) {
          mangaId = match[1];
        }
      }
    }

    if (!mangaId) {
      console.warn('[Script] 無法提取 Manga ID');
      return;
    }

    // 3. 根據狀態設定新按鈕的屬性
    // 如果已追蹤：data-remove="1", class="selected", 文字="Un Follow", 圖示="fa-heart"
    // 如果未追蹤：data-remove="0", class="",           文字="Follow",    圖示="fa-heart-o"
    const removeAttr = isFollowed ? '1' : '0';
    const activeClass = isFollowed ? 'selected' : '';
    const iconClass = isFollowed ? 'fa fa-heart' : 'fa fa-heart-o'; // 實心 vs 空心
    const btnText = isFollowed ? 'Un Follow' : 'Follow';
    const btnColor = isFollowed ? '#d9534f' : '#337ab7'; // 已追蹤用紅色，未追蹤用藍色 (可自選)

    // 4. 建立按鈕 HTML
    // 注意：我們保留了 btn-follow class，這樣 md.follow 函式執行時，會自動幫我們切換圖示和 class
    const btnHtml = `
            <span class="btn-follow ${activeClass}"
                  data-remove="${removeAttr}"
                  title="Toggle Follow Status"
                  onclick="md.follow(this, ${mangaId})"
                  style="cursor: pointer; display: inline-block; color: ${btnColor}; font-weight: bold; font-size: 14px;">
                <i class="${iconClass}"></i><span> ${btnText}</span>
            </span>
        `;

    // 5. 插入到介面
    const li = document.createElement('li');
    li.id = 'custom-follow-li';
    li.innerHTML = `
            <span style="float: left; width: 20%;" class="text-uppercase text-bold">Action:</span>
            <span style="float: right; width: 80%; text-align: right;" class="pull-right">
                ${btnHtml}
            </span>
            <br class="clear">
        `;

    infoList.appendChild(li);
    console.log(`[Script] 按鈕已生成 (ID:${mangaId}, 已追蹤:${isFollowed})`);
  }

  // 延遲執行以確保原始 DOM 已載入
  window.addEventListener('load', injectSmartButton);
  // 雙重保險：如果 load 已經過這才安裝腳本
  if (document.readyState === 'complete') {
    injectSmartButton();
  }
})();
