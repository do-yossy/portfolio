#!/usr/bin/env python3
"""実際にkyujinboxへログインし、指定の求人番号の編集ページを開いて
今表示されているtitle/descriptionの値をそのまま出力する（保存はしない・確認専用）。
使い方: KYUJINBOX_EMAIL_<CO>等を.envから読み、
  python scripts/check-reflect-verify.py 5922-7577-2622 5922-7577-2623
  python scripts/check-reflect-verify.py --company bg 5148-4590-0779
"""
import sys, os, json

def load_env():
    p = os.path.join(os.path.dirname(__file__), '..', '.env')
    if not os.path.exists(p): return
    for line in open(p, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip())

load_env()
args = sys.argv[1:]
company = "SQ"
if args and args[0] == "--company":
    company = args[1].upper()
    args = args[2:]
email = os.environ.get(f"KYUJINBOX_EMAIL_{company}", "")
password = os.environ.get(f"KYUJINBOX_PASSWORD_{company}", "")
group_id = os.environ.get(f"KYUJINBOX_GROUP_ID_{company}", "")
job_numbers = args

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    ctx = browser.new_context(locale="ja-JP", timezone_id="Asia/Tokyo")
    page = ctx.new_page()
    page.goto("https://secure.kyujinbox.com/login", timeout=30000)
    page.wait_for_load_state('networkidle', timeout=15000)
    for sel in ['input[name="login[email]"]', 'input[type="email"]', 'input[name="email"]']:
        if page.locator(sel).count(): page.fill(sel, email); break
    for sel in ['input[name="login[password]"]', 'input[type="password"]', 'input[name="password"]']:
        if page.locator(sel).count(): page.fill(sel, password); break
    page.click('button[type="submit"], input[type="submit"], form button')
    page.wait_for_load_state('domcontentloaded', timeout=15000)
    print("login url after submit:", page.url, file=sys.stderr)

    for num in job_numbers:
        url = f"https://saiyo.kyujinbox.com/company/groups/{group_id}/jobs/edit/{num}"
        page.goto(url, timeout=30000)
        page.wait_for_load_state('networkidle', timeout=15000)
        cur_url = page.url
        title_val = None
        desc_val = None
        try:
            title_val = page.locator('input[name="title"]').input_value(timeout=5000)
        except Exception as e:
            title_val = f"(取得失敗: {e})"
        try:
            desc_val = page.locator('textarea[name="description"]').input_value(timeout=5000)
        except Exception as e:
            desc_val = f"(取得失敗: {e})"
        try:
            job_type_text = page.evaluate(
                "() => { const el = document.querySelector('select[name=\"jobType\"]'); "
                "if (!el) return null; const o = el.options[el.selectedIndex]; return o ? o.textContent.trim() : null; }")
        except Exception as e:
            job_type_text = f"(取得失敗: {e})"
        print(json.dumps({
            "jobNumber": num,
            "finalUrl": cur_url,
            "title": title_val,
            "descriptionHead": (desc_val or "")[:200],
            "jobType": job_type_text,
        }, ensure_ascii=False))
    browser.close()
