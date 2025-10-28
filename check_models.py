import requests
import json
import os
import sys

# ================= 設定區 =================
# 請填入你的 API KEY
API_KEY = "AIzaSyDbQKtIkov71z1DG_oiIWGJT7z6f-aH2mc"  # 記得換成你的 Key
# =========================================

def list_models():
    # 使用 v1beta 查詢模型列表
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
    
    try:
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            print("=== ✅ 你的 API Key 可用的模型列表 ===")
            found_flash = False
            for model in data.get('models', []):
                # 過濾出支援 generateContent 的模型
                if "generateContent" in model.get('supportedGenerationMethods', []):
                    name = model['name'].replace("models/", "")
                    print(f"👉 {name}")
                    if "flash" in name:
                        found_flash = True
            
            print("\n==================================")
            if not found_flash:
                print("⚠️ 注意：清單中沒有看到 'flash' 相關模型，請檢查 Google AI Studio 是否有開通權限。")
            else:
                print("💡 請將 auto_reword.py 中的 MODEL_NAME 改為上面清單中的其中一個名稱。")
                
        else:
            print(f"❌ 查詢失敗 ({response.status_code}): {response.text}")
    except Exception as e:
        print(f"❌ 連線錯誤: {e}")

if __name__ == "__main__":
    # 強制 Windows 顯示 UTF-8 (避免亂碼)
    if sys.platform == "win32":
        os.environ["PYTHONIOENCODING"] = "utf-8"
    list_models()