// ==UserScript==
// @name         Bahamut Anime to AniList Sync
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      6.5
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
  'use strict';

  // ================= [Constants] 常數管理 =================
  const CONSTANTS = {
    // --- 基礎與除錯設定 ---
    DEBUG: false, // 除錯模式開關
    API_URL: 'https://graphql.anilist.co', // AniList 的 API 網址

    // --- 同步與匹配邏輯設定 ---
    SYNC_DEBOUNCE_MS: 2000, // 防抖動時間 (毫秒)
    MATCH_TOLERANCE_DAYS: 2, // 開播日期匹配容許誤差 (天)
    SEARCH_RANGE_DAYS: 10, // 自動模糊搜尋範圍 (天)
    STORAGE_PREFIX: 'baha_acg_', // 本地儲存 (Local Storage) 的 key 前綴
    SYNC_ON_BIND: false, // 綁定後是否立即同步

    URLS: {
      VIDEO_PAGE: 'animeVideo.php', // 用於判斷是否在播放頁
    },

    // --- API 連線重試機制 ---
    API_MAX_RETRIES: 5, // API連線失敗時的最大重試次數
    RETRY_DELAY_MS: 3000, // 重試前的等待時間 (毫秒)

    // --- 本地儲存的鍵名 (Key Names) ---
    KEYS: {
      TOKEN: 'ANILIST_TOKEN', // AniList Access Token
      CLIENT_ID: 'ANILIST_CLIENT_ID', // Client ID
      SYNC_MODE: 'SYNC_MODE', // 同步模式的設定
      CUSTOM_SEC: 'SYNC_CUSTOM_SECONDS', // 自訂秒數的數值
    },

    // --- DOM 元素選擇器 (Selectors) ---
    // 巴哈姆特資訊
    SELECTORS: {
      // 當前頁面頁面操作
      PAGE: {
        seasonList: '.season ul li', // 動畫瘋播放頁下方的集數列表
        seasonUl: '.season ul', // 動畫瘋播放頁下方的全部列表
        playing: '.playing', // 正在播放的 CSS class
        acgLink: 'a[href*="acgDetail.php"]', // 作品資料頁的連結
        acgLinkAlt: 'a', // 備用選擇器 (用於 contains 文字搜尋)
        videoElement: 'video', // 網頁上的影片播放器元素 (<video>)
      },
      // 背景爬蟲
      PARSER: {
        infoTitle: '.ACG-info-container > h2', // 作品標題
        infoList: '.ACG-box1listA > li', // 作品資訊列表
      },
    },

    // --- 狀態代碼 (Status Codes) ---
    // 腳本內部狀態， UI 顯示的圖示/文字
    STATUS: {
      TOKEN_ERROR: 'token_error', // Token 錯誤或過期
      UNBOUND: 'unbound', // 尚未綁定 AniList 作品
      BOUND: 'bound', // 已綁定，準備就緒
      SYNCING: 'syncing', // 正在同步中
      DONE: 'done', // 同步完成
      ERROR: 'error', // 發生錯誤
      INFO: 'info', // 一般訊息提示
    },

    // --- 同步模式選項 (Sync Modes) ---
    SYNC_MODES: {
      INSTANT: { value: 'instant', label: '🚀 即時同步 (播放 5 秒後)' },
      TWO_MIN: { value: '2min', label: '⏳ 觀看確認 (播放 2 分鐘後)' },
      EIGHTY_PCT: { value: '80pct', label: '🏁 快看完時 (進度 80%)' },
      CUSTOM: { value: 'custom', label: '⚙️ 自訂時間' },
    },

    // --- AniList 狀態集中管理設定 ---
    ANI_STATUS: {
      CURRENT: { value: 'CURRENT', label: 'Watching', display: '📺 觀看中' },
      COMPLETED: { value: 'COMPLETED', label: 'Completed', display: '🎉 已看完' },
      PLANNING: { value: 'PLANNING', label: 'Plan to Watch', display: '📅 計畫中' },
      REPEATING: { value: 'REPEATING', label: 'Rewatching', display: '🔁 重看中' },
      PAUSED: { value: 'PAUSED', label: 'Paused', display: '⏸️ 暫停' },
      DROPPED: { value: 'DROPPED', label: 'Dropped', display: '🗑️ 棄番' },
    },
  };

  const ICONS = {
    EYE_OPEN: `<svg class="al-icon" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    EYE_OFF: `<svg class="al-icon" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07-2.3 2.3"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
  };

  // ================= DOM 輔助函式庫 =================
  const _ = {
    $: (s, p = document) => p.querySelector(s),
    $$: (s, p = document) => [...p.querySelectorAll(s)],
    on: (el, events, handler) =>
      events.split(' ').forEach((evt) => el && el.addEventListener(evt, handler)),
    html: (str) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = str.trim();
      return tmp.firstElementChild;
    },
    fadeIn: (el, display = 'block') => {
      if (!el) return;
      el.style.opacity = 0;
      el.style.display = display;
      el.style.transition = 'opacity 0.2s ease-in-out';
      requestAnimationFrame(() => (el.style.opacity = 1));
    },
    fadeOut: (el) => {
      if (!el) return;
      el.style.opacity = 0;
      setTimeout(() => (el.style.display = 'none'), 200);
    },
  };

  // ================= [Utils] 工具函式與 Logger =================
  const Log = {
    info: (...args) =>
      CONSTANTS.DEBUG && console.log('%c[AniList]', 'color:#3db4f2;font-weight:bold;', ...args),
    warn: (...args) =>
      CONSTANTS.DEBUG && console.warn('%c[AniList]', 'color:#ffca28;font-weight:bold;', ...args),
    error: (...args) =>
      console.error('%c[AniList Error]', 'color:#ff5252;font-weight:bold;', ...args),
    group: (...args) =>
      CONSTANTS.DEBUG &&
      console.group('%c[AniList Check]', 'color:#3db4f2;font-weight:bold;', ...args),
    groupEnd: () => CONSTANTS.DEBUG && console.groupEnd(),
  };

  const Utils = {
    deepSanitize(input) {
      if (typeof input === 'string') {
        const map = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        };
        return input.replace(/[&<>"']/g, (m) => map[m]);
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
    dateToInt: (dObj) =>
      !dObj || !dObj.year ? 0 : dObj.year * 10000 + (dObj.month || 1) * 100 + (dObj.day || 1),
    formatDate: (dObj) =>
      !dObj || !dObj.year
        ? '日期未定'
        : `${dObj.year}/${String(dObj.month || 1).padStart(2, '0')}/${String(
            dObj.day || 1,
          ).padStart(2, '0')}`,
    getFuzzyDateRange(dateObj, toleranceDays) {
      if (!dateObj || !dateObj.year) return null;
      const target = new Date(dateObj.year, (dateObj.month || 1) - 1, dateObj.day || 1);
      const min = new Date(target);
      min.setDate(min.getDate() - toleranceDays);
      const max = new Date(target);
      max.setDate(max.getDate() + toleranceDays);
      return { start: this.jsDateToInt(min), end: this.jsDateToInt(max) };
    },
    isDateCloseEnough(targetObj, checkObj) {
      const range = this.getFuzzyDateRange(targetObj, CONSTANTS.MATCH_TOLERANCE_DAYS);
      if (!range || !checkObj || !checkObj.year) return false;
      const checkInt = this.dateToInt(checkObj);
      return checkInt >= range.start && checkInt <= range.end;
    },
    parseDateStr(str) {
      if (!str || typeof str !== 'string') return null;
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
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      } catch (e) {
        Log.error('URL Parse Error', e);
        return null;
      }
    },
    showToast(msg) {
      const old = _.$('.al-toast');
      if (old) old.remove();
      const t = _.html(`<div class="al-toast">${msg}</div>`);
      document.body.appendChild(t);
      _.fadeIn(t, 'block');
      setTimeout(() => {
        _.fadeOut(t);
        setTimeout(() => t.remove(), 300);
      }, 2500);
    },
    // 選擇器檢查
    _validateGroup(scope, selectors, groupName) {
      Log.group(`🔍 Selector 檢查: ${groupName}`);
      let allGood = true;

      for (const [key, selector] of Object.entries(selectors)) {
        // 例外處理：playing 是動態 class，初始檢查時可能不存在，標記為警告但不算錯誤
        if (key === 'playing') continue;

        const el = scope.querySelector(selector);
        if (el) {
          Log.info(`✅ ${key}`, `(${selector})`, el);
        } else {
          Log.warn(`⚠️ MISSING ${key}`, `Selector: ${selector}`);
          allGood = false;
        }
      }

      if (!allGood) {
        Log.warn(`⚠️ ${groupName} 結構檢查發現缺失，可能影響功能。`);
      } else {
        Log.info(`✅ ${groupName} 結構健康。`);
      }
      Log.groupEnd();
      return allGood;
    },

    // 檢查當前頁面
    validatePage() {
      return this._validateGroup(document, CONSTANTS.SELECTORS.PAGE, 'Page (UI)');
    },

    // 檢查背景解析
    validateParser(doc) {
      return this._validateGroup(doc, CONSTANTS.SELECTORS.PARSER, 'Parser (Data)');
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
    /* =========================================
		0. Theme Variables (主題變數)
		========================================= */
    /* 亮色模式 */
    :root {
      --al-bg-color: #ffffff;
      --al-bg-sec: #f5f5f5;
      --al-text-color: #333333;
      --al-text-muted: #666666;
      --al-text-label: #444444;
      --al-border-color: #dddddd;
      --al-input-bg: #ffffff;
      --al-hover-bg: #f0f0f0;
      --al-header-bg: #eeeeee;
      --al-accent: #3db4f2;
      --al-shadow: rgba(0,0,0,0.15);
      --al-row-active: #e8f5e9;
      --al-row-suggest: #fff8e1;
    }

    /* 深色模式 */
    .al-theme-dark {
      --al-bg-color: #1b1b1b;
      --al-bg-sec: #222222;
      --al-text-color: #eeeeee;
      --al-text-muted: #aaaaaa;
      --al-text-label: #cccccc;
      --al-border-color: #333333;
      --al-input-bg: #333333;
      --al-hover-bg: #2a2a2a;
      --al-header-bg: #222222;
      --al-accent: #3db4f2;
      --al-shadow: rgba(0,0,0,0.8);
      --al-row-active: #1b2e1b;
      --al-row-suggest: #3e3315;
    }

		/* =========================================
		1. Navigation Bar (導覽列)
		========================================= */
		.al-nav-item { margin-left: 3px; padding-left: 3px; border-left: none; display: inline-flex; height: 100%; vertical-align: middle; }
		.al-nav-link { color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 13px; text-decoration: none !important; transition: 0.2s; }
		.al-nav-link:hover { color: #fff; }
		.al-nav-title { color: #888; font-size: 12px; margin-left: 8px; padding-left: 8px; border-left: 1px solid #666; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		.al-user-status { color: #4caf50; font-size: 12px; margin-left: 8px; padding-left: 8px; border-left: 1px solid #666; display: none; }
		
		@media (max-width: 1200px) { .al-nav-title { max-width: 150px; } }
		@media (max-width: 768px) { .al-nav-title, .al-user-status { display: none; } }

		/* =========================================
		2. Modal Window (彈出視窗)
		========================================= */
		.al-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: none; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.2s ease-in-out; }
		
    /* 應用變數到 Modal Content */
    .al-modal-content { 
      background: var(--al-bg-color); 
      color: var(--al-text-color); 
      width: 750px; max-height: 90vh; border-radius: 8px; display: flex; flex-direction: column; 
      border: 1px solid var(--al-border-color); 
      box-shadow: 0 10px 25px var(--al-shadow); 
    }

		.al-modal-header { padding: 15px; background: var(--al-header-bg); border-bottom: 1px solid var(--al-border-color); display: flex; justify-content: space-between; align-items: center; }
		.al-modal-body { overflow-y: auto; flex: 1; padding: 0; min-height: 300px; background: var(--al-bg-color); }
		.al-close-btn { color: #ff5252; font-weight: bold; font-size: 24px; background: none; border: none; cursor: pointer; }

		/* =========================================
		3. Tabs System (分頁切換)
		========================================= */
		.al-tabs-header { display: flex; border-bottom: 1px solid var(--al-border-color); background: var(--al-bg-sec); }
		.al-tab-btn { flex: 1; padding: 12px; cursor: pointer; border: none; background: var(--al-bg-sec); color: var(--al-text-muted); font-weight: bold; transition: 0.2s; border-bottom: 3px solid transparent;}
		.al-tab-btn:hover { background: var(--al-hover-bg); color: var(--al-accent); }
		.al-tab-btn.active { color: var(--al-accent); border-bottom-color: var(--al-accent); background: var(--al-bg-color); }
		.al-tab-btn:disabled { opacity: 0.5; cursor: not-allowed; }
		.al-tab-content { display: none; padding: 15px; animation: al-fadein 0.2s; }
		.al-tab-content.active { display: block; }

		/* =========================================
		4. Buttons (按鈕樣式)
		========================================= */
		.al-bind-btn { background: var(--al-accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; transition: 0.2s; }
		.al-bind-btn:hover { background: #2a9bd6; }
		.al-btn-grey { background: #d32f2f; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 15px; }
		.al-toggle-btn { font-size: 12px; padding: 5px 10px; border-radius: 4px; border: none; cursor: pointer; color: white; width: 100%; }
		.al-toggle-btn.enable { background-color: #388e3c; }
		.al-toggle-btn.disable { background-color: #d32f2f; }

		/* =========================================
		5. Forms & Inputs (表單與輸入框)
		========================================= */
		.al-input { padding: 8px; border: 1px solid var(--al-border-color); border-radius: 4px; background: var(--al-input-bg); color: var(--al-text-color); width: 100%; box-sizing: border-box; }
		.al-input:focus { border-color: var(--al-accent); outline: none; }
		.al-input-group { display: flex; gap: 10px; align-items: center; }
		.al-input-group-wrap { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
		.al-input-sm { width: 80px; text-align: center; }
		
		/* =========================================
		6. Search Results & Lists (搜尋與列表)
		========================================= */
		.al-result-item { padding: 12px; border-bottom: 1px solid var(--al-border-color); display: flex; gap: 15px; align-items: center; transition: background 0.2s; }
		.al-result-item:hover { background: var(--al-hover-bg); }
		
		/* =========================================
		7. Tables & Mapping (表格與對照)
		========================================= */
		.al-map-table { width: 100%; border-collapse: collapse; font-size: 13px; }
		.al-map-table th { background: var(--al-hover-bg); padding: 10px; text-align: left; border-bottom: 2px solid var(--al-border-color); color: var(--al-text-muted); }
		.al-map-table td { padding: 8px; border-bottom: 1px solid var(--al-border-color); vertical-align: middle; }
		.series-row.active { background-color: var(--al-row-active); }
		.series-row.suggestion { background-color: var(--al-row-suggest); }

		/* =========================================
		8. Steps & Instructions (教學步驟)
		========================================= */
		.al-step-card { font-size: 13px; color: var(--al-text-muted); margin-top: 15px; background: var(--al-bg-sec); padding: 12px 15px; border-radius: 6px; border: 1px solid var(--al-border-color); }
		.al-step-title { margin: 0 0 10px 0; font-weight: bold; color: var(--al-text-color); font-size: 14px; border-bottom: 1px solid var(--al-border-color); padding-bottom: 6px; }
		.al-step-item { display: flex; align-items: flex-start; margin-bottom: 8px; line-height: 1.6; }
		.al-step-num { flex-shrink: 0; width: 20px; font-weight: bold; color: var(--al-accent); }
		.al-step-content { flex: 1; }

		/* =========================================
		9. General Layout & Typography (通用排版)
		========================================= */
		.al-settings-container { padding: 20px; }
		.al-label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 14px; color: var(--al-text-color); }
		.al-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--al-border-color); }
		.al-text-muted { font-size: 13px; color: var(--al-text-muted); }
		.al-link { color: #81d4fa; text-decoration: none; font-weight: bold; }
    
    :root .al-link { color: #0288d1; }
    .al-theme-dark .al-link { color: #81d4fa; }

		.al-link:hover { text-decoration: underline; }
		.al-icon { width: 20px; height: 20px; stroke: var(--al-text-muted); stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }

		/* =========================================
		10. Notifications & Animations (通知與動畫)
		========================================= */
		.al-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(20,20,20,0.95); border: 1px solid #444; color: #fff; padding: 10px 20px; border-radius: 20px; z-index: 100000; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; opacity: 0; transition: opacity 0.2s; }
		@keyframes al-fadein { from { opacity: 0; } to { opacity: 1; } }
	`);

  // ================= [Logic] 集數計算核心 =================
  const EpisodeCalculator = {
    calculateFromList(listUl, targetLi = null) {
      let currentListEp = 0;
      let lastEpNum = null;
      let resultEp = null;
      let found = false;

      const listItems = listUl.querySelectorAll('li');
      for (const li of listItems) {
        if (found && targetLi) break;
        const text = li.textContent.trim();

        // 移除 text === "0" 的過濾，允許第 0 集
        if (text.includes('.') || !/\d/.test(text)) continue;

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
      const currentSn = urlParams.get('sn');
      let anchor = _.$(`${CONSTANTS.SELECTORS.PAGE.seasonList} a[href*="sn=${currentSn}"]`);
      let targetLi = anchor ? anchor.closest('li') : null;
      if (!targetLi) {
        targetLi = _.$(`${CONSTANTS.SELECTORS.PAGE.seasonList}${CONSTANTS.SELECTORS.PAGE.playing}`);
      }
      if (!targetLi) {
        return location.href.includes(CONSTANTS.URLS.VIDEO_PAGE) ? 1 : null;
      }
      return this.calculateFromList(targetLi.closest('ul'), targetLi);
    },
    getMax() {
      const seasonUls = _.$$(CONSTANTS.SELECTORS.PAGE.seasonUl);
      if (seasonUls.length === 0) return location.href.includes(CONSTANTS.URLS.VIDEO_PAGE) ? 1 : 0;
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
    async request(query, variables, retryCount = 0) {
      const token = this.getToken();
      if (!token && !query.includes('search')) throw new Error('Token 未設定');

      // Log: 如果是重試，顯示警告顏色
      if (retryCount > 0) {
        Log.warn(`API 重試中 (${retryCount}/${CONSTANTS.API_MAX_RETRIES})...`);
      } else {
        Log.info('API Request:', {
          query: query.substr(0, 50) + '...',
          variables,
        });
      }

      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: CONSTANTS.API_URL,
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : undefined,
            Accept: 'application/json',
          },
          data: JSON.stringify({ query, variables }),
          onload: (r) => {
            const context = {
              r,
              resolve,
              reject,
              retryCount,
              query,
              variables,
              api: this,
            };

            const strategies = [
              {
                name: 'Maintenance',
                match: (r) =>
                  r.status >= 500 ||
                  r.responseText.includes('temporarily disabled') ||
                  r.responseText.includes('stability issues'),
                execute: () => {
                  const info = 'AniList 維護中';
                  UI.updateNav(CONSTANTS.STATUS.ERROR, info);
                  Utils.showToast('⚠️ 伺服器維護中，API 暫時關閉，詳情請至 AniList Discord 查看');
                  Log.error('AniList Maintenance Mode Detected');
                  reject(new Error(info));
                },
              },
              {
                name: 'RateLimit',
                match: (r) => r.status === 429,
                execute: () => {
                  if (retryCount < CONSTANTS.API_MAX_RETRIES) {
                    const delay = CONSTANTS.RETRY_DELAY_MS * Math.pow(2, retryCount);
                    UI.updateNav(
                      CONSTANTS.STATUS.SYNCING,
                      `連線過於頻繁，重試中...(${retryCount + 1}/${CONSTANTS.API_MAX_RETRIES})`,
                    );
                    setTimeout(() => {
                      context.api
                        .request(query, variables, retryCount + 1)
                        .then(resolve)
                        .catch(reject);
                    }, delay);
                  } else {
                    throw new Error('Too Many Requests (已達重試上限)');
                  }
                },
              },
              {
                name: 'AuthError',
                match: (r) => r.status === 401 || r.responseText.includes('Invalid token'),
                execute: () => {
                  UI.updateNav(CONSTANTS.STATUS.TOKEN_ERROR);
                  Utils.showToast('❌ Token 無效或過期，請重新設定');
                  reject(new Error('Invalid Token'));
                },
              },
              {
                name: 'Success',
                match: () => true,
                execute: () => {
                  const d = JSON.parse(r.responseText);
                  if (d.errors) {
                    const msg = d.errors[0].message;
                    Log.warn('API Logic Error:', msg);
                    reject(new Error(msg));
                  } else {
                    resolve(Utils.deepSanitize(d));
                  }
                },
              },
            ];

            try {
              const activeStrategy = strategies.find((s) => s.match(r));
              if (activeStrategy) {
                Log.info(`Executing Strategy: ${activeStrategy.name}`);
                activeStrategy.execute();
              } else {
                throw new Error('Unknown Response State');
              }
            } catch (e) {
              Log.error('Strategy Execution Error', e);

              if (e.name === 'SyntaxError' && r.status >= 500) {
                UI.updateNav(CONSTANTS.STATUS.ERROR, '伺服器錯誤');
                reject(new Error('伺服器回應錯誤 (非 JSON)'));
              } else {
                reject(e);
              }
            }
          },
          onerror: (e) => {
            // 針對網路錯誤 (斷網/封包遺失) 進行重試
            if (retryCount < CONSTANTS.API_MAX_RETRIES) {
              const delay = CONSTANTS.RETRY_DELAY_MS;

              UI.updateNav(
                CONSTANTS.STATUS.SYNCING,
                `連線重試 (${retryCount + 1}/${CONSTANTS.API_MAX_RETRIES})`,
              );

              setTimeout(() => {
                this.request(query, variables, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, delay);
            } else {
              reject(new Error(`Network Error: ${e.statusText || 'Unknown'}`));
            }
          },
        });
      });
    },
    search: (term) => AniListAPI.request(GQL.SEARCH, { s: term }),
    searchByDateRange: (start, end) => AniListAPI.request(GQL.SEARCH_RANGE, { start, end }),
    getMedia: (id) => AniListAPI.request(GQL.GET_MEDIA, { id }).then((d) => d.data.Media),
    getUserStatus: (id) =>
      AniListAPI.request(GQL.GET_USER_STATUS, { id }).then((d) => d.data.Media.mediaListEntry),
    updateUserProgress: (id, p) =>
      AniListAPI.request(GQL.UPDATE_PROGRESS, { id, p }).then((d) => d.data.SaveMediaListEntry),
    updateUserStatus: (id, status) =>
      AniListAPI.request(GQL.UPDATE_STATUS, { id, status }).then((d) => d.data.SaveMediaListEntry),
    async getSequelChain(id) {
      const query = GQL.SEQUEL_CHAIN(GQL.MEDIA_FIELDS);
      const data = await this.request(query, { id });
      const root = data.data.Media;
      if (!root) return [];

      // 1. 設定目標格式
      const rootFormat = root.format;
      let targetFormats = [];
      if (['OVA', 'SPECIAL'].includes(rootFormat)) {
        targetFormats = ['OVA', 'SPECIAL'];
      } else if (rootFormat === 'MOVIE') {
        targetFormats = ['MOVIE'];
      } else {
        targetFormats = ['TV', 'TV_SHORT', 'ONA', 'OVA', 'SPECIAL'];
      }

      // 2. 遍歷鏈條
      const visited = new Map(); // 使用 Map 來避免重複並儲存節點
      // 定義要抓取的關聯類型
      const targetRelations = ['SEQUEL', 'SIDE_STORY', 'SPIN_OFF'];

      const traverse = (node) => {
        if (!node || visited.has(node.id)) return;

        // 先記錄當前節點
        visited.set(node.id, node);

        if (node.relations?.edges) {
          // 找出所有符合類型的關聯
          const relatedEdges = node.relations.edges.filter((e) =>
            targetRelations.includes(e.relationType),
          );

          // 繼續往下找
          relatedEdges.forEach((edge) => {
            if (edge.node) traverse(edge.node);
          });
        }
      };

      // 開始遍歷
      traverse(root);

      // 3. 轉為陣列並過濾格式
      let resultChain = Array.from(visited.values()).filter((media) =>
        targetFormats.includes(media.format),
      );

      resultChain.sort((a, b) => {
        const dateA = Utils.dateToInt(a.startDate);
        const dateB = Utils.dateToInt(b.startDate);
        // 如果日期一樣或缺漏，則用 ID 排序當備案
        if (dateA === dateB) return a.id - b.id;
        return dateA - dateB;
      });

      return resultChain;
    },
  };

  // ================= [UI] 畫面渲染與事件 =================
  const Templates = {
    tabs: (activeTab, isVideo, hasRules) => `
      <div class="al-tabs-header">
        <button class="al-tab-btn ${activeTab === 'home' ? 'active' : ''}" 
          data-tab="home" ${!isVideo ? 'disabled' : ''}>主頁 / 狀態</button>
        <button class="al-tab-btn ${activeTab === 'series' ? 'active' : ''}" 
          data-tab="series" ${!hasRules ? 'disabled' : ''}>系列設定</button>
        <button class="al-tab-btn ${activeTab === 'settings' ? 'active' : ''}" 
          data-tab="settings">設定</button>
        </div>
          <div id="tab-home" class="al-tab-content ${activeTab === 'home' ? 'active' : ''}"></div>
          <div id="tab-series" class="al-tab-content 
            ${activeTab === 'series' ? 'active' : ''}"></div>
          <div id="tab-settings" class="al-tab-content 
            ${activeTab === 'settings' ? 'active' : ''}">
        </div>
    `,
    settings: (token, mode, clientId, customSec) => {
      const optionsHtml = Object.values(CONSTANTS.SYNC_MODES)
        .map((m) => {
          const isSelected = mode === m.value ? 'selected' : '';
          return `<option value="${m.value}" ${isSelected}>${m.label}</option>`;
        })
        .join('');

      return `
        <div class="al-settings-container">
          <div>
            <label class="al-label">AniList Access Token</label>
            <div class="al-input-group">
              <input type="password" id="set-token" class="al-input" value="${token}" placeholder="請貼上 Token" style="flex:1;">
              <button id="toggle-token-btn" class="al-bind-btn" style="background:#333; border:1px solid #555; padding:4px 10px; height:35px; display:flex; align-items:center;">
                ${ICONS.EYE_OPEN}
              </button>
            </div>
          </div>

          <div class="al-section">
            <label class="al-label">同步觸發時機</label>
            <select id="set-mode" class="al-input">${optionsHtml} </select>
            
            <div id="custom-sec-group" class="al-input-group" style="margin-top:10px; display:none;">
              <span class="al-text-muted">播放超過：</span>
              <input type="number" id="set-custom-sec" class="al-input al-input-sm" value="${customSec}" min="1">
              <span class="al-text-muted">秒後同步</span>
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
              <div class="al-step-content al-input-group-wrap">
                <span>輸入 Client ID：</span>
                <input id="client-id" class="al-input" style="width:100px; text-align:center;" value="${clientId}" placeholder="ID">
                <a id="auth-link" href="#" target="_blank" class="al-bind-btn">前往授權</a>
              </div>
            </div>
            <div class="al-step-item">
              <span class="al-step-num">3.</span>
              <div class="al-step-content">點擊 Authorize，將網址列或頁面上的 Access Token 複製貼回上方。</div>
            </div>
          </div>
        </div>
      `;
    },
    homeBound: (rule, info, statusData, statusOptions) => `
      <div style="padding:15px;">
        <div class="al-result-item" style="background:var(--al-bg-sec); border:1px solid var(--al-border-color); border-radius:5px; align-items:flex-start;">
          <a href="https://anilist.co/anime/${rule.id}" target="_blank">
            <img src="${info.coverImage.medium}" 
              style="width:70px;height:100px;object-fit:cover;border-radius:4px;">
          </a>
          <div style="flex:1;">
            <a href="https://anilist.co/anime/${rule.id}" 
              target="_blank" class="al-link" style="font-size:16px; display:block; margin-bottom:5px;">
              ${rule.title}</a>
              
            <div style="font-size:12px;color:var(--al-text-muted);line-height:1.5;">
              <div>ID: ${rule.id}</div>
              <div>${info.title.native}</div>
              <div>${Utils.formatDate(info.startDate) || '-'} | ${info.format}</div>
              <div style="margin-top:5px; color:#4caf50; font-weight:bold;">AniList 進度: 
                ${statusData?.progress || 0} / ${info.episodes || '?'}</div>
            </div>
          </div>
        </div>
        <div style="margin-top:15px;">
          <label style="font-weight:bold;color:var(--al-text-label);font-size:13px;">切換狀態:</label>
          <select id="home-status" class="al-input" style="margin-top:5px;">${statusOptions}</select>
        </div>
        <div style="margin-top:15px; border-top:1px solid var(--al-border-color); padding-top:15px;">
          <label style="font-weight:bold;color:var(--al-text-label);font-size:13px;">手動修改 ID:</label>
          <div style="display:flex; gap:10px; margin-top:5px;">
            <input type="number" id="home-edit-id" class="al-input" value="${rule.id}">
            <button id="home-save-id" class="al-bind-btn" style="background:#555;">更新</button>
          </div>
        </div>
        <button id="btn-unbind" class="al-btn-grey">解除所有綁定</button>
      </div>
    `,
    homeUnbound: (candidate, searchName) => {
      let suggestionHtml = '';
      if (candidate) {
        suggestionHtml = `
          <div style="background:var(--al-row-suggest); padding:10px; margin-bottom:15px; border-radius:5px; border:1px solid var(--al-border-color);">
            <div style="font-weight:bold;color:var(--al-accent);font-size:13px;margin-bottom:5px;">💡 建議匹配</div>
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <a href="https://anilist.co/anime/${candidate.id}" target="_blank">
                  <img src="${candidate.coverImage.medium}" 
                    style="height:70px;border-radius:3px;">
                </a>
                <div style="flex:1;">
                  <a href="https://anilist.co/anime/${candidate.id}" 
                    target="_blank" class="al-link" style="font-weight:bold;">
                    ${candidate.title.native}
                  </a>
                  <div style="font-size:12px;color:#aaa;">${candidate.title.romaji}</div>
                  <div style="font-size:12px;color:#888;">
                    ${Utils.formatDate(candidate.startDate) || '-'} | ${candidate.format}
                  </div>
                </div>
                <button id="btn-quick" class="al-bind-btn" style="align-self:center;">綁定</button>
              </div>
          </div>
        `;
      }

      return `
        <div style="padding:15px;">
          ${suggestionHtml}
          <div style="display:flex;gap:5px;">
            <input id="search-in" class="al-input" value="${searchName || ''}" 
              placeholder="搜尋...">
            <button id="btn-search" class="al-bind-btn">搜尋</button>
          </div>
          <div id="search-res" style="margin-top:15px;"></div>
        </div>
      `;
    },
    searchResult: (m) => `
      <div class="al-result-item">
			  <a href="https://anilist.co/anime/${m.id}" target="_blank">
          <img src="${m.coverImage.medium}" 
            style="width:50px;height:75px;object-fit:cover;border-radius:3px;">
        </a>
        <div style="flex:1;overflow:hidden;">
        <a href="https://anilist.co/anime/${m.id}" 
          target="_blank" class="al-link" style="font-weight:bold;">
          ${m.title.native || m.title.romaji}</a>
        <div style="font-size:12px;color:var(--al-text-muted);">${m.title.romaji}</div>
        <div style="font-size:12px;color:var(--al-text-muted);">
          ${Utils.formatDate(m.startDate) || '-'} | 
          ${m.format} | ${m.episodes || '?'}集</div>
        </div>
        <button class="al-bind-btn bind-it" data-id="${m.id}" 
          data-title="${Utils.deepSanitize(m.title.native || m.title.romaji)}">綁定</button>
      </div>
    `,
    // Templates 物件
    seriesRow: (m, isActive, isSuggestion, isOut, bahaVal, aniVal) => {
      let statusText, statusColor, rowClass, btnTxt, btnClass;
      if (isActive) {
        statusText = '✅ 使用中';
        statusColor = '#66bb6a';
        rowClass = 'active';
        btnTxt = '取消';
        btnClass = 'disable';
      } else if (isSuggestion) {
        statusText = '💡 建議';
        statusColor = '#ffca28';
        rowClass = 'suggestion';
        btnTxt = '套用';
        btnClass = 'enable';
      } else if (isOut) {
        statusText = '🚫 非本頁';
        statusColor = '#d32f2f';
        rowClass = '';
        btnTxt = '啟用';
        btnClass = 'enable';
      } else {
        statusText = '⚪ 未使用';
        statusColor = '#777';
        rowClass = '';
        btnTxt = '啟用';
        btnClass = 'enable';
      }

      let defaultAniVal = '';
      if (isActive) {
        defaultAniVal = aniVal;
      } else if (isSuggestion) {
        defaultAniVal = 1;
      }

      return `
				<tr class="series-row ${rowClass}" data-id="${m.id}" 
          data-title="${Utils.deepSanitize(m.title.native || m.title.romaji)}">
					<td style="width:80px; text-align:center;">
						<span class="status-label" style="color:${statusColor};font-weight:bold;">${statusText}</span>
						<input type="checkbox" class="cb-active" style="display:none;" ${isActive ? 'checked' : ''}>
					</td>
					<td>
						<div style="display:flex; gap:10px; align-items:center;">
							<a href="https://anilist.co/anime/${m.id}" target="_blank" style="flex-shrink:0;">
								<img src="${m.coverImage.medium}" 
                  style="width:40px;height:60px;object-fit:cover;border-radius:3px;">
							</a>
							<div style="display:flex; flex-direction:column; gap:4px;">
								<a href="https://anilist.co/anime/${m.id}" 
                  target="_blank" class="al-link" style="line-height:1.2;">
                    ${m.title.native || m.title.romaji}</a>
								<div style="font-size:11px;color:var(--al-text-muted);">
                  ${Utils.formatDate(m.startDate) || '-'} | ${m.format}</div>
							</div>
						</div>
					</td>
					<td style="text-align:center;width:60px;">${m.episodes || '?'}</td>
					
					<td style="width:70px;">
						<input type="number" class="inp-start al-input" placeholder="巴哈" style="padding:4px;text-align:center;" 
              value="${bahaVal !== undefined ? bahaVal : ''}">
					</td>
					<td style="width:20px;text-align:center;color:#666;">⮕</td>
					<td style="width:70px;">
						<input type="number" class="inp-ani-start al-input" placeholder="AniList" style="padding:4px;text-align:center;" value="${defaultAniVal}">
					</td>
					
					<td style="width:70px;text-align:center;">
						<button class="al-toggle-btn btn-toggle ${btnClass}" 
              data-suggested="${m.suggestedStart}">${btnTxt}</button>
					</td>
				</tr>
			`;
    },
  };

  const UI = {
    statusTimer: null,
    checkTheme() {
      const modalContent = _.$('.al-modal-content');
      if (!modalContent) return;

      const moonBtn = document.getElementById('darkmode-moon');
      // 如果月亮按鈕存在且被勾選，則加入 dark class
      if (moonBtn && moonBtn.checked) {
        modalContent.classList.add('al-theme-dark');
      } else {
        modalContent.classList.remove('al-theme-dark');
      }
    },
    initNavbar(nav) {
      if (_.$('#al-trigger')) return;
      const li = _.html(
        `<li class="al-nav-item"><a class="al-nav-link" id="al-trigger"><span id="al-icon">⚪</span><span id="al-text">AniList</span><span id="al-user-status" class="al-user-status"></span><span id="al-title" class="al-nav-title" style="display:none;"></span></a></li>`,
      );
      nav.appendChild(li);

      _.$('#al-trigger').addEventListener('click', () => this.openModal());

      // Modal 結構建立
      const modal = _.html(
        `<div id="al-modal" class="al-modal-overlay"><div class="al-modal-content"><div class="al-modal-header"><strong>AniList 設定</strong><button class="al-close-btn">&times;</button></div><div class="al-modal-body" id="al-modal-body"></div></div></div>`,
      );
      document.body.appendChild(modal);

      _.$('.al-close-btn', modal).addEventListener('click', () => _.fadeOut(modal));
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'al-modal') _.fadeOut(modal);
      });

      // 深色模式切換按鈕
      const themeRadios = document.querySelectorAll('input[name="darkmode"]');
      themeRadios.forEach((radio) => {
        radio.addEventListener('change', () => this.checkTheme());
      });

      // 初始化時檢查一次主題
      this.checkTheme();
    },
    updateNav(type, msg) {
      const $icon = _.$('#al-icon'),
        $text = _.$('#al-text'),
        $title = _.$('#al-title'),
        $uStatus = _.$('#al-user-status');

      if (!$icon || !$text || !$title || !$uStatus) return;

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
        $title.style.display = 'inline';
        if (App.state.userStatus) {
          const { status, progress } = App.state.userStatus;
          const statusConfig = CONSTANTS.ANI_STATUS[status];
          let stTxt = statusConfig ? statusConfig.display : '';
          if (progress > 0) stTxt += `【Ep.${progress}】`;
          if (stTxt) {
            $uStatus.textContent = stTxt;
            $uStatus.style.display = 'inline-block';
          }
        } else $uStatus.style.display = 'none';
      } else {
        $title.style.display = 'none';
        $uStatus.style.display = 'none';
      }

      const map = {
        [CONSTANTS.STATUS.TOKEN_ERROR]: { i: '⚠️', t: '設定 Token' },
        [CONSTANTS.STATUS.UNBOUND]: { i: '🔗', t: '連結 AniList' },
        [CONSTANTS.STATUS.BOUND]: { i: '✅', t: '已連動' },
        [CONSTANTS.STATUS.SYNCING]: { i: '🔄', t: msg },
        [CONSTANTS.STATUS.DONE]: { i: '✅', t: msg },
        [CONSTANTS.STATUS.ERROR]: { i: '❌', t: msg },
        [CONSTANTS.STATUS.INFO]: { i: 'ℹ️', t: msg },
      };
      const setting = map[type] || map[CONSTANTS.STATUS.UNBOUND];
      $icon.textContent = setting.i;
      $text.textContent = setting.t;

      if (type === CONSTANTS.STATUS.DONE) {
        this.statusTimer = setTimeout(() => {
          $icon.textContent = '✅';
          $text.textContent = '已連動';
          if (App.state.userStatus) $uStatus.style.display = 'inline-block';
        }, 1500);
      }
    },
    openModal() {
      _.fadeIn(_.$('#al-modal'), 'flex');
      this.renderTabs();
    },
    renderTabs() {
      const isVideo = location.href.includes(CONSTANTS.URLS.VIDEO_PAGE);
      const hasRules = App.state.rules.length > 0;
      const hasToken = !!App.state.token;
      let activeTab = hasToken ? (isVideo ? 'home' : 'settings') : 'settings';

      const body = _.$('#al-modal-body');
      body.innerHTML = Templates.tabs(activeTab, isVideo, hasRules);

      _.$$('.al-tab-btn', body).forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.disabled || btn.classList.contains('active')) return;
          _.$$('.al-tab-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          _.$$('.al-tab-content').forEach((c) => c.classList.remove('active'));
          _.$(`#tab-${btn.dataset.tab}`).classList.add('active');
          UI.loadTabContent(btn.dataset.tab);
        });
      });
      this.loadTabContent(activeTab);
    },
    loadTabContent(tabName) {
      const container = _.$(`#tab-${tabName}`);
      container.innerHTML = '';
      if (tabName === 'settings') this.renderSettings(container);
      else if (tabName === 'series') this.renderSeries(container);
      else {
        if (App.state.rules.length > 0) this.renderHomeBound(container);
        else this.renderHomeUnbound(container);
      }
    },
    renderSettings(container) {
      const token = GM_getValue(CONSTANTS.KEYS.TOKEN, '');
      const mode = GM_getValue(CONSTANTS.KEYS.SYNC_MODE, 'instant');
      const savedClientId = GM_getValue(CONSTANTS.KEYS.CLIENT_ID, '');
      const savedCustomSeconds = GM_getValue(CONSTANTS.KEYS.CUSTOM_SEC, 60);

      container.innerHTML = Templates.settings(token, mode, savedClientId, savedCustomSeconds);

      _.$('#toggle-token-btn', container).addEventListener('click', function () {
        const inp = _.$('#set-token', container);
        if (inp.type === 'password') {
          inp.type = 'text';
          this.innerHTML = ICONS.EYE_OFF;
        } else {
          inp.type = 'password';
          this.innerHTML = ICONS.EYE_OPEN;
        }
      });

      const toggleCustom = () => {
        _.$('#custom-sec-group', container).style.display =
          _.$('#set-mode', container).value === 'custom' ? 'flex' : 'none';
      };
      toggleCustom();
      _.$('#set-mode', container).addEventListener('change', toggleCustom);

      const updateAuth = () => {
        const id = _.$('#client-id', container).value.trim();
        const btn = _.$('#auth-link', container);
        if (id.length > 0) {
          btn.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${id}&response_type=token`;
          btn.style.cssText = 'opacity:1;cursor:pointer;pointer-events:auto;background:#3db4f2;';
          btn.textContent = '前往授權';
          GM_setValue(CONSTANTS.KEYS.CLIENT_ID, id);
        } else {
          btn.href = 'javascript:void(0)';
          btn.style.cssText = 'opacity:0.5;cursor:not-allowed;pointer-events:none;background:#555;';
          btn.textContent = '請輸入 ID';
        }
      };
      _.$('#client-id', container).addEventListener('input', updateAuth);
      updateAuth();

      _.$('#save-set', container).addEventListener('click', () => {
        const newToken = _.$('#set-token', container).value.trim();
        const newMode = _.$('#set-mode', container).value;
        const customSec = parseInt(_.$('#set-custom-sec', container).value);
        if (!newToken) return Utils.showToast('❌ 請輸入 Token');
        if (newMode === 'custom' && (isNaN(customSec) || customSec < 1))
          return Utils.showToast('❌ 請輸入有效的秒數');
        GM_setValue(CONSTANTS.KEYS.TOKEN, newToken);
        GM_setValue(CONSTANTS.KEYS.SYNC_MODE, newMode);
        if (!isNaN(customSec)) GM_setValue(CONSTANTS.KEYS.CUSTOM_SEC, customSec);
        App.state.token = newToken;
        Utils.showToast('✅ 設定已儲存，請重新整理');
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

        const settings = CONSTANTS.ANI_STATUS;
        const currentStatus = statusData?.status || 'NOT_IN_LIST';

        let opts =
          currentStatus === 'NOT_IN_LIST'
            ? `<option value="NOT_IN_LIST" selected>Not in List</option>`
            : '';

        Object.values(settings).forEach((setting) => {
          const isSelected = currentStatus === setting.value ? 'selected' : '';
          opts += `<option value="${setting.value}" ${isSelected}>${setting.label}</option>`;
        });

        container.innerHTML = Templates.homeBound(rule, info, statusData, opts);

        _.$('#home-status', container).addEventListener('change', async function () {
          const s = this.value;
          if (s === 'NOT_IN_LIST') return;
          this.disabled = true;
          try {
            const newS = await AniListAPI.updateUserStatus(rule.id, s);
            App.state.userStatus = newS;
            Utils.showToast('✅ 狀態已更新');
            UI.loadTabContent('home');
          } catch (e) {
            Utils.showToast('❌ 更新失敗: ' + e.message);
            this.disabled = false;
          }
        });

        _.$('#home-save-id', container).addEventListener('click', () => {
          const nid = parseInt(_.$('#home-edit-id', container).value);
          if (nid) App.bindSeries(nid, '手動更新');
        });

        _.$('#btn-unbind', container).addEventListener('click', () => {
          if (confirm('確定要解除此作品的所有綁定嗎？')) {
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
      container.innerHTML = Templates.homeUnbound(App.state.candidate, data.nameJp);

      if (App.state.candidate) {
        _.$('#btn-quick', container).addEventListener('click', () =>
          App.bindSeries(App.state.candidate.id, App.state.candidate.title.native),
        );
      }

      const doSearch = async () => {
        const resContainer = _.$('#search-res', container);
        resContainer.innerHTML = '<div style="text-align:center;color:#666;">搜尋中...</div>';
        try {
          const res = await AniListAPI.search(_.$('#search-in', container).value);
          let html = '';
          const list = res.data.Page.media || [];
          if (list.length === 0)
            html = '<div style="text-align:center;color:#666;">找不到結果</div>';
          else
            list.forEach((m) => {
              html += Templates.searchResult(m);
            });
          resContainer.innerHTML = html;
          _.$$('.bind-it', resContainer).forEach((btn) => {
            btn.addEventListener('click', function () {
              App.bindSeries(this.dataset.id, this.dataset.title);
            });
          });
        } catch (e) {
          resContainer.innerHTML = `<div style="color:red;">Error: ${e.message}</div>`;
        }
      };

      _.$('#btn-search', container).addEventListener('click', doSearch);
      _.$('#search-in', container).addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doSearch();
      });
      if (data.nameJp) doSearch();
    },
    async renderSeries(container) {
      container.innerHTML = '<div style="padding:20px;text-align:center;">讀取系列資訊中...</div>';
      const baseId =
        App.state.rules.length > 0 ? App.state.rules[App.state.rules.length - 1].id : null;
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
        let rowsHtml = '';
        chain.forEach((m) => {
          const existing = App.state.rules.find((r) => r.id === m.id);
          const isOut = m.suggestedStart > maxPageEp;
          const isActive = !!existing;
          const isSuggestion = !isActive && !isOut && m.suggestedStart >= 1; // 允許大於等於1

          // 取得現有設定值 (Baha 和 AniList)
          const bahaVal = existing
            ? existing.bahaStart !== undefined
              ? existing.bahaStart
              : existing.start
            : isSuggestion
            ? m.suggestedStart
            : '';
          const aniVal = existing ? (existing.aniStart !== undefined ? existing.aniStart : 1) : 1;

          rowsHtml += Templates.seriesRow(
            m,
            isActive,
            isSuggestion,
            isOut,
            bahaVal, // 傳入 bahaVal
            aniVal, // 傳入 aniVal
          );
        });
        container.innerHTML = `
					<div style="padding:15px;">
						<table class="al-map-table">
							<thead>
								<tr>
									<th style="width:80px; text-align:center;">狀態</th>
									<th>作品</th>
									<th style="width:60px; text-align:center; white-space:nowrap;">總集數</th>
									<th style="width:70px; text-align:center; white-space:nowrap;">巴哈對應<br>集數起始</th>
									<th style="width:20px;"></th>
									<th style="width:70px; text-align:center; white-space:nowrap;">AniList對應<br>集數起始</th>
									<th style="width:70px; text-align:center;">操作</th>
								</tr>
							</thead>
							<tbody>${rowsHtml}</tbody>
						</table>
						<button id="save-series" class="al-bind-btn" style="width:100%;margin-top:15px;padding:10px;">儲存系列設定</button>
					</div>
				`;

        const updateRow = (row, active, val) => {
          const btn = _.$('.btn-toggle', row);
          const statusLbl = _.$('.status-label', row);
          const cb = _.$('.cb-active', row);
          const inp = _.$('.inp-start', row);
          const inpAni = _.$('.inp-ani-start', row);

          cb.checked = active;
          if (active) {
            row.classList.add('active');
            row.classList.remove('suggestion');
            btn.textContent = '取消';
            btn.classList.replace('enable', 'disable');
            statusLbl.textContent = '✅ 使用中';
            statusLbl.style.color = '#66bb6a';
            if (val !== undefined) inp.value = val;
            if (val !== undefined && val !== '') inp.value = val;
            if (inpAni.value === '') inpAni.value = 1; // 啟用時預設填入 1
          } else {
            row.classList.remove('active');
            btn.textContent = '啟用';
            btn.classList.replace('disable', 'enable');
            statusLbl.textContent = '⚪ 未用';
            statusLbl.style.color = '#777';
            inp.value = '';
          }
        };

        _.$$('.btn-toggle', container).forEach((btn) => {
          btn.addEventListener('click', function () {
            const row = this.closest('tr');
            const cb = _.$('.cb-active', row);
            if (cb.checked) updateRow(row, false);
            else updateRow(row, true, this.dataset.suggested || '');
          });
        });

        _.$$('.inp-start', container).forEach((inp) => {
          inp.addEventListener('input', function () {
            const row = this.closest('tr');
            if (this.value) updateRow(row, true);
            else updateRow(row, false);
          });
        });

        _.$('#save-series', container).addEventListener('click', () => {
          const newRules = [];
          _.$$('.series-row', container).forEach((row) => {
            const cb = _.$('.cb-active', row);
            const bahaVal = parseInt(_.$('.inp-start', row).value);
            const aniVal = parseInt(_.$('.inp-ani-start', row).value);

            // 允許輸入 0，只要不是 NaN 即可
            if (cb.checked && !isNaN(bahaVal) && !isNaN(aniVal)) {
              newRules.push({
                start: bahaVal, // 用於排序
                bahaStart: bahaVal, // 儲存明確變數
                aniStart: aniVal, // 儲存明確變數
                id: parseInt(row.dataset.id),
                title: row.dataset.title,
              });
            }
          });
          if (newRules.length === 0) return Utils.showToast('❌ 至少需要設定一個起始集數');
          newRules.sort((a, b) => b.start - a.start);
          App.state.rules = newRules;
          GM_setValue(`${CONSTANTS.STORAGE_PREFIX}${App.state.bahaSn}`, newRules);
          App.determineActiveRule();
          UI.updateNav(CONSTANTS.STATUS.BOUND);
          Utils.showToast('✅ 系列設定已儲存');
          _.fadeOut(_.$('#al-modal'));
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
      Utils.validatePage(); //檢查CSS選擇器
      if (!this.state.token) Log.warn('Token 未設定');
      this.waitForNavbar();
      this.startMonitor();
      this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
    },
    waitForNavbar() {
      const t = setInterval(() => {
        const indexLink = document.querySelector('a[href="index.php"]');
        if (indexLink) {
          const nav = indexLink.closest('ul');
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
      if (!location.href.includes(CONSTANTS.URLS.VIDEO_PAGE)) return;
      const params = new URLSearchParams(location.search);
      const newSn = params.get('sn');
      if (newSn && newSn !== this.state.currentUrlSn) {
        this.state.currentUrlSn = newSn;
        this.resetEpisodeState();
        this.loadEpisodeData();
        this.startVideoHunt();
      }
    },
    resetEpisodeState() {
      if (this.state.huntTimer) clearInterval(this.state.huntTimer);
      const video = document.querySelector(CONSTANTS.SELECTORS.PAGE.videoElement);
      if (video) video.removeEventListener('timeupdate', this.handleTimeUpdate);
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
      this.state.bahaSn = new URLSearchParams(acgLink.split('?')[1]).get('s');
      if (!this.state.bahaData) this.state.bahaData = await this.fetchBahaData(acgLink);
      const savedRules = GM_getValue(`${CONSTANTS.STORAGE_PREFIX}${this.state.bahaSn}`);
      if (savedRules) {
        if (Array.isArray(savedRules)) this.state.rules = savedRules;
        else
          this.state.rules = [
            {
              start: 1,
              id: savedRules.id || savedRules,
              title: savedRules.title || 'Unknown',
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
      const el = document.querySelector(CONSTANTS.SELECTORS.PAGE.acgLink);
      if (el) return el.getAttribute('href');
      const alt = [...document.querySelectorAll(CONSTANTS.SELECTORS.PAGE.acgLinkAlt)].find((a) =>
        a.textContent.includes('作品資料'),
      );
      return alt ? alt.getAttribute('href') : null;
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
          const status = await AniListAPI.getUserStatus(this.state.activeRule.id);
          this.state.userStatus = status;
          this.updateUIStatus();
        } catch (e) {
          Log.error('Fetch status error:', e);
        }
      }
    },
    startVideoHunt() {
      if (this.state.isHunting) return;
      this.state.isHunting = true;
      if (this.state.rules.length > 0) UI.updateNav(CONSTANTS.STATUS.SYNCING, '搜尋播放器...');
      this.state.syncSettings = {
        mode: GM_getValue(CONSTANTS.KEYS.SYNC_MODE, 'instant'),
        custom: GM_getValue(CONSTANTS.KEYS.CUSTOM_SEC, 60),
      };
      let attempts = 0;
      this.state.huntTimer = setInterval(() => {
        const video = document.querySelector(CONSTANTS.SELECTORS.PAGE.videoElement);
        attempts++;
        if (video && video.dataset.alHooked !== this.state.currentUrlSn) {
          video.dataset.alHooked = this.state.currentUrlSn;
          video.addEventListener('timeupdate', this.handleTimeUpdate);
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

      if (mode === CONSTANTS.SYNC_MODES.INSTANT.value) {
        shouldSync = video.currentTime > 5;
      } else if (mode === CONSTANTS.SYNC_MODES.TWO_MIN.value) {
        shouldSync = video.currentTime > 120;
      } else if (mode === CONSTANTS.SYNC_MODES.EIGHTY_PCT.value) {
        shouldSync = video.duration > 0 && video.currentTime / video.duration > 0.8;
      } else if (mode === CONSTANTS.SYNC_MODES.CUSTOM.value) {
        shouldSync = video.currentTime > custom;
      }

      if (shouldSync) {
        this.state.hasSynced = true;
        this.syncProgress();
      }
    },
    async syncProgress() {
      const ep = EpisodeCalculator.getCurrent();
      if (ep === null || !this.state.activeRule) return;

      const rule = this.state.activeRule;

      const bahaStart = rule.bahaStart !== undefined ? rule.bahaStart : rule.start;
      const aniStart = rule.aniStart !== undefined ? rule.aniStart : 1;

      let progress = ep - bahaStart + aniStart;

      UI.updateNav(CONSTANTS.STATUS.SYNCING, `同步 Ep.${progress}...`);
      Log.info(`Syncing progress: Ep.${progress} for media ${rule.id}`);

      try {
        const mediaInfo = await AniListAPI.getMedia(rule.id);
        const maxEp = mediaInfo.episodes;

        if (maxEp && progress > maxEp) {
          Log.info(`Progress clamped from ${progress} to ${maxEp}`);
          progress = maxEp;
        }

        const checkData = await AniListAPI.getUserStatus(rule.id);

        if (
          checkData?.status === CONSTANTS.ANI_STATUS.COMPLETED.value &&
          checkData?.progress === maxEp
        ) {
          UI.updateNav(CONSTANTS.STATUS.INFO, '略過同步(已完成)');
          return;
        } else if (
          checkData?.status === CONSTANTS.ANI_STATUS.PLANNING.value ||
          checkData?.status === CONSTANTS.ANI_STATUS.PAUSED.value
        ) {
          Log.info(`Auto switching status from ${checkData?.status} to CURRENT`);
          await AniListAPI.updateUserStatus(rule.id, 'CURRENT');
        }

        let result = await AniListAPI.updateUserProgress(rule.id, progress);

        this.state.userStatus = result;

        if (maxEp && progress === maxEp && result.status !== CONSTANTS.ANI_STATUS.COMPLETED.value) {
          Log.info('Auto completing media...');
          result = await AniListAPI.updateUserStatus(rule.id, CONSTANTS.ANI_STATUS.COMPLETED.value);
          this.state.userStatus = result; // 若有自動完結，再次更新狀態
          UI.updateNav(CONSTANTS.STATUS.DONE, `已同步 Ep.${progress} (完結)`);
        } else {
          UI.updateNav(CONSTANTS.STATUS.DONE, `已同步 Ep.${progress}`);
        }
      } catch (e) {
        const errStr = e.message;
        UI.updateNav(CONSTANTS.STATUS.ERROR, '同步失敗');
        if (errStr.includes('Token') || errStr.includes('401')) {
          this.state.tokenErrorCount++;
          if (this.state.tokenErrorCount >= 3) this.state.stopSync = true;
          UI.updateNav(CONSTANTS.STATUS.TOKEN_ERROR);
        } else if (errStr.includes('Too Many Requests')) {
          this.state.stopSync = true;
          Utils.showToast('⚠️ 請求過於頻繁，已暫停同步');
        } else {
          setTimeout(() => {
            this.state.hasSynced = false;
          }, CONSTANTS.SYNC_DEBOUNCE_MS);
        }
      }
    },
    async tryAutoBind() {
      if (!this.state.bahaData) return;

      UI.updateNav(CONSTANTS.STATUS.SYNCING, '自動匹配中...');

      const context = {
        data: this.state.bahaData,
        api: AniListAPI,
        utils: Utils,
      };

      const strategies = [
        // 1.使用日文或英文名搜尋，並比對開播日期
        {
          name: 'NameSearch',
          execute: async (ctx) => {
            const { nameEn, nameJp, dateJP, dateTW } = ctx.data;
            const terms = [nameEn, nameJp].filter(Boolean);

            for (let term of terms) {
              try {
                const res = await ctx.api.search(term);
                const list = res.data.Page.media || [];

                if (list.length > 0 && !App.state.candidate) {
                  App.state.candidate = list[0];
                }

                const match = list.find((media) => {
                  return (
                    ctx.utils.isDateCloseEnough(dateJP.obj, media.startDate) ||
                    ctx.utils.isDateCloseEnough(dateTW.obj, media.startDate)
                  );
                });

                if (match) return match;
              } catch (e) {
                Log.warn(`[AutoBind] NameSearch Error (${term}):`, e);
              }
            }
            return null;
          },
        },
        // 2.當名字搜不到時，改搜前後幾天開播的所有動畫，再比對官網網域
        {
          name: 'DateRangeDomainSearch',
          execute: async (ctx) => {
            const { dateJP, dateTW, site } = ctx.data;
            if (!site) return null;

            const range = ctx.utils.getFuzzyDateRange(
              dateJP.obj || dateTW.obj,
              CONSTANTS.SEARCH_RANGE_DAYS,
            );

            if (!range) return null;

            try {
              const res = await ctx.api.searchByDateRange(range.start, range.end);
              const list = res.data.Page.media || [];

              return list.find((media) => {
                const domainMatch = media.externalLinks?.some((l) =>
                  ctx.utils.extractDomain(l.url)?.includes(site),
                );
                // 雙重確認：網域對了，日期也要大致對
                const dateMatch =
                  ctx.utils.isDateCloseEnough(dateJP.obj, media.startDate) ||
                  ctx.utils.isDateCloseEnough(dateTW.obj, media.startDate);
                return domainMatch && dateMatch;
              });
            } catch (e) {
              Log.warn('[AutoBind] DateRangeSearch Error:', e);
              return null;
            }
          },
        },
      ];

      let match = null;
      for (const strategy of strategies) {
        Log.info(`Executing AutoBind Strategy: ${strategy.name}`);
        match = await strategy.execute(context);
        if (match) {
          Log.info(`[AutoBind] Matched by ${strategy.name}:`, match.title.native);
          break;
        }
      }

      if (match) {
        await this.bindSeries(match.id, match.title.native || match.title.romaji);
      } else {
        UI.updateNav(CONSTANTS.STATUS.UNBOUND);
        if (this.state.candidate) Utils.showToast('🧐 找到可能的作品，請點擊確認');
      }
    },
    async bindSeries(id, title) {
      if (title === '手動更新' || title === '手動輸入') {
        try {
          const info = await AniListAPI.getMedia(id);
          title = info.title.native || info.title.romaji;
        } catch (e) {
          Log.error(e);
          title = 'Unknown Title';
        }
      }
      UI.updateNav(CONSTANTS.STATUS.SYNCING, '計算系列集數...');
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
        Log.warn('Series Bind Failed:', e);
      }

      if (newRules.length === 0) newRules.push({ start: 1, id: parseInt(id), title: title });
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
      GM_setValue(`${CONSTANTS.STORAGE_PREFIX}${this.state.bahaSn}`, this.state.rules);
      await this.determineActiveRule();
      UI.updateNav(CONSTANTS.STATUS.BOUND);
      Utils.showToast(`✅ 綁定成功！(已自動設定 ${newRules.length} 個系列作)`);
      _.fadeOut(_.$('#al-modal'));
      if (CONSTANTS.SYNC_ON_BIND && !this.state.isHunting) {
        this.syncProgress();
      }
    },
    async fetchBahaData(url) {
      try {
        const html = await new Promise((r, j) =>
          GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload: (x) => r(x.responseText),
            onerror: j,
          }),
        );
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (CONSTANTS.DEBUG) {
          Utils.validateParser(doc);
        } else {
          if (!doc.querySelector(CONSTANTS.SELECTORS.PARSER.infoTitle)) {
            Log.error('Parser Error: 找不到標題，巴哈可能改版');
          }
        }

        const titleJp =
          doc.querySelector(CONSTANTS.SELECTORS.PARSER.infoTitle)?.textContent.trim() || '';
        const titles = doc.querySelectorAll(CONSTANTS.SELECTORS.PARSER.infoTitle);
        const titleEn = titles.length > 1 ? titles[1].textContent.trim() : '';

        const getTextFromList = (items, keyword) => {
          const found = items.find((el) => el.textContent.includes(keyword));
          if (!found) return null;
          const parts = found.textContent.split('：');
          return parts.length > 1 ? parts[1].trim() : null;
        };

        const listItems = [...doc.querySelectorAll(CONSTANTS.SELECTORS.PARSER.infoList)];
        const dateJpStr = getTextFromList(listItems, '當地');
        const dateTwStr = getTextFromList(listItems, '台灣');

        let siteDomain = '';
        const offLinkEl = [...doc.querySelectorAll('.ACG-box1listB > li')]
          .find((el) => el.textContent.includes('官方網站'))
          ?.querySelector('a');

        if (offLinkEl) {
          try {
            const rawHref = offLinkEl.getAttribute('href');
            if (rawHref) {
              const u = new URL(rawHref, 'https://acg.gamer.com.tw');
              siteDomain = Utils.extractDomain(u.searchParams.get('url') || rawHref);
            }
          } catch (e) {
            Log.error('Domain Parse Error', e);
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
        Log.error('Baha Data Error', e);
        return null;
      }
    },
    updateUIStatus() {
      if (!this.state.token) UI.updateNav(CONSTANTS.STATUS.TOKEN_ERROR);
      else if (this.state.rules.length === 0) UI.updateNav(CONSTANTS.STATUS.UNBOUND);
      else UI.updateNav(CONSTANTS.STATUS.BOUND);
    },
  };

  setTimeout(() => App.init(), 500);
})();
