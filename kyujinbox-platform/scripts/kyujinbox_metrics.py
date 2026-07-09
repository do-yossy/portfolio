#!/usr/bin/env python3
"""
求人ボックス 成績取得スクリプト（自動改善ループの土台）
Node.js から subprocess として呼び出される。
KYUJINBOX_EMAIL / KYUJINBOX_PASSWORD / KYUJINBOX_GROUP_ID（会社別envはサーバーが注入）で
ログインし、求人一覧の「閲覧数・応募数・ステータス」を全ページ取得して
logs/kyujinbox_metrics.json に保存する。標準出力にも1行1件のJSONで出力する。
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


def rand_delay(a=0.6, b=1.4):
    time.sleep(random.uniform(a, b))


def main():
    email    = os.environ.get("KYUJINBOX_EMAIL", "")
    password = os.environ.get("KYUJINBOX_PASSWORD", "")
    group_id = os.environ.get("KYUJINBOX_GROUP_ID", "").strip()
    headless = os.environ.get("HEADLESS", "1").strip() not in ("0", "false", "no")
    max_pages = int(os.environ.get("KYUJINBOX_METRICS_MAX_PAGES", "60") or "60")

    if not email or not password:
        progress("⚠️ 環境変数 KYUJINBOX_EMAIL / KYUJINBOX_PASSWORD が未設定です", "warn")
        sys.exit(1)
    if not group_id:
        progress("⚠️ 環境変数 KYUJINBOX_GROUP_ID が未設定です", "warn")
        sys.exit(1)

    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        progress(f"❌ playwright の読み込みに失敗（実行Python: {sys.executable}）: {e}", "error")
        sys.exit(1)

    metrics = []
    with sync_playwright() as p:
        progress("🌐 ブラウザを起動しています...", "info")
        browser = p.chromium.launch(
            headless=headless,
            args=['--disable-blink-features=AutomationControlled', '--no-sandbox',
                  '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        )
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            viewport={"width": 1440, "height": 1200}, locale="ja-JP", timezone_id="Asia/Tokyo",
        )
        ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => undefined });")
        page = ctx.new_page()
        try:
            progress("🔑 求人ボックスにログイン中...", "info")
            page.goto("https://secure.kyujinbox.com/login", timeout=30000)
            page.wait_for_load_state('networkidle', timeout=15000)
            rand_delay()
            for sel in ['input[name="login[email]"]', 'input[type="email"]', 'input[name="email"]']:
                if page.locator(sel).count():
                    page.fill(sel, email); break
            for sel in ['input[name="login[password]"]', 'input[type="password"]', 'input[name="password"]']:
                if page.locator(sel).count():
                    page.fill(sel, password); break
            page.click('button[type="submit"], input[type="submit"], form button')
            try:
                page.wait_for_url(lambda u: 'login' not in u.lower(), timeout=15000)
            except Exception:
                page.wait_for_load_state('domcontentloaded', timeout=10000)
            if 'login' in page.url.lower():
                progress("❌ ログイン失敗（メール/パスワードをご確認ください）", "error")
                browser.close(); sys.exit(1)
            progress("✅ ログイン成功", "success")

            list_url = f"https://saiyo.kyujinbox.com/company/groups/{group_id}/jobs"
            page.goto(list_url, timeout=30000)
            page.wait_for_load_state('networkidle', timeout=15000)
            rand_delay(1.5, 2.5)

            seen = set()
            prev_sig = None
            for pg in range(max_pages):
                rows = page.evaluate(r"""() => {
                    const num = (s) => { const m = (s||'').replace(/[, ]/g,'').match(/\d+/); return m ? parseInt(m[0],10) : null; };
                    const clean = (s) => (s||'').replace(/\s+/g,' ').trim();
                    const out = [];
                    for (const tr of document.querySelectorAll('tr')) {
                        const tds = [...tr.querySelectorAll('td')];
                        if (tds.length < 5) continue;
                        const cells = tds.map(td => clean(td.textContent));
                        const link = tr.querySelector('a[href*="/jobs/edit/"]');
                        if (!link) continue;                       // 求人行のみ
                        const href = link.getAttribute('href') || '';
                        const noMatch = href.match(/\/jobs\/edit\/([0-9-]+)/);
                        const jobNumber = noMatch ? noMatch[1] : '';
                        // タイトル: リンクを含むセル（会社名の重複は後段で除去）
                        const titleCell = clean((link.closest('td') || {}).textContent || cells[1] || '');
                        // ステータス
                        const statusCell = cells.find(c => /下書き|審査中|公開中|停止|掲載中|却下|終了/.test(c)) || '';
                        let status = (statusCell.match(/下書き|審査中|公開中|掲載中|停止|却下|終了/) || [''])[0];
                        // 勤務地
                        const prefRe = /(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/;
                        const locCell = cells.find(c => prefRe.test(c) && c.length < 40) || '';
                        // 数値セル（末尾側の数値のみのセル2つ＝閲覧数・応募数）
                        const nums = cells.filter(c => /^[0-9,]+$/.test(c)).map(num);
                        let views = null, applies = null;
                        if (nums.length >= 2) { views = nums[nums.length-2]; applies = nums[nums.length-1]; }
                        else if (nums.length === 1) { views = nums[0]; applies = 0; }
                        // 更新日
                        const dateCell = cells.find(c => /\d{4}\/\d{1,2}\/\d{1,2}/.test(c)) || '';
                        const updated = (dateCell.match(/\d{4}\/\d{1,2}\/\d{1,2}/) || [''])[0];
                        out.push({ jobNumber, titleRaw: titleCell, location: clean(locCell), status, views, applies, updated });
                    }
                    return out;
                }""")
                added = 0
                for r in rows:
                    key = r.get("jobNumber") or (r.get("titleRaw", "")[:40] + "|" + r.get("location", ""))
                    if key in seen:
                        continue
                    seen.add(key)
                    metrics.append(r)
                    added += 1
                    print(json.dumps({"type": "metric", **r}, ensure_ascii=False), flush=True)
                progress(f"📄 ページ{pg+1}: {added}件取得（累計 {len(metrics)}件）", "info")

                sig = "|".join((r.get("jobNumber") or r.get("titleRaw", "")[:10]) for r in rows[:5])
                if sig and sig == prev_sig:
                    break
                prev_sig = sig
                # 次ページ
                moved = False
                for kw in ['次へ', '次の', '＞', '>']:
                    try:
                        nxt = page.locator(f'a:has-text("{kw}"), button:has-text("{kw}")').first
                        if nxt.count() > 0 and nxt.is_visible():
                            cls = (nxt.get_attribute('class') or '').lower()
                            if 'disab' in cls:
                                break
                            nxt.scroll_into_view_if_needed()
                            nxt.click()
                            page.wait_for_load_state('networkidle', timeout=10000)
                            rand_delay(1.0, 2.0)
                            moved = True
                            break
                    except Exception:
                        pass
                if not moved:
                    break
        finally:
            try: browser.close()
            except Exception: pass

    # ファイル保存
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        logs_dir = os.path.join(script_dir, '..', 'logs')
        os.makedirs(logs_dir, exist_ok=True)
        with open(os.path.join(logs_dir, 'kyujinbox_metrics.json'), 'w', encoding='utf-8') as f:
            json.dump(metrics, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    print(json.dumps({"type": "done", "count": len(metrics)}, ensure_ascii=False), flush=True)
    progress(f"✅ 成績取得完了: {len(metrics)}件", "success")


if __name__ == "__main__":
    main()
