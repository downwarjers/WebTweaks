// ==UserScript==
// @name         YouTube 影片儲存按鈕強制顯示
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.3
// @description  將隱藏於 Overflow Menu 的「儲存」按鈕提取至 Top-level Action Bar，採用原生 CSS Class 確保 UI 一致性，並透過 Ghost Click 技術達成無閃爍觸發。
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
    // 放棄 display: contents，改用穩定的 Flex 容器來隔離佈局衝突
    GM_addStyle(`
        #my-save-button-container {
            display: flex !important;
            align-items: center;
            justify-content: center;
            height: 36px;
            margin-right: 8px;
            margin-left: 8px;
            /* 關鍵：禁止縮小，防止 YouTube 在空間不足時嘗試壓扁它而造成計算錯誤 */
            flex: 0 0 auto; 
        }

        .my-native-icon svg {
            width: 24px;
            height: 24px;
            display: block;
            fill: currentColor;
            pointer-events: none;
        }

        /* 隱形點擊模式 */
        body.yt-proxy-clicking ytd-popup-container {
            opacity: 0 !important;
            pointer-events: none !important;
        }
    `);

    // === 核心邏輯：隱形點擊 (保持不變) ===
    async function executeInvisibleClick(threeDotButton) {
        document.body.classList.add('yt-proxy-clicking');
        try {
            threeDotButton.click();
            const saveItem = await waitForItem(TARGET_LABEL);
            if (saveItem) {
                saveItem.click();
            } else {
                threeDotButton.click();
                console.warn(`[YouTube Save Fix] Target item "${TARGET_LABEL}" not found.`);
            }
        } catch (e) {
            console.error('[YouTube Save Fix] Proxy execution failed:', e);
        } finally {
            setTimeout(() => {
                document.body.classList.remove('yt-proxy-clicking');
            }, 100);
        }
    }

    function waitForItem(text) {
        return new Promise((resolve) => {
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                const items = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
                for (let item of items) {
                    if (item.innerText.trim() === text) {
                        clearInterval(timer);
                        resolve(item);
                        return;
                    }
                }
                if (attempts > 50) {
                    clearInterval(timer);
                    resolve(null);
                }
            }, 20);
        });
    }

    // === UI 構建與防抖動處理 ===
    let initTimeout = null;

    function init() {
        // 1. 檢查容器是否存在，避免重複
        if (document.getElementById('my-save-button-container')) return;

        // 2. 尋找主要的選單渲染器
        const menuRenderer = document.querySelector('ytd-menu-renderer.style-scope.ytd-watch-metadata');
        if (!menuRenderer) return;

        // 3. 尋找三點選單按鈕 (作為定位點或觸發器)
        const threeDotButtonShape = menuRenderer.querySelector('yt-button-shape#button-shape');
        if (!threeDotButtonShape) return;

        const actualButton = threeDotButtonShape.querySelector('button');
        if (!actualButton) return;

        // 4. 建立容器與按鈕
        const container = document.createElement('div');
        container.id = 'my-save-button-container';

        const btn = document.createElement('button');
        // 使用原生 Class
        btn.className = 'my-native-btn yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--enable-backdrop-filter-experiment';
        btn.setAttribute('aria-label', TARGET_LABEL);
        // 確保樣式覆蓋
        btn.style.cursor = 'pointer';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';

        btn.innerHTML = `
            <div aria-hidden="true" class="yt-spec-button-shape-next__icon my-native-icon">
                <svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"></path></svg>
            </div>
            <div class="yt-spec-button-shape-next__button-text-content">
                <span class="yt-core-attributed-string yt-core-attributed-string--white-space-no-wrap" role="text">${TARGET_LABEL}</span>
            </div>
            <yt-touch-feedback-shape aria-hidden="true" class="yt-spec-touch-feedback-shape yt-spec-touch-feedback-shape--touch-response">
                <div class="yt-spec-touch-feedback-shape__stroke"></div>
                <div class="yt-spec-touch-feedback-shape__fill"></div>
            </yt-touch-feedback-shape>
        `;

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            executeInvisibleClick(actualButton);
        };

        container.appendChild(btn);

        // 5. 插入策略優化：
        // 嘗試插入到 top-level-buttons-computed (按讚/分享區) 的最後面
        // 這比直接插在三點選單旁更穩定，因為它是 Flex 容器，能更好地處理新增項目
        const topLevelButtons = menuRenderer.querySelector('#top-level-buttons-computed');
        if (topLevelButtons) {
            topLevelButtons.appendChild(container);
        } else {
            // 備用方案：插在三點選單之前
            menuRenderer.insertBefore(container, threeDotButtonShape);
        }
    }

    // === 監聽器優化：防抖動 (Debounce) ===
    // 防止在視窗縮放或 DOM 重繪時觸發無限迴圈
    const observer = new MutationObserver(() => {
        if (initTimeout) clearTimeout(initTimeout);
        
        // 只有當按鈕真的「不見了」才執行初始化，並延遲 100ms 執行
        // 如果這段時間內 YouTube 又動了 DOM，會重置計時器，避免衝突
        if (!document.getElementById('my-save-button-container')) {
            initTimeout = setTimeout(init, 100);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // 初次執行
    init();

})();