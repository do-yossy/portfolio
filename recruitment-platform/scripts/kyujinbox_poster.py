#!/usr/bin/env python3
"""
求人ボックス 自動投稿スクリプト
Node.js から subprocess として呼び出される。
標準入力からJSONで求人データを受け取り、Playwrightで投稿する。
"""
import json
import sys
import os
import io
import time
import random
import re
from urllib.parse import urlparse

# Windows での文字化け対策
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

PREFECTURES = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
    '岐阜県', '静岡県', '愛知県', '三重県',
    '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県',
    '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

def progress(message, level="info"):
    print(json.dumps({"type": "progress", "message": message, "level": level}), flush=True)

def rand_delay(min_s=1.5, max_s=4.0):
    time.sleep(random.uniform(min_s, max_s))

def extract_prefecture(location):
    """住所文字列から都道府県を抽出"""
    for pref in PREFECTURES:
        if pref in location:
            return pref
    return None

def parse_salary(salary_str):
    """
    給与文字列を解析して (payType, payMin, payMax) を返す
    例: "時給1,200円"      → ("時給", "1200", "")
        "月給20〜30万円"   → ("月給", "200000", "300000")
        "年収300万円"      → ("年収", "3000000", "")
    """
    if '時給' in salary_str:
        pay_type = '時給'
    elif '日給' in salary_str:
        pay_type = '日給'
    elif '月給' in salary_str:
        pay_type = '月給'
    elif '年収' in salary_str or '年俸' in salary_str:
        pay_type = '年収'
    else:
        pay_type = '月給'

    man_match = re.findall(r'(\d+(?:\.\d+)?)万', salary_str)
    if man_match:
        values = [int(float(v) * 10000) for v in man_match]
    else:
        raw = re.findall(r'[\d,]+', salary_str)
        values = [int(v.replace(',', '')) for v in raw if len(v.replace(',', '')) >= 3]

    pay_min = str(values[0]) if values else ''
    pay_max = str(values[1]) if len(values) > 1 else ''
    return pay_type, pay_min, pay_max

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
            progress(f"  [{tag}] type={t} name={name} id={id_} placeholder={ph}", "info")
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

def find_input(page, *selectors):
    """複数のセレクタを試して最初に見つかったものを返す"""
    for sel in selectors:
        try:
            el = page.wait_for_selector(sel, timeout=3000)
            if el:
                return sel
        except Exception:
            pass
    return selectors[-1]

def get_base_url(url):
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"

def human_type(page, selector, text, timeout=15000):
    """人間らしいランダム速度でテキストを入力"""
    el = page.wait_for_selector(selector, timeout=timeout)
    el.click()
    rand_delay(0.3, 0.8)
    for char in text:
        page.keyboard.type(char)
        time.sleep(random.uniform(0.03, 0.12))

def fill_text(page, selector, value, timeout=8000):
    """テキスト/テキストエリアを fill() で埋める（失敗時は無視）"""
    try:
        el = page.wait_for_selector(selector, timeout=timeout)
        el.click()
        el.fill(value)
        rand_delay(0.2, 0.5)
        return True
    except Exception:
        return False

def select_option_safe(page, selector, label=None, value=None, timeout=5000, debug=False):
    """select要素を安全にセット。失敗時はオプション一覧をログ出力"""
    try:
        el = page.wait_for_selector(selector, timeout=timeout)
        # まずラベルで試す
        if label:
            try:
                el.select_option(label=label)
                rand_delay(0.2, 0.5)
                return True
            except Exception:
                pass
            # ラベル部分一致で試す
            try:
                opts = el.query_selector_all('option')
                for opt in opts:
                    txt = (opt.inner_text() or '').strip()
                    if label in txt or txt in label:
                        val = opt.get_attribute('value') or ''
                        el.select_option(value=val)
                        progress(f"    select 部分一致: '{txt}' (value={val})", "info")
                        rand_delay(0.2, 0.5)
                        return True
            except Exception:
                pass
            # 失敗時にオプション一覧を表示
            if debug:
                try:
                    opts = el.query_selector_all('option')
                    progress(f"  ⚠️ select '{label}' 選択失敗。利用可能なオプション:", "warn")
                    for opt in opts[:15]:
                        v = opt.get_attribute('value') or ''
                        t = (opt.inner_text() or '').strip()
                        progress(f"    value='{v}' text='{t}'", "warn")
                except Exception:
                    pass
        elif value:
            el.select_option(value=value)
            rand_delay(0.2, 0.5)
            return True
        return False
    except Exception:
        return False

def click_submit_button(page):
    """フォームの送信ボタンをクリック（複数の方法を試す）"""
    # ページ末尾までスクロール
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    rand_delay(0.5, 1.0)

    # デバッグ: ページ上のボタン一覧を表示
    try:
        buttons = page.query_selector_all('button, input[type="submit"]')
        progress(f"  🔍 ボタン数: {len(buttons)}", "info")
        for btn in buttons[:15]:
            try:
                tag = btn.evaluate('e => e.tagName.toLowerCase()')
                typ = btn.get_attribute('type') or ''
                cls = (btn.get_attribute('class') or '')[:50]
                txt = (btn.inner_text() or '').strip()[:40]
                progress(f"    [{tag}] type={typ} class={cls} text={txt}", "info")
            except Exception:
                pass
    except Exception:
        pass

    # 日本語テキストで試す（複数ある場合は最後のものを使う）
    for label in ['求人を保存', '保存して確認', '登録する', '保存する', '掲載する', '公開する', '次へ', '保存', '登録', '投稿', '確認', '公開', '送信']:
        for tag in ['button', 'a']:
            try:
                locator = page.locator(f'{tag}:has-text("{label}")')
                count = locator.count()
                if count > 0:
                    # 最後のボタン（フォーム末尾の送信ボタン）を使う
                    el = locator.last
                    if el.is_visible():
                        el.scroll_into_view_if_needed()
                        rand_delay(0.3, 0.6)
                        el.click()
                        progress(f"  ✅ ボタンクリック: {tag}:has-text(\"{label}\") (最後の{count}個目)", "info")
                        return True
            except Exception:
                pass

    # CSSクラス・タイプで試す
    for sel in [
        'button[type="submit"]', 'input[type="submit"]', '[type="submit"]',
        '.btn-primary', '.btn-submit', '.submit-btn',
        'form button:last-of-type', 'form button',
    ]:
        try:
            el = page.wait_for_selector(sel, timeout=2000)
            if el and el.is_visible():
                el.scroll_into_view_if_needed()
                rand_delay(0.3, 0.6)
                el.click()
                progress(f"  ✅ ボタンクリック: {sel}", "info")
                return True
        except Exception:
            pass

    # 最終手段: JS で form.submit()
    try:
        page.evaluate("document.querySelector('form').submit()")
        progress("  ✅ JavaScript form.submit() を実行", "info")
        return True
    except Exception as e:
        progress(f"  ❌ 送信ボタンが見つかりません: {e}", "error")
        return False


def find_post_url(page):
    """ダッシュボードから求人新規作成URLを特定する"""
    current_url = page.url
    base = get_base_url(current_url)

    try:
        links = page.query_selector_all('a[href]')
        for link in links:
            href = link.get_attribute('href') or ''
            text = (link.inner_text() or '').strip()
            if any(kw in text for kw in ['新規', '登録', '投稿', '掲載', '追加', '作成', '求人を出す', '求人を作成']):
                if href.startswith('http'):
                    return href
                elif href.startswith('/'):
                    return f"{base}{href}"
    except Exception:
        pass

    if current_url.rstrip('/').endswith('/jobs'):
        return current_url.rstrip('/') + '/new'

    return f"{base}/jobs/new"


def fill_kyujinbox_form(page, job, company_name):
    """
    求人ボックスの求人フォームを埋める。
    フォームフィールド（フォームダンプで確認済み）:
      name=company, name=title, name=jobType (select),
      name=employTypes (checkbox), name=description, name=rewarding,
      name=qualifications, name=image (file),
      name=prefVal (select), name=address, name=transportation,
      name=payType (select), name=payMin, name=payMax, name=benefit,
      name=worktimeHoliday, name=resumeRequired (radio),
      name=isPhoneNumberRequired, name=applicationPhoneNumber,
      name=howToApply, name=agree_main (checkbox), name=agree_side (checkbox)
    """
    # 会社名（アカウントに紐付いているので任意だが念のため）
    fill_text(page, 'input[name="company"]', company_name, timeout=5000)
    rand_delay(0.3, 0.7)

    # タイトル（必須）
    human_type(page, 'input[name="title"]', job['title'])
    rand_delay(0.5, 1.0)

    # 仕事内容（必須）
    fill_text(page, 'textarea[name="description"]', job.get('description', ''))
    rand_delay(0.5, 1.0)

    # 職種 (select) - 値が合わなくてもエラーにしない（debug=Trueでオプション表示）
    job_type = job.get('jobType', '')
    if job_type:
        select_option_safe(page, 'select[name="jobType"]', label=job_type, debug=True)
        rand_delay(0.3, 0.6)

    # 都道府県 (select) ← name=prefVal
    location = job.get('location', '')
    pref = extract_prefecture(location)
    if pref:
        ok = select_option_safe(page, 'select[name="prefVal"]', label=pref, debug=True)
        if not ok:
            progress(f"  ⚠️ 都道府県 '{pref}' の選択失敗", "warn")
        rand_delay(0.3, 0.7)

    # 住所テキスト ← name=address
    fill_text(page, 'input[name="address"]', location)
    rand_delay(0.3, 0.7)

    # 給与タイプ・金額
    salary_str = job.get('salary', '')
    pay_type, pay_min, pay_max = parse_salary(salary_str)
    progress(f"  💰 給与解析: タイプ={pay_type}, 最小={pay_min}, 最大={pay_max}", "info")

    select_option_safe(page, 'select[name="payType"]', label=pay_type, debug=True)
    rand_delay(0.2, 0.5)

    if pay_min:
        fill_text(page, 'input[name="payMin"]', pay_min)
        rand_delay(0.2, 0.5)

    if pay_max:
        fill_text(page, 'input[name="payMax"]', pay_max)
        rand_delay(0.2, 0.5)

    # 給与詳細テキスト ← name=benefit
    fill_text(page, 'textarea[name="benefit"]', salary_str)
    rand_delay(0.3, 0.6)

    # 応募資格（タグをテキストとして入力）
    tags = job.get('tags', [])
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except Exception:
            tags = []
    if tags:
        qual_text = ' / '.join(tags)
        fill_text(page, 'textarea[name="qualifications"]', qual_text)
        rand_delay(0.3, 0.6)

    # 同意チェックボックス（必須）← name=agree_main (複数あり)
    try:
        agree_boxes = page.query_selector_all('input[name="agree_main"]')
        for cb in agree_boxes:
            if not cb.is_checked():
                cb.check()
                rand_delay(0.2, 0.4)
    except Exception as e:
        progress(f"  ⚠️ agree_main チェック失敗: {e}", "warn")

    try:
        cb_side = page.query_selector('input[name="agree_side"]')
        if cb_side and not cb_side.is_checked():
            cb_side.check()
            rand_delay(0.2, 0.4)
    except Exception:
        pass


def main():
    try:
        jobs_json = sys.stdin.read().strip()
        jobs = json.loads(jobs_json) if jobs_json else []
    except Exception:
        jobs = []

    if not jobs:
        progress("⚠️ 投稿する求人データがありません", "warn")
        sys.exit(0)

    email        = os.environ.get("KYUJINBOX_EMAIL", "")
    password     = os.environ.get("KYUJINBOX_PASSWORD", "")
    company_name = os.environ.get("COMPANY_NAME", "株式会社Social Quality")
    batch        = int(os.environ.get("KYUJINBOX_BATCH_SIZE", str(len(jobs))))

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
            page.wait_for_load_state('networkidle', timeout=15000)
            rand_delay(1.0, 2.0)

            progress(f"📍 ログインページURL: {page.url}", "info")
            page.mouse.move(random.randint(200, 800), random.randint(100, 400))
            rand_delay(0.5, 1.0)

            email_sel = find_input(page,
                'input[name="login[email]"]',
                'input[id="login_email"]',
                'input[type="email"]',
                'input[name="email"]',
                'input[id*="email" i]',
                'input[placeholder*="メール" i]',
                'input[type="text"]:first-of-type',
            )
            progress(f"📧 メールセレクタ: {email_sel}", "info")
            human_type(page, email_sel, email)
            rand_delay(0.8, 1.5)

            pass_sel = find_input(page,
                'input[name="login[password]"]',
                'input[id="login_password"]',
                'input[type="password"]',
                'input[name="password"]',
                'input[id*="password" i]',
            )
            progress(f"🔒 パスワードセレクタ: {pass_sel}", "info")
            human_type(page, pass_sel, password)
            rand_delay(0.5, 1.2)

            page.click('button[type="submit"], input[type="submit"], .login-btn, form button')
            rand_delay(3.0, 5.0)
            page.wait_for_load_state('networkidle', timeout=15000)

            current_url = page.url
            progress(f"📍 ログイン後URL: {current_url}", "info")
            progress(f"📄 ページタイトル: {page.title()}", "info")
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
                    # 1件目だけフィールド一覧をダンプ（ログが長くなるので以降は省略）
                    if i == 0:
                        dump_inputs(page)
                    save_screenshot(page, f"post_form_{i}")

                    fill_kyujinbox_form(page, job, company_name)
                    rand_delay(0.8, 1.8)
                    save_screenshot(page, f"before_submit_{i}")

                    submitted = click_submit_button(page)
                    if not submitted:
                        progress(f"⚠️ 「{job['title']}」: 送信ボタンが見つかりませんでした", "warn")
                        save_screenshot(page, f"no_submit_{i}")
                        continue
                    rand_delay(3.0, 6.0)
                    page.wait_for_load_state('networkidle', timeout=15000)

                    final_url = page.url
                    progress(f"📍 送信後URL: {final_url}", "info")
                    save_screenshot(page, f"after_submit_{i}")

                    # 送信後も /edit のままならバリデーションエラーの可能性
                    if '/edit' in final_url:
                        # エラーメッセージを幅広く探す
                        error_texts = []
                        for err_sel in [
                            '.c-errorMessage', '.p-errorMessage', '.c-error',
                            '[class*="error"]', '[class*="Error"]',
                            '.alert', '[class*="alert"]',
                            '[class*="invalid"]', '[class*="Invalid"]',
                        ]:
                            try:
                                els = page.query_selector_all(err_sel)
                                for el in els:
                                    t = el.inner_text().strip()
                                    if t and t not in error_texts:
                                        error_texts.append(t[:100])
                            except Exception:
                                pass
                        if error_texts:
                            progress(f"   ❌ バリデーションエラー:", "warn")
                            for et in error_texts[:10]:
                                progress(f"      {et}", "warn")
                        else:
                            progress(f"   ⚠️ 送信後も編集ページ（エラー文言不明 - スクリーンショット確認）", "warn")
                    else:
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
