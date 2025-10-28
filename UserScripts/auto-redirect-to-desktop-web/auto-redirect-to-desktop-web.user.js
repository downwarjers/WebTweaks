// ==UserScript==
// @name         Auto Mobile→Desktop Redirect (Enhanced)
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.1.1
// @description  自動將手機版網址跳轉至桌面版。
// @author       downwarjers
// @license      MIT
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-redirect-to-desktop-web/auto-redirect-to-desktop-web.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-redirect-to-desktop-web/auto-redirect-to-desktop-web.user.js
// ==/UserScript==

(function() {
    'use strict';

    const MAX_REDIRECT_COUNT = 5;
    const SESSION_STORAGE_KEY = 'prog_auto_redirect_count';
    const ONE_MINUTE = 60 * 1000;

    // --- 檢查並更新跳轉計數 ---
    const now = Date.now();
    let record = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY));

    if (!record || (now - record.ts) > ONE_MINUTE) {
        // 沒有記錄或會話已超時，重置計數
        record = { count: 1, ts: now };
    } else {
        // 會話未超時，累計計數
        record.count++;
    }

    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));

    if (record.count > MAX_REDIRECT_COUNT) {
        console.warn('PROG: 已達跳轉上限，為避免無窮迴圈，不再重導。');
        return;
    }

    // --- 判斷並執行跳轉 ---
    const host = window.location.hostname;
    const path = window.location.pathname;
    const search = window.location.search;
    const hash = window.location.hash;
    
    let newUrl = null;

    // 1. 處理子網域模式 (m.domain.com, mobile.domain.com, etc.)
    if (/^m\./i.test(host)) {
        newUrl = `${window.location.protocol}//${host.replace(/^m\./i, 'www.')}${path}${search}${hash}`;
    } else if (/^mobile\./i.test(host)) {
        newUrl = `${window.location.protocol}//${host.replace(/^mobile\./i, '')}${path}${search}${hash}`;
    } else if (/\.m\./i.test(host)) {
        newUrl = `${window.location.protocol}//${host.replace(/\.m\./i, '.')}${path}${search}${hash}`;
    }
    
    // 2. 處理路徑模式 (domain.com/mobile/...)
    if (!newUrl && path.toLowerCase().includes('/mobile/')) {
        const newPath = path.toLowerCase().replace('/mobile/', '/');
        newUrl = `${window.location.protocol}//${host}${newPath}${search}${hash}`;
    }
    
    // 3. 檢查特殊網址參數 (如 ?view=mobile)
    if (!newUrl && search.toLowerCase().includes('view=mobile')) {
        const newSearch = search.replace(/(\?|&)view=mobile/i, '').replace(/^\?/, '');
        newUrl = `${window.location.protocol}//${host}${path}${newSearch ? '?' + newSearch : ''}${hash}`;
    }

    if (newUrl && newUrl !== window.location.href) {
        console.log(`PROG: 偵測到手機版網頁，準備跳轉至 ${newUrl} (第 ${record.count} 次)`);
        window.location.replace(newUrl);
    } else {
        console.log('PROG: 此網頁非手機版，或不符合跳轉規則。');
    }

})();