// ==UserScript==
// @name         YouTube 播放清單檢查器
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      18.0
// @description  加入 Page Visibility API，支援「背景分頁開啟」場景。直到使用者切換到該分頁時，腳本才會醒來執行檢查。
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        GM_addStyle
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-playlist-checker/youtube-playlist-checker.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-playlist-checker/youtube-playlist-checker.user.js
// ==/UserScript==

(function() {
    'use strict';

    // CSS 設定
    GM_addStyle(`
        /* 鬼影模式：隱藏操作過程 */
        body.yt-playlist-checking ytd-menu-popup-renderer,
        body.yt-playlist-checking tp-yt-iron-dropdown,
        body.yt-playlist-checking iron-overlay-backdrop {
            opacity: 0 !important;
            z-index: -9999 !important;
        }
        
        /* 狀態看板 */
        #yt-status-panel {
            position: fixed; bottom: 20px; right: 20px;
            background: rgba(0, 0, 0, 0.85); color: #0f0;
            padding: 12px; border-radius: 8px; font-size: 14px;
            font-family: monospace; z-index: 99999;
            border: 1px solid #0f0; min-width: 250px;
            box-shadow: 0 0 10px rgba(0,0,0,0.5); pointer-events: none;
            display: none;
        }

        /* 結果顯示文字 */
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

        /* 操作鎖定遮罩 */
        #yt-checker-lock-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 99998; cursor: wait; display: none;
        }
    `);

    const debugPanel = document.createElement('div');
    debugPanel.id = 'yt-status-panel';
    document.body.appendChild(debugPanel);

    const lockOverlay = document.createElement('div');
    lockOverlay.id = 'yt-checker-lock-overlay';
    document.body.appendChild(lockOverlay);

    let currentVideoId = null;
    let hasRun = false;
    let pendingCheckTimer = null; // 用來儲存待執行的計時器

    function showPanel(msg) {
        debugPanel.style.display = 'block';
        debugPanel.innerHTML = `> ${msg}`;
        // console.log(`[Check] ${msg}`);
    }
    
    function hidePanel() {
        debugPanel.style.display = 'none';
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ★ 核心監聽：頁面切換
    window.addEventListener('yt-navigate-finish', function() {
        const newVideoId = new URLSearchParams(window.location.search).get('v');
        
        if (currentVideoId !== newVideoId) {
            currentVideoId = newVideoId;
            hasRun = false;
            
            // 清理舊狀態
            const oldStatus = document.getElementById('my-playlist-status');
            if (oldStatus) oldStatus.remove();
            document.body.classList.remove('yt-playlist-checking');
            hidePanel();
            
            // 清除任何可能正在倒數的計時器
            if (pendingCheckTimer) {
                clearTimeout(pendingCheckTimer);
                pendingCheckTimer = null;
            }

            // ★ 判斷是否為背景分頁
            if (document.hidden) {
                // console.log("[Check] 偵測到背景分頁，進入休眠模式，等待喚醒...");
                // 註冊喚醒監聽器 (只執行一次)
                document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
            } else {
                // 正常前台開啟，延遲執行
                pendingCheckTimer = setTimeout(startCheck, 2500);
            }
        }
    });

    // ★ 喚醒函式
    function onVisibilityChange() {
        if (!document.hidden && !hasRun) {
            // console.log("[Check] 分頁已喚醒！準備執行...");
            // 這裡給予 1.5 秒讓瀏覽器和 YouTube 從凍結狀態恢復
            if (pendingCheckTimer) clearTimeout(pendingCheckTimer);
            pendingCheckTimer = setTimeout(startCheck, 1500);
        }
    }

    async function startCheck() {
        if (!location.href.includes('/watch')) return;
        if (hasRun) return;
        
        // 再次檢查：如果使用者又切換到背景了，就暫停
        if (document.hidden) {
            document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
            return;
        }

        try {
            showPanel("開始檢查...");
            document.body.classList.add('yt-playlist-checking');
            lockOverlay.style.display = 'block';
            
            // 1. 搜尋按鈕
            showPanel("搜尋按鈕...");
            const targetBtn = await findButtonStrategy(10000);
            
            if (!targetBtn) {
                showPanel("錯誤：找不到按鈕");
                await sleep(1000);
                return;
            }

            // 2. 點擊
            showPanel("開啟選單...");
            targetBtn.click();

            // 3. 等待選單
            showPanel("讀取資料...");
            const menu = await waitForMenuVisible(8000); // 給長一點的時間
            
            if (!menu) {
                showPanel("錯誤：選單載入超時");
                await closeMenuFinal();
                return;
            }

            await sleep(300);

            // 4. 解析
            const items = document.querySelectorAll('toggleable-list-item-view-model yt-list-item-view-model');
            const found = [];
            items.forEach(item => {
                if (item.getAttribute('aria-pressed') === 'true') {
                    const title = item.querySelector('.yt-list-item-view-model__title')?.textContent.trim();
                    found.push(title);
                }
            });

            // 5. 顯示
            displayResults(found);
            hasRun = true;
            showPanel(`完成：找到 ${found.length} 個清單`);

            // 緩衝
            await sleep(1000); 

            // 6. 關閉
            showPanel("清理中...");
            await closeMenuFinal();

        } catch (e) {
            console.error(e);
            showPanel(`錯誤: ${e.message}`);
            await closeMenuFinal();
        } finally {
            document.body.classList.remove('yt-playlist-checking');
            lockOverlay.style.display = 'none';
            if (document.activeElement) document.activeElement.blur();
            const player = document.getElementById('movie_player');
            if (player) player.focus();
            const bd = document.querySelector('iron-overlay-backdrop');
            if (bd) bd.remove();
            hidePanel();
        }
    }

    async function findButtonStrategy(timeout) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const moreBtn = document.querySelector('button[aria-label="其他動作"], button[aria-label="More actions"]');
            const popup = document.querySelector('ytd-menu-popup-renderer');
            
            if (moreBtn) {
                if (!popup || popup.offsetParent === null) {
                    moreBtn.click();
                    await sleep(300);
                }
                const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer');
                for (let item of menuItems) {
                    const txt = (item.innerText || "").toLowerCase();
                    if (txt.includes('save') || txt.includes('儲存') || txt.includes('保存')) {
                        return item;
                    }
                }
            }

            const topButtons = document.querySelectorAll('ytd-menu-renderer button');
            for (let btn of topButtons) {
                const label = (btn.getAttribute('aria-label') || "").toLowerCase();
                if ((label.includes('save') || label.includes('儲存')) && !label.includes('cancel')) {
                    return btn;
                }
            }
            await sleep(200);
        }
        return null;
    }

    async function waitForMenuVisible(timeout) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const dropdown = document.querySelector('tp-yt-iron-dropdown[ytb-dropdown-visible="true"]');
            const hasContent = document.querySelector('toggleable-list-item-view-model');
            if (dropdown && hasContent) return dropdown;
            await sleep(100);
        }
        return null;
    }

    async function closeMenuFinal() {
        const escOpts = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true };
        document.dispatchEvent(new KeyboardEvent('keydown', escOpts));
        document.dispatchEvent(new KeyboardEvent('keyup', escOpts));
        
        await sleep(300);

        if (document.querySelector('tp-yt-iron-dropdown[ytb-dropdown-visible="true"]')) {
            const bd = document.querySelector('iron-overlay-backdrop');
            if (bd) bd.click();
            await sleep(200);
        }
        
        if (document.querySelector('tp-yt-iron-dropdown[ytb-dropdown-visible="true"]')) {
            const closeBtn = document.querySelector('ytd-add-to-playlist-renderer #close-button') || 
                             document.querySelector('button[aria-label="Close"]');
            if (closeBtn) closeBtn.click();
        }
    }

    function displayResults(playlists) {
        if (document.getElementById('my-playlist-status')) return;
        const anchor = document.querySelector('#above-the-fold #bottom-row') || document.querySelector('#above-the-fold h1');
        if (!anchor) return;

        const div = document.createElement('div');
        div.id = 'my-playlist-status';
        div.innerHTML = playlists.length > 0 
            ? `✅ 本影片已存在於：<span style="color: #4af; font-weight:bold;">${playlists.join('、 ')}</span>` 
            : `⚪ 未加入任何自訂清單`;
        
        if (anchor.id === 'bottom-row') anchor.parentNode.insertBefore(div, anchor.nextSibling);
        else anchor.parentNode.appendChild(div);
    }

})();