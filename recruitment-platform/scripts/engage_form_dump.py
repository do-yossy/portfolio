#!/usr/bin/env python3
"""
engage（エンゲージ）フォーム構造ダンプスクリプト
------------------------------------------------------------
engageの求人作成フォームの入力欄・プルダウン・ボタンを全て調査してJSON化する。
このダンプ結果をもとに engage_poster.py（自動投稿本体）を作成する。

■ 使い方（Windows）
  1) .env に engage のログイン情報を設定
       ENGAGE_EMAIL=...            （または ENGAGE_EMAIL_NL など会社別）
       ENGAGE_PASSWORD=...
       ENGAGE_LOGIN_URL=...        （任意・ログインページURL。未設定なら既定値）
  2) 実行:
       python scripts/engage_form_dump.py
  3) 表示されたブラウザで engage にログイン → 求人作成フォームまで進む
  4) コンソールで [Enter] を押すと、その時点のフォーム構造を保存
       logs/engage_form_fields.json   … フィールド詳細（これを共有してください）
       logs/engage_form_page.html     … ページHTML
       logs/engage_form_*.png         … スクリーンショット

※ ログインは自動で試みますが、engage側の画面によっては手動ログインでもOKです
  （ブラウザは表示状態＝headless=Falseで起動します）。
"""
import os
import sys
import json
import io
import time

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

# .env 読み込み（存在すれば）
import pathlib
_env_path = pathlib.Path(__file__).parent.parent / '.env'
if _env_path.exists():
    for _line in _env_path.read_text(encoding='utf-8').splitlines():
        _line = _line.strip()
        if not _line or _line.startswith('#') or '=' not in _line:
            continue
        _k, _v = _line.split('=', 1)
        if _k.strip() and _k.strip() not in os.environ:
            os.environ[_k.strip()] = _v.strip()

# 会社別（ENGAGE_EMAIL_<CO>）→ 無印 の順で解決
CO = (os.environ.get("ENGAGE_CO", "") or "").upper()


def _pick(base):
    if CO:
        v = (os.environ.get(f"{base}_{CO}", "") or "").strip()
        if v:
            return v
    return (os.environ.get(base, "") or "").strip()


EMAIL = _pick("ENGAGE_EMAIL")
PASSWORD = _pick("ENGAGE_PASSWORD")
# ログインページURL（engageの管理画面ログイン）。判明したら .env で上書き可能。
LOGIN_URL = _pick("ENGAGE_LOGIN_URL") or "https://en-gage.net/company_login/login/"
# 求人作成フォームURL（判明していれば直接遷移。未設定なら手動で進む）
JOB_NEW_URL = _pick("ENGAGE_JOB_NEW_URL")

# フォーム構造を抽出するJS（求人ボックスのダンプと同じロジック）
DUMP_JS = r"""() => {
    const fields = [];
    const els = document.querySelectorAll('input, textarea, select, button');
    for (const el of els) {
        const tag = el.tagName.toLowerCase();
        const name = el.getAttribute('name') || '';
        const id = el.getAttribute('id') || '';
        const type = el.getAttribute('type') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        const cls = (el.getAttribute('class') || '').substring(0, 80);
        const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
        let value = '', checked = null, options = null, labelText = '';
        if (id) {
            const lbl = document.querySelector('label[for="' + CSS.escape(id) + '"]');
            if (lbl) labelText = lbl.textContent.trim().substring(0, 60);
        }
        const closestLabel = el.closest('label');
        if (closestLabel && !labelText) labelText = closestLabel.textContent.trim().substring(0, 60);
        if (!labelText && el.parentElement) {
            const lbl = el.parentElement.querySelector('label');
            if (lbl) labelText = lbl.textContent.trim().substring(0, 60);
        }
        if (tag === 'select') {
            value = el.value;
            options = Array.from(el.options).map(o => ({ value: o.value, text: o.text.trim(), selected: o.selected }));
        } else if (type === 'checkbox' || type === 'radio') {
            checked = el.checked; value = el.value || '';
        } else if (tag === 'button') {
            value = el.textContent.trim().substring(0, 50);
        } else {
            value = el.value || '';
        }
        const rect = el.getBoundingClientRect();
        const visible = rect.width > 0 || rect.height > 0;
        fields.push({ tag, name, id, type, placeholder, cls, required, value, checked, options, labelText, visible });
    }
    return fields;
}"""


def dump_page(page, tag):
    os.makedirs("logs", exist_ok=True)
    print(f"\n=== ダンプ実行: {tag} ===")
    print(f"現在URL: {page.url}")
    try:
        print(f"タイトル: {page.title()}")
    except Exception:
        pass
    try:
        page.screenshot(path=f"logs/engage_form_{tag}_top.png", full_page=False)
    except Exception:
        pass

    result = page.evaluate(DUMP_JS)
    print(f"総フィールド数: {len(result)}")
    print("\n--- input/textarea/select ---")
    for f in result:
        if f['tag'] == 'button':
            continue
        line = f"[{f['tag']}] name={f['name']!r} type={f['type']!r} label={f['labelText']!r}"
        if f['options'] is not None:
            opts = ', '.join([f"{o['value']}:{o['text']}" for o in f['options'][:10]])
            line += f"\n    options({len(f['options'])}): {opts}"
        elif f['checked'] is not None:
            line += f" checked={f['checked']} value={f['value']!r}"
        elif f['value']:
            line += f" value={f['value']!r}"
        if f['required']:
            line += " [REQUIRED]"
        print(line)

    print("\n--- buttons ---")
    for f in result:
        if f['tag'] == 'button':
            print(f"[button] type={f['type']!r} text={f['value']!r} cls={f['cls']!r}")

    with open(f"logs/engage_form_fields.json", "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)
    with open(f"logs/engage_form_page.html", "w", encoding="utf-8") as fp:
        fp.write(page.content())
    try:
        page.screenshot(path=f"logs/engage_form_{tag}_full.png", full_page=True)
    except Exception:
        pass
    print("\n💾 保存: logs/engage_form_fields.json / logs/engage_form_page.html / logs/engage_form_*.png")


def try_login(page):
    print(f"=== ログインページへ: {LOGIN_URL} ===")
    try:
        page.goto(LOGIN_URL, timeout=30000)
        page.wait_for_load_state('networkidle', timeout=15000)
    except Exception as e:
        print(f"（ログインページ遷移で例外: {e}）")
    time.sleep(2)

    if not EMAIL or not PASSWORD:
        print("ℹ️ ENGAGE_EMAIL / ENGAGE_PASSWORD 未設定。ブラウザで手動ログインしてください。")
        return

    # メール
    for sel in ['input[type="email"]', 'input[name*="mail" i]', 'input[name*="login" i]', 'input[id*="mail" i]']:
        try:
            el = page.wait_for_selector(sel, timeout=2500)
            if el:
                el.fill(EMAIL)
                print(f"  メール入力: {sel}")
                break
        except Exception:
            pass
    # パスワード
    for sel in ['input[type="password"]', 'input[name*="pass" i]', 'input[id*="pass" i]']:
        try:
            el = page.wait_for_selector(sel, timeout=2500)
            if el:
                el.fill(PASSWORD)
                print(f"  パスワード入力: {sel}")
                break
        except Exception:
            pass
    # 送信
    for sel in ['button[type="submit"]', 'input[type="submit"]',
                'button:has-text("ログイン")', 'a:has-text("ログイン")', 'form button']:
        try:
            el = page.locator(sel).first
            if el.count() > 0 and el.is_visible():
                el.click()
                print(f"  送信クリック: {sel}")
                break
        except Exception:
            pass
    time.sleep(4)
    try:
        page.wait_for_load_state('networkidle', timeout=15000)
    except Exception:
        pass
    print(f"ログイン後URL: {page.url}")


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright が未インストールです（pip install playwright / playwright install chromium）")
        sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            viewport={"width": 1440, "height": 900},
            locale="ja-JP",
            timezone_id="Asia/Tokyo",
        )
        page = ctx.new_page()

        try_login(page)

        if JOB_NEW_URL:
            print(f"\n=== 求人作成フォームへ直接遷移: {JOB_NEW_URL} ===")
            try:
                page.goto(JOB_NEW_URL, timeout=30000)
                page.wait_for_load_state('networkidle', timeout=15000)
                time.sleep(2)
            except Exception as e:
                print(f"（遷移で例外: {e}）")

        print("\n" + "=" * 60)
        print("表示されたブラウザで engage にログインし、")
        print("『求人を作成／編集する画面（入力フォーム）』まで進んでください。")
        print("フォームが表示された状態で、このコンソールに戻り [Enter] を押すと")
        print("その画面のフォーム構造を保存します。")
        print("=" * 60)
        try:
            input("\n準備ができたら [Enter] を押してダンプ実行 ... ")
        except EOFError:
            pass

        dump_page(page, "main")

        print("\n別の画面（次のステップ等）もダンプしたい場合は、その画面へ進んで再度 [Enter]。")
        print("終了する場合はそのまま [Enter]（同じファイルに上書き保存されます）。")
        try:
            input("\n[Enter] で追加ダンプ or 終了 ... ")
            dump_page(page, "step2")
        except EOFError:
            pass

        try:
            input("\n[Enter] でブラウザを閉じる ... ")
        except EOFError:
            pass
        browser.close()
        print("\n✅ 完了。logs/engage_form_fields.json を共有してください。")


if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    main()
