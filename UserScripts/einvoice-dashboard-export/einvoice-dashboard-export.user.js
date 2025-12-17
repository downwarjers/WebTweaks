// ==UserScript==
// @name         電子發票平台 - 年度發票儀表板
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      3.0
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
        #dashboard-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; flex-direction: column; align-items: center; padding-top: 30px; font-family: "Microsoft JhengHei", sans-serif; }
        #dashboard-container { width: 95%; max-width: 1200px; background: #fff; border-radius: 8px; box-shadow: 0 0 20px rgba(0,0,0,0.5); padding: 15px; height: 90vh; display: flex; flex-direction: column; }
        
        .dash-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 10px; flex-shrink: 0; }
        .dash-title { font-size: 20px; font-weight: bold; color: #333; }
        
        .dash-controls { display: flex; gap: 8px; align-items: center; }
        .btn-dash { height: 34px; padding: 0 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold; color: white; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
        .btn-close { background: #dc3545; } .btn-close:hover { background: #c82333; }
        .btn-run { background: #007bff; } .btn-run:hover { background: #0069d9; }
        .btn-export { background: #28a745; } .btn-export:hover { background: #218838; }
        .btn-dash:disabled { opacity: 0.5; cursor: not-allowed; background: #6c757d; }
        
        /* 壓縮進度區塊高度 */
        #progress-area { margin-bottom: 10px; background: #f8f9fa; padding: 10px; border-radius: 4px; flex-shrink: 0; display: flex; flex-direction: column; gap: 5px; }
        .progress-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
        .progress-bar { height: 10px; background: #e9ecef; border-radius: 5px; overflow: hidden; width: 100%; margin-top: 2px; }
        .progress-fill { height: 100%; background: #0d6efd; width: 0%; transition: width 0.3s; }
        
        /* Log 區域縮小 */
        .log-text { font-family: monospace; font-size: 12px; color: #666; height: 50px; overflow-y: auto; border: 1px solid #ddd; padding: 4px; background: #fff; white-space: pre-wrap; resize: none; }
        
        /* 表格區塊 */
        #data-table-wrapper { flex: 1; overflow: auto; border: 1px solid #ddd; position: relative; }
        table.custom-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        table.custom-table th, table.custom-table td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        table.custom-table th { background: #f2f2f2; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 2px rgba(0,0,0,0.05); }
        .row-month { font-weight: bold; color: #0056b3; white-space: nowrap; }
        .amount-col { text-align: right; font-family: monospace; font-weight: bold; }
        
        /* 浮動按鈕 */
        #floating-trigger { position: fixed; bottom: 20px; right: 20px; z-index: 9999; padding: 12px 18px; border-radius: 50px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); cursor: pointer; font-weight: bold; font-size: 15px; border: 2px solid white; transition: all 0.3s; color: white; }
        #floating-trigger.status-ready { background: #28a745; }
        #floating-trigger.status-wait { background: #dc3545; opacity: 0.9; }
        #floating-trigger:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
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
            const urlSearch = url.replace(API_KEYWORD_JWT, API_KEYWORD_SEARCH) + "?page=0&size=1000"; // 強制單頁最大筆數
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
    // 🧠 智慧日期計算 (修正順序：由新到舊)
    // ==========================================
    function getSmartDateRanges() {
        const ranges = [];
        const now = new Date();
        // i 從 0 開始 (本月) 到 7 (七個月前)
        for (let i = 0; i <= 7; i++) {
            const year = now.getFullYear();
            const month = now.getMonth();
            // 計算目標月份的第一天
            const targetFirstDay = new Date(year, month - i, 1, 0, 0, 0);
            
            const y = targetFirstDay.getFullYear();
            const m = targetFirstDay.getMonth(); // 0-11
            let targetLastDay;
            
            // 如果是本月 (i=0)，結束時間設為當下，避免未來時間錯誤
            if (i === 0) targetLastDay = now;
            else targetLastDay = new Date(y, m + 1, 0, 23, 59, 59);

            ranges.push({
                y: y,
                m: m + 1, // 顯示用月份 1-12
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
        const configStr = localStorage.getItem(STORAGE_KEY);
        // 簡單判斷：如果有設定，且設定時間距離現在不超過 30 分鐘，才算有效
        // 這裡先寬鬆一點，只要有 Key 就算 Ready，實際過期在執行時判斷
        if (ready || configStr) {
            const el = document.getElementById('floating-trigger');
            if (el) {
                el.innerHTML = '🚀 開啟儀表板';
                el.className = 'status-ready';
                el.title = "點擊開始";
            }
        } else {
            const el = document.getElementById('floating-trigger');
            if (el) {
                el.innerHTML = '⚡ 發票小幫手 (過期)';
                el.className = 'status-wait';
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
                    <div class="dash-title">📊 發票資料整合 (New -> Old)</div>
                    <div class="dash-controls">
                        <button class="btn-dash btn-run" id="btn-run-scan">▶ 開始掃描</button>
                        <button class="btn-dash btn-export" id="btn-export-csv" disabled>📥 匯出 CSV</button>
                        <button class="btn-dash btn-close" id="btn-close-dash">❌</button>
                    </div>
                </div>
                <div id="progress-area">
                    <div class="progress-row">
                        <span id="status-text">待命中...</span>
                        <span id="count-text">0 筆</span>
                    </div>
                    <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
                    <textarea class="log-text" id="log-box" readonly>準備就緒。請按上方按鈕開始。</textarea>
                </div>
                <div id="data-table-wrapper">
                    <table class="custom-table">
                        <thead>
                            <tr><th style="width:60px">月份</th><th style="width:110px">發票號碼</th><th style="width:100px">日期</th><th>商店名稱</th><th>載具</th><th style="width:80px">金額</th></tr>
                        </thead>
                        <tbody id="table-body">
                            <tr><td colspan="6" style="text-align:center; color:#999; padding: 20px;">請點擊「開始掃描」載入資料</td></tr>
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
    // 🧠 掃描執行邏輯 (修正：排序與錯誤中斷)
    // ==========================================
    async function startScanning() {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (!cached) return alert('❌ 設定遺失，請重新查詢激活。');
        
        const config = JSON.parse(cached);
        const ranges = getSmartDateRanges(); // 這裡已經是由新到舊 [本月, 上月, ...]

        const btnRun = document.getElementById('btn-run-scan');
        const btnExp = document.getElementById('btn-export-csv');
        const logBox = document.getElementById('log-box');
        const statusText = document.getElementById('status-text');
        const countText = document.getElementById('count-text');
        const progressFill = document.getElementById('progress-fill');
        const tbody = document.getElementById('table-body');
        
        btnRun.disabled = true;
        btnExp.disabled = true;
        tbody.innerHTML = '';
        logBox.value = ''; // textarea 用 value
        window._fetchedData = [];
        let totalCount = 0;
        let isErrorStop = false;

        const log = (msg) => {
            logBox.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
            logBox.scrollTop = logBox.scrollHeight;
        };

        log(`範圍: ${ranges[0].y}/${ranges[0].m} (最新) ~ ${ranges[ranges.length-1].y}/${ranges[ranges.length-1].m} (最舊)`);

        for (let i = 0; i < ranges.length; i++) {
            if (isErrorStop) break;

            const range = ranges[i];
            const progress = Math.round(((i) / ranges.length) * 100);
            progressFill.style.width = `${progress}%`;
            statusText.innerText = `查詢中: ${range.y}/${range.m}`;

            try {
                const jwtPayload = { ...config.params, searchStartDate: range.start, searchEndDate: range.end };
                
                // 1. 取得 JWT Token
                const tokenRes = await fetch(config.urlJwt, {
                    method: 'POST',
                    headers: config.headers,
                    body: JSON.stringify(jwtPayload)
                });

                if (!tokenRes.ok) throw new Error(`HTTP ${tokenRes.status}`);
                const tokenText = await tokenRes.text();
                
                // 🛑 過期偵測點 1: 回傳內容不正確 (可能是 HTML 錯誤頁面) 或過短
                if (tokenText.trim().startsWith('<') || tokenText.length < 20) {
                    throw new Error("Session Expired");
                }

                // 2. 使用 Token 查詢發票
                const searchRes = await fetch(config.urlSearch, {
                    method: 'POST',
                    headers: config.headers,
                    body: JSON.stringify({ token: tokenText })
                });

                if (!searchRes.ok) throw new Error(`Search HTTP ${searchRes.status}`);
                const data = await searchRes.json();
                
                // 🛑 過期偵測點 2: 有時候 JSON 會回傳 code != 200 代表失敗
                if (data.code && data.code !== 200) {
                     throw new Error(`API Error: ${data.msg || 'Unknown'}`);
                }

                let list = data.content || [];
                log(`✅ ${range.y}/${range.m}: ${list.length} 筆`);

                // 🔄 內部排序：確保該月份內的資料也是由新到舊
                list.sort((a, b) => {
                    // 發票日期降冪 (新 -> 舊)
                    if (a.invoiceDate !== b.invoiceDate) return b.invoiceDate.localeCompare(a.invoiceDate);
                    // 同日期則比較發票號碼
                    return b.invoiceNumber.localeCompare(a.invoiceNumber);
                });

                // 使用 DocumentFragment 批次寫入，避免 Reflow
                const fragment = document.createDocumentFragment();

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
                        "捐贈": item.donateMark === "1" ? "是" : "否"
                    };
                    
                    window._fetchedData.push(cleanItem);
                    totalCount++;

                    // 渲染 Row (無數量限制)
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="row-month">${range.m}月</td>
                        <td>${cleanItem.發票號碼}</td>
                        <td>${cleanItem.發票日期}</td>
                        <td>${cleanItem.商店名稱}</td>
                        <td style="font-size:12px;color:#666;">${cleanItem.載具名稱}</td>
                        <td class="amount-col">${cleanItem.總金額}</td>
                    `;
                    fragment.appendChild(tr);
                });

                tbody.appendChild(fragment);
                countText.innerText = `${totalCount} 筆`;

            } catch (e) {
                console.error(e);
                log(`❌ ${range.m}月 失敗: ${e.message}`);
                
                // 🛑 觸發過期機制
                if (e.message.includes('Session') || e.message.includes('HTTP 401') || e.message.includes('HTTP 403') || e.message.includes('<html')) {
                    isErrorStop = true;
                    alert('⚠️ 連線逾時或金鑰已過期！\n\n系統將清除舊設定，請重新整理網頁並執行一次原版查詢。');
                    localStorage.removeItem(STORAGE_KEY);
                    updateButtonStatus(false);
                    statusText.innerText = "已中斷 (金鑰過期)";
                    statusText.style.color = "red";
                }
            }

            // 隨機延遲，避免過快被擋
            if (!isErrorStop) await new Promise(r => setTimeout(r, 1000 + Math.random() * 800));
        }

        progressFill.style.width = '100%';
        if (!isErrorStop) {
            statusText.innerText = `完成！`;
            btnRun.innerText = "重新掃描";
        } else {
            btnRun.innerText = "掃描中斷";
        }
        
        btnRun.disabled = false;
        btnExp.disabled = false;
        btnExp.innerText = `📥 匯出 CSV (${totalCount}筆)`;
    }

    function exportToCSV(data) {
        if (!data || data.length === 0) return alert('無資料可匯出');
        const headers = Object.keys(data[0]);
        const csvContent = ['\uFEFF' + headers.join(','), ...data.map(row => headers.map(key => `"${String(row[key]||'').replace(/"/g, '""')}"`).join(','))].join('\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
        link.download = `電子發票_近7個月_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
    }

    // 初始化檢查
    setTimeout(() => {
        createFloatingButton();
        if (localStorage.getItem(STORAGE_KEY)) updateButtonStatus(true);
    }, 1000);

})();