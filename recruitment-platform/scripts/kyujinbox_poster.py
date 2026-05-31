#!/usr/bin/env python3
"""
求人ボックス 自動投稿スクリプト
Node.js から subprocess として呼び出される。
標準入力からJSONで求人データを受け取り、Playwrightで投稿する。
"""
import json
import sys
import os
import time
import random

def progress(message, level="info"):
    print(json.dumps({"type": "progress", "message": message, "level": level}), flush=True)

def rand_delay(min_s=1.5, max_s=4.0):
    time.sleep(random.uniform(min_s, max_s))

def human_type(page, selector, text):
    """人間らしいランダム速度でテキストを入力"""
    page.click(selector)
    rand_delay(0.3, 0.8)
    for char in text:
        page.keyboard.type(char)
        time.sleep(random.uniform(0.03, 0.12))

def main():
    try:
        jobs_json = sys.stdin.read().strip()
        jobs = json.loads(jobs_json) if jobs_json else []
    except Exception:
        jobs = []

    if not jobs:
        progress("⚠️ 投稿する求人データがありません", "warn")
        sys.exit(0)

    email    = os.environ.get("KYUJINBOX_EMAIL", "")
    password = os.environ.get("KYUJINBOX_PASSWORD", "")
    batch    = int(os.environ.get("KYUJINBOX_BATCH_SIZE", str(len(jobs))))

    if not email or not password:
        progress("⚠️ 環境変数 KYUJINBOX_EMAIL / KYUJINBOX_PASSWORD が未設定です", "warn")
        progress("デモモードで動作します（実際の投稿は行いません）", "info")
        for job in jobs[:batch]:
            rand_delay(0.8, 1.5)
            progress(f"📝 「{job['title']}」を投稿中...（シミュレーション）", "info")
            rand_delay(0.6, 1.2)
            progress(f"✅ 「{job['title']}」を投稿しました（シミュレーション）", "success")
        sys.exit(0)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        progress("❌ playwright がインストールされていません: pip install playwright && playwright install chromium", "error")
        sys.exit(1)

    # ランダムなビューポートサイズ（bot検知回避）
    viewports = [
        {"width": 1366, "height": 768},
        {"width": 1440, "height": 900},
        {"width": 1920, "height": 1080},
        {"width": 1280, "height": 800},
    ]
    viewport = random.choice(viewports)

    with sync_playwright() as p:
        progress("🌐 ブラウザを起動しています...", "info")
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
            ]
        )
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            viewport=viewport,
            locale="ja-JP",
            timezone_id="Asia/Tokyo",
        )

        # navigator.webdriver を隠す
        ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ja', 'en-US'] });
        """)

        page = ctx.new_page()

        try:
            progress("🔑 求人ボックスにログイン中...", "info")
            page.goto("https://www.kyujinbox.com/login", timeout=30000)
            rand_delay(1.5, 3.0)

            # ランダムにスクロール（人間らしい挙動）
            page.mouse.move(random.randint(200, 800), random.randint(100, 400))
            rand_delay(0.5, 1.0)

            human_type(page, 'input[type="email"], input[name="email"]', email)
            rand_delay(0.8, 1.5)
            human_type(page, 'input[type="password"], input[name="password"]', password)
            rand_delay(0.5, 1.2)
            page.click('button[type="submit"]')
            rand_delay(3.0, 5.0)

            target_jobs = jobs[:batch]
            success_count = 0

            for i, job in enumerate(target_jobs):
                progress(f"📝 [{i+1}/{len(target_jobs)}] 「{job['title']}」を投稿中...", "info")
                rand_delay(1.5, 3.0)

                try:
                    page.goto("https://www.kyujinbox.com/post/new", timeout=20000)
                    rand_delay(2.0, 4.0)

                    human_type(page, 'input[name="title"], #job-title, [placeholder*="タイトル"]', job['title'])
                    rand_delay(0.5, 1.2)
                    human_type(page, 'textarea[name="description"], #job-description, [placeholder*="仕事内容"]', job.get('description', ''))
                    rand_delay(0.5, 1.0)
                    human_type(page, 'input[name="location"], #job-location, [placeholder*="勤務地"]', job.get('location', ''))
                    rand_delay(0.4, 0.9)
                    human_type(page, 'input[name="salary"], #job-salary, [placeholder*="給与"]', job.get('salary', ''))
                    rand_delay(0.8, 1.8)

                    if job.get('catchcopy'):
                        try:
                            human_type(page, 'input[name="catch"], #job-catch, [placeholder*="キャッチ"]', job['catchcopy'])
                            rand_delay(0.5, 1.0)
                        except Exception:
                            pass

                    page.click('button[type="submit"], .submit-btn, [type="submit"]')
                    rand_delay(3.0, 6.0)

                    progress(f"✅ 「{job['title']}」を投稿しました", "success")
                    success_count += 1

                    # 投稿間に長めのランダム待機（BAN回避）
                    if i < len(target_jobs) - 1:
                        wait = random.uniform(8.0, 20.0)
                        progress(f"⏳ 次の投稿まで {wait:.0f}秒 待機中（BAN回避）...", "info")
                        time.sleep(wait)

                except Exception as e:
                    progress(f"⚠️ 「{job['title']}」の投稿中にエラー: {str(e)}", "warn")
                    continue

        except Exception as e:
            progress(f"❌ ログインエラー: {str(e)}", "error")
            browser.close()
            sys.exit(1)

        browser.close()
        progress(f"✅ {success_count}/{len(target_jobs)}件の投稿処理が完了しました", "success")

if __name__ == "__main__":
    main()
