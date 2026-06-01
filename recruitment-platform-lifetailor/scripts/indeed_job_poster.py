#!/usr/bin/env python3
"""
Indeed 求人掲載スクリプト（雇用主アカウント）
Node.js から subprocess として呼び出される。
標準入力からJSONで求人データを受け取り、Playwrightで投稿する。

必要な環境変数:
  INDEED_EMAIL     - Indeed雇用主アカウントのメールアドレス
  INDEED_PASSWORD  - Indeed雇用主アカウントのパスワード
"""
import json
import sys
import os
import time

def progress(message, level="info"):
    print(json.dumps({"type": "progress", "message": message, "level": level}), flush=True)

def emit_result(job_id, status, url="", error=""):
    print(json.dumps({"type": "result", "jobId": job_id, "status": status, "url": url, "error": error}), flush=True)

def main():
    try:
        jobs_json = sys.stdin.read().strip()
        jobs = json.loads(jobs_json) if jobs_json else []
    except Exception:
        jobs = []

    if not jobs:
        progress("⚠️ 投稿する求人データがありません", "warn")
        sys.exit(0)

    email    = os.environ.get("INDEED_EMAIL", "")
    password = os.environ.get("INDEED_PASSWORD", "")

    if not email or not password:
        progress("⚠️ 環境変数 INDEED_EMAIL / INDEED_PASSWORD が未設定です", "warn")
        progress("デモモードで動作します（実際の投稿は行いません）", "info")
        for job in jobs:
            time.sleep(1)
            progress(f"✅ [{job.get('title', '?')}] デモ投稿完了", "success")
            emit_result(job.get("id", ""), "demo", "https://employers.indeed.com/")
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
            # ── ログイン ──
            progress("🔑 Indeed雇用主アカウントにログイン中...", "info")
            page.goto("https://secure.indeed.com/account/login", timeout=30000)
            time.sleep(3)

            # メールアドレス入力（複数セレクター対応）
            email_selectors = [
                'input[name="emailAddress"]',
                'input[type="email"]',
                'input[id*="email"]',
                'input[autocomplete="email"]',
            ]
            email_filled = False
            for sel in email_selectors:
                try:
                    page.wait_for_selector(sel, timeout=5000)
                    page.fill(sel, email)
                    email_filled = True
                    break
                except Exception:
                    continue

            if not email_filled:
                progress("❌ メール入力欄が見つかりません", "error")
                browser.close()
                sys.exit(1)

            # 次へボタン
            for sel in ['button[type="submit"]', 'button:has-text("次へ")', 'button:has-text("Continue")']:
                try:
                    page.click(sel, timeout=3000)
                    break
                except Exception:
                    continue
            time.sleep(2)

            # パスワード入力
            pw_selectors = [
                'input[name="password"]',
                'input[type="password"]',
                'input[id*="password"]',
            ]
            pw_filled = False
            for sel in pw_selectors:
                try:
                    page.wait_for_selector(sel, timeout=5000)
                    page.fill(sel, password)
                    pw_filled = True
                    break
                except Exception:
                    continue

            if not pw_filled:
                progress("❌ パスワード入力欄が見つかりません", "error")
                browser.close()
                sys.exit(1)

            for sel in ['button[type="submit"]', 'button:has-text("ログイン")', 'button:has-text("Sign in")']:
                try:
                    page.click(sel, timeout=3000)
                    break
                except Exception:
                    continue
            time.sleep(5)

            # ログイン確認
            if "login" in page.url or "signin" in page.url or "account/login" in page.url:
                progress("❌ ログインに失敗しました。メールアドレス・パスワードを確認してください", "error")
                browser.close()
                sys.exit(1)

            progress("✅ ログイン成功", "success")

            # ── 求人ごとに投稿 ──
            for job in jobs:
                job_id    = job.get("id", "")
                title     = job.get("title", "")
                location  = job.get("location", "")
                salary    = job.get("salary", "")
                desc      = job.get("description", "")
                emp_type  = job.get("employmentType", "正社員")

                progress(f"📝 求人を投稿中: {title}", "info")

                try:
                    # 求人投稿ページへ
                    page.goto("https://employers.indeed.com/p/post-job", timeout=30000)
                    time.sleep(3)

                    # 求人タイトル
                    title_input = page.query_selector('input[name="jobTitle"], input[placeholder*="タイトル"], input[id*="title"]')
                    if title_input:
                        title_input.fill(title)
                        time.sleep(0.5)

                    # 勤務地
                    loc_input = page.query_selector('input[name="location"], input[placeholder*="勤務地"], input[id*="location"]')
                    if loc_input:
                        loc_input.fill(location)
                        time.sleep(1)
                        # サジェストがあれば最初の候補を選択
                        suggestion = page.query_selector('[class*="suggestion"]:first-child, [class*="autocomplete"] li:first-child')
                        if suggestion:
                            suggestion.click()
                            time.sleep(0.5)

                    # 雇用形態
                    try:
                        emp_map = {"正社員": "FULLTIME", "パート": "PARTTIME", "契約社員": "CONTRACT", "アルバイト": "TEMPORARY", "派遣": "TEMPORARY"}
                        emp_value = emp_map.get(emp_type, "FULLTIME")
                        page.select_option('select[name="jobType"], select[id*="jobType"]', value=emp_value)
                        time.sleep(0.5)
                    except Exception:
                        pass

                    # 給与
                    if salary:
                        try:
                            sal_input = page.query_selector('input[name="salary"], input[id*="salary"], input[placeholder*="給与"]')
                            if sal_input:
                                # 数字のみ抽出
                                sal_num = ''.join(filter(str.isdigit, salary.split("〜")[0].split("～")[0]))
                                if sal_num:
                                    sal_input.fill(sal_num)
                                    time.sleep(0.5)
                        except Exception:
                            pass

                    # 求人内容（テキストエリアまたはリッチエディタ）
                    desc_area = page.query_selector('textarea[name="jobDescription"], textarea[id*="description"], div[contenteditable="true"]')
                    if desc_area:
                        desc_area.click()
                        time.sleep(0.3)
                        desc_area.fill(desc) if desc_area.tag_name() == "textarea" else page.keyboard.type(desc)
                        time.sleep(0.5)

                    # 次へ / プレビュー / 投稿ボタン
                    for btn_text in ["次へ", "プレビュー", "確認", "投稿する", "Continue", "Preview", "Post"]:
                        btn = page.query_selector(f'button:has-text("{btn_text}"), input[value="{btn_text}"]')
                        if btn:
                            btn.click()
                            time.sleep(2)
                            break

                    # 最終投稿ボタン
                    for btn_text in ["投稿する", "掲載する", "Post Job", "Submit"]:
                        btn = page.query_selector(f'button:has-text("{btn_text}")')
                        if btn:
                            btn.click()
                            time.sleep(3)
                            break

                    current_url = page.url
                    progress(f"✅ 投稿完了: {title}", "success")
                    emit_result(job_id, "success", current_url)

                except Exception as e:
                    progress(f"❌ 投稿失敗 [{title}]: {str(e)}", "error")
                    emit_result(job_id, "error", "", str(e))

                time.sleep(2)

        except Exception as e:
            progress(f"❌ 予期しないエラー: {str(e)}", "error")
            browser.close()
            sys.exit(1)

        browser.close()
        progress("🎉 全求人の投稿処理が完了しました", "success")

if __name__ == "__main__":
    main()
