// ==UserScript==
// @name         YouTube 影片儲存按鈕強制顯示
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.0
// @description  自動複製並生成「儲存」按鈕，置入於操作列中。透過複製現有按鈕樣式 (Clone & Modify) 達成 UI 自動適配，並透過 Ghost Click 技術觸發原生功能。
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        GM_addStyle
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-save-button-fixer/youtube-save-button-fixer.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-save-button-fixer/youtube-save-button-fixer.user.js
// ==/UserScript==

(function() {
    'use strict';

    const TARGET_LABEL = "儲存";

    // === CSS 優化 ===
    // 即使我們複製了按鈕，還是需要一個容器來微調位置，避免與隔壁按鈕太擠
    GM_addStyle(`
        #my-save-button-container {
            display: flex !important;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            position: relative;
            /* 讓容器自動適應內容，不要被壓縮 */
            flex: 0 0 auto; 
            margin-left: 8px; /* 保持一點間距 */
        }

        /* 確保我們的 SVG Icon 顏色與大小正確 */
        #my-save-button-container button svg {
            width: 24px;
            height: 24px;
            display: block;
            fill: currentColor;
            pointer-events: none;
        }

        /* 隱形點擊模式時，隱藏跳出來的選單，避免畫面閃爍 */
        body.yt-proxy-clicking ytd-popup-container {
            opacity: 0 !important;
            pointer-events: none !important;
        }
    `);

    // === 核心邏輯：隱形點擊 (Ghost Click) ===
    // 這部分邏輯保持不變，因為它是觸發功能的關鍵
    async function executeInvisibleClick(threeDotButton) {
        document.body.classList.add('yt-proxy-clicking');
        try {
            // 1. 點擊三點選單
            threeDotButton.click();
            // 2. 等待「儲存」選項出現
            const saveItem = await waitForItem(TARGET_LABEL);
            
            if (saveItem) {
                // 3. 點擊目標
                saveItem.click();
                // 4. (可選) 再次點擊三點選單以關閉它，但在 yt-proxy-clicking 模式下通常不需要，
                // 因為點擊選項後選單通常會自動關閉，或者我們希望它自然消失。
            } else {
                // 失敗處理：如果沒找到，把選單關回去
                threeDotButton.click();
                console.warn(`[YouTube Save Fix] 找不到選單項目: "${TARGET_LABEL}"`);
            }
        } catch (e) {
            console.error('[YouTube Save Fix] 執行失敗:', e);
        } finally {
            // 延遲移除 class，確保動畫結束後再恢復顯示
            setTimeout(() => {
                document.body.classList.remove('yt-proxy-clicking');
            }, 200);
        }
    }

    // 等待選單項目出現的輔助函式
    function waitForItem(text) {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50; // 約 1 秒超時
            
            const timer = setInterval(() => {
                attempts++;
                // 搜尋所有可能的選單項目 (兼容舊版與新版)
                const items = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item, yt-formatted-string');
                
                for (let item of items) {
                    if (item.innerText && item.innerText.trim() === text) {
                        clearInterval(timer);
                        // 找到最外層的可點擊元件
                        const clickableItem = item.closest('ytd-menu-service-item-renderer') || item.closest('tp-yt-paper-item') || item;
                        resolve(clickableItem);
                        return;
                    }
                }

                if (attempts > maxAttempts) {
                    clearInterval(timer);
                    resolve(null);
                }
            }, 20); // 每 20ms 檢查一次
        });
    }

    // === 變色龍邏輯：複製與修改 ===
    
    function init() {
        // 1. 檢查容器是否已存在 (避免重複插入)
        if (document.getElementById('my-save-button-container')) return;

        // 2. 尋找按鈕列容器 (這是比較穩定的 ID)
        const buttonsContainer = document.querySelector('#top-level-buttons-computed');
        if (!buttonsContainer) return;

        // 3. 尋找「三點選單」按鈕 (這是我們觸發功能的開關)
        // 通常位於 actions 區域的尾端，或者是 ytd-menu-renderer 內
        // 我們找一個有 button-shape 的元素，且通常是最後一個
        const menuRenderer = buttonsContainer.closest('ytd-menu-renderer') || document.querySelector('ytd-menu-renderer.ytd-watch-metadata');
        if (!menuRenderer) return;

        // 嘗試找到三點選單的實際按鈕 DOM
        const threeDotButtonShape = menuRenderer.querySelector('yt-button-shape#button-shape button');
        if (!threeDotButtonShape) return;

        // 4. 尋找一個「樣板按鈕」來複製
        // 我們優先找「分享」按鈕，因為它的樣式最接近我們想要的
        // 如果找不到分享，就找容器裡的第一個 button
        const refButton = buttonsContainer.querySelector('button[aria-label*="分享"]') || 
                          buttonsContainer.querySelector('button[aria-label*="Share"]') ||
                          buttonsContainer.querySelector('button');

        if (!refButton) return;

        // 5. 開始複製 (Clone)
        // cloneNode(true) 會複製整個 DOM 結構與 Class，但不包含事件監聽器 (這正是我們想要的)
        const clonedBtn = refButton.cloneNode(true);

        // 6. 清理與修改複製來的按鈕
        clonedBtn.id = ''; // 移除 ID 避免衝突
        clonedBtn.removeAttribute('title'); // 移除原有的提示
        clonedBtn.setAttribute('aria-label', TARGET_LABEL); // 設定無障礙標籤
        
        // 確保樣式：強制移除可能的 active/selected 狀態 class (視情況而定)
        // 通常 YouTube 的按鈕樣式都在 class 裡，我們保留它們，讓按鈕長得跟原本一樣

        // 7. 替換 Icon (注入「儲存」的 SVG)
        // 嘗試找到按鈕內的 icon 容器 (通常有 icon class 或是 svg)
        const iconContainer = clonedBtn.querySelector('.yt-spec-button-shape-next__icon') || clonedBtn.querySelector('yt-icon');
        if (iconContainer) {
            iconContainer.innerHTML = `
                <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" class="style-scope yt-icon" style="pointer-events: none; display: block; width: 100%; height: 100%;">
                    <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"></path>
                </svg>`;
        }

        // 8. 替換文字
        // 嘗試找到文字容器
        const textContainer = clonedBtn.querySelector('.yt-spec-button-shape-next__button-text-content') || clonedBtn.querySelector('div[class*="text-content"]');
        if (textContainer) {
            textContainer.innerText = TARGET_LABEL;
        } else {
            // 如果結構很怪，找不到文字容器，嘗試直接改 innerText (風險較高，可能會破壞 icon)
            // 但因為我們前面已經處理過 iconContainer，如果這裡是純文字按鈕，這步是必要的
            // 這裡採取保守策略：如果找不到文字容器，我們就不改文字(可能那是個純 icon 按鈕)，只改 icon
        }

        // 9. 綁定點擊事件
        clonedBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation(); // 阻止事件冒泡，防止觸發原本按鈕可能的行為
            
            // 執行隱形點擊
            executeInvisibleClick(threeDotButtonShape);
        };

        // 10. 封裝並插入
        const myContainer = document.createElement('div');
        myContainer.id = 'my-save-button-container';
        myContainer.appendChild(clonedBtn);

        // 插入到按鈕列的最後面 (但在三點選單之前，如果三點選單也在這個容器裡的話)
        // 通常三點選單是分開的，所以直接 append 到 buttonsContainer 即可
        buttonsContainer.appendChild(myContainer);
        
        console.log('[YouTube Save Fix] 按鈕已成功注入 (Clone Mode)');
    }

    // === 監聽器與初始化 ===
    
    let initTimeout = null;
    const observer = new MutationObserver((mutations) => {
        // 簡單防抖
        if (initTimeout) clearTimeout(initTimeout);
        
        // 檢查我們的按鈕是否不見了
        if (!document.getElementById('my-save-button-container')) {
            // 如果不見了，且頁面上有按鈕列容器，就嘗試重新注入
            if (document.querySelector('#top-level-buttons-computed')) {
                initTimeout = setTimeout(init, 300);
            }
        }
    });

    // 啟動監聽
    observer.observe(document.body, { childList: true, subtree: true });

    // 嘗試初次執行
    setTimeout(init, 1000);
    // 針對 SPA 換頁的額外檢查
    window.addEventListener('yt-navigate-finish', () => setTimeout(init, 1000));

})();