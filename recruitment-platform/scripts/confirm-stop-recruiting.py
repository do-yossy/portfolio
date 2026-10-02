import os, sys
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

        draft_items = collect_draft_items(page, group_id)
        target = None
        for d in draft_items:
            if TITLE_KW in (d.get('title') or ''):
                target = d
                break
        if not target:
            print("NOT FOUND")
            browser.close()
            return

        page.goto(target['href'], wait_until="domcontentloaded", timeout=30000)
        rand_delay(1.0, 1.5)
        page.locator('button:has-text("募集停止")').first.click()
        rand_delay(1.0, 1.5)
        page.screenshot(path="logs/before_confirm.png", full_page=False)

        # Try every visible button/element containing OK
        ok_candidates = page.get_by_text("OK", exact=True)
        n = ok_candidates.count()
        print("OK candidates:", n)
        clicked = False
        for i in range(n):
            el = ok_candidates.nth(i)
            if el.is_visible():
                el.click()
                clicked = True
                print(f"clicked OK candidate {i}")
                break
        if not clicked:
            print("fallback: trying role=button name=OK")
            try:
                page.get_by_role("button", name="OK").click(timeout=3000)
                clicked = True
            except Exception as e:
                print("role click failed:", e)

        rand_delay(1.5, 2.0)
        page.screenshot(path="logs/after_confirm.png", full_page=True)
        print("clicked:", clicked, "final url:", page.url)
        browser.close()

if __name__ == "__main__":
    main()
