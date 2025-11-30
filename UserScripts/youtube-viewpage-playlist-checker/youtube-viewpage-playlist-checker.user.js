// ==UserScript==
// @name         YouTube 播放清單檢查器
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      29.7
// @description  檢查當前YouTube影片存在於哪個播放清單
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-idle
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-viewpage-playlist-checker/youtube-viewpage-playlist-checker.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-viewpage-playlist-checker/youtube-viewpage-playlist-checker.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- CSS 設定 ---
    function addStyle(css) {
		const id = 'my-playlist-checker-style';
        if (document.getElementById(id)) return; // 已經有了就跳過
        const style = document.createElement('style');
        style.id = id; // 設定 ID
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
	}

    addStyle(`
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
            font-family: Roboto, Arial, sans-serif;
            transition: all 0.2s ease;
        }
        /* 同步中狀態 (黃色/灰色) */
        #my-playlist-status.syncing {
            border-left-color: #f1c40f;
            color: #ddd;
            background-color: rgba(241, 196, 15, 0.1);
        }
        /* 錯誤狀態 (紅色) */
        #my-playlist-status.error {
            border-left-color: #ff4e45;
            background-color: rgba(255, 78, 69, 0.1);
            color: #ff4e45;
        }
    `);

    let currentVideoId = null;
    let snackbarObserver = null;
    let debounceTimer = null;
    let isChecking = false; // 這是防止重複執行的鎖

    // ==========================================
    // 1. 介面控制
    // ==========================================
    function showStatus(htmlContent, className = '') {
        let div = document.getElementById('my-playlist-status');
        if (!div) {
            div = document.createElement('div');
            div.id = 'my-playlist-status';
            const anchor = document.querySelector('#above-the-fold #top-row') || document.querySelector('#above-the-fold h1');
            if (anchor) {
                if (anchor.id === 'top-row') anchor.parentNode.insertBefore(div, anchor.nextSibling);
                else anchor.parentNode.appendChild(div);
            } else {
                return;
            }
        }
        if (div.innerHTML !== htmlContent) {
            div.innerHTML = htmlContent;
        }
        div.className = className;
    }

    // ==========================================
    // 2. 核心工具：驗證與設定
    // ==========================================
    function waitForConfig(timeout = 5000) {
        return new Promise((resolve) => {
            if (window.ytcfg && window.ytcfg.get) return resolve(window.ytcfg);
            const start = Date.now();
            const interval = setInterval(() => {
                if (window.ytcfg && window.ytcfg.get) {
                    clearInterval(interval);
                    resolve(window.ytcfg);
                } else if (Date.now() - start > timeout) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 100);
        });
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    async function generateSAPISIDHASH() {
        const sapisid = getCookie('SAPISID');
        if (!sapisid) return null;
        const timestamp = Math.floor(Date.now() / 1000);
        const origin = window.location.origin;
        const str = `${timestamp} ${sapisid} ${origin}`;
        const buffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `SAPISIDHASH ${timestamp}_${hashHex}`;
    }

    // ==========================================
    // 3. 搜尋邏輯
    // ==========================================
    function findButtonByText(obj, targetTexts, visited = new Set()) {
        if (!obj || typeof obj !== 'object') return null;
        if (visited.has(obj)) return null;
        visited.add(obj);

        let foundText = null;
        if (obj.simpleText) foundText = obj.simpleText;
        else if (obj.runs && obj.runs[0] && obj.runs[0].text) foundText = obj.runs[0].text;

        if (foundText && targetTexts.includes(foundText.trim())) return { found: true, text: foundText };

        for (let k in obj) {
            if (k === 'secondaryResults' || k === 'frameworkUpdates' || k === 'loggingContext' || k === 'playerOverlays') continue;
            const result = findButtonByText(obj[k], targetTexts, visited);
            if (result) {
                if (result.found) {
                    const keys = ['addToPlaylistServiceEndpoint', 'serviceEndpoint', 'command', 'navigationEndpoint', 'showSheetCommand'];
                    for (let key of keys) if (obj[key]) return obj[key];
                    return result;
                }
                return result;
            }
        }
        return null;
    }

    // ==========================================
    // 4. 主功能：背景檢查 API
    // ==========================================
    async function checkPlaylists() {
        if (isChecking) return;
        isChecking = true;

        try {
            const ytConfig = await waitForConfig();
            if (!ytConfig) {
                isChecking = false;
                return;
            }

            const app = document.querySelector('ytd-app');
            const rawData = app?.data?.response || window.ytInitialData;
            const mainVideoScope = rawData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
            const searchTargets = mainVideoScope ? [mainVideoScope] : [rawData, window.ytInitialPlayerResponse];

            let params = null;
            let videoIdFromEndpoint = null;

            for (let source of searchTargets) {
                let candidate = findButtonByText(source, ['儲存', 'Save', '保存']);
                if (candidate) {
                    let ep = candidate;
                    if (candidate.addToPlaylistServiceEndpoint) ep = candidate.addToPlaylistServiceEndpoint;
                    else if (candidate.command && candidate.command.addToPlaylistServiceEndpoint) ep = candidate.command.addToPlaylistServiceEndpoint;
                    else if (candidate.showSheetCommand && candidate.showSheetCommand.panelLoadingStrategy) ep = candidate.showSheetCommand.panelLoadingStrategy.requestTemplate;
                    else if (candidate.panelLoadingStrategy) ep = candidate.panelLoadingStrategy.requestTemplate;

                    if (ep && ep.params) {
                        params = ep.params;
                        if (ep.videoId) videoIdFromEndpoint = ep.videoId;
                        break;
                    }
                }
            }

            if (!params) {
                const menuRenderer = document.querySelector('ytd-menu-renderer[class*="ytd-watch-metadata"]');
                if (menuRenderer && menuRenderer.data) {
                    const buttons = menuRenderer.data.topLevelButtons || [];
                    for (let btn of buttons) {
                        const icon = btn.buttonRenderer?.icon?.iconType || btn.flexibleActionsViewModel?.iconName;
                        if (icon === 'PLAYLIST_ADD' || icon === 'SAVE') {
                            let ep = btn.buttonRenderer?.serviceEndpoint || btn.buttonRenderer?.command || btn.flexibleActionsViewModel?.onTap?.command;
                            if (ep) {
                                if (ep.addToPlaylistServiceEndpoint) params = ep.addToPlaylistServiceEndpoint.params;
                                else if (ep.showSheetCommand) params = ep.showSheetCommand.panelLoadingStrategy?.requestTemplate?.params;
                                else if (ep.params) params = ep.params;
                            }
                            if (params) break;
                        }
                    }
                }
            }

            if (!params) throw new Error("API Params Not Found");

            const currentUrlId = new URLSearchParams(window.location.search).get('v');
            const finalVideoId = videoIdFromEndpoint || currentUrlId;
            const apiKey = ytConfig.get('INNERTUBE_API_KEY');
            const context = ytConfig.get('INNERTUBE_CONTEXT');
            const sessionIndex = ytConfig.get('SESSION_INDEX') || '0';
            const authHeader = await generateSAPISIDHASH();

            if (!authHeader || !apiKey) throw new Error("Auth Failed");

            const response = await fetch(`https://www.youtube.com/youtubei/v1/playlist/get_add_to_playlist?key=${apiKey}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': authHeader,
                    'X-Origin': window.location.origin,
                    'X-Goog-AuthUser': sessionIndex
                },
                credentials: 'include',
                body: JSON.stringify({
                    context: context,
                    videoIds: [finalVideoId],
                    params: params
                })
            });

            if (!response.ok) throw new Error(`API ${response.status}`);
            const json = await response.json();

            function findPlaylistsRecursive(obj) {
                let results = [];
                if (!obj || typeof obj !== 'object') return results;
                if (obj.playlistAddToOptionRenderer) results.push(obj.playlistAddToOptionRenderer);
                for (let k in obj) results = results.concat(findPlaylistsRecursive(obj[k]));
                return results;
            }

            const playlists = findPlaylistsRecursive(json);
            const added = [];

            playlists.forEach(p => {
                const title = p.title.simpleText || p.title.runs?.[0]?.text;
                const rawStatus = p.containsSelectedVideos || p.containsSelectedVideo;
                const isAdded = rawStatus === 'ALL' || rawStatus === 'TRUE' || rawStatus === true;
                if (isAdded) added.push(title);
            });

            const html = added.length > 0 
                ? `✅ 本影片已存在於：<span style="color: #4af; font-weight:bold;">${added.join('、 ')}</span>` 
                : `⚪ 未加入任何自訂清單`;
            
            showStatus(html, '');

        } catch (e) {
            console.error("[YT-Checker]", e);
            showStatus(`❌ 錯誤: ${e.message}`, 'error');
        } finally {
            isChecking = false;
        }
    }

    // ==========================================
    // 5. 觸發與監聽
    // ==========================================
    window.addEventListener('yt-navigate-finish', function() {
        const newVideoId = new URLSearchParams(window.location.search).get('v');
        
        const statusEl = document.getElementById('my-playlist-status');
        if (statusEl) statusEl.remove();

        if (!location.href.includes('/watch')) return;

        if (currentVideoId !== newVideoId) {
            currentVideoId = newVideoId;
            initSnackbarObserver();

            if (document.hidden) {
                document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
            } else {
                // 初始載入
                setTimeout(checkPlaylists, 1500);
            }
        }
    });

    function onVisibilityChange() {
        if (!document.hidden) {
            setTimeout(checkPlaylists, 1000);
        }
    }

    function initSnackbarObserver() {
        if (snackbarObserver) return;

        const container = document.querySelector('snackbar-container');
        if (!container) {
            setTimeout(initSnackbarObserver, 2000);
            return;
        }

        snackbarObserver = new MutationObserver((mutations) => {
            const hasToast = container.childElementCount > 0;

            if (hasToast) {
                // Toast 出現：代表忙碌中，強制顯示同步狀態
                if (debounceTimer) clearTimeout(debounceTimer);
                showStatus('⏳ 同步中...', 'syncing');
            } else {
                // Toast 消失：代表閒置，執行更新
                if (debounceTimer) clearTimeout(debounceTimer);
                checkPlaylists();
            }
        });

        snackbarObserver.observe(container, { 
            childList: true, 
            subtree: true 
        });
        
        // console.log("[YT-Checker] 背景監聽器已啟動");
    }

})();