# WebTweaks

這裡整理了 `WebTweaks` 專案中的所有 UserScripts (使用者腳本) 與 UserStyles (使用者樣式)，方便快速安裝與檢索。

## 📂 UserScripts (腳本)

### ACGSecrets Bangumi 分類抓取
* **資料夾名稱**: `acgsecrets-bangumi-copy`
* **說明**: 針對 ACGSecrets.hk 網站，依據作品標籤（如「續作」、「新作」、「家長指引」）與名稱規則（正則表達式判斷季數、篇章），將新番列表自動分類為八大類。在頁面右下角提供「複製分類結果」與「下載 txt」按鈕。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/acgsecrets-bangumi-copy/acgsecrets-bangumi-copy.user.js)

### 巴哈姆特 - 自動關閉簽到視窗
* **資料夾名稱**: `auto-close-baha-sign-window`
* **說明**: 自動偵測並關閉巴哈姆特（gamer.com.tw）進入時彈出的每日簽到視窗 (`dialogify_1`)。使用 `MutationObserver` 監聽 DOM 變化，發現關閉按鈕時自動觸發點擊。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-close-baha-sign-window/auto-close-baha-sign-window.user.js)

### Auto Mobile→Desktop Redirect (Enhanced)
* **資料夾名稱**: `auto-redirect-to-desktop-web`
* **說明**: 當訪問手機版網頁（如 `m.`, `mobile.` 開頭或包含 `/mobile/` 路徑）時，自動嘗試跳轉回桌面版網址。內建防無限迴圈機制（檢查 Referrer 與 SessionStorage 計數），避免在只有手機版的網站上卡死。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-redirect-to-desktop-web/auto-redirect-to-desktop-web.user.js)

### Bilibili Video Fix Negative Color
* **資料夾名稱**: `bilibili-video-negative-color`
* **說明**: 解決 Bilibili 影片顏色異常或提供負片效果。在播放器的「設定」選單（關燈模式旁）新增「反轉顏色」開關。透過注入 CSS `filter: invert(100%) hue-rotate(180deg)` 實現畫面反轉。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bilibili-video-negative-color/bilibili-video-negative-color.user.js)

### BOOKWALKER 跨頁面批量加入購物車
* **資料夾名稱**: `bookwalker-free-book-auto-buying`
* **說明**: 自動化處理 BookWalker 免費書籍領取。支援跨頁面批量將書籍加入購物車，自動過濾已購買書籍。包含「全自動靜默結帳」功能，遇到購物車滿額（200本）時會自動觸發結帳流程，並在完成後返回原頁面繼續執行。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bookwalker-free-book-auto-buying/bookwalker-free-book-auto-buying.user.js)

### Disp.cc PTT 網址自動跳轉
* **資料夾名稱**: `disp-bbs-redirect-to-pttweb`
* **說明**: 瀏覽 Disp.cc 時，若文章來源顯示為 PTT (`ptt.cc`)，點擊該連結會自動轉址到 `pttweb.cc` (網頁版 PTT 備份站)，避免 PTT 原站的年齡驗證阻擋。精確比對「※ 文章網址:」文字，確保只針對文章底部的來源連結進行處理。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/disp-bbs-redirect-to-pttweb/disp-bbs-redirect-to-pttweb.user.js)

### GameWith ウマ娘 選擇資料匯出
* **資料夾名稱**: `gamewith-umamusume-data-copy`
* **說明**: 在 GameWith 賽馬娘攻略網頁上，抓取使用者勾選的資料（如因子、支援卡），依據 H2 標題進行分類。提供「複製到剪貼簿」與「下載 txt」功能，方便整理攻略數據。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/gamewith-umamusume-data-copy/gamewith-umamusume-data-copy.user.js)

### Niconico Danmaku Canvas Scaler
* **資料夾名稱**: `niconico-danmaku-zoom-in`
* **說明**: 調整 Niconico 動畫的彈幕大小。透過劫持 Canvas 的 `width`/`height` 屬性與 `getContext` 方法，提高渲染解析度，使彈幕字體相對變小/變清晰。支援快捷鍵調整縮放倍率（Shift + `+` / `-`）。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/niconico-danmaku-zoom-in/niconico-danmaku-zoom-in.user.js)

### Twitch 精確日期轉換器
* **資料夾名稱**: `twitch-date-converter`
* **說明**: 將 Twitch 影片/剪輯列表上的相對時間（如「2小時前」、「3天前」）替換為精確的日期格式（yyyy-MM-dd）。直接讀取縮圖元素中的 `title` 屬性（原始時間戳），確保日期準確。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/twitch-date-converter/twitch-date-converter.user.js)

### VPN Gate Table Sort
* **資料夾名稱**: `vpngate-table-filter`
* **說明**: 優化 VPNGate 列表頁面，增加排序控制面板。支援依據「連線速度 (Mbps)」或「總分」進行排序，並提供即時關鍵字搜尋過濾功能。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/vpngate-table-filter/vpngate-table-filter.user.js)

### YouTube 頻道通知批次設定
* **資料夾名稱**: `youtube-notification-batch-setting`
* **說明**: 在 YouTube 訂閱內容管理頁面新增控制面板，可批次將所有頻道的通知鈴鐺設定為「全部」、「個人化」或「無」。支援動態滾動載入 (Dynamic Scroll)，可自動處理長列表的訂閱頻道。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-notification-batch-setting/youtube-notification-batch-setting.user.js)

### YouTube 影片頁面播放清單檢查器
* **資料夾名稱**: `Youtube-viewpage-playlist-checker`
* **說明**: 在 YouTube 影片頁面顯示當前影片是否已加入使用者的任何自訂播放清單。透過呼叫 YouTube 內部 API (`get_add_to_playlist`) 檢查狀態，並在影片標題上方顯示結果。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-viewpage-playlist-checker/youtube-viewpage-playlist-checker.user.js)

### YouTube 影片儲存按鈕強制顯示
* **資料夾名稱**: `youtube-save-button-fixer`
* **說明**: 強制在 YouTube 影片操作列顯示「儲存」（加入播放清單）按鈕。當視窗縮放導致按鈕被收入「...」選單時，自動複製並生成一個獨立的按鈕置於操作列上。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-save-button-fixer/youtube-save-button-fixer.user.js)

### YouTube 影片卡片清單播放清單檢查器
* **資料夾名稱**: `Youtube-card-playlist-checker`
* **說明**: 在 YouTube 透過呼叫 YouTube 內部 API (`get_add_to_playlist`) 檢查狀態，並在影片標題上方顯示結果。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-card-playlist-checker/youtube-card-playlist-checker.user.js)

---

## 🎨 UserStyles (樣式)

### 隱藏B站插件提示橫幅
* **資料夾名稱**: `hide-bilibili-adblock-tip`
* **說明**: 自動隱藏 Bilibili 頂部偵測到廣告攔截插件的提示橫幅 (`.adblock-tips`)。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/hide-bilibili-adblock-tip/hide-bilibili-adblock-tip.user.css)

### Language Reactor 字幕位置調整
* **資料夾名稱**: `language-reactor-position-setting`
* **說明**: 調整 Netflix/YouTube 上 Language Reactor (原 LLN) 插件的字幕面板位置，將其強制固定在螢幕底部 5% 的位置。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/language-reactor-position-setting/language-reactor-position-setting.user.css)

### 移除巴哈小屋背景圖
* **資料夾名稱**: `remove-baha-home-background`
* **說明**: 強制移除巴哈姆特小屋（home.gamer.com.tw）的自訂背景圖片，將背景設為無。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/remove-baha-home-background/remove-baha-home-background.user.css)