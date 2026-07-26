#!/usr/bin/env python3
"""
engage（エンゲージ）半自動投稿スクリプト（下書き保存）
------------------------------------------------------------
求人JSON配列を受け取り、engageの求人作成フォームに入力して「一時保存（下書き）」する。
engageは自動操作を検知して認証（CAPTCHA等）を出すため、この認証は突破しない。
方針は「ログイン＝手動 / 入力＝自動」の半自動：
  ・あなたがブラウザで engage にログイン（認証があれば自分で操作）
  ・Enter を押すと、フォーム入力〜下書き保存だけを自動化する

■ 半自動の使い方（推奨：求人JSONはファイルで渡す＝標準入力を空けてEnter待ちを可能にする）
  1) 普通のChromeをデバッグ起動: chrome.exe --remote-debugging-port=9222 --user-data-dir=...
  2) set ENGAGE_PK=<PK> ＆ set ENGAGE_CDP_URL=http://localhost:9222
  3) python scripts/engage_poster.py test-engage.json
     → ブラウザで engage にログイン → コンソールで Enter → 自動入力→下書き保存

補足：JSONを標準入力パイプ（type x.json | ...）で渡す従来モードも可（その場合はログインを自動ポーリング）。
engageが入力操作中も認証を出す場合は自動化を許可していないため、engageは手動掲載が現実的。

安全のため v1 は「下書き保存」まで。engage上で内容を確認してから公開する運用。

■ 環境変数（.env / サーバーから渡す）
  ENGAGE_PK            … フォームURLの企業PK（例: C6F2D9）※必須
  ENGAGE_PROFILE_DIR   … Chromeプロファイル保存先（既定: ./engage-profile）
  ENGAGE_JOB_NEW_URL   … 求人作成フォームURL（未設定なら ENGAGE_PK から生成）
  ENGAGE_HEADLESS      … 1 でヘッドレス（既定: 表示）
  ENGAGE_DRAFT         … 1 で下書き保存のみ（既定: 掲載＝公開まで実行）

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
# 既定で「掲載（公開）」まで実行する。下書き保存だけにしたい場合は ENGAGE_DRAFT=1 を設定。
DRAFT_ONLY = os.environ.get("ENGAGE_DRAFT", "").strip() in ("1", "true", "yes")
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


# 職種欄は「求人検索エンジン連携用」で、記号・スペース・アピール文言・勤務地を含めると
# 連携されない。括弧内(勤務地/補足)や ｜以降(訴求)を落とし、記号・空白を除去して整形する。
_OCC_STRIP_CHARS = "・･｜|/／\\　 \t★☆♪◆◇■□●○◎＊*！!？?＜＞<>「」『』、。，．,.：:；;〜～#＃@＠&＆＋+＝=％%…‥"


def clean_occupation(text, limit=50):
    import re
    s = text or ""
    # ｜ | / ／ 以降（キャッチ・給与などの訴求）は職種名に含めない
    s = re.split(r"[｜|/／\\]", s)[0]
    # 【…】〔…〕［…］（…）(…) 等の括弧とその中身（勤務地・補足）を除去
    s = re.sub(r"[【〔［\[（(][^】〕］\])）]*[】〕］\])）]", "", s)
    # 残った記号・空白を除去（長音符ーや日本語・英数字は残す）
    for ch in _OCC_STRIP_CHARS:
        s = s.replace(ch, "")
    s = s.strip()
    return s[:limit]


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
    # 職種名・表示用職種名・仕事内容
    #   職種欄は検索エンジン連携用のため、記号・スペース・アピール文言・勤務地を除去する。
    #   表示用職種名は50文字以内。どちらの制約でも通るよう両方を整形して入れる。
    occ_core = jget(job, "jobType", "job_type")
    official = clean_occupation(occ_core or title, limit=50)
    display = clean_occupation(title or occ_core, limit=50) or official
    fill_name(page, "official_occupation_name", official)  # 職種（記号・スペースNG）
    fill_name(page, "occupation_name", display)            # 表示用職種名（50文字以内）
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


def open_new_form(page, tries=3):
    """求人作成フォームを開く。engageはnetworkidleに到達しないため domcontentloaded＋
    フォーム項目(職種名/雇用形態)の出現で待機する。ERR_ABORTED等の一時失敗は数回リトライ。"""
    for attempt in range(tries):
        try:
            page.goto(JOB_NEW_URL, timeout=40000, wait_until="domcontentloaded")
        except Exception as e:
            if attempt >= tries - 1:
                log(f"  （フォームを開けませんでした: {str(e)[:80]}）", "warn")
                return False
            time.sleep(2.0)
            continue
        try:
            page.wait_for_selector(
                'input[name="official_occupation_name"], input[name="employment_status"]',
                timeout=15000, state="attached")
            time.sleep(0.8)
            return True
        except Exception:
            if attempt >= tries - 1:
                time.sleep(1.0)
                return True  # フィールド確認できなくても入力を試みる
            time.sleep(1.5)
    return False


def _agree_guideline(page):
    """「掲載ガイドラインに同意する」等の必須チェックを入れる（内容確認ボタン有効化に必要）。"""
    for sel in ['input[name="submitCheck"]',
                'input[type="checkbox"][name*="agree"]',
                'input[type="checkbox"][name*="guideline"]']:
        try:
            cb = page.locator(sel).first
            if cb.count() > 0 and not cb.is_checked():
                cb.check(force=True, timeout=3000)
                return True
        except Exception:
            continue
    try:
        lab = page.locator('label:has-text("掲載ガイドライン"), label:has-text("同意")').first
        if lab.count() > 0:
            lab.click(timeout=3000)
            return True
    except Exception:
        pass
    return False


def _shot(page, name):
    try:
        os.makedirs("logs", exist_ok=True)
        page.screenshot(path=f"logs/engage_{name}.png", full_page=False)
    except Exception:
        pass


def _log_visible_buttons(page, tag=""):
    """表示中のボタン/リンク文言を列挙してログ出力（掲載フローの実ボタン名を把握するため）。"""
    try:
        texts, loc = [], page.locator('button, a[role="button"], input[type="submit"], input[type="button"]')
        n = min(loc.count(), 40)
        for i in range(n):
            el = loc.nth(i)
            try:
                if not el.is_visible():
                    continue
                t = (el.inner_text(timeout=400) or el.get_attribute("value") or "").strip().replace("\n", " ")
            except Exception:
                t = ""
            if t and t not in texts:
                texts.append(t[:24])
        if texts:
            log(f"  （{tag}の表示ボタン: {' / '.join(texts[:15])}）", "info")
    except Exception:
        pass


def _click_by_labels(page, labels):
    """候補ラベルの中から表示中のボタン/リンクを1つクリックして、当たったラベルを返す。"""
    for lb in labels:
        for sel in [f'button:has-text("{lb}")', f'a:has-text("{lb}")',
                    f'input[type="submit"][value*="{lb}"]', f'input[type="button"][value*="{lb}"]']:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible():
                    loc.scroll_into_view_if_needed(timeout=3000)
                    loc.click(timeout=6000)
                    return lb
            except Exception:
                continue
    return None


def publish(page, idx=0):
    """求人を「掲載（公開）」まで進める（engageの多段フロー）。
      ① フォーム：掲載ガイドライン同意 →「内容を確認する」→ プレビュー画面
      ② プレビュー：「編集を完了する」→ 掲載方法の選択
      ③ 掲載方法の選択：有料は使わず「今は利用しない」等で無料掲載を確定
    各段でスクショと表示ボタン一覧を残し、想定外のボタン名でも原因を追える。
    """
    _agree_guideline(page)

    # ① フォーム → 確認/プレビュー（実フォームのボタンは「内容を確認する」）
    STEP1 = ['内容を確認する', '入力内容を確認する', '入力内容を確認', '確認画面へ進む',
             '確認画面に進む', '確認する', '求人プレビューへ進む', 'プレビューへ進む']
    step1 = _click_by_labels(page, STEP1)
    if not step1:
        log("  （フォームの『内容を確認する』ボタンが見つかりませんでした）", "warn")
        _log_visible_buttons(page, "フォーム")
        return None
    time.sleep(2.5)
    try:
        page.wait_for_load_state("domcontentloaded", timeout=10000)
    except Exception:
        pass
    _shot(page, f"preview_{idx}")
    _log_visible_buttons(page, "確認/プレビュー画面")

    # ② プレビュー → 掲載方法の選択（「編集を完了する」）
    STEP2 = ['編集を完了する', '掲載を完了する', 'この内容で掲載する', 'この内容で公開する',
             '入力を完了する', '完了する']
    step2 = _click_by_labels(page, STEP2)
    if not step2:
        log("  （確認画面の『編集を完了する』ボタンが見つかりませんでした）", "warn")
        _log_visible_buttons(page, "確認/プレビュー画面")
        return None
    time.sleep(2)
    try:
        page.wait_for_load_state("domcontentloaded", timeout=10000)
    except Exception:
        pass
    # 確認ダイアログ（はい/OK のみ）。有料誘導ボタンを踏まないよう候補は最小限にする。
    _click_by_labels(page, ['はい', 'OK'])
    time.sleep(1.5)
    _shot(page, f"method_{idx}")
    _log_visible_buttons(page, "掲載方法の選択")

    # ③ 掲載方法の選択：有料オプション（エンゲージプレミアム）は絶対に押さず、
    #    無料掲載を確定する。「今は利用しない」＝無料掲載の確定。
    #    ※「追加する」「申し込む」「詳しく見る」「掲載する」等は有料の可能性があるため候補に入れない。
    FREE = ['今は利用しない', '無料で掲載する', '無料のまま掲載する', '無料掲載', 'あとで利用する',
            'あとで', 'スキップ']
    step3 = _click_by_labels(page, FREE)
    if step3:
        log(f"  （掲載方法の選択で「{step3}」を選択＝無料掲載を確定）", "info")
    time.sleep(1.5)
    _shot(page, f"done_{idx}")
    return step2


def is_logged_in(page):
    url = page.url.lower()
    return "login" not in url and "company/job/regist/form" in url


def _all_pages(ctx, browser=None):
    """開いている全タブを（CDP接続時は全コンテキスト横断で）列挙する。"""
    pages, seen, contexts = [], set(), []
    if browser is not None:
        try:
            contexts = list(browser.contexts)
        except Exception:
            contexts = []
    if not contexts:
        contexts = [ctx]
    for c in contexts:
        try:
            for pg in c.pages:
                if pg.is_closed() or id(pg) in seen:
                    continue
                seen.add(id(pg))
                pages.append(pg)
        except Exception:
            pass
    return pages


def _find_logged_in_page(ctx, browser=None):
    """engageにログイン済みのタブ（company配下でlogin以外）を全タブから探す。
    ユーザーがどのタブでログインしても拾えるようにする。フォームのタブを優先。"""
    logged = None
    for pg in _all_pages(ctx, browser):
        try:
            u = pg.url.lower()
        except Exception:
            continue
        if "en-gage.net" in u and "login" not in u and "/company" in u:
            if "company/job/regist/form" in u:
                return pg  # フォームのタブが最優先
            logged = logged or pg
    return logged


def main():
    # 求人JSONは「引数のファイル（推奨）」→ 無ければ「標準入力」から読む。
    # 半自動（ログイン後にEnter）を使うには、標準入力を空けるためファイル渡しが必要。
    #   例) python scripts/engage_poster.py test-engage.json
    jobs_from_file = False
    jobs_path = next((a for a in sys.argv[1:] if a.lower().endswith('.json')), '')
    try:
        if jobs_path and os.path.exists(jobs_path):
            with open(jobs_path, encoding='utf-8') as f:
                jobs = json.load(f)
            jobs_from_file = True
        else:
            raw = sys.stdin.read()
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
        open_new_form(page)
        time.sleep(1.5)

        def _cleanup():
            try:
                if using_cdp and browser is not None:
                    browser.close()   # CDP接続を切断（起動済みChromeは閉じない）
                else:
                    ctx.close()
            except Exception:
                pass

        if jobs_from_file:
            # ── 半自動モード（ログインだけ手動）──
            # 認証(CAPTCHA等)は突破しない。あなたが手でログインし、Enter後に入力だけ自動化する。
            print("\n＝＝ engage 半自動投稿（ログインだけ手動） ＝＝", flush=True)
            print("1) 表示中のブラウザで engage にログインしてください", flush=True)
            print("   （「私はロボットではありません」等の認証が出たら、ご自身で操作してください）", flush=True)
            print("2) ログインできたら、このウィンドウに戻って Enter を押してください", flush=True)
            print("   → 求人作成フォームを開いて自動入力し、下書き保存します", flush=True)
            try:
                input("\n>> ログインが済んだら Enter を押す ... ")
            except EOFError:
                pass
            open_new_form(page)
            time.sleep(1.0)
            if not is_logged_in(page):
                log("求人作成フォームを開けませんでした（未ログインの可能性）。"
                    "engageにログインできているか確認して、もう一度実行してください。", "error")
                _cleanup()
                sys.exit(1)
        else:
            # ── 従来モード（標準入力パイプ/ボタン）：ログイン完了を自動ポーリング ──
            # ユーザーがどのタブでログイン／フォーム表示しても拾えるよう、全タブを走査する。
            logged_page = page if is_logged_in(page) else _find_logged_in_page(ctx, browser)
            if logged_page is None:
                if HEADLESS and not using_cdp:
                    log("未ログインです。ヘッドレスでは手動ログインできません。"
                        "一度 ENGAGE_HEADLESS=0 で起動し、engageにログインしてください。", "error")
                    _cleanup()
                    sys.exit(1)
                log("engageにログインしてください（手動ログイン）。ログイン後、自動的に続行します…", "warn")
                last_note = 0
                for n in range(150):  # 最大5分（2秒×150）
                    time.sleep(2)
                    logged_page = _find_logged_in_page(ctx, browser)
                    if logged_page is not None:
                        break
                    # 30秒ごとに現在の状況を通知（何タブ見えているか）
                    if n - last_note >= 15:
                        last_note = n
                        try:
                            urls = [pg.url for pg in _all_pages(ctx, browser)]
                        except Exception:
                            urls = []
                        log(f"…ログイン待機中（{n*2}秒）。検出タブ: {' | '.join(urls) if urls else 'なし'}", "info")
                if logged_page is None:
                    try:
                        urls = [pg.url for pg in _all_pages(ctx, browser)]
                    except Exception:
                        urls = []
                    log("ログインが確認できませんでした。中断します。 現在のタブ: "
                        + (" | ".join(urls) if urls else "なし"), "error")
                    _cleanup()
                    sys.exit(1)
            # ログイン済みタブを作業用ページとして採用し、フォームを確実に開く
            page = logged_page
            if "company/job/regist/form" not in page.url.lower():
                open_new_form(page)
                time.sleep(1.0)
        log("✅ ログイン確認。自動入力を開始します。", "success")

        done = 0
        for i, job in enumerate(jobs):
            jid = job.get("id")
            title = jget(job, "title", "catchcopy", default=f"job#{i+1}")
            try:
                if i > 0:
                    if not open_new_form(page):
                        raise Exception("求人作成フォームを開けませんでした（再試行後も失敗）")
                    time.sleep(1.0)
                log(f"📝 [{i+1}/{len(jobs)}] 入力中: {title[:40]}", "info")
                fill_job(page, job)
                time.sleep(0.5)
                os.makedirs("logs", exist_ok=True)
                if DRAFT_ONLY:
                    if save_draft(page):
                        time.sleep(2.5)
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
                else:
                    # 掲載（公開）まで実行
                    r = publish(page, i + 1)
                    time.sleep(2)
                    try:
                        page.screenshot(path=f"logs/engage_published_{i+1}.png", full_page=False)
                    except Exception:
                        pass
                    if r:
                        log(f"  ✅ 掲載（公開）完了: {title[:40]}  … ボタン『{r}』", "success")
                        if jid:
                            posted(jid)
                        done += 1
                    else:
                        # 掲載ボタンが見つからない場合は、入力内容を失わないよう下書き保存
                        saved = save_draft(page)
                        log(f"  ⚠️ 掲載ボタンが見つかりませんでした: {title[:40]}"
                            + ("（下書き保存済み）" if saved else "")
                            + " ※engageの掲載ボタン名を教えていただければ対応します", "warn")
            except Exception as e:
                log(f"  ❌ 失敗: {title[:40]} — {e}", "error")

        if DRAFT_ONLY:
            log(f"完了: {done}/{len(jobs)} 件を下書き保存しました。engage上で確認して公開してください。", "success")
        else:
            log(f"完了: {done}/{len(jobs)} 件を掲載（公開）しました。engage上でご確認ください。", "success")
        _cleanup()


if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    main()
