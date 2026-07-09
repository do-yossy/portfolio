#!/usr/bin/env python3
"""
求人ボックス 掲載反映スクリプト（AI改善内容を既存掲載へ反映）
Node.js から subprocess として呼び出される。標準入力からJSON配列を受け取る:
  [{ "jobNumber": "5922-7577-1618", "title": "...", "description": "...", "rewarding": "..." }, ...]
各求人の編集ページ /jobs/edit/<jobNumber> を開き、Vueフォームの
title / description / rewarding を新しい値に置き換える。
  環境変数 APPLY=1 のときだけ保存（公開）する。既定はドライラン（入力＋スクショのみ・保存しない）。
  HEADLESS=0 でブラウザを可視化（初回の supervised 実行用）。
会社別認証(KYUJINBOX_*_<CO>)はサーバー/CLIが env で注入する。
"""
import json
import sys
import os
import io
import time
import random

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')


def progress(message, level="info"):
    print(json.dumps({"type": "progress", "message": str(message) if message is not None else "", "level": level}), flush=True)


def reflected(job_number, saved):
    print(json.dumps({"type": "reflected", "jobNumber": str(job_number), "saved": bool(saved)}), flush=True)


def rand_delay(a=0.6, b=1.4):
    time.sleep(random.uniform(a, b))


SETVAL = r"""
(sel, val) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}
"""


def save_shot(page, name):
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        logs = os.path.join(script_dir, '..', 'logs')
        os.makedirs(logs, exist_ok=True)
        page.screenshot(path=os.path.join(logs, f'reflect_{name}.png'), full_page=False)
    except Exception:
        pass


def main():
    email    = os.environ.get("KYUJINBOX_EMAIL", "")
    password = os.environ.get("KYUJINBOX_PASSWORD", "")
    group_id = os.environ.get("KYUJINBOX_GROUP_ID", "").strip()
    headless = os.environ.get("HEADLESS", "1").strip() not in ("0", "false", "no")
    apply_save = os.environ.get("APPLY", "0").strip() in ("1", "true", "yes")

    if not email or not password or not group_id:
        progress("⚠️ KYUJINBOX_EMAIL / PASSWORD / GROUP_ID が未設定です", "warn")
        sys.exit(1)

    raw = sys.stdin.read()
    try:
        jobs = json.loads(raw) if raw.strip() else []
    except Exception as e:
        progress(f"⚠️ 入力JSONの解析に失敗: {e}", "error")
        sys.exit(1)
    jobs = [j for j in jobs if (j.get("jobNumber") or "").strip()]
    if not jobs:
        progress("反映対象の求人がありません（求人番号なし）", "warn")
        sys.exit(0)

    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        progress(f"❌ playwright の読み込みに失敗: {e}", "error")
        sys.exit(1)

    progress(f"{'💾 保存モード' if apply_save else '🔍 ドライラン(保存しない)'} / 対象 {len(jobs)}件", "info")
    ok = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless, args=[
            '--disable-blink-features=AutomationControlled', '--no-sandbox',
            '--disable-setuid-sandbox', '--disable-dev-shm-usage'])
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            viewport={"width": 1440, "height": 1400}, locale="ja-JP", timezone_id="Asia/Tokyo")
        ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => undefined });")
        page = ctx.new_page()
        try:
            progress("🔑 ログイン中...", "info")
            page.goto("https://secure.kyujinbox.com/login", timeout=30000)
            page.wait_for_load_state('networkidle', timeout=15000)
            for sel in ['input[name="login[email]"]', 'input[type="email"]', 'input[name="email"]']:
                if page.locator(sel).count(): page.fill(sel, email); break
            for sel in ['input[name="login[password]"]', 'input[type="password"]', 'input[name="password"]']:
                if page.locator(sel).count(): page.fill(sel, password); break
            page.click('button[type="submit"], input[type="submit"], form button')
            try: page.wait_for_url(lambda u: 'login' not in u.lower(), timeout=15000)
            except Exception: page.wait_for_load_state('domcontentloaded', timeout=10000)
            if 'login' in page.url.lower():
                progress("❌ ログイン失敗", "error"); browser.close(); sys.exit(1)
            progress("✅ ログイン成功", "success")

            for i, job in enumerate(jobs):
                num = job["jobNumber"].strip()
                url = f"https://saiyo.kyujinbox.com/company/groups/{group_id}/jobs/edit/{num}"
                progress(f"[{i+1}/{len(jobs)}] {num} を編集ページで開いています...", "info")
                try:
                    page.goto(url, timeout=30000)
                    page.wait_for_load_state('networkidle', timeout=15000)
                    page.wait_for_selector('textarea[name="description"]', timeout=15000)
                    rand_delay(1.0, 1.8)
                except Exception as e:
                    progress(f"  ⚠️ 編集ページを開けません: {e}", "warn"); continue

                set_map = {
                    'input[name="title"]': job.get("title"),
                    'textarea[name="description"]': job.get("description"),
                    'textarea[name="rewarding"]': job.get("rewarding"),
                }
                applied_fields = []
                for sel, val in set_map.items():
                    if not val: continue
                    try:
                        r = page.evaluate(SETVAL, [sel, val])
                        if r: applied_fields.append(sel.split('"')[1])
                    except Exception:
                        pass
                progress(f"  ✏️ 入力しました: {', '.join(applied_fields) or '(なし)'}", "info")
                save_shot(page, f"{num}_filled")

                if not apply_save:
                    progress("  🔍 ドライランのため保存しません（logs/reflect_*_filled.png を確認）", "info")
                    reflected(num, False); ok += 1
                    continue

                # 保存（公開）ボタン
                clicked = False
                for kw in ['変更を保存', '保存して公開', '公開する', '更新する', '保存する', '掲載する', '保存']:
                    try:
                        btn = page.locator(f'button:has-text("{kw}"), a:has-text("{kw}")').last
                        if btn.count() > 0 and btn.is_visible():
                            cls = (btn.get_attribute('class') or '').lower()
                            if 'disab' in cls: continue
                            btn.scroll_into_view_if_needed(); btn.click()
                            page.wait_for_load_state('networkidle', timeout=15000)
                            rand_delay(1.0, 2.0)
                            clicked = True
                            progress(f"  💾 「{kw}」で保存しました", "success")
                            break
                    except Exception:
                        pass
                save_shot(page, f"{num}_saved")
                if not clicked:
                    progress("  ⚠️ 保存ボタンが見つかりませんでした（画面をご確認ください）", "warn")
                reflected(num, clicked)
                if clicked: ok += 1
                rand_delay(1.0, 2.0)
        finally:
            try: browser.close()
            except Exception: pass

    progress(f"✅ 反映処理完了: {ok}/{len(jobs)}件", "success")


if __name__ == "__main__":
    main()
