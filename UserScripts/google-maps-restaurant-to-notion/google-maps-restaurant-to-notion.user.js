// ==UserScript==
// @name         Google Maps Share to Notion
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      3.2.2
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
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/google-maps-restaurant-to-notion/google-maps-restaurant-to-notion.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/google-maps-restaurant-to-notion/google-maps-restaurant-to-notion.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==========================================
  //      1. 全域配置區
  // ==========================================
  const CONFIG = {
    PREFS: {
      // 分類選項
      CATEGORIES: ['烘焙甜品咖啡廳', '飲料冰品', '餐廳', '早餐', '小吃', '市場'],
      // 預設分類
      DEFAULT_CATEGORY: '',
      // Notion 頁面圖示 (Emoji)
      PAGE_ICON: '🍴',
    },

    // --- 1.2 Notion 資料庫欄位對映 ---
    NOTION_PROPS: {
      NAME: '餐廳名稱', // Title 欄位
      URL: 'Google商家', // URL 欄位
      CATEGORY: '類型', // Select 欄位
      CITY: '縣市', // Select 欄位
      DISTRICT: '行政區', // Select 欄位
      ADDRESS: '地址', // Text / Rich Text 欄位
      NOTE: '備註', // Text / Rich Text 欄位
    },

    // --- 1.3 儲存 Token 的 Key 名稱 ---
    STORAGE_KEYS: {
      TOKEN: 'NOTION_TOKEN',
      DB_ID: 'NOTION_DB_ID',
    },

    // --- 1.4 地理資料庫 (白名單) ---
    DATA: {
      // 台灣 22 縣市列表
      CITIES: [
        '基隆市',
        '台北市',
        '新北市',
        '桃園市',
        '新竹市',
        '新竹縣',
        '苗栗縣',
        '台中市',
        '彰化縣',
        '南投縣',
        '雲林縣',
        '嘉義市',
        '嘉義縣',
        '台南市',
        '高雄市',
        '屏東縣',
        '宜蘭縣',
        '花蓮縣',
        '台東縣',
        '澎湖縣',
        '金門縣',
        '連江縣',
      ],
      // 台灣 368 鄉鎮市區列表
      DISTRICTS: [
        // 基隆/台北/新北
        '仁愛區',
        '信義區',
        '中正區',
        '中山區',
        '安樂區',
        '暖暖區',
        '七堵區',
        '大同區',
        '松山區',
        '大安區',
        '萬華區',
        '士林區',
        '北投區',
        '內湖區',
        '南港區',
        '文山區',
        '萬里區',
        '金山區',
        '板橋區',
        '汐止區',
        '深坑區',
        '石碇區',
        '瑞芳區',
        '平溪區',
        '雙溪區',
        '貢寮區',
        '新店區',
        '坪林區',
        '烏來區',
        '永和區',
        '中和區',
        '土城區',
        '三峽區',
        '樹林區',
        '鶯歌區',
        '三重區',
        '新莊區',
        '泰山區',
        '林口區',
        '蘆洲區',
        '五股區',
        '八里區',
        '淡水區',
        '三芝區',
        '石門區',
        // 桃園/新竹
        '中壢區',
        '平鎮區',
        '龍潭區',
        '楊梅區',
        '新屋區',
        '觀音區',
        '桃園區',
        '龜山區',
        '八德區',
        '大溪區',
        '復興區',
        '大園區',
        '蘆竹區',
        '東區',
        '北區',
        '香山區',
        '竹北市',
        '湖口鄉',
        '新豐鄉',
        '新埔鎮',
        '關西鎮',
        '芎林鄉',
        '寶山鄉',
        '竹東鎮',
        '五峰鄉',
        '橫山鄉',
        '尖石鄉',
        '北埔鄉',
        '峨眉鄉',
        // 苗栗/台中
        '竹南鎮',
        '頭份市',
        '三灣鄉',
        '南庄鄉',
        '獅潭鄉',
        '後龍鎮',
        '通霄鎮',
        '苑裡鎮',
        '苗栗市',
        '造橋鄉',
        '頭屋鄉',
        '公館鄉',
        '大湖鄉',
        '泰安鄉',
        '銅鑼鄉',
        '三義鄉',
        '西湖鄉',
        '卓蘭鎮',
        '中區',
        '南區',
        '西區',
        '北區',
        '北屯區',
        '西屯區',
        '南屯區',
        '太平區',
        '大里區',
        '霧峰區',
        '烏日區',
        '豐原區',
        '后里區',
        '石岡區',
        '東勢區',
        '和平區',
        '新社區',
        '潭子區',
        '大雅區',
        '神岡區',
        '大肚區',
        '沙鹿區',
        '龍井區',
        '梧棲區',
        '清水區',
        '大甲區',
        '外埔區',
        '大安區',
        // 彰化/南投/雲林
        '彰化市',
        '芬園鄉',
        '花壇鄉',
        '秀水鄉',
        '鹿港鎮',
        '福興鄉',
        '線西鄉',
        '和美鎮',
        '伸港鄉',
        '員林市',
        '社頭鄉',
        '永靖鄉',
        '埔心鄉',
        '溪湖鎮',
        '大村鄉',
        '埔鹽鄉',
        '田中鎮',
        '北斗鎮',
        '田尾鄉',
        '埤頭鄉',
        '溪州鄉',
        '竹塘鄉',
        '二林鎮',
        '大城鄉',
        '芳苑鄉',
        '二水鄉',
        '南投市',
        '中寮鄉',
        '草屯鎮',
        '國姓鄉',
        '埔里鎮',
        '仁愛鄉',
        '名間鄉',
        '集集鎮',
        '水里鄉',
        '魚池鄉',
        '信義鄉',
        '竹山鎮',
        '鹿谷鄉',
        '斗南鎮',
        '大埤鄉',
        '虎尾鎮',
        '土庫鎮',
        '褒忠鄉',
        '東勢鄉',
        '臺西鄉',
        '崙背鄉',
        '麥寮鄉',
        '斗六市',
        '林內鄉',
        '古坑鄉',
        '莿桐鄉',
        '西螺鎮',
        '二崙鄉',
        '北港鎮',
        '水林鄉',
        '口湖鄉',
        '四湖鄉',
        '元長鄉',
        // 嘉義/台南
        '番路鄉',
        '梅山鄉',
        '竹崎鄉',
        '阿里山鄉',
        '中埔鄉',
        '大埔鄉',
        '水上鄉',
        '鹿草鄉',
        '太保市',
        '朴子市',
        '東石鄉',
        '六腳鄉',
        '新港鄉',
        '民雄鄉',
        '大林鎮',
        '溪口鄉',
        '義竹鄉',
        '布袋鎮',
        '中西區',
        '安平區',
        '安南區',
        '永康區',
        '歸仁區',
        '新化區',
        '左鎮區',
        '玉井區',
        '楠西區',
        '南化區',
        '仁德區',
        '關廟區',
        '龍崎區',
        '官田區',
        '麻豆區',
        '佳里區',
        '西港區',
        '七股區',
        '將軍區',
        '學甲區',
        '北門區',
        '新營區',
        '後壁區',
        '白河區',
        '東山區',
        '六甲區',
        '下營區',
        '柳營區',
        '鹽水區',
        '善化區',
        '大內區',
        '山上區',
        '新市區',
        '安定區',
        // 高雄
        '新興區',
        '前金區',
        '苓雅區',
        '鹽埕區',
        '鼓山區',
        '旗津區',
        '前鎮區',
        '三民區',
        '楠梓區',
        '小港區',
        '左營區',
        '仁武區',
        '大社區',
        '東沙群島',
        '南沙群島',
        '岡山區',
        '路竹區',
        '阿蓮區',
        '田寮區',
        '燕巢區',
        '橋頭區',
        '梓官區',
        '彌陀區',
        '永安區',
        '湖內區',
        '鳳山區',
        '大寮區',
        '林園區',
        '鳥松區',
        '大樹區',
        '旗山區',
        '美濃區',
        '六龜區',
        '內門區',
        '杉林區',
        '甲仙區',
        '桃源區',
        '那瑪夏區',
        '茂林區',
        '茄萣區',
        // 屏東/宜蘭
        '屏東市',
        '三地門鄉',
        '霧臺鄉',
        '瑪家鄉',
        '九如鄉',
        '里港鄉',
        '高樹鄉',
        '鹽埔鄉',
        '長治鄉',
        '麟洛鄉',
        '竹田鄉',
        '內埔鄉',
        '萬丹鄉',
        '潮州鎮',
        '泰武鄉',
        '來義鄉',
        '萬巒鄉',
        '崁頂鄉',
        '新埤鄉',
        '南州鄉',
        '林邊鄉',
        '東港鎮',
        '琉球鄉',
        '佳冬鄉',
        '新園鄉',
        '枋寮鄉',
        '枋山鄉',
        '春日鄉',
        '獅子鄉',
        '車城鄉',
        '牡丹鄉',
        '恆春鎮',
        '滿州鄉',
        '宜蘭市',
        '頭城鎮',
        '礁溪鄉',
        '壯圍鄉',
        '員山鄉',
        '羅東鎮',
        '三星鄉',
        '大同鄉',
        '五結鄉',
        '冬山鄉',
        '蘇澳鎮',
        '南澳鄉',
        // 花蓮/台東
        '花蓮市',
        '新城鄉',
        '秀林鄉',
        '吉安鄉',
        '壽豐鄉',
        '鳳林鎮',
        '光復鄉',
        '豐濱鄉',
        '瑞穗鄉',
        '萬榮鄉',
        '玉里鎮',
        '卓溪鄉',
        '富里鄉',
        '臺東市',
        '綠島鄉',
        '蘭嶼鄉',
        '延平鄉',
        '卑南鄉',
        '鹿野鄉',
        '關山鎮',
        '海端鄉',
        '池上鄉',
        '東河鄉',
        '成功鎮',
        '長濱鄉',
        '太麻里鄉',
        '金峰鄉',
        '大武鄉',
        '達仁鄉',
        // 澎湖/金門/連江
        '馬公市',
        '西嶼鄉',
        '望安鄉',
        '七美鄉',
        '白沙鄉',
        '湖西鄉',
        '金沙鎮',
        '金湖鎮',
        '金寧鄉',
        '金城鎮',
        '烈嶼鄉',
        '烏坵鄉',
        '南竿鄉',
        '北竿鄉',
        '莒光鄉',
        '東引鄉',
      ],
    },
  };

  // ==========================================
  //      2. 核心程式碼 (Logic)
  // ==========================================

  // 註冊選單
  GM_registerMenuCommand('⚙️ 設定 Notion API Key', askForSecrets);

  function askForSecrets() {
    const currentToken = GM_getValue(CONFIG.STORAGE_KEYS.TOKEN, '');
    const currentDbId = GM_getValue(CONFIG.STORAGE_KEYS.DB_ID, '');
    const newToken = prompt('請輸入 Notion Integration Token (secret_...):', currentToken);
    if (newToken === null) {
      return;
    }
    const newDbId = prompt('請輸入 Notion Database ID:', currentDbId);
    if (newDbId === null) {
      return;
    }
    GM_setValue(CONFIG.STORAGE_KEYS.TOKEN, newToken.trim());
    GM_setValue(CONFIG.STORAGE_KEYS.DB_ID, newDbId.trim());
    alert('✅ 設定已儲存！請重新整理頁面以套用。');
    location.reload();
  }

  function getSecrets() {
    return {
      TOKEN: GM_getValue(CONFIG.STORAGE_KEYS.TOKEN, ''),
      DB_ID: GM_getValue(CONFIG.STORAGE_KEYS.DB_ID, ''),
    };
  }

  // CSS
  GM_addStyle(`
        .LenJEf { display: flex !important; justify-content: flex-end !important; gap: 5px !important; margin-top: 5px !important; opacity: 0.6; transition: opacity 0.2s; }
        .LenJEf:hover { opacity: 1; }
        .LenJEf button { flex-direction: row !important; padding: 4px 8px !important; height: auto !important; border: 1px solid #eee !important; border-radius: 15px !important; background: transparent !important; }
        .LenJEf .XDlzbe { display: none !important; }
        .LenJEf .fCbqBc { width: 20px !important; height: 20px !important; margin: 0 !important; }
        .LenJEf img, .LenJEf span.google-symbols { width: 20px !important; height: 20px !important; font-size: 20px !important; }
    `);

  // 監聽器
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        const shareModal = document.querySelector('div[role="dialog"]');
        // 確保視窗存在、尚未插入面板，且視窗內有 input (通常是分享連結框)，避免誤判其他彈窗
        if (
          shareModal &&
          !document.querySelector('#notion-custom-panel') &&
          shareModal.querySelector('input')
        ) {
          injectUI(shareModal);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // UI 注入
  function injectUI(modal) {
    const linkInput = modal.querySelector('input');
    if (!linkInput) {
      return;
    }

    // 通常 input 的父層的父層就是社交按鈕區塊的容器
    // 這裡使用 closest('div') 往上找一層，再找 parentElement，這在目前的 Google Maps 版本是穩定的結構
    const socialSection = linkInput.closest('div')?.parentElement;

    // 再次確認 container 存在
    const container = socialSection?.parentNode;

    // 如果找不到 container，表示結構又變了，直接放棄以避免報錯
    if (!container || !socialSection) {
      // console.log('Notion Script: 找不到插入點，請檢查 Google Maps 結構');
      return;
    }

    const initialData = extractData(modal);
    const { TOKEN, DB_ID } = getSecrets();
    const isConfigured = TOKEN && DB_ID;

    const panel = document.createElement('div');
    panel.id = 'notion-custom-panel';
    panel.style.cssText = `margin-top: 0px; padding: 10px 0px; border-top: 1px solid #dadce0; display: flex; flex-direction: column; gap: 8px;`;

    const createRow = () => {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.gap = '10px';
      return div;
    };
    const createLabel = (text) => {
      const lbl = document.createElement('label');
      lbl.innerText = text;
      lbl.style.fontSize = '13px';
      lbl.style.fontWeight = 'bold';
      lbl.style.color = '#202124';
      lbl.style.minWidth = '35px';
      return lbl;
    };

    // Row 1: Name
    const row1 = createRow();
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = initialData.name;
    nameInput.style.cssText = `flex-grow: 1; padding: 6px 8px; border-radius: 4px; border: 1px solid #dadce0; font-size: 14px;`;
    row1.appendChild(createLabel('名稱:'));
    row1.appendChild(nameInput);

    // Row 2: Category (From CONFIG)
    const row2 = createRow();
    const select = document.createElement('select');
    select.style.cssText = `flex-grow: 1; padding: 6px; border-radius: 4px; border: 1px solid #dadce0; background-color: white;`;
    const defaultOption = document.createElement('option');
    defaultOption.text = '-- 請選擇 --';
    defaultOption.value = '';
    if (CONFIG.PREFS.DEFAULT_CATEGORY === '') {
      defaultOption.selected = true;
    }
    select.add(defaultOption);
    CONFIG.PREFS.CATEGORIES.forEach((cat) => {
      const option = document.createElement('option');
      option.text = cat;
      option.value = cat;
      if (cat === CONFIG.PREFS.DEFAULT_CATEGORY) {
        option.selected = true;
      }
      select.add(option);
    });
    row2.appendChild(createLabel('分類:'));
    row2.appendChild(select);

    // Row 3: Note
    const row3 = createRow();
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.placeholder = '選填...';
    noteInput.style.cssText = `flex-grow: 1; padding: 6px 8px; border-radius: 4px; border: 1px solid #dadce0; font-size: 14px;`;
    row3.appendChild(createLabel('備註:'));
    row3.appendChild(noteInput);

    // Row 4: Location (Editable)
    const row4 = createRow();
    const cityInput = document.createElement('input');
    cityInput.type = 'text';
    cityInput.value = initialData.city;
    cityInput.placeholder = '縣市';
    cityInput.style.cssText = `flex-grow: 1; width: 50%; padding: 6px 8px; border-radius: 4px; border: 1px solid #dadce0; font-size: 14px;`;
    const districtInput = document.createElement('input');
    districtInput.type = 'text';
    districtInput.value = initialData.district;
    districtInput.placeholder = '行政區';
    districtInput.style.cssText = `flex-grow: 1; width: 50%; padding: 6px 8px; border-radius: 4px; border: 1px solid #dadce0; font-size: 14px;`;
    row4.appendChild(createLabel('位置:'));
    row4.appendChild(cityInput);
    row4.appendChild(districtInput);

    // Status & Btn
    const statusMsg = document.createElement('div');
    statusMsg.style.fontSize = '12px';
    statusMsg.style.color = '#d93025';

    const btn = document.createElement('button');
    if (!isConfigured) {
      btn.innerText = '⚠️ 請點此設定 API Key';
      btn.style.cssText = `background-color: #fbbc04; color: black; padding: 8px 16px; border: none; border-radius: 18px; cursor: pointer; font-weight: bold; width: 100%; transition: 0.2s;`;
      btn.onclick = askForSecrets;
    } else {
      btn.innerText = '新增至 Notion';
      btn.style.cssText = `background-color: #1a73e8; color: white; padding: 8px 16px; border: none; border-radius: 18px; cursor: pointer; font-weight: 500; width: 100%; transition: 0.2s;`;
      btn.onclick = async () => {
        const category = select.value;
        const finalName = nameInput.value.trim();
        const noteContent = noteInput.value.trim();
        const finalCity = cityInput.value.trim();
        const finalDistrict = districtInput.value.trim();

        if (!category) {
          statusMsg.innerText = '⚠️ 請選擇分類';
          return;
        }
        if (!finalName) {
          statusMsg.innerText = '⚠️ 名稱不能為空';
          return;
        }

        const freshUrlInput = modal.querySelector('input.vrsrZe');
        const freshUrl = freshUrlInput ? freshUrlInput.value : window.location.href;

        btn.disabled = true;
        btn.innerText = '檢查中...';
        btn.style.backgroundColor = '#8ab4f8';
        statusMsg.innerText = '';

        const finalData = {
          name: finalName,
          address: initialData.address,
          url: freshUrl,
          city: finalCity,
          district: finalDistrict,
          category: category,
          note: noteContent,
        };

        try {
          const exists = await checkDuplicate(finalData.name, TOKEN, DB_ID);
          if (exists) {
            btn.innerText = '⚠️ 已存在';
            btn.style.backgroundColor = '#fbbc04';
            btn.style.color = '#202124';
            statusMsg.innerText = `資料庫已有此店`;
            btn.disabled = false;
          } else {
            btn.innerText = '寫入中...';
            await sendToNotion(finalData, TOKEN, DB_ID);
            btn.innerText = '✅ 完成';
            btn.style.backgroundColor = '#188038';
            setTimeout(() => {
              const closeBtn = modal.parentNode.querySelector('button[aria-label="關閉"]');
              if (closeBtn) {
                closeBtn.click();
              }
            }, 1500);
          }
        } catch (err) {
          console.error(err);
          btn.innerText = '❌ 失敗';
          btn.style.backgroundColor = '#d93025';
          btn.disabled = false;
          alert('Notion API 錯誤：\n' + err.message);
        }
      };
    }

    panel.appendChild(row1);
    panel.appendChild(row2);
    panel.appendChild(row3);
    panel.appendChild(row4);
    panel.appendChild(statusMsg);
    panel.appendChild(btn);
    container.insertBefore(panel, socialSection);
  }

  // 資料提取 (使用 CONFIG 中的變數)
  function extractData(modal) {
    const nameEl = modal.querySelector('h1');
    let name = nameEl ? nameEl.innerText.trim() : document.title.replace(' - Google 地圖', '');

    // 嘗試抓取地址：
    // 2025/2月 版本觀察到地址通常在一個帶有特定 data-item-id 或 aria-label 的容器裡
    // 這裡嘗試幾個可能的選擇器，如果都失敗則留空
    const addressEl =
      modal.querySelector('[data-item-id="address"]') ||
      modal.querySelector('div[aria-label^="地址:"]') ||
      modal.querySelector('.vKmG2c'); // 保留舊的以防萬一

    const fullAddress = addressEl ? addressEl.innerText.replace('地址:', '').trim() : '';

    // 抓取 URL：直接抓視窗裡唯一的 input 元素即可
    const urlInput = modal.querySelector('input');
    const shortUrl = urlInput ? urlInput.value : window.location.href;

    let city = '';
    let district = '';

    // 1. 抓取縣市 (使用 CONFIG.DATA.CITIES)
    const foundCity = CONFIG.DATA.CITIES.find((c) => {
      return fullAddress.includes(c);
    });
    if (foundCity) {
      city = foundCity;
    }

    // 2. 抓取行政區 (使用 CONFIG.DATA.DISTRICTS)
    const foundDistrict = CONFIG.DATA.DISTRICTS.find((d) => {
      return fullAddress.includes(d);
    });
    if (foundDistrict) {
      district = foundDistrict;
    }

    return { name, address: fullAddress, url: shortUrl, city, district };
  }

  // API: Check Duplicate (使用 CONFIG.NOTION_PROPS)
  function checkDuplicate(name, token, dbId) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `https://api.notion.com/v1/databases/${dbId}/query`,
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        data: JSON.stringify({
          filter: {
            property: CONFIG.NOTION_PROPS.NAME, // 變數化欄位
            title: { equals: name },
          },
        }),
        onload: (response) => {
          if (response.status === 200) {
            resolve(JSON.parse(response.responseText).results.length > 0);
          } else {
            reject(new Error(JSON.parse(response.responseText).message || 'Query failed'));
          }
        },
        onerror: (err) => {
          return reject(err);
        },
      });
    });
  }

  // API: Send to Notion (使用 CONFIG.NOTION_PROPS)
  function sendToNotion(data, token, dbId) {
    return new Promise((resolve, reject) => {
      // 動態構建 properties 物件
      const props = {};
      props[CONFIG.NOTION_PROPS.NAME] = { title: [{ text: { content: data.name } }] };
      props[CONFIG.NOTION_PROPS.URL] = { url: data.url };
      props[CONFIG.NOTION_PROPS.CATEGORY] = { select: { name: data.category } };
      props[CONFIG.NOTION_PROPS.CITY] = { select: { name: data.city } };
      props[CONFIG.NOTION_PROPS.DISTRICT] = { select: { name: data.district } };
      props[CONFIG.NOTION_PROPS.ADDRESS] = { rich_text: [{ text: { content: data.address } }] };
      props[CONFIG.NOTION_PROPS.NOTE] = { rich_text: [{ text: { content: data.note } }] };

      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://api.notion.com/v1/pages',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        data: JSON.stringify({
          parent: { database_id: dbId },
          icon: { type: 'emoji', emoji: CONFIG.PREFS.PAGE_ICON },
          properties: props, // 使用上面構建的物件
        }),
        onload: (response) => {
          if (response.status === 200) {
            resolve(JSON.parse(response.responseText));
          } else {
            try {
              const errData = JSON.parse(response.responseText);
              reject(new Error(errData.message));
            } catch (e) {
              reject(new Error('Create failed: ' + response.status));
            }
          }
        },
        onerror: (err) => {
          return reject(err);
        },
      });
    });
  }
})();
