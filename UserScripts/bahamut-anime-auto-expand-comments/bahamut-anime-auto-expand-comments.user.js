// ==UserScript==
// @name         巴哈姆特留言板自動展開工具
// @namespace    https://github.com/downwarjers/WebTweaks
// @version      0.1.2
// @description  在巴哈姆特留言標題旁新增「全部展開」按鈕，支援遞迴展開歷史留言、子回覆、閱讀更多，並可切換是否自動開啟爭議折疊留言。
// @author       downwarjers
// @license      MIT
// @match        https://ani.gamer.com.tw/animeVideo.php?*
// @match        https://wall.gamer.com.tw/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bahamut-anime-auto-expand-comments/bahamut-anime-auto-expand-comments.user.js
// @updateURL    https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bahamut-anime-auto-expand-comments/bahamut-anime-auto-expand-comments.user.js

// ==/UserScript==

(function () {
  'use strict';

  // 讀取/儲存設定（預設為 true 開啟）
  const CONFIG_KEY_FOLDED = 'BAHA_AUTO_EXPAND_FOLDED';
  let autoExpandFolded = GM_getValue(CONFIG_KEY_FOLDED, true);

  // 註冊腳本選單指令
  function updateMenuCommand() {
    const statusText = autoExpandFolded ? '【已啟用】' : '【已停用】';
    GM_registerMenuCommand(`自動展開爭議折疊留言：${statusText}（點擊切換）`, () => {
      autoExpandFolded = !autoExpandFolded;
      GM_setValue(CONFIG_KEY_FOLDED, autoExpandFolded);
      alert(`已切換「自動展開爭議折疊留言」為：${autoExpandFolded ? '啟用' : '停用'}`);
      location.reload();
    });
  }
  updateMenuCommand();

  const sleep = (ms) => {
    return new Promise((resolve) => {
      return setTimeout(resolve, ms);
    });
  };

  // 處理被折疊的爭議留言模組
  async function handleFoldedComments() {
    if (!autoExpandFolded) {
      return;
    }

    // 鎖定具有 data-w-comment-folded 且包含「此留言已被折疊」的區塊
    const foldedItems = Array.from(
      document.querySelectorAll('.c-reply__item[data-w-comment-folded]'),
    ).filter((el) => {
      const foldNotice = el.querySelector('.reply-content.hide p');
      return (
        foldNotice && foldNotice.innerText.includes('此留言已被折疊') && el.offsetParent !== null
      );
    });

    for (const item of foldedItems) {
      const clickTarget = item.querySelector('.reply-content.hide');
      if (clickTarget) {
        clickTarget.click();
        await sleep(150);

        // 檢測並自動點擊彈出的確認 dialog
        const dialogConfirmBtn = document.querySelector(
          'dialog.anime_dialogify[open] button[type="submit"].btn-primary',
        );
        if (dialogConfirmBtn) {
          dialogConfirmBtn.click();
          await sleep(200);
        }
      }
    }
  }

  // 核心展開控制邏輯
  async function expandAllComments(btn) {
    btn.disabled = true;
    btn.style.cursor = 'not-allowed';
    btn.innerText = '正在展開中...';

    let hasMore = true;
    let retryCount = 0;
    const maxRetries = 3;

    while (hasMore) {
      // 1. 抓取「展開之前的留言」
      const moreMainComments = Array.from(
        document.querySelectorAll('[data-evt-morecomment]'),
      ).filter((el) => {
        return el.offsetParent !== null && el.innerText.includes('展開');
      });

      // 2. 抓取「展開 X 則回覆」
      const moreSubReplies = Array.from(document.querySelectorAll('[data-morereply]')).filter(
        (el) => {
          return el.offsetParent !== null && el.innerText.includes('展開');
        },
      );

      // 3. 抓取長文「......閱讀更多」
      const seeMoreTexts = Array.from(document.querySelectorAll('a.more-text')).filter((el) => {
        return el.offsetParent !== null && el.innerText.includes('閱讀更多');
      });

      const allButtons = [...moreMainComments, ...moreSubReplies, ...seeMoreTexts];

      if (allButtons.length > 0) {
        retryCount = 0;
        for (const target of allButtons) {
          target.click();
        }
        await sleep(800);
      } else {
        if (retryCount < maxRetries) {
          retryCount++;
          await sleep(500);
        } else {
          hasMore = false;
        }
      }

      // 4. 執行折疊留言解析模組
      await handleFoldedComments();
    }

    btn.innerText = '展開完畢';
    await sleep(2000);
    btn.innerText = '全部展開';
    btn.disabled = false;
    btn.style.cursor = 'pointer';
  }

  // 將按鈕掛載到留言板標題列
  function injectButton() {
    if (document.getElementById('baha-auto-expand-btn')) {
      return;
    }

    const navBlock = document.querySelector('.nav-segment-control-block');
    if (!navBlock) {
      return;
    }

    const expandBtn = document.createElement('button');
    expandBtn.id = 'baha-auto-expand-btn';
    expandBtn.innerText = '全部展開';
    expandBtn.type = 'button';

    Object.assign(expandBtn.style, {
      marginLeft: '12px',
      padding: '4px 12px',
      backgroundColor: '#00b4d8',
      color: '#ffffff',
      border: 'none',
      borderRadius: '4px',
      fontSize: '13px',
      fontWeight: 'bold',
      cursor: 'pointer',
      lineHeight: '1.5',
      alignSelf: 'center',
      transition: 'background-color 0.2s ease',
    });

    expandBtn.addEventListener('mouseenter', () => {
      if (!expandBtn.disabled) {
        expandBtn.style.backgroundColor = '#0096c7';
      }
    });
    expandBtn.addEventListener('mouseleave', () => {
      if (!expandBtn.disabled) {
        expandBtn.style.backgroundColor = '#00b4d8';
      }
    });

    expandBtn.addEventListener('click', () => {
      return expandAllComments(expandBtn);
    });

    navBlock.appendChild(expandBtn);
  }

  // 監聽 SPA / 動態 DOM 載入
  const observer = new MutationObserver(() => {
    const navBlock = document.querySelector('.nav-segment-control-block');
    if (navBlock && !document.getElementById('baha-auto-expand-btn')) {
      injectButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  injectButton();
})();
