// ==UserScript==
// @name         YouTube 影片儲存按鈕強制顯示
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.2
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

    // Config: Target menu item label (L10n sensitive)
    const TARGET_LABEL = "儲存";

    /**
     * Inject custom CSS styles.
     * Strategy:
     * 1. Use `display: contents` on container to flatten DOM hierarchy, ensuring correct Flexbox behavior in parent `ytd-menu-renderer`.
     * 2. Apply `margin` directly to the button for spacing alignment.
     * 3. Define `.yt-proxy-clicking` state for invisible menu interaction (Ghost Mode).
     */
    GM_addStyle(`
        /* Container Flattening: Bypass flex container encapsulation issues */
        #my-save-button-container {
            display: contents !important;
        }

        /* Spacing Fix: Align with native action buttons (Share/Download) */
        #my-save-button-container .my-native-btn {
            margin-left: 8px !important;
            margin-right: 8px !important;
            cursor: pointer;
        }

        /* Icon Normalization */
        .my-native-icon svg {
            width: 24px;
            height: 24px;
            display: block;
            fill: currentColor;
            pointer-events: none;
        }

        /* Ghost Mode: Hide popup container during programmatic interaction */
        body.yt-proxy-clicking ytd-popup-container {
            opacity: 0 !important;
            pointer-events: none !important;
        }
    `);

    /**
     * Core Logic: Proxy Click Handler
     * Simulates user interaction by opening the menu, finding the target item, and clicking it.
     * Uses CSS opacity hack to prevent UI flickering (Silent Execution).
     *
     * @param {HTMLElement} threeDotButton - The actual DOM element of the overflow menu trigger.
     */
    async function executeInvisibleClick(threeDotButton) {
        // Step 1: Enable Ghost Mode
        document.body.classList.add('yt-proxy-clicking');

        try {
            // Step 2: Trigger Menu Open (Hydrates the lazy-loaded menu DOM)
            threeDotButton.click();

            // Step 3: Poll for target item (Race condition handling)
            const saveItem = await waitForItem(TARGET_LABEL);

            if (saveItem) {
                // Step 4: Dispatch real click event to trigger internal Polymer/YouTube logic
                saveItem.click();
            } else {
                // Fallback: Close menu if target not found to reset state
                threeDotButton.click();
                console.warn(`[YouTube Save Fix] Target item "${TARGET_LABEL}" not found in overflow menu.`);
            }
        } catch (e) {
            console.error('[YouTube Save Fix] Proxy execution failed:', e);
        } finally {
            // Step 5: Cleanup - Restore UI visibility with slight delay for animation clearance
            setTimeout(() => {
                document.body.classList.remove('yt-proxy-clicking');
            }, 100);
        }
    }

    /**
     * Utility: DOM Polling
     * Waits for the lazy-loaded menu item to appear in the DOM.
     *
     * @param {string} text - Inner text to match.
     * @returns {Promise<HTMLElement|null>}
     */
    function waitForItem(text) {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50; // Timeout ~1000ms
            const interval = 20;

            const timer = setInterval(() => {
                attempts++;
                // Query selectors for both standard menu items and new polymer paper items
                const items = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');

                for (let item of items) {
                    if (item.innerText.trim() === text) {
                        clearInterval(timer);
                        resolve(item);
                        return;
                    }
                }

                if (attempts > maxAttempts) {
                    clearInterval(timer);
                    resolve(null);
                }
            }, interval);
        });
    }

    /**
     * UI Component Factory
     * Injects the proxy button into the DOM using YouTube's native classes for identical look-and-feel.
     */
    function init() {
        // 1. Validate Context: Ensure we are in the video metadata section
        const menuRenderer = document.querySelector('ytd-menu-renderer.style-scope.ytd-watch-metadata');
        if (!menuRenderer) return;

        // 2. Idempotency Check: Prevent duplicate injection
        if (document.getElementById('my-save-button-container')) return;

        // 3. Locate Anchor: The overflow menu button (three-dots)
        const threeDotButtonShape = menuRenderer.querySelector('yt-button-shape#button-shape');
        if (!threeDotButtonShape) return;

        // 4. Reference Check: Ensure the actual button element exists
        const actualButton = threeDotButtonShape.querySelector('button');
        if (!actualButton) return;

        // 5. Construct DOM
        const container = document.createElement('div');
        container.id = 'my-save-button-container';

        const btn = document.createElement('button');
        // Apply native classes for Tonal Button style (Gray background, rounded, no border)
        btn.className = 'my-native-btn yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--enable-backdrop-filter-experiment';
        btn.setAttribute('aria-label', TARGET_LABEL);

        // Mimic native DOM structure: Icon Wrapper + Text Content + Touch Ripple
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

        // 6. Event Binding
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            executeInvisibleClick(actualButton);
        };

        // 7. Injection: Insert before the overflow menu
        container.appendChild(btn);
        menuRenderer.insertBefore(container, threeDotButtonShape);
    }

    // === Main Entry Point ===
    // Observe DOM mutations to handle YouTube's SPA navigation (soft reloads)
    const observer = new MutationObserver(() => {
        if (!document.getElementById('my-save-button-container')) {
            init();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial run
    init();

})();