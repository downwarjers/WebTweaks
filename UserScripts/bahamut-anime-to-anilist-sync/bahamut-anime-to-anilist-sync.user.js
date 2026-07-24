// ==UserScript==
// @name                 Bahamut Anime to AniList Sync
// @name:zh-TW           巴哈姆特動畫瘋同步到 AniList
// @name:zh-CN           巴哈姆特动画疯同步到 AniList
// @namespace            https://github.com/downwarjers/WebTweaks
// @version              7.0.0
// @description          巴哈姆特動畫瘋同步到 AniList。支援系列設定、自動計算集數、自動日期匹配、深色模式UI
// @description:zh-TW    巴哈姆特動畫瘋同步到 AniList。支援系列設定、自動計算集數、自動日期匹配、深色模式UI
// @description:zh-CN    巴哈姆特动画疯同步到 AniList。支持系列设置、自动计算集数、自动日期匹配、深色模式UI
// @author               downwarjers
// @license              MIT
// @match                https://ani.gamer.com.tw/*
// @connect              acg.gamer.com.tw
// @connect              graphql.anilist.co
// @connect              myanimelist.net
// @connect              cal.syoboi.jp
// @connect              ja.wikipedia.org
// @icon                 https://ani.gamer.com.tw/apple-touch-icon-144.jpg
// @run-at               document-idle
// @grant                GM_xmlhttpRequest
// @grant                GM_setValue
// @grant                GM_getValue
// @grant                GM_deleteValue
// @grant                GM_addStyle
// @grant                GM_setClipboard
// @noframes
// @downloadURL https://update.greasyfork.org/scripts/563959/Bahamut%20Anime%20to%20AniList%20Sync.user.js
// @updateURL https://update.greasyfork.org/scripts/563959/Bahamut%20Anime%20to%20AniList%20Sync.meta.js
// // ==/UserScript==

(function () {
  'use strict';

  // #region ================= [Constants] 常數管理 =================
  const CONSTANTS = {
    // --- 基礎與除錯設定 ---
    DEBUG: false, // 除錯模式開關
    API_URL: 'https://graphql.anilist.co', // AniList 的 API 網址

    // --- OAuth 設定 ---
    ANILIST_CLIENT_ID: '35264',

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
      SYNC_MODE: 'SYNC_MODE', // 同步模式的設定
      CUSTOM_SEC: 'SYNC_CUSTOM_SECONDS', // 自訂秒數的數值
      CUSTOM_PCT: 'SYNC_CUSTOM_PERCENTAGE', // 自訂百分比的數值
      OVERRIDE_MODE: 'SYNC_OVERRIDE_MODE', // 同步策略
      SHOW_ALL_SERIES: 'SYNC_SHOW_ALL_SERIES', // 是否顯示系列完整格式
      SHOW_INLINE_INFO: 'SYNC_SHOW_INLINE_INFO', // 頁面內嵌聲優/主題曲開關
    },

    // --- DOM 元素選擇器 (Selectors) ---
    SELECTORS: {
      // 巴哈姆特資訊
      BAHA: {
        // 當前頁面頁面操作
        PAGE: {
          seasonList: '.season ul li', // 動畫瘋播放頁下方的集數列表
          seasonUl: '.season ul', // 動畫瘋播放頁下方的全部列表
          playing: '.playing', // 正在播放的 CSS class
          acgLink: 'a[href*="acgDetail.php"]', // 作品資料頁的連結
          acgLinkAlt: 'a', // 備用選擇器 (用於 contains 文字搜尋)
          videoElement: 'video', // 網頁上的影片播放器元素 (<video>)
          inlineContainer: '.anime-option', // 內嵌資訊容器 (聲優/主題曲)
        },
        // 背景爬蟲
        PARSER: {
          infoTitle: '.ACG-info-container > h2', // 作品標題
          infoList: '.ACG-box1listA > li', // 作品資訊列表
        },
      },
      //MyAmimeList.net (MAL) 的資訊
      MAL: {
        externalLinks: '.external_links', // 外部連結區
        syoboiLink: 'a[href*="cal.syoboi.jp/tid/"]', // Syoboi Url
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
      STANDBY: 'standby', //待機
    },

    // --- 同步模式選項 (Sync Modes) ---
    SYNC_MODES: {
      INSTANT: { value: 'instant', label: '🚀 即時同步 (播放 5 秒後)' },
      TWO_MIN: { value: '2min', label: '⏳ 觀看確認 (播放 2 分鐘後)' },
      EIGHTY_PCT: { value: '80pct', label: '🏁 快看完時 (進度 80%)' },
      CUSTOM_SEC: { value: 'custom_sec', label: '⚙️ 自訂時間 (秒)' },
      CUSTOM_PCT: { value: 'custom_pct', label: '📊 自訂進度 (%)' },
      PAUSED: { value: 'paused', label: '⏸️ 暫停同步' },
    },

    // --- AniList 狀態 ---
    ANI_STATUS: {
      CURRENT: { value: 'CURRENT', label: '📺 觀看中', anilist_label: 'Watching' },
      COMPLETED: { value: 'COMPLETED', label: '🎉 已看完', anilist_label: 'Completed' },
      PLANNING: { value: 'PLANNING', label: '📅 計畫中', anilist_label: 'Plan to watch' },
      REPEATING: { value: 'REPEATING', label: '🔁 重看中', anilist_label: 'Rewatching' },
      PAUSED: { value: 'PAUSED', label: '⏸️ 暫停', anilist_label: 'Paused' },
      DROPPED: { value: 'DROPPED', label: '🗑️ 棄番', anilist_label: 'Dropped' },
    },

    // --- 放映狀態 ---
    MEDIA_STATUS: {
      FINISHED: '已完結',
      RELEASING: '連載中',
      NOT_YET_RELEASED: '尚未開播',
      CANCELLED: '已取消',
      HIATUS: '暫停連載',
    },

    // --- 同步策略選項 ---
    OVERRIDE_MODES: {
      PROTECT: { value: 'protect', label: '🛡️ 保護進度 (總是以最新觀看集數為主)' },
      PROMPT: {
        value: 'prompt',
        label: '💬 彈出詢問 (以最新觀看集數為主，觀看舊集數時詢問是否覆蓋)',
      },
      ALWAYS: { value: 'always', label: '⚠️ 強制覆蓋 (總是以當前觀看集數為主)' },
    },

    DEFAULTS: {
      TOKEN: '',
      SYNC_MODE: 'instant',
      CUSTOM_SEC: 60,
      CUSTOM_PCT: 80,
      OVERRIDE_MODE: 'protect',
      SHOW_INLINE_INFO: false,
    },
  };

  const ICONS = {
    EYE_OPEN: `<svg class="al-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    EYE_OFF: `<svg class="al-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07-2.3 2.3"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
  };
  // #endregion

  // #region ================= [DOM] 輔助函式庫 =================
  const _ = {
    $: (s, p = document) => {
      return p.querySelector(s);
    },
    $$: (s, p = document) => {
      return [...p.querySelectorAll(s)];
    },
    on: (el, events, handler) => {
      return events.split(' ').forEach((evt) => {
        return el && el.addEventListener(evt, handler);
      });
    },
    html: (str) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = str.trim();
      return tmp.firstElementChild;
    },
    fadeIn: (el, displayType = 'block') => {
      if (!el) {
        return;
      }
      el.style.display = displayType;
      requestAnimationFrame(() => {
        el.classList.remove('al-hidden');
        el.classList.add('al-visible');
      });
    },
    fadeOut: (el) => {
      if (!el) {
        return;
      }
      el.classList.remove('al-visible');
      el.classList.add('al-hidden');

      setTimeout(() => {
        if (el.classList.contains('al-hidden')) {
          el.style.display = 'none';
        }
      }, 200);
    },
    waitForElement(selector, timeout = 10000) {
      return new Promise((resolve) => {
        const el = document.querySelector(selector);
        if (el) {
          return resolve(el);
        }
        const observer = new MutationObserver(() => {
          const el = document.querySelector(selector);
          if (el) {
            observer.disconnect();
            resolve(el);
          }
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
        setTimeout(() => {
          observer.disconnect();
          Log.warn(`Timeout waiting for element: ${selector}`);
          resolve(null);
        }, timeout);
      });
    },
  };
  // #endregion

  // #region ================= [Utils] 工具函式與 Logger =================
  const Log = {
    info: (...args) => {
      return (
        CONSTANTS.DEBUG && console.log('%c[AniList]', 'color:#3db4f2;font-weight:bold;', ...args)
      );
    },
    warn: (...args) => {
      return (
        CONSTANTS.DEBUG && console.warn('%c[AniList]', 'color:#ffca28;font-weight:bold;', ...args)
      );
    },
    error: (...args) => {
      return console.error('%c[AniList Error]', 'color:#ff5252;font-weight:bold;', ...args);
    },
    group: (...args) => {
      return (
        CONSTANTS.DEBUG &&
        console.group('%c[AniList Check]', 'color:#3db4f2;font-weight:bold;', ...args)
      );
    },
    groupEnd: () => {
      return CONSTANTS.DEBUG && console.groupEnd();
    },
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
        return input.replace(/[&<>"']/g, (m) => {
          return map[m];
        });
      }
      if (Array.isArray(input)) {
        return input.map(Utils.deepSanitize);
      }
      if (typeof input === 'object' && input !== null) {
        const newObj = {};
        for (const key in input) {
          newObj[key] = Utils.deepSanitize(input[key]);
        }
        return newObj;
      }
      return input;
    },
    decodeHTML(html) {
      if (!html) {
        return '';
      }
      const txt = document.createElement('textarea');
      txt.innerHTML = html;
      return txt.value;
    },
    jsDateToInt: (d) => {
      return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    },
    toJsDate(dObj, maximize = false) {
      if (!dObj?.year) {
        return null;
      }

      let month = dObj.month;
      let day = dObj.day;

      if (maximize) {
        month = month || 12;
        day = day || new Date(dObj.year, month, 0).getDate();
      } else {
        month = month || 1;
        day = day || 1;
      }

      return new Date(dObj.year, month - 1, day);
    },
    formatDate: (dObj) => {
      // 1. 若無年份，直接回傳未定
      if (!dObj || !dObj.year) {
        return '日期未定';
      }

      // 2. 若無月份，僅顯示年份
      if (!dObj.month) {
        return `${dObj.year}`;
      }

      // 3. 若無日期，顯示至月份
      if (!dObj.day) {
        return `${dObj.year}/${String(dObj.month).padStart(2, '0')}`;
      }

      // 4. 具備完整年、月、日
      return `${dObj.year}/${String(dObj.month).padStart(2, '0')}/${String(dObj.day).padStart(2, '0')}`;
    },
    getFuzzyDateRange(dateObj, toleranceDays) {
      const target = this.toJsDate(dateObj);
      if (!target) {
        return null;
      }

      // 利用原生 Date 自動處理跨月/跨年 (例如: 10/31 + 1天 會自動變 11/1)
      const min = new Date(target);
      min.setDate(min.getDate() - toleranceDays);

      const max = new Date(target);
      max.setDate(max.getDate() + toleranceDays);

      return { start: this.jsDateToInt(min), end: this.jsDateToInt(max) };
    },
    isDateCloseEnough(targetObj, checkObj) {
      const target = this.toJsDate(targetObj);
      const check = this.toJsDate(checkObj);

      if (!target || !check) {
        return false;
      }

      // 取得毫秒差，換算成天數
      const diffTime = Math.abs(target.getTime() - check.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays <= CONSTANTS.MATCH_TOLERANCE_DAYS;
    },
    parseDateStr(str) {
      if (!str || typeof str !== 'string') {
        return null;
      }
      const match = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (match) {
        return {
          year: parseInt(match[1]),
          month: parseInt(match[2]),
          day: parseInt(match[3]),
        };
      }
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
    extractCast(mediaData) {
      if (!mediaData?.characters?.edges) {
        return [];
      }

      return mediaData.characters.edges
        .map((edge) => {
          // 角色名稱：優先使用 native (日文原名)，若無則用 full
          const charName = edge.node?.name?.native || edge.node?.name?.full || '未知角色';

          // 日本配音員：取第一個日文 CV
          const actor = edge.voiceActors?.[0];
          if (!actor) {
            return null;
          }

          const cvName = actor.name?.native || actor.name?.full || '未知聲優';

          return {
            char: charName,
            cv: cvName,
            role: edge.role, // MAIN (主角) 或 SUPPORTING (配角)
          };
        })
        .filter(Boolean); // 過濾掉沒有 CV 的項目
    },
    /**
     * 根據 URL 動態解析並回傳友善的來源名稱
     * @param {string} url - 資料來源的網址
     * @returns {string} - 友善顯示名稱
     */
    getSourceName(url) {
      if (!url) {
        return '未知來源';
      }

      if (url.includes('syoboi.jp')) {
        return 'しょぼいカレンダー';
      }
      if (url.includes('anilist.co')) {
        return 'AniList';
      }

      // 若為其他外連網址，動態擷取 Hostname 作為預設顯示名稱
      try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        return hostname;
      } catch (e) {
        Log.error('URL Parse Error', e);
        return '外部來源';
      }
    },
    // 選擇器檢查
    _validateGroup(scope, selectors, groupName) {
      Log.group(`🔍 Selector 檢查: ${groupName}`);

      const allGood = Object.entries(selectors).every(([key, selector]) => {
        if (key === 'playing') {
          return true;
        } // 例外

        const el = scope.querySelector(selector);
        if (el) {
          Log.info(`✅ ${key}`, `(${selector})`, el);
          return true;
        } else {
          Log.warn(`⚠️ MISSING ${key}`, `Selector: ${selector}`);
          return false;
        }
      });

      if (!allGood) {
        Log.warn(`⚠️ ${groupName} 結構檢查發現缺失。`);
      } else {
        Log.info(`✅ ${groupName} 結構健康。`);
      }

      Log.groupEnd();
      return allGood;
    },

    // 檢查當前頁面
    validatePage() {
      return this._validateGroup(document, CONSTANTS.SELECTORS.BAHA.PAGE, 'Page (UI)');
    },

    // 檢查背景解析
    validateParser(doc) {
      return this._validateGroup(doc, CONSTANTS.SELECTORS.BAHA.PARSER, 'Parser (Data)');
    },
  };
  // #endregion

  // #region ================= [State] 狀態控制器 =================
  const State = {
    // --- 1. 基礎設定與認證 ---
    syncSettings: {}, // 同步設定 (觸發模式、自訂秒數)
    tokenErrorCount: 0, // Token 錯誤計數 (連續錯誤則停止同步)

    // --- 2. 作品與綁定資料 ---
    bahaSn: null, // 巴哈姆特作品 SN (系列 ID)
    bahaData: null, // 巴哈姆特頁面爬蟲取得的資料 (標題、日期等)
    rules: [], // 系列作對應規則列表 (Baha集數 -> AniList ID)
    activeRule: null, // 目前集數適用的對應規則
    candidate: null, // 自動搜尋到的候選 AniList 作品 (未綁定時用)
    userStatus: null, // 使用者在 AniList 上的觀看進度與狀態

    // --- 3. 執行狀態與計時器 ---
    currentUrlSn: null, // 目前網址上的 SN (單集 ID)，用於偵測換集
    hasSynced: false, // 本集是否已執行過同步 (防止重複發送)
    isHunting: false, // 是否正在搜尋播放器元素 (<video>)
    stopSync: false, // 全域停止同步開關 (發生嚴重錯誤或頻繁請求時)
    isMaintenance: false, // 伺服器維護狀態
    // huntTimer: null, // 搜尋播放器的 setInterval ID
    lastTimeUpdate: 0, // 上次處理 timeupdate 事件的時間戳
    currentRequestId: 0, // 請求版本號（解決 Race Condition）

    // --- 4. API 資料快取 (Cache) ---
    cachedViewer: null, // [主頁快取] 使用者資訊
    cachedMediaInfo: null, // [主頁快取] 作品詳細資訊 + 使用者狀態 (合併查詢結果)
    cachedSeriesChain: null, // [系列頁快取] 系列作關聯列表 (Sequel Chain)
    cachedSeriesBaseId: null, // [系列頁快取識別] 記錄目前的系列快取是基於哪個 ID 查詢的
    cachedCreditsData: null, // Syoboi 與 Wiki 資料快取
  };
  // #endregion

  // #region ================= [GraphQL] 查詢字串 =================
  const GQL = {
    MEDIA_FIELDS: `id idMal title { romaji native } status coverImage { medium } format episodes seasonYear startDate { year month day }`,
    SEARCH: `query($s:String){Page(page:1,perPage:10){media(search:$s,type:ANIME,sort:SEARCH_MATCH){id idMal title{romaji english native} status coverImage{medium} episodes seasonYear startDate{year month day} format externalLinks{url site}}}}`,
    SEARCH_RANGE: `query ($start:FuzzyDateInt,$end:FuzzyDateInt){Page(page:1,perPage:100){media(startDate_greater:$start,startDate_lesser:$end,type:ANIME,format_in:[MOVIE]){id idMal title{romaji native} status startDate{year month day}externalLinks{url site}}}}`,
    GET_MEDIA: `query ($id:Int){Media(id:$id){id idMal title{romaji native} status coverImage{medium}seasonYear episodes startDate{year month day} format }}`,
    GET_USER_STATUS: `query ($id:Int){Media(id:$id){mediaListEntry{status progress}}}`,
    UPDATE_PROGRESS: `mutation ($id:Int,$p:Int){SaveMediaListEntry(mediaId:$id,progress:$p){id progress status}}`,
    UPDATE_STATUS: `mutation ($id:Int,$status:MediaListStatus){SaveMediaListEntry(mediaId:$id,status:$status){id progress status}}`,
    GET_VIEWER: `query { Viewer { id name } }`,
    SEQUEL_CHAIN: (fields) => {
      return `
            query ($id: Int) {
                Media(id: $id) { ${fields} relations { edges { relationType(version: 2) node { ${fields} relations { edges { relationType(version: 2) node { ${fields} relations { edges { relationType(version: 2) node { ${fields} } } } } } } } } } } }`;
    },
    GET_MEDIA_AND_STATUS: `query ($id: Int) {
        Media(id: $id) {
            id idMal title { romaji native } status coverImage { medium } episodes seasonYear startDate { year month day } format
            mediaListEntry { status progress id }
            characters(sort: [ROLE, RELEVANCE], perPage: 25) {
                edges {
                    role
                    node {
                        name { native full }
                    }
                    voiceActors(language: JAPANESE) {
                        id
                        name { native full }
                    }
                }
            }
        }
    }`,
  };
  // #endregion

  // #region ================= [Styles] CSS =================
  GM_addStyle(`
    /* 1. 變數與主題 */
    /* 亮色模式 */
    :root {
      --al-bg: #ffffff;
      --al-bg-sec: #f8f9fa;
      --al-bg-hover: #f1f5f9;
      --al-text: #1f2937;
      --al-text-sub: #6b7280;
      --al-border: #e2e8f0;
      --al-primary: #3db4f2;
      --al-primary-h: #0ea5e9;
      --al-danger: #ef4444;
      --al-danger-h: #dc2626;
      --al-success: #10b981;
      --al-warn: #f59e0b;
      --al-nav-border: #666;
      --al-radius: 6px;
      --al-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    /* 暗色模式 */
    .al-theme-dark {
      --al-bg: #1b1b1b;
      --al-bg-sec: #222222;
      --al-bg-hover: #374151;
      --al-text: #f9fafb;
      --al-text-sub: #9ca3af;
      --al-border: #374151;
      --al-primary: #3db4f2;
      --al-primary-h: #7dd3fc;
    }

    /* 2. 排版工具 */
    .al-flex { display: flex; }
    .al-flex-col { flex-direction: column; }
    .al-items-center { align-items: center; }
    .al-justify-between { justify-content: space-between; }
    .al-justify-center { justify-content: center; }
    .al-shrink-0 { flex-shrink: 0; }
    .al-w-full { width: 100%; }

    .al-gap-1 { gap: 4px; }
    .al-gap-2 { gap: 8px; }
    .al-gap-3 { gap: 12px; }
    
    /* Padding */
    .al-p-1 { padding: 4px; }
    .al-pt-1 { padding-top: 4px; } .al-pb-1 { padding-bottom: 4px; }
    .al-pl-1 { padding-left: 4px; } .al-pr-1 { padding-right: 4px; }
    .al-p-2 { padding: 8px; }
    .al-pt-2 { padding-top: 8px; } .al-pb-2 { padding-bottom: 8px; }
    .al-pl-2 { padding-left: 8px; } .al-pr-2 { padding-right: 8px; }
    .al-p-3 { padding: 12px; }
    .al-pt-3 { padding-top: 12px; } .al-pb-3 { padding-bottom: 12px; }
    .al-pl-3 { padding-left: 12px; } .al-pr-3 { padding-right: 12px; }
    .al-p-4 { padding: 16px; }
    .al-pt-4 { padding-top: 16px; } .al-pb-4 { padding-bottom: 16px; }
    .al-pl-4 { padding-left: 16px; } .al-pr-4 { padding-right: 16px; }
    .al-p-5 { padding: 20px; }

    /* Margin */
    .al-m-1 { margin: 4px; }
    .al-mt-1 { margin-top: 4px; } .al-mb-1 { margin-bottom: 4px; }
    .al-ml-1 { margin-left: 4px; } .al-mr-1 { margin-right: 4px; }
    .al-m-2 { margin: 8px; }
    .al-mt-2 { margin-top: 8px; } .al-mb-2 { margin-bottom: 8px; }
    .al-ml-2 { margin-left: 8px; } .al-mr-2 { margin-right: 8px; }
    .al-m-3 { margin: 12px; }
    .al-mt-3 { margin-top: 12px; } .al-mb-3 { margin-bottom: 12px; }
    .al-ml-3 { margin-left: 12px; } .al-mr-3 { margin-right: 12px; }
    .al-m-4 { margin: 16px; }
    .al-mt-4 { margin-top: 16px; } .al-mb-4 { margin-bottom: 16px; }
    .al-ml-4 { margin-left: 16px; } .al-mr-4 { margin-right: 16px; }

    /* 3. 文字與連結 */
    .al-text-sm { font-size: 13px; }
    .al-text-xs { font-size: 12px; }
    .al-text-base { font-size: 14px; }
    .al-text-lg { font-size: 15px; }
    .al-font-bold { font-weight: 600; }
    .al-text-sub { color: var(--al-text-sub); }
    .al-text-primary { color: var(--al-primary); }
    .al-text-success { color: var(--al-success); font-weight: bold; }
    .al-link { color: var(--al-primary); text-decoration: none; cursor: pointer; }
    .al-link:hover { text-decoration: underline; }

    /* 4. 元件 - 按鈕 */
    .al-btn {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 6px 12px; font-size: 13px; font-weight: 500;
      border-radius: var(--al-radius); border: 1px solid transparent;
      cursor: pointer; transition: 0.15s; background: var(--al-bg-sec); color: var(--al-text);
      white-space: nowrap;
    }
    .al-btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .al-btn:active { transform: translateY(0); }
    .al-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    
    .al-btn-primary { background: var(--al-primary); color: #fff; }
    .al-btn-success { background: var(--al-success); color: #fff; }
    
    /* 紅色按鈕 (用於取消/解除綁定) */
    .al-btn-danger { background: var(--al-danger); color: #fff; }
    .al-btn-danger:hover { background: var(--al-danger-h); }

    /* 線框按鈕 (預設狀態) */
    .al-btn-outline { background: transparent; border-color: var(--al-border); color: var(--al-text-sub); }
    .al-btn-outline:hover { border-color: var(--al-text-sub); color: var(--al-text); background: var(--al-bg-hover); }
    
    .al-btn-sm { padding: 4px 10px; font-size: 12px; height: 28px; }
    .al-btn-block { width: 100%; display: flex; }

    /* 5. 元件 - 輸入框 */
    .al-input {
      background: var(--al-bg); color: var(--al-text);
      border: 1px solid var(--al-border); border-radius: var(--al-radius);
      padding: 8px; width: 100%; box-sizing: border-box; transition: 0.2s;
    }
    .al-input:focus { outline: none; border-color: var(--al-primary); box-shadow: 0 0 0 2px rgba(61, 180, 242, 0.2); }
    .al-input-sm { padding: 4px; text-align: center; height: 30px; }

    /* 6. 元件 - 圖片 */
    .al-cover { object-fit: cover; border-radius: 4px; background: var(--al-bg-hover); display: block; }
    .al-cover-lg { width: 85px; height: 120px; }
    .al-cover-md { width: 60px; height: 85px; }
    .al-cover-sm { width: 50px; height: 70px; min-width: 50px; } 
    .al-icon { width: 16px; height: 16px; vertical-align: middle; }

    /* 7. 卡片與容器 */
    .al-card { background: var(--al-bg-sec); border: 1px solid var(--al-border); border-radius: var(--al-radius); padding: 12px; }
    .al-card-suggest { background: #fffbeb; border-color: #fcd34d; }
    .al-theme-dark .al-card-suggest { background: #451a03; border-color: #78350f; }

    /* 8. 表格 (系列設定) */
    .al-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
      margin-top: 8px;
      table-layout: fixed;
    }
    .al-table th {
      text-align: center;
      padding: 8px 10px;
      border-bottom: 2px solid var(--al-border);
      color: var(--al-text-sub);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      background: var(--al-bg-sec);
    }
    .al-table th:nth-child(2) { text-align: left; }
    .al-table td {
      padding: 10px 8px;
      border-bottom: 1px solid var(--al-border);
      vertical-align: middle;
      height: 64px;
    }
    .al-table .inp-start::-webkit-outer-spin-button,
    .al-table .inp-start::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .al-table .inp-start {
      -moz-appearance: textfield;
      text-align: center;
      font-weight: 600;
      height: 32px;
      border-radius: 6px;
      border: 1px solid var(--al-border);
      background: var(--al-bg);
      transition: all 0.15s ease;
    }
    .al-table .inp-start:focus {
      border-color: var(--al-primary);
      box-shadow: 0 0 0 2px rgba(61, 180, 242, 0.2);
    }
    .al-table .btn-toggle {
      width: 64px;
      height: 32px;
      padding: 0;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
    }

    .al-row-active { background-color: rgba(61, 180, 242, 0.08); } 
    .al-row-suggest { background-color: rgba(245, 158, 11, 0.08); }

    /* 9. 狀態標籤 */
    .al-tag { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap; line-height: 1; }
    .al-tag.success { background: #d1fae5; color: #059669; }
    .al-tag.warn { background: #fef3c7; color: #d97706; }
    .al-tag.error { background: #fee2e2; color: #dc2626; }
    .al-tag.default { background: #e5e7eb; color: #6b7280; }
    
    .al-theme-dark .al-tag.success { background: #064e3b; color: #6ee7b7; }
    .al-theme-dark .al-tag.warn { background: #451a03; color: #fcd34d; }
    .al-theme-dark .al-tag.error { background: #7f1d1d; color: #fca5a5; }
    .al-theme-dark .al-tag.default { background: #374151; color: #9ca3af; }

    /* Modal & Tabs & Nav (維持不變) */
    .al-modal-overlay { position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
    .al-modal-content { background: var(--al-bg); color: var(--al-text); width: 750px; max-height: 90vh; display: flex; flex-direction: column; border-radius: 8px; box-shadow: var(--al-shadow); border: 1px solid var(--al-border); }
    .al-modal-header { padding: 12px 16px; border-bottom: 1px solid var(--al-border); display: flex; justify-content: space-between; align-items: center; background: var(--al-bg-sec); border-radius: 8px 8px 0 0; }
    .al-modal-body { overflow-y: auto; flex: 1; padding: 0; min-height: 300px; }
    .al-close-btn { background: none; border: none; font-size: 20px; color: var(--al-text-sub); cursor: pointer; }

    .al-tabs-nav { display: flex; border-bottom: 1px solid var(--al-border); background: var(--al-bg-sec); }
    .al-tab-item { flex: 1; padding: 12px; text-align: center; cursor: pointer; color: var(--al-text-sub); font-weight: 600; font-size: 13px; border-bottom: 2px solid transparent; transition: 0.2s; background: none; border: none; }
    .al-tab-item.active { color: var(--al-primary); border-bottom-color: var(--al-primary); background: var(--al-bg); }
    .al-tab-item:disabled { opacity: 0.5; cursor: not-allowed; }
    .al-tab-pane { display: none; animation: al-fadein 0.2s; }
    .al-tab-pane.active { display: block; }

    .al-nav-item { float: left; }
    .al-nav-link { display: flex; align-items: center; cursor: pointer; border-left: 1px solid var(--al-nav-border) !important; font-size: 13px; }
    #al-user-status, #al-title { border-left: 1px solid var(--al-nav-border); padding-left: 8px; margin-left: 8px; }
    .al-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #1f2937; color: #fff; padding: 8px 20px; border-radius: 99px; font-size: 13px; z-index: 100000; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
    #al-title {
        flex-shrink: 1;
        max-width: clamp(100px, 20vw, 380px);
        width: auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;
    }

    .al-hidden {
        display: none !important;
        opacity: 0;
    }
    .al-visible {
        display: block;
        opacity: 1;
        transition: opacity 0.2s ease-in-out;
    }

    .al-info-split-layout {
      display: flex;
      gap: 12px;
    }

    .al-info-split-col {
      flex: 1;
      min-width: 0; 
      display: flex;         
      flex-direction: column;
    }

    .al-inline-mode {
      background: transparent !important;
      border: 1px solid var(--al-border) !important;
    }

    /* 螢幕較窄時自動變回上下疊放 */
    @media (max-width: 768px) {
      .al-info-split-layout {
        flex-direction: column;
      }
    }

    /* 聲優與主題曲專用列排版 */
    .al-info-row { font-size: 14px; padding: 6px 4px; border-bottom: 1px dashed var(--al-border); }
    .al-info-title { font-size: 15px; color: var(--al-primary); }

    @keyframes al-fadein { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 768px) { #al-title, #al-user-status { display: none !important; } }
  `);
  // #endregion

  // #region ================= [Logic] 集數計算核心 =================
  const EpisodeCalculator = {
    // 網頁標題中抓取集數
    parseFromTitle() {
      const title = document.title;
      const match = title.match(/\[(\d+(?:\.\d+)?)\]/); // 抓取 [] 內的數字
      if (match) {
        return parseFloat(match[1]); // 這裡回傳數字 (支援小數點)
      }
      return null;
    },

    getRawCurrent() {
      const urlParams = new URLSearchParams(location.search);
      const currentSn = urlParams.get('sn');

      // 1. 優先嘗試：尋找按鈕
      let anchor = _.$(`${CONSTANTS.SELECTORS.BAHA.PAGE.seasonList} a[href*="sn=${currentSn}"]`);
      let targetLi = anchor ? anchor.closest('li') : null;
      if (!targetLi) {
        targetLi = _.$(
          `${CONSTANTS.SELECTORS.BAHA.PAGE.seasonList}${CONSTANTS.SELECTORS.BAHA.PAGE.playing}`,
        );
      }

      // 2. 如果有按鈕，照舊讀取
      if (targetLi) {
        const text = targetLi.textContent.trim();
        if (text.includes('.') || !/\d/.test(text)) {
          return null;
        } // 過濾小數點
        return parseInt(text, 10);
      }

      // 3. 如果沒按鈕 (只有一集/連載中)，改抓標題
      const titleEp = this.parseFromTitle();
      if (titleEp !== null) {
        // 同樣過濾小數點
        if (!Number.isInteger(titleEp)) {
          return null;
        }
        return titleEp;
      }

      // 4. 如果沒按鈕且標題抓不到數字
      // 檢查下方是否完全沒有其他集數列表，若是，代表這是獨立單集作品，直接預設為第 1 集
      const eps = this._getAllEpisodes();
      if (eps.length === 0) {
        return 1;
      }

      return null;
    },
    _getAllEpisodes() {
      // 1. 優先尋找「正在播放 (.playing)」集數所在列表 (ul)
      const playingEl = _.$(
        `${CONSTANTS.SELECTORS.BAHA.PAGE.seasonList}${CONSTANTS.SELECTORS.BAHA.PAGE.playing}`,
      );
      let targetUl = playingEl ? playingEl.closest('ul') : null;

      // 2. 找不到正在播放的元素，抓取第一個列表
      if (!targetUl) {
        targetUl = _.$(CONSTANTS.SELECTORS.BAHA.PAGE.seasonUl);
      }

      if (!targetUl) {
        return [];
      }

      const episodes = [];
      targetUl.querySelectorAll('li').forEach((li) => {
        const t = li.textContent.trim();
        // 確認內容是純數字才加入 (排除像是 36.5 這種小數點集數)
        if (/^\d+$/.test(t)) {
          episodes.push(parseInt(t, 10));
        }
      });
      return episodes;
    },
    getMin() {
      const eps = this._getAllEpisodes();
      if (eps.length > 0) {
        return Math.min(...eps);
      }
      const titleEp = this.parseFromTitle();
      return titleEp !== null ? Math.ceil(titleEp) : null;
    },
    getMax() {
      const eps = this._getAllEpisodes();
      if (eps.length > 0) {
        return Math.max(...eps);
      }
      const titleEp = this.parseFromTitle();
      return titleEp !== null ? Math.ceil(titleEp) : null;
    },
  };

  const SeriesLogic = {
    /**
     * 計算系列作中每一部作品的起始集數
     * @param {Array} chain - AniList 的系列作列表
     * @param {Number} targetId - 定錨的作品 ID (使用者當前選中或綁定的 ID)
     * @param {Number} anchorStart - 定錨作品在巴哈的起始集數
     * @param {Object} uiState - 目前畫面上的啟用狀態與手動輸入值 (例如: {123: 1, 456: null})
     */
    calculateOffsets(chain, targetId, anchorStart, uiState = {}) {
      let anchorIndex = chain.findIndex((m) => {
        return m.id === targetId;
      });
      if (anchorIndex === -1 && targetId) {
        return chain;
      }

      // 檢查 targetId 是否在 uiState 有手動輸入，優先使用
      let baseStart = anchorStart;
      if (uiState[targetId] !== undefined && uiState[targetId] !== null) {
        baseStart = uiState[targetId];
      }
      if (chain[anchorIndex]) {
        chain[anchorIndex].calculatedStart = baseStart;
      }

      // 向前推算 (Pre-quels)
      let nextValidStart = chain[anchorIndex].calculatedStart;
      for (let i = anchorIndex - 1; i >= 0; i--) {
        const current = chain[i];
        const epCount = current.episodes ?? 12;

        // 若 UI 有手動輸入數值，優先使用；否則自動推算
        if (uiState[current.id] !== undefined && uiState[current.id] !== null) {
          current.calculatedStart = uiState[current.id];
        } else {
          current.calculatedStart = nextValidStart - epCount;
        }

        // 判斷此作品是否啟用 (存在於 uiState，或未傳入規則時預設全開)
        const isRuleActive =
          Object.keys(uiState).length === 0 ||
          Object.prototype.hasOwnProperty.call(uiState, current.id) ||
          current.id === targetId;
        if (isRuleActive) {
          nextValidStart = current.calculatedStart;
        }
      }

      // 向後推算 (Sequels)
      let prevValidStart = chain[anchorIndex].calculatedStart;
      let prevValidEpisodes = chain[anchorIndex].episodes || Infinity;

      for (let i = anchorIndex + 1; i < chain.length; i++) {
        const current = chain[i];

        if (uiState[current.id] !== undefined && uiState[current.id] !== null) {
          current.calculatedStart = uiState[current.id];
        } else {
          if (prevValidEpisodes === Infinity) {
            current.calculatedStart = Infinity;
          } else {
            current.calculatedStart = prevValidStart + prevValidEpisodes;
          }
        }

        const isRuleActive =
          Object.keys(uiState).length === 0 ||
          Object.prototype.hasOwnProperty.call(uiState, current.id) ||
          current.id === targetId;
        if (isRuleActive) {
          prevValidStart = current.calculatedStart;
          prevValidEpisodes = current.episodes || Infinity;
        }
      }

      return chain;
    },
  };
  // #endregion

  // #region ================= [API] AniList 通訊層 =================
  const AniListAPI = {
    getToken: () => {
      return GM_getValue(CONSTANTS.KEYS.TOKEN);
    },
    getViewer: async () => {
      if (State.cachedViewer) {
        return State.cachedViewer;
      }
      const d = await AniListAPI.request(GQL.GET_VIEWER);

      State.cachedViewer = d.data.Viewer;
      return State.cachedViewer;
    },
    async request(query, variables, retryCount = 0) {
      const token = this.getToken();
      if (!token && !query.includes('search')) {
        throw new Error('Token 未設定');
      }

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
            const strategies = [
              {
                name: 'Maintenance',
                match: (r) => {
                  return (
                    r.status >= 500 ||
                    r.responseText.includes('temporarily disabled') ||
                    r.responseText.includes('stability issues')
                  );
                },
                execute: () => {
                  State.isMaintenance = true;
                  State.stopSync = true;
                  const info = 'AniList 維護中';
                  UI.updateNav(CONSTANTS.STATUS.ERROR, info);
                  UI.showToast('⚠️ 伺服器維護中，API 暫時關閉，詳情請至 AniList Discord 查看');
                  Log.error('AniList Maintenance Mode Detected');
                  reject(new Error(info));
                },
              },
              {
                name: 'RateLimit',
                match: (r) => {
                  return r.status === 429;
                },
                execute: () => {
                  if (retryCount < CONSTANTS.API_MAX_RETRIES) {
                    const delay = CONSTANTS.RETRY_DELAY_MS * Math.pow(2, retryCount);
                    UI.updateNav(
                      CONSTANTS.STATUS.SYNCING,
                      `連線過於頻繁，重試中...(${retryCount + 1}/${CONSTANTS.API_MAX_RETRIES})`,
                    );
                    setTimeout(() => {
                      AniListAPI.request(query, variables, retryCount + 1)
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
                match: (r) => {
                  return r.status === 401 || r.responseText.includes('Invalid token');
                },
                execute: () => {
                  UI.updateNav(CONSTANTS.STATUS.TOKEN_ERROR);
                  UI.showToast('❌ Token 無效或過期，請重新設定');
                  reject(new Error('Invalid Token'));
                },
              },
              {
                name: 'Success',
                match: () => {
                  return true;
                },
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
              const activeStrategy = strategies.find((s) => {
                return s.match(r);
              });
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
                AniListAPI.request(query, variables, retryCount + 1)
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
    search: (term) => {
      return AniListAPI.request(GQL.SEARCH, { s: term });
    },
    searchByDateRange: (start, end) => {
      return AniListAPI.request(GQL.SEARCH_RANGE, { start, end });
    },
    getMedia: (id) => {
      return AniListAPI.request(GQL.GET_MEDIA, { id }).then((d) => {
        return d.data.Media;
      });
    },
    getMediaAndStatus: (id) => {
      return AniListAPI.request(GQL.GET_MEDIA_AND_STATUS, { id }).then((d) => {
        return d.data.Media;
      });
    },
    getUserStatus: (id) => {
      return AniListAPI.request(GQL.GET_USER_STATUS, { id }).then((d) => {
        return d.data.Media.mediaListEntry;
      });
    },
    updateUserProgress: (id, p) => {
      return AniListAPI.request(GQL.UPDATE_PROGRESS, { id, p }).then((d) => {
        return d.data.SaveMediaListEntry;
      });
    },
    updateUserStatus: (id, status) => {
      return AniListAPI.request(GQL.UPDATE_STATUS, { id, status }).then((d) => {
        return d.data.SaveMediaListEntry;
      });
    },
    async getSequelChain(id) {
      const query = GQL.SEQUEL_CHAIN(GQL.MEDIA_FIELDS);
      const data = await this.request(query, { id });
      const root = data.data.Media;
      if (!root) {
        return [];
      }

      const targetFormats = ['TV', 'TV_SHORT', 'ONA', 'OVA', 'SPECIAL', 'MOVIE'];

      // 2. 遍歷鏈條
      const visited = new Map(); // 使用 Map 來避免重複並儲存節點
      // 定義要抓取的關聯類型
      const targetRelations = [ 'SEQUEL', 'PREQUEL', 'PARENT','SIDE_STORY', 'SPIN_OFF'];

      const traverse = (node) => {
        if (!node || visited.has(node.id)) {
          return;
        }

        visited.set(node.id, node);

        if (node.relations?.edges) {
          const relatedEdges = node.relations.edges.filter((e) => {
            return targetRelations.includes(e.relationType);
          });

          relatedEdges.forEach((edge) => {
            if (edge.node) {
              traverse(edge.node);
            }
          });
        }
      };

      // 開始遍歷
      traverse(root);

      // 3. 轉為陣列並過濾格式
      let resultChain = Array.from(visited.values()).filter((media) => {
        return targetFormats.includes(media.format);
      });

      resultChain.sort((a, b) => {
        const dateA = Utils.toJsDate(a.startDate, true);
        const dateB = Utils.toJsDate(b.startDate, true);

        const timeA = dateA ? dateA.getTime() : Infinity;
        const timeB = dateB ? dateB.getTime() : Infinity;

        if (timeA === timeB) {
          return a.id - b.id;
        }
        return timeA - timeB;
      });

      return resultChain;
    },
  };
  // #endregion

  // #region ================= [API] MAL 通訊層 =================
  const MALAPI = {
    async fetchSyoboiUrl(mediaInfo) {
      if (!mediaInfo || !mediaInfo.idMal) {
        return '';
      }
      const malId = mediaInfo.idMal;

      // 1. 檢查目前播放季 (activeRule) 是否已有該季專屬的 Syoboi 網址快取
      if (
        State.activeRule &&
        State.activeRule.aniId === mediaInfo.id &&
        State.activeRule.syoboiUrl !== undefined
      ) {
        Log.info(
          `[MAL Cache] Hit for AniList ID ${mediaInfo.id} (${State.activeRule.title}): ${State.activeRule.syoboiUrl}`,
        );
        return State.activeRule.syoboiUrl;
      }
      const url = `https://myanimelist.net/anime/${malId}`;
      try {
        const html = await new Promise((r, j) => {
          return GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload: (x) => {
              return r(x.responseText);
            },
            onerror: j,
          });
        });

        const doc = new DOMParser().parseFromString(html, 'text/html');

        if (typeof CONSTANTS !== 'undefined' && CONSTANTS.DEBUG) {
          if (typeof Utils !== 'undefined' && Utils.validateParser) {
            Utils.validateParser(doc);
          }
        } else {
          if (!doc.querySelector(CONSTANTS.SELECTORS.MAL.externalLinks)) {
            if (typeof Log !== 'undefined') {
              Log.error('Parser Error: 找不到外部資源區塊，MAL 可能改版');
            }
          }
        }

        const syoboiEl = doc.querySelector(CONSTANTS.SELECTORS.MAL.syoboiLink);

        let syoboiUrl = '';
        if (syoboiEl) {
          syoboiUrl = syoboiEl.getAttribute('href') || '';
        }

        // 找不到元素時的防禦與提示
        if (typeof Log !== 'undefined') {
          Log.warn(`MAL Parser Warning: 該作品頁面未建立 Syoboi 連結 (MALID: ${malId})`);
        }

        // 2. 將此季專屬的 malId 與 syoboiUrl 綁定至該季的 Rule 內並更新本機儲存
        if (State.activeRule && State.activeRule.aniId === mediaInfo.id) {
          State.activeRule.malId = malId;
          State.activeRule.syoboiUrl = syoboiUrl;
          App.saveRules(State.rules);
        }

        return syoboiUrl;
      } catch (e) {
        if (typeof Log !== 'undefined') {
          Log.error('MAL Data Fetch Error', e);
        }
        return null;
      }
    },
  };
  // #endregion

  // #region ================= [API] Syoboi 通訊層 =================
  const SyoboiAPI = {
    /**
     * 抓取並解析 Syoboi 頁面的 CAST 與主題曲
     * @param {string} syoboiUrl
     * @returns {Promise<{cast: Array, song: Array, source: string}|null>}
     */
    async fetchInfo(syoboiUrl) {
      if (!syoboiUrl) {
        return null;
      }

      try {
        // 1. 發送 GET 請求取得 Syoboi 頁面的 HTML 原始碼
        const html = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: syoboiUrl,
            onload: (r) => {
              return resolve(r.responseText);
            },
            onerror: reject,
          });
        });

        const doc = new DOMParser().parseFromString(html, 'text/html');

        // 2. 解析 CAST (聲優名單)
        const cast = [];
        doc.querySelectorAll('.cast table tr').forEach((row) => {
          const charEl = row.querySelector('th');
          const cvEl = row.querySelector('td');
          if (charEl && cvEl) {
            cast.push({
              char: charEl.textContent.trim(),
              cv: cvEl.textContent.trim(),
            });
          }
        });

        // 3. 解析主題曲 (OP / ED / 插入曲)
        const song = [];
        const allSections = doc.querySelectorAll('.section');

        allSections.forEach((sd) => {
          const titleEl = sd.querySelector('.title');
          if (!titleEl) {
            return;
          }

          const titleText = titleEl.textContent;
          const classList = sd.classList;

          // 比對標籤
          const isOp = classList.contains('op') || titleText.includes('オープニング');
          const isEd = classList.contains('ed') || titleText.includes('エンディング');
          const isSt = classList.contains('st') || titleText.includes('挿入歌');
          const isOtherSong = titleText.includes('主題歌');

          // 如果不符合任何音樂類型的 Class 或標題關鍵字，直接跳過該表格
          if (!isOp && !isEd && !isSt && !isOtherSong) {
            return;
          }

          // 判定音樂類型標籤
          let type = '主題曲';
          if (isOp) {
            type = 'OP';
          } else if (isEd) {
            type = 'ED';
          } else if (isSt) {
            type = '插入曲';
          }

          // 複製標題 DOM 節點並移除 <small> 標籤
          const titleClone = titleEl.cloneNode(true);
          const smallEl = titleClone.querySelector('small');
          if (smallEl) {
            smallEl.remove();
          }

          // 清理前後的「」括號與多餘空白
          const rawTitle = titleClone.textContent.trim().replace(/^「|」$/g, '');

          // 擷取歌手資訊（尋找 <th> 欄位名稱包含「歌」的列）
          const singerEl = [...sd.querySelectorAll('th')]
            .find((th) => {
              return th.textContent.includes('歌');
            })
            ?.parentElement?.querySelector('td');

          if (rawTitle) {
            song.push({
              type: type,
              title: rawTitle,
              singer: singerEl ? singerEl.textContent.trim() : '-',
            });
          }
        });

        return { cast, song, source: syoboiUrl };
      } catch (e) {
        Log.error('Syoboi Fetch Error', e);
        return null;
      }
    },
  };
  // #endregion

  // #region ================= [API] Wikipedia 通訊層 =================
  const WikiAPI = {
    async getZhWikiLinks(castList) {
      if (!castList || castList.length === 0) {
        return {};
      }

      // 1. 整理傳入的 CV 名稱，並去除重複與無效項目
      const cvNames = [
        ...new Set(
          castList
            .map((c) => {
              return c.cv;
            })
            .filter((cv) => {
              return cv && cv !== '未知聲優' && cv !== '無配音';
            }),
        ),
      ];

      // 每 20 個名稱分批次向 Wikipedia API 查詢（避免 URL 過長）
      const chunks = [];
      for (let i = 0; i < cvNames.length; i += 20) {
        chunks.push(cvNames.slice(i, i + 20));
      }

      const wikiResults = {};

      for (const chunk of chunks) {
        const titles = chunk.join('|');
        const url = `https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks|pageprops&titles=${encodeURIComponent(
          titles,
        )}&redirects=1&lllang=zh&lllimit=100&ppprop=disambiguation`;

        try {
          const jsonText = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: 'GET',
              url,
              onload: (r) => {
                return resolve(r.responseText);
              },
              onerror: reject,
            });
          });

          const data = JSON.parse(jsonText);
          const query = data.query || {};
          const pages = query.pages || {};

          // 2. 建立重定向與規格化映射地圖 (From -> To)
          const titleMap = new Map();

          // 處理規格化 (如小寫轉大寫)
          if (query.normalized) {
            query.normalized.forEach((item) => {
              titleMap.set(item.to, item.from);
            });
          }

          // 處理重定向
          if (query.redirects) {
            query.redirects.forEach((item) => {
              const originalFrom = titleMap.get(item.from) || item.from;
              titleMap.set(item.to, originalFrom);
            });
          }

          // 3. 解析 API 回傳的 Wikipedia 頁面資料
          Object.values(pages).forEach((page) => {
            const jpTitle = page.title; // API 最終解析出的頁面標題
            const originalTitle = titleMap.get(jpTitle) || jpTitle; // 原始查詢字串

            const zhLangLink = page.langlinks?.[0]?.['*'];
            let linkInfo = null;

            if (zhLangLink) {
              // 中文維基百科
              linkInfo = {
                url: `https://zh.wikipedia.org/zh-tw/${encodeURIComponent(zhLangLink)}`,
                label: 'Wiki',
              };
            } else if (!page.missing) {
              // 日文維基百科
              linkInfo = {
                url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(jpTitle)}`,
                label: 'WikiJP',
              };
            }

            if (linkInfo) {
              // 雙向 Key 寫入結果
              wikiResults[jpTitle] = linkInfo;
              wikiResults[originalTitle] = linkInfo;
            }
          });
        } catch (e) {
          Log.error('Wiki API Error', e);
        }
      }

      // --------------------------------------------------
      // 4. 保險機制 (Fallback)
      // 針對 Wikipedia 查無條目的聲優，自動建立 Google 搜尋連結
      // --------------------------------------------------
      cvNames.forEach((cv) => {
        if (!wikiResults[cv]) {
          const searchQuery = encodeURIComponent(`${cv}`);
          wikiResults[cv] = {
            url: `https://www.google.com/search?q=${searchQuery}`,
            label: 'Google',
          };
        }
      });

      return wikiResults;
    },
  };
  // #endregion

  // #region ================= [UI] 畫面渲染與事件 =================
  const Templates = {
    /**
     * 產生標籤頁面
     * @param {string} activeTab - 目前激活的標籤
     * @param {boolean} isVideo - 是否為影片頁面
     * @param {boolean} hasRules - 是否有規則
     * @returns {string} - 生成的 HTML 字串
     */
    tabs: (activeTab, isVideo, hasRules) => {
      return `
      <div class="al-tabs-nav">
        <button class="al-tab-item ${activeTab === 'home' ? 'active' : ''}" 
          data-tab="home" ${!isVideo ? 'disabled' : ''}>主頁 / 狀態</button>
        <button class="al-tab-item ${activeTab === 'info' ? 'active' : ''}" 
          data-tab="info" ${!hasRules ? 'disabled' : ''}>聲優 / 主題曲</button>
        <button class="al-tab-item ${activeTab === 'series' ? 'active' : ''}" 
          data-tab="series" ${!hasRules ? 'disabled' : ''}>系列設定</button>
        <button class="al-tab-item ${activeTab === 'settings' ? 'active' : ''}" 
          data-tab="settings">設定</button>
      </div>
      <div id="tab-home" class="al-tab-pane ${activeTab === 'home' ? 'active' : ''}"></div>
      <div id="tab-info" class="al-tab-pane ${activeTab === 'info' ? 'active' : ''}"></div>
      <div id="tab-series" class="al-tab-pane ${activeTab === 'series' ? 'active' : ''}"></div>
      <div id="tab-settings" class="al-tab-pane ${activeTab === 'settings' ? 'active' : ''}"></div>
    `;
    },
    /**
     * 設定頁面
     * @param {Object} config - 設定頁面所需的參數
     * @param {string} config.token - AniList Token
     * @param {string} config.mode - 同步模式
     */
    settings: (config = {}) => {
      const { token, mode, customSec, customPct, overrideMode, showInlineInfo } = config;
      const optionsHtml = Object.values(CONSTANTS.SYNC_MODES)
        .map((m) => {
          return `<option value="${m.value}" ${mode === m.value ? 'selected' : ''}>
              ${m.label}</option>`;
        })
        .join('');
      const overrideOptionsHtml = Object.values(CONSTANTS.OVERRIDE_MODES)
        .map((m) => {
          return `<option value="${m.value}" ${overrideMode === m.value ? 'selected' : ''}>
              ${m.label}</option>`;
        })
        .join('');

      // --- 帳號授權區塊 HTML 生成邏輯 ---
      let authHtml = '';

      if (token) {
        // [A] 已登入狀態
        authHtml = `
          <div id="auth-card" class="al-flex al-items-center al-justify-between al-p-2" 
                style="background:var(--al-bg); border:1px solid var(--al-border); border-radius:var(--al-radius);">
              <div class="al-flex al-items-center al-gap-3">
                  <span id="auth-icon" style="font-size: 20px;">⏳</span>
                  <div class="al-flex al-flex-col">
                      <span id="auth-title" class="al-text-sm al-font-bold" style="color:var(--al-text);">身分驗證中...</span>
                      <span id="auth-sub" class="al-text-xs al-text-sub">正在確認 Token 有效性</span>
                  </div>
              </div>
              <button id="btn-logout" class="al-btn al-btn-danger al-btn-sm" style="height:32px;">
                  登出
              </button>
           </div>`;
      } else {
        // [B] 未登入狀態
        authHtml = `
          <button id="btn-oauth" class="al-btn al-btn-primary al-btn-block">
            🔗 連結 AniList 帳號
          </button>
          <div class="al-text-xs al-text-sub al-mt-2 al-mb-2">
            點擊後將跳轉至 AniList 官方進行授權
          </div>
          
          <details class="al-mt-3" style="border-top:1px dashed var(--al-border); padding-top:8px;">
            <summary class="al-text-xs al-link" style="cursor:pointer;">手動輸入 Token (進階)</summary>
            
            <div class="al-card al-mt-2 al-text-sm al-text-sub" style="background:var(--al-bg);">
                <div class="al-font-bold al-text al-mb-1 al-pb-2" style="border-bottom:1px solid var(--al-border);">如何自行申請 Token?</div>
                <div class="al-flex al-gap-2 al-pt-2 al-pb-2"> 
                  <span class="al-font-bold al-text-primary">1.</span>
                  <span>登入 <a href="https://anilist.co/" target="_blank" class="al-link">AniList</a> 後，前往 <a href="https://anilist.co/settings/developer" target="_blank" class="al-link">開發者設定</a> 新增 Client。</span>
                </div>
                <div class="al-flex al-gap-2 al-pt-2 al-pb-2">
                  <span class="al-font-bold al-text-primary">2.</span>
                  <span>輸入任意名稱，Redirect URL設定為 <code id="ref-url-btn" class="al-link al-row-active al-p-1" title="點擊複製">https://anilist.co/api/v2/oauth/pin</code> (點擊複製)。</span>
                </div>
                <div class="al-flex al-gap-2 al-pt-2 al-pb-2 al-items-center">
                  <span class="al-font-bold al-text-primary">3.</span>
                  <span>輸入 Client ID：</span>
                  <input id="client-id" class="al-input al-input-sm" style="width:80px;" placeholder="ID">
                  <a id="auth-link" href="#" target="_blank" class="al-btn al-btn-primary al-btn-sm" style="opacity:0.5;pointer-events:none;">前往授權</a>
                </div>
                <div class="al-flex al-gap-2 al-pt-2 al-pb-2">
                  <span class="al-font-bold al-text-primary">4.</span>
                  <span>授權後，將網頁顯示的 Access Token 貼在下方：</span>
                </div>
            </div>

            <div class="al-mt-2 al-flex al-gap-2">
              <input type="password" id="set-token" class="al-input" value="${token}" placeholder="請貼上 Token">
              <button id="toggle-token-btn" class="al-btn al-btn-outline" style="width:40px;">${ICONS.EYE_OFF}</button>
            </div>
          </details>`;
      }

      return `
        <div class="al-p-4 al-flex-col al-gap-3">
          <div class="al-card al-mt-2">
            <label class="al-font-bold al-mb-2 al-text-sm" style="display:block;">帳號連結狀態</label>
            ${authHtml}
          </div>

          <div class="al-card al-mt-2">
            <label class="al-font-bold al-mb-1 al-text-sm" style="display:block;">同步觸發時機</label>
            <select id="set-mode" class="al-input">${optionsHtml}</select>
            
            <div id="custom-sec-group" class="al-flex al-items-center al-gap-2 al-mt-2" style="display:none;">
              <span class="al-text-sub al-text-sm">播放超過：</span>
              <input type="number" id="set-custom-sec" class="al-input al-input-sm" value="${customSec}" min="1" style="width:80px;">
              <span class="al-text-sub al-text-sm">秒後同步</span>
            </div>

            <div id="custom-pct-group" class="al-flex al-items-center al-gap-2 al-mt-2" style="display:none;">
              <span class="al-text-sub al-text-sm">播放進度達：</span>
              <input type="number" id="set-custom-pct" class="al-input al-input-sm" value="${customPct}" min="1" max="100" style="width:80px;">
              <span class="al-text-sub al-text-sm">% 後同步</span>
              </div>
          </div>

          <div class="al-card al-mt-2" id="override-mode-group">
            <label class="al-font-bold al-mb-1 al-text-sm" style="display:block;">集數更新策略</label>
            <select id="set-override-mode" class="al-input">${overrideOptionsHtml}</select>
          </div>

          <div class="al-card al-mt-2">
            <label class="al-font-bold al-mb-2 al-text-sm" style="display:block;">擴充功能</label>
            <label class="al-flex al-items-center al-gap-2 al-text-sm" style="cursor:pointer; user-select:none;">
              <input type="checkbox" id="set-inline-info" ${showInlineInfo ? 'checked' : ''}>
              <span>在播放頁面直接顯示聲優/主題曲資訊</span>
            </label>
          </div>

          <button id="save-set" class="al-btn al-btn-success al-btn-block al-mt-2">儲存設定</button>
        </div>
      `;
    },
    /**
     * 警告提示區塊樣板
     * @param {string} msg 警告內容
     */
    warningNotice: (msg) => {
      return `
        <div class="al-p-3 al-mb-3" style="background:#fff3cd; color:#856404; border-radius:4px; font-size:12px; border:1px solid #ffeeba;">
          ⚠️ ${msg}
        </div>
      `.trim();
    },
    /**
     * 未知集數/小數點集數警告樣板
     */
    unknownEpWarning: () => {
      const msg =
        '當前集數無法判定 (如小數點集數或特別篇)，<b>已暫停自動同步</b>，但您仍可手動管理狀態。';
      return Templates.warningNotice(msg);
    },
    /**
     * 資訊主頁面
     * @param {object} rule 綁定規則
     * @param {object} info 作品資訊
     * @param {object} statusData 狀態資料
     * @param {array} statusOptions 狀態選項
     * @param {boolean} isUnknownEp 是否為未知集數
     */
    homeBound: (rule, info, statusData, statusOptions, isUnknownEp = false) => {
      const warningHtml = isUnknownEp ? Templates.unknownEpWarning() : '';

      const links = [];
      if (info?.idMal) {
        links.push(
          `<a href="https://myanimelist.net/anime/${info.idMal}" target="_blank" rel="noopener noreferrer" class="al-link">MyAnimeList</a>`,
        );
      }
      if (info?.syoboiUrl) {
        links.push(
          `<a href="${info.syoboiUrl}" target="_blank" rel="noopener noreferrer" class="al-link">しょぼいカレンダー</a>`,
        );
      }
      let externalLinksHtml = '';
      if (links.length > 0) {
        externalLinksHtml = `<div class="al-flex al-items-center al-text-xs al-mt-2 al-pt-2 al-gap-2" style="border-top:1px dashed var(--al-border);">
             <span class="al-text-sub">外部連結：</span>
             ${links.join(' <span class="al-text-sub" style="opacity: 0.4;">|</span> ')}
           </div>`;
      }

      return `
      ${warningHtml}
      <div class="al-p-4 al-flex-col al-gap-3">
        <div class="al-flex al-justify-between al-items-center al-mb-2">
          <label class="al-text-sub al-font-bold al-text-xs">目前綁定作品</label>
          <button id="btn-refresh-data" class="al-btn al-btn-outline al-btn-sm">🔄 刷新</button>
        </div>

        <div class="al-card al-flex al-gap-3">
          <a href="https://anilist.co/anime/${rule.aniId}" target="_blank" class="al-shrink-0">
            <img src="${info.coverImage.medium}" class="al-cover al-cover-lg">
          </a>
          <div class="al-flex al-flex-col al-justify-between al-flex-1" style="overflow:hidden;">
            <div>
              <a href="https://anilist.co/anime/${rule.aniId}" target="_blank" 
                class="al-link al-font-bold" style="font-size:15px; display:block;">
                ${rule.title}
              </a>
              <div class="al-text-sub al-text-xs al-mt-1">
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${info.title.romaji}</div>
                <div class="al-mb-1 al-mt-1">AniList ID: ${rule.aniId}</div>
                <div class="al-mb-1 al-mt-1">開播日: ${Utils.formatDate(info.startDate)}</div>
                <div class="al-mb-1 al-mt-1">放送狀態: ${CONSTANTS.MEDIA_STATUS[info.status] || info.status || '未知'}</div>
                <div class="al-mb-1 al-mt-1">播映方式: ${info.format}</div>
                <div class="al-mb-1 al-mt-1">總集數: ${info.episodes || '?'}</div>
              </div>
            </div>
            <div class="al-text-success al-text-sm al-pt-2 al-mt-1" style="border-top:1px dashed var(--al-border);">
              AniList 進度: ${statusData?.progress || 0} / ${info.episodes || '?'}
            </div>
            ${externalLinksHtml}
          </div>
        </div>

        <div class="al-mt-4 al-pt-4" style="border-top:1px solid var(--al-border);">
          <label class="al-text-sub al-font-bold al-text-xs al-mb-1" style="display:block;">切換狀態</label>
          <select id="home-status" class="al-input">${statusOptions}</select>
        </div>

        <div class="al-mb-3 al-mt-3">
          <label class="al-text-sub al-font-bold al-text-xs al-mb-1" style="display:block;">手動修改 ID</label>
          <div class="al-flex al-gap-2">
            <input type="number" id="home-edit-id" class="al-input" value="${rule.aniId}">
            <button id="home-save-id" class="al-btn al-btn-outline">更新</button>
          </div>
        </div>

        <button id="btn-unbind" class="al-btn al-btn-danger al-btn-block al-mt-4">解除所有綁定</button>
      </div>
    `;
    },
    /**
     * 建議綁定頁面
     * @param {object} candidate 建議綁定的作品資訊
     * @param {string} searchName 搜尋名稱
     */
    homeUnbound: (candidate, searchName) => {
      let suggestionHtml = '';
      if (candidate) {
        suggestionHtml = `
          <div class="al-card al-card-suggest al-mb-3">
            <div class="al-font-bold al-text-warn al-text-xs al-mb-1">💡 建議匹配</div>
            <div class="al-flex al-gap-3">
              <a href="https://anilist.co/anime/${candidate.id}" target="_blank">
                <img src="${candidate.coverImage.medium}" class="al-cover al-cover-md">
              </a>
              <div class="al-flex-1">
                <a href="https://anilist.co/anime/${
                  candidate.id
                }" target="_blank" class="al-link al-font-bold">
                  ${candidate.title.native}
                </a>
                <div class="al-text-sub al-text-xs">${candidate.title.romaji}</div>
                <div class="al-text-sub al-text-xs al-mt-2">
                   ${Utils.formatDate(candidate.startDate)} | ${candidate.format}
                </div>
              </div>
              <button id="btn-quick" class="al-btn al-btn-primary al-btn-sm" style="align-self:center;">綁定</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="al-p-4">
          ${suggestionHtml}
          <div class="al-flex al-gap-2">
            <input id="search-in" class="al-input" value="${
              searchName || ''
            }" placeholder="搜尋作品...">
            <button id="btn-search" class="al-btn al-btn-primary">搜尋</button>
          </div>
          <div id="search-res" class="al-mt-4 al-flex-col al-gap-2"></div>
        </div>
      `;
    },
    /**
     * 搜尋結果頁面
     * @param {Object} m - 搜尋結果資料
     * @returns {string} - 生成的 HTML 字串
     */
    searchResult: (m) => {
      return `
      <div class="al-flex al-gap-3 al-items-center al-p-2" style="border-bottom:1px solid var(--al-border);">
        <a href="https://anilist.co/anime/${m.id}" target="_blank">
          <img src="${m.coverImage.medium}" class="al-cover al-cover-sm">
        </a>
        <div class="al-flex-1" style="overflow:hidden;">
          <a href="https://anilist.co/anime/${
            m.id
          }" target="_blank" class="al-link al-font-bold al-text-sm">
            ${m.title.native || m.title.romaji}
          </a>
          <div class="al-text-sub al-text-xs" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${m.title.romaji}
          </div>
          <div class="al-text-sub al-text-xs">
            ${Utils.formatDate(m.startDate)} | ${CONSTANTS.MEDIA_STATUS[m.status] || m.status} | ${m.format} | ${m.episodes || '?'}集
          </div>
        </div>
        <button class="al-btn al-btn-primary al-btn-sm bind-it" 
          data-id="${m.id}" 
          data-title="${Utils.deepSanitize(m.title.native || m.title.romaji)}">綁定</button>
      </div>
    `;
    },
    /**
     * 系列設定行
     * @param {object} m - 系列資料
     * @param {boolean} isActive - 是否為啟用狀態
     * @param {boolean} isSuggestion - 是否為建議狀態
     * @param {boolean} isOut - 是否為外部狀態
     * @param {number} bahaVal - 巴哈姆特值
     * @returns {string} - 生成的 HTML 字串
     */
    seriesRow: (m, isActive, isSuggestion, isOut, bahaVal) => {
      const isInfinite = m.calculatedStart === Infinity;
      const displayStart = m.calculatedStart !== undefined && !isInfinite ? m.calculatedStart : '?';
      let statusHtml, rowClass, btnTxt, btnClass;

      if (isActive) {
        statusHtml = `<span class="al-tag success">使用中</span>`;
        rowClass = 'al-row-active';
        btnTxt = '取消';
        btnClass = 'al-btn-danger';
      } else if (isSuggestion) {
        statusHtml = `<span class="al-tag warn">建議</span>`;
        rowClass = 'al-row-suggest';
        btnTxt = '套用';
        btnClass = 'al-btn-primary';
      } else if (isOut) {
        statusHtml = `<span class="al-tag error">非本頁</span>`;
        rowClass = '';
        btnTxt = '啟用';
        btnClass = 'al-btn-outline';
      } else {
        statusHtml = `<span class="al-tag default">未使用</span>`;
        rowClass = '';
        btnTxt = '啟用';
        btnClass = 'al-btn-outline';
      }

      return `
        <tr class="series-row ${rowClass}" data-id="${m.id}" data-title="${Utils.deepSanitize(
          m.title.native || m.title.romaji,
        )}">
          <td style="text-align:center;">
             ${statusHtml}
             <input type="checkbox" class="cb-active" style="display:none;" ${
               isActive ? 'checked' : ''
             }>
          </td>
          <td>
            <div class="al-flex al-gap-3 al-items-center">
               <a href="https://anilist.co/anime/${m.id}" target="_blank" class="al-shrink-0">
                 <img src="${m.coverImage.medium}" class="al-cover al-cover-sm">
               </a>
               <div style="min-width:0; flex:1;">
                 <a href="https://anilist.co/anime/${m.id}" target="_blank" class="al-link al-text-sm al-font-bold" style="display:block; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">    ${m.title.native || m.title.romaji}
                 </a>
                 <div class="al-text-sub al-text-xs al-mt-1">
                  ${Utils.formatDate(m.startDate)} · ${CONSTANTS.MEDIA_STATUS[m.status] || m.status} · ${m.format}</div>
               </div>
            </div>
          </td>
          <td style="text-align:center; font-weight:600; color:var(--al-text-sub);">${m.episodes || '?'}</td>
          <td style="text-align:center;">
             <input type="number" class="inp-start al-input" placeholder="${displayStart}" 
               value="${bahaVal !== undefined ? bahaVal : ''}"></td>
          <td style="text-align:center;">
             <button class="al-btn btn-toggle ${btnClass}" data-suggested="${displayStart}">${btnTxt}</button>
          </td>
        </tr>
      `;
    },
    /**
     * しょぼいカレンダー資訊內容
     * @param {object} creditsData - 出演資料
     * @param {object} wikiMap - 維基資料映射
     * @param {boolean} isInline - 是否為內嵌模式
     * @returns {string} - 生成的 HTML 字串
     */
    syoboiInfoContent: (creditsData, wikiMap, isInline = false) => {
      // 1. 聲優列表 (CAST)
      const castRowsHtml = creditsData.cast
        .map((item) => {
          const charSafe = Utils.deepSanitize(item.char);
          const cvSafe = Utils.deepSanitize(item.cv);
          const wikiInfo = wikiMap[item.cv];
          const wikiBtn = wikiInfo
            ? `<a href="${wikiInfo.url}" target="_blank" class="al-link al-text-sm al-shrink-0">🔗 ${wikiInfo.label}</a>`
            : '';

          return `
          <div class="al-flex al-justify-between al-items-center al-info-row">
            <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:8px;">
              <span class="al-font-bold">${charSafe}</span>
              <span class="al-text-sub al-text-sm al-ml-1">CV: ${cvSafe}</span>
            </div>
            ${wikiBtn}
          </div>
        `;
        })
        .join('');

      // 2. 主題曲列表 (Song)
      const songRowsHtml = creditsData.song
        .map((item) => {
          const titleSafe = Utils.deepSanitize(item.title);
          const singerSafe = Utils.deepSanitize(item.singer);
          const searchQuery = `${item.title} ${item.singer !== '-' ? item.singer : ''}`.trim();
          const encodedQuery = encodeURIComponent(searchQuery);

          return `
          <div class="al-flex al-justify-between al-items-center al-info-row">
            <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:8px;">
              <span class="al-tag default al-mr-1" style="padding:1px 4px; font-size:10px;">${item.type}</span>
              <span class="al-font-bold">「${titleSafe}」</span>
              <span class="al-text-sub al-text-sm">/ ${singerSafe}</span>
            </div>
            <div class="al-flex al-gap-2 al-shrink-0">
              <a href="https://www.youtube.com/results?search_query=${encodedQuery}" target="_blank" class="al-link al-text-sm">🎧 Youtube</a>
              <a href="https://open.spotify.com/search/${encodedQuery}" target="_blank" class="al-link al-text-sm">🎧 Spotify</a>
            </div>
          </div>
        `;
        })
        .join('');

      const layoutClass = isInline ? 'al-info-split-layout' : 'al-flex-col al-gap-3';
      const containerClass = isInline ? 'al-p-3 al-inline-mode' : 'al-p-4';
      const listScrollStyle = isInline
        ? 'max-height: 280px; overflow-y: auto; padding-right: 4px;'
        : 'max-height: 240px; overflow-y: auto; padding-right: 4px;';

      const sourceUrl = creditsData.source || '#';
      const sourceLabel = Utils.getSourceName(sourceUrl);

      return `
        <div id="al-syoboi-info-container" class="${containerClass}" style="background: var(--al-bg-sec); border: 1px solid var(--al-border); border-radius: var(--al-radius);">
          <div class="${layoutClass}">
            
            <!-- 聲優名單卡片 -->
            <div class="al-card al-info-split-col">
              <div class="al-font-bold al-info-title al-mb-2">👥 聲優名單 (CV)</div>
              <div style="${listScrollStyle}">
                ${castRowsHtml || '<div class="al-text-sub al-text-sm">無 CAST 資料</div>'}
              </div>
            </div>

            <!-- 主題曲卡片 -->
            <div class="al-card al-info-split-col">
              <div class="al-font-bold al-info-title al-mb-2">🎵 主題曲 (OP / ED / 插入曲)</div>
              <div style="${listScrollStyle}">
                ${songRowsHtml || '<div class="al-text-sub al-text-sm">無主題曲資料</div>'}
              </div>
            </div>

          </div>

          <div class="al-text-sm al-text-sub al-mt-2" style="text-align:right;">
          資料來源：<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="al-link">${sourceLabel}</a>
        </div>
        </div>
      `;
    },
    /**
     * 顯示全部系列作的 Checkbox 樣板
     * @param {boolean} showAllSeries - 是否顯示全部系列作
     * @returns {string} - 生成的 HTML 字串
     */
    seriesFilterCheckbox: (showAllSeries) => {
      const checkedAttr = showAllSeries ? 'checked' : '';
      return `
      <label class="al-text-xs al-text-sub al-gap-1 al-items-center" style="cursor:pointer; display:inline-flex; user-select:none;">
        <input type="checkbox" id="chk-show-all-series" ${checkedAttr}>
        🗂️ 顯示全部系列作
      </label>
    `.trim();
    },
    /**
     * 系列設定頁面
     * @param {object} data - 系列設定資料
     * @returns {string} - 生成的 HTML 字串
     */
    seriesTab: (data) => {
      const { pageMin, pageMax, rowsHtml, hasFilterableItems, showAllSeries } = data;
      const rangeText = `${pageMin || '?'}~${pageMax || '?'}`;

      const filterCheckboxHtml = hasFilterableItems
        ? Templates.seriesFilterCheckbox(showAllSeries)
        : '';

      return `
      <div class="al-p-4">
        <div class="al-mb-3" style="display:flex; justify-content:space-between; align-items:center;">
          <span class="al-font-bold al-text-sub">系列作設定 (本頁範圍: ${rangeText})</span>
          <div class="al-flex al-items-center al-gap-3">
            ${filterCheckboxHtml}
            <button id="btn-refresh-series" class="al-btn al-btn-outline al-btn-sm" title="強制重新抓取">
              🔄 刷新
            </button>
          </div>
        </div>
        <table class="al-table">
          <thead>
            <tr>
              <th style="width:70px;">狀態</th>
              <th>作品名稱</th>
              <th style="width:55px;">總集</th>
              <th style="width:85px;">巴哈起始集數</th>
              <th style="width:75px;">操作</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <button id="save-series" class="al-btn al-btn-success al-btn-block al-mt-4">儲存系列設定</button>
      </div>
    `.trim();
    },
    /**
     * 錯誤資訊頁面
     * @param {string} msg - 錯誤訊息
     * @param {boolean} isMaintenance - 是否為維護狀態
     * @returns {string} - 生成的 HTML 字串
     */
    errorCard: (msg, isMaintenance) => {
      if (isMaintenance) {
        return `
          <div class="al-p-4">
            <div class="al-card" style="border-color: var(--al-danger); background: rgba(239, 68, 68, 0.05);">
              <div class="al-font-bold al-text-danger al-mb-2 al-flex al-items-center al-gap-2">
                <span style="font-size:18px;">⚠️</span> 伺服器維護中
              </div>
              <div class="al-text-sm al-text-sub" style="line-height: 1.5;">
                AniList 目前正在進行維護，暫時無法取得相關資料。<br><br>
                <a href="https://discord.com/invite/anilist" target="_blank" class="al-btn al-btn-outline al-btn-sm al-w-full" style="justify-content: center;">
                  前往官方 Discord 查看最新狀態
                </a>
              </div>
            </div>
          </div>`;
      }
      return `<div class="al-p-4" style="color:var(--al-danger); font-weight:bold;">Error: ${msg}</div>`;
    },
    /**
     * 狀態通知
     * @param {string} msg - 通知訊息
     * @returns {string} - 生成的 HTML 字串
     */
    statusNotice: (msg) => {
      return `<div class="al-p-4" style="text-align:center; color:var(--al-text-sub);">${msg}</div>`.trim();
    },
  };

  const UI = {
    statusTimer: null,
    showToast(msg) {
      const old = _.$('.al-toast');
      if (old) {
        old.remove();
      }
      const t = _.html(`<div class="al-toast">${msg}</div>`);
      document.body.appendChild(t);
      _.fadeIn(t, 'block');
      setTimeout(() => {
        _.fadeOut(t);
        setTimeout(() => {
          return t.remove();
        }, 300);
      }, 2500);
    },
    checkTheme() {
      const modalContent = _.$('.al-modal-content');
      if (!modalContent) {
        return;
      }

      const moonBtn = document.getElementById('darkmode-moon');
      // 如果月亮按鈕存在且被勾選，則加入 dark class
      if (moonBtn && moonBtn.checked) {
        modalContent.classList.add('al-theme-dark');
      } else {
        modalContent.classList.remove('al-theme-dark');
      }
    },
    initNavbar(nav) {
      if (_.$('#al-trigger')) {
        return;
      }
      const li = _.html(
        `<li class="al-nav-item">
          <a class="al-nav-link" id="al-trigger">
            <span id="al-icon">⚪</span>
            <span id="al-text">AniList</span>
            <span id="al-user-status" class="al-user-status"></span>
            <span id="al-title" class="al-nav-title" style="display:none;"></span>
          </a>
        </li>`,
      );
      nav.appendChild(li);

      _.$('#al-trigger').addEventListener('click', () => {
        return this.openModal();
      });

      // Modal 結構建立
      const modal = _.html(
        `<div id="al-modal" class="al-modal-overlay">
          <div class="al-modal-content">
            <div class="al-modal-header">
              <strong>AniList 設定</strong>
              <button class="al-close-btn">&times;</button>
            </div>
            <div class="al-modal-body" id="al-modal-body"></div>
          </div>
        </div>`,
      );
      document.body.appendChild(modal);

      _.$('.al-close-btn', modal).addEventListener('click', () => {
        return _.fadeOut(modal);
      });
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'al-modal') {
          _.fadeOut(modal);
        }
      });

      // 深色模式切換按鈕
      const themeRadios = document.querySelectorAll('input[name="darkmode"]');
      themeRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
          return this.checkTheme();
        });
      });

      // 初始化時檢查一次主題
      this.checkTheme();
    },
    updateNav(type, msg) {
      const $icon = _.$('#al-icon'),
        $text = _.$('#al-text'),
        $title = _.$('#al-title'),
        $uStatus = _.$('#al-user-status');

      if (!$icon || !$text || !$title || !$uStatus) {
        return;
      }

      if (this.statusTimer) {
        clearTimeout(this.statusTimer);
        this.statusTimer = null;
      }
      const rule = State.activeRule;
      const showTitle =
        rule &&
        [
          CONSTANTS.STATUS.BOUND,
          CONSTANTS.STATUS.SYNCING,
          CONSTANTS.STATUS.DONE,
          CONSTANTS.STATUS.INFO,
          CONSTANTS.STATUS.ERROR,
        ].includes(type);

      if (showTitle) {
        const decodedTitle = Utils.decodeHTML(rule.title);
        $title.textContent = decodedTitle;
        $title.title = decodedTitle;
        $title.style.display = 'inline-block';
        if (State.userStatus) {
          const { status, progress } = State.userStatus;
          const statusConfig = CONSTANTS.ANI_STATUS[status];
          let stTxt = statusConfig ? statusConfig.label : '';
          if (progress > 0) {
            const totalEp = State.cachedMediaInfo?.episodes || '';
            if (Number.isInteger(totalEp) && status !== CONSTANTS.ANI_STATUS.COMPLETED.value) {
              stTxt += `【Ep.${progress}/${totalEp}】`;
            } else {
              stTxt += `【Ep.${progress}】`;
            }
          }
          if (stTxt) {
            $uStatus.textContent = stTxt;
            $uStatus.style.display = 'inline-block';
          }
        } else {
          $uStatus.style.display = 'none';
        }
      } else {
        $title.style.display = 'none';
        $uStatus.style.display = 'none';
      }

      const map = {
        [CONSTANTS.STATUS.TOKEN_ERROR]: { i: '⚠️', t: '設定 Token' },
        [CONSTANTS.STATUS.UNBOUND]: { i: '🔗', t: '連結 AniList' },
        [CONSTANTS.STATUS.BOUND]: { i: '✅', t: '已連動' },
        [CONSTANTS.STATUS.STANDBY]: { i: '⚪', t: 'AniList' },
        [CONSTANTS.STATUS.SYNCING]: { i: '🔄', t: msg },
        [CONSTANTS.STATUS.DONE]: { i: '✅', t: msg },
        [CONSTANTS.STATUS.ERROR]: { i: '❌', t: msg },
        [CONSTANTS.STATUS.INFO]: { i: 'ℹ️', t: msg },
      };
      const setting = map[type] || map[CONSTANTS.STATUS.UNBOUND];
      $icon.textContent = setting.i;
      $text.textContent = setting.t;

      if (type === CONSTANTS.STATUS.DONE || type === CONSTANTS.STATUS.INFO) {
        this.statusTimer = setTimeout(() => {
          UI.updateNav(CONSTANTS.STATUS.BOUND);
        }, 5000);
      }
    },
    openModal() {
      _.fadeIn(_.$('#al-modal'), 'flex');
      this.renderTabs();
    },
    renderTabs() {
      const isVideo = location.href.includes(CONSTANTS.URLS.VIDEO_PAGE);
      const hasRules = State.rules.length > 0;
      const hasToken = !!GM_getValue(CONSTANTS.KEYS.TOKEN);

      // 邏輯：有 Token 且在看影片 -> 預設 Home，否則預設 Settings
      let activeTab = hasToken ? (isVideo ? 'home' : 'settings') : 'settings';

      const body = _.$('#al-modal-body');

      body.innerHTML = Templates.tabs(activeTab, isVideo, hasRules);

      _.$$('.al-tab-item', body).forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.disabled || btn.classList.contains('active')) {
            return;
          }
          _.$$('.al-tab-item').forEach((b) => {
            return b.classList.remove('active');
          });
          btn.classList.add('active');
          _.$$('.al-tab-pane').forEach((c) => {
            return c.classList.remove('active');
          });
          const targetPane = _.$(`#tab-${btn.dataset.tab}`);
          if (targetPane) {
            targetPane.classList.add('active');
          }
          UI.loadTabContent(btn.dataset.tab);
        });
      });

      this.loadTabContent(activeTab);
    },
    loadTabContent(tabName) {
      const container = _.$(`#tab-${tabName}`);
      container.innerHTML = '';
      if (tabName === 'settings') {
        this.renderSettings(container);
      } else if (tabName === 'series') {
        this.renderSeries(container);
      } else if (tabName === 'info') {
        this.renderInfo(container); // 👈 路由導向 renderInfo
      } else {
        if (State.rules.length > 0) {
          this.renderHomeBound(container);
        } else {
          this.renderHomeUnbound(container);
        }
      }
    },
    renderSettings(container) {
      const config = {
        token: GM_getValue(CONSTANTS.KEYS.TOKEN, CONSTANTS.DEFAULTS.TOKEN),
        mode: GM_getValue(CONSTANTS.KEYS.SYNC_MODE, CONSTANTS.DEFAULTS.SYNC_MODE),
        customSec: GM_getValue(CONSTANTS.KEYS.CUSTOM_SEC, CONSTANTS.DEFAULTS.CUSTOM_SEC),
        customPct: GM_getValue(CONSTANTS.KEYS.CUSTOM_PCT, CONSTANTS.DEFAULTS.CUSTOM_PCT),
        overrideMode: GM_getValue(CONSTANTS.KEYS.OVERRIDE_MODE, CONSTANTS.DEFAULTS.OVERRIDE_MODE),
        showInlineInfo: GM_getValue(
          CONSTANTS.KEYS.SHOW_INLINE_INFO,
          CONSTANTS.DEFAULTS.SHOW_INLINE_INFO,
        ),
      };

      // 一鍵驗證的連結
      const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${CONSTANTS.ANILIST_CLIENT_ID}&response_type=token`;

      container.innerHTML = Templates.settings(config);

      if (config.token) {
        AniListAPI.getViewer()
          .then((viewer) => {
            const card = _.$('#auth-card', container);
            if (card) {
              card.style.borderColor = 'var(--al-success)';
            }

            const icon = _.$('#auth-icon', container);
            if (icon) {
              icon.textContent = '✅';
            }

            const title = _.$('#auth-title', container);
            if (title) {
              title.textContent = '已完成授權';
            }

            const sub = _.$('#auth-sub', container);
            if (sub) {
              sub.textContent = `Hi，${viewer.name}`;
            }
          })
          .catch((err) => {
            const card = _.$('#auth-card', container);
            if (card) {
              card.style.borderColor = 'var(--al-danger)';
            }

            const icon = _.$('#auth-icon', container);
            if (icon) {
              icon.textContent = '❌';
            }

            const title = _.$('#auth-title', container);
            if (title) {
              title.textContent = State.isMaintenance ? '伺服器維護中' : 'Token 無效';
            }

            const sub = _.$('#auth-sub', container);
            if (sub) {
              if (State.isMaintenance) {
                sub.innerHTML = `API 暫時關閉。<a href="https://discord.com/invite/anilist" target="_blank" class="al-link">前往 Discord 查看狀態</a>`;
              } else {
                sub.textContent = '請檢查 Token 或重新登入';
              }
            }
            Log.error('Auth Error', err);
          });
      }
      // -----------------------------------------------------------

      // 1. 眼睛切換按鈕
      _.$('#toggle-token-btn', container)?.addEventListener('click', function () {
        const inp = _.$('#set-token', container);
        if (inp.type === 'password') {
          inp.type = 'text';
          this.innerHTML = ICONS.EYE_OPEN;
        } else {
          inp.type = 'password';
          this.innerHTML = ICONS.EYE_OFF;
        }
      });

      // 2. OAuth 按鈕
      _.$('#btn-oauth', container)?.addEventListener('click', () => {
        const w = 600,
          h = 800;
        const left = screen.width / 2 - w / 2,
          top = screen.height / 2 - h / 2;
        window.open(authUrl, 'AniListAuth', `width=${w},height=${h},top=${top},left=${left}`);
        UI.showToast('⏳ 請在新視窗中完成授權...');
      });

      // 3. 登出按鈕
      _.$('#btn-logout', container)?.addEventListener('click', () => {
        if (confirm('確定要登出嗎？Token 將被清除。')) {
          GM_deleteValue(CONSTANTS.KEYS.TOKEN);
          UI.showToast('👋 已登出');
          UI.loadTabContent('settings');
        }
      });

      // 4. 手動輸入輔助
      _.$('#ref-url-btn', container)?.addEventListener('click', function () {
        GM_setClipboard('https://anilist.co/api/v2/oauth/pin');
        UI.showToast('✅ 網址已複製！');
      });

      _.$('#client-id', container)?.addEventListener('input', function () {
        const id = this.value.trim();
        const btn = _.$('#auth-link', container);
        if (id.length > 0) {
          btn.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${id}&response_type=token`;
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
          btn.textContent = '前往授權';
        } else {
          btn.href = '#';
          btn.style.opacity = '0.5';
          btn.style.pointerEvents = 'none';
          btn.textContent = '前往授權';
        }
      });

      // 5. 統一設定儲存
      const toggleCustom = () => {
        const modeValue = _.$('#set-mode', container).value;
        _.$('#custom-sec-group', container).style.display =
          modeValue === 'custom_sec' ? 'flex' : 'none';
        _.$('#custom-pct-group', container).style.display =
          modeValue === 'custom_pct' ? 'flex' : 'none';
        const overrideGroup = _.$('#override-mode-group', container);
        if (overrideGroup) {
          overrideGroup.style.display = modeValue === 'paused' ? 'none' : 'block';
        }
      };
      _.$('#set-mode', container).addEventListener('change', toggleCustom);
      toggleCustom();

      _.$('#save-set', container).addEventListener('click', () => {
        // ... 儲存 token 的邏輯保持不變 ...
        const tokenInput = _.$('#set-token', container);
        const newToken = tokenInput ? tokenInput.value.trim() : null;

        if (newToken) {
          GM_setValue(CONSTANTS.KEYS.TOKEN, newToken);
        }

        GM_setValue(CONSTANTS.KEYS.SYNC_MODE, _.$('#set-mode', container).value);
        const customSec = parseInt(_.$('#set-custom-sec', container).value);
        if (!isNaN(customSec)) {
          GM_setValue(CONSTANTS.KEYS.CUSTOM_SEC, customSec);
        }

        const customPct = parseInt(_.$('#set-custom-pct', container).value);
        if (!isNaN(customPct)) {
          // 確保數值在 1 到 100 之間
          const clampedPct = Math.min(Math.max(customPct, 1), 100);
          GM_setValue(CONSTANTS.KEYS.CUSTOM_PCT, clampedPct);
        }

        GM_setValue(CONSTANTS.KEYS.OVERRIDE_MODE, _.$('#set-override-mode', container).value);
        GM_setValue(CONSTANTS.KEYS.SHOW_INLINE_INFO, _.$('#set-inline-info', container).checked);

        UI.showToast('✅ 設定已儲存，重新整理中...');
        setTimeout(() => {
          return location.reload();
        }, 500);
      });
    },
    async renderHomeBound(container) {
      container.innerHTML = Templates.statusNotice('讀取中...');

      let rule = State.activeRule;
      // 修改這裡：直接讓系統判斷取出的集數是不是 null (例如總集篇的小數點)
      const isUnknownEp = EpisodeCalculator.getRawCurrent() === null;

      // 如果當前集數沒有對應規則，則借用第一條規則的 ID 來顯示資訊
      if (!rule) {
        if (State.rules.length > 0) {
          rule = State.rules[0]; // 借用系列 ID
        } else {
          return this.renderHomeUnbound(container);
        }
      }

      try {
        const info = await App.getMediaData(rule.aniId);
        const statusData = info.mediaListEntry;
        State.userStatus = statusData;
        UI.updateNav(CONSTANTS.STATUS.BOUND);

        const currentStatus = statusData?.status || 'NOT_IN_LIST';

        let opts =
          currentStatus === 'NOT_IN_LIST'
            ? `<option value="NOT_IN_LIST" selected>尚未加入清單 (Not in List)</option>`
            : '';

        Object.values(CONSTANTS.ANI_STATUS).forEach((setting) => {
          const isSelected = currentStatus === setting.value ? 'selected' : '';
          opts += `<option value="${setting.value}" ${isSelected}>
          ${setting.label} (${setting.anilist_label})</option>`;
        });

        container.innerHTML = Templates.homeBound(rule, info, statusData, opts, isUnknownEp);

        _.$('#home-status', container).addEventListener('change', async function () {
          const s = this.value;
          if (s === 'NOT_IN_LIST') {
            return;
          }
          this.disabled = true;
          try {
            const newS = await AniListAPI.updateUserStatus(rule.aniId, s);
            App.updateLocalStatus(rule.aniId, newS);
            UI.showToast('✅ 狀態已更新');
            UI.loadTabContent('home');
          } catch (e) {
            UI.showToast('❌ 更新失敗: ' + e.message);
            this.disabled = false;
          }
        });

        _.$('#home-save-id', container).addEventListener('click', () => {
          const nid = parseInt(_.$('#home-edit-id', container).value);
          if (nid) {
            App.bindSeries(nid, '手動更新');
          }
        });

        _.$('#btn-unbind', container).addEventListener('click', () => {
          if (confirm('確定要解除此作品的所有綁定嗎？')) {
            GM_deleteValue(`${CONSTANTS.STORAGE_PREFIX}${State.bahaSn}`);
            State.cachedCreditsData = null;
            location.reload();
          }
        });

        _.$('#btn-refresh-data', container)?.addEventListener('click', function () {
          State.cachedMediaInfo = null;
          UI.loadTabContent('home');
        });
      } catch (e) {
        container.innerHTML = Templates.errorCard(e.message, State.isMaintenance);
      }
    },
    renderHomeUnbound(container) {
      const data = State.bahaData || {};
      container.innerHTML = Templates.homeUnbound(State.candidate, data.nameJp);

      if (State.candidate) {
        _.$('#btn-quick', container).addEventListener('click', () => {
          return App.bindSeries(State.candidate.id, State.candidate.title.native);
        });
      }

      const doSearch = async () => {
        const resContainer = _.$('#search-res', container);
        resContainer.innerHTML = Templates.statusNotice('搜尋中...');
        try {
          const res = await AniListAPI.search(_.$('#search-in', container).value);
          let html = '';
          const list = res.data.Page.media || [];
          if (list.length === 0) {
            html = Templates.statusNotice('找不到結果');
          } else {
            list.forEach((m) => {
              html += Templates.searchResult(m);
            });
          }
          resContainer.innerHTML = html;
          _.$$('.bind-it', resContainer).forEach((btn) => {
            btn.addEventListener('click', function () {
              App.bindSeries(this.dataset.id, this.dataset.title);
            });
          });
        } catch (e) {
          resContainer.innerHTML = Templates.errorCard(e.message, State.isMaintenance);
        }
      };

      _.$('#btn-search', container).addEventListener('click', doSearch);
      _.$('#search-in', container).addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          doSearch();
        }
      });
      if (data.nameJp) {
        doSearch();
      }
    },
    async renderSeries(container) {
      container.innerHTML = Templates.statusNotice('讀取系列資訊中...');

      const activeRules = State.rules;
      let baseRule = State.activeRule;

      // 如果 activeRule 不在 rules 列表裡，或者根本沒 activeRule
      if (
        !baseRule ||
        !activeRules.find((r) => {
          return r.aniId === baseRule.aniId;
        })
      ) {
        baseRule = activeRules.length > 0 ? activeRules[0] : null;
      }

      if (!baseRule && activeRules.length === 0) {
        container.innerHTML = Templates.statusNotice('請先在主頁綁定作品');
        return;
      }

      const searchId = baseRule ? baseRule.aniId : null;

      try {
        let chain;
        if (State.cachedSeriesChain && State.cachedSeriesBaseId === searchId) {
          chain = State.cachedSeriesChain;
        } else {
          chain = await AniListAPI.getSequelChain(searchId);
          State.cachedSeriesChain = chain;
          State.cachedSeriesBaseId = searchId;
        }

        // 讀取「顯示全系列作」開關狀態
        const showAllSeries = GM_getValue(CONSTANTS.KEYS.SHOW_ALL_SERIES, false);
        const rootMedia = chain.find((x) => {
          return x.id === searchId;
        });
        const rootFormat = rootMedia ? rootMedia.format : null;

        const isItemFilterable = (m) => {
          const isActive = State.rules.some((r) => {
            return r.aniId === m.id;
          });
          if (isActive || !rootFormat) {
            return false;
          }

          if (['OVA', 'SPECIAL'].includes(rootFormat)) {
            return !['OVA', 'SPECIAL'].includes(m.format);
          } else if (rootFormat === 'MOVIE') {
            return m.format !== 'MOVIE';
          } else {
            return m.format === 'MOVIE';
          }
        };

        // 檢查是否存在任何可被過濾隱藏的作品
        const hasFilterableItems = chain.some(isItemFilterable);

        // 1. 取得頁面現況範圍
        const pageMin = EpisodeCalculator.getMin();
        const pageMax = EpisodeCalculator.getMax();

        const anchorStart = baseRule ? baseRule.bahaStart : pageMin || 1;

        const initialUIState = {};
        State.rules.forEach((r) => {
          initialUIState[r.aniId] = r.bahaStart;
        });

        SeriesLogic.calculateOffsets(chain, searchId, anchorStart, initialUIState);

        let rowsHtml = '';
        chain.forEach((m) => {
          const existing = State.rules.find((r) => {
            return r.aniId === m.id;
          });
          const isActive = !!existing;

          if (!showAllSeries && !isActive && rootFormat) {
            let shouldHide = false;
            if (['OVA', 'SPECIAL'].includes(rootFormat)) {
              if (!['OVA', 'SPECIAL'].includes(m.format)) {
                shouldHide = true;
              }
            } else if (rootFormat === 'MOVIE') {
              if (m.format !== 'MOVIE') {
                shouldHide = true;
              }
            } else {
              // 預設為 TV/ONA 等常規連載：若關聯項目是電影則隱藏
              if (m.format === 'MOVIE') {
                shouldHide = true;
              }
            }
            if (shouldHide) {
              return;
            } // 跳過不渲染，保持 UI 乾淨
          }

          let isOut = true;

          if (m.suggestedStart !== undefined) {
            if (pageMin !== null && pageMax !== null) {
              // 正常番劇頁面：依據頁面最大/最小集數判定
              const mEnd = m.episodes ? m.suggestedStart + m.episodes - 1 : 999999;
              isOut = m.suggestedStart > pageMax || mEnd < pageMin;
            } else {
              // 獨立單集/電影頁面（pageMin 為 null）：除了目前綁定的這部作品，其餘皆視為「非本頁」
              isOut = m.id !== searchId;
            }
          }

          const isSuggestion = !isActive && !isOut;

          let bahaVal;
          if (existing) {
            if (existing.bahaStart !== undefined) {
              // 優先使用 bahaStart
              bahaVal = existing.bahaStart;
            } else {
              // 否則使用 start
              bahaVal = existing.start;
            }
          } else if (isSuggestion) {
            // 沒有 existing，但有建議
            bahaVal = m.suggestedStart;
          } else {
            // 都沒有
            bahaVal = '';
          }

          rowsHtml += Templates.seriesRow(m, isActive, isSuggestion, isOut, bahaVal);
        });

        container.innerHTML = Templates.seriesTab({
          pageMin,
          pageMax,
          rowsHtml,
          hasFilterableItems,
          showAllSeries,
        });

        const refreshUIOffsets = () => {
          const uiState = {};
          _.$$('.series-row', container).forEach((r) => {
            const cb = _.$('.cb-active', r);
            if (cb.checked) {
              const id = parseInt(r.dataset.id);
              const val = parseInt(_.$('.inp-start', r).value);
              // 如果勾選但沒輸入數字，保留 null 讓它自動推算；若有數字則強制作為基準
              uiState[id] = isNaN(val) ? null : val;
            }
          });

          // 即時重新計算
          SeriesLogic.calculateOffsets(chain, searchId, anchorStart, uiState);

          // 更新畫面上其他行的「建議數值」與輸入框提示 (placeholder)
          _.$$('.series-row', container).forEach((r) => {
            const id = parseInt(r.dataset.id);
            const m = chain.find((x) => {
              return x.id === id;
            });
            if (m && m.calculatedStart !== undefined) {
              const btn = _.$('.btn-toggle', r);
              btn.dataset.suggested = m.calculatedStart; // 偷藏在按鈕上的值

              const cb = _.$('.cb-active', r);
              if (!cb.checked) {
                const isInf = m.calculatedStart === Infinity;
                _.$('.inp-start', r).placeholder = isInf ? '?' : m.calculatedStart;
              }
            }
          });
        };

        const updateRow = (row, active, val) => {
          const btn = _.$('.btn-toggle', row);
          const statusSpan = _.$('.al-tag', row);
          const cb = _.$('.cb-active', row);
          const inp = _.$('.inp-start', row);

          cb.checked = active;
          row.classList.remove('al-row-active', 'al-row-suggest');
          statusSpan.classList.remove('success', 'warn', 'error', 'default');
          btn.classList.remove('al-btn-primary', 'al-btn-danger', 'al-btn-outline');
          btn.classList.add('al-btn', 'btn-toggle', 'al-btn-sm');

          if (active) {
            row.classList.add('al-row-active');

            statusSpan.textContent = '使用中';
            statusSpan.classList.add('success'); // 綠色標籤

            btn.textContent = '取消';
            btn.classList.add('al-btn-danger'); // 紅色按鈕

            // 自動填入建議值
            if (val !== undefined && val !== '') {
              let suggestedVal = parseInt(val, 10);
              if (suggestedVal < 1) {
                suggestedVal = 1;
              }
              inp.value = suggestedVal;
            }
          } else {
            statusSpan.textContent = '未用';
            statusSpan.classList.add('default'); // 灰色標籤

            btn.textContent = '啟用';
            btn.classList.add('al-btn-outline'); // 線框按鈕

            inp.value = '';
          }
          refreshUIOffsets();
        };

        _.$$('.btn-toggle', container).forEach((btn) => {
          btn.addEventListener('click', function () {
            const row = this.closest('tr');
            const cb = _.$('.cb-active', row);
            if (cb.checked) {
              updateRow(row, false);
            } else {
              updateRow(row, true, this.dataset.suggested || '');
            }
          });
        });

        _.$$('.inp-start', container).forEach((inp) => {
          inp.addEventListener('input', function () {
            if (this.value !== '' && Number(this.value) < 0) {
              this.value = 0;
            }
            const row = this.closest('tr');
            if (this.value) {
              updateRow(row, true);
            } else {
              updateRow(row, false);
            }
          });
        });

        _.$('#btn-refresh-series', container).addEventListener('click', async function () {
          State.cachedSeriesChain = null;
          UI.renderSeries(container);
        });

        _.$('#chk-show-all-series', container)?.addEventListener('change', function () {
          GM_setValue(CONSTANTS.KEYS.SHOW_ALL_SERIES, this.checked);
          UI.renderSeries(container);
        });

        _.$('#save-series', container).addEventListener('click', () => {
          const newRules = [];
          _.$$('.series-row', container).forEach((row) => {
            const cb = _.$('.cb-active', row);
            const bahaVal = parseInt(_.$('.inp-start', row).value);

            // 允許輸入 0，只要不是 NaN 即可
            if (cb.checked && !isNaN(bahaVal)) {
              newRules.push({
                aniId: parseInt(row.dataset.id),
                title: row.dataset.title,
                bahaStart: bahaVal,
              });
            }
          });
          if (newRules.length === 0) {
            return UI.showToast('❌ 至少需要設定一個起始集數');
          }

          App.saveRules(newRules);

          UI.showToast('✅ 系列設定已儲存，重新整理中...');
          _.fadeOut(_.$('#al-modal'));

          setTimeout(() => {
            return location.reload();
          }, 500);
        });

        refreshUIOffsets();
      } catch (e) {
        container.innerHTML = Templates.errorCard(e.message, State.isMaintenance);
      }
    },
    /**
     * 1. 供 Modal 中的 Tab 使用
     */
    async renderInfo(container) {
      container.innerHTML = Templates.statusNotice('讀取 Syoboi 與聲優資料中...');
      const data = await App.getShowCreditsForActiveRule();

      if (!data) {
        container.innerHTML = Templates.statusNotice('無法取得聲優/主題曲資料或未綁定作品');
        return;
      }

      container.innerHTML = Templates.syoboiInfoContent(data.creditsData, data.wikiMap);
    },

    /**
     * 2. 供頁面直接內嵌使用 (.anime-option 區塊)
     */
    async renderInlineInfo() {
      const showInline = GM_getValue(
        CONSTANTS.KEYS.SHOW_INLINE_INFO,
        CONSTANTS.DEFAULTS.SHOW_INLINE_INFO,
      );
      const targetContainer = document.querySelector(CONSTANTS.SELECTORS.BAHA.PAGE.inlineContainer);
      let inlineCardEl = document.querySelector('#al-inline-info-wrapper');

      if (!showInline || !targetContainer) {
        if (inlineCardEl) {
          inlineCardEl.remove();
        }
        return;
      }

      // 自動偵測動畫瘋開關並同步深色主題 Class
      const updateThemeClass = (el) => {
        const isDark =
          document.body.classList.contains('theme-dark') ||
          document.documentElement.classList.contains('dark') ||
          !!document.getElementById('darkmode-moon')?.checked;

        if (isDark) {
          el.classList.add('al-theme-dark');
        } else {
          el.classList.remove('al-theme-dark');
        }
      };

      if (!inlineCardEl) {
        inlineCardEl = document.createElement('div');
        inlineCardEl.id = 'al-inline-info-wrapper';
        inlineCardEl.className = 'al-mt-3';
        updateThemeClass(inlineCardEl);
        inlineCardEl.innerHTML = Templates.statusNotice('載入聲優/主題曲資訊中...');
        targetContainer.insertAdjacentElement('beforeend', inlineCardEl);
      } else {
        updateThemeClass(inlineCardEl);
      }

      // --- 即時主題切換監聽機制 ---
      if (!inlineCardEl.dataset.themeObserved) {
        inlineCardEl.dataset.themeObserved = 'true';

        // 1. 監聽巴哈姆特深色模式開關 (Moon Checkbox)
        const moonBtn = document.getElementById('darkmode-moon');
        if (moonBtn) {
          moonBtn.addEventListener('change', () => {
            return updateThemeClass(inlineCardEl);
          });
        }

        // 2. 監聽 body/documentElement 的 Class 變更 (因應切換開關時 Class 的改動)
        const observer = new MutationObserver(() => {
          return updateThemeClass(inlineCardEl);
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }

      const data = await App.getShowCreditsForActiveRule();
      if (!data) {
        inlineCardEl.remove();
        return;
      }

      inlineCardEl.innerHTML = Templates.syoboiInfoContent(data.creditsData, data.wikiMap, true);
    },
  };
  // #endregion

  // #region ================= [App] 主程式控制器 =================
  const App = {
    init() {
      Utils.validatePage(); //檢查CSS選擇器
      if (!GM_getValue(CONSTANTS.KEYS.TOKEN)) {
        Log.warn('Token 未設定');
      }
      window.addEventListener(
        'message',
        (event) => {
          if (event.data && event.data.type === 'ANILIST_AUTH_TOKEN') {
            const token = event.data.token;
            if (token) {
              GM_setValue(CONSTANTS.KEYS.TOKEN, token);
              UI.showToast('🎉 授權成功！正在重新整理...');
              Log.info('Token received via OAuth');
              setTimeout(() => {
                location.reload();
              }, 1000);
            }
          }
        },
        false,
      );
      this.waitForNavbar();
      this.startMonitor();
      this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
    },
    async waitForNavbar() {
      const indexLink = await _.waitForElement('a[href="index.php"]');

      if (indexLink) {
        const nav = indexLink.closest('ul');
        if (nav) {
          UI.initNavbar(nav);
          this.updateUIStatus();
        }
      } else {
        Log.warn('Navbar not found (Timeout)');
      }
    },
    startMonitor() {
      this.checkUrlChange();
      setInterval(() => {
        return this.checkUrlChange();
      }, 1000);
    },
    checkUrlChange() {
      if (!location.href.includes(CONSTANTS.URLS.VIDEO_PAGE)) {
        return;
      }
      const params = new URLSearchParams(location.search);
      const newSn = params.get('sn');
      if (newSn && newSn !== State.currentUrlSn) {
        State.currentUrlSn = newSn;
        this.resetEpisodeState();
        this.loadEpisodeData();
        this.startVideoHunt();
      }
    },
    resetEpisodeState() {
      const video = document.querySelector(CONSTANTS.SELECTORS.BAHA.PAGE.videoElement);
      if (video) {
        video.removeEventListener('timeupdate', this.handleTimeUpdate);
      }
      State.hasSynced = false;
      State.isHunting = false;
      State.stopSync = false;
      State.tokenErrorCount = 0;
      State.lastTimeUpdate = 0;
    },
    async loadEpisodeData() {
      const requestId = ++State.currentRequestId;
      if (document.hidden) {
        Log.info('分頁在背景中，暫停同步...');
        UI.updateNav(CONSTANTS.STATUS.STANDBY);

        await new Promise((resolve) => {
          const handler = () => {
            if (!document.hidden) {
              document.removeEventListener('visibilitychange', handler);
              resolve();
            }
          };
          document.addEventListener('visibilitychange', handler);
        });

        await new Promise((r) => {
          return setTimeout(r, 300);
        });
      }
      const acgLink = this.getAcgLink();
      if (!acgLink) {
        return;
      }
      State.bahaSn = new URLSearchParams(acgLink.split('?')[1]).get('s');
      if (!State.bahaData) {
        State.bahaData = await this.fetchBahaData(acgLink);
      }
      if (requestId !== State.currentRequestId) {
        return;
      } // 判定是否已被最新的切換請求覆蓋
      const savedRules = GM_getValue(`${CONSTANTS.STORAGE_PREFIX}${State.bahaSn}`);
      if (savedRules) {
        State.rules = Array.isArray(savedRules) ? savedRules : [];
        State.rules.sort((a, b) => {
          return (b.bahaStart || 0) - (a.bahaStart || 0);
        });
      } else {
        State.rules = [];
        if (GM_getValue(CONSTANTS.KEYS.TOKEN)) {
          this.tryAutoBind();
        }
      }
      await this.determineActiveRule();
      if (requestId !== State.currentRequestId) {
        return;
      } // 判定是否已被最新的切換請求覆蓋
      this.updateUIStatus();
    },
    getAcgLink() {
      const el = document.querySelector(CONSTANTS.SELECTORS.BAHA.PAGE.acgLink);
      if (el) {
        return el.getAttribute('href');
      }
      const alt = [...document.querySelectorAll(CONSTANTS.SELECTORS.BAHA.PAGE.acgLinkAlt)].find(
        (a) => {
          return a.textContent.includes('作品資料');
        },
      );
      return alt ? alt.getAttribute('href') : null;
    },
    async determineActiveRule() {
      if (State.rules.length === 0) {
        State.activeRule = null;
        return;
      }
      const currentEp = EpisodeCalculator.getRawCurrent();

      // 如果 currentEp 為 null（例如總集篇 X.5），使用 parseFromTitle 獲取浮點數判斷
      let targetEp = currentEp;
      if (targetEp === null) {
        targetEp = EpisodeCalculator.parseFromTitle();
      }

      if (targetEp !== null) {
        State.activeRule =
          State.rules.find((r) => {
            return targetEp >= r.bahaStart;
          }) || State.rules[State.rules.length - 1];
      } else {
        // 找不到集數，預設抓第一條規則顯示 UI
        State.activeRule = State.rules[0];
      }

      if (State.activeRule && GM_getValue(CONSTANTS.KEYS.TOKEN)) {
        try {
          const data = await AniListAPI.getMediaAndStatus(State.activeRule.aniId);

          if (data && data.idMal) {
            data.syoboiUrl = await MALAPI.fetchSyoboiUrl(data);
          }

          // --- 偵測集數溢位 ---
          if (targetEp !== null) {
            // 計算當前規則能涵蓋的最大集數：起點 + 總集數 - 1
            const ruleStart = State.activeRule.bahaStart;
            const maxEpCovered = ruleStart + (data.episodes || 999) - 1;

            // 若當前觀看集數超越了該規則的最大集數，代表遇到未記錄的 OVA 或續作
            if (targetEp > maxEpCovered) {
              Log.info(
                `[溢位偵測] 當前集數 ${targetEp} 超出涵蓋範圍 ${maxEpCovered}，準備查驗新作品...`,
              );
              const hasAppended = await this.silentAppendNewOVA(State.activeRule.aniId, targetEp);

              if (hasAppended) {
                return this.determineActiveRule();
              }
            }
          }
          // ------------------------------------------

          if (data.mediaListEntry) {
            State.userStatus = data.mediaListEntry;
          } else {
            State.userStatus = null;
          }
          State.cachedMediaInfo = data;
          this.updateUIStatus();
        } catch (e) {
          Log.error('Fetch status error:', e);
        }
      }

      UI.renderInlineInfo();
    },

    // --- 無損追加新系列設定 ---
    async silentAppendNewOVA(baseId, currentEp) {
      try {
        // 1. 取得最新系列樹
        const chain = await AniListAPI.getSequelChain(baseId);

        // 2. 建立「全啟用」的模擬狀態，確保集數能正確累加
        const mockUIState = {};
        chain.forEach((m) => {
          const existing = State.rules.find((r) => {
            return r.aniId === m.id;
          });
          // 若手動設定存在則帶入具體數字，否則給 null 讓程式自動往下推算
          mockUIState[m.id] = existing ? existing.bahaStart : null;
        });

        // 3. 帶入模擬設定，計算真正的連續集數
        SeriesLogic.calculateOffsets(chain, baseId, State.activeRule.bahaStart, mockUIState);

        let isModified = false;

        // 4. 尋找「唯一」符合當前集數的新作品
        for (const m of chain) {
          const exists = State.rules.find((r) => {
            return r.aniId === m.id;
          });
          if (!exists && m.calculatedStart !== undefined) {
            const mStart = m.calculatedStart;
            const mEnd = m.episodes ? mStart + m.episodes - 1 : 999999;

            // 嚴格比對：當前集數必須落在此作品的區間內
            if (currentEp >= mStart && currentEp <= mEnd) {
              State.rules.push({
                aniId: m.id,
                title: m.title.native || m.title.romaji,
                malId: m.idMal || null,
                bahaStart: mStart,
              });
              isModified = true;
              Log.info(`✨ 自動無損追加單一系列作: ${m.title.native} (起算集數: ${mStart})`);

              // 找到目標後立即中斷，避免一次啟用多個作品
              break;
            }
          }
        }

        // 5. 若有更新，靜默儲存並通知使用者
        if (isModified) {
          State.rules.sort((a, b) => {
            return (b.bahaStart || 0) - (a.bahaStart || 0);
          }); // 確保大到小排序不被破壞
          GM_setValue(`${CONSTANTS.STORAGE_PREFIX}${State.bahaSn}`, State.rules);
          UI.showToast('✨ 偵測到新續作，已自動加入系列設定！');
          return true;
        }
        return false;
      } catch (e) {
        Log.error('追加新 OVA 失敗:', e);
        return false;
      }
    },
    async startVideoHunt() {
      if (State.isHunting) {
        return;
      }
      State.isHunting = true;
      if (State.rules.length > 0) {
        UI.updateNav(CONSTANTS.STATUS.SYNCING, '搜尋播放器...');
      }
      State.syncSettings = {
        mode: GM_getValue(CONSTANTS.KEYS.SYNC_MODE, 'instant'),
        customSec: GM_getValue(CONSTANTS.KEYS.CUSTOM_SEC, 60),
        customPct: GM_getValue(CONSTANTS.KEYS.CUSTOM_PCT, 80),
      };

      const video = await _.waitForElement(CONSTANTS.SELECTORS.BAHA.PAGE.videoElement, 120000);
      if (video) {
        if (video.dataset.alHooked !== State.currentUrlSn) {
          video.dataset.alHooked = State.currentUrlSn;
          video.addEventListener('timeupdate', this.handleTimeUpdate);

          State.isHunting = false;

          if (State.rules.length > 0) {
            this.updateUIStatus();
          }
        }
      } else {
        State.isHunting = false;
        Log.warn('Video player search timeout');
      }
    },
    handleTimeUpdate(e) {
      if (State.hasSynced || State.stopSync) {
        return;
      }
      const now = Date.now();
      if (now - State.lastTimeUpdate < 1000) {
        return;
      }
      State.lastTimeUpdate = now;

      const video = e.target;

      // 廣告判斷不更新
      const playerContainer = video.closest('.video-js');
      const isAdClass = playerContainer && playerContainer.classList.contains('vjs-ad-playing');
      const isTooShort = !video.duration || video.duration < 90;

      if (isAdClass || isTooShort) {
        Log.info('Skipping: Ad detected or video too short.');
        return;
      }

      const { mode, customSec, customPct } = State.syncSettings;

      if (mode === CONSTANTS.SYNC_MODES.PAUSED.value) {
        return;
      }

      let shouldSync = false;

      if (mode === CONSTANTS.SYNC_MODES.INSTANT.value) {
        shouldSync = video.currentTime > 5;
      } else if (mode === CONSTANTS.SYNC_MODES.TWO_MIN.value) {
        shouldSync = video.currentTime > 120;
      } else if (mode === CONSTANTS.SYNC_MODES.EIGHTY_PCT.value) {
        shouldSync = video.duration > 0 && video.currentTime / video.duration > 0.8;
      } else if (mode === CONSTANTS.SYNC_MODES.CUSTOM_SEC.value) {
        shouldSync = video.currentTime > customSec;
      } else if (mode === CONSTANTS.SYNC_MODES.CUSTOM_PCT.value) {
        shouldSync = video.duration > 0 && video.currentTime / video.duration > customPct / 100;
      }

      if (shouldSync) {
        State.hasSynced = true;
        this.syncProgress();
      }
    },
    async getMediaData(id) {
      if (State.cachedMediaInfo && State.cachedMediaInfo.id === id) {
        Log.info('Using Cached Data (App.getMediaData)');
        return State.cachedMediaInfo;
      }
      const data = await AniListAPI.getMediaAndStatus(id);
      State.cachedMediaInfo = data;
      return data;
    },
    saveRules(newRules) {
      newRules.sort((a, b) => {
        return (b.bahaStart || 0) - (a.bahaStart || 0);
      });
      State.rules = newRules;
      State.cachedCreditsData = null;
      GM_setValue(`${CONSTANTS.STORAGE_PREFIX}${State.bahaSn}`, newRules);
      this.determineActiveRule().then(() => {
        this.updateUIStatus();
      });
      Log.info('Rules saved and updated.');
    },
    updateLocalStatus(targetId, newStatusEntry) {
      State.userStatus = newStatusEntry;
      if (State.cachedMediaInfo && State.cachedMediaInfo.id === targetId) {
        State.cachedMediaInfo.mediaListEntry = newStatusEntry;
      }
    },
    async syncProgress() {
      // 1. 取得按鈕上的原始數字
      const rawEp = EpisodeCalculator.getRawCurrent();

      // 2. 如果是 null或沒規則，直接結束，不同步
      if (rawEp === null || !State.activeRule) {
        return;
      }

      const rule = State.activeRule;

      // 3. 公式：按鈕數字 - 巴哈起始 + AniList起始
      // 範例：第80集 (80 - 1 + 1 = 80)、第0集 (0 - 0 + 1 = 1)
      let progress = rawEp - rule.bahaStart + 1;

      UI.updateNav(CONSTANTS.STATUS.SYNCING, `同步 Ep.${progress}...`);
      Log.info(`Syncing progress: Ep.${progress} for media ${rule.aniId}`);

      try {
        const data = await App.getMediaData(rule.aniId);

        const maxEp = data.episodes;
        const checkData = data.mediaListEntry; // 從合併資料中取得狀態

        if (maxEp && progress > maxEp) {
          Log.info(`Progress clamped from ${progress} to ${maxEp}`);
          progress = maxEp;
        }

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
          await AniListAPI.updateUserStatus(rule.aniId, CONSTANTS.ANI_STATUS.CURRENT.value);
        }

        if (checkData?.progress > progress) {
          const overrideMode = GM_getValue(
            CONSTANTS.KEYS.OVERRIDE_MODE,
            CONSTANTS.OVERRIDE_MODES.PROTECT.value,
          );
          if (overrideMode === CONSTANTS.OVERRIDE_MODES.PROTECT.value) {
            UI.updateNav(CONSTANTS.STATUS.INFO, '略過同步(已同步)');
            return;
          } else if (overrideMode === CONSTANTS.OVERRIDE_MODES.PROMPT.value) {
            const isConfirm = window.confirm(
              `您目前正在觀看 Ep.${progress}\n但 AniList 紀錄已達 Ep.${checkData.progress}。\n\n請問是否要將雲端進度「往前回退」到 Ep.${progress}？`,
            );
            if (!isConfirm) {
              UI.updateNav(CONSTANTS.STATUS.INFO, '略過同步(取消覆蓋)');
              return;
            }
          }
        } else if (checkData?.progress === progress) {
          UI.updateNav(CONSTANTS.STATUS.INFO, '略過同步(已同步)');
          return;
        }

        let result = await AniListAPI.updateUserProgress(rule.aniId, progress);
        this.updateLocalStatus(rule.aniId, result);

        if (maxEp && progress === maxEp && result.status !== CONSTANTS.ANI_STATUS.COMPLETED.value) {
          Log.info('Auto completing media...');
          result = await AniListAPI.updateUserStatus(
            rule.aniId,
            CONSTANTS.ANI_STATUS.COMPLETED.value,
          );
          State.userStatus = result; // 若有自動完結，再次更新狀態
          UI.updateNav(CONSTANTS.STATUS.DONE, `已同步 Ep.${progress} (完結)`);
        } else {
          UI.updateNav(CONSTANTS.STATUS.DONE, `已同步 Ep.${progress}`);
        }
      } catch (e) {
        const errStr = e.message;
        UI.updateNav(CONSTANTS.STATUS.ERROR, '同步失敗');
        if (State.isMaintenance) {
          UI.showToast('⚠️ 伺服器維護中，已暫停自動同步');
        } else if (errStr.includes('Token') || errStr.includes('Invalid Token')) {
          State.tokenErrorCount++;
          if (State.tokenErrorCount >= 3) {
            State.stopSync = true;
          }
          UI.updateNav(CONSTANTS.STATUS.TOKEN_ERROR);
        } else if (errStr.includes('Too Many Requests')) {
          State.stopSync = true;
          UI.showToast('⚠️ 請求過於頻繁，已暫停同步');
        } else {
          UI.updateNav(CONSTANTS.STATUS.ERROR, '同步失敗');
          setTimeout(() => {
            State.hasSynced = false;
          }, CONSTANTS.SYNC_DEBOUNCE_MS);
        }
      }
    },
    async tryAutoBind() {
      if (!State.bahaData) {
        return;
      }

      UI.updateNav(CONSTANTS.STATUS.SYNCING, '自動匹配中...');

      const strategies = [
        // 1.使用日文或英文名搜尋，並比對開播日期
        {
          name: 'NameSearch',
          execute: async () => {
            const { nameEn, nameJp, dateJP, dateTW } = State.bahaData;
            const terms = [nameEn, nameJp].filter(Boolean);

            for (let term of terms) {
              try {
                const res = await AniListAPI.search(term);
                const list = res.data.Page.media || [];

                if (list.length > 0 && !State.candidate) {
                  State.candidate = list[0];
                }

                const match = list.find((media) => {
                  return (
                    Utils.isDateCloseEnough(dateJP.obj, media.startDate) ||
                    Utils.isDateCloseEnough(dateTW.obj, media.startDate)
                  );
                });

                if (match) {
                  return match;
                }
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
          execute: async () => {
            const { dateJP, dateTW, site } = State.bahaData;
            if (!site) {
              return null;
            }

            const range = Utils.getFuzzyDateRange(
              dateJP.obj || dateTW.obj,
              CONSTANTS.SEARCH_RANGE_DAYS,
            );

            if (!range) {
              return null;
            }

            try {
              const res = await AniListAPI.searchByDateRange(range.start, range.end);
              const list = res.data.Page.media || [];

              return list.find((media) => {
                const domainMatch = media.externalLinks?.some((l) => {
                  return Utils.extractDomain(l.url)?.includes(site);
                });
                // 雙重確認：網域對了，日期也要大致對
                const dateMatch =
                  Utils.isDateCloseEnough(dateJP.obj, media.startDate) ||
                  Utils.isDateCloseEnough(dateTW.obj, media.startDate);
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
        match = await strategy.execute();
        if (match) {
          Log.info(`[AutoBind] Matched by ${strategy.name}:`, match.title.native);
          break;
        }
      }

      if (match) {
        await this.bindSeries(match.id, match.title.native || match.title.romaji);
      } else {
        UI.updateNav(CONSTANTS.STATUS.UNBOUND);
        if (State.candidate) {
          UI.showToast('🧐 找到可能的作品，請點擊確認');
        }
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

      UI.updateNav(CONSTANTS.STATUS.SYNCING, '分析系列作結構...');

      let newRules = [];
      const targetId = parseInt(id);

      try {
        const chain = await AniListAPI.getSequelChain(targetId);

        const exists = chain.find((m) => {
          return m.id === targetId;
        });
        if (!exists) {
          chain.push({
            id: targetId,
            title: { native: title, romaji: title },
            episodes: 12,
            format: 'TV',
          });
        }

        const pageMin = EpisodeCalculator.getMin();
        const pageMax = EpisodeCalculator.getMax();
        const anchorStart = pageMin !== null ? pageMin : 1;

        const currentUIState = {};
        State.rules.forEach((r) => {
          currentUIState[r.aniId] = r.bahaStart;
        });
        SeriesLogic.calculateOffsets(chain, targetId, anchorStart, currentUIState);

        const targetMedia = chain.find((x) => {
          return x.id === targetId;
        });
        const targetStart = targetMedia ? targetMedia.calculatedStart : null;

        chain.forEach((m) => {
          if (m.calculatedStart === undefined) {
            return;
          }

          const mStart = m.calculatedStart;
          const mEnd = m.episodes ? mStart + m.episodes : 999999;

          let isOverlapping = pageMax > 0 ? mStart <= pageMax && mEnd >= pageMin : false;

          // 如果目標本身就是頁面起始，則前面的作品不算重疊
          if (targetStart !== null && targetStart === pageMin) {
            if (mStart < targetStart) {
              isOverlapping = false;
            }
          }

          if (m.id === targetId || isOverlapping) {
            newRules.push({
              aniId: m.id,
              title: m.title.native || m.title.romaji,
              malId: m.idMal || null,
              bahaStart: mStart,
            });
          }
        });
      } catch (e) {
        Log.warn('Series Bind Failed:', e);
      }

      // 防呆保險
      if (newRules.length === 0) {
        const fallback = EpisodeCalculator.getMin() || 1;
        newRules.push({
          aniId: targetId,
          title: title,
          bahaStart: fallback,
        });
      }

      App.saveRules(newRules);

      UI.showToast(`✅ 綁定成功！(已自動設定 ${State.rules.length} 個系列作)`);

      _.fadeOut(_.$('#al-modal'));

      if (CONSTANTS.SYNC_ON_BIND && !State.isHunting) {
        this.syncProgress();
      }
    },
    async fetchBahaData(url) {
      try {
        const html = await new Promise((r, j) => {
          return GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload: (x) => {
              return r(x.responseText);
            },
            onerror: j,
          });
        });
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (CONSTANTS.DEBUG) {
          Utils.validateParser(doc);
        } else {
          if (!doc.querySelector(CONSTANTS.SELECTORS.BAHA.PARSER.infoTitle)) {
            Log.error('Parser Error: 找不到標題，巴哈可能改版');
          }
        }

        const titleJp =
          doc.querySelector(CONSTANTS.SELECTORS.BAHA.PARSER.infoTitle)?.textContent.trim() || '';
        const titles = doc.querySelectorAll(CONSTANTS.SELECTORS.BAHA.PARSER.infoTitle);
        const titleEn = titles.length > 1 ? titles[1].textContent.trim() : '';

        const getTextFromList = (items, keyword) => {
          const found = items.find((el) => {
            return el.textContent.includes(keyword);
          });
          if (!found) {
            return null;
          }
          const parts = found.textContent.split('：');
          return parts.length > 1 ? parts[1].trim() : null;
        };

        const listItems = [...doc.querySelectorAll(CONSTANTS.SELECTORS.BAHA.PARSER.infoList)];
        const dateJpStr = getTextFromList(listItems, '當地');
        const dateTwStr = getTextFromList(listItems, '台灣');

        let siteDomain = '';
        const offLinkEl = [...doc.querySelectorAll('.ACG-box1listB > li')]
          .find((el) => {
            return el.textContent.includes('官方網站');
          })
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
      if (!GM_getValue(CONSTANTS.KEYS.TOKEN)) {
        UI.updateNav(CONSTANTS.STATUS.TOKEN_ERROR);
        return;
      }
      const isVideoPage = location.href.includes(CONSTANTS.URLS.VIDEO_PAGE);
      if (!isVideoPage) {
        UI.updateNav(CONSTANTS.STATUS.STANDBY);
        return;
      }
      if (State.rules.length === 0) {
        UI.updateNav(CONSTANTS.STATUS.UNBOUND);
      } else if (State.isMaintenance) {
        UI.updateNav(CONSTANTS.STATUS.ERROR, 'AniList 維護中');
      } else {
        if (
          GM_getValue(CONSTANTS.KEYS.SYNC_MODE, 'instant') === CONSTANTS.SYNC_MODES.PAUSED.value
        ) {
          UI.updateNav(CONSTANTS.STATUS.INFO, '已暫停同步');
        } else {
          UI.updateNav(CONSTANTS.STATUS.BOUND);
        }
      }
    },

    /**
     * 統一的資料抓取與快取中心
     */
    async getShowCreditsForActiveRule() {
      const rule = State.activeRule;
      if (!rule) {
        return null;
      }

      try {
        const mediaInfo = await App.getMediaData(rule.aniId);
        if (!mediaInfo) {
          return null;
        }

        // 快取憑據 Key
        const cacheKey = `media_${mediaInfo.id}`;
        if (State.cachedCreditsData && State.cachedCreditsData.cacheKey === cacheKey) {
          return State.cachedCreditsData;
        }

        let finalCast = [];
        let finalSongs = [];
        let syoboiSource = '';
        let hasSyoboiCast = false;

        // --------------------------------------------------
        // 階段 1：嘗試從 Syoboi 抓取資料 (第一優先)
        // --------------------------------------------------
        if (mediaInfo.syoboiUrl) {
          const syoboiData = await SyoboiAPI.fetchInfo(mediaInfo.syoboiUrl);
          if (syoboiData) {
            finalSongs = syoboiData.song || [];
            syoboiSource = syoboiData.source || mediaInfo.syoboiUrl;

            // 檢查 Syoboi 是否有聲優資料
            if (Array.isArray(syoboiData.cast) && syoboiData.cast.length > 0) {
              finalCast = syoboiData.cast;
              hasSyoboiCast = true;
              Log.info('[Cast Source] 成功使用 Syoboi 聲優資料');
            }
          }
        }

        // --------------------------------------------------
        // 階段 2：若 Syoboi 無聲優資料，備用改抓 AniList (Fallback)
        // --------------------------------------------------
        if (!hasSyoboiCast) {
          Log.warn('[Cast Source] Syoboi 無聲優資料或連線失敗，備用切換至 AniList');
          finalCast = Utils.extractCast(mediaInfo);
        }

        // --------------------------------------------------
        // 階段 3：取得 Wiki 跨語言連結與打包回傳
        // --------------------------------------------------
        const wikiMap = await WikiAPI.getZhWikiLinks(finalCast);

        const combinedData = {
          creditsData: {
            cast: finalCast,
            song: finalSongs,
            source: syoboiSource || `https://anilist.co/anime/${mediaInfo.id}`,
          },
          wikiMap,
          cacheKey,
        };

        State.cachedCreditsData = combinedData;
        return combinedData;
      } catch (e) {
        Log.error('Fetch Combined Info Error', e);
        return null;
      }
    },
  };
  // #endregion
  setTimeout(() => {
    return App.init();
  }, 500);
})();
