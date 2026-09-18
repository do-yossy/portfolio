#!/usr/bin/env python3
"""
求人ボックス 掲載反映スクリプト（AI改善内容を既存掲載へ反映）
Node.js から subprocess として呼び出される。標準入力からJSON配列を受け取る:
  [{ "jobNumber": "5922-7577-1618", "title": "...", "description": "...", "rewarding": "...",
     "jobTypeLabel": "軽作業・倉庫作業" }, ...]
各求人の編集ページ /jobs/edit/<jobNumber> を開き、Vueフォームの
title / description / rewarding / jobType（職種区分セレクト。jobTypeLabelはオプション名の
部分一致で選ぶ）を新しい値に置き換える。
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
({ sel, val }) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return el.value === val;
}
"""

READVAL = r"""
(sel) => {
  const el = document.querySelector(sel);
  return el ? el.value : null;
}
"""

READ_SELECT_TEXT = r"""
(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const opt = el.options[el.selectedIndex];
  return opt ? opt.textContent.trim() : null;
}
"""


def select_job_type(page, label_kw):
    """select[name="jobType"] から、テキストに label_kw を含む option を選ぶ。成功したら選んだテキストを返す。"""
    sel = 'select[name="jobType"]'
    try:
        options = page.evaluate(
            "(sel) => { const el = document.querySelector(sel); if (!el) return null; "
            "return Array.from(el.options).map(o => ({value: o.value, text: (o.textContent||'').trim()})); }",
            sel)
    except Exception:
        return None
    if not options:
        return None
    for opt in options:
        if opt['value'] and label_kw in opt['text']:
            try:
                page.locator(sel).select_option(value=opt['value'])
                rand_delay(0.3, 0.6)
                return opt['text']
            except Exception:
                return None
    return None


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
                failed_fields = []
                for sel, val in set_map.items():
                    if not val: continue
                    field_name = sel.split('"')[1]
                    try:
                        r = page.evaluate(SETVAL, {"sel": sel, "val": val})
                        if r: applied_fields.append(field_name)
                        else: failed_fields.append(field_name)
                    except Exception:
                        failed_fields.append(field_name)
                job_type_label = job.get("jobTypeLabel")
                job_type_selected_text = None
                if job_type_label:
                    job_type_selected_text = select_job_type(page, job_type_label)
                    if job_type_selected_text:
                        applied_fields.append('jobType')
                    else:
                        failed_fields.append('jobType')

                progress(f"  ✏️ 入力しました: {', '.join(applied_fields) or '(なし)'}", "info")
                if failed_fields:
                    progress(f"  ⚠️ 入力に失敗した項目: {', '.join(failed_fields)}", "warn")
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
                            rand_delay(0.8, 1.4)
                            clicked = True
                            progress(f"  ✏️ 「{kw}」をクリックしました", "info")
                            break
                    except Exception:
                        pass
                if not clicked:
                    progress("  ⚠️ 保存ボタンが見つかりませんでした（画面をご確認ください）", "warn")
                    reflected(num, False)
                    rand_delay(1.0, 2.0)
                    continue

                # 「更新する」は確認モーダル(is-openクラス付きの.c-modal__wrap)を開くだけで、
                # そのモーダル内の「OK」を押すまでは実際には保存されない
                confirmed = False
                try:
                    modal = page.locator('.c-modal__wrap.is-open').last
                    modal.wait_for(state='visible', timeout=8000)
                    agree_box = modal.locator('input[type="checkbox"]')
                    if agree_box.count() > 0 and not agree_box.first.is_checked():
                        agree_box.first.check()
                    ok_btn = modal.locator('button:has-text("OK")').last
                    ok_btn.click()
                    page.wait_for_load_state('networkidle', timeout=15000)
                    rand_delay(1.0, 2.0)
                    confirmed = True
                    progress("  💾 確認モーダルの「OK」で保存しました", "success")
                except Exception as e:
                    progress(f"  ⚠️ 確認モーダルの処理に失敗: {e}", "warn")
                save_shot(page, f"{num}_saved")
                if not confirmed:
                    reflected(num, False)
                    rand_delay(1.0, 2.0)
                    continue

                # 保存クリック成功の自己申告を信用せず、編集ページを開き直して実際に反映されたか確認する
                persisted = True
                try:
                    page.goto(url, timeout=30000)
                    page.wait_for_load_state('networkidle', timeout=15000)
                    page.wait_for_selector('textarea[name="description"]', timeout=15000)
                    for sel, val in set_map.items():
                        if not val: continue
                        cur = page.evaluate(READVAL, sel)
                        if cur != val:
                            persisted = False
                            progress(f"  ❌ 保存後の確認で不一致: {sel.split(chr(34))[1]}（実際の反映は行われていません）", "error")
                    if job_type_label:
                        cur_jt_text = page.evaluate(READ_SELECT_TEXT, 'select[name="jobType"]')
                        if not cur_jt_text or job_type_label not in cur_jt_text:
                            persisted = False
                            progress(f"  ❌ 保存後の確認で不一致: jobType（現在値='{cur_jt_text}'、実際の反映は行われていません）", "error")
                except Exception as e:
                    persisted = False
                    progress(f"  ❌ 保存後の確認に失敗: {e}", "error")

                if persisted:
                    progress("  ✅ 保存後の確認OK（実際に反映されています）", "success")
                reflected(num, persisted)
                if persisted: ok += 1
                rand_delay(1.0, 2.0)
        finally:
            try: browser.close()
            except Exception: pass

    progress(f"✅ 反映処理完了: {ok}/{len(jobs)}件", "success")


if __name__ == "__main__":
    main()
