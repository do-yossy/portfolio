#!/usr/bin/env python3
"""
Indeed 応募者スクレイパー
Node.js から subprocess として呼び出される。
進捗は JSON Lines (stdout) で出力する。
"""
import json
import sys
import os
import time

def progress(message, level="info"):
    print(json.dumps({"type": "progress", "message": message, "level": level}), flush=True)

def emit_applicant(data):
    print(json.dumps({"type": "applicant", "data": data}), flush=True)

def main():
    email    = os.environ.get("INDEED_EMAIL", "")
    password = os.environ.get("INDEED_PASSWORD", "")

    if not email or not password:
        progress("⚠️ 環境変数 INDEED_EMAIL / INDEED_PASSWORD が未設定です", "warn")
        progress("デモモードで動作します（実際のスクレイピングは行いません）", "info")
        demo_applicants = [
            {"name": "Indeed 応募者A", "phone": "090-1234-0001", "email": "a001@example.com", "sourceMedia": "Indeed"},
            {"name": "Indeed 応募者B", "phone": "090-1234-0002", "email": "a002@example.com", "sourceMedia": "Indeed"},
        ]
        for a in demo_applicants:
            time.sleep(0.5)
            emit_applicant(a)
        progress(f"✅ {len(demo_applicants)}件取得（デモ）", "success")
        sys.exit(0)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        progress("❌ playwright がインストールされていません: pip install playwright && playwright install chromium", "error")
        sys.exit(1)

    with sync_playwright() as p:
        progress("🌐 ブラウザを起動しています...", "info")
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        )
        page = ctx.new_page()

        try:
            progress("🔑 Indeed にアクセス中...", "info")
            page.goto("https://secure.indeed.com/account/login", timeout=30000)
            time.sleep(2)

            progress("📧 ログイン情報を入力中...", "info")
            page.fill('input[name="emailAddress"]', email)
            page.click('button[type="submit"]')
            time.sleep(1)
            page.fill('input[name="password"]', password)
            page.click('button[type="submit"]')
            time.sleep(3)

            progress("📋 応募者一覧を取得中...", "info")
            page.goto("https://employers.indeed.com/applicants/overview", timeout=30000)
            time.sleep(3)

            # Scrape applicant rows (selectors may change - update as needed)
            applicants = page.evaluate("""() => {
                const rows = document.querySelectorAll('[data-testid="applicant-row"], .applicant-row, .ia-BasePage-main tr');
                return Array.from(rows).slice(0, 50).map(row => {
                    const name = row.querySelector('.applicant-name, [data-testid="applicant-name"], td:first-child')?.innerText?.trim() || '';
                    const email = row.querySelector('.applicant-email, [href^="mailto:"]')?.innerText?.trim() ||
                                  row.querySelector('[href^="mailto:"]')?.href?.replace('mailto:', '') || '';
                    const date = row.querySelector('.applicant-date, [data-testid="apply-date"]')?.innerText?.trim() || '';
                    return { name, email, phone: '', sourceMedia: 'Indeed', appliedAt: date };
                }).filter(a => a.name);
            }""")

            count = 0
            for a in applicants:
                emit_applicant(a)
                count += 1
                time.sleep(0.2)

            progress(f"✅ {count}件の応募者を取得しました", "success")

        except Exception as e:
            progress(f"❌ エラー: {str(e)}", "error")
            browser.close()
            sys.exit(1)

        browser.close()

if __name__ == "__main__":
    main()
