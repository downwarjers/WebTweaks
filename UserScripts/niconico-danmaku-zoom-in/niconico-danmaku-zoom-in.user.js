// ==UserScript==
// @name        Niconico Danmaku Canvas Scaler (with scaling context)
// @namespace    https://github.com/downwarjers/WebTweaks
// @version     1.1.3
// @description 調整 Niconico 動畫的彈幕大小。透過劫持 Canvas 的 `width`/`height` 屬性與 `getContext` 方法，提高渲染解析度，使彈幕字體相對變小/變清晰。支援快捷鍵調整縮放倍率（Shift + `+` / `-`）。
// @author      downwarjers
// @license     MIT
// @match       https://www.nicovideo.jp/watch/*
// @grant       none
// @downloadURL https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/niconico-danmaku-zoom-in/niconico-danmaku-zoom-in.user.js
// @updateURL   https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/niconico-danmaku-zoom-in/niconico-danmaku-zoom-in.user.js
// ==/UserScript==

(function () {
  'use strict';

  // 你想要的放大倍率（數值越大，字體看起來越小，因為繪圖緩衝區變大了）
  let scaleFactor = 2;
  const defaultScale = scaleFactor;

  // 用於保存原始的 canvas width/height 存取器與 context 資訊
  const originalProperties = new Map();

  /**
   * 檢查給定的 canvas 元素是否可能是 Niconico 的彈幕 canvas。
   * @param {HTMLCanvasElement} canvas
   * @returns {boolean}
   */
  function isLikelyDanmakuCanvas(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    // 針對你貼的 HTML：有 data-relingo-block 或在 data-name="comment" 底下
    if (canvas.hasAttribute('data-relingo-block')) return true;
    if (canvas.closest && canvas.closest('[data-name="comment"]')) return true;
    return false;
  }

  /**
   * 對單個 canvas 進行屬性劫持並調整解析度與繪圖上下文。
   * @param {HTMLCanvasElement} canvas
   */
  function scaleOne(canvas) {
    if (!isLikelyDanmakuCanvas(canvas)) {
      return;
    }

    // 如果已經處理過，且倍率相同，則直接跳過。
    if (
      originalProperties.has(canvas) &&
      originalProperties.get(canvas).scaleFactor === scaleFactor
    ) {
      return;
    }

    // 如果該 canvas 尚未被劫持，我們就進行劫持
    if (!originalProperties.has(canvas)) {
      const originalWidthProp = Object.getOwnPropertyDescriptor(
        HTMLCanvasElement.prototype,
        'width',
      );
      const originalHeightProp = Object.getOwnPropertyDescriptor(
        HTMLCanvasElement.prototype,
        'height',
      );
      const originalGetContext = HTMLCanvasElement.prototype.getContext;

      // 劫持 width 屬性
      Object.defineProperty(canvas, 'width', {
        get: function () {
          return originalWidthProp.get.call(this);
        },
        set: function (val) {
          originalWidthProp.set.call(this, val * scaleFactor);
        },
        configurable: true,
      });

      // 劫持 height 屬性
      Object.defineProperty(canvas, 'height', {
        get: function () {
          return originalHeightProp.get.call(this);
        },
        set: function (val) {
          originalHeightProp.set.call(this, val * scaleFactor);
        },
        configurable: true,
      });

      // 劫持 getContext 方法
      canvas.getContext = function (...args) {
        const context = originalGetContext.apply(this, args);
        if (context && args[0] === '2d') {
          context.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);
          // 為了確保後續操作不受影響，我們重新定義 setTransform
          const originalSetTransform = context.setTransform;
          context.setTransform = function (...transformArgs) {
            // 確保我們自己的縮放參數永遠在最前面
            const newTransformArgs = [
              transformArgs[0] * scaleFactor,
              transformArgs[1],
              transformArgs[2],
              transformArgs[3] * scaleFactor,
              transformArgs[4],
              transformArgs[5],
            ];
            originalSetTransform.apply(this, newTransformArgs);
          };
        }
        return context;
      };

      // 儲存原始的屬性描述符與方法
      originalProperties.set(canvas, {
        width: originalWidthProp,
        height: originalHeightProp,
        getContext: originalGetContext,
        scaleFactor: scaleFactor,
      });

      console.log('[DanmakuScaler] Hijacked canvas properties and context:', canvas);
    } else {
      // 如果已經劫持過，但倍率改變，我們只需要更新 context 的縮放
      const props = originalProperties.get(canvas);
      const context = canvas.getContext('2d');
      if (context) {
        // 恢復並重新設定縮放
        context.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);
      }
      props.scaleFactor = scaleFactor;
    }

    // 觸發一次 width/height 的設定來確保立刻生效
    const currentWidth = canvas.width;
    const currentHeight = canvas.height;
    canvas.width = currentWidth / scaleFactor;
    canvas.height = currentHeight / scaleFactor;

    console.log(`[DanmakuScaler] scaled canvas: factor ${scaleFactor}`);
  }

  /**
   * 掃描並處理所有可能的彈幕 canvas。
   */
  function scanAndScaleAll() {
    document.querySelectorAll('canvas').forEach((canvas) => scaleOne(canvas));
  }

  // 初次載入與 DOM 變動時觸發掃描
  window.addEventListener('load', () => setTimeout(scanAndScaleAll, 500));
  const mo = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          if (isLikelyDanmakuCanvas(node)) {
            scaleOne(node);
          }
          node.querySelectorAll('canvas').forEach((canvas) => scaleOne(canvas));
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // 快捷鍵：Shift + = / + 增大倍率 (字變更小)
  //         Shift + - 減小倍率 (字變更更大)
  //         Shift + 0 回復預設
  window.addEventListener('keydown', (e) => {
    if (!e.shiftKey) return;
    const oldScaleFactor = scaleFactor;
    if (e.key === '=' || e.key === '+') {
      scaleFactor = +(scaleFactor * 1.1).toFixed(3);
    } else if (e.key === '-' || e.key === '_') {
      scaleFactor = Math.max(1.0, +(scaleFactor / 1.1).toFixed(3));
    } else if (e.key === '0') {
      scaleFactor = defaultScale;
    } else {
      return;
    }

    if (oldScaleFactor !== scaleFactor) {
      console.log('[DanmakuScaler] scaleFactor ->', scaleFactor);
      scanAndScaleAll();
    }
  });
})();
