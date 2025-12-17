// ==UserScript==
// @name         YouTube - Advanced Batch Channel Notifier (Dynamic Scroll)
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.2.1
// @description  在 YouTube 訂閱內容管理頁面新增控制面板，可批次將所有頻道的通知鈴鐺設定為「全部」、「個人化」或「無」。支援動態滾動載入 (Dynamic Scroll)，可自動處理長列表的訂閱頻道。
// @author       downwarjers
// @license      MIT
// @match        https://www.youtube.com/*
// @grant        GM_addStyle
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-notification-batch-setting/youtube-notification-batch-setting.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-notification-batch-setting/youtube-notification-batch-setting.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 全局變數 ---
    let isRunning = false;
    let globalStats = { processed: 0, skipped: 0, failed: 0, totalFound: 0 };
    const UI_CONTAINER_ID = 'yt-batch-notify-container';
    const BUTTON_ID = 'yt-batch-notify-btn';
    const SELECT_ID = 'yt-batch-notify-select';
    const STATUS_ID = 'yt-batch-notify-status';

    // 延遲函式 (模擬人類操作)
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 通知模式的定義
    const NOTIFICATION_MODES = {
        'All': {
            menuText: '所有通知',
            ariaLabelCheck: '接收所有通知'
        },
        'Personalized': {
            menuText: '個人化通知',
            ariaLabelCheck: '接收個人化通知'
        },
        'None': {
            menuText: '不接收通知',
            ariaLabelCheck: '不接收任何通知'
        }
    };

    // --- 核心處理函式 ---
    async function startProcessing() {
        if (isRunning) return;

        const targetModeKey = document.getElementById(SELECT_ID).value;
        const targetMode = NOTIFICATION_MODES[targetModeKey];

        if (!confirm(`【高風險操作警告】\n\n您即將開始批次修改 *所有* 訂閱頻道的通知設定。\n\n目標模式：【${targetMode.menuText}】\n\n- 腳本會自動向下滾動以載入所有頻道。\n- 腳本會動態等待新內容載入，最長 60 秒。\n- 您可以隨時點擊「停止」按鈕來中斷。\n\n確定要繼續嗎？`)) {
            return;
        }

        isRunning = true;
        globalStats = { processed: 0, skipped: 0, failed: 0, totalFound: 0 };
        updateUIState(true);

        try {
            // ** v2.2 變更：移除了 lastHeight 和 consecutiveScrollsWithNoNewChannels

            while (isRunning) {
                // 1. 找出所有尚未處理的頻道
                const channels = document.querySelectorAll('#grid-container ytd-channel-renderer:not([data-batch-processed="true"])');
                globalStats.totalFound = document.querySelectorAll('#grid-container ytd-channel-renderer').length;

                if (channels.length > 0) {
                    updateStatus(`找到 ${channels.length} 個新頻道... (總共 ${globalStats.totalFound})`);
                    await delay(1000);

                    // 2. 處理當前頁面載入的所有頻道
                    for (const channel of channels) {
                        if (!isRunning) break; // 檢查是否被中途停止

                        const channelName = channel.querySelector('#channel-title')?.textContent.trim() || '未知頻道';
                        updateStatus(`[${globalStats.processed + globalStats.skipped + 1}/${globalStats.totalFound}] 處理中: ${channelName}`);
                        
                        // 標記為已處理
                        channel.dataset.batchProcessed = 'true'; 

                        const bellButton = channel.querySelector('button[aria-label*="通知設定"]');
                        if (!bellButton) {
                            console.warn(`[${channelName}] 找不到鈴鐺按鈕，跳過。`);
                            globalStats.failed++;
                            continue;
                        }

                        const currentLabel = bellButton.getAttribute('aria-label') || '';

                        // 3. 判斷是否需要點擊
                        if (currentLabel.includes(targetMode.ariaLabelCheck)) {
                            console.log(`[${channelName}] 狀態已是「${targetMode.menuText}」，跳過。`);
                            globalStats.skipped++;
                        } else {
                            // 4. 執行點擊
                            try {
                                bellButton.click();
                                await delay(1200); // 等待選單彈出

                                const menuItem = findMenuItem(targetMode.menuText);

                                if (menuItem) {
                                    menuItem.click();
                                    console.log(`[${channelName}] -> 成功設定為「${targetMode.menuText}」。`);
                                    globalStats.processed++;
                                    await delay(1200); // 等待選單關閉
                                } else {
                                    console.error(`[${channelName}] -> 找不到「${targetMode.menuText}」選項！腳本可能已失效。`);
                                    globalStats.failed++;
                                    document.body.click(); // 嘗試關閉可能卡住的選單
                                    await delay(500);
                                }
                            } catch (error) {
                                console.error(`[${channelName}] 處理時發生錯誤:`, error);
                                globalStats.failed++;
                            }
                        }
                    } // end for loop (處理完一批)
                }

                if (!isRunning) break; // 處理完一批後檢查

                // 5. 滾動頁面並等待 (v2.2 核心變更)
                let currentHeight = document.documentElement.scrollHeight;
                
                // 檢查是否還有未處理的 (有時滾動前就已載入)
                const remainingChannels = document.querySelectorAll('#grid-container ytd-channel-renderer:not([data-batch-processed="true"])');
                if (remainingChannels.length === 0) {
                    // 確定都處理完了，才滾動
                    window.scrollTo(0, currentHeight);
                    
                    // 6. 使用新的動態等待函式
                    const hasNewContent = await waitForNewContent(currentHeight, 60000); // 60 秒超時

                    if (!hasNewContent) {
                        // waitForNewContent 返回 false (超時)
                        console.log('等待 60 秒後無新內容，判斷已達頁面底部。');
                        isRunning = false; // 停止
                    }
                    // 如果 hasNewContent 為 true，迴圈會繼續並在頂部找到新頻道
                }
                // 如果 (remainingChannels.length > 0)，迴圈會繼續處理它們，*不會*滾動
            }
        } catch (error) {
            console.error('批次處理主迴圈發生嚴重錯誤:', error);
            alert('腳本發生嚴重錯誤，請檢查控制台 (F12)。');
        } finally {
            console.log('批次處理結束。');
            updateUIState(false);
            updateStatus(`處理完成！ 成功: ${globalStats.processed} | 跳過: ${globalStats.skipped} | 失敗: ${globalStats.failed} (總共 ${globalStats.totalFound})`);
        }
    }

    // 停止函式
    function stopProcessing() {
        if (isRunning) {
            isRunning = false;
            console.log('使用者要求停止...');
            updateStatus('正在停止...');
            updateUIState(false, true); // 進入「停止中」狀態
        }
    }

    // 輔助函式：尋找彈出選單項目
    function findMenuItem(text) {
        const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer');
        for (const item of menuItems) {
            const itemText = item.querySelector('yt-formatted-string')?.textContent.trim();
            if (itemText === text) {
                return item;
            }
        }
        return null;
    }
    
    // --- 【新 v2.2】動態等待函式 ---
    /**
     * 等待新內容載入（頁面高度改變）或超時
     * @param {number} currentHeight - 滾動前的頁面高度
     * @param {number} timeout - 最大等待毫秒數
     * @returns {Promise<boolean>} - true (載入成功), false (超時)
     */
    async function waitForNewContent(currentHeight, timeout = 60000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const interval = setInterval(() => {
                const newHeight = document.documentElement.scrollHeight;
                const elapsedTime = Date.now() - startTime;

                if (newHeight > currentHeight) {
                    // 成功：新內容已載入
                    clearInterval(interval);
                    updateStatus('新內容已載入！');
                    resolve(true);
                } else if (elapsedTime >= timeout) {
                    // 失敗：超時
                    clearInterval(interval);
                    updateStatus(`等待 ${timeout / 1000} 秒後無新內容。`);
                    resolve(false);
                } else {
                    // 等待中...
                    updateStatus(`滾動頁面... 等待新內容... (${Math.floor(elapsedTime / 1000)}s / ${timeout / 1000}s)`);
                }
            }, 500); // 每 500ms 檢查一次
        });
    }

    // --- UI 相關函式 (與 v2.1 相同) ---
    function updateUIState(running, stopping = false) {
        const button = document.getElementById(BUTTON_ID);
        const select = document.getElementById(SELECT_ID);
        if (!button || !select) return;

        if (stopping) {
            button.textContent = '正在停止...';
            button.disabled = true;
            select.disabled = true;
        } else if (running) {
            button.textContent = '執行中... (點此停止)';
            button.disabled = false;
            select.disabled = true;
        } else {
            button.textContent = '開始批次設定';
            button.disabled = false;
            select.disabled = false;
        }
    }

    function updateStatus(message) {
        const statusLabel = document.getElementById(STATUS_ID);
        if (statusLabel) {
            statusLabel.textContent = message;
        }
    }

    function toggleProcessing() {
        if (isRunning) {
            stopProcessing();
        } else {
            startProcessing();
        }
    }

    // 建立控制面板
    function createControlPanel() {
        if (document.getElementById(UI_CONTAINER_ID)) return;

        const container = document.createElement('div');
        container.id = UI_CONTAINER_ID;
        container.innerHTML = `
            <div class="control-header">批次通知設定 (v2.2)</div>
            <label for="${SELECT_ID}">目標模式：</label>
            <select id="${SELECT_ID}">
                <option value="None" selected>不接收通知</option>
                <option value="Personalized">個人化通知</option>
                <option value="All">所有通知</option>
            </select>
            <button id="${BUTTON_ID}">開始批次設定</button>
            <div id="${STATUS_ID}">狀態：待命中</div>
        `;

        document.body.appendChild(container);
        document.getElementById(BUTTON_ID).addEventListener('click', toggleProcessing);
    }
    
    // 移除控制面板
    function removeControlPanel() {
        const panel = document.getElementById(UI_CONTAINER_ID);
        if (panel) {
            panel.remove();
        }
        if (isRunning) {
            stopProcessing();
        }
    }

    // --- 樣式 (與 v2.1 相同) ---
    GM_addStyle(`
        #${UI_CONTAINER_ID} {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            background-color: #282828;
            color: white;
            border: 1px solid #555;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.4);
            font-family: 'YouTube Noto', 'Roboto', 'Arial', sans-serif;
            font-size: 14px;
        }
        #${UI_CONTAINER_ID} .control-header {
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 10px;
            border-bottom: 1px solid #555;
            padding-bottom: 5px;
        }
        #${UI_CONTAINER_ID} label {
            margin-right: 5px;
        }
        #${UI_CONTAINER_ID} select, #${UI_CONTAINER_ID} button {
            background-color: #3f3f3f;
            color: white;
            border: 1px solid #777;
            border-radius: 4px;
            padding: 5px 8px;
            margin-right: 10px;
            cursor: pointer;
        }
        #${UI_CONTAINER_ID} button:hover {
            background-color: #555;
        }
        #${UI_CONTAINER_ID} button:disabled {
            background-color: #777;
            color: #aaa;
            cursor: not-allowed;
        }
        #${STATUS_ID} {
            margin-top: 10px;
            font-size: 12px;
            color: #ccc;
        }
    `);

    // --- 主執行邏輯 (與 v2.1 相同) ---
    function checkPageAndTogglePanel() {
        if (window.location.href === 'https://www.youtube.com/feed/channels') {
            const observer = new MutationObserver((mutations, obs) => {
                if (document.querySelector('#grid-container')) {
                    createControlPanel();
                    obs.disconnect();
                }
            });
            if (document.querySelector('#grid-container')) {
                 createControlPanel();
            } else {
                observer.observe(document.body, { childList: true, subtree: true });
            }
        } else {
            removeControlPanel();
        }
    }

    document.addEventListener('yt-navigate-finish', checkPageAndTogglePanel);
    checkPageAndTogglePanel(); // 首次載入時也執行一次

})();