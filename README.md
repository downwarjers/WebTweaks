# WebTweaks 🌐

![Update README](https://github.com/downwarjers/WebTweaks/actions/workflows/update_readme.yml/badge.svg)
![License](https://img.shields.io/github/license/downwarjers/WebTweaks)

這裡整理了 `WebTweaks` 專案中的所有 UserScripts (使用者腳本) 與 UserStyles (使用者樣式)。
所有腳本皆開源，旨在提升特定網站的瀏覽體驗。本列表由 GitHub Actions 自動生成。

## 🚀 如何使用 (Prerequisites)

在使用這些腳本之前，請確保您的瀏覽器已安裝對應的擴充功能：

| 類型 | 推薦擴充功能 |
| :--- | :--- |
| **UserScripts (腳本)** | [Tampermonkey](https://www.tampermonkey.net/) 或 [ScriptCat](https://scriptcat.org/) |
| **UserStyles (樣式)** | [Stylus](https://add0n.com/stylus.html) |

安裝擴充功能後，點擊下方列表中的 **[點此安裝]**連結，即可自動觸發安裝畫面。

## ⚠️ 免責聲明

本專案提供的腳本僅供學習與個人使用。使用自動化腳本可能違反部分網站的使用條款，請自行承擔使用風險。作者不對因使用本腳本而導致的任何帳號異常或損失負責。

---

## 📂 UserScripts (腳本)

### ACGSecrets Bangumi 分類抓取
* **資料夾名稱**: `acgsecrets-bangumi-copy`
* **說明**: 針對 ACGSecrets.hk 網站，依據作品標籤（如「續作」、「新作」、「家長指引」）與名稱規則（正則表達式判斷季數、篇章），將新番列表自動分類為八大類。在頁面右下角提供「複製分類結果」與「下載 txt」按鈕。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/acgsecrets-bangumi-copy/acgsecrets-bangumi-copy.user.js)

### AniList to OTT Sites
* **資料夾名稱**: `anilist-external-ott-services`
* **說明**: AniList 清單新增外部OTT按鈕，直接跳轉搜尋作品，支援巴哈自動跳轉集數
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/anilist-external-ott-services/anilist-external-ott-services.user.js)

### 巴哈姆特 - 自動關閉簽到視窗
* **資料夾名稱**: `auto-close-baha-sign-window`
* **說明**: 自動偵測並關閉巴哈姆特（gamer.com.tw）進入時彈出的每日簽到視窗 (`dialogify_1`)。使用 `MutationObserver` 監聽 DOM 變化，發現關閉按鈕時自動觸發點擊。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-close-baha-sign-window/auto-close-baha-sign-window.user.js)

### Auto Mobile→Desktop Redirect (Enhanced)
* **資料夾名稱**: `auto-redirect-to-desktop-web`
* **說明**: 當訪問手機版網頁（如 `m.`, `mobile.` 開頭或包含 `/mobile/` 路徑）時，自動嘗試跳轉回桌面版網址。內建防無限迴圈機制（檢查 Referrer 與 SessionStorage 計數），避免在只有手機版的網站上卡死。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/auto-redirect-to-desktop-web/auto-redirect-to-desktop-web.user.js)

### Bahamut Anime to AniList Sync
* **資料夾名稱**: `bahamut-anime-to-anilist-sync`
* **說明**: 巴哈姆特動畫瘋同步到 AniList。支援系列設定、自動計算集數、自動日期匹配、深色模式UI
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bahamut-anime-to-anilist-sync/bahamut-anime-to-anilist-sync.user.js)

### Bahamut Anime to AniList Sync (Beta)
* **資料夾名稱**: `bahamut-anime-to-anilist-sync`
* **說明**: 巴哈姆特動畫瘋同步到 AniList。支援系列設定、自動計算集數、自動日期匹配、深色模式UI(Beta 版本)
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bahamut-anime-to-anilist-sync/bahamut-anime-to-anilist-sync-beta.user.js)

### Bilibili Video Fix Negative Color
* **資料夾名稱**: `bilibili-video-negative-color`
* **說明**: 解決 Bilibili 影片顏色異常或提供負片效果。在播放器的「設定」選單（關燈模式旁）新增「反轉顏色」開關。透過注入 CSS `filter: invert(100%) hue-rotate(180deg)` 實現畫面反轉。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bilibili-video-negative-color/bilibili-video-negative-color.user.js)

### BOOKWALKER 跨頁面批量加入購物車 (自動過濾已購/已在購物車) - 全自動靜默結帳版
* **資料夾名稱**: `bookwalker-free-book-auto-buying`
* **說明**: 自動化處理 BookWalker 免費書籍領取。支援跨頁面批量將書籍加入購物車，自動過濾已購買書籍。包含「全自動靜默結帳」功能，遇到購物車滿額（200本）時會自動觸發結帳流程，並在完成後返回原頁面繼續執行。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/bookwalker-free-book-auto-buying/bookwalker-free-book-auto-buying.user.js)

### Disp.cc PTT 網址自動跳轉
* **資料夾名稱**: `disp-bbs-redirect-to-pttweb`
* **說明**: 瀏覽 Disp.cc 時，若文章來源顯示為 PTT (`ptt.cc`)，點擊該連結會自動轉址到 `pttweb.cc` (網頁版 PTT 備份站)，避免 PTT 原站的年齡驗證阻擋。精確比對「※ 文章網址:」文字，確保只針對文章底部的來源連結進行處理。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/disp-bbs-redirect-to-pttweb/disp-bbs-redirect-to-pttweb.user.js)

### 電子發票平台 - 自動顯示100筆
* **資料夾名稱**: `einvoice-auto-show-100`
* **說明**: 自動將列表顯示筆數切換為 100 筆並執行
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/einvoice-auto-show-100/einvoice-auto-show-100.user.js)

### 電子發票平台 - 年度發票儀表板
* **資料夾名稱**: `einvoice-dashboard-export`
* **說明**: 自動查詢近 7 個月區間發票
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/einvoice-dashboard-export/einvoice-dashboard-export.user.js)

### Game8 馬娘支援卡評價與持有整合面板
* **資料夾名稱**: `game8-umamusume-support-cards-manager`
* **說明**: 整合Game8馬娘攻略網的支援卡評價顯示與持有率管理。核心功能包括：自動背景抓取評價資料、CSV匯入匯出、以及優化的「資料庫/畫面」同步邏輯
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/game8-umamusume-support-cards-manager/game8-umamusume-support-cards-manager.user.js)

### GameWith ウマ娘 選擇資料匯出
* **資料夾名稱**: `gamewith-umamusume-data-copy`
* **說明**: 在 GameWith 賽馬娘攻略網頁上，抓取使用者勾選的資料（如因子、支援卡），依據 H2 標題進行分類。提供「複製到剪貼簿」與「下載 txt」功能，方便整理攻略數據。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/gamewith-umamusume-data-copy/gamewith-umamusume-data-copy.user.js)

### Gemini 網址提示詞
* **資料夾名稱**: `gemini-url-prompt`
* **說明**: 自動化 Gemini 輸入與發送工具。支援透過 URL 參數自動填入指令、強制切換至新對話視窗、自動切換模型（如 Pro）、開啟臨時對話模式。內建 UI 遮罩以防止誤觸
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/gemini-url-prompt/gemini-url-prompt.user.js)

### Google Maps Share to Notion
* **資料夾名稱**: `google-maps-restaurant-to-notion`
* **說明**: 在 Google Maps 分享視窗嵌入 Notion 面板，自動擷取店名/地址/行政區/URL，支援重複檢查、分類選擇與備註填寫。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/google-maps-restaurant-to-notion/google-maps-restaurant-to-notion.user.js)

### Manga-Zip Detail Page Follow Button
* **資料夾名稱**: `manga-zip-detail-page-follow-btn`
* **說明**: 在詳情頁新增追蹤按鈕，並自動同步「已追蹤/未追蹤」的原始狀態。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/manga-zip-detail-page-follow-btn/manga-zip-detail-page-follow-btn.user.js)

### Niconico Danmaku Canvas Scaler (with scaling context)
* **資料夾名稱**: `niconico-danmaku-zoom-in`
* **說明**: 調整 Niconico 動畫的彈幕大小。透過劫持 Canvas 的 `width`/`height` 屬性與 `getContext` 方法，提高渲染解析度，使彈幕字體相對變小/變清晰。支援快捷鍵調整縮放倍率（Shift + `+` / `-`）。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/niconico-danmaku-zoom-in/niconico-danmaku-zoom-in.user.js)

### TMDB to Simkl 面板
* **資料夾名稱**: `tmdb-to-simkl-panel`
* **說明**: 在 TMDB 影劇頁面插入獨立的 Simkl 控制面板，支援一鍵快速跳轉搜尋
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/tmdb-to-simkl-panel/tmdb-to-simkl-panel.user.js)

### Twitch 精確日期轉換器
* **資料夾名稱**: `twitch-date-converter`
* **說明**: 將 Twitch 影片/剪輯列表上的相對時間（如「2小時前」、「3天前」）替換為精確的日期格式（yyyy-MM-dd）。直接讀取縮圖元素中的 `title` 屬性（原始時間戳），確保日期準確。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/twitch-date-converter/twitch-date-converter.user.js)

### VPN Gate Table Sort
* **資料夾名稱**: `vpngate-table-filter`
* **說明**: 優化 VPNGate 列表頁面，增加排序控制面板。支援依據「連線速度 (Mbps)」或「總分」進行排序，並提供即時關鍵字搜尋過濾功能。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/vpngate-table-filter/vpngate-table-filter.user.js)

### YouTube: Append Handle
* **資料夾名稱**: `youtube-append-handle`
* **說明**: 搭配 "Restore YouTube Username" 使用。自動將 Handle 解碼並同步顯示在名稱後方，並支援點擊複製
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-append-handle/youtube-append-handle.user.js)

### YouTube 自動展開所有留言
* **資料夾名稱**: `youtube-auto-expand-comments`
* **說明**: 自動展開 YouTube 留言。已修復畫面亂跳及無限展開隱藏的迴圈問題。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-auto-expand-comments/youtube-auto-expand-comments.user.js)

### YouTube 影片卡片清單播放清單檢查器
* **資料夾名稱**: `youtube-card-playlist-checker`
* **說明**: 在 YouTube 透過呼叫 YouTube 內部 API (`get_add_to_playlist`) 檢查狀態，並在影片標題上方顯示結果。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-card-playlist-checker/youtube-card-playlist-checker.user.js)

### YouTube - Advanced Batch Channel Notifier (Dynamic Scroll)
* **資料夾名稱**: `youtube-notification-batch-setting`
* **說明**: 在 YouTube 訂閱內容管理頁面新增控制面板，可批次將所有頻道的通知鈴鐺設定為「全部」、「個人化」或「無」。支援動態滾動載入 (Dynamic Scroll)，可自動處理長列表的訂閱頻道。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-notification-batch-setting/youtube-notification-batch-setting.user.js)

### YouTube 影片庫自動化匯入撥放清單工具
* **資料夾名稱**: `youtube-playlist-auto-importer`
* **說明**: 批次匯入影片至指定清單，並自動掃描帳號內所有播放清單，確保影片在全域收藏中不重複。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-playlist-auto-importer/youtube-playlist-auto-importer.user.js)

### YouTube 影片儲存按鈕強制顯示
* **資料夾名稱**: `youtube-save-button-fixer`
* **說明**: 強制在 YouTube 影片操作列顯示「儲存」（加入播放清單）按鈕。當視窗縮放導致按鈕被收入「...」選單時，自動複製並生成一個獨立的按鈕置於操作列上。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-save-button-fixer/youtube-save-button-fixer.user.js)

### YouTube Save Button Logic Replacer
* **資料夾名稱**: `youtube-save-button-logic-replacer`
* **說明**: 完全替換 YouTube 影片下方的儲存按鈕，重新安裝一個直接注入 addToPlaylistServiceEndpoint 指令的新按鈕，從底層邏輯接管儲存功能。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-save-button-logic-replacer/youtube-save-button-logic-replacer.user.js)

### YouTube 影片頁面播放清單檢查器
* **資料夾名稱**: `youtube-viewpage-playlist-checker`
* **說明**: 在 YouTube 影片頁面顯示當前影片是否已加入使用者的任何自訂播放清單。透過呼叫 YouTube 內部 API (`get_add_to_playlist`) 檢查狀態，並在影片標題上方顯示結果。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserScripts/youtube-viewpage-playlist-checker/youtube-viewpage-playlist-checker.user.js)

---

## 🎨 UserStyles (樣式)

### External Player位置與大小調整
* **資料夾名稱**: `external-player-position-setting`
* **說明**: External Player位置與大小自動調整
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/external-player-position-setting/external-player-position-setting.user.css)

### 隱藏B站插件提示橫幅
* **資料夾名稱**: `hide-bilibili-adblock-tip`
* **說明**: 自動隱藏 Bilibili 頂部偵測到廣告攔截插件的提示橫幅 (`.adblock-tips`)。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/hide-bilibili-adblock-tip/hide-bilibili-adblock-tip.user.css)

### Immersive Translate 位置與大小調整
* **資料夾名稱**: `immersive-translate-position-setting`
* **說明**: Immersive Translate 字幕位置與遮擋問題
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/immersive-translate-position-setting/immersive-translate-position-setting.user.css)

### 隱藏 IYF.tv 播放器 LOGO
* **資料夾名稱**: `iyf-hide-video-logo`
* **說明**: 去除 iyf.tv 影片播放器上的疊加 LOGO 圖片
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/iyf-hide-video-logo/iyf-hide-video-logo.user.css)

### Language Reactor 字幕位置調整
* **資料夾名稱**: `language-reactor-position-setting`
* **說明**: 調整 Netflix/YouTube 上 Language Reactor (原 LLN) 插件的字幕面板位置，將其強制固定在螢幕底部 5% 的位置。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/language-reactor-position-setting/language-reactor-position-setting.user.css)

### ofiii 歐飛移除暫停與遮擋廣告
* **資料夾名稱**: `ofiii-clean-player`
* **說明**: 隱藏 ofiii (歐飛) 影片暫停時的 internal_banner 彈出視窗與其他遮擋元素。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/ofiii-clean-player/ofiii-clean-player.user.css)

### 移除巴哈小屋背景圖
* **資料夾名稱**: `remove-baha-home-background`
* **說明**: 強制移除巴哈姆特小屋（home.gamer.com.tw）的自訂背景圖片，將背景設為無。
* **安裝**: [點此安裝](https://raw.githubusercontent.com/downwarjers/WebTweaks/main/UserStyles/remove-baha-home-background/remove-baha-home-background.user.css)

