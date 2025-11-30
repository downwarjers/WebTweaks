async function checkPlaylistsInBackground() {
    console.log("🚀 啟動：欄位名稱修正版...");

    // --- 1. 核心工具 ---
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    async function generateSAPISIDHASH() {
        const sapisid = getCookie('SAPISID');
        if (!sapisid) return null;
        const timestamp = Math.floor(Date.now() / 1000);
        const str = `${timestamp} ${sapisid} ${window.location.origin}`;
        const buffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `SAPISIDHASH ${timestamp}_${hashHex}`;
    }

    try {
        // --- 2. 準備參數 ---
        const app = document.querySelector('ytd-app');
        const rawData = app?.data?.response || window.ytInitialData;
        const mainVideoScope = rawData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
        const searchTargets = mainVideoScope ? [mainVideoScope] : [rawData, window.ytInitialPlayerResponse];

        function findButtonByText(obj, targetTexts, visited = new Set()) {
            if (!obj || typeof obj !== 'object') return null;
            if (visited.has(obj)) return null;
            visited.add(obj);
            
            let foundText = null;
            if (obj.simpleText) foundText = obj.simpleText;
            else if (obj.runs && obj.runs[0] && obj.runs[0].text) foundText = obj.runs[0].text;

            if (foundText && targetTexts.includes(foundText.trim())) return { found: true, text: foundText };

            for (let k in obj) {
                if (k === 'secondaryResults' || k === 'frameworkUpdates' || k === 'loggingContext') continue;
                const result = findButtonByText(obj[k], targetTexts, visited);
                if (result) {
                    if (result.found) {
                        const keys = ['addToPlaylistServiceEndpoint', 'serviceEndpoint', 'command', 'navigationEndpoint', 'showSheetCommand'];
                        for (let key of keys) if (obj[key]) return obj[key];
                        return result;
                    }
                    return result;
                }
            }
            return null;
        }

        console.log("🔍 取得主影片參數...");
        let params = null;
        let videoIdFromEndpoint = null;

        for (let source of searchTargets) {
            let candidate = findButtonByText(source, ['儲存', 'Save', '保存']);
            if (candidate) {
                let ep = candidate;
                if (candidate.addToPlaylistServiceEndpoint) ep = candidate.addToPlaylistServiceEndpoint;
                else if (candidate.command && candidate.command.addToPlaylistServiceEndpoint) ep = candidate.command.addToPlaylistServiceEndpoint;
                else if (candidate.showSheetCommand && candidate.showSheetCommand.panelLoadingStrategy) ep = candidate.showSheetCommand.panelLoadingStrategy.requestTemplate;
                else if (candidate.panelLoadingStrategy) ep = candidate.panelLoadingStrategy.requestTemplate;

                if (ep && ep.params) {
                    params = ep.params;
                    if (ep.videoId) videoIdFromEndpoint = ep.videoId;
                    break;
                }
            }
        }

        if (!params) {
             // DOM 備案
             const menuRenderer = document.querySelector('#above-the-fold ytd-menu-renderer');
             if (menuRenderer && menuRenderer.data) {
                const buttons = menuRenderer.data.topLevelButtons || [];
                for (let btn of buttons) {
                    const icon = btn.buttonRenderer?.icon?.iconType || btn.flexibleActionsViewModel?.iconName;
                    if (icon === 'PLAYLIST_ADD' || icon === 'SAVE') {
                        let ep = btn.buttonRenderer?.serviceEndpoint || btn.buttonRenderer?.command || btn.flexibleActionsViewModel?.onTap?.command;
                        if (ep) {
                            if (ep.addToPlaylistServiceEndpoint) params = ep.addToPlaylistServiceEndpoint.params;
                            else if (ep.showSheetCommand) params = ep.showSheetCommand.panelLoadingStrategy?.requestTemplate?.params;
                            else if (ep.params) params = ep.params;
                        }
                        if (params) break;
                    }
                }
            }
        }

        if (!params) throw new Error("❌ 找不到 params");

        // --- 3. API 請求 ---
        const currentVideoId = new URLSearchParams(window.location.search).get('v');
        const finalVideoId = videoIdFromEndpoint || currentVideoId;
        const apiKey = window.ytcfg.data_.INNERTUBE_API_KEY;
        const context = window.ytcfg.data_.INNERTUBE_CONTEXT;
        const authHeader = await generateSAPISIDHASH();
        const sessionIndex = window.ytcfg.data_.SESSION_INDEX || '0';

        console.log(`🚀 查詢清單狀態 (Video ID: ${finalVideoId})...`);

        const response = await fetch(`https://www.youtube.com/youtubei/v1/playlist/get_add_to_playlist?key=${apiKey}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'X-Origin': window.location.origin,
                'X-Goog-AuthUser': sessionIndex
            },
            credentials: 'include',
            body: JSON.stringify({
                context: context,
                videoIds: [finalVideoId],
                params: params
            })
        });

        const json = await response.json();
        
        // --- 4. 解析 (關鍵修正點) ---
        function findPlaylists(obj) {
            let results = [];
            if (!obj || typeof obj !== 'object') return results;
            if (obj.playlistAddToOptionRenderer) results.push(obj.playlistAddToOptionRenderer);
            for (let k in obj) results = results.concat(findPlaylists(obj[k]));
            return results;
        }

        const playlists = findPlaylists(json);
        const added = [];

        playlists.forEach(p => {
            const title = p.title.simpleText || p.title.runs?.[0]?.text;
            
            // ★ 同時檢查 containsSelectedVideos (複數) 和 containsSelectedVideo (單數)
            // 並且檢查值是否為 'ALL', 'TRUE' 或 true
            const rawStatus = p.containsSelectedVideos || p.containsSelectedVideo;
            const isAdded = rawStatus === 'ALL' || rawStatus === 'TRUE' || rawStatus === true;

            if (isAdded) {
                added.push(title);
            }
        });

        if (added.length > 0) {
            const msg = `✅ 本影片已存在於：\n${added.join('\n')}`;
            console.log(msg);
            alert(msg);
        } else {
            const msg = "⚪ 本影片未加入任何自訂清單";
            console.log(msg);
            alert(msg);
        }

    } catch (e) {
        console.error("錯誤:", e);
        alert(`錯誤: ${e.message}`);
    }
}

checkPlaylistsInBackground();