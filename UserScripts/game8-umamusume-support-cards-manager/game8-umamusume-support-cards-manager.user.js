// ==UserScript==
// @name         Game8 馬娘支援卡評價與持有整合面板
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.6.7
// @description   整合Game8馬娘攻略網的支援卡評價顯示與持有率管理。核心功能包括：自動背景抓取評價資料、CSV匯入匯出、以及優化的「資料庫/畫面」同步邏輯
// @author       downwarjers
// @license      MIT
// @match        https://game8.jp/umamusume/393152
// @match        https://game8.jp/umamusume/372188
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/game8-umamusume-support-cards-manager/game8-umamusume-support-cards-manager.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/game8-umamusume-support-cards-manager/game8-umamusume-support-cards-manager.user.js 
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 0. 全域變數與設定
    // ==========================================
    const DB_KEY = 'g8_uma_db_v16'; // 資料庫存儲 Key (維持 v16 以繼承舊有資料)
    const MAX_CONCURRENT = 5;       // 背景抓取評價時的最大並發請求數

    // 記憶體中的資料庫快取
    // Map 結構: Key(圖片檔名) -> { key, img, cardTitle, charName, url, rating, fetched, possession }
    window.DB_MAP = new Map();
    window.LAST_UPDATE = 0;

    // 背景抓取佇列控制
    const FETCH_QUEUE = [];
    const QUEUE_SET = new Set();
    let ACTIVE_REQUESTS = 0;
    let monitorTimer = null;

    // ==========================================
    // 1. CSS 樣式定義
    // ==========================================
    GM_addStyle(`
        /* 啟動按鈕 */
        #g8-launcher {
            position: fixed; top: 120px; right: 20px; z-index: 99999;
            padding: 10px 20px; background: #C2185B; color: #fff;
            border: 2px solid #fff; border-radius: 8px; cursor: pointer;
            font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.5); font-size: 14px;
        }
        /* 主儀表板容器 */
        #g8-dashboard {
            display: none; position: fixed; top: 50px; left: 50%; transform: translateX(-50%);
            width: 95%; max-width: 1200px; height: 90vh;
            background: #212121; color: #eee; z-index: 100000;
            border: 2px solid #C2185B; border-radius: 8px;
            box-shadow: 0 0 30px rgba(0,0,0,0.9);
            flex-direction: column; font-family: "Microsoft JhengHei", sans-serif;
        }
        /* 標題列 */
        .g8-header {
            padding: 15px; background: #333; border-bottom: 1px solid #555;
            display: flex; justify-content: space-between; align-items: center;
        }
        .g8-update-time { font-size: 14px; color: #4CAF50; font-weight: bold; }

        /* 監控狀態列 */
        .g8-monitor-bar {
            background: #1a1a1a; padding: 8px 15px; font-size: 13px; color: #aaa;
            border-bottom: 1px solid #444; display: flex; gap: 20px; font-family: monospace;
            align-items: center;
        }
        .g8-monitor-val { color: #fff; font-weight: bold; }

        /* 控制面板與按鈕群 */
        .g8-controls {
            padding: 10px 20px; background: #2a2a2a; border-bottom: 1px solid #444;
            display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
        }
        .g8-btn {
            padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; color: white;
            font-size: 12px; display: flex; align-items: center; gap: 5px; white-space: nowrap;
        }
        .btn-db { background: #009688; }
        .btn-sync { background: #E91E63; }
        .btn-bg-fetch { background: #7B1FA2; }
        .btn-export { background: #FF9800; }
        .btn-import { background: #2196F3; }
        .btn-dom-sync { background: #d32f2f; border: 1px solid #ff5252; }
        .btn-clear { background: #607D8B; margin-left: auto; }

        .g8-checkbox-label {
            display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 13px;
            background: #333; padding: 5px 10px; border-radius: 4px; border: 1px solid #555; user-select: none;
        }

        /* 表格區塊 */
        .g8-table-wrap { flex: 1; overflow-y: auto; padding: 0; position: relative; }
        .g8-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .g8-table th { background: #444; position: sticky; top: 0; padding: 8px; text-align: center; z-index: 10; border-bottom: 2px solid #555; color: #fff;}
        .g8-table td { border-bottom: 1px solid #333; padding: 5px; vertical-align: middle; color: #ddd; text-align: center; }
        .g8-table td.text-left { text-align: left; }
        .g8-table tr:nth-child(even) { background: #2a2a2a; }
        .g8-table tr:hover { background: #383838; }
        .g8-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #555; }

        /* 狀態指示顏色 */
        .rate-cell { font-weight: 900; font-size: 14px; }
        .possess-cell { font-weight: bold; }
        .p-4 { color: #00E676; text-shadow: 0 0 5px rgba(0, 230, 118, 0.5); }
        .p-none { color: #777; opacity: 0.5; }
        .owned-yes { color: #4FC3F7; font-weight: bold; }
        .owned-no { color: #777; }

        /* 卡片上的 Overlay (顯示凸數+評價) */
        .g8-overlay {
            position: absolute; top: 0; right: 0;
            width: 100%; height: 100%; pointer-events: none; z-index: 20;
            display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end;
            padding: 2px;
        }
        .g8-ov-rate {
            font-size: 22px; font-weight: 900; color: #FFEB3B;
            font-family: 'Arial Black', sans-serif; line-height: 1;
            text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 3px 3px 3px rgba(0,0,0,0.8);
            margin-right: -2px; margin-top: -2px;
        }
        .g8-ov-poss {
            font-size: 18px; font-weight: bold; color: #fff;
            font-family: sans-serif;
            background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px 0 0 0;
            text-shadow: 1px 1px 0 #000;
        }
        .g8-ov-poss.p-4 { color: #00E676; border: 1px solid #00E676; }
        .g8-ov-poss.p-none { color: #aaa; font-size: 12px; }

        .rate-ss { color: #E040FB; }
        .rate-s { color: #FF5252; }
        .rate-u { color: #FFF; font-size: 16px; }

        /* 強制顯示與覆蓋 Game8 原生樣式 */
        div[class*="style-module__possessionItem___"] { position: relative !important; overflow: visible !important; }
        #g8-file-input { display: none; }
        
        /* 同步動畫標記 (Visual Feedback) */
        .g8-syncing { outline: 2px solid #FFEB3B !important; }
    `);

    // ==========================================
    // 2. UI 介面初始化 (Launcher & Dashboard)
    // ==========================================
    const launcher = document.createElement('button');
    launcher.id = 'g8-launcher';
    launcher.innerText = '📊 開啟儀表板 (v17)';
    launcher.onclick = () => document.getElementById('g8-dashboard').style.display = 'flex';
    document.body.appendChild(launcher);

    const dashboard = document.createElement('div');
    dashboard.id = 'g8-dashboard';
    dashboard.innerHTML = `
        <div class="g8-header">
            <div>
                <span style="font-size:18px; font-weight:bold; color:#EC407A;">Game8 馬娘強度管理 v17.0</span><br>
                <span class="g8-update-time" id="g8-time-display">尚未同步</span>
            </div>
            <button class="g8-btn btn-close" onclick="this.parentElement.parentElement.style.display='none'">×</button>
        </div>
        <div class="g8-monitor-bar">
            <span>佇列: <span id="mon-queue" class="g8-monitor-val">0</span></span>
            <span>進行: <span id="mon-active" class="g8-monitor-val">0</span></span>
            <span style="margin-left:auto; font-size:11px; color:#666;">* 監控中 (優先還原DB紀錄)</span>
        </div>
        <div class="g8-controls">
            <button class="g8-btn btn-db" id="btn-fetch-idx">1. 初始化 DB</button>
            <button class="g8-btn btn-sync" id="btn-sync-view">2. 監控中 (點擊停止)</button>
            <button class="g8-btn btn-bg-fetch" id="btn-bg-fetch">3. 背景補完評價</button>

            <div style="border-left:1px solid #555; height:20px; margin:0 5px;"></div>

            <label class="g8-checkbox-label">
                <input type="checkbox" id="g8-export-filter" checked> 僅匯出持有
            </label>
            <button class="g8-btn btn-export" id="btn-export-file">📤 匯出 CSV</button>
            <button class="g8-btn btn-import" id="btn-import-file">📥 匯入 CSV</button>
            <button class="g8-btn btn-dom-sync" id="btn-dom-sync" title="強制將所有卡片設為 DB 紀錄的狀態">🔁 全頁強制同步</button>

            <input type="file" id="g8-file-input" accept=".csv">
            <button class="g8-btn btn-clear" id="btn-clear-db">🗑️</button>
        </div>
        <div class="g8-table-wrap">
            <table class="g8-table">
                <thead>
                    <tr>
                        <th width="50">圖片</th>
                        <th width="150" style="text-align:left;">稱號</th>
                        <th width="100" style="text-align:left;">馬娘</th>
                        <th width="60">持有</th>
                        <th width="60">凸數</th>
                        <th width="60">評價</th>
                        <th width="60">狀態</th>
                    </tr>
                </thead>
                <tbody id="g8-tbody"></tbody>
            </table>
        </div>
    `;
    document.body.appendChild(dashboard);

    const timeDisplay = document.getElementById('g8-time-display');
    const tbody = document.getElementById('g8-tbody');
    const monQueue = document.getElementById('mon-queue');
    const monActive = document.getElementById('mon-active');
    const fileInput = document.getElementById('g8-file-input');
    const exportFilterCheck = document.getElementById('g8-export-filter');
    const syncBtn = document.getElementById('btn-sync-view');

    // ==========================================
    // 3. 資料庫讀寫操作
    // ==========================================
    loadDB();

    function loadDB() {
        const json = GM_getValue(DB_KEY);
        if (json) {
            try {
                const parsed = JSON.parse(json);
                window.DB_MAP = new Map(parsed.data);
                window.LAST_UPDATE = parsed.timestamp || 0;
                updateTimeDisplay();
                renderTable();
            } catch (e) {
                timeDisplay.innerText = '存檔損毀';
            }
        } else {
            timeDisplay.innerText = '無存檔';
        }
    }

    function saveDB() {
        if (window.LAST_UPDATE === 0) window.LAST_UPDATE = Date.now();
        const dataArray = Array.from(window.DB_MAP.entries()).map(([key, val]) => {
            const { tr, ...saveData } = val; // 排除 DOM 元素參照，避免序列化錯誤
            return [key, saveData];
        });
        GM_setValue(DB_KEY, JSON.stringify({ timestamp: window.LAST_UPDATE, data: dataArray }));
        updateTimeDisplay();
    }

    function updateTimeDisplay() {
        if (window.LAST_UPDATE > 0) {
            const d = new Date(window.LAST_UPDATE);
            const timeStr = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            timeDisplay.innerText = `最後紀錄時間: ${timeStr}`;
        } else {
            timeDisplay.innerText = '尚未有紀錄';
        }
    }

    // ==========================================
    // 4. 畫面渲染 (Table & Overlay)
    // ==========================================
    function renderTable() {
        tbody.innerHTML = '';
        if (window.DB_MAP.size === 0) return;

        const fragment = document.createDocumentFragment();
        window.DB_MAP.forEach((data, key) => {
            const tr = document.createElement('tr');
            tr.id = `g8-tr-${key}`;

            let rateClass = 'rate-cell';
            if (data.rating && data.rating.includes('SS')) rateClass += ' rate-ss';
            else if (data.rating && data.rating.includes('S')) rateClass += ' rate-s';
            else if (data.rating && data.rating !== '...') rateClass += ' rate-u';

            const isOwned = data.possession !== -1;
            const ownedHtml = isOwned ? '<span class="owned-yes">✔</span>' : '<span class="owned-no">✖</span>';
            const limitBreakHtml = isOwned
                ? (data.possession === 4 ? '<span class="p-4">4凸</span>' : `<span>${data.possession}凸</span>`)
                : '<span class="p-none">-</span>';

            const statusHtml = data.fetched ? '<span class="st-ok" style="color:#81C784">OK</span>' : '<span class="st-wait" style="color:#FFB74D">Wait</span>';

            tr.innerHTML = `
                <td><img src="${data.img}" class="g8-thumb"></td>
                <td class="text-left" style="color:#4FC3F7; font-weight:bold;">${data.cardTitle}</td>
                <td class="text-left">${data.charName}</td>
                <td id="o-${key}">${ownedHtml}</td>
                <td class="possess-cell" id="p-${key}">${limitBreakHtml}</td>
                <td class="${rateClass}">${data.rating || '...'}</td>
                <td id="st-${key}">${statusHtml}</td>
            `;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);
    }

    function updateCardOverlay(cardEl, data) {
        if (!cardEl) return;
        const old = cardEl.querySelector('.g8-overlay');
        if (old) old.remove();

        const div = document.createElement('div');
        div.className = 'g8-overlay';

        let rateClass = 'g8-ov-rate';
        if (data.rating.includes('SS')) rateClass += ' rate-ss';
        else if (data.rating.includes('S')) rateClass += ' rate-s';
        else rateClass += ' rate-u';

        let possText = '未';
        let possClass = 'g8-ov-poss p-none';
        if (data.possession >= 0) {
            possText = `★${data.possession}`;
            possClass = 'g8-ov-poss';
            if (data.possession === 4) possClass += ' p-4';
        }

        div.innerHTML = `
            <div class="${rateClass}">${data.rating}</div>
            <div class="${possClass}">${possText}</div>
        `;
        cardEl.appendChild(div);
    }

    // ==========================================
    // 5. 按鈕事件綁定 (匯入/匯出/同步/背景抓取)
    // ==========================================
    
    // 匯出 CSV
    document.getElementById('btn-export-file').onclick = function() {
        if (window.DB_MAP.size === 0) return;
        saveDB();
        const onlyOwned = exportFilterCheck.checked;
        const BOM = '\uFEFF';
        let csv = BOM + '卡片名稱,馬娘名稱,持有凸數,評價,圖片連結,詳細頁連結\n';
        let count = 0;

        window.DB_MAP.forEach(d => {
            if (onlyOwned && d.possession === -1) return;
            let pStr = (d.possession === -1) ? "未持有" : d.possession;
            const t1 = `"${d.cardTitle.replace(/"/g, '""')}"`;
            const t2 = `"${d.charName.replace(/"/g, '""')}"`;
            csv += `${t1},${t2},${pStr},${d.rating},${d.img},${d.url}\n`;
            count++;
        });

        if (count === 0) { alert('沒有符合條件的資料'); return; }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `umamusume_possession_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // 匯入 CSV
    document.getElementById('btn-import-file').onclick = () => fileInput.click();
    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            const text = evt.target.result;
            const lines = text.split('\n');
            let updatedCount = 0;
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
                if (!matches || matches.length < 6) continue;

                const pValStr = matches[2].replace(/^"|"$/g, '');
                const key = getImageKey(matches[4].replace(/^"|"$/g, ''));

                if (key && window.DB_MAP.has(key)) {
                    const data = window.DB_MAP.get(key);
                    let newP = -1;
                    if (pValStr !== '未持有') {
                        newP = parseInt(pValStr, 10);
                        if (isNaN(newP)) newP = -1;
                    }
                    data.possession = newP;
                    updatedCount++;
                }
            }
            window.LAST_UPDATE = Date.now();
            saveDB();
            renderTable();
            alert(`匯入完成！更新 ${updatedCount} 筆。`);
            // 匯入後清除所有卡片的同步狀態，強制重新同步
            document.querySelectorAll('div[data-g8-synced]').forEach(el => el.removeAttribute('data-g8-synced'));
            applyDbToDom();
        };
        reader.readAsText(file);
        this.value = '';
    };

    // 強制全頁同步 (以 DB 為準覆蓋畫面)
    document.getElementById('btn-dom-sync').onclick = function() {
        if(confirm('確定要將畫面所有卡片重置為 DB 紀錄的狀態嗎？')) {
            // 清除鎖定標記，讓掃描器重新工作
            document.querySelectorAll('div[data-g8-synced]').forEach(el => el.removeAttribute('data-g8-synced'));
            alert('即將開始同步，請勿移動滑鼠。');
            applyDbToDom();
        }
    };

    // 啟動監控 Loop
    function startMonitor() {
        syncBtn.innerText = '2. 監控中 (點擊停止)';
        syncBtn.style.background = '#4CAF50';
        scanVisibleCards();
        monitorTimer = setInterval(scanVisibleCards, 1000); // 縮短間隔以加快反應
    }
    startMonitor();
    document.getElementById('btn-sync-view').onclick = function() {
        if (monitorTimer) {
            clearInterval(monitorTimer);
            monitorTimer = null;
            this.innerText = '2. 暫停中 (點擊啟動)';
            this.style.background = '#E91E63';
        } else {
            startMonitor();
        }
    };

    // 背景抓取評價
    document.getElementById('btn-bg-fetch').onclick = function() {
        const btn = this;
        let addedCount = 0;
        window.DB_MAP.forEach((data, key) => {
            if (!data.fetched && !QUEUE_SET.has(key)) {
                QUEUE_SET.add(key);
                FETCH_QUEUE.push({ key: key, data: data, cardEl: null });
                addedCount++;
            }
        });
        if (addedCount > 0) {
            btn.innerText = `佇列 +${addedCount}`;
            processQueue();
            setTimeout(() => { btn.innerText = '3. 背景補完評價'; }, 3000);
        } else {
            alert('都抓完了');
        }
    };

    // 初始化 DB (從頁面爬取清單)
    document.getElementById('btn-fetch-idx').onclick = function() {
        if(!confirm('這會重置所有資料，確定嗎？')) return;
        this.disabled = true;
        GM_xmlhttpRequest({
            method: "GET", url: 'https://game8.jp/umamusume/372188',
            onload: (res) => {
                if(res.status===200) {
                    window.DB_MAP.clear();
                    const doc = new DOMParser().parseFromString(res.responseText, "text/html");
                    const links = doc.querySelectorAll('table.a-table td.center a.a-link');
                    let c = 0;
                    links.forEach(link => {
                        const img = link.querySelector('img');
                        if(!img) return;
                        const alt = img.getAttribute('alt')||"";
                        if(!alt.includes('［')) return;
                        const src = img.getAttribute('data-src') || img.src;
                        const key = getImageKey(src);
                        const title = alt.match(/［(.*?)］/)[1];
                        if(key) {
                            window.DB_MAP.set(key, {
                                key: key, img: src, cardTitle: title,
                                charName: link.innerText.trim(), url: link.href,
                                rating: '...', fetched: false, possession: -1
                            });
                            c++;
                        }
                    });
                    window.LAST_UPDATE = Date.now();
                    saveDB();
                    renderTable();
                    alert(`重置完成：${c} 筆`);
                    this.disabled = false;
                }
            }
        });
    };
    
    // 清空資料
    document.getElementById('btn-clear-db').onclick = () => {
        if(confirm('清空?')) { GM_deleteValue(DB_KEY); window.DB_MAP.clear(); renderTable(); }
    };

    // ==========================================
    // 6. 核心邏輯：防覆蓋與同步演算法
    // ==========================================

    function getImageKey(url) {
        if (!url) return null;
        try {
            const parts = url.split('/');
            for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i].match(/\.(png|jpg|jpeg|webp)/)) return parts[i];
            }
        } catch (e) {}
        return null;
    }

    // 主要掃描迴圈 (負責解決 DB 與 DOM 的狀態衝突)
    function scanVisibleCards() {
        const cards = document.querySelectorAll('div[class*="style-module__possessionItem___"]');
        let dbChanged = false;

        cards.forEach(card => {
            const img = card.querySelector('img');
            if (!img) return;
            const key = getImageKey(img.src);
            if (!key || !window.DB_MAP.has(key)) return;

            const dbData = window.DB_MAP.get(key);

            // 取得畫面目前狀態
            const notOwnedEl = card.querySelector('div[class*="notPossessedItem"]');
            const isOwnedVisual = !notOwnedEl;
            const currentLevel = isOwnedVisual ? card.querySelectorAll('div[class*="rhombusActive"]').length : -1;

            // --- 邏輯修正重點 ---
            // 檢查卡片是否已經「初始化同步」過 (防止渲染覆蓋 DB)
            if (!card.hasAttribute('data-g8-synced')) {
                // 狀況 A: 這是這張卡片第一次被腳本看到 (或是被重置過)
                // 優先權：DB > 畫面
                // 檢查 DB 是否有紀錄且與畫面不符
                if (dbData.possession !== currentLevel) {
                    // 執行同步動作：將畫面點擊成 DB 的樣子
                    simulateClick(card, dbData.possession);
                    // 注意：這裡 **不更新 DB**，也不標記 synced，等待下一次迴圈確認同步成功
                    // 因為點擊是異步的，可能需要幾次 scan 才能完成
                } else {
                    // 畫面與 DB 一致了，標記為已同步
                    card.setAttribute('data-g8-synced', 'true');
                    updateCardOverlay(card, dbData); // 補上 Overlay
                    // 將卡片加入背景抓取佇列 (如果還沒抓過評價)
                    if (!dbData.fetched && !QUEUE_SET.has(key)) {
                        QUEUE_SET.add(key);
                        FETCH_QUEUE.push({ key: key, data: dbData, cardEl: card });
                    }
                }
            } else {
                // 狀況 B: 已經同步過的卡片，代表使用者可能在手動修改
                // 此時以畫面為主，更新 DB
                if (dbData.possession !== currentLevel) {
                    dbData.possession = currentLevel;
                    window.LAST_UPDATE = Date.now();
                    dbChanged = true;

                    // 更新 UI 表格
                    const tdOwned = document.getElementById(`o-${key}`);
                    const tdPoss = document.getElementById(`p-${key}`);
                    if (tdOwned) tdOwned.innerHTML = (currentLevel !== -1) ? '<span class="owned-yes">✔</span>' : '<span class="owned-no">✖</span>';
                    if (tdPoss) tdPoss.innerHTML = (currentLevel !== -1) ? (currentLevel===4 ? '<span class="p-4">4凸</span>' : `<span>${currentLevel}凸</span>`) : '<span class="p-none">-</span>';

                    // 更新 Overlay
                    updateCardOverlay(card, dbData);
                }
            }
            
            // 隨時確保 Overlay 存在
            if (!card.querySelector('.g8-overlay') && dbData.fetched) {
                updateCardOverlay(card, dbData);
            }
        });

        if (dbChanged) updateTimeDisplay();
        processQueue();
    }

    // 改良版模擬點擊：精準控制凸數 (0~4)
    function simulateClick(card, targetVal) {
        // 取得目前狀態
        const notOwnedEl = card.querySelector('div[class*="notPossessedItem"]');
        const isOwnedVisual = !notOwnedEl;
        const currentLevel = isOwnedVisual ? card.querySelectorAll('div[class*="rhombusActive"]').length : -1;

        if (currentLevel === targetVal) return; // 已達成目標

        // 視覺回饋：標記正在處理
        card.classList.add('g8-syncing');
        setTimeout(() => card.classList.remove('g8-syncing'), 500);

        // 動作 1: 若目標是「未持有」
        if (targetVal === -1) {
            if (isOwnedVisual) {
                // 通常點擊主圖片會切換持有狀態
                const imgBtn = card.querySelector('img');
                if (imgBtn) imgBtn.click();
            }
            return;
        }

        // 動作 2: 若目前是「未持有」，但目標是「持有」(0~4)
        if (!isOwnedVisual) {
            // 點擊遮罩變成持有 (通常變 0凸)
            if (notOwnedEl) notOwnedEl.click();
            // 點完後需要等 React 渲染，這次 function 先結束，交給下一次 Loop 繼續處理凸數
            return;
        }

        // 動作 3: 調整凸數 (目前持有，目標也持有，但凸數不對)
        // Game8 結構：通常有一組 div 代表菱形
        // 觀察 DOM 結構，菱形通常在 class 包含 object 的 div 內
        const diamondContainer = card.querySelector('div[class*="object"]');
        if (diamondContainer && diamondContainer.children.length === 4) {
            const diamonds = diamondContainer.children;
            
            if (targetVal === 0) {
                // 目標 0凸。
                // 如果目前 > 0，需要切回 0。
                // Game8 介面有時點擊當前凸數會取消？或者只能透過切換未持有重置？
                // 策略：如果無法直接設為 0，先切成未持有，下一次 Loop 會把它切回持有(預設0)
                if (currentLevel > 0) {
                      const imgBtn = card.querySelector('img');
                      if (imgBtn) imgBtn.click(); 
                }
            } else if (targetVal >= 1 && targetVal <= 4) {
                // 目標 1~4凸，直接點擊對應的第 N 顆菱形 (index = targetVal - 1)
                // 這是最準確的方法，不用依賴 "點幾下"
                const targetDiamond = diamonds[targetVal - 1];
                if (targetDiamond) {
                    targetDiamond.click();
                }
            }
        } else {
            // 如果找不到菱形結構 (Fallback)，使用舊式點擊圖片邏輯
            // 但這很不穩，僅作備案
             const imgBtn = card.querySelector('img');
             if(imgBtn) imgBtn.click();
        }
    }

    // 觸發全頁同步
    function applyDbToDom() {
        // 這裡不需要額外寫迴圈，只要把 data-g8-synced 拿掉
        // scanVisibleCards 下一次執行時就會自動執行 simulateClick
        document.querySelectorAll('div[data-g8-synced]').forEach(el => el.removeAttribute('data-g8-synced'));
        // 呼叫一次掃描
        scanVisibleCards();
    }

    // 佇列處理器 (處理 HTTP 請求)
    function processQueue() {
        if (FETCH_QUEUE.length === 0) {
            if (ACTIVE_REQUESTS === 0) saveDB();
            monQueue.innerText = 0;
            monActive.innerText = 0;
            return;
        }

        monQueue.innerText = FETCH_QUEUE.length;
        monActive.innerText = ACTIVE_REQUESTS;

        while (ACTIVE_REQUESTS < MAX_CONCURRENT && FETCH_QUEUE.length > 0) {
            const task = FETCH_QUEUE.shift();
            QUEUE_SET.delete(task.key);

            if (task.data.fetched) {
                if (task.cardEl) updateCardOverlay(task.cardEl, task.data);
                continue;
            }

            ACTIVE_REQUESTS++;
            GM_xmlhttpRequest({
                method: "GET", url: task.data.url, timeout: 10000,
                onload: (res) => {
                    let rating = '??';
                    if (res.status === 200) {
                        const doc = new DOMParser().parseFromString(res.responseText, "text/html");
                        const imgs = doc.querySelectorAll('img');
                        for (let img of imgs) {
                            const alt = img.getAttribute('alt') || '';
                            if (alt.startsWith('評価') && alt.includes('画像')) {
                                rating = alt.replace('評価', '').replace('画像', '').trim();
                                break;
                            }
                        }
                        if (rating === '??') {
                            const tds = doc.querySelectorAll('td');
                            for (let td of tds) {
                                if (td.innerText.replace(/\s/g, '').includes('圏外')) { rating = '圏外'; break; }
                            }
                        }
                    }
                    task.data.rating = rating;
                    task.data.fetched = true;

                    const tr = document.getElementById(`g8-tr-${task.key}`);
                    if(tr) {
                        tr.children[5].innerText = rating;
                        tr.children[6].innerHTML = '<span class="st-ok" style="color:#81C784">OK</span>';
                    }
                    if (task.cardEl) updateCardOverlay(task.cardEl, task.data);
                },
                onloadend: () => {
                    ACTIVE_REQUESTS--;
                    processQueue();
                }
            });
        }
    }
})();