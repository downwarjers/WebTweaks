// ==UserScript==
// @name         Bahamut Anime to AniList Sync
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      4.1
// @description  巴哈姆特動畫瘋同步到 AniList。支援系列設定(一鍵啟用/取消)、自動計算集數、自動日期匹配綁定
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

(function() {
    'use strict';

    const $ = window.jQuery;

    // --- 狀態變數 ---
    let state = {
        // [身分與設定]
        token: GM_getValue('ANILIST_TOKEN'), // AniList 的授權金鑰
        updateTime: 1,                       // 同步觸發時間：當影片播放超過「1秒」時觸發
        diffDays: 2,                         // 日期容錯天數：自動搜尋時允許開播日相差 ±2 天 (處理時區問題)

        // [綁定規則與數據]
        rules: [],                           // 綁定規則列表：存放「第 X 集開始對應 AniList ID Y」的設定
        activeRule: null,                    // 當前規則：根據目前集數，從 rules 中挑出正在使用的那一條
        userStatus: null,                    // 使用者狀態：你在 AniList 上的進度 (status: 觀看中/已看完, progress: 第幾集)
        bahaSn: null,                        // 作品 SN：整部動畫的唯一編號 (對應網址參數 s=xxxxx)

        // [執行時期的監控]
        currentUrlSn: null,                  // 單集 SN：目前這一集的唯一編號 (對應網址參數 sn=xxxxx，換集會變)
        hasSynced: false,                    // 同步鎖：本集是否已經同步過了？ (防止看同一集時重複發送請求)
        isHunting: false,                    // 搜尋鎖：是否正在尋找網頁上的 <video> 播放器？

        // [計時器 (Timer Handles)]
        huntTimer: null,                     // 搜尋計時器 ID：用來停止搜尋播放器的迴圈 (clearInterval 用)
        statusTimeout: null,                 // 狀態計時器 ID：用來清除右上角暫時顯示的文字 (例如「已同步」顯示 3 秒後消失)
        isAutoBinding: false                 // 自動綁定鎖：是否正在執行自動匹配？ (防止重複觸發 API 請求)
    };

    // --- 設定：網頁元素選擇器 ---
    const SELECTORS = {
        // 作品資料頁面 (Auto Bind 用)
        infoTitle: '.ACG-info-container > h2',
        infoList: '.ACG-box1listA > li',
        infoChTitle: '.anime_name > h1',
        // 播放頁面 (集數偵測用)
        seasonList: '.season ul li',
        playing: '.playing',
        acgLink: 'a[href*="acgDetail.php"]',
        acgLinkAlt: 'a:contains("作品資料")'
    };

    // --- CSS ---
    GM_addStyle(`
        .al-nav-item { margin-left: 10px; padding-left: 10px; border-left: 1px solid #555; display: inline-flex; align-items: center; height: 100%; vertical-align: middle; }
        .al-nav-link { color: #ccc; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 6px; transition: 0.2s; font-size: 13px; text-decoration: none !important; height: 40px; width: auto; }
        .al-nav-link:hover { color: #fff; }
        #al-text { white-space: nowrap; font-weight: bold; }
        .al-user-status { color: #4caf50; font-size: 12px; margin-left: 8px; padding-left: 8px; border-left: 1px solid #666; white-space: nowrap; display: none; }
        .al-nav-title { color: #888; font-size: 12px; margin-left: 8px; padding-left: 8px; border-left: 1px solid #666; display: inline-block; max-width: 300px; min-width: 50px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
        @media (max-width: 1200px) { .al-nav-title { max-width: 150px; } }
        @media (max-width: 768px) { .al-nav-title { display: none; } }
        
        /* Modal & UI */
        .al-modal-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:none; justify-content:center; align-items:center; }
        .al-modal-content { background:#fff; color:#333; width:750px; max-height:90vh; border-radius:8px; display:flex; flex-direction:column; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .al-modal-header { padding:15px; background:#f5f5f5; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center; }
        .al-modal-header button { color: #555 !important; font-weight: bold; }
        .al-modal-body { overflow-y:auto; padding:0; flex:1; }
        .al-modal-footer { padding:15px; background:#f9f9f9; border-top:1px solid #ddd; }
        
        .al-result-item { padding:12px 15px; border-bottom:1px solid #eee; display:flex; gap:12px; align-items:center; transition: background 0.2s; }
        .al-result-item:hover { background:#eef7ff; }
        .al-current-info { background: #e3f2fd; border: 1px solid #90caf9; border-radius: 5px; margin-bottom: 15px; }
        .al-bind-btn { background:#3db4f2; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px; }
        .al-bind-btn:hover { background:#2a9bd6; }
        .al-btn-grey { background:#d32f2f; color:white; border:none; padding:10px; border-radius:4px; cursor:pointer; width: 100%; margin-top: 15px; }
        .al-btn-green { background:#4caf50; color:white; border:none; padding:10px; border-radius:4px; cursor:pointer; width: 100%; font-size:14px; margin-bottom: 10px; }
        .al-ext-search-group { display: flex; gap: 10px; padding: 10px 15px; background: #fafafa; border-bottom: 1px solid #eee; }
        .al-btn-ext { flex: 1; text-align: center; text-decoration: none; padding: 8px; border-radius: 4px; font-size: 13px; background: #fff; border: 1px solid #ccc; color: #555; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 5px; }
        .al-btn-ext:hover { background: #eee; color: #333; border-color: #bbb; }
        .al-input-group { display:flex; gap:10px; margin-top:5px; }
        .al-input { flex:1; padding:8px; border:1px solid #ccc; border-radius:4px; }
        
        /* Series Mapper Table */
        .al-map-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .al-map-table th { background: #eee; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; }
        .al-map-table td { padding: 10px; border-bottom: 1px solid #eee; vertical-align: middle; }
        .al-map-input { width: 70px; padding: 6px; border: 1px solid #ccc; border-radius: 4px; text-align: center; font-weight: bold; }
        .al-map-input:focus { border-color: #3db4f2; outline: none; background: #e3f2fd; }
        
        /* Toggle Action Button */
        .al-btn-toggle { padding: 5px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; width: 100%; transition: 0.2s; }
        .al-btn-toggle.enable { background-color: #e0e0e0; color: #333; }
        .al-btn-toggle.enable:hover { background-color: #4caf50; color: white; }
        .al-btn-toggle.disable { background-color: #ffebee; color: #d32f2f; }
        .al-btn-toggle.disable:hover { background-color: #d32f2f; color: white; }

        /* Row Status */
        .al-map-row.active { background-color: #e8f5e9; }
        .al-map-row.active .status-text { color: #2e7d32; font-weight: bold; }
        .al-map-row .status-text { color: #999; }
        .al-checkbox { display: none; } /* 完全隱藏 checkbox，改用按鈕控制 */
        .al-toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(50, 50, 50, 0.9);
            color: #fff;
            padding: 10px 20px;
            border-radius: 20px;
            z-index: 100000;
            font-size: 14px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            animation: al-fadein 0.3s, al-fadeout 0.3s 2.7s forwards;
        }
        @keyframes al-fadein { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes al-fadeout { from { opacity: 1; } to { opacity: 0; } }
    `);

    // ================= 主程式 =================
    function main() {
        if (!state.token) {
            let t = prompt('請輸入 AniList Access Token:');
            if (t) GM_setValue('ANILIST_TOKEN', state.token = t.trim());
            else return;
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
        if (!location.href.includes('animeVideo.php')) return;
        const urlParams = new URLSearchParams(location.search);
        const newSn = urlParams.get('sn');
        if (newSn !== state.currentUrlSn) {
            state.currentUrlSn = newSn;
            state.hasSynced = false;
            state.userStatus = null;
            state.isAutoBinding = false; // 重置自動綁定狀態
            initEpisodeData();
            triggerVideoHunt();
        }
    }

    function triggerVideoHunt() {
        if (state.isHunting) return;
        state.isHunting = true;
        if (state.rules.length > 0) updateNavStatus('syncing', '搜尋播放器...');
        if (state.huntTimer) clearInterval(state.huntTimer);
        let attempts = 0;
        state.huntTimer = setInterval(() => {
            const video = document.querySelector('video');
            attempts++;
            if (video && video.dataset.alHooked !== state.currentUrlSn) {
                video.dataset.alHooked = state.currentUrlSn;
                video.addEventListener('timeupdate', handleTimeUpdate);
                clearInterval(state.huntTimer);
                state.isHunting = false;
                if (state.rules.length > 0) updateNavStatus('bound');
            } else if (attempts >= 50) {
                clearInterval(state.huntTimer);
                state.isHunting = false;
            }
        }, 200);
    }

    function handleTimeUpdate(e) {
        if (!state.hasSynced && e.target.currentTime > state.updateTime) {
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
        return el.length > 0 ? el.attr('href') : null;
    }

    async function initEpisodeData() {
        const acgLink = getAcgLink();
        if (!acgLink) return;
        state.bahaSn = new URLSearchParams(acgLink.split('?')[1]).get('s');
        const savedData = GM_getValue(`baha_acg_${state.bahaSn}`);
        
        if (savedData) {
            if (Array.isArray(savedData)) {
                state.rules = savedData.sort((a, b) => b.start - a.start);
            } else if (typeof savedData === 'object' && savedData.id) {
                state.rules = [{ start: 1, id: savedData.id, title: savedData.title }];
            } else {
                try {
                    const info = await fetchAnimeInfo(savedData);
                    const title = info.title.native || info.title.romaji;
                    state.rules = [{ start: 1, id: savedData, title: title }];
                } catch(e) { /* ignore */ }
            }
            determineActiveRule();
        } else {
            // 無綁定資料：嘗試自動綁定
            state.rules = [];
            state.activeRule = null;
            tryAutoBind();
        }

        if (state.activeRule) {
            fetchUserStatus(state.activeRule.id).then(statusData => {
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
        updateNavStatus('syncing', '嘗試自動匹配...');

        const acgLink = getAcgLink();
        if (!acgLink) {
            updateNavStatus('unbound');
            state.isAutoBinding = false;
            return;
        }

        try {
            // 1. 抓取巴哈頁面資料
            const html = await gmGet(acgLink);
            const $doc = $(new DOMParser().parseFromString(html, "text/html"));

            // 解析名稱
            const h2s = $doc.find(SELECTORS.infoTitle);
            const nameJp = h2s.eq(0).text().trim();
            const nameEn = h2s.eq(1).text().trim();
            
            // 解析日期 (當地 & 台灣) - 格式抓取參考
            // 抓取格式如："當地首播：2024-01-04" 或 "台灣首播：2024-01-04"
            const dateJpText = $doc.find(SELECTORS.infoList + ':contains("當地")').text();
            const dateTwText = $doc.find(SELECTORS.infoList + ':contains("台灣")').text();
            
            const dateJpStr = dateJpText ? dateJpText.split('：')[1] : '';
            const dateTwStr = dateTwText ? dateTwText.split('：')[1] : '';

            // 輔助函式：解析 "YYYY-MM-DD" 到 Date 物件結構
            const parseDate = (str) => {
                if (!str) return null;
                const match = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                if (match) {
                    return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) };
                }
                return null;
            };

            const bahaDateJP = parseDate(dateJpStr);
            const bahaDateTW = parseDate(dateTwStr);

            // 輔助函式：比較日期是否在誤差範圍內 (+/- x 天)
            const isDateCloseEnough = (target, check) => {
                if (!target || !check || !check.year || !check.month || !check.day) return false;
                // JS Month is 0-indexed
                const t = new Date(target.year, target.month - 1, target.day);
                const c = new Date(check.year, check.month - 1, check.day);
                const diffTime = Math.abs(c - t);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                // 允許差x天
                return diffDays <= state.diffDays; 
            };

            // 2. 搜尋 AniList (優先搜英文，沒有再搜日文)
            let searchTerms = [nameEn, nameJp].filter(t => t);
            let matchFound = null;

            for (let term of searchTerms) {
                try {
                    const result = await searchAniList(term);
                    const candidates = result.data.Page.media || [];

                    // 3. 比對日期 (支援 +/- 1天誤差)
                    for (let media of candidates) {
                        const anilistDate = media.startDate;
                        
                        // 略過沒有完整日期的資料
                        if (!anilistDate.year || !anilistDate.month || !anilistDate.day) continue;

                        const isMatchJP = isDateCloseEnough(bahaDateJP, anilistDate);
                        const isMatchTW = isDateCloseEnough(bahaDateTW, anilistDate);

                        if (isMatchJP || isMatchTW) {
                            matchFound = media;
                            break;
                        }
                    }
                } catch (e) { console.error('Auto bind search error:', e); }

                if (matchFound) break;
            }

            // 4. 處理結果
            if (matchFound) {
                const title = matchFound.title.native || matchFound.title.romaji;
                console.log(`[Auto-Bind] Match found: ${title} (ID: ${matchFound.id})`);
                await performBinding(matchFound.id, title);
            } else {
                console.log('[Auto-Bind] No date match found (checked +/- 1 day).');
                updateNavStatus('unbound'); // 維持未綁定狀態
            }

        } catch (e) {
            console.error('[Auto-Bind] Error:', e);
            updateNavStatus('unbound');
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
            state.activeRule = state.rules.find(r => currentEp >= r.start) || state.rules[state.rules.length - 1];
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

        // 3. 完全找不到列表 (seasonList.length === 0)
        // 這時直接回傳 1
        return 1;
    }

    async function syncProgress() {
        const episode = getCurrentEpisode();
        if (!episode) return;
        determineActiveRule();
        const rule = state.activeRule;
        if (!rule) { updateNavStatus('error', '無匹配規則'); return; }
        const progress = episode - rule.start + 1;
        updateNavStatus('syncing', `同步 Ep.${progress}...`);
        try {
            const checkData = await fetchUserStatus(rule.id);
            state.userStatus = checkData;
            if (checkData?.status === 'COMPLETED') {
                updateNavStatus('info', '略過同步');
                return;
            }
            const mutation = `mutation ($id: Int, $p: Int) { SaveMediaListEntry (mediaId: $id, progress: $p) { id progress status } }`;
            const result = await aniListRequest(mutation, { id: rule.id, p: progress });
            state.userStatus = result.data.SaveMediaListEntry; 
            updateNavStatus('done', `已同步第 ${episode} 集`);
        } catch (e) {
            updateNavStatus('error', '同步失敗');
            state.hasSynced = false;
        }
    }

    // ================= UI Helper =================
    function refreshUIState() {
        if (state.rules.length === 0) {
             // 如果正在自動綁定中，不要馬上顯示「連結 AniList」
            if(!state.isAutoBinding) updateNavStatus('unbound');
        }
        else updateNavStatus('bound');
    }
    
    function showToast(msg) {
        const t = $(`<div class="al-toast">${msg}</div>`).appendTo('body');
        setTimeout(() => t.remove(), 3000); // 3秒後移除
    }

    function updateNavStatus(type, msg) {
        const icon = $('#al-icon');
        const text = $('#al-text');
        const titleSpan = $('#al-title');
        if (!icon.length) return;
        if (state.statusTimeout) { clearTimeout(state.statusTimeout); state.statusTimeout = null; }
        
        const showTitle = state.activeRule && (type === 'bound' || type === 'syncing' || type === 'done' || type === 'info');
        if (showTitle) titleSpan.text(state.activeRule.title).css('display', 'inline-block');
        else titleSpan.hide();

        if (showTitle && state.userStatus) {
            let statusText = '';
            const s = state.userStatus.status;
            const p = state.userStatus.progress;
            console.log("userStatus---------------------"+state.userStatus);
            if (s === 'CURRENTLY_WATCHING') statusText = `📺 看到 ${p} 集`;
            else if (s === 'COMPLETED') statusText = `🎉 已看完`;
            else if (s === 'PLANNING') statusText = `📅 計畫中`;
            else if (s === 'DROPPED') statusText = `🗑️ 棄番`;
            else if (s === 'PAUSED') statusText = `⏸️ 暫停`;
            else if (p > 0) statusText = `Ep. ${p}`;
            if (statusText) {
                if ($('#al-user-status').length === 0) $('#al-text').after('<span id="al-user-status" class="al-user-status"></span>');
                $('#al-user-status').text(statusText).css('display', 'inline-block');
            }
        } else { $('#al-user-status').hide(); }

        if (type === 'unbound') { icon.text('🔗'); text.text('連結 AniList'); }
        else if (type === 'bound') { icon.text('✅'); text.text('已連動'); }
        else if (type === 'syncing') { icon.text('🔄'); text.text(msg); }
        else if (type === 'done') { 
            icon.text('✅'); text.text(msg); 
            state.statusTimeout = setTimeout(() => { 
                icon.text('✅'); text.text('已連動'); 
                if(state.activeRule) titleSpan.text(state.activeRule.title).show(); 
                if(state.userStatus && $('#al-user-status').length) $('#al-user-status').show();
            }, 1500); 
        }
        else if (type === 'error') { icon.text('❌'); text.text(msg); }
        else if (type === 'info') { icon.text('ℹ️'); text.text(msg); }
    }

    function getDateValue(dateObj) {
        if (!dateObj || !dateObj.year) return 99999999;
        return dateObj.year * 10000 + (dateObj.month || 1) * 100 + (dateObj.day || 1);
    }
    function formatDate(dateObj) {
        if (!dateObj || !dateObj.year) return '日期未定';
        return `${dateObj.year}/${String(dateObj.month||1).padStart(2,'0')}/${String(dateObj.day||1).padStart(2,'0')}`;
    }

    // ================= Manager & Search =================
    function handleNavClick() {
        if (location.href.includes('animeVideo.php')) {
            try {
                if (state.rules.length === 0) startSearch();
                else showManager();
            } catch(e) { alert('開啟視窗失敗: ' + e.message); }
        } else { showTokenReset(); }
    }

    async function showManager() {
        const rule = state.activeRule || state.rules[0];
        if (!rule) return startSearch();
        showModal('讀取中...', '', false);
        try {
            const extBtns = await getExtSearchHtml();
            const info = await fetchAnimeInfo(rule.id);
            const userStat = await fetchUserStatus(rule.id);
            state.userStatus = userStat;
            const body = $('#al-modal-body');
            body.empty();
            body.append(extBtns);
            let statusBadge = userStat ? `<div style="margin-top:5px;font-size:12px;color:#4caf50;">你的進度: ${userStat.status} (Ep.${userStat.progress})</div>` : '';
            body.append(`
                <div style="padding:20px;">
                    <div style="margin-bottom:10px; font-weight:bold; color:#555;">目前對應：(第 ${rule.start} 集起)</div>
                    <div class="al-result-item al-current-info">
                        <img src="${info.coverImage.medium}" style="width:60px;height:90px;object-fit:cover;border-radius:4px;">
                        <div style="flex:1">
                            <div style="font-weight:bold; font-size:15px; color:#000;">${rule.title}</div>
                            <div style="font-size:13px;color:#555; margin-top:3px;">ID: ${rule.id}</div>
                            <div style="font-size:12px;color:#777; margin-top:3px;">開播: ${formatDate(info.startDate)}</div>
                            ${statusBadge}
                        </div>
                    </div>
                    <button id="al-open-mapper" class="al-btn-green">📺 設定多季/系列同步 (Series Mapping)</button>
                    <div style="margin-top:15px; border-top:1px solid #eee; padding-top:10px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold; font-size:13px;">單獨修正此區段 ID:</label>
                        <div class="al-input-group">
                            <input type="number" id="al-edit-id" class="al-input" value="${rule.id}">
                            <button id="al-save-id" class="al-bind-btn" style="background:#666;">更新</button>
                        </div>
                    </div>
                    <button id="al-unbind" class="al-btn-grey">解除所有綁定</button>
                </div>
            `);
            $('#al-save-id').click(async () => { 
                const nid = parseInt($('#al-edit-id').val()); 
                if(nid) { 
                    $('#al-save-id').text('更新中...').prop('disabled', true);
                    try {
                        const newInfo = await fetchAnimeInfo(nid);
                        rule.id = nid;
                        rule.title = newInfo.title.native || newInfo.title.romaji; 
                        GM_setValue(`baha_acg_${state.bahaSn}`, state.rules);
                        state.userStatus = await fetchUserStatus(nid);
                        refreshUIState();
                        showManager(); 
                    } catch (e) { alert('更新失敗'); $('#al-save-id').text('更新').prop('disabled', false); }
                }
            });
            $('#al-unbind').click(function(e) {
                e.preventDefault();
                if(!state.bahaSn) { alert('錯誤：無法取得作品 SN'); return; }
                if(confirm('確定要解除此作品的所有綁定嗎？')) {
                    $(this).text('解除中...').prop('disabled', true);
                    GM_deleteValue(`baha_acg_${state.bahaSn}`);
                    state.rules = [];
                    state.activeRule = null;
                    state.userStatus = null;
                    refreshUIState();
                    startSearch();
                }
            });
            $('#al-open-mapper').click(() => showSeriesMapper());
            $('#al-modal-footer').empty();
        } catch (e) { showModal(`Error: ${e.message}`, 'error', true); }
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

   async function fetchSequelChain(startId) {
        let chain = [];
        let nextId = startId;
        let visited = new Set();
        for (let i = 0; i < 10; i++) {
            if (!nextId || visited.has(nextId)) break;

            if (i > 5) await sleep(300); 

            visited.add(nextId);
            const data = await fetchAnimeInfoWithRelations(nextId);
            chain.push(data);
            
            if (data.relations && data.relations.edges) {
                const sequelEdge = data.relations.edges.find(e => e.relationType === 'SEQUEL' && (e.node.format === 'TV' || e.node.format === 'ONA' || e.node.format === 'OVA'));
                nextId = sequelEdge ? sequelEdge.node.id : null;
            } else { nextId = null; }
        }
        return chain;
    }

    async function showSeriesMapper() {
        const body = $('#al-modal-body');
        body.html('<div style="padding:20px;text-align:center;">正在遞迴分析續作關聯...<br>這可能需要一點時間</div>');
        const baseId = state.activeRule ? state.activeRule.id : (state.rules[0] ? state.rules[0].id : null);
        if (!baseId) return body.html('錯誤：無基礎 ID');

        try {
            const chain = await fetchSequelChain(baseId);
            let html = `
                <div style="padding:15px;">
                    <div style="margin-bottom:10px;color:#555;font-size:12px;">
                        請點擊右側按鈕啟用續作同步。<br>
                        <strong>「➕ 啟用」會自動計算並帶入集數。</strong>
                    </div>
                    <table class="al-map-table">
                        <thead>
                            <tr>
                                <th>狀態</th>
                                <th>作品名稱 (AniList)</th>
                                <th style="width:50px;">集數</th>
                                <th style="width:70px;">起始集</th>
                                <th style="width:70px;">操作</th>
                            </tr>
                        </thead>
                        <tbody id="al-map-tbody">
            `;

            // 用來計算自動帶入的集數
            let runningEpisodes = 0;

            chain.forEach((media, index) => {
                const existingRule = state.rules.find(r => r.id === media.id);
                const isActive = !!existingRule;
                const rowClass = isActive ? 'active' : '';
                const statusText = isActive ? '✅ 使用中' : '⚪ 未設定';
                const inputValue = existingRule ? existingRule.start : '';
                const dateStr = formatDate(media.startDate);
                
                // 計算下一部的建議起始集數 (上一部結束 + 1)
                const suggestedStart = runningEpisodes + 1;
                // 累加目前這部的集數 (如果有)，供下一部使用
                if (media.episodes) runningEpisodes += media.episodes;

                html += `
                    <tr class="al-map-row ${rowClass}" data-id="${media.id}" data-title="${media.title.native || media.title.romaji}">
                        <td class="status-cell"><span class="status-text">${statusText}</span><input type="checkbox" class="al-checkbox" ${isActive ? 'checked' : ''}></td>
                        <td><div style="font-weight:bold;font-size:13px;">${media.title.native || media.title.romaji}</div><div style="color:#888;font-size:11px;">(${dateStr}) | ${media.title.romaji}</div></td>
                        <td>${media.episodes || '?'}</td>
                        <td><input type="number" class="al-map-input" placeholder="-" value="${inputValue}"></td>
                        <td>
                            <button class="al-btn-toggle ${isActive ? 'disable' : 'enable'}" data-suggested="${suggestedStart}">
                                ${isActive ? '✖️ 取消' : '➕ 啟用'}
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `</tbody></table></div>`;
            body.html(html);
            
            // Binding Input Events
            $('.al-map-input').on('input', function() {
                updateRowStatus($(this).closest('tr'), $(this).val());
            });

            // Binding Toggle Buttons (Auto Fill / Clear)
            $('.al-btn-toggle').click(function() {
                const row = $(this).closest('tr');
                const input = row.find('.al-map-input');
                const isEnableAction = $(this).hasClass('enable');

                if (isEnableAction) {
                    // One-click Enable: Fill with calculated suggestion
                    input.val($(this).data('suggested')).trigger('input');
                } else {
                    // One-click Disable: Clear input
                    input.val('').trigger('input');
                }
            });

            $('#al-modal-footer').html(`<button id="al-save-map" class="al-bind-btn" style="width:100%;padding:10px;font-size:14px;">儲存系列設定</button>`);
            $('#al-save-map').click(() => saveSeriesMapping());

        } catch (e) { body.html(`<div style="padding:20px;color:red;">載入失敗: ${e.message}</div>`); }
    }

    function updateRowStatus(row, val) {
        const checkbox = row.find('.al-checkbox');
        const statusSpan = row.find('.status-text');
        const btn = row.find('.al-btn-toggle');

        if (val && val.trim() !== '') {
            checkbox.prop('checked', true);
            row.addClass('active');
            statusSpan.text('✅ 準備儲存').css('color', '#1976d2');
            btn.removeClass('enable').addClass('disable').text('✖️ 取消');
        } else {
            checkbox.prop('checked', false);
            row.removeClass('active');
            statusSpan.text('⚪ 未設定').css('color', '#999');
            btn.removeClass('disable').addClass('enable').text('➕ 啟用');
        }
    }

    function saveSeriesMapping() {
        let newRules = [];
        $('.al-map-row').each(function() {
            const row = $(this);
            if (row.find('.al-checkbox').is(':checked')) {
                const startVal = parseInt(row.find('.al-map-input').val());
                if (startVal) {
                    newRules.push({
                        start: startVal,
                        id: row.data('id'),
                        title: row.data('title')
                    });
                }
            }
        });
        if (newRules.length === 0) return alert('請至少設定一部作品的起始集數');
        newRules.sort((a, b) => b.start - a.start);
        state.rules = newRules;
        GM_setValue(`baha_acg_${state.bahaSn}`, newRules);
        determineActiveRule();
        if(state.activeRule) fetchUserStatus(state.activeRule.id).then(s => { state.userStatus = s; refreshUIState(); });
        $('#al-modal').fadeOut(200);
        state.hasSynced = false;
        showToast('系列設定已儲存！');
    }

    async function startSearch() {
        const acgLink = getAcgLink();
        if (!acgLink) { alert('錯誤：無法找到「作品資料」連結。'); return; }
        showModal('初始化搜尋...', '', false);
        try {
            const html = await gmGet(acgLink);
            const $doc = $(new DOMParser().parseFromString(html, "text/html"));
            const h2s = $doc.find(SELECTORS.infoTitle);
            const nameJp = h2s.eq(0).text().trim();
            const nameEn = h2s.eq(1).text().trim();
            const nameCh = $('.anime_name > h1').text().trim().split('[')[0].trim();
            let terms = [nameEn, nameJp, nameCh].filter(t => t);
            const extBtns = `<div class="al-ext-search-group"><a href="https://anilist.co/search/anime?search=${encodeURIComponent(nameEn)}" target="_blank" class="al-btn-ext">🔍 搜 EN</a><a href="https://anilist.co/search/anime?search=${encodeURIComponent(nameJp)}" target="_blank" class="al-btn-ext">🔍 搜 JP</a></div>`;
            let results = [];
            for (let t of terms) {
                showModal(`搜尋中: ${t}`, '', false);
                try {
                    const d = await searchAniList(t);
                    if (d.data.Page.media.length) { 
                        results = d.data.Page.media; 
                        results.sort((a, b) => getDateValue(a.startDate) - getDateValue(b.startDate));
                        break; 
                    }
                } catch(e){}
            }
            renderResults(results, terms.join(', '), extBtns);
        } catch (e) { showModal(`錯誤: ${e.message}`, 'error', true); }
    }

    function renderResults(list, terms, extBtns) {
        const body = $('#al-modal-body').empty();
        if(extBtns) body.append(extBtns);
        body.append(`<div style="padding:10px 15px;color:#aaa;font-size:12px;border-bottom:1px solid #eee;">關鍵字: ${terms}</div>`);
        if (!list.length) body.append('<div style="padding:30px;text-align:center;">找不到結果，請手動輸入</div>');
        else {
            list.forEach(m => {
                const title = m.title.native || m.title.romaji;
                const dateStr = formatDate(m.startDate);
                body.append(`<div class="al-result-item"><img src="${m.coverImage.medium}" style="width:45px;height:65px;object-fit:cover;"><div style="flex:1"><div style="font-weight:bold">${title}</div><div style="font-size:12px;color:#888">(${dateStr}) | ${m.title.romaji}</div><div style="font-size:11px;color:#aaa">ID: ${m.id}</div></div><button class="al-bind-btn" data-id="${m.id}" data-title="${title}">綁定</button></div>`);
            });
        }
        $('.al-bind-btn').click(function() { performBinding($(this).data('id'), $(this).data('title')); });
        $('#al-modal-footer').html(`<div style="font-weight:bold;font-size:12px;margin-bottom:5px">手動 ID:</div><div class="al-input-group"><input type="number" id="al-manual-input" class="al-input"><button id="al-manual-btn" class="al-bind-btn" style="background:#555">綁定</button></div>`);
        $('#al-manual-btn').click(() => { const id = parseInt($('#al-manual-input').val()); if(id) performBinding(id, '手動輸入'); });
    }

    async function performBinding(id, title) {
        if (title === '手動輸入') {
            try {
                const info = await fetchAnimeInfo(id);
                title = info.title.native || info.title.romaji;
            } catch (e) { console.error(e); }
        }
        const newRule = { start: 1, id: id, title: title };
        state.rules = [newRule];
        GM_setValue(`baha_acg_${state.bahaSn}`, state.rules);
        determineActiveRule();
        state.userStatus = await fetchUserStatus(id);
        refreshUIState();
        $('#al-modal').fadeOut(200);
        state.hasSynced = false;
        showToast('綁定成功！');
        if(!state.isHunting) syncProgress();
    }

    async function getExtSearchHtml() {
        const acgLink = getAcgLink();
        if(!acgLink) return '';
        try {
            const html = await gmGet(acgLink);
            const $doc = $(new DOMParser().parseFromString(html, "text/html"));
            const h2s = $doc.find(SELECTORS.infoTitle);
            const nameJp = h2s.eq(0).text().trim();
            const nameEn = h2s.eq(1).text().trim();
            return `<div class="al-ext-search-group"><a href="https://anilist.co/search/anime?search=${encodeURIComponent(nameEn)}" target="_blank" class="al-btn-ext">🔍 搜 EN</a><a href="https://anilist.co/search/anime?search=${encodeURIComponent(nameJp)}" target="_blank" class="al-btn-ext">🔍 搜 JP</a></div>`;
        } catch(e) { return ''; }
    }

    function showTokenReset() { showModal('<div style="padding:20px"><button class="al-btn-grey" onclick="GM_setValue(\'ANILIST_TOKEN\',\'\');location.reload()">重設 Token</button></div>', '', false); }
    function showModal(html, type, showFooter) {
        const m = $('#al-modal').fadeIn(200);
        m.find('#al-modal-body').html(html.startsWith('<')?html:`<div style="padding:20px;text-align:center;">${html}</div>`);
        if(!showFooter) $('#al-modal-footer').empty();
        m.css('display','flex');
    }
    function waitForNavbar() { const t = setInterval(() => { const nav = $('ul:has(a[href="index.php"])').first(); if (nav.length) { clearInterval(t); initNavbar(nav); refreshUIState(); } }, 500); }
    function initNavbar(nav) { if ($('#al-trigger').length) return; nav.append(`<li class="al-nav-item"><a class="al-nav-link" id="al-trigger" title="點擊設定"><span id="al-icon">⚪</span><span id="al-text">AniList</span><span id="al-title" class="al-nav-title" style="display:none;"></span></a></li>`); $('#al-trigger').click(handleNavClick); $('body').append(`<div id="al-modal" class="al-modal-overlay"><div class="al-modal-content"><div class="al-modal-header"><strong style="font-size:16px;">AniList 設定</strong><button onclick="$('#al-modal').fadeOut(200)" style="border:none;background:none;font-size:24px;cursor:pointer;line-height:1;">&times;</button></div><div class="al-modal-body" id="al-modal-body"></div><div class="al-modal-footer" id="al-modal-footer"></div></div></div>`); }

    function gmGet(url) { return new Promise((r, j) => GM_xmlhttpRequest({ method:"GET", url, onload:x=>r(x.responseText), onerror:j })); }
    
    // API Helpers
    async function fetchAnimeInfoWithRelations(id) {
        const query = `query ($id: Int) { Media(id: $id) { id title { romaji native } format episodes startDate { year month day } relations { edges { relationType(version: 2) node { id title { romaji native } format episodes startDate { year month day } } } } } }`;
        const data = await aniListRequest(query, { id });
        return data.data.Media;
    }

    function fetchAnimeInfo(id) { const query = `query ($id: Int) { Media(id: $id) { id title { romaji native } coverImage { medium } seasonYear startDate { year month day } } }`; return aniListRequest(query, { id }).then(d => d.data.Media); }
    function fetchUserStatus(id) { const query = `query ($id: Int) { Media(id: $id) { mediaListEntry { status progress } } }`; return aniListRequest(query, { id }).then(d => d.data.Media.mediaListEntry); }
    function searchAniList(search) { return aniListRequest(`query($s:String){Page(page:1,perPage:10){media(search:$s,type:ANIME,sort:SEARCH_MATCH){id title{romaji english native}coverImage{medium}seasonYear startDate { year month day } format}}}`, {s:search}); }
    function aniListRequest(query, variables) { return new Promise((resolve, reject) => { GM_xmlhttpRequest({ method: "POST", url: "https://graphql.anilist.co", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + state.token }, data: JSON.stringify({ query, variables }), onload: r => { const d=JSON.parse(r.responseText); d.errors?reject(d.errors[0].message):resolve(d); }, onerror: reject }); }); }

    setTimeout(main, 500);
})();