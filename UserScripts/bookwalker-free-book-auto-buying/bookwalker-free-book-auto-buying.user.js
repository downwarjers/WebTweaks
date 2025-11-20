// ==UserScript==
// @name         BOOKWALKER 跨頁面批量加入購物車 (自動過濾已購/已在購物車) - 全自動靜默結帳版
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.33.1
// @description  【V2.33】導入結帳後導航邏輯 (handlePostCheckoutNavigation)，修復 V2.32 結帳後跳轉首頁導致流程中斷的問題。
// @author       downwarjers
// @license      MIT
// @match        *://*.bookwalker.jp/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @run-at       document-start
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bookwalker-free-book-auto-buying/bookwalker-free-book-auto-buying.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bookwalker-free-book-auto-buying/bookwalker-free-book-auto-buying.user.js
// ==/UserScript==

/* global $, window, document, localStorage, sessionStorage, alert, location */

(function() {
    'use strict';

    // 儲存狀態 Key
    const BATCH_MODE_KEY = 'bw_batch_add_to_cart_enabled';
    const RETURN_URL_KEY = 'bw_batch_return_url';
    const CHECKOUT_MODE_KEY = 'bw_batch_checkout_mode';
    const TAB_LOCK_KEY = 'bw_master_tab_id';

    // 獲取或創建當前分頁的穩定 ID
    let TAB_SESSION_ID = sessionStorage.getItem('bw_stable_tab_id');
    if (!TAB_SESSION_ID) {
        TAB_SESSION_ID = Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem('bw_stable_tab_id', TAB_SESSION_ID);
    }
    const CURRENT_TAB_ID = TAB_SESSION_ID;

    // 選擇器與延遲
    const CART_BUTTON_SELECTOR = 'a.js-header-cart-button[data-action-label="view_cart"]';
    const CART_PATH_SEGMENTS = ['/member/cart/', '/app/03/abroad/shopping_cart'];
    const NEXT_PAGE_SELECTOR = 'li.o-pager-next > a.o-pager-box-btn';
    const SAFE_CLICK_DELAY_MS = 250;
    const PAGE_INIT_DELAY_MS = 800;
    const POST_CHECKOUT_DELAY_MS = 1500; // 結帳後跳轉的延遲

    // ===================================
    // 程式碼注入到主頁面環境 (Alert 覆寫)
    // ===================================

    function injectAlertOverride(key, urlKey, checkoutKey, cartBtnSelector) {
        if (!window.alert) return;
        const originalAlert = window.alert;
        const errorCartFull = 'カートの最大数(200件)を超過しました。';
        const warningAlreadyInCart = 'すでにカートに同じ商品が入っています。';
        window.alert = function(message) {
            try {
                if (message === errorCartFull) {
                    console.warn('[Main Context] Cart full detected. Switching to automatic checkout mode...');
                    // [V2.33] 關鍵點：在這裡儲存當前的商品列表頁 URL
                    localStorage.setItem(urlKey, window.location.href);
                    localStorage.setItem(checkoutKey, 'true');
                    const cartButton = document.querySelector(cartBtnSelector);
                    if (cartButton) {
                        cartButton.click();
                    } else {
                        window.location.href = 'https://bookwalker.jp/member/cart/';
                    }
                    return;
                }
                if (message === warningAlreadyInCart) {
                    console.log('[Main Context] Alert Suppressed: Already in cart.');
                    return;
                }
            } catch (e) {
                console.error('[Main Context] Error during custom alert handling:', e);
            }
            originalAlert(message);
        };
    }

    function injectScriptToMainContext(key, urlKey, checkoutKey, cartBtnSelector) {
        const script = document.createElement('script');
        script.textContent = `(${injectAlertOverride.toString()})('${key}', '${urlKey}', '${checkoutKey}', '${cartBtnSelector}');`;
        const isListPage = !CART_PATH_SEGMENTS.some(path => window.location.href.includes(path));
        if (isListPage) {
             (document.head || document.documentElement).prepend(script);
        }
    }

    injectScriptToMainContext(BATCH_MODE_KEY, RETURN_URL_KEY, CHECKOUT_MODE_KEY, CART_BUTTON_SELECTOR);

    // ===================================
    // 核心處理邏輯
    // ===================================

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // [V2.33] 邏輯與 V2.32 相同：點擊購買，然後讓網站自行導航
    async function startCheckoutProcess() {
        if (!window.jQuery) return;
        try {
            console.log('[Checkout Process] Starting automatic free checkout. Waiting for UI...');
            await delay(1500 * 4);

            const PRICE_SELECTORS = '.p-mu-cart-total__price-num, .m-edit-action-box__hl-price-num';
            const PURCHASE_BUTTON_SELECTOR = '.a-mu-large-r-btn--primary.forward[data-action-label="無料でもらう"]';

            const $priceElement = $(PRICE_SELECTORS).filter(':visible').first();
            const $purchaseButton = $(PURCHASE_BUTTON_SELECTOR).filter(':visible').first();

            const totalPrice = $priceElement.length > 0 ? $priceElement.text().trim() : '-1';

            if (totalPrice === '0') {
                if ($purchaseButton.length > 0) {
                    
                    // 1. 在點擊前移除 CHECKOUT_MODE，防止循環。
                    localStorage.removeItem(CHECKOUT_MODE_KEY);
                    // 2. (承 V2.31) 保留 BATCH_MODE, TAB_LOCK, RETURN_URL。

                    console.log('[Checkout Process] Price is 0. Clicking purchase and letting the site navigate.');
                    
                    // 3. 點擊購買按鈕。
                    $purchaseButton.click();
                    
                    // 4. 網站會自行導航 (通常到首頁或購買完成頁)
                    // 腳本在下一頁載入時，會由 runMainLogic 捕獲 (狀態 2)

                } else {
                    localStorage.removeItem(CHECKOUT_MODE_KEY);
                }
            } else if (totalPrice === '-1') {
                localStorage.removeItem(CHECKOUT_MODE_KEY);
            } else {
                alert(`❌ 購物車中有非免費商品 (總價：${totalPrice} 日圓)。請手動處理後，點擊批量加入按鈕繼續。`);
                localStorage.removeItem(CHECKOUT_MODE_KEY);
            }
        } catch (e) {
            console.error('[V2.33 Checkout Process] Fatal error caught:', e);
            localStorage.removeItem(CHECKOUT_MODE_KEY);
            alert('❌ 結帳流程發生嚴重錯誤，已停止自動化。請檢查控制台 (Console) 以獲取更多資訊。');
        }
    }


    async function startBatchProcess() {
        if (!window.jQuery) return;
        try {
            const isGloballyRunning = localStorage.getItem(BATCH_MODE_KEY) === 'true';
            const isThisTabMaster = localStorage.getItem(TAB_LOCK_KEY) === CURRENT_TAB_ID;

            if (!isGloballyRunning || !isThisTabMaster) {
                 return;
            }

            console.log('[Batch Cart Script] Starting stable batch processing...');

            let $allBooks = $('.m-tile .m-book-item');
            const bookElements = $allBooks.get();

            if (bookElements.length === 0) {
                await delay(PAGE_INIT_DELAY_MS);
                handleNextPage(0);
                return;
            }

            let successCount = 0;
            for (const element of bookElements) {
                if (localStorage.getItem(BATCH_MODE_KEY) !== 'true' || localStorage.getItem(TAB_LOCK_KEY) !== CURRENT_TAB_ID) {
                     return;
                }

                const $item = $(element);
                const isPurchased = $item.hasClass('purchased');
                const cartBtnElement = $item.find('a.a-icon-btn--cart:visible').get(0);

                if (cartBtnElement && !isPurchased) {
                    cartBtnElement.click();
                    successCount++;
                    await delay(SAFE_CLICK_DELAY_MS);
                }

                if (localStorage.getItem(CHECKOUT_MODE_KEY) === 'true') {
                     return;
                }
            }

            await delay(PAGE_INIT_DELAY_MS);
            handleNextPage(successCount);

        } catch (e) {
            console.error('[V2.33 Batch Process] Fatal error caught:', e);
            localStorage.removeItem(BATCH_MODE_KEY);
            localStorage.removeItem(TAB_LOCK_KEY);
            alert('❌ 批量加入購物車流程發生嚴重錯誤，已停止自動化。請檢查控制台 (Console) 以獲取更多資訊。');
        }
    }

    function handleNextPage(current_page_added_count) {
        if (!window.jQuery) return;
        if (localStorage.getItem(CHECKOUT_MODE_KEY) === 'true' || localStorage.getItem(TAB_LOCK_KEY) !== CURRENT_TAB_ID) {
            return;
        }

        const $nextPageLink = $(NEXT_PAGE_SELECTOR).not('.o-pager-box-btn_hidden');
        const nextHref = $nextPageLink.attr('href');
        const isNextPageValid = $nextPageLink.length > 0 && nextHref && nextHref !== location.href;

        if (isNextPageValid) {
            window.location.href = nextHref;
        } else {
            localStorage.removeItem(BATCH_MODE_KEY);
            localStorage.removeItem(CHECKOUT_MODE_KEY);
            localStorage.removeItem(RETURN_URL_KEY);
            localStorage.removeItem(TAB_LOCK_KEY);
            sessionStorage.removeItem('bw_stable_tab_id');

            console.log(`✅ 流程已全部完成！(本頁加入 ${current_page_added_count} 本)。正在返回 BookWalker 首頁。`);
            window.location.href = 'https://bookwalker.jp/';
        }
    }

    // [V2.33] 新增函式：處理結帳後的導航
    function handlePostCheckoutNavigation() {
        const returnUrl = localStorage.getItem(RETURN_URL_KEY);
        if (returnUrl) {
            console.log(`[V2.33 Post-Checkout] 偵測到結帳後返回。準備導航至: ${returnUrl}`);
            // 在導航前移除 Key，防止循環
            localStorage.removeItem(RETURN_URL_KEY);
            
            setTimeout(() => {
                window.location.href = returnUrl;
            }, POST_CHECKOUT_DELAY_MS);
        } else {
            // 理論上不應發生，但作為保險
            console.warn('[V2.33 Post-Checkout] 狀態錯誤，RETURN_URL_KEY 為空。');
            runNormalBatchLogic(); // 嘗試像正常頁面一樣執行
        }
    }

    // [V2.33] 新增函式：正常的批次處理啟動 (從 runMainLogic 拆分出來)
    function runNormalBatchLogic() {
        createToggleButton();

        const isGloballyRunning = localStorage.getItem(BATCH_MODE_KEY) === 'true';
        const isThisTabMaster = localStorage.getItem(TAB_LOCK_KEY) === CURRENT_TAB_ID;

        if (isGloballyRunning && isThisTabMaster) {
            setTimeout(startBatchProcess, PAGE_INIT_DELAY_MS);
        }
    }


    // ===================================
    // 介面建立與啟動邏輯
    // ===================================

    function createUIContainer() {
        if (!window.jQuery || !document.body) return null;
        if (document.getElementById('batch-cart-container')) {
            return document.getElementById('batch-cart-container');
        }

        const container = document.createElement('div');
        container.id = 'batch-cart-container';
        container.style.cssText = `
            position:fixed;
            bottom:20px;
            right:20px;
            background:rgba(0,0,0,0.8);
            color:#fff;
            padding:10px;
            border-radius:8px;
            z-index:999999;
            font-family:sans-serif;
            display: flex;
            gap: 10px;
        `;
        document.body.appendChild(container);
        return container;
    }


    function updateButtonDisplay(isRunning, buttonElement) {
        const btn = buttonElement || document.getElementById('batch-cart-button');
        if (!btn) return;

        btn.innerHTML = isRunning ? '停止 ❌' : '🚀 批量加入';
        btn.style.backgroundColor = isRunning ? '#E74C3C' : '#3498DB';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.padding = '8px 12px';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '14px';
        btn.style.fontWeight = 'bold';
    }


    function createToggleButton() {
        if (!window.jQuery) return;

        const isGloballyRunning = localStorage.getItem(BATCH_MODE_KEY) === 'true';
        const isThisTabMaster = localStorage.getItem(TAB_LOCK_KEY) === CURRENT_TAB_ID;
        const isCurrentlyRunning = isGloballyRunning && isThisTabMaster;

        if (document.getElementById('batch-cart-button')) {
            updateButtonDisplay(isCurrentlyRunning);
            return;
        }

        const container = createUIContainer();
        if (!container) return;

        const btn = document.createElement('button');
        btn.id = 'batch-cart-button';

        updateButtonDisplay(isCurrentlyRunning, btn);

        btn.onclick = function() {
            if (isThisTabMaster && isGloballyRunning) {
                // 停止
                localStorage.removeItem(BATCH_MODE_KEY);
                localStorage.removeItem(CHECKOUT_MODE_KEY);
                localStorage.removeItem(RETURN_URL_KEY);
                localStorage.removeItem(TAB_LOCK_KEY);
                sessionStorage.removeItem('bw_stable_tab_id');

                location.reload();
            } else {
                // 啟動
                localStorage.setItem(BATCH_MODE_KEY, 'true');
                localStorage.setItem(TAB_LOCK_KEY, CURRENT_TAB_ID);

                updateButtonDisplay(true, btn);

                setTimeout(startBatchProcess, PAGE_INIT_DELAY_MS);
            }
        };

        container.appendChild(btn);
    }

    function isCartPage() {
        return CART_PATH_SEGMENTS.some(path => location.href.includes(path));
    }

    // JQuery 載入輪詢機制
    function checkJQueryAndRun(maxChecks = 20, interval = 500) {
        if (window.jQuery) {
            console.log('[V2.33] jQuery detected. Proceeding to run main logic.');
            runMainLogic();
        } else if (maxChecks > 0) {
            setTimeout(() => checkJQueryAndRun(maxChecks - 1, interval), interval);
        } else {
            console.error('[V2.33] JQuery failed to load after timeout. Aborting script activation.');
        }
    }

    // [V2.33] 修改：主邏輯路由器
    function runMainLogic() {
        try {
            const isGloballyRunning = localStorage.getItem(BATCH_MODE_KEY) === 'true';
            const isCheckoutMode = localStorage.getItem(CHECKOUT_MODE_KEY) === 'true';
            const isThisTabMaster = localStorage.getItem(TAB_LOCK_KEY) === CURRENT_TAB_ID;
            const hasReturnUrl = localStorage.getItem(RETURN_URL_KEY) !== null;

            if (isCheckoutMode || (isGloballyRunning && isCartPage())) {
                // 狀態 1: 結帳模式，或在執行中進入了購物車
                console.log('[V2.33 Router] State 1: Entering Checkout Process.');
                startCheckoutProcess();
            } 
            else if (isGloballyRunning && isThisTabMaster && hasReturnUrl) {
                // 狀態 2: 剛結帳完 (不在購物車，但有 BATCH_MODE 和 RETURN_URL)
                // 這通常發生在網站導航到首頁或購買完成頁時
                console.log('[V2.33 Router] State 2: Post-Checkout navigation detected.');
                handlePostCheckoutNavigation();
            } 
            else {
                // 狀態 3: 正常頁面 (商品列表頁、或非執行中的首頁等)
                console.log('[V2.33 Router] State 3: Running normal batch logic.');
                runNormalBatchLogic();
            }

        } catch (e) {
            console.error('[V2.33 Main Logic] A fatal error occurred during startup:', e);
            localStorage.removeItem(BATCH_MODE_KEY);
            localStorage.removeItem(TAB_LOCK_KEY);
            localStorage.removeItem(CHECKOUT_MODE_KEY);
            localStorage.removeItem(RETURN_URL_KEY);
            alert('❌ 腳本啟動失敗。請確認瀏覽器控制台 (Console) 中的錯誤訊息並重新整理頁面。');
        }
    }

    // 程式主入口
    window.addEventListener('load', () => setTimeout(checkJQueryAndRun, 500));

})();