// ==UserScript==
// @name         電子發票平台 - 年度發票儀表板
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.2
// @description  自動查詢近 7 個月區間發票
// @author       downwarjers
// @license      MIT
// @match        https://*.einvoice.nat.gov.tw/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/einvoice-dashboard-export/einvoice-dashboard-export.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/einvoice-dashboard-export/einvoice-dashboard-export.user.js 
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // ⚙️ 全域設定
    // ==========================================
    const STORAGE_KEY = 'EINVOICE_V6_CONFIG';
    const API_KEYWORD_JWT = 'getSearchCarrierInvoiceListJWT';
    const API_KEYWORD_SEARCH = 'searchCarrierInvoice';

    // ==========================================
    // 🎨 UI 樣式
    // ==========================================
    const STYLES = `
        #dashboard-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; flex-direction: column; align-items: center; padding-top: 50px; font-family: "Microsoft JhengHei", sans-serif; overflow-y: auto; }
        #dashboard-container { width: 90%; max-width: 1200px; background: #fff; border-radius: 8px; box-shadow: 0 0 20px rgba(0,0,0,0.5); padding: 20px; min-height: 80vh; display: flex; flex-direction: column; }
        
        .dash-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
        .dash-title { font-size: 24px; font-weight: bold; color: #333; white-space: nowrap; }
        
        .dash-controls { display: flex; gap: 10px; flex-shrink: 0; align-items: center; } /* 確保容器內垂直置中 */
        
        /* 按鈕樣式：強制固定高度 */
        .btn-dash { 
            height: 38px;        /* 關鍵修正：強制高度，不管有沒有 Emoji 都一樣高 */
            padding: 0 16px;     /* 移除上下 padding，改用 Flex 置中 */
            border: none; border-radius: 4px; cursor: pointer; 
            font-size: 14px; transition: 0.2s; font-weight: bold;
            white-space: nowrap;
            flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            line-height: 1;      /* 重置行高，避免字體差異 */
        }
        
        .btn-close { background: #dc3545; color: white; }
        .btn-run { background: #007bff; color: white; }
        .btn-export { background: #28a745; color: white; }
        .btn-dash:disabled { opacity: 0.5; cursor: not-allowed; }
        
        #progress-area { margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 4px; }
        .progress-bar { height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; margin-top: 5px; }
        .progress-fill { height: 100%; background: #0d6efd; width: 0%; transition: width 0.3s; }
        .log-text { font-family: monospace; font-size: 12px; color: #666; margin-top: 5px; height: 120px; overflow-y: auto; border: 1px solid #ddd; padding: 5px; white-space: pre-wrap; }
        #data-table-wrapper { flex: 1; overflow: auto; border: 1px solid #ddd; }
        table.custom-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        table.custom-table th, table.custom-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        table.custom-table th { background: #f2f2f2; position: sticky; top: 0; }
        .row-month { font-weight: bold; color: #0056b3; }
        .amount-col { text-align: right; font-family: monospace; }
        
        #floating-trigger { position: fixed; bottom: 20px; right: 20px; z-index: 9999; padding: 15px 20px; border-radius: 50px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); cursor: pointer; font-weight: bold; font-size: 16px; border: 2px solid white; transition: all 0.3s; color: white; }
        #floating-trigger.status-ready { background: #28a745; transform: scale(1.05); }
        #floating-trigger.status-wait { background: #dc3545; opacity: 0.8; }
        #floating-trigger:hover { transform: scale(1.1); }
    `;
    const styleEl = document.createElement('style');
    styleEl.innerHTML = STYLES;
    document.head.appendChild(styleEl);

    // ==========================================
    // 🕵️‍♂️ 核心邏輯：設定儲存
    // ==========================================
    function saveConfig(headers, payload, url) {
        try {
            const { searchStartDate, searchEndDate, ...baseParams } = payload;
            const urlSearch = url.replace(API_KEYWORD_JWT, API_KEYWORD_SEARCH) + "?page=0&size=1000";
            const config = {
                headers: headers,
                params: baseParams,
                urlJwt: url,
                urlSearch: urlSearch,
                timestamp: new Date().getTime()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
            console.log('✅ [Dashboard] 設定已儲存', config);
            updateButtonStatus(true);
        } catch (e) {
            console.error('[Dashboard] 設定儲存失敗', e);
        }
    }

    // ==========================================
    // 🕵️‍♂️ 雙模攔截器
    // ==========================================
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        this._capturedHeaders = {};
        return originalXHROpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (this._capturedHeaders) this._capturedHeaders[header.toLowerCase()] = value;
        return originalXHRSetHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
        if (this._url && this._url.includes(API_KEYWORD_JWT)) {
            try { saveConfig(this._capturedHeaders, JSON.parse(body), this._url); } catch (e) {}
        }
        return originalXHRSend.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = async function(url, options) {
        const urlStr = url.toString();
        if (urlStr.includes(API_KEYWORD_JWT) && options && options.method === 'POST') {
            try {
                let headers = {};
                if (options.headers instanceof Headers) options.headers.forEach((v, k) => headers[k] = v);
                else headers = { ...options.headers };
                saveConfig(headers, JSON.parse(options.body), urlStr);
            } catch (e) {}
        }
        return originalFetch(url, options);
    };

    // ==========================================
    // 🧠 智慧日期計算
    // ==========================================
    function getSmartDateRanges() {
        const ranges = [];
        const now = new Date();
        for (let i = 7; i >= 0; i--) {
            const year = now.getFullYear();
            const month = now.getMonth();
            const targetFirstDay = new Date(year, month - i, 1, 0, 0, 0);
            
            const y = targetFirstDay.getFullYear();
            const m = targetFirstDay.getMonth();
            let targetLastDay;
            
            if (i === 0) targetLastDay = now;
            else targetLastDay = new Date(y, m + 1, 0, 23, 59, 59);

            ranges.push({
                y: y,
                m: m + 1,
                start: targetFirstDay.toISOString(),
                end: targetLastDay.toISOString()
            });
        }
        return ranges;
    }

    // ==========================================
    // 🚀 UI 介面
    // ==========================================
    function createFloatingButton() {
        if (document.getElementById('floating-trigger')) return;
        const btn = document.createElement('button');
        btn.id = 'floating-trigger';
        btn.innerHTML = '⚡ 發票小幫手 (未激活)';
        btn.className = 'status-wait';
        btn.onclick = () => {
            if (btn.classList.contains('status-wait')) {
                alert('⚠️ 尚未取得查詢權限！\n\n請先在網頁左側隨便選一個日期，按下原本的「查詢」按鈕。\n等待按鈕變綠色後再點擊。');
            } else {
                openDashboard();
            }
        };
        document.body.appendChild(btn);
    }

    function updateButtonStatus(ready) {
        if (!document.getElementById('floating-trigger')) createFloatingButton();
        if (ready || localStorage.getItem(STORAGE_KEY)) {
            const el = document.getElementById('floating-trigger');
            if (el) {
                el.innerHTML = '🚀 開啟近半年發票儀表板';
                el.className = 'status-ready';
                el.title = "點擊開始";
            }
        }
    }

    function openDashboard() {
        if (document.getElementById('dashboard-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'dashboard-overlay';
        overlay.innerHTML = `
            <div id="dashboard-container">
                <div class="dash-header">
                    <div class="dash-title">📊 發票資料整合</div>
                    <div class="dash-controls">
                        <button class="btn-dash btn-run" id="btn-run-scan">▶ 開始掃描 (近7個月)</button>
                        <button class="btn-dash btn-export" id="btn-export-csv" disabled>📥 匯出 CSV</button>
                        <button class="btn-dash btn-close" id="btn-close-dash">❌</button>
                    </div>
                </div>
                <div id="progress-area">
                    <div>掃描進度: <span id="status-text">待命中...</span></div>
                    <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
                    <div class="log-text" id="log-box">準備就緒。\n按上方按鈕開始抓取「本月至半年前」的資料。\n系統會自動將本月的結束時間設為今天，避免錯誤。</div>
                </div>
                <div id="data-table-wrapper">
                    <table class="custom-table">
                        <thead>
                            <tr><th>月份</th><th>發票號碼</th><th>日期</th><th>商店名稱</th><th>載具</th><th>金額</th></tr>
                        </thead>
                        <tbody id="table-body">
                            <tr><td colspan="6" style="text-align:center; color:#999;">尚未載入資料</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('btn-close-dash').onclick = () => overlay.remove();
        document.getElementById('btn-run-scan').onclick = startScanning;
        document.getElementById('btn-export-csv').onclick = () => exportToCSV(window._fetchedData);
    }

    // ==========================================
    // 🧠 掃描執行邏輯
    // ==========================================
    async function startScanning() {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (!cached) return alert('❌ 設定遺失，請重新查詢激活。');
        
        const config = JSON.parse(cached);
        const ranges = getSmartDateRanges();

        const btnRun = document.getElementById('btn-run-scan');
        const btnExp = document.getElementById('btn-export-csv');
        const logBox = document.getElementById('log-box');
        const statusText = document.getElementById('status-text');
        const progressFill = document.getElementById('progress-fill');
        const tbody = document.getElementById('table-body');
        
        btnRun.disabled = true;
        btnExp.disabled = true;
        tbody.innerHTML = '';
        logBox.innerText = '';
        window._fetchedData = [];
        let totalCount = 0;

        const log = (msg) => {
            logBox.innerText += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
            logBox.scrollTop = logBox.scrollHeight;
        };

        log(`範圍計算完畢: ${ranges[0].y}/${ranges[0].m} ~ ${ranges[ranges.length-1].y}/${ranges[ranges.length-1].m}`);

        for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            const progress = Math.round(((i + 1) / ranges.length) * 100);
            progressFill.style.width = `${progress}%`;
            statusText.innerText = `正在查詢: ${range.y}年 ${range.m}月...`;

            try {
                const jwtPayload = { ...config.params, searchStartDate: range.start, searchEndDate: range.end };
                
                const tokenRes = await fetch(config.urlJwt, {
                    method: 'POST',
                    headers: config.headers,
                    body: JSON.stringify(jwtPayload)
                });
                const tokenText = await tokenRes.text();
                
                if (tokenText.trim().startsWith('<') || tokenText.length < 50) throw new Error("Session 可能已過期");

                const searchRes = await fetch(config.urlSearch, {
                    method: 'POST',
                    headers: config.headers,
                    body: JSON.stringify({ token: tokenText })
                });

                const data = await searchRes.json();
                const list = data.content || [];
                log(`✅ ${range.y}/${range.m}: 取得 ${list.length} 筆`);

                list.forEach(item => {
                    const dateObj = new Date(item.invoiceDate);
                    const localDateStr = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
                    
                    const cleanItem = {
                        "發票年": range.y,
                        "發票月": range.m,
                        "發票日期": localDateStr,
                        "發票號碼": item.invoiceNumber,
                        "商店名稱": item.sellerName,
                        "載具名稱": item.carrierName,
                        "總金額": item.totalAmount,
                        "狀態碼": item.extStatus,
                        "捐贈註記": item.donateMark === "1" ? "是" : "否"
                    };
                    
                    window._fetchedData.push(cleanItem);
                    totalCount++;
                    
                    if (totalCount <= 500) {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td class="row-month">${range.m}月</td><td>${cleanItem.發票號碼}</td><td>${cleanItem.發票日期}</td><td>${cleanItem.商店名稱}</td><td>${cleanItem.載具名稱}</td><td class="amount-col">${cleanItem.總金額}</td>`;
                        tbody.appendChild(tr);
                    }
                });
            } catch (e) {
                log(`❌ ${range.m}月 失敗: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
        }

        progressFill.style.width = '100%';
        statusText.innerText = `完成！共 ${totalCount} 筆。`;
        btnRun.disabled = false;
        btnExp.disabled = false;
        btnExp.innerText = `📥 匯出 CSV (${totalCount}筆)`;
    }

    function exportToCSV(data) {
        if (!data || data.length === 0) return alert('無資料');
        const headers = Object.keys(data[0]);
        const csvContent = ['\uFEFF' + headers.join(','), ...data.map(row => headers.map(key => `"${String(row[key]||'').replace(/"/g, '""')}"`).join(','))].join('\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
        link.download = `電子發票_近半年_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
    }

    setTimeout(() => {
        createFloatingButton();
        if (localStorage.getItem(STORAGE_KEY)) updateButtonStatus(true);
    }, 1000);

})();