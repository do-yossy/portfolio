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
    el = page.wait_for_selector(selector, timeout=15000)
    el.click()
    rand_delay(0.3, 0.8)
    for char in text:
        page.keyboard.type(char)
        time.sleep(random.uniform(0.03, 0.12))

def dump_inputs(page):
    """デバッグ用: ページ上の全inputを列挙"""
    try:
        inputs = page.query_selector_all('input, textarea, select')
        for el in inputs:
            tag  = el.evaluate('e => e.tagName.toLowerCase()')
            t    = el.get_attribute('type') or ''
            name = el.get_attribute('name') or ''
            id_  = el.get_attribute('id') or ''
            ph   = el.get_attribute('placeholder') or ''
            cls  = el.get_attribute('class') or ''
            progress(f"  [{tag}] type={t} name={name} id={id_} placeholder={ph} class={cls[:40]}", "info")
    except Exception as e:
        progress(f"  input列挙エラー: {e}", "warn")

def save_screenshot(page, name):
    """スクリーンショットを保存"""
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        logs_dir = os.path.join(script_dir, '..', 'logs')
        os.makedirs(logs_dir, exist_ok=True)
        path = os.path.join(logs_dir, f'kyujinbox_{name}.png')
        page.screenshot(path=path, full_page=True)
        progress(f"📸 スクリーンショット保存: logs/kyujinbox_{name}.png", "info")
    except Exception as e:
        progress(f"  スクリーンショット失敗: {e}", "warn")

def find_input(page, *selectors, timeout=15000):
    """複数のセレクタを試して最初に見つかったものを返す"""
    for sel in selectors:
        try:
            el = page.wait_for_selector(sel, timeout=3000)
            if el:
                return sel
        except Exception:
            pass
    # 最後のセレクタで proper timeout
    return selectors[-1]

def find_post_url(page):
    """ダッシュボードからリンクを探して求人投稿URLを特定する"""
    try:
        links = page.query_selector_all('a[href]')
        for link in links:
            href = link.get_attribute('href') or ''
            text = (link.inner_text() or '').strip()
            if any(kw in text for kw in ['新規', '登録', '投稿', '掲載', '追加', '作成']):
                if href.startswith('http'):
                    return href
                elif href.startswith('/'):
                    return f"https://secure.kyujinbox.com{href}"
    except Exception:
        pass
    return "https://secure.kyujinbox.com/post/new"

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

        ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ja', 'en-US'] });
        """)

        page = ctx.new_page()

        try:
            progress("🔑 求人ボックスにログイン中...", "info")
            page.goto("https://secure.kyujinbox.com/login", timeout=30000)
            # ページが完全にロードされるまで待機
            page.wait_for_load_state('networkidle', timeout=15000)
            rand_delay(1.0, 2.0)

            progress(f"📍 ログインページURL: {page.url}", "info")
            progress(f"📄 タイトル: {page.title()}", "info")

            # フォームフィールドを列挙してデバッグ
            progress("🔍 フォームフィールドを確認中...", "info")
            dump_inputs(page)
            save_screenshot(page, "login_page")

            # ランダムにスクロール
            page.mouse.move(random.randint(200, 800), random.randint(100, 400))
            rand_delay(0.5, 1.0)

            # メールフィールド - 複数のセレクタを試す
            email_sel = find_input(page,
                'input[type="email"]',
                'input[name="email"]',
                'input[name="mail"]',
                'input[name="login"]',
                'input[name="username"]',
                'input[name="user_email"]',
                'input[id*="email" i]',
                'input[id*="mail" i]',
                'input[placeholder*="メール" i]',
                'input[placeholder*="mail" i]',
                'input[placeholder*="email" i]',
                'input[type="text"]:first-of-type',
            )
            progress(f"📧 メールセレクタ: {email_sel}", "info")
            human_type(page, email_sel, email)
            rand_delay(0.8, 1.5)

            # パスワードフィールド
            pass_sel = find_input(page,
                'input[type="password"]',
                'input[name="password"]',
                'input[name="pass"]',
                'input[id*="password" i]',
                'input[placeholder*="パスワード" i]',
                'input[placeholder*="password" i]',
            )
            progress(f"🔒 パスワードセレクタ: {pass_sel}", "info")
            human_type(page, pass_sel, password)
            rand_delay(0.5, 1.2)

            page.click('button[type="submit"], input[type="submit"], .login-btn, [class*="login"] button, form button')
            rand_delay(3.0, 5.0)
            page.wait_for_load_state('networkidle', timeout=10000)

            current_url = page.url
            page_title = page.title()
            progress(f"📍 ログイン後URL: {current_url}", "info")
            progress(f"📄 ページタイトル: {page_title}", "info")
            save_screenshot(page, "after_login")

            if 'login' in current_url.lower():
                error_el = page.query_selector('.error, .alert, [class*="error"], [class*="alert"], [class*="danger"]')
                err_msg = error_el.inner_text() if error_el else "ログインページから移動できませんでした"
                progress(f"❌ ログイン失敗: {err_msg}", "error")
                browser.close()
                sys.exit(1)

            progress("✅ ログイン成功", "success")

            post_url = find_post_url(page)
            progress(f"🔗 求人投稿ページ: {post_url}", "info")

            target_jobs = jobs[:batch]
            success_count = 0

            for i, job in enumerate(target_jobs):
                progress(f"📝 [{i+1}/{len(target_jobs)}] 「{job['title']}」を投稿中...", "info")
                rand_delay(1.5, 3.0)

                try:
                    page.goto(post_url, timeout=20000)
                    page.wait_for_load_state('networkidle', timeout=10000)
                    rand_delay(1.5, 3.0)

                    actual_url = page.url
                    progress(f"📍 投稿フォームURL: {actual_url}", "info")
                    dump_inputs(page)
                    save_screenshot(page, f"post_form_{i}")

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

                    if i < len(target_jobs) - 1:
                        wait = random.uniform(8.0, 20.0)
                        progress(f"⏳ 次の投稿まで {wait:.0f}秒 待機中（BAN回避）...", "info")
                        time.sleep(wait)

                except Exception as e:
                    progress(f"⚠️ 「{job['title']}」の投稿中にエラー: {str(e)}", "warn")
                    try:
                        progress(f"   現在のURL: {page.url}", "warn")
                        save_screenshot(page, f"error_{i}")
                    except Exception:
                        pass
                    continue

        except Exception as e:
            progress(f"❌ ログインエラー: {str(e)}", "error")
            try:
                progress(f"   現在のURL: {page.url}", "error")
                save_screenshot(page, "login_error")
            except Exception:
                pass
            browser.close()
            sys.exit(1)

        browser.close()
        progress(f"✅ {success_count}/{len(target_jobs)}件の投稿処理が完了しました", "success")

if __name__ == "__main__":
    main()
