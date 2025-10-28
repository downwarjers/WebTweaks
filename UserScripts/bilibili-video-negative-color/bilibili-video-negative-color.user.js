// ==UserScript==
// @name         Bilibili Video Fix Negative Color
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      1.3.1
// @description  Bilibili影片負片反轉，並將開關整合到播放器「其他設置」中
// @author       downwarjers
// @license      MIT
// @match        *://www.bilibili.com/*
// @grant        none
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/UserScripts/main/bilibili-video-negative-color/bilibili-video-negative-color.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/UserScripts/main/bilibili-video-negative-color/bilibili-video-negative-color.user.js
// ==/UserScript==

(function () {
    'use strict';

    // 1. 注入 CSS 樣式
    const style = document.createElement('style');
    style.textContent = `
        /* 影片反轉的樣式 */
        .bpx-player-container.video-is-inverted video {
            filter: invert(100%) hue-rotate(180deg) saturate(120%);
        }
    `;
    document.head.appendChild(style);

    /**
     * 創建「反轉顏色」的 Checkbox 元素
     * @param {Element} playerContainer - 播放器容器
     * @param {Element} anchorElement - "关灯模式" 的 <div> 元素 (作為複製模板)
     * @returns {Element}
     */
    function createInvertCheckbox(playerContainer, anchorElement) {
        // 深度複製 "关灯模式" 節點，以繼承所有樣式與結構
        const newCheckbox = anchorElement.cloneNode(true);

        // 修改 class，移除 'bpx-player-ctrl-setting-lightoff'
        // 並加上我們自己的標記 'my-invert-checkbox'
        newCheckbox.classList.remove('bpx-player-ctrl-setting-lightoff');
        newCheckbox.classList.add('my-invert-checkbox');

        // 找到內部的 <input>
        const input = newCheckbox.querySelector('.bui-checkbox-input');
        if (input) {
            input.setAttribute('aria-label', '反轉顏色');
            
            // 檢查當前狀態並設定
            const isCurrentlyInverted = playerContainer.classList.contains('video-is-inverted');
            input.checked = isCurrentlyInverted;

            // 綁定 change 事件
            input.addEventListener('change', (e) => {
                playerContainer.classList.toggle('video-is-inverted', e.target.checked);
            });
        }
        
        // 找到 <label> 中的文字並修改
        const text = newCheckbox.querySelector('.bui-checkbox-name');
        if (text) {
            text.textContent = '反轉顏色';
        }

        return newCheckbox;
    }

    /**
     * 嘗試將開關注入
     * @param {Element} lightOffCheckbox - 偵測到的 "关灯模式" 的 <div> 元素
     */
    function injectCheckbox(lightOffCheckbox) {
        
        // 1. 檢查是否已經注入 (避免重複)
        if (lightOffCheckbox.nextElementSibling && lightOffCheckbox.nextElementSibling.classList.contains('my-invert-checkbox')) {
            return;
        }

        // 2. 找到播放器容器
        const playerContainer = lightOffCheckbox.closest('.bpx-player-container');
        if (!playerContainer) return;

        // 3. 創建新開關
        const invertCheckbox = createInvertCheckbox(playerContainer, lightOffCheckbox);

        // 4. 插入到 "关灯模式" 之後
        lightOffCheckbox.after(invertCheckbox);
    }

    // --- 啟動 MutationObserver ---
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    // 確保是 Element 節點
                    if (node.nodeType !== 1) return;
                    
                    // 錨點：「关灯模式」的 class
                    const selector = '.bpx-player-ctrl-setting-lightoff';

                    // 情況 A: 被加入的節點 *就是* 錨點
                    if (node.matches && node.matches(selector)) {
                        injectCheckbox(node);
                    }
                    // 情況 B: 被加入的節點 *包含* 錨點
                    else if (node.querySelector) {
                        const checkboxElement = node.querySelector(selector);
                        if (checkboxElement) {
                            injectCheckbox(checkboxElement);
                        }
                    }
                });
            }
        }
    });

    // 開始監視
    observer.observe(document.body, { childList: true, subtree: true });

})();