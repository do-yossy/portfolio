#!/usr/bin/env python3
"""
求人ボックス フォーム構造ダンプスクリプト
指定URLのフォームフィールドを全て調査してJSONで出力する
"""
import os
import sys
import json
import io
import time
import random

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

TARGET_URL = "https://saiyo.kyujinbox.com/company/groups/G5922-7577-0001/jobs/edit/5922-7577-0619"

def main():
    email    = os.environ.get("KYUJINBOX_EMAIL", "")
    password = os.environ.get("KYUJINBOX_PASSWORD", "")

    if not email or not password:
        print("KYUJINBOX_EMAIL / KYUJINBOX_PASSWORD が未設定")
        sys.exit(1)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed")
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

        # ログイン
        print("=== ログイン中 ===")
        page.goto("https://secure.kyujinbox.com/login", timeout=30000)
        page.wait_for_load_state('networkidle', timeout=15000)
        time.sleep(2)

        # メール
        for sel in ['input[name="login[email]"]', 'input[type="email"]', 'input[name="email"]']:
            try:
                el = page.wait_for_selector(sel, timeout=3000)
                if el:
                    el.fill(email)
                    break
            except Exception:
                pass

        # パスワード
        for sel in ['input[name="login[password]"]', 'input[type="password"]', 'input[name="password"]']:
            try:
                el = page.wait_for_selector(sel, timeout=3000)
                if el:
                    el.fill(password)
                    break
            except Exception:
                pass

        page.click('button[type="submit"], input[type="submit"], form button')
        time.sleep(4)
        page.wait_for_load_state('networkidle', timeout=15000)
        print(f"ログイン後URL: {page.url}")

        if 'login' in page.url.lower():
            print("❌ ログイン失敗")
            browser.close()
            sys.exit(1)

        print("✅ ログイン成功")

        # 対象URLへ移動
        print(f"\n=== フォームページへ移動: {TARGET_URL} ===")
        page.goto(TARGET_URL, timeout=30000)
        page.wait_for_load_state('networkidle', timeout=15000)
        time.sleep(3)
        print(f"現在URL: {page.url}")
        print(f"タイトル: {page.title()}")

        # スクリーンショット
        os.makedirs("logs", exist_ok=True)
        page.screenshot(path="logs/form_dump_top.png", full_page=False)
        print("📸 スクリーンショット保存: logs/form_dump_top.png")

        # フォーム全フィールドを解析
        print("\n=== フォームフィールド一覧 ===")
        result = page.evaluate("""() => {
            const fields = [];
            const els = document.querySelectorAll('input, textarea, select, button');

            for (const el of els) {
                const tag = el.tagName.toLowerCase();
                const name = el.getAttribute('name') || '';
                const id = el.getAttribute('id') || '';
                const type = el.getAttribute('type') || '';
                const placeholder = el.getAttribute('placeholder') || '';
                const cls = (el.getAttribute('class') || '').substring(0, 60);
                const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';

                let value = '';
                let checked = null;
                let options = null;
                let labelText = '';

                // ラベルを探す
                if (id) {
                    const lbl = document.querySelector('label[for="' + id + '"]');
                    if (lbl) labelText = lbl.textContent.trim().substring(0, 50);
                }
                const closestLabel = el.closest('label');
                if (closestLabel && !labelText) {
                    labelText = closestLabel.textContent.trim().substring(0, 50);
                }
                // 親ノードのラベルテキストを探す
                if (!labelText) {
                    const parent = el.parentElement;
                    if (parent) {
                        const lbl = parent.querySelector('label');
                        if (lbl) labelText = lbl.textContent.trim().substring(0, 50);
                    }
                }

                if (tag === 'select') {
                    value = el.value;
                    options = Array.from(el.options).map(o => ({
                        value: o.value,
                        text: o.text.trim(),
                        selected: o.selected
                    }));
                } else if (type === 'checkbox' || type === 'radio') {
                    checked = el.checked;
                    value = el.value || '';
                } else if (tag === 'button') {
                    value = el.textContent.trim().substring(0, 40);
                } else {
                    value = el.value || '';
                }

                // visible チェック
                const rect = el.getBoundingClientRect();
                const visible = rect.width > 0 || rect.height > 0;

                fields.push({
                    tag, name, id, type, placeholder, cls,
                    required, value, checked, options, labelText, visible
                });
            }
            return fields;
        }""")

        # 表示
        print(f"\n総フィールド数: {len(result)}")
        print("\n--- input/textarea/select ---")
        for f in result:
            if f['tag'] == 'button':
                continue
            line = f"[{f['tag']}] name={f['name']!r:30s} type={f['type']!r:12s} label={f['labelText']!r:30s}"
            if f['options'] is not None:
                opts_str = ', '.join([f"{o['value']}:{o['text']}" for o in f['options'][:8]])
                line += f"\n    options({len(f['options'])}): {opts_str}"
                if f['value']:
                    line += f"\n    selected_value={f['value']!r}"
            elif f['checked'] is not None:
                line += f" checked={f['checked']} value={f['value']!r}"
            elif f['value']:
                line += f" value={f['value']!r:30s}"
            if f['required']:
                line += " [REQUIRED]"
            print(line)

        print("\n--- buttons ---")
        for f in result:
            if f['tag'] == 'button':
                print(f"[button] type={f['type']!r} cls={f['cls']!r:50s} text={f['value']!r}")

        # JSON保存
        with open("logs/form_fields.json", "w", encoding="utf-8") as fp:
            json.dump(result, fp, ensure_ascii=False, indent=2)
        print("\n💾 フィールド詳細: logs/form_fields.json")

        # ページHTML保存
        html = page.content()
        with open("logs/form_page.html", "w", encoding="utf-8") as fp:
            fp.write(html)
        print("💾 ページHTML: logs/form_page.html")

        # ページを全スクロールしてスクリーンショット
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1)
        page.screenshot(path="logs/form_dump_bottom.png", full_page=False)
        print("📸 スクリーンショット保存: logs/form_dump_bottom.png")

        page.screenshot(path="logs/form_dump_full.png", full_page=True)
        print("📸 全体スクリーンショット: logs/form_dump_full.png")

        input("\n[Enter] でブラウザを閉じる...")
        browser.close()

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    main()
