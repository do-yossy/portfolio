import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from kyujinbox_poster import goto_login, find_input, human_type, collect_draft_items, rand_delay

TITLE_KW = "門戸厄神"

def main():
    email    = os.environ.get("KYUJINBOX_EMAIL", "")
    password = os.environ.get("KYUJINBOX_PASSWORD", "")
    group_id = os.environ.get("KYUJINBOX_GROUP_ID", "").strip()

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=[
            '--disable-blink-features=AutomationControlled', '--no-sandbox',
            '--disable-setuid-sandbox', '--disable-dev-shm-usage'])
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            viewport={"width": 1440, "height": 900}, locale="ja-JP", timezone_id="Asia/Tokyo")
        page = ctx.new_page()
        goto_login(page)
        email_sel = find_input(page, 'input[name="login[email]"]', 'input[type="email"]', 'input[name="email"]')
        human_type(page, email_sel, email)
        pass_sel = find_input(page, 'input[name="login[password]"]', 'input[type="password"]', 'input[name="password"]')
        human_type(page, pass_sel, password)
        page.click('button[type="submit"], input[type="submit"], form button')
        try: page.wait_for_url(lambda u: 'login' not in u.lower(), timeout=15000)
        except Exception: page.wait_for_load_state('domcontentloaded', timeout=10000)
        print("login ok", page.url)

        draft_items = collect_draft_items(page, group_id)
        target = None
        for d in draft_items:
            if TITLE_KW in (d.get('title') or ''):
                target = d
                break
        print("target:", target)
        if not target:
            print("NOT FOUND")
            browser.close()
            return

        page.goto(target['href'], wait_until="domcontentloaded", timeout=30000)
        rand_delay(1.0, 1.5)
        page.screenshot(path="logs/inspect_delete_target.png", full_page=True)
        print("screenshot saved: logs/inspect_delete_target.png")

        # look for delete-ish buttons/links
        candidates = page.locator('button, a').all()
        found = []
        for el in candidates:
            try:
                txt = (el.inner_text() or '').strip()
            except Exception:
                continue
            if txt and ('削除' in txt or '破棄' in txt or 'Delete' in txt):
                found.append(txt)
        print("delete-like buttons found:", found)
        browser.close()

if __name__ == "__main__":
    main()
