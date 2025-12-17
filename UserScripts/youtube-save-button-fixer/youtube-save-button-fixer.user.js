// ==UserScript==
// @name         YouTube 影片儲存按鈕強制顯示
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.1
// @description  強制在 YouTube 影片操作列顯示「儲存」（加入播放清單）按鈕。當視窗縮放導致按鈕被收入「...」選單時，自動複製並生成一個獨立的按鈕置於操作列上。
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

    const MY_BTN_LABEL = "儲存";
    const CONTAINER_ID = 'my-save-button-container';
    const TARGET_CONTAINER_SELECTOR = '#flexible-item-buttons';

    const NATIVE_BTN_SELECTORS = [
        'button[aria-label="儲存至播放清單"]',
        'button[aria-label="Save to playlist"]'
    ];

    // === CSS ===
    GM_addStyle(`
        #${CONTAINER_ID} {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            position: relative;
            flex: 0 0 auto; 
            margin-left: 8px;
        }
        #${CONTAINER_ID} button svg {
            width: 24px;
            height: 24px;
            display: block;
            fill: currentColor;
            pointer-events: none;
        }
        body.yt-proxy-clicking ytd-popup-container {
            opacity: 0 !important;
            pointer-events: none !important;
        }
    `);

    // === 隱形點擊邏輯 ===
    async function executeInvisibleClick(threeDotButton) {
        document.body.classList.add('yt-proxy-clicking');
        try {
            threeDotButton.click();
            const saveItem = await waitForItem(MY_BTN_LABEL);
            if (saveItem) {
                saveItem.click();
            } else {
                threeDotButton.click();
            }
        } catch (e) {
            console.error('[YouTube Save Fix] Error:', e);
        } finally {
            setTimeout(() => {
                document.body.classList.remove('yt-proxy-clicking');
            }, 200);
        }
    }

    function waitForItem(text) {
        return new Promise((resolve) => {
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                const items = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item, yt-formatted-string');
                for (let item of items) {
                    if (item.innerText && item.innerText.trim() === text) {
                        clearInterval(timer);
                        resolve(item.closest('ytd-menu-service-item-renderer') || item.closest('tp-yt-paper-item') || item);
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

    // === 建立按鈕 DOM ===
    function createMyButton(flexibleContainer) {
        const menuRenderer = flexibleContainer.closest('ytd-menu-renderer');
        if (!menuRenderer) return null;

        const threeDotButtonShape = menuRenderer.querySelector('yt-button-shape#button-shape button');
        if (!threeDotButtonShape) return null;

        const refButton = flexibleContainer.querySelector('button');
        if (!refButton) return null;

        const clonedBtn = refButton.cloneNode(true);
        clonedBtn.id = '';
        clonedBtn.removeAttribute('title');
        clonedBtn.setAttribute('aria-label', MY_BTN_LABEL);
        
        const iconContainer = clonedBtn.querySelector('.yt-spec-button-shape-next__icon') || clonedBtn.querySelector('yt-icon');
        if (iconContainer) {
            iconContainer.innerHTML = `
                <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" class="style-scope yt-icon" style="pointer-events: none; display: block; width: 100%; height: 100%;">
                    <path d="M19 2H5a2 2 0 00-2 2v16.887c0 1.266 1.382 2.048 2.469 1.399L12 18.366l6.531 3.919c1.087.652 2.469-.131 2.469-1.397V4a2 2 0 00-2-2ZM5 20.233V4h14v16.233l-6.485-3.89-.515-.309-.515.309L5 20.233Z"></path>
                </svg>`;
        }

        const textContainer = clonedBtn.querySelector('.yt-spec-button-shape-next__button-text-content') || clonedBtn.querySelector('div[class*="text-content"]');
        if (textContainer) {
            textContainer.innerText = MY_BTN_LABEL;
        }

        clonedBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            executeInvisibleClick(threeDotButtonShape);
        };

        const container = document.createElement('div');
        container.id = CONTAINER_ID;
        container.appendChild(clonedBtn);
        return container;
    }

    // === 主邏輯：檢查並切換 ===
    function checkAndToggle() {
        const flexibleContainer = document.querySelector(TARGET_CONTAINER_SELECTOR);
        if (!flexibleContainer) return;

        // 1. 尋找原生按鈕 (只在 flexible-item-buttons 容器內找)
        let nativeBtn = null;
        for (const selector of NATIVE_BTN_SELECTORS) {
            const found = flexibleContainer.querySelector(selector);
            if (found) {
                nativeBtn = found;
                break;
            }
        }

        // 2. 判斷原生按鈕狀態
        // 如果 nativeBtn 存在於 DOM 且 offsetParent 不為 null，代表它「在場上」
        const isNativeVisible = (nativeBtn && nativeBtn.offsetParent !== null);

        // 3. 處理自製按鈕
        let myContainer = document.getElementById(CONTAINER_ID);

        if (isNativeVisible) {
            // 原生按鈕在 -> 隱藏自製
            if (myContainer && myContainer.style.display !== 'none') {
                myContainer.style.display = 'none';
            }
        } else {
            // 原生按鈕不在 (被擠走了) -> 顯示自製
            if (!myContainer) {
                myContainer = createMyButton(flexibleContainer);
                if (myContainer) {
                    // 插在 flexibleContainer 後面
                    if (flexibleContainer.nextSibling) {
                        flexibleContainer.parentNode.insertBefore(myContainer, flexibleContainer.nextSibling);
                    } else {
                        flexibleContainer.parentNode.appendChild(myContainer);
                    }
                }
            } else {
                if (myContainer.style.display !== 'flex') {
                    myContainer.style.display = 'flex';
                }
            }
        }
    }

    // === 智慧監聽器管理 ===
    
    let currentObservedContainer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    function attachObservers() {
        const flexibleContainer = document.querySelector(TARGET_CONTAINER_SELECTOR);
        
        // 如果容器還沒出現，或者已經對這個容器掛過監聽了，就跳過
        if (!flexibleContainer || flexibleContainer === currentObservedContainer) return;

        // 清除舊的 (以防換頁後 DOM 殘留)
        if (resizeObserver) resizeObserver.disconnect();
        if (mutationObserver) mutationObserver.disconnect();

        currentObservedContainer = flexibleContainer;

        // 1. ResizeObserver: 監聽容器寬度變化 (視窗縮放時觸發)
        resizeObserver = new ResizeObserver(() => {
            // 這裡不 debounce，追求即時性
            checkAndToggle();
        });
        resizeObserver.observe(flexibleContainer);

        // 2. MutationObserver: 監聽容器內容變化 (YouTube 把按鈕移進移出時觸發)
        mutationObserver = new MutationObserver(() => {
            checkAndToggle();
        });
        mutationObserver.observe(flexibleContainer, { childList: true, subtree: true });

        console.log('[YouTube Save Fix] 已鎖定按鈕容器，啟動即時監聽');
        
        // 掛載後立刻檢查一次
        checkAndToggle();
    }

    // === 全域監聽 (負責初始化與 SPA 換頁偵測) ===
    
    // 用來偵測 flexible-item-buttons 何時出現在 DOM 中
    const globalObserver = new MutationObserver(() => {
        attachObservers();
        // 額外保險：如果已經掛載了，但某些非容器內的變動發生，也檢查一下
        if (currentObservedContainer) {
            checkAndToggle();
        }
    });

    globalObserver.observe(document.body, { childList: true, subtree: true });
    
    // 初始化
    setTimeout(attachObservers, 500);
    window.addEventListener('yt-navigate-finish', () => {
        currentObservedContainer = null; // 重置狀態
        setTimeout(attachObservers, 500);
    });

})();