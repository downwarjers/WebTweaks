// ==UserScript==
// @name         Google Maps Share to Notion
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.7
// @description  在 Google Maps 分享視窗嵌入 Notion 面板，自動擷取店名/地址/行政區/URL，支援重複檢查、分類選擇與備註填寫。
// @author       downwarjers
// @license      MIT
// @match        https://www.google.com/maps/*
// @match        https://www.google.com.tw/maps/*
// @connect      api.notion.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/google-maps-restaurant-to-notion/google-maps-restaurant-to-notion.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/google-maps-restaurant-to-notion/google-maps-restaurant-to-notion.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. 設定區 ---
    const CONFIG = {
        CATEGORIES: ["烘焙甜品咖啡廳", "飲料冰品", "餐廳", "早餐", "小吃", "市場"],
        DEFAULT_CATEGORY: "",
        ICON: "🍴"
    };

    // --- 2. 註冊設定選單 (讓你可以隨時修改 Token) ---
    GM_registerMenuCommand("⚙️ 設定 Notion API Key", askForSecrets);

    function askForSecrets() {
        const currentToken = GM_getValue("NOTION_TOKEN", "");
        const currentDbId = GM_getValue("NOTION_DB_ID", "");

        const newToken = prompt("請輸入 Notion Token (secret_...):", currentToken);
        if (newToken === null) return; // 按取消

        const newDbId = prompt("請輸入 Notion Database ID:", currentDbId);
        if (newDbId === null) return; // 按取消

        GM_setValue("NOTION_TOKEN", newToken.trim());
        GM_setValue("NOTION_DB_ID", newDbId.trim());
        
        alert("✅ 設定已儲存！請重新整理頁面以套用。");
        location.reload();
    }

    // --- 3. 檢查 Key 是否存在 ---
    function getSecrets() {
        return {
            TOKEN: GM_getValue("NOTION_TOKEN", ""),
            DB_ID: GM_getValue("NOTION_DB_ID", "")
        };
    }

    // --- 4. CSS ---
    GM_addStyle(`
        .LenJEf { display: flex !important; justify-content: flex-end !important; gap: 5px !important; margin-top: 5px !important; opacity: 0.6; transition: opacity 0.2s; }
        .LenJEf:hover { opacity: 1; }
        .LenJEf button { flex-direction: row !important; padding: 4px 8px !important; height: auto !important; border: 1px solid #eee !important; border-radius: 15px !important; background: transparent !important; }
        .LenJEf .XDlzbe { display: none !important; }
        .LenJEf .fCbqBc { width: 20px !important; height: 20px !important; margin: 0 !important; }
        .LenJEf img, .LenJEf span.google-symbols { width: 20px !important; height: 20px !important; font-size: 20px !important; }
    `);

    // --- 5. 監聽 DOM ---
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                const shareModal = document.querySelector('div.hdeJwf[role="dialog"]');
                if (shareModal && !document.querySelector('#notion-custom-panel')) {
                    injectUI(shareModal);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // --- 6. UI ---
    function injectUI(modal) {
        const socialSection = modal.querySelector('.LenJEf');
        const container = socialSection?.parentNode;
        if (!container) return;

        const initialData = extractData(modal);
        const { TOKEN, DB_ID } = getSecrets();
        const isConfigured = TOKEN && DB_ID;

        const panel = document.createElement('div');
        panel.id = 'notion-custom-panel';
        panel.style.cssText = `margin-top: 0px; padding: 10px 0px; border-top: 1px solid #dadce0; display: flex; flex-direction: column; gap: 8px;`;

        // Row 1: Name
        const row1 = document.createElement('div');
        row1.style.display = 'flex'; row1.style.alignItems = 'center'; row1.style.gap = '10px';
        const nameLabel = document.createElement('label'); nameLabel.innerText = "名稱:"; nameLabel.style.fontSize = "13px"; nameLabel.style.fontWeight = "bold"; nameLabel.style.color = "#202124";
        const nameInput = document.createElement('input'); nameInput.type = "text"; nameInput.value = initialData.name; nameInput.style.cssText = `flex-grow: 1; padding: 6px 8px; border-radius: 4px; border: 1px solid #dadce0; font-size: 14px;`;
        row1.appendChild(nameLabel); row1.appendChild(nameInput);

        // Row 2: Category
        const row2 = document.createElement('div');
        row2.style.display = 'flex'; row2.style.alignItems = 'center'; row2.style.gap = '10px';
        const catLabel = document.createElement('label'); catLabel.innerText = "分類:"; catLabel.style.fontSize = "13px"; catLabel.style.fontWeight = "bold"; catLabel.style.color = "#202124";
        const select = document.createElement('select'); select.style.cssText = `flex-grow: 1; padding: 6px; border-radius: 4px; border: 1px solid #dadce0; background-color: white;`;
        const defaultOption = document.createElement('option'); defaultOption.text = "-- 請選擇 --"; defaultOption.value = "";
        if (CONFIG.DEFAULT_CATEGORY === "") defaultOption.selected = true;
        select.add(defaultOption);
        CONFIG.CATEGORIES.forEach(cat => {
            const option = document.createElement('option'); option.text = cat; option.value = cat;
            if (cat === CONFIG.DEFAULT_CATEGORY) option.selected = true;
            select.add(option);
        });
        row2.appendChild(catLabel); row2.appendChild(select);

        // Row 3: Note
        const row3 = document.createElement('div');
        row3.style.display = 'flex'; row3.style.alignItems = 'center'; row3.style.gap = '10px';
        const noteLabel = document.createElement('label'); noteLabel.innerText = "備註:"; noteLabel.style.fontSize = "13px"; noteLabel.style.fontWeight = "bold"; noteLabel.style.color = "#202124";
        const noteInput = document.createElement('input'); noteInput.type = "text"; noteInput.placeholder = "選填..."; noteInput.style.cssText = `flex-grow: 1; padding: 6px 8px; border-radius: 4px; border: 1px solid #dadce0; font-size: 14px;`;
        row3.appendChild(noteLabel); row3.appendChild(noteInput);

        // Status & Btn
        const statusMsg = document.createElement('div');
        statusMsg.style.fontSize = '12px'; statusMsg.style.color = '#70757a';
        const districtDisplay = initialData.district ? ` / ${initialData.district}` : '';
        statusMsg.innerText = `📍 ${initialData.city}${districtDisplay}`;

        const btn = document.createElement('button');
        
        // ⭐️ 檢查：如果沒有 Token，改變按鈕行為
        if (!isConfigured) {
            btn.innerText = '⚠️ 請點此設定 API Key';
            btn.style.cssText = `background-color: #fbbc04; color: black; padding: 8px 16px; border: none; border-radius: 18px; cursor: pointer; font-weight: bold; width: 100%; transition: 0.2s;`;
            btn.onclick = askForSecrets; // 點擊直接呼叫設定函式
        } else {
            btn.innerText = '新增至 Notion';
            btn.style.cssText = `background-color: #1a73e8; color: white; padding: 8px 16px; border: none; border-radius: 18px; cursor: pointer; font-weight: 500; width: 100%; transition: 0.2s;`;
            
            // 正常的按鈕邏輯
            btn.onclick = async () => {
                const category = select.value;
                const finalName = nameInput.value.trim();
                const noteContent = noteInput.value.trim();

                if (!category) { statusMsg.innerText = '⚠️ 請選擇分類'; statusMsg.style.color = '#d93025'; return; }
                if (!finalName) { statusMsg.innerText = '⚠️ 名稱不能為空'; statusMsg.style.color = '#d93025'; return; }

                const freshUrlInput = modal.querySelector('input.vrsrZe');
                const freshUrl = freshUrlInput ? freshUrlInput.value : window.location.href;

                btn.disabled = true; btn.innerText = '檢查中...'; btn.style.backgroundColor = '#8ab4f8';

                const finalData = {
                    name: finalName, address: initialData.address, url: freshUrl, city: initialData.city, district: initialData.district, category: category, note: noteContent
                };
                
                try {
                    const exists = await checkDuplicate(finalData.name, TOKEN, DB_ID);
                    if (exists) {
                        btn.innerText = '⚠️ 已存在'; btn.style.backgroundColor = '#fbbc04'; btn.style.color = '#202124';
                        statusMsg.innerText = `資料庫已有此店`; statusMsg.style.color = '#d93025';
                        btn.disabled = false;
                    } else {
                        btn.innerText = '寫入中...';
                        await sendToNotion(finalData, TOKEN, DB_ID);
                        btn.innerText = '✅ 完成'; btn.style.backgroundColor = '#188038';
                        statusMsg.innerText = '儲存成功'; statusMsg.style.color = '#188038';
                        setTimeout(() => {
                            const closeBtn = modal.parentNode.querySelector('button[aria-label="關閉"]');
                            if(closeBtn) closeBtn.click();
                        }, 1500);
                    }
                } catch (err) {
                    console.error(err);
                    btn.innerText = '❌ 失敗'; btn.style.backgroundColor = '#d93025'; btn.disabled = false;
                    alert("Notion API 錯誤：\n" + err.message);
                    statusMsg.innerText = "請檢查 API Key 或欄位設定";
                }
            };
        }

        panel.appendChild(row1); panel.appendChild(row2); panel.appendChild(row3); panel.appendChild(statusMsg); panel.appendChild(btn);
        container.insertBefore(panel, socialSection);
    }

    // --- 7. Data ---
    function extractData(modal) {
        const nameEl = modal.querySelector('.TDF87d'); const addressEl = modal.querySelector('.vKmG2c'); const urlInput = modal.querySelector('input.vrsrZe');
        let name = nameEl ? nameEl.innerText.trim() : "";
        const fullAddress = addressEl ? addressEl.innerText : "";
        const shortUrl = urlInput ? urlInput.value : window.location.href;
        let city = "未知"; let district = "";
        const cityMatch = fullAddress.match(/[\u4e00-\u9fa5]{2,3}[縣市]/);
        if (cityMatch) city = cityMatch[0];
        const districtMatch = fullAddress.match(/[縣市]([\u4e00-\u9fa5]+?[區鄉鎮市])(?![區鄉鎮市])/);
        if (districtMatch) district = districtMatch[1];
        return { name, address: fullAddress, url: shortUrl, city, district };
    }

    // --- 8. API (接收 Token 參數) ---
    function checkDuplicate(name, token, dbId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: `https://api.notion.com/v1/databases/${dbId}/query`,
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
                data: JSON.stringify({ "filter": { "property": "餐廳名稱", "title": { "equals": name } } }),
                onload: response => {
                    if (response.status === 200) resolve(JSON.parse(response.responseText).results.length > 0);
                    else reject(new Error(JSON.parse(response.responseText).message || "Query failed"));
                },
                onerror: err => reject(err)
            });
        });
    }

    function sendToNotion(data, token, dbId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://api.notion.com/v1/pages",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
                data: JSON.stringify({
                    "parent": { "database_id": dbId },
                    "icon": { "type": "emoji", "emoji": CONFIG.ICON },
                    "properties": {
                        "餐廳名稱": { "title": [{ "text": { "content": data.name } }] },
                        "Google商家": { "url": data.url },
                        "類型": { "select": { "name": data.category } },
                        "縣市": { "select": { "name": data.city } },
                        "行政區": { "select": { "name": data.district } },
                        "地址": { "rich_text": [{ "text": { "content": data.address } }] },
                        "備註": { "rich_text": [{ "text": { "content": data.note } }] }
                    }
                }),
                onload: response => {
                    if (response.status === 200) resolve(JSON.parse(response.responseText));
                    else {
                        try { const errData = JSON.parse(response.responseText); reject(new Error(errData.message)); }
                        catch(e) { reject(new Error("Create failed: " + response.status)); }
                    }
                },
                onerror: err => reject(err)
            });
        });
    }
})();