import os
import re

# 設定掃描的根目錄與目標檔案
ROOT_DIR = '.'
README_FILE = 'README.md'
# GitHub Raw 檔案的前綴
REPO_RAW_URL_BASE = 'https://raw.githubusercontent.com/downwarjers/WebTweaks/main'

# 定義 README 的標頭與結尾模板
README_HEADER = """# WebTweaks

這裡整理了 `WebTweaks` 專案中的所有 UserScripts (使用者腳本) 與 UserStyles (使用者樣式)，本列表由腳本自動生成。

"""

# 用來解析 Metadata 的正規表達式
META_REGEX = re.compile(r'(@[\w-]+)\s+(.+)')

def parse_file_header(filepath, is_css=False):
    """讀取檔案前 50 行，提取 metadata"""
    metadata = {}
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            header_lines = lines[:50] 
            
        in_block = False
        for line in header_lines:
            line = line.strip()
            if '==UserScript==' in line or '==UserStyle==' in line:
                in_block = True
                continue
            if '==/UserScript==' in line or '==/UserStyle==' in line:
                break
            
            if in_block:
                match = META_REGEX.search(line)
                if match:
                    key = match.group(1).replace('@', '')
                    value = match.group(2).strip()
                    metadata[key] = value
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
    return metadata

def generate_section(title, folder_name, items):
    """生成 Markdown 區塊"""
    content = [f"## {title}\n"]
    
    # [修改處] 排序邏輯變更：
    # 先依據 'folder' (資料夾名稱) 排序，如果同資料夾，再依據 'name' (腳本名稱) 排序
    items.sort(key=lambda x: (x.get('folder', '').lower(), x.get('name', '').lower()))

    for item in items:
        name = item.get('name', 'Unknown Script')
        desc = item.get('description', 'No description provided.')
        folder = item.get('folder', 'Unknown')
        
        # 優先使用檔案內的 downloadURL，沒有則自己組合
        download_url = item.get('downloadURL')
        if not download_url:
            rel_path = item.get('rel_path').replace('\\', '/')
            download_url = f"{REPO_RAW_URL_BASE}/{rel_path}"

        entry = (
            f"### {name}\n"
            f"* **資料夾名稱**: `{folder}`\n"
            f"* **說明**: {desc}\n"
            f"* **安裝**: [點此安裝]({download_url})\n"
        )
        content.append(entry)
    
    return "\n".join(content) + "\n"

def main():
    scripts = []
    styles = []

    # 遍歷目錄
    for root, dirs, files in os.walk(ROOT_DIR):
        if '.git' in root:
            continue
        
        # 為了確保 os.walk 的順序穩定（如果你希望完全依照作業系統順序），這裡可以不排序
        # 但通常為了美觀，還是建議讓 dirs 也排序一下
        dirs.sort() 

        for file in files:
            filepath = os.path.join(root, file)
            rel_path = os.path.relpath(filepath, ROOT_DIR)
            folder_name = os.path.basename(os.path.dirname(filepath))
            
            # 處理 .user.js
            if file.endswith('.user.js'):
                meta = parse_file_header(filepath, is_css=False)
                if meta:
                    meta['folder'] = folder_name
                    meta['rel_path'] = rel_path
                    scripts.append(meta)
            
            # 處理 .user.css
            elif file.endswith('.user.css'):
                meta = parse_file_header(filepath, is_css=True)
                if meta:
                    meta['folder'] = folder_name
                    meta['rel_path'] = rel_path
                    styles.append(meta)

    # 生成內容
    readme_content = README_HEADER
    
    if scripts:
        readme_content += generate_section("📂 UserScripts (腳本)", "UserScripts", scripts)
    
    if styles:
        readme_content += "---\n\n"
        readme_content += generate_section("🎨 UserStyles (樣式)", "UserStyles", styles)

    # 寫入 README.md
    with open(README_FILE, 'w', encoding='utf-8') as f:
        f.write(readme_content)
    
    print(f"✅ README.md 已更新！包含 {len(scripts)} 個腳本與 {len(styles)} 個樣式。")

if __name__ == '__main__':
    main()