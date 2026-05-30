#!/usr/bin/env python3
"""
Indeed 自動掲載スクリプト
Node.js から subprocess として呼び出される。
標準入力からJSONで求人データを受け取り、Playwrightで Indeed に掲載する。

Indeed への掲載方法:
  1. Indeed 掲載管理画面 (employers.indeed.com) にログイン
  2. 「求人を掲載する」から新規掲載
  3. 各フィールドを入力して送信

注意:
  - 1日あたりの掲載上限に注意（BAN回避のため最大2件/回）
  - 掲載後は反映まで数時間かかる場合あり
  - 有料掲載（スポンサード）への自動昇格は行わない
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
        progress("⚠️ 掲載する求人データがありません", "warn")
        sys.exit(0)

    email    = os.environ.get("INDEED_EMAIL", "")
    password = os.environ.get("INDEED_PASSWORD", "")

    if not email or not password:
        progress("⚠️ 環境変数 INDEED_EMAIL / INDEED_PASSWORD が未設定です", "warn")
        progress("デモモードで動作します（実際の掲載は行いません）", "info")
        for job in jobs[:2]:
            time.sleep(1.0)
            progress(f"📝 「{job['title']}」を掲載中...（シミュレーション）", "info")
            time.sleep(1.2)
            progress(f"✅ 「{job['title']}」を掲載しました（シミュレーション）", "success")
            if jobs.index(job) < len(jobs[:2]) - 1:
                progress("⏳ 次の掲載まで待機中（BAN回避）...", "info")
                time.sleep(1.5)
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
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            locale="ja-JP"
        )
        page = ctx.new_page()

        try:
            progress("🔑 Indeed 掲載管理画面にログイン中...", "info")
            page.goto("https://employers.indeed.com/p/login", timeout=30000)
            time.sleep(2)

            # メールアドレス入力
            page.fill('input[type="email"], input[name="email"], #signin-email-input', email)
            page.click('button[type="submit"], #signin-email-button')
            time.sleep(2)

            # パスワード入力
            page.fill('input[type="password"], input[name="password"], #signin-password-input', password)
            page.click('button[type="submit"], #signin-password-button')
            time.sleep(3)

            # ログイン確認
            if "employers.indeed.com" not in page.url or "login" in page.url:
                progress("⚠️ ログインに失敗した可能性があります。ページを確認します...", "warn")

            # BAN回避: 最大2件/回
            target_jobs = jobs[:2]

            for i, job in enumerate(target_jobs):
                progress(f"📝 「{job['title']}」を掲載中...", "info")
                time.sleep(1)

                try:
                    # 求人掲載フォームへ移動
                    page.goto("https://employers.indeed.com/jobposting", timeout=20000)
                    time.sleep(2)

                    # 職種・タイトル
                    page.fill('input[name="jobTitle"], #job-title-input, [data-testid="job-title-input"]', job['title'])
                    time.sleep(0.4)

                    # 会社名（既に入力済みの場合はスキップ）
                    company_input = page.query_selector('input[name="company"], #company-name-input')
                    if company_input and not company_input.input_value():
                        company_input.fill(os.environ.get("COMPANY_NAME", ""))
                    time.sleep(0.3)

                    # 勤務地
                    page.fill('input[name="jobLocation"], #location-input, [data-testid="location-input"]', job['location'])
                    time.sleep(0.4)

                    # 雇用形態
                    try:
                        emp_type = job.get("employment_type", "")
                        if "パート" in emp_type or "アルバイト" in emp_type:
                            page.check('input[value="PART_TIME"]')
                        elif "契約" in emp_type:
                            page.check('input[value="CONTRACT"]')
                        elif "派遣" in emp_type:
                            page.check('input[value="TEMPORARY"]')
                        else:
                            page.check('input[value="FULL_TIME"]')
                    except Exception:
                        pass
                    time.sleep(0.3)

                    # 給与
                    try:
                        salary_text = job.get("salary", "")
                        # 数字だけ抽出して入力（例: "月給25万円" → "250000"）
                        import re
                        nums = re.findall(r'[\d,]+', salary_text.replace('万', '0000').replace(',', ''))
                        if nums:
                            page.fill('input[name="salaryMin"], #salary-min-input', nums[0].replace(',', ''))
                    except Exception:
                        pass
                    time.sleep(0.3)

                    # 求人詳細
                    page.fill(
                        'textarea[name="jobDescription"], #job-description-input, [data-testid="job-description-input"]',
                        job['description']
                    )
                    time.sleep(0.5)

                    # 応募ページURL（自社サイト）
                    site_url = os.environ.get("SITE_URL", "")
                    if site_url:
                        try:
                            page.fill(
                                'input[name="applyUrl"], #apply-url-input',
                                f"{site_url}/jobs/{job['id']}"
                            )
                        except Exception:
                            pass
                    time.sleep(0.3)

                    # 掲載ボタンをクリック
                    page.click('button[type="submit"], [data-testid="submit-button"], .submit-button')
                    time.sleep(4)

                    progress(f"✅ 「{job['title']}」を掲載しました", "success")

                    if i < len(target_jobs) - 1:
                        progress("⏳ 次の掲載まで待機中（BAN回避）...", "info")
                        time.sleep(5)

                except Exception as e:
                    progress(f"⚠️ 「{job['title']}」の掲載中にエラー: {str(e)}", "warn")
                    continue

        except Exception as e:
            progress(f"❌ ログインエラー: {str(e)}", "error")
            browser.close()
            sys.exit(1)

        browser.close()
        target_jobs = jobs[:2]
        progress(f"✅ {len(target_jobs)}件の掲載処理が完了しました", "success")

if __name__ == "__main__":
    main()
