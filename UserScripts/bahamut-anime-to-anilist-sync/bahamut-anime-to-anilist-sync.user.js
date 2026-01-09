// ==UserScript==
// @name         Bahamut Anime to AniList Sync
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      6.0
// @description  巴哈姆特動畫瘋同步到 AniList。支援系列設定、自動計算集數、自動日期匹配、深色模式UI
// @author       downwarjers
// @license      MIT
// @match        https://ani.gamer.com.tw/*
// @connect      acg.gamer.com.tw
// @connect      graphql.anilist.co
// @icon         https://ani.gamer.com.tw/apple-touch-icon-144.jpg
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

    // ================= [Constants] 常數管理 =================
    const CONSTANTS = {
        API_URL: "https://graphql.anilist.co",
        SYNC_DEBOUNCE_MS: 2000,
        MATCH_TOLERANCE_DAYS: 2,
        SEARCH_RANGE_DAYS: 10,
        STORAGE_PREFIX: "baha_acg_",
        SYNC_ON_BIND: false, 
        KEYS: {
            TOKEN: "ANILIST_TOKEN",
            CLIENT_ID: "ANILIST_CLIENT_ID",
            SYNC_MODE: "SYNC_MODE",
            CUSTOM_SEC: "SYNC_CUSTOM_SECONDS"
        },
        SELECTORS: {
            infoTitle: ".ACG-info-container > h2",
            infoList: ".ACG-box1listA > li",
            seasonList: ".season ul li",
            playing: ".playing",
            acgLink: 'a[href*="acgDetail.php"]',
            acgLinkAlt: 'a:contains("作品資料")',
            videoElement: "video",
        },
        STATUS: {
            TOKEN_ERROR: "token_error",
            UNBOUND: "unbound",
            BOUND: "bound",
            SYNCING: "syncing",
            DONE: "done",
            ERROR: "error",
            INFO: "info"
        },
        SYNC_MODES: {
            INSTANT: "instant",
            TWO_MIN: "2min",
            EIGHTY_PCT: "80pct",
            CUSTOM: "custom"
        }
    };

    // ================= [GraphQL] 查詢字串 =================
    const GQL = {
        MEDIA_FIELDS: `id title { romaji native } coverImage { medium } format episodes seasonYear startDate { year month day }`,
        SEARCH: `query($s:String){Page(page:1,perPage:10){media(search:$s,type:ANIME,sort:SEARCH_MATCH){id title{romaji english native}coverImage{medium} episodes seasonYear startDate{year month day} format externalLinks{url site}}}}`,
        SEARCH_RANGE: `query ($start:FuzzyDateInt,$end:FuzzyDateInt){Page(page:1,perPage:100){media(startDate_greater:$start,startDate_lesser:$end,type:ANIME,format_in:[MOVIE]){id title{romaji native}startDate{year month day}externalLinks{url site}}}}`,
        GET_MEDIA: `query ($id:Int){Media(id:$id){id title{romaji native}coverImage{medium}seasonYear episodes startDate{year month day} format }}`,
        GET_USER_STATUS: `query ($id:Int){Media(id:$id){mediaListEntry{status progress}}}`,
        UPDATE_PROGRESS: `mutation ($id:Int,$p:Int){SaveMediaListEntry(mediaId:$id,progress:$p){id progress status}}`,
        UPDATE_STATUS: `mutation ($id:Int,$status:MediaListStatus){SaveMediaListEntry(mediaId:$id,status:$status){id progress status}}`,
        SEQUEL_CHAIN: (fields) => `
            query ($id: Int) {
                Media(id: $id) { ${fields} relations { edges { relationType(version: 2) node { ${fields} relations { edges { relationType(version: 2) node { ${fields} relations { edges { relationType(version: 2) node { ${fields} } } } } } } } } } } }
        `
    };

    // ================= [Styles] CSS =================
    GM_addStyle(`
        .al-nav-item { margin-left: 10px; padding-left: 10px; border-left: 1px solid #555; display: inline-flex; height: 100%; vertical-align: middle; }
        .al-nav-link { color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 13px; text-decoration: none !important; transition: 0.2s; }
        .al-nav-link:hover { color: #fff; }
        .al-nav-title { color: #888; font-size: 12px; margin-left: 8px; padding-left: 8px; border-left: 1px solid #666; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .al-user-status { color: #4caf50; font-size: 12px; margin-left: 8px; padding-left: 8px; border-left: 1px solid #666; display: none; }
        @media (max-width: 1200px) { .al-nav-title { max-width: 150px; } }
        @media (max-width: 768px) { .al-nav-title, .al-user-status { display: none; } }
        .al-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; display: none; justify-content: center; align-items: center; }
        .al-modal-content { background: #1b1b1b; color: #eee; width: 750px; max-height: 90vh; border-radius: 8px; display: flex; flex-direction: column; border: 1px solid #333; box-shadow: 0 10px 25px rgba(0,0,0,0.8); }
        .al-modal-header { padding: 15px; background: #222; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        .al-modal-body { overflow-y: auto; flex: 1; padding: 0; min-height: 300px; background: #1b1b1b; }
        .al-close-btn { color: #ff5252; font-weight: bold; font-size: 24px; background: none; border: none; cursor: pointer; }
        .al-tabs-header { display: flex; border-bottom: 1px solid #333; background: #222; }
        .al-tab-btn { flex: 1; padding: 12px; cursor: pointer; border: none; background: #222; color: #888; font-weight: bold; transition: 0.2s; border-bottom: 3px solid transparent;}
        .al-tab-btn:hover { background: #333; color: #3db4f2; }
        .al-tab-btn.active { color: #3db4f2; border-bottom-color: #3db4f2; background: #2a2a2a; }
        .al-tab-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .al-tab-content { display: none; padding: 15px; animation: al-fadein 0.2s; }
        .al-tab-content.active { display: block; }
        .al-bind-btn { background: #3db4f2; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; transition: 0.2s; }
        .al-bind-btn:hover { background: #2a9bd6; }
        .al-btn-grey { background: #d32f2f; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 15px; }
        .al-input { padding: 8px; border: 1px solid #555; border-radius: 4px; background: #333; color: #eee; width: 100%; box-sizing: border-box; }
        .al-input:focus { border-color: #3db4f2; outline: none; }
        .al-link { color: #81d4fa; text-decoration: none; font-weight: bold; }
        .al-link:hover { text-decoration: underline; }
        .al-result-item { padding: 12px; border-bottom: 1px solid #333; display: flex; gap: 15px; align-items: center; transition: background 0.2s; }
        .al-result-item:hover { background: #2a2a2a; }
        .al-map-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .al-map-table th { background: #2a2a2a; padding: 10px; text-align: left; border-bottom: 2px solid #444; color: #ccc; }
        .al-map-table td { padding: 8px; border-bottom: 1px solid #333; vertical-align: middle; }
        .series-row.active { background-color: #1b2e1b; }
        .series-row.suggestion { background-color: #3e3315; }
        .al-toggle-btn { font-size: 12px; padding: 5px 10px; border-radius: 4px; border: none; cursor: pointer; color: white; width: 100%; }
        .al-toggle-btn.enable { background-color: #388e3c; }
        .al-toggle-btn.disable { background-color: #d32f2f; }
        .al-step-card { font-size: 13px; color: #aaa; margin-top: 15px; background: #222; padding: 12px 15px; border-radius: 6px; border: 1px solid #333; }
        .al-step-title { margin: 0 0 10px 0; font-weight: bold; color: #eee; font-size: 14px; border-bottom: 1px solid #333; padding-bottom: 6px; }
        .al-step-item { display: flex; align-items: flex-start; margin-bottom: 8px; line-height: 1.6; }
        .al-step-num { flex-shrink: 0; width: 20px; font-weight: bold; color: #3db4f2; }
        .al-step-content { flex: 1; }
        .al-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(20,20,20,0.95); border: 1px solid #444; color: #fff; padding: 10px 20px; border-radius: 20px; z-index: 100000; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; }
        @keyframes al-fadein { from { opacity: 0; } to { opacity: 1; } }
    `);

    // ================= [Utils] 工具函式 =================
    const Utils = {
        deepSanitize(input) {
            if (typeof input === 'string') {
                return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
            }
            if (Array.isArray(input)) return input.map(Utils.deepSanitize);
            if (typeof input === 'object' && input !== null) {
                const newObj = {};
                for (const key in input) newObj[key] = Utils.deepSanitize(input[key]);
                return newObj;
            }
            return input;
        },
        jsDateToInt: (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(),
        dateToInt: (dObj) => (!dObj || !dObj.year) ? 0 : dObj.year * 10000 + (dObj.month || 1) * 100 + (dObj.day || 1),
        formatDate: (dObj) => (!dObj || !dObj.year) ? "日期未定" : `${dObj.year}/${String(dObj.month || 1).padStart(2, "0")}/${String(dObj.day || 1).padStart(2, "0")}`,
        getFuzzyDateRange(dateObj, toleranceDays) {
            if (!dateObj || !dateObj.year) return null;
            const target = new Date(dateObj.year, (dateObj.month || 1) - 1, dateObj.day || 1);
            const min = new Date(target); min.setDate(min.getDate() - toleranceDays);
            const max = new Date(target); max.setDate(max.getDate() + toleranceDays);
            return { start: this.jsDateToInt(min), end: this.jsDateToInt(max) };
        },
        isDateCloseEnough(targetObj, checkObj) {
            const range = this.getFuzzyDateRange(targetObj, CONSTANTS.MATCH_TOLERANCE_DAYS);
            if (!range || !checkObj || !checkObj.year) return false;
            const checkInt = this.dateToInt(checkObj);
            return checkInt >= range.start && checkInt <= range.end;
        },
        parseDateStr(str) {
            if (!str) return null;
            const match = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (match) return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) };
            return null;
        },
        extractDomain(url) {
            try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } 
            catch (e) {
                console.error(e);
                return null; 
            }
        },
        showToast(msg) {
            $(".al-toast").remove();
            const t = $(`<div class="al-toast">${msg}</div>`).appendTo("body");
            t.hide().fadeIn(200).delay(2500).fadeOut(300, function () { $(this).remove(); });
        }
    };

    // ================= [Logic] 集數計算核心 =================
    const EpisodeCalculator = {
        /**
         * 計算列表集數
         * @param {jQuery} $listUl - 列表容器
         * @param {jQuery|null} targetLi - 要尋找的目標 LI (若無則計算總數)
         */
        calculateFromList($listUl, targetLi = null) {
            let currentListEp = 0;
            let lastEpNum = null;
            let resultEp = null;
            let found = false;

            $listUl.find("li").each(function () {
                if (found && targetLi) return false;
                const li = $(this);
                const text = li.text().trim();

                // 1. 過濾規則：忽略 0、小數點、非數字
                if (text === "0" || text.includes(".") || !/\d/.test(text)) return;

                const currentTextNum = parseInt(text, 10);

                // 2. 計算邏輯：處理跳號
                if (lastEpNum === null || isNaN(currentTextNum)) {
                    currentListEp++;
                } else {
                    const gap = currentTextNum - lastEpNum;
                    currentListEp += (gap > 1) ? gap : 1;
                }

                if (!isNaN(currentTextNum)) lastEpNum = currentTextNum;

                // 3. 比對目標：使用 jQuery 的 is() 檢查是否為同一元素
                if (targetLi && li.is(targetLi)) {
                    resultEp = currentListEp;
                    found = true;
                    return false;
                }
            });

            return targetLi ? resultEp : currentListEp;
        },

        getCurrent() {
            // 不依賴 .playing class，改用 URL 的 sn 參數來精準定位
            const urlParams = new URLSearchParams(location.search);
            const currentSn = urlParams.get("sn");
            
            // 1. 嘗試透過 SN 找到對應的按鈕
            let targetLi = $(`.season ul li a[href*="sn=${currentSn}"]`).closest("li");

            // 2. 如果找不到 (例如剛載入)，才退回找 .playing
            if (targetLi.length === 0) {
                targetLi = $(CONSTANTS.SELECTORS.seasonList + CONSTANTS.SELECTORS.playing);
            }

            // 3. 還是找不到 (無列表或電影版)，且在影片頁面，回傳 1；否則回傳 null
            if (targetLi.length === 0) {
                return location.href.includes("animeVideo.php") ? 1 : null;
            }

            // 4. 傳入找到的那個 li 進行計算
            return this.calculateFromList(targetLi.closest("ul"), targetLi);
        },

        getMax() {
            const seasonUls = $(".season ul");
            if (seasonUls.length === 0) return location.href.includes("animeVideo.php") ? 1 : 0;
            let maxEp = 0;
            seasonUls.each(function () {
                const listEp = EpisodeCalculator.calculateFromList($(this), null);
                if (listEp > maxEp) maxEp = listEp;
            });
            return maxEp;
        }
    };

    // ================= [API] AniList 通訊層 =================
    const AniListAPI = {
        getToken: () => GM_getValue(CONSTANTS.KEYS.TOKEN),
        async request(query, variables) {
            const token = this.getToken();
            if (!token && !query.includes("search")) throw new Error("Token 未設定");
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: CONSTANTS.API_URL,
                    headers: { "Content-Type": "application/json", "Authorization": token ? `Bearer ${token}` : undefined },
                    data: JSON.stringify({ query, variables }),
                    onload: (r) => {
                        try {
                            const d = JSON.parse(r.responseText);
                            if (d.errors) {
                                const msg = d.errors[0].message;
                                if (msg === "Invalid token") reject(new Error("Invalid token"));
                                else if (r.status === 429) reject(new Error("Too Many Requests"));
                                else reject(new Error(msg));
                            } else {
                                resolve(Utils.deepSanitize(d));
                            }
                        } catch (e) {
                            console.error(e);
                            reject(new Error("JSON 解析失敗")); 
                        }
                    },
                    onerror: (e) => reject(new Error(`Network Error: ${e.statusText || "Unknown"}`)),
                });
            });
        },
        search: (term) => AniListAPI.request(GQL.SEARCH, { s: term }),
        searchByDateRange: (start, end) => AniListAPI.request(GQL.SEARCH_RANGE, { start, end }),
        getMedia: (id) => AniListAPI.request(GQL.GET_MEDIA, { id }).then(d => d.data.Media),
        getUserStatus: (id) => AniListAPI.request(GQL.GET_USER_STATUS, { id }).then(d => d.data.Media.mediaListEntry),
        updateUserProgress: (id, p) => AniListAPI.request(GQL.UPDATE_PROGRESS, { id, p }).then(d => d.data.SaveMediaListEntry),
        updateUserStatus: (id, status) => AniListAPI.request(GQL.UPDATE_STATUS, { id, status }).then(d => d.data.SaveMediaListEntry),
        async getSequelChain(id) {
            const query = GQL.SEQUEL_CHAIN(GQL.MEDIA_FIELDS);
            const data = await this.request(query, { id });
            const root = data.data.Media;
            if (!root) return [];
            const isMovie = root.format === 'MOVIE';
            const targetFormats = isMovie ? ['MOVIE'] : ['TV', 'ONA', 'OVA'];
            const chain = [];
            let current = root;
            const visited = new Set();
            while (current) {
                if (visited.has(current.id)) break;
                visited.add(current.id);
                chain.push(current);
                if (current.relations?.edges) {
                    const sequelEdge = current.relations.edges.find((e) => e.relationType === "SEQUEL" && targetFormats.includes(e.node.format));
                    current = sequelEdge ? sequelEdge.node : null;
                } else current = null;
            }
            return chain;
        }
    };

    // ================= [UI] 畫面渲染與事件 =================
    const Templates = {
        tabs: (activeTab, isVideo, hasRules) => `
            <div class="al-tabs-header">
                <button class="al-tab-btn ${activeTab === 'home' ? 'active' : ''}" data-tab="home" ${!isVideo ? 'disabled' : ''}>主頁 / 狀態</button>
                <button class="al-tab-btn ${activeTab === 'series' ? 'active' : ''}" data-tab="series" ${!hasRules ? 'disabled' : ''}>系列設定</button>
                <button class="al-tab-btn ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">設定</button>
            </div>
            <div id="tab-home" class="al-tab-content ${activeTab === 'home' ? 'active' : ''}"></div>
            <div id="tab-series" class="al-tab-content ${activeTab === 'series' ? 'active' : ''}"></div>
            <div id="tab-settings" class="al-tab-content ${activeTab === 'settings' ? 'active' : ''}"></div>
        `,
        settings: (token, mode, clientId, customSec) => {
            // 定義圖示
            const eyeOpen = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="#ccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
            const eyeOff = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="#ccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07-2.3 2.3"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

            return `
            <div style="padding:20px;">
                <label style="display:block;margin-bottom:5px;font-weight:bold;">AniList Access Token</label>
                
                <div style="display:flex; gap:10px; align-items:center;">
                    <input type="password" id="set-token" class="al-input" value="${token}" placeholder="請貼上 Token" style="flex:1;">
                    <button id="toggle-token-btn" class="al-bind-btn" style="background:#333; border:1px solid #555; padding:4px 10px; height:35px; display:flex; align-items:center;">${eyeOpen}</button>
                </div>
                
                <div style="margin-top:20px; padding-top:20px; border-top:1px solid #333;">
                    <label style="margin-bottom:8px; display:block; font-weight:bold;">同步觸發時機</label>
                    <select id="set-mode" class="al-input">
                        <option value="instant" ${mode === 'instant' ? 'selected' : ''}>🚀 即時同步 (播放 5 秒後)</option>
                        <option value="2min" ${mode === '2min' ? 'selected' : ''}>⏳ 觀看確認 (播放 2 分鐘後)</option>
                        <option value="80pct" ${mode === '80pct' ? 'selected' : ''}>🏁 快看完時 (進度 80%)</option>
                        <option value="custom" ${mode === 'custom' ? 'selected' : ''}>⚙️ 自訂時間</option>
                    </select>
                    <div id="custom-sec-group" style="margin-top:10px; display:none; align-items:center; gap:10px;">
                        <span style="font-size:13px; color:#ccc;">播放超過：</span>
                        <input type="number" id="set-custom-sec" class="al-input" style="width:80px;text-align:center;" value="${customSec}" min="1">
                        <span style="font-size:13px; color:#ccc;">秒後同步</span>
                    </div>
                </div>

                <button id="save-set" class="al-bind-btn" style="width:100%; margin-top:20px; background:#388e3c;">儲存設定</button>

                <div class="al-step-card">
                    <p class="al-step-title">如何取得 Token?</p>
                    <div class="al-step-item">
                        <span class="al-step-num">1.</span>
                        <div class="al-step-content">
                            登入 <a href="https://anilist.co/" target="_blank" class="al-link">AniList</a> 後，前往 <a href="https://anilist.co/settings/developer" target="_blank" class="al-link">開發者設定</a>，新增 API Client。
                        </div>
                    </div>
                    <div class="al-step-item" style="align-items:center;">
                        <span class="al-step-num">2.</span>
                        <div class="al-step-content" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                            <span>輸入 Client ID：</span>
                            <input id="client-id" class="al-input" style="width:100px; text-align:center;" value="${clientId}" placeholder="ID">
                            <a id="auth-link" href="#" target="_blank" class="al-bind-btn">前往授權</a>
                        </div>
                    </div>
                    <div class="al-step-item">
                        <span class="al-step-num">3.</span>
                        <div class="al-step-content">
                            點擊 Authorize，將網址列或頁面上的 Access Token 複製貼回上方。
                        </div>
                    </div>
                </div>
            </div>
        `;
        },
        homeBound: (rule, info, statusData, statusOptions) => `
            <div style="padding:15px;">
                <div class="al-result-item" style="background:#1a2633; border:1px solid #1e3a5f; border-radius:5px; align-items:flex-start;">
                    <a href="https://anilist.co/anime/${rule.id}" target="_blank">
                        <img src="${info.coverImage.medium}" style="width:70px;height:100px;object-fit:cover;border-radius:4px;">
                    </a>
                    <div style="flex:1;">
                        <a href="https://anilist.co/anime/${rule.id}" target="_blank" class="al-link" style="font-size:16px; display:block; margin-bottom:5px;">${rule.title}</a>
                        <div style="font-size:12px;color:#aaa;line-height:1.5;">
                            <div>ID: ${rule.id}</div>
                            <div>${info.title.native}</div>
                            <div>${info.seasonYear || '-'} | ${info.format} | ${info.episodes || '?'} 集</div>
                            <div style="margin-top:5px; color:#4caf50; font-weight:bold;">AniList 進度: ${statusData?.progress || 0} / ${info.episodes || '?'}</div>
                        </div>
                    </div>
                </div>
                <div style="margin-top:15px;">
                    <label style="font-weight:bold;color:#ccc;font-size:13px;">切換狀態:</label>
                    <select id="home-status" class="al-input" style="margin-top:5px;">${statusOptions}</select>
                </div>
                <div style="margin-top:15px; border-top:1px solid #333; padding-top:15px;">
                    <label style="font-weight:bold;color:#ccc;font-size:13px;">手動修改 ID:</label>
                    <div style="display:flex; gap:10px; margin-top:5px;">
                        <input type="number" id="home-edit-id" class="al-input" value="${rule.id}">
                        <button id="home-save-id" class="al-bind-btn" style="background:#555;">更新</button>
                    </div>
                </div>
                <button id="btn-unbind" class="al-btn-grey">解除所有綁定</button>
            </div>
        `,
        homeUnbound: (candidate, searchName) => `
            <div style="padding:15px;">
                ${candidate ? `
                <div style="background:#2e2818;padding:10px;margin-bottom:15px;border-radius:5px;border:1px solid #5a4b18;">
                    <div style="font-weight:bold;color:#ffb74d;font-size:13px;margin-bottom:5px;">💡 建議匹配</div>
                    <div style="display:flex;gap:10px;align-items:flex-start;">
                        <img src="${candidate.coverImage.medium}" style="height:70px;border-radius:3px;">
                        <div style="flex:1;">
                            <div style="font-size:14px;font-weight:bold;">${candidate.title.native}</div>
                            <div style="font-size:12px;color:#aaa;">${candidate.title.romaji}</div>
                            <div style="font-size:12px;color:#888;">${candidate.seasonYear || ''} | ${candidate.format}</div>
                        </div>
                        <button id="btn-quick" class="al-bind-btn" style="align-self:center;">綁定</button>
                    </div>
                </div>` : ''}
                <div style="display:flex;gap:5px;">
                    <input id="search-in" class="al-input" value="${searchName || ''}" placeholder="搜尋...">
                    <button id="btn-search" class="al-bind-btn">搜尋</button>
                </div>
                <div id="search-res" style="margin-top:15px;"></div>
            </div>
        `,
        searchResult: (m) => `
            <div class="al-result-item">
                <img src="${m.coverImage.medium}" style="width:50px;height:75px;object-fit:cover;border-radius:3px;">
                <div style="flex:1;overflow:hidden;">
                    <div style="font-weight:bold;">${m.title.native || m.title.romaji}</div>
                    <div style="font-size:12px;color:#aaa;">${m.title.romaji}</div>
                    <div style="font-size:12px;color:#666;">${m.seasonYear || '-'} | ${m.format} | ${m.episodes || '?'}集</div>
                </div>
                <button class="al-bind-btn bind-it" data-id="${m.id}" data-title="${Utils.deepSanitize(m.title.native || m.title.romaji)}">綁定</button>
            </div>
        `,
        seriesRow: (m, isActive, isSuggestion, isOut, val) => {
            const statusText = isActive ? "✅ 使用中" : (isSuggestion ? "💡 建議" : (isOut ? "🚫 非本頁" : "⚪ 未使用"));
            const statusColor = isActive ? "#66bb6a" : (isSuggestion ? "#ffca28" : (isOut ? "#d32f2f" : "#777"));
            const rowClass = isActive ? "active" : (isSuggestion ? "suggestion" : "");
            const btnTxt = isActive ? "取消" : (isSuggestion ? "套用" : "啟用");
            const btnClass = isActive ? "disable" : "enable";
            const dateStr = Utils.formatDate(m.startDate);

            return `
                <tr class="series-row ${rowClass}" data-id="${m.id}" data-title="${Utils.deepSanitize(m.title.native || m.title.romaji)}">
                    <td style="width:80px;">
                        <span class="status-label" style="color:${statusColor};font-weight:bold;">${statusText}</span>
                        <input type="checkbox" class="cb-active" style="display:none;" ${isActive ? 'checked' : ''}>
                    </td>
                    <td>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <a href="https://anilist.co/anime/${m.id}" target="_blank" style="flex-shrink:0;">
                                <img src="${m.coverImage.medium}" style="width:40px;height:60px;object-fit:cover;border-radius:3px;">
                            </a>
                            <div>
                                <a href="https://anilist.co/anime/${m.id}" target="_blank" class="al-link">${m.title.native || m.title.romaji}</a>
                                <div style="font-size:11px;color:#888;">${m.seasonYear || '-'} | ${m.format} | ${dateStr}</div>
                            </div>
                        </div>
                    </td>
                    <td style="text-align:center;width:50px;">${m.episodes || '?'}</td>
                    <td style="width:70px;"><input type="number" class="inp-start al-input" style="padding:4px;text-align:center;" value="${val}"></td>
                    <td style="width:70px;"><button class="al-toggle-btn btn-toggle ${btnClass}" data-suggested="${m.suggestedStart}">${btnTxt}</button></td>
                </tr>
            `;
        }
    };

    const UI = {
        statusTimer: null,
        initNavbar(nav) {
            if ($("#al-trigger").length) return;
            nav.append(`<li class="al-nav-item"><a class="al-nav-link" id="al-trigger"><span id="al-icon">⚪</span><span id="al-text">AniList</span><span id="al-user-status" class="al-user-status"></span><span id="al-title" class="al-nav-title" style="display:none;"></span></a></li>`);
            $("#al-trigger").click(() => this.openModal());
            $("body").append(`<div id="al-modal" class="al-modal-overlay"><div class="al-modal-content"><div class="al-modal-header"><strong>AniList 設定</strong><button class="al-close-btn">&times;</button></div><div class="al-modal-body" id="al-modal-body"></div></div></div>`);
            $(".al-close-btn").click(() => $("#al-modal").fadeOut(200));
            $("#al-modal").click((e) => { if (e.target.id === "al-modal") $("#al-modal").fadeOut(200); });
        },
        updateNav(type, msg) {
            const $icon = $("#al-icon"), $text = $("#al-text"), $title = $("#al-title"), $uStatus = $("#al-user-status");
            if (this.statusTimer) { clearTimeout(this.statusTimer); this.statusTimer = null; }
            const rule = App.state.activeRule;
            const showTitle = rule && [CONSTANTS.STATUS.BOUND, CONSTANTS.STATUS.SYNCING, CONSTANTS.STATUS.DONE, CONSTANTS.STATUS.INFO].includes(type);
            if (showTitle) {
                $title.text(rule.title).show();
                if (App.state.userStatus) {
                    const { status, progress } = App.state.userStatus;
                    const statusMap = { CURRENT: "📺 觀看中", COMPLETED: "🎉 已看完", PLANNING: "📅 計畫中", REPEATING: "🔁 重看中", PAUSED: "⏸️ 暫停", DROPPED: "🗑️ 棄番" };
                    let stTxt = statusMap[status] || "";
                    if (progress > 0) stTxt += `【Ep.${progress}】`;
                    if (stTxt) $uStatus.text(stTxt).css("display", "inline-block");
                } else $uStatus.hide();
            } else { $title.hide(); $uStatus.hide(); }
            const map = {
                [CONSTANTS.STATUS.TOKEN_ERROR]: { i: "⚠️", t: "設定 Token" },
                [CONSTANTS.STATUS.UNBOUND]: { i: "🔗", t: "連結 AniList" },
                [CONSTANTS.STATUS.BOUND]: { i: "✅", t: "已連動" },
                [CONSTANTS.STATUS.SYNCING]: { i: "🔄", t: msg },
                [CONSTANTS.STATUS.DONE]: { i: "✅", t: msg },
                [CONSTANTS.STATUS.ERROR]: { i: "❌", t: msg },
                [CONSTANTS.STATUS.INFO]: { i: "ℹ️", t: msg }
            };
            const setting = map[type] || map[CONSTANTS.STATUS.UNBOUND];
            $icon.text(setting.i);
            $text.text(setting.t);
            if (type === CONSTANTS.STATUS.DONE) {
                this.statusTimer = setTimeout(() => {
                    $icon.text("✅"); $text.text("已連動");
                    if (App.state.userStatus) $uStatus.show();
                }, 1500);
            }
        },
        openModal() {
            $("#al-modal").fadeIn(200).css("display", "flex");
            this.renderTabs();
        },
        renderTabs() {
            const isVideo = location.href.includes("animeVideo.php");
            const hasRules = App.state.rules.length > 0;
            const hasToken = !!App.state.token;
            let activeTab = hasToken ? (isVideo ? "home" : "settings") : "settings";
            $("#al-modal-body").html(Templates.tabs(activeTab, isVideo, hasRules));
            $(".al-tab-btn").click(function () {
                if ($(this).attr("disabled")) return;
                $(".al-tab-btn").removeClass("active");
                $(this).addClass("active");
                $(".al-tab-content").removeClass("active");
                $(`#tab-${$(this).data("tab")}`).addClass("active");
                UI.loadTabContent($(this).data("tab"));
            });
            this.loadTabContent(activeTab);
        },
        loadTabContent(tabName) {
            const container = $(`#tab-${tabName}`);
            container.empty();
            if (tabName === "settings") this.renderSettings(container);
            else if (tabName === "series") this.renderSeries(container);
            else {
                if (App.state.rules.length > 0) this.renderHomeBound(container);
                else this.renderHomeUnbound(container);
            }
        },
        renderSettings(container) {
            const token = GM_getValue(CONSTANTS.KEYS.TOKEN, "");
            const mode = GM_getValue(CONSTANTS.KEYS.SYNC_MODE, "instant");
            const savedClientId = GM_getValue(CONSTANTS.KEYS.CLIENT_ID, "00000");
            const savedCustomSeconds = GM_getValue(CONSTANTS.KEYS.CUSTOM_SEC, 60);
            
            container.html(Templates.settings(token, mode, savedClientId, savedCustomSeconds));
            
            $("#toggle-token-btn").click(function() {
                const inp = $("#set-token");
                const eyeOpen = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="#ccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
                const eyeOff = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="#ccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07-2.3 2.3"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

                if (inp.attr("type") === "password") {
                    inp.attr("type", "text");
                    $(this).html(eyeOff);
                } else {
                    inp.attr("type", "password");
                    $(this).html(eyeOpen);
                }
            });

            // 原有的其他邏輯
            const toggleCustom = () => { $("#custom-sec-group").css("display", $("#set-mode").val() === "custom" ? "flex" : "none"); };
            toggleCustom();
            $("#set-mode").change(toggleCustom);
            
            const updateAuth = () => {
                const id = $("#client-id").val();
                $("#auth-link").attr("href", `https://anilist.co/api/v2/oauth/authorize?client_id=${id}&response_type=token`);
                GM_setValue(CONSTANTS.KEYS.CLIENT_ID, id);
            };
            $("#client-id").on("input", updateAuth);
            updateAuth();
            
            $("#save-set").click(() => {
                const newToken = $("#set-token").val().trim();
                const newMode = $("#set-mode").val();
                const customSec = parseInt($("#set-custom-sec").val());
                if (!newToken) return Utils.showToast("❌ 請輸入 Token");
                if (newMode === "custom" && (isNaN(customSec) || customSec < 1)) return Utils.showToast("❌ 請輸入有效的秒數");
                GM_setValue(CONSTANTS.KEYS.TOKEN, newToken);
                GM_setValue(CONSTANTS.KEYS.SYNC_MODE, newMode);
                if (!isNaN(customSec)) GM_setValue(CONSTANTS.KEYS.CUSTOM_SEC, customSec);
                App.state.token = newToken;
                Utils.showToast("✅ 設定已儲存，請重新整理");
                setTimeout(() => location.reload(), 800);
            });
        },
        async renderHomeBound(container) {
            container.html('<div style="padding:20px;">讀取中...</div>');
            const rule = App.state.activeRule;
            try {
                const [info, statusData] = await Promise.all([AniListAPI.getMedia(rule.id), AniListAPI.getUserStatus(rule.id)]);
                App.state.userStatus = statusData;
                UI.updateNav(CONSTANTS.STATUS.BOUND);
                const statusMap = { CURRENT: "Watching", COMPLETED: "Completed", PLANNING: "Plan to Watch", REPEATING: "Rewatching", PAUSED: "Paused", DROPPED: "Dropped" };
                const currentStatus = statusData?.status || "NOT_IN_LIST";
                let opts = currentStatus === "NOT_IN_LIST" ? `<option value="NOT_IN_LIST" selected>Not in List</option>` : "";
                for (let k in statusMap) opts += `<option value="${k}" ${currentStatus === k ? 'selected' : ''}>${statusMap[k]}</option>`;
                container.html(Templates.homeBound(rule, info, statusData, opts));
                $("#home-status").change(async function () {
                    const s = $(this).val();
                    if (s === "NOT_IN_LIST") return;
                    $(this).prop("disabled", true);
                    try {
                        const newS = await AniListAPI.updateUserStatus(rule.id, s);
                        App.state.userStatus = newS;
                        Utils.showToast("✅ 狀態已更新");
                        UI.loadTabContent("home");
                    } catch (e) { Utils.showToast("❌ 更新失敗: " + e.message); $(this).prop("disabled", false); }
                });
                $("#home-save-id").click(() => {
                    const nid = parseInt($("#home-edit-id").val());
                    if (nid) App.bindSeries(nid, "手動更新");
                });
                $("#btn-unbind").click(() => {
                    if (confirm("確定要解除此作品的所有綁定嗎？")) {
                        GM_deleteValue(`${CONSTANTS.STORAGE_PREFIX}${App.state.bahaSn}`);
                        location.reload();
                    }
                });
            } catch (e) { container.html(`<div style="padding:20px; color:red;">Error: ${e.message}</div>`); }
        },
        renderHomeUnbound(container) {
            const data = App.state.bahaData || {};
            container.html(Templates.homeUnbound(App.state.candidate, data.nameJp));
            if (App.state.candidate) {
                $("#btn-quick").click(() => App.bindSeries(App.state.candidate.id, App.state.candidate.title.native));
            }
            const doSearch = async () => {
                $("#search-res").html('<div style="text-align:center;color:#666;">搜尋中...</div>');
                try {
                    const res = await AniListAPI.search($("#search-in").val());
                    let html = "";
                    const list = res.data.Page.media || [];
                    if (list.length === 0) html = '<div style="text-align:center;color:#666;">找不到結果</div>';
                    else list.forEach(m => { html += Templates.searchResult(m); });
                    $("#search-res").html(html);
                    $(".bind-it").click(function () { App.bindSeries($(this).data("id"), $(this).data("title")); });
                } catch (e) { $("#search-res").html(`<div style="color:red;">Error: ${e.message}</div>`); }
            };
            $("#btn-search").click(doSearch);
            $("#search-in").keypress((e) => { if (e.which == 13) doSearch(); });
            if (data.nameJp) doSearch();
        },
        async renderSeries(container) {
            container.html('<div style="padding:20px;text-align:center;">讀取系列資訊中...</div>');
            const baseId = App.state.rules.length > 0 ? App.state.rules[App.state.rules.length - 1].id : null;
            if (!baseId) return container.html('<div style="padding:20px;text-align:center;color:#999;">請先在主頁綁定作品</div>');
            try {
                const chain = await AniListAPI.getSequelChain(baseId);
                const maxPageEp = EpisodeCalculator.getMax();
                chain.forEach((media, index) => {
                    if (index === 0) media.suggestedStart = 1;
                    else {
                        const prev = chain[index - 1];
                        media.suggestedStart = prev.suggestedStart + (prev.episodes || 12);
                    }
                });
                let rowsHtml = "";
                chain.forEach(m => {
                    const existing = App.state.rules.find(r => r.id === m.id);
                    const isOut = m.suggestedStart > maxPageEp;
                    const isActive = !!existing;
                    const isSuggestion = !isActive && !isOut && m.suggestedStart > 1;
                    const val = existing ? existing.start : ((isActive || isSuggestion) ? m.suggestedStart : "");
                    rowsHtml += Templates.seriesRow(m, isActive, isSuggestion, isOut, val);
                });
                container.html(`
                    <div style="padding:15px;">
                        <table class="al-map-table">
                            <thead><tr><th>狀態</th><th>作品</th><th>集數</th><th>起始</th><th>操作</th></tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                        <button id="save-series" class="al-bind-btn" style="width:100%;margin-top:15px;padding:10px;">儲存系列設定</button>
                    </div>
                `);

                container.find(".btn-toggle").click(function () {
                    const row = $(this).closest("tr");
                    const inp = row.find(".inp-start");
                    const cb = row.find(".cb-active");
                    const statusLbl = row.find(".status-label");
                    if (cb.prop("checked")) {
                        cb.prop("checked", false);
                        inp.val("");
                        row.removeClass("active");
                        $(this).text("啟用").removeClass("disable").addClass("enable");
                        statusLbl.text("⚪ 未用").css("color", "#777");
                    } else {
                        cb.prop("checked", true);
                        const suggested = $(this).data("suggested");
                        inp.val(suggested || "");
                        row.addClass("active");
                        $(this).text("取消").removeClass("enable").addClass("disable");
                        statusLbl.text("✅ 使用中").css("color", "#66bb6a");
                    }
                    inp.trigger("input");
                });

                container.find(".inp-start").on("input", function () {
                    const row = $(this).closest("tr");
                    const val = $(this).val();
                    const btn = row.find(".btn-toggle");
                    const statusLbl = row.find(".status-label");
                    const cb = row.find(".cb-active");
                    if (val) {
                        cb.prop("checked", true);
                        row.addClass("active").removeClass("suggestion");
                        btn.text("取消").removeClass("enable").addClass("disable");
                        statusLbl.text("✅ 使用中").css("color", "#66bb6a");
                    } else {
                        cb.prop("checked", false);
                        row.removeClass("active");
                        btn.text("啟用").removeClass("disable").addClass("enable");
                        statusLbl.text("⚪ 未用").css("color", "#777");
                    }
                });

                $("#save-series").click(() => {
                    const newRules = [];
                    container.find(".series-row").each(function () {
                        const cb = $(this).find(".cb-active");
                        const val = parseInt($(this).find(".inp-start").val());
                        if (cb.prop("checked") && val) {
                            newRules.push({ start: val, id: $(this).data("id"), title: $(this).data("title") });
                        }
                    });
                    if (newRules.length === 0) return Utils.showToast("❌ 至少需要設定一個起始集數");
                    newRules.sort((a, b) => b.start - a.start);
                    App.state.rules = newRules;
                    GM_setValue(`${CONSTANTS.STORAGE_PREFIX}${App.state.bahaSn}`, newRules);
                    App.determineActiveRule();
                    UI.updateNav(CONSTANTS.STATUS.BOUND);
                    Utils.showToast("✅ 系列設定已儲存");
                    $("#al-modal").fadeOut(200);
                });
            } catch (e) { container.html(`<div style="padding:20px;color:red;">載入失敗: ${e.message}</div>`); }
        }
    };

    // ================= [App] 主程式控制器 =================
    const App = {
        state: {
            token: AniListAPI.getToken(),
            rules: [],
            activeRule: null,
            userStatus: null,
            bahaSn: null,
            bahaData: null,
            candidate: null,
            currentUrlSn: null,
            hasSynced: false,
            isHunting: false,
            stopSync: false,
            tokenErrorCount: 0,
            syncSettings: {},
            huntTimer: null
        },
        init() {
            if (!this.state.token) console.warn("[AniList] Token 未設定，請點擊狀態列設定");
            this.waitForNavbar();
            this.startMonitor();
            this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
        },
        waitForNavbar() {
            const t = setInterval(() => {
                const nav = $('ul:has(a[href="index.php"])').first();
                if (nav.length) {
                    clearInterval(t);
                    UI.initNavbar(nav);
                    this.updateUIStatus();
                }
            }, 500);
        },
        startMonitor() {
            this.checkUrlChange();
            setInterval(() => this.checkUrlChange(), 1000);
        },
        checkUrlChange() {
            if (!location.href.includes("animeVideo.php")) return;
            const params = new URLSearchParams(location.search);
            if (!params) return;
            const newSn = params.get("sn");
            if (newSn !== this.state.currentUrlSn) {
                this.state.currentUrlSn = newSn;
                this.resetEpisodeState();
                this.loadEpisodeData();
                this.startVideoHunt();
            }
        },
        resetEpisodeState() {
            if (this.state.huntTimer) clearInterval(this.state.huntTimer);
            const video = document.querySelector(CONSTANTS.SELECTORS.videoElement);
            if (video) { video.removeEventListener("timeupdate", this.handleTimeUpdate); }
            this.state.huntTimer = null;
            this.state.hasSynced = false;
            this.state.isHunting = false;
            this.state.stopSync = false;
            this.state.tokenErrorCount = 0;
        },
        async loadEpisodeData() {
            const acgLink = this.getAcgLink();
            if (!acgLink) return;
            this.state.bahaSn = new URLSearchParams(acgLink.split("?")[1]).get("s");
            if (!this.state.bahaData) this.state.bahaData = await this.fetchBahaData(acgLink);
            const savedRules = GM_getValue(`${CONSTANTS.STORAGE_PREFIX}${this.state.bahaSn}`);
            if (savedRules) {
                if (Array.isArray(savedRules)) this.state.rules = savedRules;
                else this.state.rules = [{ start: 1, id: savedRules.id || savedRules, title: savedRules.title || "Unknown" }];
                this.state.rules.sort((a, b) => b.start - a.start);
            } else {
                this.state.rules = [];
                if (this.state.token) this.tryAutoBind();
            }
            await this.determineActiveRule();
            this.updateUIStatus();
        },
        getAcgLink() {
            const el = $(CONSTANTS.SELECTORS.acgLink);
            return (el.length ? el : $(CONSTANTS.SELECTORS.acgLinkAlt)).attr("href");
        },
        async determineActiveRule() {
            if (this.state.rules.length === 0) { this.state.activeRule = null; return; }
            const currentEp = EpisodeCalculator.getCurrent();
            if (currentEp) {
                this.state.activeRule = this.state.rules.find(r => currentEp >= r.start) || this.state.rules[this.state.rules.length - 1];
            } else { this.state.activeRule = this.state.rules[0]; }
            if (this.state.activeRule && this.state.token) {
                try {
                    const status = await AniListAPI.getUserStatus(this.state.activeRule.id);
                    this.state.userStatus = status;
                    this.updateUIStatus();
                } catch (e) { console.error("[AniList] Fetch status error:", e); }
            }
        },
        startVideoHunt() {
            if (this.state.isHunting) return;
            this.state.isHunting = true;
            if (this.state.rules.length > 0) UI.updateNav(CONSTANTS.STATUS.SYNCING, "搜尋播放器...");
            this.state.syncSettings = { mode: GM_getValue(CONSTANTS.KEYS.SYNC_MODE, "instant"), custom: GM_getValue(CONSTANTS.KEYS.CUSTOM_SEC, 60) };
            let attempts = 0;
            this.state.huntTimer = setInterval(() => {
                const video = document.querySelector(CONSTANTS.SELECTORS.videoElement);
                attempts++;
                // 檢查是否換了新的 SN
                if (video && video.dataset.alHooked !== this.state.currentUrlSn) {
                    video.dataset.alHooked = this.state.currentUrlSn;
                    video.addEventListener("timeupdate", this.handleTimeUpdate);
                    clearInterval(this.state.huntTimer);
                    this.state.huntTimer = null;
                    this.state.isHunting = false;
                    if (this.state.rules.length > 0) UI.updateNav(CONSTANTS.STATUS.BOUND);
                } else if (attempts > 50) {
                    clearInterval(this.state.huntTimer);
                    this.state.huntTimer = null;
                    this.state.isHunting = false;
                }
            }, 200);
        },
        handleTimeUpdate(e) {
            if (this.state.hasSynced || this.state.stopSync) return;
            const video = e.target;
            const { mode, custom } = this.state.syncSettings;
            let shouldSync = false;
            if (mode === CONSTANTS.SYNC_MODES.INSTANT) shouldSync = video.currentTime > 5;
            else if (mode === CONSTANTS.SYNC_MODES.TWO_MIN) shouldSync = video.currentTime > 120;
            else if (mode === CONSTANTS.SYNC_MODES.EIGHTY_PCT) shouldSync = (video.duration > 0 && (video.currentTime / video.duration) > 0.8);
            else if (mode === CONSTANTS.SYNC_MODES.CUSTOM) shouldSync = video.currentTime > custom;
            if (shouldSync) { this.state.hasSynced = true; this.syncProgress(); }
        },
        async syncProgress() {
            // 同步前再次確認目前集數與規則，確保換集數後能抓到正確的 Rule
            await this.determineActiveRule();

            const ep = EpisodeCalculator.getCurrent();
            if (!ep || !this.state.activeRule) return;

            const rule = this.state.activeRule;
            const progress = ep - rule.start + 1;

            UI.updateNav(CONSTANTS.STATUS.SYNCING, `同步 Ep.${progress}...`);

            try {
                const checkData = await AniListAPI.getUserStatus(rule.id);
                if (checkData?.status === "COMPLETED") { UI.updateNav(CONSTANTS.STATUS.INFO, "略過同步(已完成)"); return; }
                const result = await AniListAPI.updateUserProgress(rule.id, progress);
                this.state.userStatus = result;
                UI.updateNav(CONSTANTS.STATUS.DONE, `已同步 Ep.${progress}`);
            } catch (e) {
                const errStr = e.message;
                UI.updateNav(CONSTANTS.STATUS.ERROR, "同步失敗");
                if (errStr.includes("Token") || errStr.includes("401")) {
                    this.state.tokenErrorCount++;
                    if (this.state.tokenErrorCount >= 3) this.state.stopSync = true;
                    UI.updateNav(CONSTANTS.STATUS.TOKEN_ERROR);
                } else if (errStr.includes("Too Many Requests")) {
                    this.state.stopSync = true;
                    Utils.showToast("⚠️ 請求過於頻繁，已暫停同步");
                } else { setTimeout(() => { this.state.hasSynced = false; }, CONSTANTS.SYNC_DEBOUNCE_MS); }
            }
        },
        async tryAutoBind() {
            if (!this.state.bahaData) return;
            UI.updateNav(CONSTANTS.STATUS.SYNCING, "自動匹配中...");
            const { nameJp, nameEn, dateJP, dateTW, site } = this.state.bahaData;
            let match = null;
            const terms = [nameEn, nameJp].filter(Boolean);
            for (let term of terms) {
                try {
                    const res = await AniListAPI.search(term);
                    const list = res.data.Page.media || [];
                    if (list.length > 0 && !this.state.candidate) this.state.candidate = list[0];
                    match = list.find(media => { return Utils.isDateCloseEnough(dateJP.obj, media.startDate) || Utils.isDateCloseEnough(dateTW.obj, media.startDate); });
                } catch (e) { console.warn("AutoBind Search Error:", e); }
                if (match) break;
            }
            if (!match && site) {
                const range = Utils.getFuzzyDateRange(dateJP.obj || dateTW.obj, CONSTANTS.SEARCH_RANGE_DAYS);
                if (range) {
                    try {
                        const res = await AniListAPI.searchByDateRange(range.start, range.end);
                        const list = res.data.Page.media || [];
                        match = list.find(media => {
                            const domainMatch = media.externalLinks?.some(l => Utils.extractDomain(l.url)?.includes(site));
                            const dateMatch = Utils.isDateCloseEnough(dateJP.obj, media.startDate) || Utils.isDateCloseEnough(dateTW.obj, media.startDate);
                            return domainMatch && dateMatch;
                        });
                    } catch (e) { console.warn("AutoBind Range Error:", e); }
                }
            }
            if (match) { await this.bindSeries(match.id, match.title.native || match.title.romaji); }
            else { UI.updateNav(CONSTANTS.STATUS.UNBOUND); if (this.state.candidate) Utils.showToast("🧐 找到可能的作品，請點擊確認"); }
        },
        async bindSeries(id, title) {
            // 1. 處理標題 (如果是手動輸入的情況)
            if (title === "手動更新" || title === "手動輸入") {
                try {
                    const info = await AniListAPI.getMedia(id);
                    title = info.title.native || info.title.romaji;
                } catch (e) { title = "Unknown Title"; }
            }

            // 2. 自動擷取系列作並計算集數
            UI.updateNav(CONSTANTS.STATUS.SYNCING, "計算系列集數...");
            let newRules = [];
            
            try {
                // 取得關聯作品鏈
                const chain = await AniListAPI.getSequelChain(id);
                // 取得頁面目前最大的集數 (用來判斷哪些作品屬於這個頁面)
                const maxPageEp = EpisodeCalculator.getMax();

                // 計算累積集數 (與系列設定頁籤邏輯相同)
                chain.forEach((media, index) => {
                    if (index === 0) media.suggestedStart = 1;
                    else {
                        const prev = chain[index - 1];
                        media.suggestedStart = prev.suggestedStart + (prev.episodes || 12);
                    }
                });

                // 過濾並建立規則
                chain.forEach(m => {
                    // 條件：如果是「使用者指定的這部」或者「起始集數在頁面範圍內」的作品，就自動加入規則
                    // 這樣可以避免把尚未播出的續作也加進來導致誤判，同時保留同一頁面內的多季作品
                    if (m.id === id || m.suggestedStart <= maxPageEp) {
                        newRules.push({ 
                            start: m.suggestedStart, 
                            id: m.id, 
                            title: m.title.native || m.title.romaji 
                        });
                    }
                });

            } catch (e) {
                console.warn("[Auto Series Bind] Failed, falling back to single bind:", e);
                // 如果系列抓取失敗，保持原本陣列為空，後面會補上單一綁定
            }

            // 3. 如果自動計算沒結果 (或失敗)，至少綁定當前這一筆
            if (newRules.length === 0) {
                newRules.push({ start: 1, id: id, title: title });
            } else {
                // 確保如果有重複的 ID (例如 id 符合 且 集數也符合)，去重一下比較保險，雖然邏輯上不太會發生
                const uniqueRules = [];
                const seenIds = new Set();
                newRules.forEach(r => {
                    if(!seenIds.has(r.id)){
                        seenIds.add(r.id);
                        uniqueRules.push(r);
                    }
                });
                newRules = uniqueRules;
            }

            // 4. 排序並儲存 (集數大的在前面)
            newRules.sort((a, b) => b.start - a.start);
            this.state.rules = newRules;
            GM_setValue(`${CONSTANTS.STORAGE_PREFIX}${this.state.bahaSn}`, this.state.rules);

            // 5. 更新狀態與 UI
            await this.determineActiveRule();
            UI.updateNav(CONSTANTS.STATUS.BOUND);
            Utils.showToast(`✅ 綁定成功！(已自動設定 ${newRules.length} 個系列作)`);
            $("#al-modal").fadeOut(200);

            // 6. 根據設定決定是否立即同步
            if (CONSTANTS.SYNC_ON_BIND && !this.state.isHunting) { this.syncProgress(); }
        },
        async fetchBahaData(url) {
            try {
                const html = await new Promise((r, j) => GM_xmlhttpRequest({ method: "GET", url, onload: x => r(x.responseText), onerror: j }));
                const doc = $(new DOMParser().parseFromString(html, "text/html"));
                const titleJp = doc.find(CONSTANTS.SELECTORS.infoTitle).eq(0).text().trim();
                const titleEn = doc.find(CONSTANTS.SELECTORS.infoTitle).eq(1).text().trim();
                const dateJpStr = doc.find(CONSTANTS.SELECTORS.infoList + ':contains("當地")').text().split("：")[1];
                const dateTwStr = doc.find(CONSTANTS.SELECTORS.infoList + ':contains("台灣")').text().split("：")[1];
                let siteDomain = "";
                const offLink = doc.find('.ACG-box1listB > li:contains("官方網站") > a').attr("href");
                if (offLink) {
                    try {
                        const u = new URL(offLink, "https://acg.gamer.com.tw");
                        siteDomain = Utils.extractDomain(u.searchParams.get('url') || offLink);
                    } catch (e) { 
                        console.error(e);
                    }
                }
                return { nameJp: titleJp, nameEn: titleEn, site: siteDomain, dateJP: { str: dateJpStr, obj: Utils.parseDateStr(dateJpStr) }, dateTW: { str: dateTwStr, obj: Utils.parseDateStr(dateTwStr) } };
            } catch (e) { console.error("Baha Data Error", e); return null; }
        },
        updateUIStatus() {
            if (!this.state.token) UI.updateNav(CONSTANTS.STATUS.TOKEN_ERROR);
            else if (this.state.rules.length === 0) UI.updateNav(CONSTANTS.STATUS.UNBOUND);
            else UI.updateNav(CONSTANTS.STATUS.BOUND);
        }
    };

    setTimeout(() => App.init(), 500);
})();