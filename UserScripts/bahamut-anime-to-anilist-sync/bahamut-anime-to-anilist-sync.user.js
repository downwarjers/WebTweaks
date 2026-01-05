// ==UserScript==
// @name         Bahamut Anime to AniList Sync
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      4.8
// @description  巴哈姆特動畫瘋同步到 AniList。支援系列設定、自動計算集數、自動日期匹配、深色模式UI
// @author       downwarjers
// @license      MIT
// @match        https://ani.gamer.com.tw/*
// @connect      acg.gamer.com.tw
// @connect      graphql.anilist.co
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bahamut-anime-to-anilist-sync/bahamut-anime-to-anilist-sync.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bahamut-anime-to-anilist-sync/bahamut-anime-to-anilist-sync.user.js
// ==/UserScript==

(function () {
    "use strict";

    const $ = window.jQuery;

    // --- 靜態設定 ---
    const CONFIG = {
        UPDATE_THRESHOLD: 1, // 同步觸發時間：當影片播放超過「1秒」時觸發
        DATE_TOLERANCE: 2, // 日期容錯天數
    };

    // --- 狀態變數 ---
    let state = {
        // [身分與設定]
        token: GM_getValue("ANILIST_TOKEN"), // AniList 的授權金鑰

        // [綁定規則與數據]
        rules: [], 
        activeRule: null, 
        userStatus: null, 
        bahaSn: null, 
        candidate: null, 

        // [執行時期的監控]
        currentUrlSn: null, 
        hasSynced: false, 
        isHunting: false, 

        // [錯誤控制]
        tokenErrorCount: 0, // Token 錯誤計數器
        stopSync: false,    // 是否停止同步 (遇到嚴重錯誤時設為 true)

        // [計時器]
        huntTimer: null, 
        statusTimeout: null, 
        isAutoBinding: false, 
    };

    // --- 設定：網頁元素選擇器 ---
    const SELECTORS = {
        infoTitle: ".ACG-info-container > h2",
        infoList: ".ACG-box1listA > li",
        seasonList: ".season ul li",
        playing: ".playing",
        acgLink: 'a[href*="acgDetail.php"]',
        acgLinkAlt: 'a:contains("作品資料")',
    };

    // --- CSS (深色模式 Dark Mode) ---
    GM_addStyle(`
        /* ================= 基礎框架 ================= */
        /* 導航欄按鈕 */
        .al-nav-item { margin-left: 10px; padding-left: 10px; border-left: 1px solid #555; display: inline-flex; align-items: center; height: 100%; vertical-align: middle; }
        .al-nav-link { color: #ccc; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 6px; transition: 0.2s; font-size: 13px; text-decoration: none !important; height: 40px; width: auto; }
        .al-nav-link:hover { color: #fff; }
        #al-text { white-space: nowrap; font-weight: bold; }
        .al-nav-title { color: #888; font-size: 12px; margin-left: 8px; padding-left: 8px; border-left: 1px solid #666; display: inline-block; max-width: 300px; min-width: 50px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
        .al-user-status { color: #4caf50; font-size: 12px; margin-left: 8px; padding-left: 8px; border-left: 1px solid #666; white-space: nowrap; display: none; }
        
        /* RWD */
        @media (max-width: 1200px) { .al-nav-title { max-width: 150px; } }
        @media (max-width: 768px) { .al-nav-title { display: none; } }

        /* Modal (視窗主體) */
        .al-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 99999; display: none; justify-content: center; align-items: center; }
        .al-modal-content { background: #1b1b1b; color: #eee; width: 750px; max-height: 90vh; border-radius: 8px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.8); overflow: hidden; border: 1px solid #333; }
        .al-modal-header { padding: 15px; background: #222; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        .al-modal-body { overflow-y: auto; padding: 0; flex: 1; min-height: 300px; background: #1b1b1b; }
        .al-close-btn { color: #ff5252 !important; font-weight: bold; font-size: 28px; background: none; border: none; cursor: pointer; line-height: 1; transition: 0.2s; }
        .al-close-btn:hover { color: #ff0000 !important; transform: scale(1.1); }
        .al-footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #333; font-size: 12px; color: #666; }

        /* Tabs 頁籤 */
        .al-tabs-header { display: flex; border-bottom: 1px solid #333; background: #222; }
        .al-tab-btn { flex: 1; padding: 12px; text-align: center; cursor: pointer; border: none; background: #222; font-weight: bold; color: #888; border-bottom: 3px solid transparent; transition: 0.2s; }
        .al-tab-btn:hover { background: #333; color: #3db4f2; }
        .al-tab-btn.active { color: #3db4f2; border-bottom: 3px solid #3db4f2; background: #2a2a2a; }
        .al-tab-content { display: none; padding: 15px; animation: al-fadein 0.2s; }
        .al-tab-content.active { display: block; }

        /* ================= 通用元件 (按鈕/輸入框) ================= */
        /* 按鈕類 */
        .al-bind-btn { background: #3db4f2; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; }
        .al-bind-btn:hover { background: #2a9bd6; }
        .al-btn-grey { background: #d32f2f; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 15px; }
        .al-btn-green { background: #388e3c; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%; font-size: 14px; margin-bottom: 10px; }
        
        /* 外部連結按鈕 (搜尋用) */
        .al-btn-ext { text-decoration: none; padding: 6px 16px; border-radius: 20px; font-size: 12px; background: transparent; border: 1px solid #3db4f2; color: #3db4f2; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 5px; font-weight: bold; margin-left: 8px; }
        .al-btn-ext:hover { background: #3db4f2; color: #fff; transform: translateY(-1px); }
        
        /* 眼睛開關按鈕 */
        .al-icon-btn { background: #333; border: 1px solid #555; width: 40px; padding: 0; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .al-icon-btn:hover { background: #444; }

        /* 輸入框 */
        .al-input-group { display: flex; gap: 10px; margin-top: 5px; }
        .al-input { flex: 1; padding: 8px; border: 1px solid #555; border-radius: 4px; background: #333; color: #eee; }
        .al-input:focus { border-color: #3db4f2; outline: none; }
        .al-link { color: #81d4fa; text-decoration: none; font-weight: bold; }
        .al-link:hover { color: #4fc3f7; text-decoration: underline; }

        /* ================= 設定頁面 (Settings Tab) ================= */
        .al-settings-box { padding: 20px; }
        .al-settings-label { display: block; margin-bottom: 5px; font-weight: bold; }
        
        /* 步驟卡片容器 */
        .al-step-card { font-size: 13px; color: #aaa; margin-top: 15px; background: #222; padding: 12px 15px; border-radius: 6px; border: 1px solid #333; }
        .al-step-title { margin: 0 0 10px 0; font-weight: bold; color: #eee; font-size: 14px; border-bottom: 1px solid #333; padding-bottom: 6px; }
        
        /* 步驟列表項目 (左數字 右內容) */
        .al-step-item { display: flex; align-items: flex-start; margin-bottom: 8px; line-height: 1.6; }
        .al-step-num { flex-shrink: 0; width: 20px; font-weight: bold; color: #3db4f2; }
        .al-step-content { flex: 1; }
        
        /* 步驟內的動作列 (輸入框+按鈕) */
        .al-step-action-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
        .al-id-input { width: 55px !important; padding: 4px; text-align: center; height: 30px; }

        /* 授權連結按鈕狀態 */
        .al-auth-btn { text-decoration: none; height: 30px; line-height: 18px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 4px; transition: all 0.2s; color: white; font-weight: bold; font-size: 12px; }
        .al-auth-btn.disabled { background: #555; cursor: not-allowed; opacity: 0.6; pointer-events: none; }
        .al-auth-btn.active { background: #3db4f2; cursor: pointer; opacity: 1; pointer-events: auto; }
        .al-auth-btn.active:hover { background: #2a9bd6; }

        /* ================= 首頁與搜尋 (Home Tab) ================= */
        .al-candidate-box { background: #2e2818; border: 1px solid #5a4b18; padding: 15px; border-radius: 6px; margin-bottom: 15px; display: flex; align-items: center; gap: 15px; }
        .al-result-item { padding: 12px 15px; border-bottom: 1px solid #333; display: flex; gap: 12px; align-items: center; transition: background 0.2s; }
        .al-result-item:hover { background: #2a2a2a; }
        .al-current-info { background: #1a2633; border: 1px solid #1e3a5f; border-radius: 5px; margin-bottom: 15px; }
        .al-ext-search-group { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }

        /* ================= 系列對應 (Series Tab) ================= */
        .al-map-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .al-map-table th { background: #2a2a2a; padding: 10px; text-align: left; border-bottom: 2px solid #444; color: #ccc; font-weight: bold; }
        .al-map-table td { padding: 10px; border-bottom: 1px solid #333; vertical-align: middle; }
        .al-map-input { width: 70px; padding: 6px; border: 1px solid #555; border-radius: 4px; text-align: center; font-weight: bold; background: #333; color: #eee; }
        .al-map-input:focus { border-color: #3db4f2; outline: none; background: #1a2633; }
        
        .al-btn-toggle { padding: 5px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; width: 100%; transition: 0.2s; }
        .al-btn-toggle.enable { background-color: #444; color: #ccc; }
        .al-btn-toggle.enable:hover { background-color: #388e3c; color: white; }
        .al-btn-toggle.disable { background-color: #3e2723; color: #ff5252; }
        .al-btn-toggle.disable:hover { background-color: #d32f2f; color: white; }
        
        .al-map-row.active { background-color: #1b2e1b; }
        .al-map-row.active .status-text { color: #66bb6a; font-weight: bold; }
        .al-map-row.suggestion { background-color: #3e3315; }
        .al-map-row.suggestion .status-text { color: #ffca28; font-weight: bold; }
        .al-map-row .status-text { color: #777; }
        .al-checkbox { display: none; }

        /* ================= Toast 通知 ================= */
        .al-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(20, 20, 20, 0.95); border: 1px solid #444; color: #fff; padding: 10px 20px; border-radius: 20px; z-index: 100000; font-size: 14px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5); animation: al-fadein 0.3s, al-fadeout 0.3s 2.7s forwards; }
        @keyframes al-fadein { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes al-fadeout { from { opacity: 1; } to { opacity: 0; } }
    `);

    // ================= 主程式 =================
    function main() {
        if (!state.token) {
            console.log("AniList Token 未設定");
        }
        waitForNavbar();
        startSmartMonitor();
    }

    // ================= 監控與初始化 =================
    function startSmartMonitor() {
        checkUrlChange();
        setInterval(checkUrlChange, 1000);
    }

    function checkUrlChange() {
        if (!location.href.includes("animeVideo.php")) return;
        const urlParams = new URLSearchParams(location.search);
        const newSn = urlParams.get("sn");

        // 偵測到 SN 不同，代表換集數了
        if (newSn !== state.currentUrlSn) {
            state.currentUrlSn = newSn; // 更新目前的 SN
            
            resetStateForNewEpisode();  // <--- 呼叫重置函式，清空上一集的髒資料
            
            initEpisodeData();
            triggerVideoHunt();
        }
    }

    // 重置狀態的 Helper (給換集數時用)
    function resetStateForNewEpisode() {
        // 清除舊的計時器
        if (state.huntTimer) clearInterval(state.huntTimer);
        if (state.statusTimeout) clearTimeout(state.statusTimeout);
        
        // 重置數據
        state.rules = [];
        state.activeRule = null;
        state.userStatus = null;
        state.bahaSn = null;
        state.candidate = null;
        
        // 重置旗標
        state.hasSynced = false;
        state.isHunting = false;
        state.stopSync = false;       // 換新的一集，給它新的機會嘗試同步
        state.tokenErrorCount = 0;    // 重置錯誤計數
        
        state.huntTimer = null;
        state.statusTimeout = null;
        state.isAutoBinding = false;
        
        console.log("狀態已重置，準備載入新集數...");
    }

    function triggerVideoHunt() {
        if (state.isHunting) return;
        state.isHunting = true;
        if (state.rules.length > 0) updateNavStatus("syncing", "搜尋播放器...");
        if (state.huntTimer) clearInterval(state.huntTimer);
        let attempts = 0;
        state.huntTimer = setInterval(() => {
            const video = document.querySelector("video");
            attempts++;
            if (video && video.dataset.alHooked !== state.currentUrlSn) {
                video.dataset.alHooked = state.currentUrlSn;
                video.addEventListener("timeupdate", handleTimeUpdate);
                clearInterval(state.huntTimer);
                state.isHunting = false;
                if (state.rules.length > 0) updateNavStatus("bound");
            } else if (attempts >= 50) {
                clearInterval(state.huntTimer);
                state.isHunting = false;
            }
        }, 200);
    }

    function handleTimeUpdate(e) {
        // 增加 !state.stopSync 判斷，如果發生嚴重錯誤就停止嘗試
        if (!state.hasSynced && !state.stopSync && e.target.currentTime > CONFIG.UPDATE_THRESHOLD) {
            if (state.rules.length > 0) {
                state.hasSynced = true;
                syncProgress();
            }
        }
    }

    // ================= 資料處理 =================
    function getAcgLink() {
        let el = $(SELECTORS.acgLink);
        if (el.length === 0) el = $(SELECTORS.acgLinkAlt);
        return el.length > 0 ? el.attr("href") : null;
    }

    async function initEpisodeData() {
        const acgLink = getAcgLink();
        if (!acgLink) return;
        state.bahaSn = new URLSearchParams(acgLink.split("?")[1]).get("s");
        const savedData = GM_getValue(`baha_acg_${state.bahaSn}`);

        if (savedData) {
            if (Array.isArray(savedData)) {
                state.rules = savedData.sort((a, b) => b.start - a.start);
            } else if (typeof savedData === "object" && savedData.id) {
                state.rules = [{ start: 1, id: savedData.id, title: savedData.title }];
            } else {
                try {
                    const info = await fetchAnimeInfo(savedData);
                    const title = info.title.native || info.title.romaji;
                    state.rules = [{ start: 1, id: savedData, title: title }];
                } catch (e) {
                    console.error(e);
                }
            }
            determineActiveRule();
        } else {
            state.rules = [];
            state.activeRule = null;
            if(state.token) tryAutoBind();
        }

        if (state.activeRule) {
            fetchUserStatus(state.activeRule.id).then((statusData) => {
                state.userStatus = statusData;
                refreshUIState();
            });
        }
        refreshUIState();
    }

    // ================= 自動綁定邏輯 =================
    async function tryAutoBind() {
        if (state.isAutoBinding) return;
        state.isAutoBinding = true;
        state.candidate = null;
        updateNavStatus("syncing", "嘗試自動匹配...");

        const acgLink = getAcgLink();
        if (!acgLink) {
            updateNavStatus("unbound");
            state.isAutoBinding = false;
            return;
        }

        try {
            const html = await gmGet(acgLink);
            const $doc = $(new DOMParser().parseFromString(html, "text/html"));

            const h2s = $doc.find(SELECTORS.infoTitle);
            const nameJp = h2s.eq(0).text().trim();
            const nameEn = h2s.eq(1).text().trim();

            const dateJpText = $doc.find(SELECTORS.infoList + ':contains("當地")').text();
            const dateTwText = $doc.find(SELECTORS.infoList + ':contains("台灣")').text();
            const dateJpStr = dateJpText ? dateJpText.split("：")[1] : "";
            const dateTwStr = dateTwText ? dateTwText.split("：")[1] : "";

            const parseDate = (str) => {
                if (!str) return null;
                const match = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                if (match) return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) };
                return null;
            };

            const bahaDateJP = parseDate(dateJpStr);
            const bahaDateTW = parseDate(dateTwStr);

            const isDateCloseEnough = (target, check) => {
                if (!target || !check || !check.year || !check.month || !check.day) return false;
                const t = new Date(target.year, target.month - 1, target.day);
                const c = new Date(check.year, check.month - 1, check.day);
                const diffTime = Math.abs(c - t);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays <= CONFIG.DATE_TOLERANCE;
            };

            let searchTerms = [nameEn, nameJp].filter((t) => t);
            let matchFound = null;

            for (let term of searchTerms) {
                try {
                    const result = await searchAniList(term);
                    const candidates = result.data.Page.media || [];

                    if (candidates.length > 0 && !state.candidate) {
                        state.candidate = candidates[0];
                    }

                    for (let media of candidates) {
                        const anilistDate = media.startDate;
                        if (!anilistDate.year || !anilistDate.month || !anilistDate.day) continue;

                        const isMatchJP = isDateCloseEnough(bahaDateJP, anilistDate);
                        const isMatchTW = isDateCloseEnough(bahaDateTW, anilistDate);

                        if (isMatchJP || isMatchTW) {
                            matchFound = media;
                            break;
                        }
                    }
                } catch (e) {
                    console.error("[Auto-Bind] Search Error:", e);
                }
                if (matchFound) break;
            }

            if (matchFound) {
                const title = matchFound.title.native || matchFound.title.romaji;
                console.log(`[Auto-Bind] Match found: ${title} (ID: ${matchFound.id})`);
                await performBinding(matchFound.id, title);
            } else {
                updateNavStatus("unbound");
                if (state.candidate) {
                    showToast('🧐 找到可能的作品，請點擊上方按鈕確認');
                } else {
                    showToast('⚠️ 找不到自動匹配結果，請手動綁定');
                }
            }
        } catch (e) {
            console.error("[Auto-Bind] Error:", e);
            updateNavStatus("unbound");
        } finally {
            state.isAutoBinding = false;
        }
    }

    function determineActiveRule() {
        if (state.rules.length === 0) {
            state.activeRule = null;
            return;
        }
        const currentEp = getCurrentEpisode();
        if (currentEp) {
            state.activeRule = state.rules.find((r) => currentEp >= r.start) || state.rules[state.rules.length - 1];
        } else {
            state.activeRule = state.rules[state.rules.length - 1];
        }
    }

    function getCurrentEpisode() {
        const seasonList = $(SELECTORS.seasonList);
        if (seasonList.length > 0) {
            const currentEpLi = seasonList.filter(SELECTORS.playing);
            if (currentEpLi.length === 0) return null;
            return seasonList.index(currentEpLi) + 1;
        }
        return 1;
    }

    async function syncProgress() {
        const episode = getCurrentEpisode();
        if (!episode) return;
        determineActiveRule();
        const rule = state.activeRule;
        if (!rule) {
            updateNavStatus("error", "無匹配規則");
            return;
        }
        const progress = episode - rule.start + 1;
        updateNavStatus("syncing", `同步 Ep.${progress}...`);
        try {
            const checkData = await fetchUserStatus(rule.id);
            state.userStatus = checkData;
            if (checkData?.status === "COMPLETED") {
                updateNavStatus("info", "略過同步");
                return;
            }
            const mutation = `mutation ($id: Int, $p: Int) { SaveMediaListEntry (mediaId: $id, progress: $p) { id progress status } }`;
            const result = await aniListRequest(mutation, { id: rule.id, p: progress });
            state.userStatus = result.data.SaveMediaListEntry;
            updateNavStatus("done", `已同步第 ${episode} 集`);
        } catch (e) {
            console.error("[Sync] Error:", e);
            updateNavStatus("error", "同步失敗");
            const errStr = String(e); // 確保是字串方便比對

            if (errStr.includes("Too Many Requests")) {
                state.stopSync = true; 
                showToast("⚠️ 請求過於頻繁 (429)，已停止本頁面同步");
            } 
            else if (errStr.includes("Invalid token") || errStr.includes("Invalid access token")) {
                state.tokenErrorCount++;
                if (state.tokenErrorCount >= 3) {
                    state.stopSync = true; // 錯誤超過 3 次，停止
                    showToast("⚠️ Token 無效，已停止嘗試。請檢查設定。");
                    updateNavStatus("token_error"); 
                } else {
                    state.hasSynced = false;
                }
            } 
            else {
                state.hasSynced = false; 
            }
        }
    }

    // ================= UI Helper =================
    function refreshUIState() {
        if (!state.token) {
            updateNavStatus("token_error");
        } else if (state.rules.length === 0) {
            if (!state.isAutoBinding) updateNavStatus("unbound");
        } else updateNavStatus("bound");
    }

    function showToast(msg) {
        const t = $(`<div class="al-toast">${msg}</div>`).appendTo("body");
        setTimeout(() => t.remove(), 3000);
    }

    function updateNavStatus(type, msg) {
        const icon = $("#al-icon");
        const text = $("#al-text");
        const titleSpan = $("#al-title");
        if (!icon.length) return;
        if (state.statusTimeout) {
            clearTimeout(state.statusTimeout);
            state.statusTimeout = null;
        }

        const showTitle = state.activeRule && (type === "bound" || type === "syncing" || type === "done" || type === "info");

        if (showTitle) {
            titleSpan.text(state.activeRule.title).css("display", "inline-block");
        } else {
            titleSpan.hide();
        }

        if (showTitle && state.userStatus) {
            let statusText = "";
            const s = state.userStatus.status;
            const p = state.userStatus.progress;
            if (s === "CURRENT") statusText = `📺 目前觀看`;
            else if (s === "COMPLETED") statusText = `🎉 已看完`;
            else if (s === "PLANNING") statusText = `📅 計畫中`;
            else if (s === "DROPPED") statusText = `🗑️ 棄番`;
            else if (s === "PAUSED") statusText = `⏸️ 暫停`;
            if (p > 0) statusText += `【Ep.${p}】`;
            if (statusText) {
                if ($("#al-user-status").length === 0) $("#al-text").after('<span id="al-user-status" class="al-user-status"></span>');
                $("#al-user-status").text(statusText).css("display", "inline-block");
            }
        } else {
            $("#al-user-status").hide();
        }

        if (type === "token_error") {
            icon.text("⚠️");
            text.text("設定 Token");
        } else if (type === "unbound") {
            icon.text("🔗");
            text.text("連結 AniList");
        } else if (type === "bound") {
            icon.text("✅");
            text.text("已連動");
        } else if (type === "syncing") {
            icon.text("🔄");
            text.text(msg);
        } else if (type === "done") {
            icon.text("✅");
            text.text(msg);
            state.statusTimeout = setTimeout(() => {
                icon.text("✅");
                text.text("已連動");
                if (state.activeRule) titleSpan.text(state.activeRule.title).show();
                if (state.userStatus && $("#al-user-status").length) $("#al-user-status").show();
            }, 1500);
        } else if (type === "error") {
            icon.text("❌");
            text.text(msg);
        } else if (type === "info") {
            icon.text("ℹ️");
            text.text(msg);
        }
    }

    function formatDate(dateObj) {
        if (!dateObj || !dateObj.year) return "日期未定";
        return `${dateObj.year}/${String(dateObj.month || 1).padStart(2, "0")}/${String(dateObj.day || 1).padStart(2, "0")}`;
    }

    // ================= Manager UI & Tabs =================
    function handleNavClick() {
        if(!location.href.includes("animeVideo.php")) {
             showUIManager("settings");
             return;
        }

        if(!state.token) {
            showUIManager("settings");
        } else if (state.rules.length === 0) {
            showUIManager("home");
        } else {
            showUIManager("home");
        }
    }

    function showUIManager(activeTabId = "home") {
        $("#al-modal").fadeIn(200).css("display", "flex");
        const body = $("#al-modal-body");

		const isVideoPage = location.href.includes("animeVideo.php");
        
		body.html(`
            <div class="al-tabs-header">
                <button class="al-tab-btn ${activeTabId === 'home' ? 'active' : ''}" data-tab="home" ${!isVideoPage ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>主頁 / 狀態</button>
                <button class="al-tab-btn ${activeTabId === 'series' ? 'active' : ''}" data-tab="series" ${state.rules.length === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>系列設定</button>
                <button class="al-tab-btn ${activeTabId === 'settings' ? 'active' : ''}" data-tab="settings">設定</button>
            </div>
            <div id="al-tab-content-home" class="al-tab-content ${activeTabId === 'home' ? 'active' : ''}"></div>
            <div id="al-tab-content-series" class="al-tab-content ${activeTabId === 'series' ? 'active' : ''}"></div>
            <div id="al-tab-content-settings" class="al-tab-content ${activeTabId === 'settings' ? 'active' : ''}"></div>
        `);

        loadTabContent("home");
        loadTabContent("series");
        loadTabContent("settings");

        $(".al-tab-btn").click(function() {
            if($(this).attr("disabled")) return;
            $(".al-tab-btn").removeClass("active");
            $(this).addClass("active");
            $(".al-tab-content").removeClass("active");
            $(`#al-tab-content-${$(this).data("tab")}`).addClass("active");
        });
        
        $("#al-modal-footer").empty();
    }

    async function loadTabContent(tab) {
        const container = $(`#al-tab-content-${tab}`);
        
        if (tab === "settings") {
            renderTabSettings(container);
        } else if (tab === "home") {
            if (state.rules.length > 0) {
                await renderTabHomeBound(container);
            } else {
                renderTabHomeUnbound(container);
            }
        } else if (tab === "series") {
            if (state.rules.length > 0) {
                renderTabSeries(container);
            } else {
                container.html('<div style="padding:20px;text-align:center;color:#999;">請先綁定作品後再設定系列</div>');
            }
        }
    }

    // --- Tab: Settings (Token) ---
    function renderTabSettings(container) {
        let savedClientId = GM_getValue("ANILIST_CLIENT_ID", "22337");

        const iconEye = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="#ccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        const iconEyeOff = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="#ccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07-2.3 2.3"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

        container.html(`
            <div class="al-settings-box">
                <label class="al-settings-label">AniList Access Token</label>
                
                <div class="al-input-group">
                    <input type="password" id="al-setting-token" class="al-input" style="flex:1;" placeholder="請貼上 Token" value="${state.token || ''}">
                    <button id="al-toggle-token" class="al-bind-btn al-icon-btn" title="顯示/隱藏 Token">
                        ${iconEye}
                    </button>
                </div>
                <button id="al-save-token" class="al-btn-green" style="margin-top:10px;">儲存設定</button>
                <div class="al-step-card">
                    <p class="al-step-title">如何取得 Token?</p>

                    <div class="al-step-item">
                        <span class="al-step-num">1.</span>
                        <div class="al-step-content">
                            前往 <a href="https://anilist.co/settings/developer" target="_blank" class="al-link">AniList 開發者功能</a> 登入後，新增 API Client
                        </div>
                    </div>

                    <div class="al-step-item">
                        <span class="al-step-num">2.</span>
                        <div class="al-step-content">
                            <div>輸入 Client ID，並點擊授權：</div>
                            <div class="al-step-action-row">
                                <input type="text" id="al-client-id" class="al-input al-id-input" value="${savedClientId}" placeholder="ID" maxlength="10">
                                <a id="al-auth-link" href="#" target="_blank" class="al-auth-btn disabled">
                                    前往授權頁面 ↗
                                </a>
                            </div>
                        </div>
                    </div>
                    
                    <div class="al-step-item">
                        <span class="al-step-num">3.</span>
                        <div class="al-step-content">
                            點擊 Authorize，將 Access Token 複製貼回上方
                        </div>
                    </div>
                </div>
            </div>
        `);

        // --- 邏輯處理 ---

        function updateAuthLink() {
            const input = $("#al-client-id");
            const btn = $("#al-auth-link");
            
            let val = input.val().replace(/\D/g, ''); 
            if (val !== input.val()) input.val(val);

            if (val.length > 0) {
                // [修改點] 使用 class 切換樣式，而非直接操作 css
                const url = `https://anilist.co/api/v2/oauth/authorize?client_id=${val}&response_type=token`;
                btn.attr("href", url);
                btn.removeClass("disabled").addClass("active");
                GM_setValue("ANILIST_CLIENT_ID", val);
            } else {
                btn.attr("href", "javascript:void(0)");
                btn.removeClass("active").addClass("disabled");
            }
        }

        $("#al-client-id").on("input", updateAuthLink);
        updateAuthLink();

        $("#al-toggle-token").click(function() {
            const input = $("#al-setting-token");
            const isPassword = input.attr("type") === "password";
            if (isPassword) {
                input.attr("type", "text");
                $(this).html(iconEyeOff);
            } else {
                input.attr("type", "password");
                $(this).html(iconEye);
            }
        });

        $("#al-save-token").click(() => {
            const t = $("#al-setting-token").val().trim();
            if(t) {
                GM_setValue("ANILIST_TOKEN", (state.token = t));
                showToast("Token 已儲存！將重新整理頁面");
                setTimeout(() => location.reload(), 1000);
            }
        });
    }

    // --- Tab: Home (已綁定) ---
    async function renderTabHomeBound(container) {
        const rule = state.activeRule || state.rules[0];
        container.html('<div style="text-align:center;padding:20px;">讀取中...</div>');
        
        try {
            const info = await fetchAnimeInfo(rule.id);
            const userStat = await fetchUserStatus(rule.id);
            const aniLink = `https://anilist.co/anime/${rule.id}`;
            
            const currentStatus = userStat ? userStat.status : "PLANNING";
            const statusMap = {
                CURRENT: "Watching (觀看中)",
                PLANNING: "Plan to Watch (計畫中)",
                COMPLETED: "Completed (已看完)",
                REPEATING: "Rewatching (重看中)",
                PAUSED: "Paused (暫停)",
                DROPPED: "Dropped (棄番)",
            };
            let statusOptions = "";
            for (let key in statusMap) {
                statusOptions += `<option value="${key}" ${currentStatus === key ? "selected" : ""}>${statusMap[key]}</option>`;
            }

            container.html(`
                <div style="padding:15px;">
                    <div class="al-result-item al-current-info">
                        <a href="${aniLink}" target="_blank" style="display:block;cursor:pointer;">
                            <img src="${info.coverImage.medium}" style="width:60px;height:90px;object-fit:cover;border-radius:4px;">
                        </a>
                        <div style="flex:1">
                            <a href="${aniLink}" target="_blank" class="al-link" style="font-size:15px; display:block;">${rule.title}</a>
                            <div style="font-size:12px;color:#aaa; margin-top:3px;">ID: ${rule.id} | 開播: ${formatDate(info.startDate)}</div>
                            <div style="margin-top:5px;font-size:12px;color:#4caf50;">AniList 進度: Ep.${userStat?.progress || 0}</div>
                        </div>
                    </div>

                    <div style="margin-bottom:15px;">
                        <label style="font-weight:bold; font-size:13px; color:#ccc;">切換狀態:</label>
                        <select id="al-status-select" class="al-input" style="width:100%; margin-top:5px; cursor:pointer;">${statusOptions}</select>
                    </div>

                    <div style="margin-top:15px; border-top:1px solid #333; padding-top:10px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold; font-size:13px; color:#ccc;">手動修改 ID:</label>
                        <div class="al-input-group">
                            <input type="number" id="al-edit-id" class="al-input" value="${rule.id}">
                            <button id="al-save-id" class="al-bind-btn" style="background:#555;">更新</button>
                        </div>
                    </div>
                    <button id="al-unbind" class="al-btn-grey">解除所有綁定</button>
                </div>
            `);

            $("#al-status-select").change(async function () {
                const newStatus = $(this).val();
                $(this).prop("disabled", true);
                try {
                    await updateAnimeStatus(rule.id, newStatus);
                    showToast(`狀態已更新`);
                } catch (e) { alert("更新失敗：" + e); }
                $(this).prop("disabled", false);
            });

            $("#al-save-id").click(async () => {
                 const nid = parseInt($("#al-edit-id").val());
                 if (nid) await performBinding(nid, "手動更新");
            });

            $("#al-unbind").click(function () {
                if (confirm("確定要解除此作品的所有綁定嗎？")) {
                    GM_deleteValue(`baha_acg_${state.bahaSn}`);
                    location.reload();
                }
            });

        } catch(e) {
            container.html(`Error: ${e}`);
        }
    }

    // --- Tab: Home (未綁定/搜尋) ---
    async function renderTabHomeUnbound(container) {
        container.empty();
        
        if (state.candidate) {
            const c = state.candidate;
            const title = c.title.native || c.title.romaji;
            const dateStr = formatDate(c.startDate);
            const aniLink = `https://anilist.co/anime/${c.id}`;
            
            container.append(`
                <div style="padding:15px 15px 0 15px;">
                    <div style="font-weight:bold; color:#ffb74d; margin-bottom:5px; font-size:13px;">💡 自動匹配失敗，但我們找到了這個：</div>
                    <div class="al-candidate-box">
                         <a href="${aniLink}" target="_blank"><img src="${c.coverImage.medium}" style="width:50px;height:75px;object-fit:cover;border-radius:4px;"></a>
                         <div style="flex:1;">
                            <a href="${aniLink}" target="_blank" class="al-link">${title}</a>
                            <div style="font-size:12px;color:#aaa;">${c.title.romaji}</div>
                            <div style="font-size:12px;color:#666;">${dateStr}</div>
                         </div>
                         <button class="al-bind-btn" id="al-quick-bind">是這部，綁定！</button>
                    </div>
                    <div style="text-align:center; font-size:12px; color:#666; margin-bottom:10px;">或使用下方搜尋</div>
                    <hr style="border:0; border-top:1px solid #333;">
                </div>
            `);
            
            $("#al-quick-bind").click(() => performBinding(c.id, title));
        }

        const acgLink = getAcgLink();
        if(acgLink) {
             try {
                const html = await gmGet(acgLink);
                const $doc = $(new DOMParser().parseFromString(html, "text/html"));
                const h2s = $doc.find(SELECTORS.infoTitle);
                const nameJp = h2s.eq(0).text().trim();
                const nameEn = h2s.eq(1).text().trim();
                
                container.append(`
                    <div style="padding:15px;">
                         <div class="al-ext-search-group">
                            <span class="al-ext-label" style="color:#aaa;">外部搜尋 👉</span>
                            <div>
                                <a href="https://anilist.co/search/anime?search=${encodeURIComponent(nameEn)}" target="_blank" class="al-btn-ext">Search EN ↗</a>
                                <a href="https://anilist.co/search/anime?search=${encodeURIComponent(nameJp)}" target="_blank" class="al-btn-ext">Search JP ↗</a>
                            </div>
                        </div>
                        <div style="margin-top:15px;">
                            <div class="al-input-group">
                                <input type="text" id="al-search-input" class="al-input" placeholder="輸入動畫名稱搜尋..." value="${nameJp}">
                                <button id="al-search-btn" class="al-bind-btn">搜尋</button>
                            </div>
                        </div>
                        <div id="al-search-results" style="margin-top:15px;"></div>
                    </div>
                `);

                const doSearch = async () => {
                    const term = $("#al-search-input").val();
                    $("#al-search-results").html('<div style="text-align:center;color:#666;">搜尋中...</div>');
                    try {
                        const d = await searchAniList(term);
                        const list = d.data.Page.media;
                        renderSearchResults(list, $("#al-search-results"));
                    } catch(e) {
                         $("#al-search-results").html(`<div style="color:red;">搜尋失敗: ${e}</div>`);
                    }
                };

                $("#al-search-btn").click(doSearch);
                $("#al-search-input").keypress((e) => { if(e.which == 13) doSearch(); });
                doSearch();

             } catch(e) {
                 container.append(`<div style="padding:20px;">無法讀取頁面資訊: ${e}</div>`);
             }
        }
    }

    function renderSearchResults(list, targetDiv) {
        targetDiv.empty();
        if (!list.length) {
            targetDiv.html('<div style="text-align:center;padding:20px;color:#666;">找不到結果</div>');
            return;
        }
        list.forEach((m) => {
            const title = m.title.native || m.title.romaji;
            const dateStr = formatDate(m.startDate);
            const aniLink = `https://anilist.co/anime/${m.id}`;
            const epText = m.episodes ? `${m.episodes} 集` : '連載中';
            
            targetDiv.append(`
                <div class="al-result-item">
                    <a href="${aniLink}" target="_blank"><img src="${m.coverImage.medium}" style="width:45px;height:65px;object-fit:cover;border-radius:4px;"></a>
                    <div style="flex:1">
                        <a href="${aniLink}" target="_blank" class="al-link">${title}</a>
                        <div style="font-size:11px;color:#aaa;">${m.title.romaji}</div>
                        <div style="font-size:12px;color:#666;">${m.format} | ${epText} | ${dateStr}</div>
                    </div>
                    <button class="al-bind-btn search-res-bind" data-id="${m.id}" data-title="${title}">綁定</button>
                </div>
            `);
        });
        $(".search-res-bind").click(function() {
            performBinding($(this).data("id"), $(this).data("title"));
        });
    }

    // --- Tab: Series (系列設定) ---
    async function renderTabSeries(container) {
        container.html('<div style="padding:20px;text-align:center;">正在讀取系列關聯 (GraphQL)...<br>請稍候</div>');
        let baseId = state.rules.length > 0 ? state.rules[state.rules.length - 1].id : null;
        if(!baseId) return;

        try {
            const chain = await fetchSequelChain(baseId);
            chain.forEach((media, index) => {
                if (index === 0) media.suggestedStart = 1;
                else {
                    const prev = chain[index - 1];
                    const prevEpCount = prev.episodes || 12; 
                    media.suggestedStart = prev.suggestedStart + prevEpCount;
                }
            });

            let html = `
                <div style="padding:15px;">
                    <div style="margin-bottom:10px;color:#aaa;font-size:12px;">
                        <strong>橘色底為系統自動推算的集數，請確認後按「套用」。</strong>
                    </div>
                    <table class="al-map-table">
                        <thead><tr><th>狀態</th><th>作品名稱 (AniList)</th><th style="width:40px;">集數</th><th style="width:60px;">起始集</th><th style="width:70px;">操作</th></tr></thead>
                        <tbody>
            `;

            chain.forEach((media) => {
                const existingRule = state.rules.find((r) => r.id === media.id);
                const isActive = !!existingRule;
                const isNewButAutoCalculated = !isActive && media.suggestedStart > 1;
                const rowClass = isActive ? "active" : (isNewButAutoCalculated ? "suggestion" : "");
                const statusText = isActive ? "✅ 使用中" : (isNewButAutoCalculated ? "💡 建議" : "⚪ 未設定");
                const inputValue = existingRule ? existingRule.start : media.suggestedStart;
                const dateStr = formatDate(media.startDate);
                const aniLink = `https://anilist.co/anime/${media.id}`;
                const btnLabel = isActive ? "✖️ 取消" : (isNewButAutoCalculated ? "➕ 套用" : "➕ 啟用");
                const btnClass = isActive ? "disable" : "enable";

                html += `
                    <tr class="al-map-row ${rowClass}" data-id="${media.id}" data-title="${media.title.native || media.title.romaji}">
                        <td class="status-cell"><span class="status-text">${statusText}</span><input type="checkbox" class="al-checkbox" ${isActive ? "checked" : ""}></td>
                        <td>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <a href="${aniLink}" target="_blank" style="flex-shrink:0;">
                                <img src="${media.coverImage.medium}" style="width:40px;height:60px;object-fit:cover;border-radius:4px; display:block;">
                            </a>
                            <a href="${aniLink}" target="_blank" class="al-link" style="font-size:13px;">${media.title.native || media.title.romaji}</a>
                            <div style="color:#888;font-size:11px;">${dateStr}</div>
                        </td>
                        <td>${media.episodes || "?"}</td>
                        <td><input type="number" class="al-map-input" placeholder="-" value="${inputValue}"></td>
                        <td><button class="al-btn-toggle ${btnClass}" data-suggested="${media.suggestedStart}">${btnLabel}</button></td>
                    </tr>
                `;
            });
            html += `</tbody></table>
                     <button id="al-save-map" class="al-bind-btn" style="width:100%;padding:10px;font-size:14px; margin-top:15px;">儲存系列設定</button>
                     </div>`;
            
            container.html(html);

            $(".al-map-input").on("input", function () { updateRowStatus($(this).closest("tr"), $(this).val()); });
            $(".al-btn-toggle").click(function () {
                const row = $(this).closest("tr");
                const input = row.find(".al-map-input");
                if ($(this).hasClass("enable")) input.val($(this).data("suggested")).trigger("input");
                else input.val("").trigger("input");
            });
            $("#al-save-map").click(() => saveSeriesMapping());

        } catch(e) {
            container.html(`<div style="color:red;padding:20px;">載入失敗: ${e}</div>`);
        }
    }

    function updateRowStatus(row, val) {
        const checkbox = row.find(".al-checkbox");
        const statusSpan = row.find(".status-text");
        const btn = row.find(".al-btn-toggle");

        if (val && val.trim() !== "") {
            checkbox.prop("checked", true);
            row.addClass("active").removeClass("suggestion");
            statusSpan.text("✅ 準備儲存").css("color", "#66bb6a");
            btn.removeClass("enable").addClass("disable").text("✖️ 取消");
        } else {
            checkbox.prop("checked", false);
            row.removeClass("active");
            statusSpan.text("⚪ 未設定").css("color", "#777");
            btn.removeClass("disable").addClass("enable").text("➕ 啟用");
        }
    }

    function saveSeriesMapping() {
        let newRules = [];
        $(".al-map-row").each(function () {
            const row = $(this);
            if (row.find(".al-checkbox").is(":checked")) {
                const startVal = parseInt(row.find(".al-map-input").val());
                if (startVal) {
                    newRules.push({ start: startVal, id: row.data("id"), title: row.data("title") });
                }
            }
        });
        if (newRules.length === 0) return alert("請至少設定一部作品的起始集數");
        newRules.sort((a, b) => b.start - a.start);
        state.rules = newRules;
        GM_setValue(`baha_acg_${state.bahaSn}`, newRules);
        determineActiveRule();
        if (state.activeRule)
            fetchUserStatus(state.activeRule.id).then((s) => {
                state.userStatus = s;
                refreshUIState();
            });
        $("#al-modal").fadeOut(200);
        state.hasSynced = false;
        showToast("系列設定已儲存！");
    }

    // ================= API & Core Actions =================
    async function fetchSequelChain(startId) {
        const mediaFields = `id title { romaji native } coverImage { medium } format episodes startDate { year month day }`;
        const query = `
        query ($id: Int) {
          Media(id: $id) { 
            ${mediaFields} 
            relations { 
                edges { 
                    relationType(version: 2) 
                    node { 
                        ${mediaFields} 
                        relations { 
                            edges { 
                                relationType(version: 2) 
                                node { 
                                    ${mediaFields} 
                                    relations { 
                                        edges { 
                                            relationType(version: 2) 
                                            node { 
                                                ${mediaFields} 
                                            } 
                                        } 
                                    } 
                                } 
                            } 
                        } 
                    } 
                } 
            } 
          }
        }
        `;
        const response = await aniListRequest(query, { id: startId });
        const root = response.data.Media;

        const isMovie = root.format === 'MOVIE';
        const targetFormats = isMovie ? ['MOVIE'] : ['TV', 'ONA', 'OVA'];
        
        let chain = [];
        let current = root;
        const visited = new Set();
        while (current) {
            if (visited.has(current.id)) break;
            visited.add(current.id);
            chain.push(current);
            if (current.relations && current.relations.edges) {
                const sequelEdge = current.relations.edges.find((e) => e.relationType === "SEQUEL" && targetFormats.includes(e.node.format));
                current = sequelEdge ? sequelEdge.node : null;
            } else current = null;
        }
        return chain;
    }

    async function performBinding(id, title) {
        if (title === "手動更新" || title === "手動輸入") {
            const info = await fetchAnimeInfo(id);
            title = info.title.native || info.title.romaji;
        }
        const newRule = { start: 1, id: id, title: title };
        state.rules = [newRule];
        GM_setValue(`baha_acg_${state.bahaSn}`, state.rules);
        determineActiveRule();
        state.userStatus = await fetchUserStatus(id);
        refreshUIState();
        $("#al-modal").fadeOut(200);
        state.hasSynced = false;
        showToast("綁定成功！");
        if (!state.isHunting) syncProgress();
    }

    function waitForNavbar() {
        const t = setInterval(() => {
            const nav = $('ul:has(a[href="index.php"])').first();
            if (nav.length) {
                clearInterval(t);
                initNavbar(nav);
                refreshUIState();
            }
        }, 500);
    }

    function initNavbar(nav) {
        if ($("#al-trigger").length) return;
        nav.append(`<li class="al-nav-item"><a class="al-nav-link" id="al-trigger" title="點擊設定"><span id="al-icon">⚪</span><span id="al-text">AniList</span><span id="al-title" class="al-nav-title" style="display:none;"></span></a></li>`);
        $("#al-trigger").click(handleNavClick);
        $("body").append(`<div id="al-modal" class="al-modal-overlay"><div class="al-modal-content"><div class="al-modal-header"><strong style="font-size:16px;">AniList 設定</strong><button class="al-close-btn" onclick="$('#al-modal').fadeOut(200)">&times;</button></div><div class="al-modal-body" id="al-modal-body"></div><div class="al-modal-footer" id="al-modal-footer"></div></div></div>`);
    }

    function gmGet(url) {
        return new Promise((r, j) => GM_xmlhttpRequest({ method: "GET", url, onload: (x) => r(x.responseText), onerror: j }));
    }

    function fetchAnimeInfo(id) {
        const query = `query ($id: Int) { Media(id: $id) { id title { romaji native } coverImage { medium } seasonYear startDate { year month day } } }`;
        return aniListRequest(query, { id }).then((d) => d.data.Media);
    }

    function fetchUserStatus(id) {
        const query = `query ($id: Int) { Media(id: $id) { mediaListEntry { status progress } } }`;
        return aniListRequest(query, { id }).then((d) => d.data.Media.mediaListEntry);
    }

    function searchAniList(search) {
        return aniListRequest(`query($s:String){Page(page:1,perPage:10){media(search:$s,type:ANIME,sort:SEARCH_MATCH){id title{romaji english native}coverImage{medium} episodes seasonYear startDate { year month day } format}}}`, { s: search });
    }

    function updateAnimeStatus(id, status) {
        const mutation = `mutation ($id: Int, $status: MediaListStatus) { SaveMediaListEntry (mediaId: $id, status: $status) { id progress status } }`;
        return aniListRequest(mutation, { id: id, status: status }).then((d) => d.data.SaveMediaListEntry);
    }

    function deepSanitize(input) {
        if (typeof input === 'string') {
            return input
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
        if (Array.isArray(input)) {
            return input.map(deepSanitize); // 如果是陣列，每一個元素都拿去消毒
        }
        if (typeof input === 'object' && input !== null) {
            const newObj = {};
            for (const key in input) {
                newObj[key] = deepSanitize(input[key]); // 如果是物件，每一個屬性都拿去消毒
            }
            return newObj;
        }
        // 如果是數字、布林值、null，直接回傳
        return input;
    }

    function aniListRequest(query, variables) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", 
                url: "https://graphql.anilist.co",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + state.token },
                data: JSON.stringify({ query, variables }),
                onload: (r) => {
                    try {
                        const d = JSON.parse(r.responseText);
                        if (d.errors) {
                            reject(d.errors[0].message);
                        } else {
                            resolve(deepSanitize(d)); 
                        }
                    } catch (e) {
                        console.error(e);
                        reject("JSON 解析失敗");
                    }
                }, 
                onerror: reject,
            });
        });
    }

    setTimeout(main, 500);
})();