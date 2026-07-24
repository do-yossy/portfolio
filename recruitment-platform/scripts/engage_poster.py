#!/usr/bin/env python3
"""
engage（エンゲージ）自動投稿スクリプト（v1・下書き保存）
------------------------------------------------------------
標準入力から求人JSON配列を受け取り、engageの求人作成フォームに入力して
「一時保存（下書き）」する。engageは自動操作ブラウザのログインを弾くため、
実Chromeプロファイル（persistent context / channel=chrome）を使い、
一度手動ログインしたセッションを再利用する。

安全のため v1 は「下書き保存」まで。engage上で内容を確認してから公開する運用。

■ 環境変数（.env / サーバーから渡す）
  ENGAGE_PK            … フォームURLの企業PK（例: C6F2D9）※必須
  ENGAGE_PROFILE_DIR   … Chromeプロファイル保存先（既定: ./engage-profile）
  ENGAGE_JOB_NEW_URL   … 求人作成フォームURL（未設定なら ENGAGE_PK から生成）
  ENGAGE_HEADLESS      … 1 でヘッドレス（既定: 表示）
  ENGAGE_PUBLISH       … 1 で公開まで試行（既定: 下書き保存のみ）

■ 進捗出力
  標準出力に1行JSON: {"type":"posted","jobId":...} / {"message":...,"level":...}

■ 初回ログイン
  プロファイルが未ログインの場合、ブラウザで手動ログインを促して待機する。
"""
import os
import sys
import io
import json
import time

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

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

PK = os.environ.get("ENGAGE_PK", "").strip()
PROFILE_DIR = os.environ.get("ENGAGE_PROFILE_DIR", "").strip() or str(
    pathlib.Path(__file__).parent.parent / "engage-profile")
JOB_NEW_URL = os.environ.get("ENGAGE_JOB_NEW_URL", "").strip() or (
    f"https://en-gage.net/company/job/regist/form/?PK={PK}" if PK else
    "https://en-gage.net/company/job/regist/form/")
HEADLESS = os.environ.get("ENGAGE_HEADLESS", "").strip() in ("1", "true", "yes")
PUBLISH = os.environ.get("ENGAGE_PUBLISH", "").strip() in ("1", "true", "yes")
# CDP接続先（例: http://localhost:9222）。指定すると、あなたが起動した“普通のChrome”に
# 接続して操作する。engageは自動起動ブラウザのログインを弾くため、こちらを推奨。
CDP_URL = os.environ.get("ENGAGE_CDP_URL", "").strip()

PREF_MAP = {
    "北海道": "11", "青森県": "12", "岩手県": "13", "宮城県": "14", "秋田県": "15",
    "山形県": "16", "福島県": "17", "東京都": "23", "神奈川県": "24", "千葉県": "22",
    "埼玉県": "21", "茨城県": "18", "栃木県": "19", "群馬県": "20", "富山県": "26",
    "石川県": "27", "福井県": "28", "新潟県": "25", "山梨県": "29", "長野県": "30",
    "愛知県": "33", "静岡県": "32", "岐阜県": "31", "三重県": "34", "大阪府": "37",
    "京都府": "36", "兵庫県": "38", "滋賀県": "35", "奈良県": "39", "和歌山県": "40",
    "広島県": "44", "岡山県": "43", "鳥取県": "41", "島根県": "42", "山口県": "45",
    "徳島県": "46", "香川県": "47", "愛媛県": "48", "高知県": "49", "福岡県": "50",
    "熊本県": "53", "佐賀県": "51", "長崎県": "52", "大分県": "54", "宮崎県": "55",
    "鹿児島県": "56", "沖縄県": "57",
}


def log(message, level="info"):
    print(json.dumps({"message": message, "level": level}, ensure_ascii=False), flush=True)


def posted(job_id):
    print(json.dumps({"type": "posted", "jobId": job_id}, ensure_ascii=False), flush=True)


def jget(job, *keys, default=""):
    for k in keys:
        v = job.get(k)
        if v:
            return v
    return default


def parse_salary(salary_str):
    """月給 下限・上限（円）を返す。'月給390,000円〜440,000円' 等に対応。"""
    s = (salary_str or "").replace(",", "").replace("，", "")
    import re
    nums = re.findall(r"(\d+)\s*万", s)
    if nums:
        vals = [int(n) * 10000 for n in nums]
    else:
        vals = [int(n) for n in re.findall(r"(\d{5,7})", s)]
    if not vals:
        return "", ""
    lo = min(vals)
    hi = max(vals) if len(vals) > 1 else ""
    return str(lo), (str(hi) if hi else "")


def split_location(loc):
    """'大阪府大阪市中央区農人橋1-4-28...' → (pref_value, municipality, rest)"""
    loc = (loc or "").strip()
    pref_val, pref_name = "", ""
    for name, val in PREF_MAP.items():
        if loc.startswith(name):
            pref_val, pref_name = val, name
            break
    rest = loc[len(pref_name):] if pref_name else loc
    # 括弧内（例: 「大阪市北区（梅田・天満）」）は除去
    import re
    rest = re.sub(r"[（(].*?[)）]", "", rest).strip()
    # 市区町村と番地を分割：最初の数字以降を住所詳細に
    m = re.search(r"[0-9０-９]", rest)
    if m:
        municipality = rest[:m.start()].strip()
        detail = rest[m.start():].strip()
    else:
        municipality = rest
        detail = ""
    return pref_val, municipality, detail


def holiday_type_from_text(text):
    t = text or ""
    if "完全週休3日" in t:
        return "10"
    if "完全週休2日" in t:
        return "20"
    if "週休2日" in t:
        return "30"
    return ""


# ---- Playwright ページ操作ヘルパー ----
def fill_name(page, name, value):
    if value is None or value == "":
        return False
    try:
        loc = page.locator(f'[name="{name}"]').first
        if loc.count() == 0:
            return False
        loc.scroll_into_view_if_needed(timeout=3000)
        loc.fill(str(value), timeout=5000)
        return True
    except Exception as e:
        log(f"  （{name} 入力スキップ: {e}）", "warn")
        return False


def select_name(page, name, value):
    if not value:
        return False
    try:
        loc = page.locator(f'select[name="{name}"]').first
        if loc.count() == 0:
            return False
        loc.select_option(value=str(value), timeout=5000)
        return True
    except Exception as e:
        log(f"  （{name} 選択スキップ: {e}）", "warn")
        return False


def check_radio(page, name, value):
    try:
        loc = page.locator(f'input[name="{name}"][value="{value}"]').first
        if loc.count() == 0:
            return False
        loc.check(timeout=4000, force=True)
        return True
    except Exception:
        try:
            rid = page.locator(f'input[name="{name}"][value="{value}"]').first.get_attribute("id")
            if rid:
                page.locator(f'label[for="{rid}"]').first.click(timeout=3000)
                return True
        except Exception as e:
            log(f"  （{name}={value} ラジオスキップ: {e}）", "warn")
    return False


def fill_job(page, job):
    """1件分をフォームに入力（下書き相当）。"""
    title = jget(job, "catchcopy", "title")
    occ = jget(job, "jobType", "job_type", default=jget(job, "title"))
    desc = jget(job, "description")
    salary = jget(job, "salary")
    worktime = jget(job, "worktime_holiday", "worktimeHoliday", "office_hours")
    holiday = jget(job, "holiday", default=worktime)
    benefit = jget(job, "benefit", "treatment")
    qualification = jget(job, "qualifications", "qualification")
    how_to_apply = jget(job, "how_to_apply", "howToApply")
    location = jget(job, "location")

    # 雇用形態: 中途採用（正社員）
    check_radio(page, "employment_status", "1")
    # 職種名・タイトル・仕事内容
    fill_name(page, "official_occupation_name", occ)
    fill_name(page, "occupation_name", title)
    fill_name(page, "work_contents", desc)

    # 勤務地
    pref_val, municipality, detail = split_location(location)
    check_radio(page, "work_office_division[0]", "1")
    if pref_val:
        select_name(page, "work_office[0]", pref_val)
    fill_name(page, "municipalities[0]", municipality)
    if detail:
        fill_name(page, "other_address[0]", detail)

    # 勤務区分: フルタイム
    check_radio(page, "work_division", "1")

    # 給与: 月給
    lo, hi = parse_salary(salary)
    if lo:
        check_radio(page, "salary_type_selected", "1")
        fill_name(page, "salary_amount_from_1_2", lo)
        if hi:
            fill_name(page, "salary_amount_to_1_2", hi)

    # 勤務時間
    check_radio(page, "office_hour_style", "1")
    fill_name(page, "office_hours", worktime)

    # 休日
    ht = holiday_type_from_text(worktime + " " + holiday)
    if ht:
        select_name(page, "holiday_type", ht)
    fill_name(page, "holiday", holiday)

    # 待遇・応募資格・選考
    fill_name(page, "treatment", benefit)
    fill_name(page, "qualification", qualification)
    select_name(page, "educational_status", "90")  # 学歴不問
    tags = job.get("tags")
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except Exception:
            tags = []
    if any("未経験" in str(t) for t in (tags or [])):
        check_radio(page, "occupation_experience", "1")
    fill_name(page, "selection_process_contents_01", how_to_apply)


def save_draft(page):
    """「入力内容を保存」（下書き）をクリック。"""
    for sel in ['button:has-text("入力内容を保存")', 'a:has-text("入力内容を保存")',
                ':text("入力内容を保存")']:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0:
                loc.scroll_into_view_if_needed(timeout=3000)
                loc.click(timeout=6000)
                return True
        except Exception:
            continue
    return False


def is_logged_in(page):
    url = page.url.lower()
    return "login" not in url and "company/job/regist/form" in url


def main():
    raw = sys.stdin.read()
    try:
        jobs = json.loads(raw) if raw.strip() else []
    except Exception as e:
        log(f"入力JSONの解析に失敗: {e}", "error")
        sys.exit(1)
    if not jobs:
        log("投稿対象の求人がありません", "warn")
        return
    if not PK and "PK=" not in JOB_NEW_URL:
        log("ENGAGE_PK（企業PK）が未設定です。.env に ENGAGE_PK を設定してください。", "error")
        sys.exit(1)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log("playwright が未インストールです", "error")
        sys.exit(1)

    os.makedirs(PROFILE_DIR, exist_ok=True)
    with sync_playwright() as p:
        using_cdp = bool(CDP_URL)
        browser = None
        if using_cdp:
            # あなたが起動した“普通のChrome”に接続（bot検知回避）。
            log(f"起動済みChromeに接続します: {CDP_URL}", "info")
            try:
                browser = p.chromium.connect_over_cdp(CDP_URL)
            except Exception as e:
                log(f"Chromeへの接続に失敗しました（{e}）。"
                    "Chromeを --remote-debugging-port=9222 付きで起動しているか確認してください。", "error")
                sys.exit(1)
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
        else:
            launch_kwargs = dict(
                user_data_dir=PROFILE_DIR,
                headless=HEADLESS,
                locale="ja-JP",
                timezone_id="Asia/Tokyo",
                viewport={"width": 1440, "height": 900},
            )
            # 実Chromeを優先（bot検知回避）。無ければ同梱Chromiumにフォールバック。
            try:
                ctx = p.chromium.launch_persistent_context(channel="chrome", **launch_kwargs)
            except Exception:
                log("実Chromeが見つからないため同梱Chromiumで起動します（bot検知で弾かれる場合あり）", "warn")
                ctx = p.chromium.launch_persistent_context(**launch_kwargs)
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

        log(f"求人作成フォームを開きます: {JOB_NEW_URL}", "info")
        try:
            page.goto(JOB_NEW_URL, timeout=40000)
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        time.sleep(2)

        def _cleanup():
            try:
                if using_cdp and browser is not None:
                    browser.close()   # CDP接続を切断（起動済みChromeは閉じない）
                else:
                    ctx.close()
            except Exception:
                pass

        if not is_logged_in(page):
            if HEADLESS and not using_cdp:
                log("未ログインです。ヘッドレスでは手動ログインできません。"
                    "一度 ENGAGE_HEADLESS=0 で起動し、engageにログインしてください。", "error")
                _cleanup()
                sys.exit(1)
            if using_cdp:
                log("engageに未ログインです。接続中のChromeで engage にログインしてください"
                    "（普通のChromeなのでログインできます）。ログイン後、自動的に続行します…", "warn")
            else:
                log("engageにログインしてください（このブラウザで手動ログイン）。"
                    "ログイン後、自動的に続行します…", "warn")
            # ログイン完了をポーリング（最大5分）
            for _ in range(150):
                time.sleep(2)
                if is_logged_in(page):
                    break
                # フォームに戻す
                if "login" not in page.url.lower():
                    try:
                        page.goto(JOB_NEW_URL, timeout=30000)
                        page.wait_for_load_state("networkidle", timeout=15000)
                    except Exception:
                        pass
            if not is_logged_in(page):
                log("ログインが確認できませんでした。中断します。", "error")
                _cleanup()
                sys.exit(1)
        log("✅ ログイン確認。投稿を開始します。", "success")

        done = 0
        for i, job in enumerate(jobs):
            jid = job.get("id")
            title = jget(job, "title", "catchcopy", default=f"job#{i+1}")
            try:
                if i > 0:
                    page.goto(JOB_NEW_URL, timeout=40000)
                    page.wait_for_load_state("networkidle", timeout=20000)
                    time.sleep(1.5)
                log(f"📝 [{i+1}/{len(jobs)}] 入力中: {title[:40]}", "info")
                fill_job(page, job)
                time.sleep(0.5)
                if PUBLISH:
                    log("  （公開モードは未対応のため下書き保存します）", "warn")
                if save_draft(page):
                    time.sleep(2.5)
                    os.makedirs("logs", exist_ok=True)
                    try:
                        page.screenshot(path=f"logs/engage_saved_{i+1}.png", full_page=False)
                    except Exception:
                        pass
                    log(f"  ✅ 下書き保存: {title[:40]}", "success")
                    if jid:
                        posted(jid)
                    done += 1
                else:
                    log(f"  ⚠️ 「入力内容を保存」ボタンが見つかりませんでした: {title[:40]}", "warn")
            except Exception as e:
                log(f"  ❌ 失敗: {title[:40]} — {e}", "error")

        log(f"完了: {done}/{len(jobs)} 件を下書き保存しました。engage上で内容を確認して公開してください。", "success")
        _cleanup()


if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    main()
