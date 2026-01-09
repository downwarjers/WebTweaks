// ==UserScript==
// @name         Bahamut Anime to AniList Sync
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      6.2
// @description  巴哈姆特動畫瘋同步到 AniList。支援系列設定、自動計算集數、自動日期匹配、深色模式UI
// @author       downwarjers
// @license      MIT
// @match        https://ani.gamer.com.tw/*
// @connect      acg.gamer.com.tw
// @connect      graphql.anilist.co
// @icon         https://ani.gamer.com.tw/apple-touch-icon-144.jpg
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bahamut-anime-to-anilist-sync/bahamut-anime-to-anilist-sync.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bahamut-anime-to-anilist-sync/bahamut-anime-to-anilist-sync.user.js
// ==/UserScript==

(function () {
	"use strict";

	// ================= [Constants] 常數管理 =================
	const CONSTANTS = {
		DEBUG: false, // 🛠️ 除錯模式開關 (true: 顯示詳細 Log)
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
			CUSTOM_SEC: "SYNC_CUSTOM_SECONDS",
		},
		SELECTORS: {
			infoTitle: ".ACG-info-container > h2",
			infoList: ".ACG-box1listA > li",
			seasonList: ".season ul li",
			playing: ".playing",
			acgLink: 'a[href*="acgDetail.php"]',
			acgLinkAlt: "a", // 用於 contains 過濾
			videoElement: "video",
		},
		STATUS: {
			TOKEN_ERROR: "token_error",
			UNBOUND: "unbound",
			BOUND: "bound",
			SYNCING: "syncing",
			DONE: "done",
			ERROR: "error",
			INFO: "info",
		},
		SYNC_MODES: {
			INSTANT: "instant",
			TWO_MIN: "2min",
			EIGHTY_PCT: "80pct",
			CUSTOM: "custom",
		},
	};

	// ================= DOM 輔助函式庫 =================
	const _ = {
		$: (s, p = document) => p.querySelector(s),
		$$: (s, p = document) => [...p.querySelectorAll(s)],
		on: (el, events, handler) =>
			events
				.split(" ")
				.forEach((evt) => el && el.addEventListener(evt, handler)),
		html: (str) => {
			const tmp = document.createElement("div");
			tmp.innerHTML = str.trim();
			return tmp.firstElementChild;
		},
		fadeIn: (el, display = "block") => {
			if (!el) return;
			el.style.opacity = 0;
			el.style.display = display;
			el.style.transition = "opacity 0.2s ease-in-out";
			requestAnimationFrame(() => (el.style.opacity = 1));
		},
		fadeOut: (el) => {
			if (!el) return;
			el.style.opacity = 0;
			setTimeout(() => (el.style.display = "none"), 200);
		},
	};

	// ================= [Utils] 工具函式與 Logger =================
	const Log = {
		info: (...args) =>
			CONSTANTS.DEBUG &&
			console.log("%c[AniList]", "color:#3db4f2;font-weight:bold;", ...args),
		warn: (...args) =>
			CONSTANTS.DEBUG &&
			console.warn("%c[AniList]", "color:#ffca28;font-weight:bold;", ...args),
		error: (...args) =>
			console.error(
				"%c[AniList Error]",
				"color:#ff5252;font-weight:bold;",
				...args,
			),
	};

	const Utils = {
		deepSanitize(input) {
			if (typeof input === "string") {
				return input
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;")
					.replace(/"/g, "&quot;")
					.replace(/'/g, "&#039;");
			}
			if (Array.isArray(input)) return input.map(Utils.deepSanitize);
			if (typeof input === "object" && input !== null) {
				const newObj = {};
				for (const key in input) newObj[key] = Utils.deepSanitize(input[key]);
				return newObj;
			}
			return input;
		},
		jsDateToInt: (d) =>
			d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(),
		dateToInt: (dObj) =>
			!dObj || !dObj.year
				? 0
				: dObj.year * 10000 + (dObj.month || 1) * 100 + (dObj.day || 1),
		formatDate: (dObj) =>
			!dObj || !dObj.year
				? "日期未定"
				: `${dObj.year}/${String(dObj.month || 1).padStart(2, "0")}/${String(dObj.day || 1).padStart(2, "0")}`,
		getFuzzyDateRange(dateObj, toleranceDays) {
			if (!dateObj || !dateObj.year) return null;
			const target = new Date(
				dateObj.year,
				(dateObj.month || 1) - 1,
				dateObj.day || 1,
			);
			const min = new Date(target);
			min.setDate(min.getDate() - toleranceDays);
			const max = new Date(target);
			max.setDate(max.getDate() + toleranceDays);
			return { start: this.jsDateToInt(min), end: this.jsDateToInt(max) };
		},
		isDateCloseEnough(targetObj, checkObj) {
			const range = this.getFuzzyDateRange(
				targetObj,
				CONSTANTS.MATCH_TOLERANCE_DAYS,
			);
			if (!range || !checkObj || !checkObj.year) return false;
			const checkInt = this.dateToInt(checkObj);
			return checkInt >= range.start && checkInt <= range.end;
		},
		parseDateStr(str) {
			if (!str) return null;
			const match = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
			if (match)
				return {
					year: parseInt(match[1]),
					month: parseInt(match[2]),
					day: parseInt(match[3]),
				};
			return null;
		},
		extractDomain(url) {
			try {
				return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
			} catch (e) {
				Log.error("URL Parse Error", e);
				return null;
			}
		},
		showToast(msg) {
			const old = _.$(".al-toast");
			if (old) old.remove();
			const t = _.html(`<div class="al-toast">${msg}</div>`);
			document.body.appendChild(t);
			_.fadeIn(t, "block");
			setTimeout(() => {
				_.fadeOut(t);
				setTimeout(() => t.remove(), 300);
			}, 2500);
		},
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
        `,
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
        .al-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; display: none; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.2s ease-in-out; }
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
        .al-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(20,20,20,0.95); border: 1px solid #444; color: #fff; padding: 10px 20px; border-radius: 20px; z-index: 100000; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; opacity: 0; transition: opacity 0.2s; }
        @keyframes al-fadein { from { opacity: 0; } to { opacity: 1; } }
    `);

	// ================= [Logic] 集數計算核心 (Native JS) =================
	const EpisodeCalculator = {
		calculateFromList(listUl, targetLi = null) {
			let currentListEp = 0;
			let lastEpNum = null;
			let resultEp = null;
			let found = false;

			const listItems = listUl.querySelectorAll("li");
			for (const li of listItems) {
				if (found && targetLi) break;
				const text = li.textContent.trim();

				if (text === "0" || text.includes(".") || !/\d/.test(text)) continue;
				const currentTextNum = parseInt(text, 10);

				if (lastEpNum === null || isNaN(currentTextNum)) {
					currentListEp++;
				} else {
					const gap = currentTextNum - lastEpNum;
					currentListEp += gap > 1 ? gap : 1;
				}

				if (!isNaN(currentTextNum)) lastEpNum = currentTextNum;

				if (targetLi && li === targetLi) {
					resultEp = currentListEp;
					found = true;
					break;
				}
			}
			return targetLi ? resultEp : currentListEp;
		},

		getCurrent() {
			const urlParams = new URLSearchParams(location.search);
			const currentSn = urlParams.get("sn");

			// 1. 透過 SN 尋找 LI (原 jQuery .closest 替換)
			let anchor = _.$(`.season ul li a[href*="sn=${currentSn}"]`);
			let targetLi = anchor ? anchor.closest("li") : null;

			// 2. 找不到則找 .playing
			if (!targetLi) {
				targetLi = _.$(
					`${CONSTANTS.SELECTORS.seasonList}${CONSTANTS.SELECTORS.playing}`,
				);
			}

			// 3. 還是找不到
			if (!targetLi) {
				return location.href.includes("animeVideo.php") ? 1 : null;
			}

			return this.calculateFromList(targetLi.closest("ul"), targetLi);
		},

		getMax() {
			const seasonUls = _.$$(".season ul");
			if (seasonUls.length === 0)
				return location.href.includes("animeVideo.php") ? 1 : 0;
			let maxEp = 0;
			seasonUls.forEach((ul) => {
				const listEp = EpisodeCalculator.calculateFromList(ul, null);
				if (listEp > maxEp) maxEp = listEp;
			});
			return maxEp;
		},
	};

	// ================= [API] AniList 通訊層 =================
	const AniListAPI = {
		getToken: () => GM_getValue(CONSTANTS.KEYS.TOKEN),
		async request(query, variables) {
			const token = this.getToken();
			if (!token && !query.includes("search")) throw new Error("Token 未設定");
			Log.info("API Request:", {
				query: query.substr(0, 50) + "...",
				variables,
			});

			return new Promise((resolve, reject) => {
				GM_xmlhttpRequest({
					method: "POST",
					url: CONSTANTS.API_URL,
					headers: {
						"Content-Type": "application/json",
						Authorization: token ? `Bearer ${token}` : undefined,
					},
					data: JSON.stringify({ query, variables }),
					onload: (r) => {
						try {
							const d = JSON.parse(r.responseText);
							if (d.errors) {
								const msg = d.errors[0].message;
								Log.warn("API Error:", msg);
								if (msg === "Invalid token") reject(new Error("Invalid token"));
								else if (r.status === 429)
									reject(new Error("Too Many Requests"));
								else reject(new Error(msg));
							} else {
								resolve(Utils.deepSanitize(d));
							}
						} catch (e) {
							Log.error("JSON Parse Error", e);
							reject(new Error("JSON 解析失敗"));
						}
					},
					onerror: (e) =>
						reject(new Error(`Network Error: ${e.statusText || "Unknown"}`)),
				});
			});
		},
		search: (term) => AniListAPI.request(GQL.SEARCH, { s: term }),
		searchByDateRange: (start, end) =>
			AniListAPI.request(GQL.SEARCH_RANGE, { start, end }),
		getMedia: (id) =>
			AniListAPI.request(GQL.GET_MEDIA, { id }).then((d) => d.data.Media),
		getUserStatus: (id) =>
			AniListAPI.request(GQL.GET_USER_STATUS, { id }).then(
				(d) => d.data.Media.mediaListEntry,
			),
		updateUserProgress: (id, p) =>
			AniListAPI.request(GQL.UPDATE_PROGRESS, { id, p }).then(
				(d) => d.data.SaveMediaListEntry,
			),
		updateUserStatus: (id, status) =>
			AniListAPI.request(GQL.UPDATE_STATUS, { id, status }).then(
				(d) => d.data.SaveMediaListEntry,
			),
		async getSequelChain(id) {
			const query = GQL.SEQUEL_CHAIN(GQL.MEDIA_FIELDS);
			const data = await this.request(query, { id });
			const root = data.data.Media;
			if (!root) return [];
			const isMovie = root.format === "MOVIE";
			const targetFormats = isMovie ? ["MOVIE"] : ["TV", "ONA", "OVA"];
			const chain = [];
			let current = root;
			const visited = new Set();
			while (current) {
				if (visited.has(current.id)) break;
				visited.add(current.id);
				chain.push(current);
				if (current.relations?.edges) {
					const sequelEdge = current.relations.edges.find(
						(e) =>
							e.relationType === "SEQUEL" &&
							targetFormats.includes(e.node.format),
					);
					current = sequelEdge ? sequelEdge.node : null;
				} else current = null;
			}
			return chain;
		},
	};

	// ================= [UI] 畫面渲染與事件 =================
	const Templates = {
		tabs: (activeTab, isVideo, hasRules) => `
            <div class="al-tabs-header">
                <button class="al-tab-btn ${activeTab === "home" ? "active" : ""}" data-tab="home" ${!isVideo ? "disabled" : ""}>主頁 / 狀態</button>
                <button class="al-tab-btn ${activeTab === "series" ? "active" : ""}" data-tab="series" ${!hasRules ? "disabled" : ""}>系列設定</button>
                <button class="al-tab-btn ${activeTab === "settings" ? "active" : ""}" data-tab="settings">設定</button>
            </div>
            <div id="tab-home" class="al-tab-content ${activeTab === "home" ? "active" : ""}"></div>
            <div id="tab-series" class="al-tab-content ${activeTab === "series" ? "active" : ""}"></div>
            <div id="tab-settings" class="al-tab-content ${activeTab === "settings" ? "active" : ""}"></div>
        `,
		settings: (token, mode, clientId, customSec) => {
			const eyeOpen = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="#ccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
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
                        <option value="instant" ${mode === "instant" ? "selected" : ""}>🚀 即時同步 (播放 5 秒後)</option>
                        <option value="2min" ${mode === "2min" ? "selected" : ""}>⏳ 觀看確認 (播放 2 分鐘後)</option>
                        <option value="80pct" ${mode === "80pct" ? "selected" : ""}>🏁 快看完時 (進度 80%)</option>
                        <option value="custom" ${mode === "custom" ? "selected" : ""}>⚙️ 自訂時間</option>
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
                    <div class="al-step-item"><span class="al-step-num">1.</span><div class="al-step-content">登入 <a href="https://anilist.co/" target="_blank" class="al-link">AniList</a> 後，前往 <a href="https://anilist.co/settings/developer" target="_blank" class="al-link">開發者設定</a>，新增 API Client。</div></div>
                    <div class="al-step-item" style="align-items:center;"><span class="al-step-num">2.</span><div class="al-step-content" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;"><span>輸入 Client ID：</span><input id="client-id" class="al-input" style="width:100px; text-align:center;" value="${clientId}" placeholder="ID"><a id="auth-link" href="#" target="_blank" class="al-bind-btn">前往授權</a></div></div>
                    <div class="al-step-item"><span class="al-step-num">3.</span><div class="al-step-content">點擊 Authorize，將網址列或頁面上的 Access Token 複製貼回上方。</div></div>
                </div>
            </div>`;
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
                            <div>${info.seasonYear || "-"} | ${info.format} | ${info.episodes || "?"} 集</div>
                            <div style="margin-top:5px; color:#4caf50; font-weight:bold;">AniList 進度: ${statusData?.progress || 0} / ${info.episodes || "?"}</div>
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
                ${
									candidate
										? `
                <div style="background:#2e2818;padding:10px;margin-bottom:15px;border-radius:5px;border:1px solid #5a4b18;">
                    <div style="font-weight:bold;color:#ffb74d;font-size:13px;margin-bottom:5px;">💡 建議匹配</div>
                    <div style="display:flex;gap:10px;align-items:flex-start;">
                        <img src="${candidate.coverImage.medium}" style="height:70px;border-radius:3px;">
                        <div style="flex:1;">
                            <div style="font-size:14px;font-weight:bold;">${candidate.title.native}</div>
                            <div style="font-size:12px;color:#aaa;">${candidate.title.romaji}</div>
                            <div style="font-size:12px;color:#888;">${candidate.seasonYear || ""} | ${candidate.format}</div>
                        </div>
                        <button id="btn-quick" class="al-bind-btn" style="align-self:center;">綁定</button>
                    </div>
                </div>`
										: ""
								}
                <div style="display:flex;gap:5px;">
                    <input id="search-in" class="al-input" value="${searchName || ""}" placeholder="搜尋...">
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
                    <div style="font-size:12px;color:#666;">${m.seasonYear || "-"} | ${m.format} | ${m.episodes || "?"}集</div>
                </div>
                <button class="al-bind-btn bind-it" data-id="${m.id}" data-title="${Utils.deepSanitize(m.title.native || m.title.romaji)}">綁定</button>
            </div>
        `,
		seriesRow: (m, isActive, isSuggestion, isOut, val) => {
			let statusText, statusColor, rowClass, btnTxt, btnClass;

			if (isActive) {
				// 狀態：已啟用 (最高優先級)
				statusText = "✅ 使用中";
				statusColor = "#66bb6a";
				rowClass = "active";
				btnTxt = "取消";
				btnClass = "disable";
			} else if (isSuggestion) {
				// 狀態：建議啟用
				statusText = "💡 建議";
				statusColor = "#ffca28";
				rowClass = "suggestion";
				btnTxt = "套用";
				btnClass = "enable";
			} else if (isOut) {
				// 狀態：非本頁範圍 (例如尚未播出的續作)
				statusText = "🚫 非本頁";
				statusColor = "#d32f2f";
				rowClass = "";
				btnTxt = "啟用";
				btnClass = "enable";
			} else {
				// 狀態：未使用 (預設)
				statusText = "⚪ 未使用";
				statusColor = "#777";
				rowClass = "";
				btnTxt = "啟用";
				btnClass = "enable";
			}
			const dateStr = Utils.formatDate(m.startDate);

			return `
                <tr class="series-row ${rowClass}" data-id="${m.id}" data-title="${Utils.deepSanitize(m.title.native || m.title.romaji)}">
                    <td style="width:80px;">
                        <span class="status-label" style="color:${statusColor};font-weight:bold;">${statusText}</span>
                        <input type="checkbox" class="cb-active" style="display:none;" ${isActive ? "checked" : ""}>
                    </td>
                    <td>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <a href="https://anilist.co/anime/${m.id}" target="_blank" style="flex-shrink:0;">
                                <img src="${m.coverImage.medium}" style="width:40px;height:60px;object-fit:cover;border-radius:3px;">
                            </a>
                            <div>
                                <a href="https://anilist.co/anime/${m.id}" target="_blank" class="al-link">${m.title.native || m.title.romaji}</a>
                                <div style="font-size:11px;color:#888;">${m.seasonYear || "-"} | ${m.format} | ${dateStr}</div>
                            </div>
                        </div>
                    </td>
                    <td style="text-align:center;width:50px;">${m.episodes || "?"}</td>
                    <td style="width:70px;"><input type="number" class="inp-start al-input" style="padding:4px;text-align:center;" value="${val}"></td>
                    <td style="width:70px;"><button class="al-toggle-btn btn-toggle ${btnClass}" data-suggested="${m.suggestedStart}">${btnTxt}</button></td>
                </tr>
            `;
		},
	};

	const UI = {
		statusTimer: null,
		initNavbar(nav) {
			if (_.$("#al-trigger")) return;
			const li = _.html(
				`<li class="al-nav-item"><a class="al-nav-link" id="al-trigger"><span id="al-icon">⚪</span><span id="al-text">AniList</span><span id="al-user-status" class="al-user-status"></span><span id="al-title" class="al-nav-title" style="display:none;"></span></a></li>`,
			);
			nav.appendChild(li);

			_.$("#al-trigger").addEventListener("click", () => this.openModal());

			const modal = _.html(
				`<div id="al-modal" class="al-modal-overlay"><div class="al-modal-content"><div class="al-modal-header"><strong>AniList 設定</strong><button class="al-close-btn">&times;</button></div><div class="al-modal-body" id="al-modal-body"></div></div></div>`,
			);
			document.body.appendChild(modal);

			_.$(".al-close-btn", modal).addEventListener("click", () =>
				_.fadeOut(modal),
			);
			modal.addEventListener("click", (e) => {
				if (e.target.id === "al-modal") _.fadeOut(modal);
			});
		},
		updateNav(type, msg) {
			const $icon = _.$("#al-icon"),
				$text = _.$("#al-text"),
				$title = _.$("#al-title"),
				$uStatus = _.$("#al-user-status");
			if (this.statusTimer) {
				clearTimeout(this.statusTimer);
				this.statusTimer = null;
			}
			const rule = App.state.activeRule;
			const showTitle =
				rule &&
				[
					CONSTANTS.STATUS.BOUND,
					CONSTANTS.STATUS.SYNCING,
					CONSTANTS.STATUS.DONE,
					CONSTANTS.STATUS.INFO,
				].includes(type);

			if (showTitle) {
				$title.textContent = rule.title;
				$title.style.display = "inline";
				if (App.state.userStatus) {
					const { status, progress } = App.state.userStatus;
					const statusMap = {
						CURRENT: "📺 觀看中",
						COMPLETED: "🎉 已看完",
						PLANNING: "📅 計畫中",
						REPEATING: "🔁 重看中",
						PAUSED: "⏸️ 暫停",
						DROPPED: "🗑️ 棄番",
					};
					let stTxt = statusMap[status] || "";
					if (progress > 0) stTxt += `【Ep.${progress}】`;
					if (stTxt) {
						$uStatus.textContent = stTxt;
						$uStatus.style.display = "inline-block";
					}
				} else $uStatus.style.display = "none";
			} else {
				$title.style.display = "none";
				$uStatus.style.display = "none";
			}

			const map = {
				[CONSTANTS.STATUS.TOKEN_ERROR]: { i: "⚠️", t: "設定 Token" },
				[CONSTANTS.STATUS.UNBOUND]: { i: "🔗", t: "連結 AniList" },
				[CONSTANTS.STATUS.BOUND]: { i: "✅", t: "已連動" },
				[CONSTANTS.STATUS.SYNCING]: { i: "🔄", t: msg },
				[CONSTANTS.STATUS.DONE]: { i: "✅", t: msg },
				[CONSTANTS.STATUS.ERROR]: { i: "❌", t: msg },
				[CONSTANTS.STATUS.INFO]: { i: "ℹ️", t: msg },
			};
			const setting = map[type] || map[CONSTANTS.STATUS.UNBOUND];
			$icon.textContent = setting.i;
			$text.textContent = setting.t;

			if (type === CONSTANTS.STATUS.DONE) {
				this.statusTimer = setTimeout(() => {
					$icon.textContent = "✅";
					$text.textContent = "已連動";
					if (App.state.userStatus) $uStatus.style.display = "inline-block";
				}, 1500);
			}
		},
		openModal() {
			_.fadeIn(_.$("#al-modal"), "flex");
			this.renderTabs();
		},
		renderTabs() {
			const isVideo = location.href.includes("animeVideo.php");
			const hasRules = App.state.rules.length > 0;
			const hasToken = !!App.state.token;
			let activeTab = hasToken ? (isVideo ? "home" : "settings") : "settings";

			const body = _.$("#al-modal-body");
			body.innerHTML = Templates.tabs(activeTab, isVideo, hasRules);

			_.$$(".al-tab-btn", body).forEach((btn) => {
				btn.addEventListener("click", () => {
					if (btn.disabled) return;
					_.$$(".al-tab-btn").forEach((b) => b.classList.remove("active"));
					btn.classList.add("active");
					_.$$(".al-tab-content").forEach((c) => c.classList.remove("active"));
					_.$(`#tab-${btn.dataset.tab}`).classList.add("active");
					UI.loadTabContent(btn.dataset.tab);
				});
			});
			this.loadTabContent(activeTab);
		},
		loadTabContent(tabName) {
			const container = _.$(`#tab-${tabName}`);
			container.innerHTML = "";
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
			const savedClientId = GM_getValue(CONSTANTS.KEYS.CLIENT_ID, "");
			const savedCustomSeconds = GM_getValue(CONSTANTS.KEYS.CUSTOM_SEC, 60);
			const eyeOpen = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="#ccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
			const eyeOff = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="#ccc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07-2.3 2.3"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

			container.innerHTML = Templates.settings(
				token,
				mode,
				savedClientId,
				savedCustomSeconds,
			);

			_.$("#toggle-token-btn", container).addEventListener(
				"click",
				function () {
					const inp = _.$("#set-token", container);
					if (inp.type === "password") {
						inp.type = "text";
						this.innerHTML = eyeOff;
					} else {
						inp.type = "password";
						this.innerHTML = eyeOpen;
					}
				},
			);

			const toggleCustom = () => {
				_.$("#custom-sec-group", container).style.display =
					_.$("#set-mode", container).value === "custom" ? "flex" : "none";
			};
			toggleCustom();
			_.$("#set-mode", container).addEventListener("change", toggleCustom);

			const updateAuth = () => {
				const id = _.$("#client-id", container).value.trim();
				const btn = _.$("#auth-link", container);
				if (id.length > 0) {
					btn.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${id}&response_type=token`;
					btn.style.cssText =
						"opacity:1;cursor:pointer;pointer-events:auto;background:#3db4f2;";
					btn.textContent = "前往授權";
					GM_setValue(CONSTANTS.KEYS.CLIENT_ID, id);
				} else {
					btn.href = "javascript:void(0)";
					btn.style.cssText =
						"opacity:0.5;cursor:not-allowed;pointer-events:none;background:#555;";
					btn.textContent = "請輸入 ID";
				}
			};
			_.$("#client-id", container).addEventListener("input", updateAuth);
			updateAuth();

			_.$("#save-set", container).addEventListener("click", () => {
				const newToken = _.$("#set-token", container).value.trim();
				const newMode = _.$("#set-mode", container).value;
				const customSec = parseInt(_.$("#set-custom-sec", container).value);
				if (!newToken) return Utils.showToast("❌ 請輸入 Token");
				if (newMode === "custom" && (isNaN(customSec) || customSec < 1))
					return Utils.showToast("❌ 請輸入有效的秒數");
				GM_setValue(CONSTANTS.KEYS.TOKEN, newToken);
				GM_setValue(CONSTANTS.KEYS.SYNC_MODE, newMode);
				if (!isNaN(customSec))
					GM_setValue(CONSTANTS.KEYS.CUSTOM_SEC, customSec);
				App.state.token = newToken;
				Utils.showToast("✅ 設定已儲存，請重新整理");
				setTimeout(() => location.reload(), 800);
			});
		},
		async renderHomeBound(container) {
			container.innerHTML = '<div style="padding:20px;">讀取中...</div>';
			const rule = App.state.activeRule;
			try {
				const [info, statusData] = await Promise.all([
					AniListAPI.getMedia(rule.id),
					AniListAPI.getUserStatus(rule.id),
				]);
				App.state.userStatus = statusData;
				UI.updateNav(CONSTANTS.STATUS.BOUND);
				const statusMap = {
					CURRENT: "Watching",
					COMPLETED: "Completed",
					PLANNING: "Plan to Watch",
					REPEATING: "Rewatching",
					PAUSED: "Paused",
					DROPPED: "Dropped",
				};
				const currentStatus = statusData?.status || "NOT_IN_LIST";
				let opts =
					currentStatus === "NOT_IN_LIST"
						? `<option value="NOT_IN_LIST" selected>Not in List</option>`
						: "";
				for (let k in statusMap)
					opts += `<option value="${k}" ${currentStatus === k ? "selected" : ""}>${statusMap[k]}</option>`;
				container.innerHTML = Templates.homeBound(rule, info, statusData, opts);

				_.$("#home-status", container).addEventListener(
					"change",
					async function () {
						const s = this.value;
						if (s === "NOT_IN_LIST") return;
						this.disabled = true;
						try {
							const newS = await AniListAPI.updateUserStatus(rule.id, s);
							App.state.userStatus = newS;
							Utils.showToast("✅ 狀態已更新");
							UI.loadTabContent("home");
						} catch (e) {
							Utils.showToast("❌ 更新失敗: " + e.message);
							this.disabled = false;
						}
					},
				);

				_.$("#home-save-id", container).addEventListener("click", () => {
					const nid = parseInt(_.$("#home-edit-id", container).value);
					if (nid) App.bindSeries(nid, "手動更新");
				});

				_.$("#btn-unbind", container).addEventListener("click", () => {
					if (confirm("確定要解除此作品的所有綁定嗎？")) {
						GM_deleteValue(`${CONSTANTS.STORAGE_PREFIX}${App.state.bahaSn}`);
						location.reload();
					}
				});
			} catch (e) {
				container.innerHTML = `<div style="padding:20px; color:red;">Error: ${e.message}</div>`;
			}
		},
		renderHomeUnbound(container) {
			const data = App.state.bahaData || {};
			container.innerHTML = Templates.homeUnbound(
				App.state.candidate,
				data.nameJp,
			);

			if (App.state.candidate) {
				_.$("#btn-quick", container).addEventListener("click", () =>
					App.bindSeries(
						App.state.candidate.id,
						App.state.candidate.title.native,
					),
				);
			}

			const doSearch = async () => {
				const resContainer = _.$("#search-res", container);
				resContainer.innerHTML =
					'<div style="text-align:center;color:#666;">搜尋中...</div>';
				try {
					const res = await AniListAPI.search(
						_.$("#search-in", container).value,
					);
					let html = "";
					const list = res.data.Page.media || [];
					if (list.length === 0)
						html =
							'<div style="text-align:center;color:#666;">找不到結果</div>';
					else
						list.forEach((m) => {
							html += Templates.searchResult(m);
						});
					resContainer.innerHTML = html;
					_.$$(".bind-it", resContainer).forEach((btn) => {
						btn.addEventListener("click", function () {
							App.bindSeries(this.dataset.id, this.dataset.title);
						});
					});
				} catch (e) {
					resContainer.innerHTML = `<div style="color:red;">Error: ${e.message}</div>`;
				}
			};

			_.$("#btn-search", container).addEventListener("click", doSearch);
			_.$("#search-in", container).addEventListener("keypress", (e) => {
				if (e.key === "Enter") doSearch();
			});
			if (data.nameJp) doSearch();
		},
		async renderSeries(container) {
			container.innerHTML =
				'<div style="padding:20px;text-align:center;">讀取系列資訊中...</div>';
			const baseId =
				App.state.rules.length > 0
					? App.state.rules[App.state.rules.length - 1].id
					: null;
			if (!baseId) {
				container.innerHTML =
					'<div style="padding:20px;text-align:center;color:#999;">請先在主頁綁定作品</div>';
				return;
			}
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
				chain.forEach((m) => {
					const existing = App.state.rules.find((r) => r.id === m.id);
					const isOut = m.suggestedStart > maxPageEp;
					const isActive = !!existing;
					const isSuggestion = !isActive && !isOut && m.suggestedStart > 1;
					const val = existing
						? existing.start
						: isActive || isSuggestion
							? m.suggestedStart
							: "";
					rowsHtml += Templates.seriesRow(
						m,
						isActive,
						isSuggestion,
						isOut,
						val,
					);
				});
				container.innerHTML = `
                    <div style="padding:15px;">
                        <table class="al-map-table">
                            <thead><tr><th>狀態</th><th>作品</th><th>集數</th><th>起始</th><th>操作</th></tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                        <button id="save-series" class="al-bind-btn" style="width:100%;margin-top:15px;padding:10px;">儲存系列設定</button>
                    </div>
                `;

				const updateRow = (row, active, val) => {
					const btn = _.$(".btn-toggle", row);
					const statusLbl = _.$(".status-label", row);
					const cb = _.$(".cb-active", row);
					const inp = _.$(".inp-start", row);

					cb.checked = active;
					if (active) {
						row.classList.add("active");
						row.classList.remove("suggestion");
						btn.textContent = "取消";
						btn.classList.replace("enable", "disable");
						statusLbl.textContent = "✅ 使用中";
						statusLbl.style.color = "#66bb6a";
						if (val !== undefined) inp.value = val;
					} else {
						row.classList.remove("active");
						btn.textContent = "啟用";
						btn.classList.replace("disable", "enable");
						statusLbl.textContent = "⚪ 未用";
						statusLbl.style.color = "#777";
						inp.value = "";
					}
				};

				_.$$(".btn-toggle", container).forEach((btn) => {
					btn.addEventListener("click", function () {
						const row = this.closest("tr");
						const cb = _.$(".cb-active", row);
						if (cb.checked) updateRow(row, false);
						else updateRow(row, true, this.dataset.suggested || "");
					});
				});

				_.$$(".inp-start", container).forEach((inp) => {
					inp.addEventListener("input", function () {
						const row = this.closest("tr");
						if (this.value) updateRow(row, true);
						else updateRow(row, false);
					});
				});

				_.$("#save-series", container).addEventListener("click", () => {
					const newRules = [];
					_.$$(".series-row", container).forEach((row) => {
						const cb = _.$(".cb-active", row);
						const val = parseInt(_.$(".inp-start", row).value);
						if (cb.checked && val) {
							newRules.push({
								start: val,
								id: parseInt(row.dataset.id),
								title: row.dataset.title,
							});
						}
					});
					if (newRules.length === 0)
						return Utils.showToast("❌ 至少需要設定一個起始集數");
					newRules.sort((a, b) => b.start - a.start);
					App.state.rules = newRules;
					GM_setValue(
						`${CONSTANTS.STORAGE_PREFIX}${App.state.bahaSn}`,
						newRules,
					);
					App.determineActiveRule();
					UI.updateNav(CONSTANTS.STATUS.BOUND);
					Utils.showToast("✅ 系列設定已儲存");
					_.fadeOut(_.$("#al-modal"));
				});
			} catch (e) {
				container.innerHTML = `<div style="padding:20px;color:red;">載入失敗: ${e.message}</div>`;
			}
		},
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
			huntTimer: null,
			lastTimeUpdate: 0,
		},
		init() {
			if (!this.state.token) Log.warn("Token 未設定");
			this.waitForNavbar();
			this.startMonitor();
			this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
		},
		waitForNavbar() {
			const t = setInterval(() => {
				const indexLink = document.querySelector('a[href="index.php"]');
				if (indexLink) {
					const nav = indexLink.closest("ul");
					if (nav) {
						clearInterval(t);
						UI.initNavbar(nav);
						this.updateUIStatus();
					}
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
			const newSn = params.get("sn");
			if (newSn && newSn !== this.state.currentUrlSn) {
				this.state.currentUrlSn = newSn;
				this.resetEpisodeState();
				this.loadEpisodeData();
				this.startVideoHunt();
			}
		},
		resetEpisodeState() {
			if (this.state.huntTimer) clearInterval(this.state.huntTimer);
			const video = document.querySelector(CONSTANTS.SELECTORS.videoElement);
			if (video) video.removeEventListener("timeupdate", this.handleTimeUpdate);
			this.state.huntTimer = null;
			this.state.hasSynced = false;
			this.state.isHunting = false;
			this.state.stopSync = false;
			this.state.tokenErrorCount = 0;
			this.state.lastTimeUpdate = 0;
		},
		async loadEpisodeData() {
			const acgLink = this.getAcgLink();
			if (!acgLink) return;
			this.state.bahaSn = new URLSearchParams(acgLink.split("?")[1]).get("s");
			if (!this.state.bahaData)
				this.state.bahaData = await this.fetchBahaData(acgLink);
			const savedRules = GM_getValue(
				`${CONSTANTS.STORAGE_PREFIX}${this.state.bahaSn}`,
			);
			if (savedRules) {
				if (Array.isArray(savedRules)) this.state.rules = savedRules;
				else
					this.state.rules = [
						{
							start: 1,
							id: savedRules.id || savedRules,
							title: savedRules.title || "Unknown",
						},
					];
				this.state.rules.sort((a, b) => b.start - a.start);
			} else {
				this.state.rules = [];
				if (this.state.token) this.tryAutoBind();
			}
			await this.determineActiveRule();
			this.updateUIStatus();
		},
		getAcgLink() {
			const el = document.querySelector(CONSTANTS.SELECTORS.acgLink);
			if (el) return el.getAttribute("href");
			const alt = [
				...document.querySelectorAll(CONSTANTS.SELECTORS.acgLinkAlt),
			].find((a) => a.textContent.includes("作品資料"));
			return alt ? alt.getAttribute("href") : null;
		},
		async determineActiveRule() {
			if (this.state.rules.length === 0) {
				this.state.activeRule = null;
				return;
			}
			const currentEp = EpisodeCalculator.getCurrent();
			if (currentEp) {
				this.state.activeRule =
					this.state.rules.find((r) => currentEp >= r.start) ||
					this.state.rules[this.state.rules.length - 1];
			} else {
				this.state.activeRule = this.state.rules[0];
			}

			if (this.state.activeRule && this.state.token) {
				try {
					const status = await AniListAPI.getUserStatus(
						this.state.activeRule.id,
					);
					this.state.userStatus = status;
					this.updateUIStatus();
				} catch (e) {
					Log.error("Fetch status error:", e);
				}
			}
		},
		startVideoHunt() {
			if (this.state.isHunting) return;
			this.state.isHunting = true;
			if (this.state.rules.length > 0)
				UI.updateNav(CONSTANTS.STATUS.SYNCING, "搜尋播放器...");
			this.state.syncSettings = {
				mode: GM_getValue(CONSTANTS.KEYS.SYNC_MODE, "instant"),
				custom: GM_getValue(CONSTANTS.KEYS.CUSTOM_SEC, 60),
			};
			let attempts = 0;
			this.state.huntTimer = setInterval(() => {
				const video = document.querySelector(CONSTANTS.SELECTORS.videoElement);
				attempts++;
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
			const now = Date.now();
			if (now - this.state.lastTimeUpdate < 1000) return;
			this.state.lastTimeUpdate = now;

			const video = e.target;
			const { mode, custom } = this.state.syncSettings;
			let shouldSync = false;
			if (mode === CONSTANTS.SYNC_MODES.INSTANT)
				shouldSync = video.currentTime > 5;
			else if (mode === CONSTANTS.SYNC_MODES.TWO_MIN)
				shouldSync = video.currentTime > 120;
			else if (mode === CONSTANTS.SYNC_MODES.EIGHTY_PCT)
				shouldSync =
					video.duration > 0 && video.currentTime / video.duration > 0.8;
			else if (mode === CONSTANTS.SYNC_MODES.CUSTOM)
				shouldSync = video.currentTime > custom;
			if (shouldSync) {
				this.state.hasSynced = true;
				this.syncProgress();
			}
		},
		async syncProgress() {
			await this.determineActiveRule();
			const ep = EpisodeCalculator.getCurrent();
			if (!ep || !this.state.activeRule) return;
			const rule = this.state.activeRule;
			const progress = ep - rule.start + 1;

			UI.updateNav(CONSTANTS.STATUS.SYNCING, `同步 Ep.${progress}...`);
			Log.info(`Syncing progress: Ep.${progress} for media ${rule.id}`);

			try {
				const checkData = await AniListAPI.getUserStatus(rule.id);
				if (checkData?.status === "COMPLETED") {
					UI.updateNav(CONSTANTS.STATUS.INFO, "略過同步(已完成)");
					return;
				}
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
				} else {
					setTimeout(() => {
						this.state.hasSynced = false;
					}, CONSTANTS.SYNC_DEBOUNCE_MS);
				}
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
					if (list.length > 0 && !this.state.candidate)
						this.state.candidate = list[0];
					match = list.find((media) => {
						return (
							Utils.isDateCloseEnough(dateJP.obj, media.startDate) ||
							Utils.isDateCloseEnough(dateTW.obj, media.startDate)
						);
					});
				} catch (e) {
					Log.warn("AutoBind Search Error:", e);
				}
				if (match) break;
			}
			if (!match && site) {
				const range = Utils.getFuzzyDateRange(
					dateJP.obj || dateTW.obj,
					CONSTANTS.SEARCH_RANGE_DAYS,
				);
				if (range) {
					try {
						const res = await AniListAPI.searchByDateRange(
							range.start,
							range.end,
						);
						const list = res.data.Page.media || [];
						match = list.find((media) => {
							const domainMatch = media.externalLinks?.some((l) =>
								Utils.extractDomain(l.url)?.includes(site),
							);
							const dateMatch =
								Utils.isDateCloseEnough(dateJP.obj, media.startDate) ||
								Utils.isDateCloseEnough(dateTW.obj, media.startDate);
							return domainMatch && dateMatch;
						});
					} catch (e) {
						Log.warn("AutoBind Range Error:", e);
					}
				}
			}
			if (match) {
				await this.bindSeries(
					match.id,
					match.title.native || match.title.romaji,
				);
			} else {
				UI.updateNav(CONSTANTS.STATUS.UNBOUND);
				if (this.state.candidate)
					Utils.showToast("🧐 找到可能的作品，請點擊確認");
			}
		},
		async bindSeries(id, title) {
			if (title === "手動更新" || title === "手動輸入") {
				try {
					const info = await AniListAPI.getMedia(id);
					title = info.title.native || info.title.romaji;
				} catch (e) {
					Log.error(e);
					title = "Unknown Title";
				}
			}
			UI.updateNav(CONSTANTS.STATUS.SYNCING, "計算系列集數...");
			let newRules = [];
			try {
				const chain = await AniListAPI.getSequelChain(id);
				const maxPageEp = EpisodeCalculator.getMax();
				chain.forEach((media, index) => {
					if (index === 0) media.suggestedStart = 1;
					else {
						const prev = chain[index - 1];
						media.suggestedStart = prev.suggestedStart + (prev.episodes || 12);
					}
				});
				chain.forEach((m) => {
					if (m.id === parseInt(id) || m.suggestedStart <= maxPageEp) {
						newRules.push({
							start: m.suggestedStart,
							id: m.id,
							title: m.title.native || m.title.romaji,
						});
					}
				});
			} catch (e) {
				Log.warn("Series Bind Failed:", e);
			}

			if (newRules.length === 0)
				newRules.push({ start: 1, id: parseInt(id), title: title });
			else {
				const uniqueRules = [];
				const seenIds = new Set();
				newRules.forEach((r) => {
					if (!seenIds.has(r.id)) {
						seenIds.add(r.id);
						uniqueRules.push(r);
					}
				});
				newRules = uniqueRules;
			}

			newRules.sort((a, b) => b.start - a.start);
			this.state.rules = newRules;
			GM_setValue(
				`${CONSTANTS.STORAGE_PREFIX}${this.state.bahaSn}`,
				this.state.rules,
			);
			await this.determineActiveRule();
			UI.updateNav(CONSTANTS.STATUS.BOUND);
			Utils.showToast(`✅ 綁定成功！(已自動設定 ${newRules.length} 個系列作)`);
			_.fadeOut(_.$("#al-modal"));
			if (CONSTANTS.SYNC_ON_BIND && !this.state.isHunting) {
				this.syncProgress();
			}
		},
		async fetchBahaData(url) {
			try {
				const html = await new Promise((r, j) =>
					GM_xmlhttpRequest({
						method: "GET",
						url,
						onload: (x) => r(x.responseText),
						onerror: j,
					}),
				);
				const doc = new DOMParser().parseFromString(html, "text/html");
				const titleJp =
					doc
						.querySelector(CONSTANTS.SELECTORS.infoTitle)
						?.textContent.trim() || "";
				const titles = doc.querySelectorAll(CONSTANTS.SELECTORS.infoTitle);
				const titleEn = titles.length > 1 ? titles[1].textContent.trim() : "";

				const listItems = [
					...doc.querySelectorAll(CONSTANTS.SELECTORS.infoList),
				];
				const dateJpStr = listItems
					.find((el) => el.textContent.includes("當地"))
					?.textContent.split("：")[1];
				const dateTwStr = listItems
					.find((el) => el.textContent.includes("台灣"))
					?.textContent.split("：")[1];

				let siteDomain = "";
				const offLinkEl = [...doc.querySelectorAll(".ACG-box1listB > li")]
					.find((el) => el.textContent.includes("官方網站"))
					?.querySelector("a");
				if (offLinkEl) {
					try {
						const u = new URL(offLinkEl.href, "https://acg.gamer.com.tw");
						siteDomain = Utils.extractDomain(
							u.searchParams.get("url") || offLinkEl.href,
						);
					} catch (e) {
						Log.error(e);
					}
				}
				return {
					nameJp: titleJp,
					nameEn: titleEn,
					site: siteDomain,
					dateJP: { str: dateJpStr, obj: Utils.parseDateStr(dateJpStr) },
					dateTW: { str: dateTwStr, obj: Utils.parseDateStr(dateTwStr) },
				};
			} catch (e) {
				Log.error("Baha Data Error", e);
				return null;
			}
		},
		updateUIStatus() {
			if (!this.state.token) UI.updateNav(CONSTANTS.STATUS.TOKEN_ERROR);
			else if (this.state.rules.length === 0)
				UI.updateNav(CONSTANTS.STATUS.UNBOUND);
			else UI.updateNav(CONSTANTS.STATUS.BOUND);
		},
	};

	setTimeout(() => App.init(), 500);
})();
