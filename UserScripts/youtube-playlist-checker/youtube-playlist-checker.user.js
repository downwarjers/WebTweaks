// ==UserScript==
// @name         YouTube 播放清單檢查器
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      25.0
// @description  檢查當前YouTube影片存在於哪個播放清單
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        GM_addStyle
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-playlist-checker/youtube-playlist-checker.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-playlist-checker/youtube-playlist-checker.user.js
// ==/UserScript==

(function() {
    'use strict';

    // [2025-11-22] v25.0 更新重點：
    // 1. 移除 addedNodes 判斷，改為無差別監聽 Snackbar 內的變化。
    // 2. 增加 characterData: true 設定，捕捉純文字的更動。
    // 3. 加入 Debounce (防抖) 機制，避免一次文字變化觸發多次 Regex 解析。

    GM_addStyle(`
        /* 鬼影模式：初始檢查時隱藏選單 */
        body.yt-playlist-checking ytd-menu-popup-renderer,
        body.yt-playlist-checking tp-yt-iron-dropdown,
        body.yt-playlist-checking iron-overlay-backdrop {
            opacity: 0 !important;
            z-index: -9999 !important;
        }
        
        /* 狀態顯示區 */
        #my-playlist-status {
            margin-top: 8px;
            padding: 6px 12px;
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            font-size: 1.4rem;
            color: #e1e1e1;
            border-left: 3px solid #3ea6ff;
            width: fit-content;
            display: block !important;
            margin-bottom: 10px;
        }

        #yt-checker-lock-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 99998; cursor: wait; display: none;
        }
    `);

    const lockOverlay = document.createElement('div');
    lockOverlay.id = 'yt-checker-lock-overlay';
    document.body.appendChild(lockOverlay);

    // 全域狀態
    let savedPlaylists = new Set();
    
    let currentVideoId = null;
    let hasInitialRun = false;
    let pendingCheckTimer = null;
    let snackbarObserver = null;
    let debounceTimer = null; // 用來處理快速變化的計時器

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function wait() { 
        return new Promise(r => setTimeout(r, 50)); 
    }

    function updateUI() {
        const oldStatus = document.getElementById('my-playlist-status');
        if (oldStatus) oldStatus.remove();

        const anchor = document.querySelector('#above-the-fold #top-row') || document.querySelector('#above-the-fold h1');
        if (!anchor) return;

        const div = document.createElement('div');
        div.id = 'my-playlist-status';
        
        const list = Array.from(savedPlaylists);
        div.innerHTML = list.length > 0 
            ? `✅ 本影片已存在於：<span style="color: #4af; font-weight:bold;">${list.join('、 ')}</span>` 
            : `⚪ 未加入任何自訂清單`;
        
        if (anchor.id === 'top-row') anchor.parentNode.insertBefore(div, anchor.nextSibling);
        else anchor.parentNode.appendChild(div);
    }

    // ★ 核心修正：直接讀取當前 Snackbar 內容
    function checkSnackbarContent() {
        // 直接抓取 container 內符合條件的 span，不管它是新加上去的還是原本就在那
        const container = document.querySelector('snackbar-container');
        if (!container) return;

        const textSpan = container.querySelector('span.yt-core-attributed-string[role="text"]');
        if (!textSpan) return;

        const text = textSpan.textContent.trim();
        
        // 正規表達式匹配
        const regexAdd = /^已儲存至「(.+)」$/;
        const regexRemove = /^已從「(.+)」中移除$/;

        const matchAdd = text.match(regexAdd);
        const matchRemove = text.match(regexRemove);

        if (matchAdd) {
            const listName = matchAdd[1];
            // 避免重複加入 (Set 本身已有防重機制，但為了 Log 乾淨可以加判斷)
            savedPlaylists.add(listName);
            updateUI();
        } else if (matchRemove) {
            const listName = matchRemove[1];
            savedPlaylists.delete(listName);
            updateUI();
        }
    }

    // ★ 啟動 Snackbar 監聽器
    function initSnackbarObserver() {
        if (snackbarObserver) return;

        const container = document.querySelector('snackbar-container');
        if (!container) {
            setTimeout(initSnackbarObserver, 1000);
            return;
        }

        snackbarObserver = new MutationObserver((mutations) => {
            // 不管發生什麼變動 (文字變了、屬性變了、子元素變了)，我們都統一處理
            // 使用 Debounce 防抖，確保短時間內大量的 DOM 變動只會觸發一次檢查
            if (debounceTimer) clearTimeout(debounceTimer);
            
            debounceTimer = setTimeout(() => {
                checkSnackbarContent();
            }, 100); // 延遲 100ms 讀取，確保文字已經渲染完成
        });

        snackbarObserver.observe(container, { 
            childList: true, 
            subtree: true, 
            characterData: true // ★ 關鍵：監聽純文字節點的內容變化
        });
    }

    // ★ 初始自動檢查 (維持不變)
    async function runInitialScan() {
        if (!location.href.includes('/watch')) return;
        if (hasInitialRun) return;

        if (document.hidden) {
            document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
            return;
        }

        try {
            document.body.classList.add('yt-playlist-checking');
            lockOverlay.style.display = 'block';

            const targetBtn = await findButtonStrategy(10000);
            if (!targetBtn) return;

            targetBtn.click();

            const menu = await waitForMenuVisible(8000);
            if (!menu) {
                await closeMenuFinal();
                return;
            }
            await wait();

            const items = document.querySelectorAll('toggleable-list-item-view-model yt-list-item-view-model');
            const found = [];
            items.forEach(item => {
                if (item.getAttribute('aria-pressed') === 'true') {
                    const title = item.querySelector('.yt-list-item-view-model__title')?.textContent.trim();
                    if (title) found.push(title);
                }
            });

            savedPlaylists = new Set(found);
            updateUI();
            hasInitialRun = true;
            
            await wait();
            await closeMenuFinal();

        } catch (e) {
            console.error(e);
            await closeMenuFinal();
        } finally {
            document.body.classList.remove('yt-playlist-checking');
            lockOverlay.style.display = 'none';
            if (document.activeElement) document.activeElement.blur();
            const player = document.getElementById('movie_player');
            if (player) player.focus();
        }
    }

    function onVisibilityChange() {
        if (!document.hidden && !hasInitialRun) {
            if (pendingCheckTimer) clearTimeout(pendingCheckTimer);
            pendingCheckTimer = setTimeout(runInitialScan, 1500);
        }
    }

    window.addEventListener('yt-navigate-finish', function() {
        const newVideoId = new URLSearchParams(window.location.search).get('v');
        
        initSnackbarObserver();

        if (currentVideoId !== newVideoId) {
            currentVideoId = newVideoId;
            hasInitialRun = false;
            savedPlaylists.clear();
            
            const oldStatus = document.getElementById('my-playlist-status');
            if (oldStatus) oldStatus.remove();
            document.body.classList.remove('yt-playlist-checking');
            
            if (pendingCheckTimer) clearTimeout(pendingCheckTimer);

            if (document.hidden) {
                document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
            } else {
                pendingCheckTimer = setTimeout(runInitialScan, 2500);
            }
        }
    });

    async function findButtonStrategy(timeout) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const moreBtn = document.querySelector('button[aria-label="其他動作"], button[aria-label="More actions"]');
            const popup = document.querySelector('ytd-menu-popup-renderer');
            
            if (moreBtn) {
                if (!popup || popup.offsetParent === null) {
                    moreBtn.click();
                    await wait();
                }
                const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer');
                for (let item of menuItems) {
                    const txt = (item.innerText || "").toLowerCase();
                    if (txt.includes('save') || txt.includes('儲存') || txt.includes('保存')) return item;
                }
            }
            const topButtons = document.querySelectorAll('ytd-menu-renderer button');
            for (let btn of topButtons) {
                const label = (btn.getAttribute('aria-label') || "").toLowerCase();
                if ((label.includes('save') || label.includes('儲存')) && !label.includes('cancel')) return btn;
            }
            await wait();
        }
        return null;
    }

    async function waitForMenuVisible(timeout) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const dropdown = document.querySelector('tp-yt-iron-dropdown[ytb-dropdown-visible="true"]');
            const hasContent = document.querySelector('toggleable-list-item-view-model');
            if (dropdown && hasContent) return dropdown;
            await wait();
        }
        return null;
    }

    async function closeMenuFinal() {
        const escOpts = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true };
        document.dispatchEvent(new KeyboardEvent('keydown', escOpts));
        document.dispatchEvent(new KeyboardEvent('keyup', escOpts));
        await wait();
        const bd = document.querySelector('iron-overlay-backdrop');
        if (bd) bd.click();
        const closeBtn = document.querySelector('ytd-add-to-playlist-renderer #close-button');
        if (closeBtn) closeBtn.click();
    }

})();