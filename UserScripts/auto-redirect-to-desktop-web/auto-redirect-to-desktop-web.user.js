// ==UserScript==
// @name         Auto Mobile→Desktop Redirect (Enhanced)
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.1.6
// @description  當訪問手機版網頁（如 `m.`, `mobile.` 開頭或包含 `/mobile/` 路徑）時，自動嘗試跳轉回桌面版網址。內建防無限迴圈機制（檢查 Referrer 與 SessionStorage 計數），避免在只有手機版的網站上卡死。
// @author       downwarjers
// @license      MIT
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-redirect-to-desktop-web/auto-redirect-to-desktop-web.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-redirect-to-desktop-web/auto-redirect-to-desktop-web.user.js
// ==/UserScript==

(function () {
  'use strict';

  const MAX_REDIRECT_COUNT = 3; // 降低上限，減少閃爍
  const SESSION_STORAGE_KEY = 'prog_auto_redirect_count';
  const ONE_MINUTE = 60 * 1000;

  // --- 檢查並更新跳轉計數 ---
  const now = Date.now();
  let record = null;

  try {
    record = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY));
  } catch (e) {
    console.error(e);
    record = null;
  }

  if (!record || now - record.ts > ONE_MINUTE) {
    record = { count: 0, ts: now };
  }

  // 若短時間內嘗試次數過多，直接中止，保護瀏覽器
  if (record.count >= MAX_REDIRECT_COUNT) {
    console.warn('PROG: 跳轉次數過多，判定為無效跳轉或死路，停止執行。');
    return;
  }

  // --- 判斷並執行跳轉 ---
  const host = window.location.hostname;
  const path = window.location.pathname;
  const search = window.location.search;
  const hash = window.location.hash;
  const protocol = window.location.protocol;

  let newUrl = null;

  // 1. 處理子網域模式 (m.domain.com -> www.domain.com)
  // 這裡優化邏輯：有些網站不是轉 www，而是直接去掉 m.
  if (/^m\./i.test(host)) {
    newUrl = `${protocol}//${host.replace(/^m\./i, 'www.')}${path}${search}${hash}`;
  } else if (/^mobile\./i.test(host)) {
    newUrl = `${protocol}//${host.replace(/^mobile\./i, '')}${path}${search}${hash}`;
  } else if (/\.m\./i.test(host)) {
    newUrl = `${protocol}//${host.replace(/\.m\./i, '.')}${path}${search}${hash}`;
  }

  // 2. 處理路徑模式 (domain.com/mobile/ -> domain.com/)
  if (!newUrl && path.toLowerCase().includes('/mobile/')) {
    const newPath = path.toLowerCase().replace('/mobile/', '/');
    newUrl = `${protocol}//${host}${newPath}${search}${hash}`;
  }

  // 3. 檢查特殊網址參數 (?view=mobile)
  if (!newUrl && search.toLowerCase().includes('view=mobile')) {
    const newSearch = search.replace(/(\?|&)view=mobile/i, '').replace(/^\?/, '');
    newUrl = `${protocol}//${host}${path}${newSearch ? '?' + newSearch : ''}${hash}`;
  }

  if (newUrl && newUrl !== window.location.href) {
    // [核心防護] 檢查 Referrer (來源)
    // 如果來源網址包含了我們要跳轉的目標網址 (例如從 www 被踢回 m)，則停止跳轉
    // 這解決了 "只有手機版網站" 或 "強制手機版" 造成的無窮迴圈
    if (
      document.referrer &&
      (newUrl.includes(document.referrer) || document.referrer.includes(newUrl))
    ) {
      console.warn(`PROG: 偵測到被伺服器踢回 (來源: ${document.referrer})，停止跳轉。`);
      // 既然被踢回來，代表這次 session 也不用再試了，直接把計數器填滿
      record.count = MAX_REDIRECT_COUNT + 1;
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
      return;
    }

    // 累計計數
    record.count++;
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));

    console.log(`PROG: 偵測到手機版，跳轉至 ${newUrl} (第 ${record.count} 次)`);
    window.location.replace(newUrl);
  }
})();
