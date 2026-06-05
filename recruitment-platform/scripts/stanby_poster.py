#!/usr/bin/env python3
"""
スタンバイ 自動投稿スクリプト
Node.js から subprocess として呼び出される。
標準入力からJSONで求人データを受け取り、Playwrightで投稿する。
"""
import json
import sys
import os
import time

def progress(message, level="info"):
    print(json.dumps({"type": "progress", "message": message, "level": level}), flush=True)

def main():
    try:
        jobs_json = sys.stdin.read().strip()
        jobs = json.loads(jobs_json) if jobs_json else []
    except Exception:
        jobs = []

    if not jobs:
        progress("⚠️ 投稿する求人データがありません", "warn")
        sys.exit(0)

    # 1回の投稿件数（環境変数 STANBY_BATCH_SIZE で指定・デフォルト16件）
    batch = int(os.environ.get("STANBY_BATCH_SIZE", str(len(jobs))))

    email    = os.environ.get("STANBY_EMAIL", "")
    password = os.environ.get("STANBY_PASSWORD", "")

    if not email or not password:
        progress("⚠️ 環境変数 STANBY_EMAIL / STANBY_PASSWORD が未設定です", "warn")
        progress("デモモードで動作します（実際の投稿は行いません）", "info")
        target_jobs = jobs[:batch]
        for i, job in enumerate(target_jobs):
            time.sleep(1.0)
            progress(f"📝 「{job['title']}」を投稿中...（シミュレーション）", "info")
            time.sleep(0.8)
            progress(f"✅ 「{job['title']}」を投稿しました（シミュレーション）", "success")
            if i < len(target_jobs) - 1:
                progress("⏳ 次の投稿まで待機中（BAN回避）...", "info")
                time.sleep(1.5)
        progress(f"✅ {len(target_jobs)}件の投稿処理が完了しました（シミュレーション）", "success")
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
            progress("🔑 スタンバイにログイン中...", "info")
            page.goto("https://stanby.co.jp/recruiters/sign_in", timeout=30000)
            time.sleep(2)

            page.fill('input[type="email"], input[name="email"]', email)
            page.fill('input[type="password"], input[name="password"]', password)
            page.click('button[type="submit"]')
            time.sleep(3)

            # BAN avoidance: post up to `batch` jobs with delays
            target_jobs = jobs[:batch]

            for i, job in enumerate(target_jobs):
                progress(f"📝 「{job['title']}」を投稿中...", "info")
                time.sleep(1)

                try:
                    page.goto("https://stanby.co.jp/recruiters/jobs/new", timeout=20000)
                    time.sleep(2)

                    page.fill('input[name="title"], #job_title', job['title'])
                    time.sleep(0.3)
                    page.fill('textarea[name="description"], #job_description', job['description'])
                    time.sleep(0.3)
                    page.fill('input[name="location"], #job_location', job['location'])
                    time.sleep(0.3)
                    page.fill('input[name="salary"], #job_salary', job['salary'])
                    time.sleep(0.5)

                    page.click('button[type="submit"], .submit-btn, input[type="submit"]')
                    time.sleep(3)

                    progress(f"✅ 「{job['title']}」を投稿しました", "success")

                    if i < len(target_jobs) - 1:
                        progress("⏳ 次の投稿まで待機中（BAN回避）...", "info")
                        time.sleep(5)

                except Exception as e:
                    progress(f"⚠️ 「{job['title']}」の投稿中にエラー: {str(e)}", "warn")
                    continue

        except Exception as e:
            progress(f"❌ ログインエラー: {str(e)}", "error")
            browser.close()
            sys.exit(1)

        browser.close()
        progress(f"✅ {len(target_jobs)}件の投稿処理が完了しました", "success")

if __name__ == "__main__":
    main()
