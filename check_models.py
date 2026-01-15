import requests
import json
import os
import sys
import time

# ================= 設定區 =================
# 請填入你的 API KEY
API_KEY = "AIzaSyBOJVKp-OjAckoNQW77FWTvbaUGxYoBCpo"  # 記得換成你的 Key
# =========================================

def test_model_quota(model_name):
    """實際發送一個請求來測試該模型是否可用"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={API_KEY}"
    
    payload = {
        "contents": [{
            "parts": [{"text": "Hi"}]
        }]
    }
    
    try:
        response = requests.post(url, headers={'Content-Type': 'application/json'}, json=payload)
        
        if response.status_code == 200:
            return True, "✅ 可用！(200 OK)"
        elif response.status_code == 429:
            err = response.json()
            msg = err.get('error', {}).get('message', '')
            # 嘗試抓出具體限制資訊
            if "limit: 20" in msg:
                return False, "❌ 額度極低 (每日 20 次限制)"
            elif "limit: 0" in msg:
                return False, "❌ 無權限 (額度為 0)"
            else:
                return False, "❌ 額度耗盡 (429 Rate Limit)"
        else:
            return False, f"❌ 其他錯誤 ({response.status_code})"
            
    except Exception as e:
        return False, f"❌ 連線失敗: {str(e)}"

def list_and_test_models():
    # 1. 取得模型列表
    list_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
    
    print("=== 正在掃描並測試你的 API Key 可用模型 ===")
    print("這可能需要幾秒鐘...\n")
    
    try:
        response = requests.get(list_url)
        if response.status_code != 200:
            print(f"❌ 無法取得模型列表: {response.text}")
            return

        data = response.json()
        available_models = []

        # 2. 過濾並測試每一個 Flash 模型
        for model in data.get('models', []):
            model_name = model['name'].replace("models/", "")
            
            # 我們只測試 'generateContent' 且名稱包含 'flash' 或 'pro' 的模型 (比較可能適合你的任務)
            if "generateContent" in model.get('supportedGenerationMethods', []) and \
               ("flash" in model_name or "gemini-2.0" in model_name):
                
                print(f"Testing {model_name:<35} ... ", end="", flush=True)
                
                success, message = test_model_quota(model_name)
                print(message)
                
                if success:
                    available_models.append(model_name)
                
                # 稍微休息避免自己觸發 Rate Limit
                time.sleep(1)

        print("\n================ 測試結果 ================")
        if available_models:
            print("🎉 恭喜！以下模型目前可用（請複製到 auto_reword.py）：\n")
            for m in available_models:
                print(f"MODEL_NAME = '{m}'")
            
            # 推薦邏輯
            print("\n🤖 推薦順序：")
            # 優先推薦 Lite (通常比較省且快)，其次是 2.0 Flash
            recommendation = next((m for m in available_models if "lite" in m), None)
            if not recommendation:
                recommendation = next((m for m in available_models if "gemini-2.0-flash" in m and "exp" not in m), available_models[0])
            
            print(f"👉 建議優先使用： MODEL_NAME = '{recommendation}'")
            
        else:
            print("😭 慘，測試的所有模型都失敗了。請檢查 API Key 是否有綁定 Billing 專案，或換一個 Google 帳號。")

    except Exception as e:
        print(f"❌ 程式發生錯誤: {e}")

if __name__ == "__main__":
    if sys.platform == "win32":
        os.environ["PYTHONIOENCODING"] = "utf-8"
    list_and_test_models()