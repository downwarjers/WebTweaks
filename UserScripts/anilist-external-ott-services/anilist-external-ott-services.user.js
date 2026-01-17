// ==UserScript==
// @name         AniList to OTT Sites
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.2.0
// @description  AniList 清單新增外部OTT按鈕，直接跳轉搜尋作品，支援巴哈自動跳轉集數
// @author       downwarjers
// @license      MIT
// @match        https://anilist.co/*
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      ani.gamer.com.tw
// @connect      anilist.co
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/anilist-external-ott-services/anilist-external-ott-services.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/anilist-external-ott-services/anilist-external-ott-services.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==========================================
  // 設定區 (按鈕定義)
  // ==========================================
  const services = [
    {
      id: 'bahamut',
      label: '巴',
      color: '#00b4d8', // 藍色
      hoverColor: '#0077b6',
      tooltip: '前往巴哈姆特動畫瘋 (智慧跳轉)',
      action: (title, progress, btn, animeUrl) => {
        const cleanTitleText = cleanTitle(title);
        getSmartDate(animeUrl, (aniDate) => {
          runBahaLogic(cleanTitleText, progress, btn, aniDate);
        });
      },
    },
    {
      id: 'netflix',
      label: 'N',
      color: '#E50914', // 紅色
      hoverColor: '#B20710',
      tooltip: '前往 Netflix 搜尋',
      action: (title) => {
        const url = `https://www.netflix.com/search?q=${encodeURIComponent(title)}`;
        GM_openInTab(url, { active: true });
      },
    },
  ];

  // ==========================================
  // === 0. 輔助函式區 ===
  // ==========================================

  function cleanTitle(title) {
    if (!title) {
      return '';
    }
    let clean = title.replace(/\s*\((TV|Movie|OVA|ONA|Special)\)/gi, '');
    clean = clean.replace(/[:：\-－–—_]/g, ' ');
    return clean.replace(/\s+/g, ' ').trim();
  }

  function parseDateObj(dateStr) {
    if (!dateStr) {
      return null;
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
      };
    }
    return null;
  }

  function findDateInScope(scope) {
    const dataSets = scope.querySelectorAll('.data-set');

    for (const set of dataSets) {
      const typeEl = set.querySelector('.type');

      if (typeEl && typeEl.innerText.includes('Start Date')) {
        const valueEl = set.querySelector('.value');
        if (valueEl) {
          const result = parseDateObj(valueEl.innerText.trim());
          return result;
        }
      }
    }
    return null;
  }

  //  背景爬蟲
  function fetchDateFromBackground(url, callback) {
    if (!url) {
      // console.log('[AniList-OTT] 無 URL，略過 API 請求');
      callback(null);
      return;
    }

    // 從網址提取 ID
    const idMatch = url.match(/\/anime\/(\d+)/);

    if (!idMatch) {
      console.error('[AniList-OTT] 無法從 URL 解析 Anime ID:', url);
      callback(null);
      return;
    }

    const animeId = parseInt(idMatch[1], 10);
    // console.log(`[AniList-OTT] 準備透過 API 查詢 ID: ${animeId}`);

    const query = `
        query ($id: Int) {
          Media (id: $id, type: ANIME) {
            startDate {
              year
              month
            }
          }
        }
      `;

    GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://graphql.anilist.co',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      data: JSON.stringify({
        query: query,
        variables: { id: animeId },
      }),
      onload: function (response) {
        if (response.status !== 200) {
          console.error(`[AniList-OTT] API 請求失敗 Status: ${response.status}`);
          callback(null);
          return;
        }

        try {
          const resJson = JSON.parse(response.responseText);
          const dateData = resJson.data?.Media?.startDate;

          if (dateData && dateData.year) {
            // console.log(`[AniList-OTT] API 成功取得日期:`, dateData);
            callback({
              year: dateData.year,
              month: dateData.month || 1, // 如果月份缺失，預設為 1
            });
          } else {
            // console.log('[AniList-OTT] API 回傳資料中無日期');
            callback(null);
          }
        } catch (e) {
          console.error('[AniList-OTT] API 回應解析錯誤:', e);
          callback(null);
        }
      },
      onerror: function (err) {
        console.error('[AniList-OTT] API 連線錯誤:', err);
        callback(null);
      },
    });
  }

  // 判斷入口
  function getSmartDate(animeUrl, callback) {
    // 1. 如果有傳入 animeUrl，代表這是列表頁，需要背景爬蟲
    if (animeUrl) {
      fetchDateFromBackground(animeUrl, callback);
    }
    // 2. 否則代表是詳情頁，直接由 document 抓取
    else {
      const date = findDateInScope(document);
      callback(date);
    }
  }

  function getMonthDiff(date1, date2) {
    if (!date1 || !date2) {
      return 999;
    }
    return Math.abs(date1.year * 12 + date1.month - (date2.year * 12 + date2.month));
  }

  // ==========================================
  // === 1. 樣式注入 (CSS) ===
  // ==========================================
  const style = document.createElement('style');
  let cssRules = `
        /* === 清單模式 (List View) 容器設定 === */
        .list-head .custom-links-col, .entry .custom-links-col {
            width: ${services.length * 30 + 10}px; 
            text-align: center;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 4px; /* 按鈕間距縮小 */
        }

        /* === 卡片模式 (Grid View) 容器設定 - 懸浮於左上角 === */
        .entry-card {
            position: relative !important;
        }
        .entry-card .custom-links-col {
            position: absolute;
            top: 5px;
            left: 5px;
            z-index: 50;
            width: auto;
            display: flex;
            flex-direction: column; /* 垂直排列 */
            gap: 4px;
            background: rgba(0, 0, 0, 0.4); 
            padding: 3px;
            border-radius: 4px;
        }

        /* === 按鈕通用樣式 (縮小版) === */
        .link-btn {
            display: inline-flex;
            justify-content: center;
            align-items: center;
            width: 24px;            
            height: 24px;          
            border-radius: 4px;    
            cursor: pointer;
            font-weight: bold;
            font-family: sans-serif;
            font-size: 12px;        
            line-height: 1;
            transition: opacity 0.2s;
            text-decoration: none !important;
            color: #ffffff !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .link-btn:hover {
            opacity: 0.85;
        }

        /* === 標題旁 (Header) 的按鈕微調 === */
        .header-ott-buttons {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-left: 10px;
            vertical-align: middle;
            position: relative;
            top: -2px;
        }
        .header-ott-buttons .link-btn {
            width: 28px;
            height: 28px;
            font-size: 14px;
        }
    `;
  services.forEach((service) => {
    cssRules += `
        .btn-${service.id} { background-color: ${service.color}; }
        .btn-${service.id}:hover { background-color: ${service.hoverColor}; }
    `;
  });
  style.innerHTML = cssRules;
  document.head.appendChild(style);

  // ==========================================
  // === 2. 主程式 (介面渲染) ===
  // ==========================================
  const observer = new MutationObserver(() => {
    initButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function initButtons() {
    initListButtons();
    initCardButtons();
    initHeaderButtons();
  }

  function initListButtons() {
    document.querySelectorAll('.list-head').forEach((header) => {
      if (!header.querySelector('.custom-links-col')) {
        const div = document.createElement('div');
        div.className = 'custom-links-col';
        div.innerText = 'Links';
        header.appendChild(div);
      }
    });

    document.querySelectorAll('.entry.row').forEach((entry) => {
      if (entry.querySelector('.custom-links-col')) {
        return;
      }

      const titleEl = entry.querySelector('.title a');
      if (!titleEl) {
        return;
      }

      const title = titleEl.innerText.trim();
      // 抓取連結
      const animeHref = titleEl.getAttribute('href');

      let progress = 0;
      const progressEl = entry.querySelector('.progress span') || entry.querySelector('.progress');
      if (progressEl) {
        const raw = entry.querySelector('.progress').innerText;
        const clean = raw.replace('+', '').trim().split('/')[0];
        progress = parseInt(clean, 10) || 0;
      }

      const btnDiv = document.createElement('div');
      btnDiv.className = 'custom-links-col';

      // 傳入 animeHref 供背景爬蟲使用
      createButtons(
        btnDiv,
        title,
        () => {
          return progress;
        },
        animeHref,
      );
      entry.appendChild(btnDiv);
    });
  }

  function initCardButtons() {
    document.querySelectorAll('.entry-card').forEach((card) => {
      // 1. 檢查是否已經加過按鈕，避免重複
      if (card.querySelector('.custom-links-col')) {
        return;
      }

      // 2. 抓取標題與連結
      const titleEl = card.querySelector('.title a');
      if (!titleEl) {
        return;
      }
      const title = titleEl.innerText.trim();
      const animeHref = titleEl.getAttribute('href');

      // 3. 抓取進度 (處理 <div class="progress"> 13</div>)
      let progress = 0;
      const progressEl = card.querySelector('.progress');
      if (progressEl) {
        // 取得純文字，過濾掉 + 號或非數字部分
        const rawText = progressEl.innerText || '';
        const cleanText = rawText.replace('+', '').trim().split('/')[0];
        progress = parseInt(cleanText, 10) || 0;
      }

      // 4. 建立按鈕容器
      const btnDiv = document.createElement('div');
      btnDiv.className = 'custom-links-col';

      // 5. 產生按鈕 (復用原本的 createButtons)
      createButtons(
        btnDiv,
        title,
        () => {
          return progress;
        }, // 傳入函式以符合 createButtons 介面
        animeHref,
      );

      // 6. 插入到卡片底部
      card.appendChild(btnDiv);
    });
  }
  function initHeaderButtons() {
    const h1Element = document.querySelector('.header .content h1');
    if (h1Element && !h1Element.querySelector('.header-ott-buttons')) {
      const container = document.createElement('span');
      container.className = 'header-ott-buttons';

      const titleGetter = () => {
        const h1 = document.querySelector('.header .content h1');
        if (!h1) {
          return '';
        }
        const clone = h1.cloneNode(true);
        const buttons = clone.querySelector('.header-ott-buttons');
        if (buttons) {
          buttons.remove();
        }
        return clone.innerText.trim();
      };

      // Header 不需要 animeHref，傳 null，會自動改抓當前 DOM
      createButtons(container, titleGetter, getPageProgress, null);
      h1Element.appendChild(container);
    }
  }

  function getPageProgress() {
    try {
      const inputs = document.querySelectorAll('.form.progress input.el-input__inner');
      for (const input of inputs) {
        if (input.type === 'text' || input.type === 'number') {
          const val = parseInt(input.value, 10);
          if (!isNaN(val) && val > 0) {
            return val;
          }
        }
      }
    } catch (e) {
      console.error('AniList OTT Script Error:', e);
    }
    return 0;
  }

  function createButtons(container, titleOrGetter, progressProvider, animeUrl) {
    services.forEach((service) => {
      const btn = document.createElement('span');
      btn.className = `link-btn btn-${service.id}`;
      btn.innerText = service.label;
      btn.title = `${service.tooltip}`;

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        let currentTitle = typeof titleOrGetter === 'function' ? titleOrGetter() : titleOrGetter;
        let currentProgress =
          typeof progressProvider === 'function' ? progressProvider() : progressProvider;

        service.action(currentTitle, currentProgress, btn, animeUrl);
      };

      container.appendChild(btn);
    });
  }

  // ==========================================
  // === 3. 巴哈姆特 核心邏輯 ===
  // ==========================================
  function runBahaLogic(keyword, currentProgress, btnElement, aniDate) {
    const originalText = btnElement.innerText;
    btnElement.innerText = '...';

    const searchUrl = `https://ani.gamer.com.tw/search.php?keyword=${encodeURIComponent(keyword)}`;

    GM_xmlhttpRequest({
      method: 'GET',
      url: searchUrl,
      onload: function (response) {
        const finalUrl = response.finalUrl;
        const isRedirectedToVideo =
          finalUrl &&
          !finalUrl.includes('search.php') &&
          (finalUrl.includes('animeRef.php') || finalUrl.includes('animeVideo.php'));

        if (isRedirectedToVideo) {
          fetchBahaEpisode(finalUrl, currentProgress, searchUrl, btnElement, originalText);
          return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.responseText, 'text/html');
        const rawLinks = doc.querySelectorAll('a.theme-list-main');
        const validResults = [];

        rawLinks.forEach((link) => {
          if (link.closest('.animate-wish')) {
            return;
          }
          const href = link.getAttribute('href');
          if (href && !href.includes('javascript:')) {
            validResults.push(link);
          }
        });

        const doJump = (targetLink) => {
          const href = targetLink.getAttribute('href');
          const animeUrl = href.startsWith('http') ? href : 'https://ani.gamer.com.tw/' + href;
          fetchBahaEpisode(animeUrl, currentProgress, searchUrl, btnElement, originalText);
        };

        if (validResults.length === 1) {
          doJump(validResults[0]);
        } else if (validResults.length > 1) {
          // 多重結果邏輯
          if (aniDate) {
            const dateFiltered = validResults.filter((link) => {
              const infoBlock = link.querySelector('.theme-time');
              if (!infoBlock) {
                return false;
              }

              const match = infoBlock.innerText.match(/(\d{4})\/(\d{1,2})/);
              if (match) {
                const bahaDate = {
                  year: parseInt(match[1], 10),
                  month: parseInt(match[2], 10),
                };
                const monthDiff = getMonthDiff(aniDate, bahaDate);

                // 判定邏輯：年份相同且月份接近，或是月份差極小(跨年)
                return (aniDate.year === bahaDate.year && monthDiff <= 2) || monthDiff <= 1;
              }
              return false;
            });

            if (dateFiltered.length === 1) {
              doJump(dateFiltered[0]);
            } else {
              resetBtn(btnElement, originalText);
              GM_openInTab(searchUrl, { active: true });
            }
          } else {
            // 如果連背景爬蟲都抓不到日期 (或者網路失敗)，就開搜尋頁
            resetBtn(btnElement, originalText);
            GM_openInTab(searchUrl, { active: true });
          }
        } else {
          resetBtn(btnElement, originalText);
          GM_openInTab(searchUrl, { active: true });
        }
      },
      onerror: function () {
        resetBtn(btnElement, originalText);
        GM_openInTab(searchUrl, { active: true });
      },
    });
  }

  function fetchBahaEpisode(animeUrl, currentProgress, fallbackUrl, btnElement, originalText) {
    GM_xmlhttpRequest({
      method: 'GET',
      url: animeUrl,
      onload: function (response) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(response.responseText, 'text/html');

        const rawLinks = doc.querySelectorAll('.season ul li a, ul.anime_list li a');
        const validEpisodes = [];

        rawLinks.forEach((link) => {
          const num = parseFloat(link.innerText.trim());
          if (!isNaN(num) && Number.isInteger(num) && num > 0) {
            validEpisodes.push(link);
          }
        });

        if (validEpisodes.length > 0) {
          let indexToUse = currentProgress > 0 ? currentProgress - 1 : 0;
          if (indexToUse >= validEpisodes.length) {
            resetBtn(btnElement, originalText);
            GM_openInTab(response.finalUrl || animeUrl, { active: true });
            return;
          }
          const href = validEpisodes[indexToUse].getAttribute('href');
          let finalUrl = href;
          if (href.startsWith('?')) {
            finalUrl = 'https://ani.gamer.com.tw/animeVideo.php' + href;
          } else if (href.startsWith('animeVideo.php')) {
            finalUrl = 'https://ani.gamer.com.tw/' + href;
          }

          resetBtn(btnElement, originalText);
          GM_openInTab(finalUrl, { active: true });
        } else {
          resetBtn(btnElement, originalText);
          GM_openInTab(response.finalUrl || animeUrl, { active: true });
        }
      },
      onerror: function () {
        resetBtn(btnElement, originalText);
        GM_openInTab(fallbackUrl, { active: true });
      },
    });
  }

  function resetBtn(btn, text) {
    btn.innerText = text;
  }
})();
