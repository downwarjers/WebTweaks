// ==UserScript==
// @name         VPN Gate Table Sort
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.1.4
// @description  優化 VPNGate 列表頁面，增加排序控制面板。支援依據「連線速度 (Mbps)」或「總分」進行排序，並提供即時關鍵字搜尋過濾功能。
// @author       downwarjers
// @license      MIT
// @match        *://www.vpngate.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/vpngate-table-filter/vpngate-table-filter.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/vpngate-table-filter/vpngate-table-filter.user.js
// ==/UserScript==

(function () {
  'use strict';

  // 排序欄位索引
  const COLUMN_SPEED = 3; // 線路質量 (吞吐量 Mbps)
  const COLUMN_SCORE = 9; // 總分
  const RADIO_NAME = 'sort_method';

  // -------------------------------------------------------------
  // 1. 鎖定目標表格
  // -------------------------------------------------------------
  const selector = 'table#vg_hosts_table_id';
  const allCandidateTables = document.querySelectorAll(selector);
  let targetTable = null;

  allCandidateTables.forEach((table) => {
    const tableContent = table.textContent || table.innerText;
    if (tableContent.includes('Mbps') && tableContent.includes('Ping')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    return;
  }

  const tbody = targetTable.getElementsByTagName('tbody')[0];
  if (!tbody) return;

  // --- 2. 移除重複的表頭行 ---
  const allRows = Array.from(tbody.getElementsByTagName('tr'));

  for (let i = allRows.length - 1; i >= 1; i--) {
    const row = allRows[i];
    const isHeaderRow = row.querySelector('.vg_table_header') !== null;
    if (isHeaderRow) {
      row.remove();
    }
  }

  // --- 3. 創建控制容器 ---
  const controlsContainer = document.createElement('div');
  controlsContainer.style.margin = '10px 0';
  controlsContainer.style.border = '1px solid #ddd';
  controlsContainer.style.padding = '10px';
  controlsContainer.style.borderRadius = '5px';
  controlsContainer.style.backgroundColor = '#f9f9f9';

  // -------------------------------------------------------------
  // 4. 創建排序切換 Radio Buttons
  // -------------------------------------------------------------
  const sortLabel = document.createElement('label');
  sortLabel.innerHTML = '<b>排序方式：</b> ';
  sortLabel.style.marginRight = '15px';

  // **關鍵優化：使用新的 createRadioButton 函式，包含 ID 和 Label**
  const radioSpeed = createRadioButton(
    RADIO_NAME,
    'speed',
    '按速度排序 (Mbps)',
    'radio_speed',
    true,
  );
  const radioScore = createRadioButton(RADIO_NAME, 'score', '按總分排序', 'radio_score');

  controlsContainer.appendChild(sortLabel);
  controlsContainer.appendChild(radioSpeed);
  controlsContainer.appendChild(radioScore);

  // -------------------------------------------------------------
  // 5. 創建搜尋框並設置預設值
  // -------------------------------------------------------------
  const searchInput = document.createElement('input');
  searchInput.setAttribute('type', 'text');
  searchInput.setAttribute('placeholder', '【即時搜尋】輸入國家/IP/速度等...');
  searchInput.style.cssText =
    'width: 100%; padding: 12px; margin: 15px 0 10px 0; border: 2px solid #007bff; font-size: 18px; box-sizing: border-box; border-radius: 5px;';
  searchInput.value = GM_getValue('last_search_keyword', 'Japan');

  // 將所有控制項插入到表格上方
  targetTable.parentNode.insertBefore(controlsContainer, targetTable);
  targetTable.parentNode.insertBefore(searchInput, targetTable);

  // -------------------------------------------------------------
  // 排序與篩選核心邏輯
  // -------------------------------------------------------------

  /**
   * Helper 函式：創建 Radio Button (已優化)
   */
  function createRadioButton(name, value, text, id, checked = false) {
    const wrapper = document.createElement('span');

    const input = document.createElement('input');
    input.setAttribute('type', 'radio');
    input.setAttribute('name', name);
    input.setAttribute('value', value);
    input.setAttribute('id', id); // 設置 ID
    input.checked = checked;
    input.style.marginRight = '5px';

    const label = document.createElement('label');
    label.setAttribute('for', id); // 設置 for 屬性指向 input 的 ID
    label.textContent = text;
    label.style.fontWeight = 'normal';
    label.style.marginRight = '10px'; // 讓選項之間保持距離
    label.style.cursor = 'pointer'; // 視覺提示，表示標籤可點擊

    wrapper.appendChild(input);
    wrapper.appendChild(label);
    return wrapper;
  }

  /**
   * 從複雜的欄位內容中提取數值，並移除千位分隔符號 ','
   */
  function extractNumericValue(cellContent, columnIndex) {
    let numericString = '';

    switch (columnIndex) {
      case COLUMN_SPEED: // 線路質量 (使用吞吐量 Mbps 進行排序)
        const mbpsMatch = cellContent.match(/([\d,]+\.?\d*)\s*Mbps/i);
        if (mbpsMatch) {
          numericString = mbpsMatch[1];
        } else {
          return 0;
        }
        break;
      case COLUMN_SCORE: // 總分
        numericString = cellContent.replace(/[^0-9,.]/g, '');
        break;
      default:
        return null;
    }

    // 關鍵修正：在轉換前移除所有逗號
    if (numericString) {
      numericString = numericString.replace(/,/g, '');
    }

    return parseFloat(numericString) || 0;
  }

  /**
   * 執行排序，並自動應用篩選
   */
  function executeSortAndFilter(columnIndex, isAscending = false) {
    const rows = Array.from(tbody.getElementsByTagName('tr')).slice(1);

    rows.sort((rowA, rowB) => {
      const valA = extractNumericValue(rowA.cells[columnIndex].textContent.trim(), columnIndex);
      const valB = extractNumericValue(rowB.cells[columnIndex].textContent.trim(), columnIndex);

      let comparison = valA - valB;

      // 預設降序 (從大到小)
      return isAscending ? comparison : -comparison;
    });

    rows.forEach((row) => tbody.appendChild(row));

    // 重新應用當前的篩選條件
    filterTable(searchInput.value);
  }

  /**
   * 篩選邏輯
   */
  function filterTable(filterText) {
    const upperFilterText = filterText.toUpperCase();
    const rows = Array.from(tbody.getElementsByTagName('tr')).slice(1);

    rows.forEach((row) => {
      let rowText = row.textContent || row.innerText;
      if (rowText.toUpperCase().indexOf(upperFilterText) > -1) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  }

  // 設置事件監聽器
  searchInput.addEventListener('input', function () {
    filterTable(this.value);
    GM_setValue('last_search_keyword', this.value);
  });

  // **關鍵：Radio Button 變動時觸發排序**
  controlsContainer.addEventListener('change', function (event) {
    if (event.target.name === RADIO_NAME) {
      let columnIndex;
      if (event.target.value === 'speed') {
        columnIndex = COLUMN_SPEED;
      } else if (event.target.value === 'score') {
        columnIndex = COLUMN_SCORE;
      }
      if (columnIndex !== undefined) {
        executeSortAndFilter(columnIndex, false); // 預設降序
      }
    }
  });

  // --- 6. 執行初始動作 ---
  // 預設為速度排序 (欄位 3, 降序) 並觸發篩選
  executeSortAndFilter(COLUMN_SPEED, false);
})();
