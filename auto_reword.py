import os
import time
import subprocess
import traceback # 引入這個來印出詳細錯誤
from google import genai
from google.genai import types

# ================= 設定區 =================
# 請再次確認這裡貼上的是你那個「新帳號」的 Key
API_KEY = "AIzaSyCXB45NZq049zsO_JrPUHh_DeDCaDF1EL8" 

# --- 關鍵修改：先改回 1.5-flash 試試看，因為 2.0 可能有額外限制 ---
MODEL_NAME = 'gemini-2.0-flash' 
# MODEL_NAME = 'gemini-2.0-flash'

client = genai.Client(api_key=API_KEY)

def get_git_diff():
    """取得當前 Commit 的變更內容"""
    try:
        result = subprocess.run(
            ["git", "diff", "HEAD^", "HEAD"], 
            capture_output=True, text=True, encoding='utf-8', errors='ignore'
        )
        if result.returncode == 0:
            return result.stdout
            
        print("ℹ️ 無法抓取 diff (可能是 Root Commit)，嘗試使用 git show...")
        result_root = subprocess.run(
            ["git", "show", "--format=", "HEAD"], 
            capture_output=True, text=True, encoding='utf-8', errors='ignore'
        )
        return result_root.stdout
    except Exception as e:
        print(f"❌ 讀取 Diff 失敗: {e}")
        return None

def generate_commit_message(diff_content):
    if not diff_content or len(diff_content.strip()) == 0:
        return None
    
    truncated_diff = diff_content[:8000]

    prompt = f"""
    你是一個 Git Commit Message 產生器。請根據以下的 git diff 內容，生成一個符合 Conventional Commits 規範的訊息。
    規則：
    1. 格式為 `type(scope): description`。
    2. type 只能是：feat, fix, docs, style, refactor, chore。
    3. 使用繁體中文。
    4. 只要回傳訊息內容，不要 Markdown。

    Diff 內容：
    {truncated_diff}
    """

    max_retries = 1000000000
    for attempt in range(max_retries):
        try:
            print(f"🚀 (第 {attempt+1} 次嘗試) 正在呼叫 Google API ({MODEL_NAME})...")
            
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt
            )
            return response.text.strip()
        
        except Exception as e:
            # ==========================================
            # 🔥 這裡會印出最詳細的錯誤原因 🔥
            # ==========================================
            print(f"\n⚠️ 發生錯誤！詳細內容如下：")
            print(f"------------------------------------------------")
            # 印出錯誤類型
            print(f"【錯誤類型】: {type(e).__name__}")
            # 印出完整錯誤訊息 (這裡通常會包含 Google 的具體拒絕原因)
            print(f"【錯誤訊息】: {str(e)}")
            print(f"------------------------------------------------\n")

            error_msg = str(e)
            
            # 只有在確定是 Rate Limit 時才等待，其他錯誤(如 400, 403, 404) 就不該等待
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                wait_time = 10 * (attempt + 1) # 縮短等待時間測試
                print(f"⏳ 偵測到流量限制，休息 {wait_time} 秒...")
                time.sleep(wait_time)
            else:
                print("❌ 遇到無法重試的錯誤 (可能是 Key 錯誤、模型不支援或權限不足)，停止重試。")
                return None
    
    return None

def amend_commit(new_message):
    if not new_message: return
    safe_message = new_message.replace('"', '\\"')
    print(f"🤖 AI 建議: {new_message}")
    subprocess.run(["git", "commit", "--amend", "-m", safe_message], check=True)

if __name__ == "__main__":
    time.sleep(1) # 稍微緩衝
    print("--- 開始分析當前 Commit ---")
    diff = get_git_diff()
    
    if diff:
        new_msg = generate_commit_message(diff)
        if new_msg:
            amend_commit(new_msg)
            print("✅ 訊息已更新")
        else:
            print("⚠️ 無法生成訊息，跳過")
    else:
        print("⚠️ 無變更內容，跳過")

    print("😴 休息 15 秒...")
    time.sleep(15)