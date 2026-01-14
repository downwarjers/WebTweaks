// ==UserScript==
// @name         Gemini 網址提示詞
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      2.2.1
// @description  自動化 Gemini 輸入與發送工具。支援透過 URL 參數自動填入指令、強制切換至新對話視窗、自動切換模型（如 Pro）、開啟臨時對話模式。內建 UI 遮罩以防止誤觸
// @author       downwarjers
// @license      MIT
// @match        https://gemini.google.com/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/gemini-url-prompt/gemini-url-prompt.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/gemini-url-prompt/gemini-url-prompt.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==========================================
  // [設定區]
  // ==========================================
  const CONFIG = {
    defaultModel: null,
    defaultTemp: false,
    sendDelay: 800,
    storageKey: 'gemini_auto_prompt_pending',
  };

  const INPUT_SELECTORS = [
    'rich-textarea > div[contenteditable="true"]',
    'div[contenteditable="true"]',
    '[role="textbox"]',
  ];

  // 新增：側邊欄與選單相關選擇器
  const UI_SELECTORS = {
    menuButton: 'button[data-test-id="side-nav-menu-button"]', // 主選單展開按鈕
    tempChatBtn: 'button[data-test-id="temp-chat-button"]', // 臨時對話按鈕
    sideNav: 'side-nav', // 側邊欄容器
  };

  // ==========================================
  // [核心工具函數]
  // ==========================================
  const sleep = (ms) => {
    return new Promise((r) => {
      return setTimeout(r, ms);
    });
  };

  const UI = {
    overlayId: 'gemini-auto-overlay',
    show: (message) => {
      let overlay = document.getElementById(UI.overlayId);
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = UI.overlayId;
        Object.assign(overlay.style, {
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'white',
          fontSize: '24px',
          fontFamily: 'sans-serif',
          pointerEvents: 'all',
          backdropFilter: 'blur(2px)',
        });
        document.body.appendChild(overlay);
      }
      overlay.innerText = `🤖 ${message}`;
      overlay.style.display = 'flex';
    },
    hide: () => {
      const overlay = document.getElementById(UI.overlayId);
      if (overlay) {
        overlay.style.display = 'none';
      }
    },
  };

  async function waitForInputBox(timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const selector of INPUT_SELECTORS) {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) {
          return el;
        }
      }
      await sleep(500);
    }
    return null;
  }

  function getElementByXpath(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue;
  }

  function simulateInput(element, text) {
    element.focus();
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    const p = document.createElement('p');
    p.textContent = text;
    element.appendChild(p);
    ['input', 'change', 'keydown', 'keyup'].forEach((type) => {
      element.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  // ==========================================
  // [邏輯處理]
  // ==========================================

  /**
   * 修改後的臨時對話處理函數
   * 增加：自動檢查並展開側邊欄
   */
  async function doTempChat(enable) {
    if (!enable) {
      return;
    }

    UI.show('正在準備臨時對話...');

    // 1. 檢查臨時對話按鈕是否可見
    let tempBtn = document.querySelector(UI_SELECTORS.tempChatBtn);

    // 2. 如果找不到按鈕或按鈕被隱藏，嘗試點擊主選單按鈕
    if (!tempBtn || tempBtn.offsetParent === null) {
      console.log('[AutoPrompt] 側邊欄似乎已收合，正在嘗試展開...');
      const menuBtn = document.querySelector(UI_SELECTORS.menuButton);
      if (menuBtn) {
        menuBtn.click();
        await sleep(600); // 等待側邊欄展開動畫
        tempBtn = document.querySelector(UI_SELECTORS.tempChatBtn);
      }
    }

    // 3. 執行點擊臨時對話
    if (tempBtn) {
      UI.show('開啟臨時對話模式...');
      tempBtn.click();
      await sleep(500);
    } else {
      console.warn('[AutoPrompt] 無法找到臨時對話按鈕，跳過此步驟');
    }
  }

  // 模型切換函數 (維持原樣)
  async function doModelSwitch(targetModel) {
    if (!targetModel) {
      return;
    }
    const switchBtn = document.querySelector('.input-area-switch');
    if (!switchBtn || switchBtn.innerText.includes(targetModel)) {
      return;
    }

    UI.show(`切換模型至 ${targetModel}...`);
    switchBtn.click();
    await sleep(500);

    const optionXpath = `//div[@role="menu"]//*[contains(text(), "${targetModel}")] | //mat-option//*[contains(text(), "${targetModel}")]`;
    const targetOption = getElementByXpath(optionXpath);

    if (targetOption) {
      targetOption.click();
      await sleep(800);
    } else {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }
  }

  // 參數解析與跳轉邏輯 (維持原樣)
  function getTaskParams() {
    const pendingStr = sessionStorage.getItem(CONFIG.storageKey);
    if (pendingStr) {
      sessionStorage.removeItem(CONFIG.storageKey);
      return JSON.parse(pendingStr);
    }
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    if (!params.has('prompt')) {
      return null;
    }
    return {
      prompt: params.get('prompt'),
      model: params.get('model') || CONFIG.defaultModel,
      isTemp: params.has('temp')
        ? params.get('temp') === 'true' || params.get('temp') === '1'
        : CONFIG.defaultTemp,
      forceNew: params.get('new') === 'true',
    };
  }

  function handleRedirectIfNeeded(settings) {
    if (settings.forceNew && window.location.pathname !== '/app') {
      sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(settings));
      UI.show('正在切換至新對話...');
      setTimeout(() => {
        window.location.href = 'https://gemini.google.com/app';
      }, 500);
      return true;
    }
    return false;
  }

  // ==========================================
  // [主流程]
  // ==========================================
  async function main() {
    const settings = getTaskParams();
    if (!settings) {
      return;
    }

    if (handleRedirectIfNeeded(settings)) {
      return;
    }

    try {
      UI.show('Gemini 自動化執行中...');

      // 執行順序：側邊欄/臨時對話 -> 模型切換 -> 輸入
      await doTempChat(settings.isTemp);
      await doModelSwitch(settings.model);

      const inputBox = await waitForInputBox();
      if (inputBox) {
        UI.show('正在輸入 Prompt...');
        simulateInput(inputBox, settings.prompt);
        await sleep(CONFIG.sendDelay);

        const sendButton = document.querySelector(
          'button[aria-label*="Send"], button[aria-label*="傳送"]',
        );
        if (sendButton && !sendButton.disabled) {
          UI.show('發送中...');
          sendButton.click();
          if (window.location.hash.includes('prompt=')) {
            history.replaceState(null, null, ' ');
          }
        }
      }
    } catch (e) {
      console.error('[AutoPrompt] Error:', e);
      UI.show('發生錯誤');
      await sleep(2000);
    } finally {
      UI.hide();
    }
  }

  setTimeout(main, 1000);
})();
