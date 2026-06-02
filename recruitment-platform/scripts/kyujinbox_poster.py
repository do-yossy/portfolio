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
import threading
from urllib.parse import parse_qs, urlencode, urlparse

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
    print(json.dumps({"type": "progress", "message": str(message) if message is not None else "", "level": level}), flush=True)

def rand_delay(min_s=0.5, max_s=1.5):
    time.sleep(random.uniform(min_s, max_s))

def start_keepalive(interval=12):
    """SSE接続が切れないよう定期的に進捗メッセージを送るスレッド"""
    stop_event = threading.Event()
    def _run():
        while not stop_event.wait(interval):
            progress("⏳ 処理中...", "info")
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return stop_event

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
    rand_delay(0.2, 0.5)
    for char in text:
        page.keyboard.type(char)
        time.sleep(random.uniform(0.02, 0.06))

def fill_text(page, selector, value, timeout=8000):
    """テキスト/テキストエリアを埋める（Vue v-model完全対応版）
    - 200字以内: press_sequentially で1文字ずつ入力 → Vue input イベントが確実に発火
    - 200字超: fill() + native InputEvent dispatch で高速処理
    """
    try:
        el = page.wait_for_selector(selector, timeout=timeout)
        if not el:
            return False
        el.scroll_into_view_if_needed()
        el.click()
        rand_delay(0.08, 0.15)
        # 既存テキストをクリア
        el.press('Control+a')
        rand_delay(0.03, 0.06)
        el.press('Delete')
        rand_delay(0.05, 0.08)
        str_val = str(value)
        if len(str_val) <= 200:
            # キー入力シミュレーション: Vue の input/change イベントを確実に発火させる
            el.press_sequentially(str_val, delay=15)
        else:
            # 長文: fill() で高速セット後、native setter + InputEvent で Vue に通知
            el.fill(str_val)
            try:
                el.evaluate("""el => {
                    const proto = el.tagName === 'TEXTAREA'
                        ? HTMLTextAreaElement.prototype
                        : HTMLInputElement.prototype;
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                    if (setter) setter.call(el, el.value);
                    el.dispatchEvent(new InputEvent('input', {
                        bubbles: true, cancelable: true, composed: true, inputType: 'insertText'
                    }));
                    el.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
                }""")
            except Exception:
                pass
        # Tab でブラー → Vue v-model / v-model.lazy を更新
        el.press('Tab')
        rand_delay(0.12, 0.25)
        return True
    except Exception:
        return False

def select_option_safe(page, selector, label=None, value=None, timeout=5000, debug=False):
    """select要素を安全にセット。失敗時はオプション一覧をログ出力"""
    try:
        el = page.wait_for_selector(selector, timeout=timeout)
        if label:
            try:
                el.select_option(label=label)
                el.press('Tab')
                rand_delay(0.2, 0.4)
                return True
            except Exception:
                pass
            try:
                opts = el.query_selector_all('option')
                for opt in opts:
                    txt = (opt.inner_text() or '').strip()
                    if label in txt or txt in label:
                        val = opt.get_attribute('value') or ''
                        el.select_option(value=val)
                        el.press('Tab')
                        progress(f"    select 部分一致: '{txt}' (value={val})", "info")
                        rand_delay(0.2, 0.4)
                        return True
            except Exception:
                pass
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
            el.press('Tab')
            rand_delay(0.2, 0.4)
            return True
        return False
    except Exception:
        return False

def click_submit_button(page):
    """フォームの送信ボタンをクリック（複数の方法を試す）"""
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    rand_delay(0.5, 1.0)

    try:
        buttons = page.query_selector_all('button, input[type="submit"]')
        progress(f"  🔍 ボタン数: {len(buttons)}", "info")
        btn_info = []
        for btn in buttons:
            try:
                tag = btn.evaluate('e => e.tagName.toLowerCase()')
                typ = btn.get_attribute('type') or ''
                cls = (btn.get_attribute('class') or '')[:50]
                txt = (btn.inner_text() or '').strip()[:40]
                btn_info.append(f"[{tag}] type={typ} class={cls} text={txt}")
            except Exception:
                btn_info.append('?')
        for line in btn_info[:10]:
            progress(f"    {line}", "info")
        if len(btn_info) > 20:
            progress(f"    ... ({len(btn_info)-20}件省略) ...", "info")
        for line in btn_info[-10:]:
            progress(f"    {line}", "info")
    except Exception:
        pass

    # まず「公開する」ボタンが有効か確認
    publish_disabled = False
    try:
        pub_loc = page.locator('button:has-text("公開する")')
        if pub_loc.count() > 0:
            pub_el = pub_loc.last
            if pub_el.is_visible():
                cls = pub_el.get_attribute('class') or ''
                publish_disabled = 'is-disab' in cls or pub_el.get_attribute('disabled') is not None
    except Exception:
        pass

    # 公開するが無効なら「一時保存」を先に試みる（バリデーション回避）
    if publish_disabled:
        progress("  ⚠️ 「公開する」が無効 → 「一時保存」を試みます", "warn")
        for tag in ['button', 'a']:
            try:
                draft_loc = page.locator(f'{tag}:has-text("一時保存")')
                if draft_loc.count() > 0:
                    draft_el = draft_loc.last
                    if draft_el.is_visible():
                        draft_el.scroll_into_view_if_needed()
                        rand_delay(0.3, 0.6)
                        draft_el.click()
                        progress(f"  ✅ 一時保存クリック（後で手動公開が必要）", "info")
                        return True
            except Exception:
                pass

    for label in ['公開する', '掲載する', '求人を公開', '保存して公開', '登録する', '確認する', '次へ', '一時保存', '保存']:
        for tag in ['button', 'a']:
            try:
                locator = page.locator(f'{tag}:has-text("{label}")')
                count = locator.count()
                if count > 0:
                    el = locator.last
                    if el.is_visible():
                        el.scroll_into_view_if_needed()
                        rand_delay(0.3, 0.6)
                        cls = el.get_attribute('class') or ''
                        if 'is-disab' in cls or 'disabled' in cls:
                            progress(f"  ⚠️ ボタンが無効状態 (is-disab) - クラス除去後にクリック", "warn")
                            el.evaluate("""e => {
                                e.classList.remove('is-disab');
                                e.removeAttribute('disabled');
                                e.click();
                            }""")
                        else:
                            el.click()
                        progress(f"  ✅ ボタンクリック: {tag}:has-text(\"{label}\") ({count}個中の最後)", "info")
                        return True
            except Exception:
                pass

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

    try:
        page.evaluate("document.querySelector('form').submit()")
        progress("  ✅ JavaScript form.submit() を実行", "info")
        return True
    except Exception as e:
        progress(f"  ❌ 送信ボタンが見つかりません: {e}", "error")
        return False


def _is_empty_val(v):
    """空とみなす値か判定（0は数値として有効なので空扱いしない）"""
    if v is None:
        return True
    if isinstance(v, str):
        return v.strip() in ('', 'null', 'None', 'undefined')
    if isinstance(v, (list, dict)):
        return len(v) == 0
    return False


def setup_submit_interceptor(page, job_type_val, phone_clear=True, full_payload=None):
    """
    フォーム送信POSTをインターセプトして本文を正しいデータで上書きする。
    Vue.jsのreactive状態が未更新でも確実に正しい値をサーバーに送信できる。

    full_payload: 求人の全フィールドを含むdict。POST本文の各キーが空の場合に注入する。
                  本文に既に存在するキーのみ上書きし、未知のキーは追加しない
                  （APIスキーマを壊さないため）。
    JSON・form-encoded 両方に対応。
    """
    intercepted = {'count': 0}
    full_payload = full_payload or {}

    def handle(route):
        req = route.request
        if req.method != 'POST':
            route.continue_()
            return

        ct = (req.headers.get('content-type') or '').lower()
        body = req.post_data or ''

        if not body:
            route.continue_()
            return

        url_short = req.url.split('?')[0]
        is_job_post = '/jobs' in url_short or '/job/' in url_short or 'draft' in url_short

        try:
            if 'application/json' in ct:
                data = json.loads(body)
                modified = []

                # ── kyujinbox本文は {kyujin: "<JSON文字列>", token: "..."} 構造 ──
                # フォームデータは data['kyujin'] の中にJSON文字列として入れ子になっている。
                # その文字列をパースして中身を書き換える必要がある。
                inner = None
                if isinstance(data, dict) and isinstance(data.get('kyujin'), str):
                    try:
                        inner = json.loads(data['kyujin'])
                    except Exception:
                        inner = None

                # 注入対象: 入れ子があればその中、なければトップレベル（フラット）
                target = inner if isinstance(inner, dict) else (data if isinstance(data, dict) else None)

                if target is None:
                    route.continue_()
                    return

                # ── 求人投稿系POSTなら内側の全キー名＋現在値をログ出力（スキーマ把握用）──
                if is_job_post:
                    all_keys = list(target.keys())
                    progress(f"  📦 kyujin内側キー({len(all_keys)}件): {', '.join(all_keys)}", "info")
                    # 各キーの現在値を出力（UIラベルとの対応・空判定のため）
                    for k in all_keys:
                        v = target.get(k)
                        vs = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
                        mark = '∅' if _is_empty_val(v) else '●'
                        progress(f"     {mark} {k} = {str(vs)[:45]}", "info")
                    # 全文をファイルにも保存（確実な共有用）
                    try:
                        script_dir = os.path.dirname(os.path.abspath(__file__))
                        logs_dir = os.path.join(script_dir, '..', 'logs')
                        os.makedirs(logs_dir, exist_ok=True)
                        with open(os.path.join(logs_dir, 'kyujin_inner.json'), 'w', encoding='utf-8') as f:
                            json.dump(target, f, ensure_ascii=False, indent=2)
                        progress("  📦 内側JSON全文を logs/kyujin_inner.json に保存しました", "info")
                    except Exception:
                        pass

                # ── 全フィールド注入：内側に存在し かつ 空のキーを正しい値で埋める ──
                for k, correct_v in full_payload.items():
                    if correct_v is None or correct_v == '':
                        continue
                    if k in target and _is_empty_val(target.get(k)):
                        target[k] = correct_v
                        modified.append(f"{k}={str(correct_v)[:15]}")

                # jobType は内側に無くても強制追加（最重要・必須項目）
                cur_jt = str(target.get('jobType', '')).strip()
                if cur_jt in ('', 'null', '0', 'None', 'undefined'):
                    target['jobType'] = job_type_val
                    if 'jobType' not in [m.split('=')[0] for m in modified]:
                        modified.append(f"jobType={job_type_val}")

                if phone_clear:
                    if target.get('applicationPhoneNumber'):
                        target['applicationPhoneNumber'] = ''
                        modified.append('phone cleared')
                    if target.get('isPhoneNumberRequired'):
                        target['isPhoneNumberRequired'] = False
                        modified.append('phoneRequired=false')

                if modified:
                    intercepted['count'] += 1
                    # 入れ子だった場合は再度JSON文字列化して戻す
                    if isinstance(inner, dict):
                        data['kyujin'] = json.dumps(inner, ensure_ascii=False)
                    new_body = json.dumps(data, ensure_ascii=False)
                    progress(f"  🔧 POST修正(JSON) [{url_short[-50:]}]: {', '.join(modified[:25])}", "info")
                    route.continue_(post_data=new_body)
                    return

            elif 'x-www-form-urlencoded' in ct:
                data = parse_qs(body, keep_blank_values=True)
                modified = []

                cur_jt = data.get('jobType', [''])[0].strip()
                if cur_jt in ('', '0'):
                    data['jobType'] = [str(job_type_val)]
                    modified.append(f"jobType={job_type_val}")

                if phone_clear:
                    if data.get('applicationPhoneNumber', [''])[0]:
                        data['applicationPhoneNumber'] = ['']
                        modified.append('phone cleared')
                    data['isPhoneNumberRequired'] = ['0']

                if modified:
                    intercepted['count'] += 1
                    new_body = urlencode({k: v[0] for k, v in data.items()})
                    progress(f"  🔧 POST修正(form) [{req.url.split('?')[0][-60:]}]: {', '.join(modified)}", "info")
                    route.continue_(post_data=new_body)
                    return

        except Exception as ex:
            progress(f"  インターセプト処理エラー: {ex}", "warn")

        route.continue_()

    # ── 求人保存系APIのレスポンスをログ出力（成否確認用）──
    def on_response(resp):
        try:
            url = resp.url.split('?')[0]
            if ('/jobs' in url or '/job/' in url or 'draft' in url) and resp.request.method == 'POST':
                status = resp.status
                snippet = ''
                try:
                    txt = resp.text()
                    snippet = txt[:200].replace('\n', ' ')
                except Exception:
                    snippet = '(本文取得不可)'
                level = 'success' if 200 <= status < 300 else 'warn'
                progress(f"  📨 APIレスポンス [{url[-50:]}] status={status} body={snippet}", level)
        except Exception:
            pass

    page.route('**', handle)
    page.on('response', on_response)
    return intercepted, lambda: _safe_unroute(page, handle, on_response)


def _safe_unroute(page, handler, resp_handler=None):
    try:
        page.unroute('**', handler)
    except Exception:
        pass
    if resp_handler:
        try:
            page.remove_listener('response', resp_handler)
        except Exception:
            pass


def find_post_url(page, group_id=None):
    """
    求人新規作成URLを特定する。
    /jobs/new が404の場合は求人一覧ページのボタンからURLを取得する。
    """
    if not group_id:
        group_id = os.environ.get("KYUJINBOX_GROUP_ID", "").strip()

    # グループIDがある場合は一覧ページから新規作成ボタンを探す
    if group_id:
        list_url = f"https://saiyo.kyujinbox.com/company/groups/{group_id}/jobs"
        try:
            page.goto(list_url, timeout=20000)
            page.wait_for_load_state('networkidle', timeout=10000)
            rand_delay(1.5, 2.5)

            # 新規作成ボタン/リンクを探す
            for kw in ['新規求人', '求人を作成', '求人登録', '新規作成', '求人を出す', '掲載', '新規', '＋']:
                try:
                    locator = page.locator(f'a:has-text("{kw}"), button:has-text("{kw}")')
                    if locator.count() > 0:
                        el = locator.first
                        if el.is_visible():
                            href = el.get_attribute('href') or ''
                            if href.startswith('http'):
                                progress(f"  📎 新規求人URL(ボタン): {href}", "info")
                                return href
                            elif href.startswith('/'):
                                url = f"https://saiyo.kyujinbox.com{href}"
                                progress(f"  📎 新規求人URL(ボタン): {url}", "info")
                                return url
                            else:
                                # クリックしてURLを取得
                                el.click()
                                page.wait_for_load_state('networkidle', timeout=10000)
                                rand_delay(1.0, 2.0)
                                url = page.url
                                progress(f"  📎 新規求人URL(クリック): {url}", "info")
                                return url
                except Exception:
                    pass

            # ページ内の /jobs/ を含むリンクを探す
            links = page.query_selector_all('a[href]')
            for link in links:
                href = link.get_attribute('href') or ''
                if '/jobs/' in href and ('new' in href or 'create' in href or 'add' in href):
                    url = href if href.startswith('http') else f"https://saiyo.kyujinbox.com{href}"
                    progress(f"  📎 新規求人URL(リンク): {url}", "info")
                    return url

            progress("  ⚠️ 新規求人ボタンが見つかりません。ページリンク一覧:", "warn")
            for link in links[:20]:
                href = link.get_attribute('href') or ''
                txt = (link.inner_text() or '').strip()[:30]
                if href:
                    progress(f"    {txt!r} → {href}", "warn")

        except Exception as e:
            progress(f"  ⚠️ 一覧ページ取得失敗: {e}", "warn")

    progress("  ⚠️ 新規求人URLを特定できませんでした", "error")
    return ""


def find_visible_selector(page, *selectors, timeout=5000):
    """複数セレクタを順番に試して最初に見つかったものを返す（visible/attached 両方試す）"""
    for sel in selectors:
        for state in ('visible', 'attached'):
            try:
                el = page.wait_for_selector(sel, timeout=timeout, state=state)
                if el:
                    return sel, el
            except Exception:
                pass
    return None, None


def dump_visible_inputs(page):
    """Vue描画後の全visible inputをログ出力（フォーム構造把握用）"""
    try:
        fields = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('input,textarea,select'))
              .filter(el => {
                  const s = window.getComputedStyle(el);
                  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
              })
              .map(el => {
                  let label = '';
                  if (el.id) {
                      const l = document.querySelector('label[for="'+el.id+'"]');
                      if (l) label = l.textContent.trim().slice(0,40);
                  }
                  if (!label) {
                      const l = el.closest('label') || el.closest('div,td')?.querySelector('label');
                      if (l) label = l.textContent.trim().slice(0,40);
                  }
                  const opts = el.tagName==='SELECT'
                      ? Array.from(el.options).slice(0,5).map(o=>o.value+':'+o.text.trim()).join('|')
                      : null;
                  return {
                      tag: el.tagName.toLowerCase(),
                      name: el.name||'',
                      id: el.id||'',
                      type: el.type||'',
                      ph: (el.placeholder||'').slice(0,30),
                      label,
                      opts
                  };
              });
        }""")
        progress(f"  📋 描画済みフィールド {len(fields)}件:", "info")
        for f in fields:
            line = f"    [{f['tag']}] name={f['name']!r} id={f['id']!r} type={f['type']!r} ph={f['ph']!r} label={f['label']!r}"
            if f['opts']:
                line += f"\n         opts: {f['opts']}"
            progress(line, "info")
    except Exception as e:
        progress(f"  フィールドダンプ失敗: {e}", "warn")


PREF_IDS = {
    '北海道':1,'青森県':2,'岩手県':3,'宮城県':4,'秋田県':5,'山形県':6,'福島県':7,
    '茨城県':8,'栃木県':9,'群馬県':10,'埼玉県':11,'千葉県':12,'東京都':13,'神奈川県':14,
    '新潟県':15,'富山県':16,'石川県':17,'福井県':18,'山梨県':19,'長野県':20,
    '岐阜県':21,'静岡県':22,'愛知県':23,'三重県':24,
    '滋賀県':25,'京都府':26,'大阪府':27,'兵庫県':28,'奈良県':29,'和歌山県':30,
    '鳥取県':31,'島根県':32,'岡山県':33,'広島県':34,'山口県':35,
    '徳島県':36,'香川県':37,'愛媛県':38,'高知県':39,
    '福岡県':40,'佐賀県':41,'長崎県':42,'熊本県':43,'大分県':44,'宮崎県':45,'鹿児島県':46,'沖縄県':47,
}


def patch_vue_kyujin_state(page, job, job_type_val, pay_type_val, pay_min, pay_max, pref_id, char_values, company_phone=''):
    """
    Vue コンポーネントのリアクティブ状態を直接パッチする。
    プロパティ名 'kyujin' に限らず、フォームフィールドを含む任意のデータオブジェクトを探す。
    """
    emp_type = job.get('employmentType') or job.get('employment_type', '')
    emp_keywords = {
        '正社員': '正社員', 'アルバイト': 'アルバイト・パート', 'パート': 'アルバイト・パート',
        '契約社員': '契約社員', '業務委託': '業務委託', '派遣': '派遣社員',
    }
    emp_label = '業務委託'
    for k, v in emp_keywords.items():
        if k in emp_type:
            emp_label = v
            break

    desc      = job.get('description', '')
    rewarding = (job.get('rewarding') or job.get('rewarding_text') or '').strip()
    quals     = job.get('qualifications', '')
    transport = (job.get('transportation') or job.get('access') or '').strip()
    worktime  = (job.get('worktimeHoliday') or job.get('worktime_holiday') or job.get('workTime') or '').strip()
    benefit   = job.get('salary', '')
    title     = job.get('title', '')
    location  = job.get('location', '')
    use_phone = bool(company_phone)

    patch_data = {
        'title': title,
        'description': desc,
        'rewarding': rewarding or desc[:100],
        'qualifications': quals,
        'transportation': transport,
        'worktimeHoliday': worktime,
        'benefit': benefit,
        'jobType': job_type_val,
        'employTypes': [emp_label],
        'characteristics': [int(v) for v in char_values],
        'payType': pay_type_val,
        'payMin': pay_min or None,
        'payMax': pay_max or None,
        'isPhoneNumberRequired': use_phone,
        'applicationPhoneNumber': company_phone,
        'workLocations': [{'prefectureId': pref_id, 'location': location}],
    }

    try:
        result = page.evaluate("""(patch) => {
            const msgs = [];
            const FORM_FIELDS = ['title', 'description', 'jobType'];

            // フォームデータを持つオブジェクトかどうか判定（プロパティ名問わず）
            function looksLikeFormData(obj) {
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
                return FORM_FIELDS.filter(f => f in obj).length >= 2;
            }

            // ── Vue2: フォームデータを持つVMをBFSで探す ──
            function findVue2FormVm() {
                const seen = new Set();
                for (const el of document.querySelectorAll('*')) {
                    if (!el.__vue__) continue;
                    let vm = el.__vue__;
                    while (vm.$parent) vm = vm.$parent;
                    if (seen.has(vm)) continue;
                    seen.add(vm);
                    const queue = [vm];
                    const visited = new Set();
                    while (queue.length) {
                        const curr = queue.shift();
                        if (visited.has(curr)) continue;
                        visited.add(curr);
                        if (curr.$data) {
                            // プロパティ名 'kyujin' を優先
                            if (looksLikeFormData(curr.$data.kyujin)) {
                                return {vm: curr, key: 'kyujin', data: curr.$data.kyujin};
                            }
                            // 次に全プロパティを走査
                            for (const [k, v] of Object.entries(curr.$data)) {
                                if (looksLikeFormData(v)) {
                                    return {vm: curr, key: k, data: v};
                                }
                            }
                        }
                        (curr.$children || []).forEach(c => queue.push(c));
                    }
                }
                return null;
            }

            // ── Vue3: フォームデータを持つコンポーネントをBFSで探す ──
            function findVue3FormComp() {
                const seen = new Set();
                for (const el of document.querySelectorAll('*')) {
                    if (!el.__vueParentComponent) continue;
                    let comp = el.__vueParentComponent;
                    while (comp.parent) comp = comp.parent;
                    if (seen.has(comp)) continue;
                    seen.add(comp);
                    const queue = [comp];
                    const visited = new Set();
                    while (queue.length) {
                        const curr = queue.shift();
                        if (visited.has(curr)) continue;
                        visited.add(curr);
                        for (const state of [curr.setupState, curr.ctx]) {
                            if (!state || typeof state !== 'object') continue;
                            // 'kyujin' キーを優先
                            if (looksLikeFormData(state.kyujin)) {
                                return {comp: curr, key: 'kyujin', data: state.kyujin};
                            }
                            for (const [k, v] of Object.entries(state)) {
                                if (looksLikeFormData(v)) {
                                    return {comp: curr, key: k, data: v};
                                }
                            }
                        }
                        const sub = curr.subTree;
                        if (sub) {
                            const walk = (vnode) => {
                                if (!vnode) return;
                                if (vnode.component) queue.push(vnode.component);
                                if (Array.isArray(vnode.children)) vnode.children.forEach(walk);
                            };
                            walk(sub);
                        }
                    }
                }
                return null;
            }

            // ── パッチ適用ヘルパー ──
            function applyPatch(formData, setFn) {
                for (const [k, v] of Object.entries(patch)) {
                    try {
                        if (v === null || v === undefined) continue;
                        if (k === 'workLocations') {
                            if (Array.isArray(formData.workLocations) && formData.workLocations[0]) {
                                const wl = formData.workLocations[0];
                                if (v[0].prefectureId !== null) wl.prefectureId = v[0].prefectureId;
                                if (v[0].location) wl.location = v[0].location;
                                msgs.push('wl.pref=' + v[0].prefectureId);
                            }
                            continue;
                        }
                        const before = JSON.stringify(formData[k]);
                        setFn(formData, k, v);
                        const after = JSON.stringify(formData[k]);
                        if (before !== after) msgs.push(k + '→' + after.slice(0, 20));
                    } catch(e) {
                        msgs.push(k + '_ERR:' + (e.message || '').slice(0, 15));
                    }
                }
            }

            // ── Nuxt2 ($nuxt) 試行 ──
            try {
                const nuxt = window.$nuxt;
                if (nuxt && nuxt.$store) {
                    // Vuex ストアから kyujin 系モジュールを探す
                    const st = nuxt.$store.state;
                    for (const mod of Object.keys(st)) {
                        const m = st[mod];
                        if (m && typeof m === 'object' && looksLikeFormData(m)) {
                            applyPatch(m, (obj, k, v) => nuxt.$store.commit(mod + '/SET_' + k.toUpperCase(), v) || (obj[k] = v));
                            if (msgs.length) return 'nuxt2-store[' + mod + ']: ' + msgs.join('; ');
                        }
                    }
                }
            } catch(e) {}

            // ── Nuxt3 (useNuxtApp) 試行 ──
            try {
                const app = window.__nuxt_app__ || (document.querySelector('#__nuxt')?.__vueParentComponent?.appContext?.app);
                if (app) {
                    // Pinia ストアを探す
                    const pinia = app._context?.provides?.pinia || app._context?.provides?.$pinia;
                    if (pinia && pinia._s) {
                        for (const [id, store] of pinia._s) {
                            if (looksLikeFormData(store.$state || store)) {
                                const storeData = store.$state || store;
                                applyPatch(storeData, (obj, k, v) => { obj[k] = v; });
                                if (msgs.length) return 'nuxt3-pinia[' + id + ']: ' + msgs.join('; ');
                            }
                        }
                    }
                }
            } catch(e) {}

            // ── Vue2 試行 ──
            const v2r = findVue2FormVm();
            if (v2r) {
                applyPatch(v2r.data, (obj, k, v) => v2r.vm.$set(obj, k, v));
                return 'v2[' + v2r.key + ']: ' + (msgs.join('; ') || 'no-change');
            }

            // ── Vue3 試行 ──
            const v3r = findVue3FormComp();
            if (v3r) {
                applyPatch(v3r.data, (obj, k, v) => { obj[k] = v; });
                return 'v3[' + v3r.key + ']: ' + (msgs.join('; ') || 'no-change');
            }

            // ── 最終手段: 全フィールドに native setter + InputEvent で Vue 通知 ──
            // NOTE: selectMap は削除。payType の change イベントが Vue の watcher を起動して
            //       payMin をクリアしてしまうため DOM 直接書き込みに統一する。
            let domCount = 0;

            // テキスト/数値フィールド（input + textarea）
            const domMap = {
                title:           'input[name="title"]',
                description:     'textarea[name="description"]',
                rewarding:       'textarea[name="rewarding"]',
                qualifications:  'textarea[name="qualifications"]',
                transportation:  'textarea[name="transportation"]',
                worktimeHoliday: 'textarea[name="worktimeHoliday"]',
                benefit:         'textarea[name="benefit"]',
                howToApply:      'textarea[name="howToApply"]',
                payMin:          'input[name="payMin"]',
                payMax:          'input[name="payMax"]',
            };
            for (const [k, sel] of Object.entries(domMap)) {
                const v = patch[k];
                if (v === null || v === undefined || v === '') continue;
                const el = document.querySelector(sel);
                if (!el) continue;
                try {
                    const proto = el.tagName === 'TEXTAREA'
                        ? window.HTMLTextAreaElement.prototype
                        : window.HTMLInputElement.prototype;
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                    if (setter) setter.call(el, String(v));
                    else el.value = String(v);
                    el.dispatchEvent(new InputEvent('input', {bubbles: true, cancelable: true, composed: true, inputType: 'insertText'}));
                    el.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
                    el.dispatchEvent(new Event('blur', {bubbles: true, composed: true}));
                    domCount++;
                } catch(e) {}
            }

            // hidden field フォールバック
            const hf = document.querySelector('input[name="kyujin"]');
            if (hf) {
                try {
                    const current = JSON.parse(hf.value || '{}');
                    Object.assign(current, patch);
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value')?.set;
                    if (setter) setter.call(hf, JSON.stringify(current));
                    hf.dispatchEvent(new Event('input', {bubbles: true}));
                    hf.dispatchEvent(new Event('change', {bubbles: true}));
                    msgs.push('kyujin-hf');
                } catch(e) {}
            }

            return 'dom-fallback: fields=' + domCount + ' ' + msgs.join('; ');
        }""", patch_data)
        progress(f"  🔧 Vue状態パッチ: {result}", "info")
        rand_delay(0.5, 1.0)
        return True
    except Exception as e:
        progress(f"  ⚠️ Vue状態パッチ失敗: {e}", "warn")
        return False


def fill_kyujinbox_form(page, job, company_name):
    """
    求人ボックスの求人フォームを埋める。
    戻り値: 選択したjobTypeの value 文字列（インターセプター用）
    """
    # ---- フォーム全体をスクロールして Vue の遅延レンダリングをすべて完了させる ----
    progress("  🔄 フォームセクション展開中（スクロール）...", "info")
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    rand_delay(1.0, 1.5)
    page.evaluate("window.scrollTo(0, 0)")
    rand_delay(0.5, 1.0)

    # 会社名
    fill_text(page, 'input[name="company"]', company_name, timeout=5000)
    rand_delay(0.3, 0.7)

    # タイトル（必須）
    # Vue.js SPA では name 属性がない場合があるため複数セレクタを試す
    title_sel, title_el = find_visible_selector(page,
        'input[name="title"]',
        'input[id="title"]',
        'input[placeholder*="タイトル"]',
        'input[placeholder*="求人タイトル"]',
        'input[placeholder*="求人名"]',
        'input[placeholder*="job_title" i]',
        timeout=8000,
    )
    if title_sel:
        # fill_text を使うことでVue v-model の input/blur イベントが確実に発火する
        fill_text(page, title_sel, job['title'])
        progress(f"  ✅ タイトル入力: {job['title'][:40]}", "info")
    else:
        # ラベルテキストで「求人名」「タイトル」を含む input を探す
        try:
            result = page.evaluate("""(title) => {
                const labels = Array.from(document.querySelectorAll('label'));
                for (const lbl of labels) {
                    const txt = lbl.textContent.trim();
                    if (/タイトル|求人名|職種名/.test(txt)) {
                        const id = lbl.getAttribute('for');
                        const target = id
                            ? document.getElementById(id)
                            : lbl.closest('div,td')?.querySelector('input,textarea');
                        if (target) {
                            target.focus();
                            const setter = Object.getOwnPropertyDescriptor(
                                window.HTMLInputElement.prototype, 'value')?.set;
                            if (setter) setter.call(target, title);
                            target.dispatchEvent(new Event('input', {bubbles:true}));
                            target.dispatchEvent(new Event('change', {bubbles:true}));
                            return 'ok:' + txt;
                        }
                    }
                }
                // 最終手段: 最初の visible text input
                const first = Array.from(document.querySelectorAll('input[type="text"],input:not([type])'))
                    .find(el => el.offsetWidth > 0 && el.offsetHeight > 0);
                if (first) {
                    first.focus();
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value')?.set;
                    if (setter) setter.call(first, title);
                    first.dispatchEvent(new Event('input', {bubbles:true}));
                    first.dispatchEvent(new Event('change', {bubbles:true}));
                    return 'fallback-first-input';
                }
                return null;
            }""", job['title'])
            if result:
                progress(f"  ✅ タイトル入力（ラベル/フォールバック）: {result}", "info")
            else:
                progress(f"  ⚠️ タイトル入力欄が見つかりません", "warn")
                save_screenshot(page, "title_not_found")
        except Exception as e:
            progress(f"  ⚠️ タイトル入力失敗: {e}", "warn")
            save_screenshot(page, "title_not_found")

    # 仕事内容（必須）
    desc_sel, _ = find_visible_selector(page,
        'textarea[name="description"]',
        'textarea[name="jobDescription"]',
        'textarea[placeholder*="仕事内容"]',
        'textarea[placeholder*="業務内容"]',
        timeout=5000,
    )
    if desc_sel:
        fill_text(page, desc_sel, job.get('description', ''))
    rand_delay(0.5, 1.0)

    # キャッチコピー (input[name="catch"] 等)
    catchcopy = job.get('catchcopy', '')
    if catchcopy:
        for sel in ['input[name="catch"]', 'input[name="catchCopy"]', 'input[name="catchcopy"]',
                    'input[placeholder*="キャッチ"]', 'input[placeholder*="コピー"]']:
            if fill_text(page, sel, catchcopy, timeout=500):
                progress(f"  ✅ catchcopy 入力: {catchcopy[:30]}", "info")
                break

    # ---- 職種 (select[name="jobType"]) ----
    # 必須。空のままだと「公開する」ボタンが is-disab になる。
    # Vue reactiveの更新に依存しないよう、選択した value をインターセプターに渡す。
    selected_job_type_val = None
    # DB は snake_case で返すため両方チェック
    job_type = job.get('jobType') or job.get('job_type', '')
    try:
        _, jt_el = find_visible_selector(page,
            'select[name="jobType"]',
            'select[name="job_type"]',
            'select[id="jobType"]',
            timeout=8000,
        )
        if jt_el is None:
            raise Exception("jobType セレクトが見つかりません")
        opts = jt_el.query_selector_all('option')
        option_list = [(opt.get_attribute('value') or '', (opt.inner_text() or '').strip()) for opt in opts]
        # 全オプションを表示（ドライバー系カテゴリ特定のため）
        progress(f"  📋 jobType 全オプション({len(option_list)}件):", "info")
        for v, t in option_list:
            if v:
                progress(f"    value={v!r} text={t!r}", "info")

        chosen_val = None
        chosen_txt = None

        # ① ドライバー系キーワードで優先マッチ
        DRIVER_KEYWORDS = ['ドライバー', '配送', '運送', '軽貨物', '宅配', '配達', 'デリバリー']
        for kw in DRIVER_KEYWORDS:
            for v, t in option_list:
                if v and kw in t:
                    chosen_val = v
                    chosen_txt = t
                    break
            if chosen_val:
                break

        # ② DBのjobTypeラベルで一致を試みる
        if not chosen_val and job_type:
            for v, t in option_list:
                if v and (job_type in t or t in job_type):
                    chosen_val = v
                    chosen_txt = t
                    break

        # ③ フォールバック: 最初の有効なオプション
        if not chosen_val:
            for v, t in option_list:
                if v:
                    chosen_val = v
                    chosen_txt = t
                    break

        if chosen_val:
            # まず element 経由で select_option（イベント発火がより確実）
            try:
                jt_el.select_option(value=chosen_val)
                rand_delay(0.3, 0.6)
                progress(f"  ✅ jobType 選択: '{chosen_txt}' (value={chosen_val})", "info")
            except Exception:
                try:
                    page.locator('select').filter(has=page.locator('option')).first.select_option(value=chosen_val)
                    rand_delay(0.3, 0.6)
                    progress(f"  ✅ jobType 選択(fallback): '{chosen_txt}' (value={chosen_val})", "info")
                except Exception as e2:
                    progress(f"  ⚠️ jobType 選択失敗: {e2}", "warn")

            # Vue reactive state を可能な限り更新
            try:
                result = page.evaluate(f"""(targetVal) => {{
                    // name または id で jobType select を探す
                    const sel = document.querySelector('select[name="jobType"]')
                             || document.querySelector('select[name="job_type"]')
                             || document.querySelector('select[id="jobType"]');
                    if (!sel) return 'not found';

                    // native setter で強制設定
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLSelectElement.prototype, 'value')?.set;
                    if (setter) setter.call(sel, targetVal);

                    // Vue2: __vue__ ウォーク
                    function tryVue2(el) {{
                        let node = el;
                        for (let i = 0; i < 30; i++) {{
                            if (!node) break;
                            const vm = node.__vue__;
                            if (vm) {{
                                let p = vm;
                                while (p) {{
                                    const data = p.$data || {{}};
                                    // 直接キー
                                    if ('jobType' in data) {{
                                        p.jobType = targetVal;
                                        return 'v2:direct:jobType';
                                    }}
                                    // ネストされたオブジェクト
                                    for (const k of Object.keys(data)) {{
                                        const d = data[k];
                                        if (d && typeof d === 'object' && !Array.isArray(d)) {{
                                            if ('jobType' in d) {{
                                                d.jobType = targetVal;
                                                return 'v2:nested:' + k + '.jobType';
                                            }}
                                        }}
                                    }}
                                    p = p.$parent;
                                }}
                            }}
                            node = node.parentElement;
                        }}
                        return null;
                    }}

                    // Vue3: __vueParentComponent ウォーク
                    function tryVue3(el) {{
                        let node = el;
                        for (let i = 0; i < 30; i++) {{
                            if (!node) break;
                            const comp = node.__vueParentComponent;
                            if (comp) {{
                                for (const state of [comp.setupState, comp.ctx, comp.props]) {{
                                    if (!state || typeof state !== 'object') continue;
                                    try {{
                                        const keys = Object.keys(state);
                                        if (keys.includes('jobType')) {{
                                            state.jobType = targetVal;
                                            return 'v3:direct:jobType';
                                        }}
                                        for (const k of keys) {{
                                            const d = state[k];
                                            if (d && typeof d === 'object' && !Array.isArray(d)) {{
                                                if ('jobType' in d) {{
                                                    d.jobType = targetVal;
                                                    return 'v3:nested:' + k + '.jobType';
                                                }}
                                            }}
                                        }}
                                    }} catch(e) {{}}
                                }}
                            }}
                            node = node.parentElement;
                        }}
                        return null;
                    }}

                    const v2 = tryVue2(sel);
                    const v3 = tryVue3(sel);

                    // 全イベントを再発火
                    ['focus','input','change','blur'].forEach(t =>
                        sel.dispatchEvent(new Event(t, {{bubbles: true, composed: true}}))
                    );

                    return (v2 || v3 || 'events-only') + ' val=' + sel.value;
                }}""", chosen_val)
                progress(f"  🔧 jobType Vue更新: {result}", "info")
                rand_delay(0.5, 1.0)
            except Exception as e:
                progress(f"  ⚠️ jobType Vue更新失敗(無視): {e}", "warn")

            selected_job_type_val = chosen_val

    except Exception as e:
        progress(f"  ⚠️ jobType 選択失敗: {e}", "warn")

    # ---- 雇用形態 (employTypes checkboxes) ----
    # DB は snake_case で返すため両方チェック
    employment_type = job.get('employmentType') or job.get('employment_type', '')
    try:
        result = page.evaluate(f"""() => {{
            const cbs = document.querySelectorAll('input[name="employTypes"]');
            if (!cbs.length) return 'none found';
            const empType = {json.dumps(employment_type)};
            const keywords = ['正社員','アルバイト','パート','契約社員','派遣','業務委託'];
            let target = null;
            for (const cb of cbs) {{
                const label = cb.closest('label') || cb.nextElementSibling;
                const txt = label ? label.textContent.trim() : '';
                if (empType && keywords.some(k => empType.includes(k) && txt.includes(k))) {{
                    target = {{label, txt}};
                    break;
                }}
            }}
            if (!target) {{
                const cb = cbs[0];
                const label = cb.closest('label') || cb.nextElementSibling;
                if (label) target = {{label, txt: label.textContent.trim()}};
            }}
            if (!target || !target.label) {{
                const cb = cbs[0];
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'checked')?.set;
                if (setter) setter.call(cb, true);
                cb.dispatchEvent(new Event('change', {{bubbles:true}}));
                return 'forced-check';
            }}
            target.label.click();
            return 'clicked: ' + target.txt;
        }}""")
        progress(f"  ✅ employTypes: {result}", "info")
        rand_delay(0.3, 0.6)
    except Exception as e:
        progress(f"  ⚠️ employTypes 失敗: {e}", "warn")

    # ---- 都道府県 (select[name="prefVal"]) ----
    location = job.get('location', '')
    pref = extract_prefecture(location)
    pref_id = PREF_IDS.get(pref) if pref else None
    if pref:
        ok = select_option_safe(page, 'select[name="prefVal"]', label=pref, debug=True)
        if not ok:
            # value（数値ID）で直接選択を試みる
            if pref_id:
                ok = select_option_safe(page, 'select[name="prefVal"]', value=str(pref_id), debug=False)
            if not ok:
                progress(f"  ⚠️ 都道府県 '{pref}' の選択失敗", "warn")
            else:
                progress(f"  ✅ 都道府県 value={pref_id} で選択", "info")
        rand_delay(0.3, 0.7)

    # ---- 住所テキスト (input[name="address"]) ----
    fill_text(page, 'input[name="address"]', location)
    rand_delay(0.3, 0.7)

    # ---- 給与 ----
    salary_str = job.get('salary', '')
    pay_type, pay_min, pay_max = parse_salary(salary_str)
    progress(f"  💰 給与解析: タイプ={pay_type}, 最小={pay_min}, 最大={pay_max}", "info")

    progress(f"  💰 給与タイプ選択中: {pay_type}", "info")
    select_option_safe(page, 'select[name="payType"]', label=pay_type, debug=True)
    rand_delay(0.2, 0.5)

    if pay_min:
        progress(f"  💰 最小給与入力中: {pay_min}", "info")
        try:
            pm_el = page.wait_for_selector('input[name="payMin"]', timeout=5000)
            ph = pm_el.get_attribute('placeholder') or ''
            pay_min_val = pay_min
            if '万' in ph and int(pay_min) >= 10000:
                pay_min_val = str(int(pay_min) // 10000)
                progress(f"  💴 payMin を万円単位に変換: {pay_min} → {pay_min_val}", "info")
            fill_text(page, 'input[name="payMin"]', pay_min_val)
        except Exception:
            fill_text(page, 'input[name="payMin"]', pay_min)
        rand_delay(0.2, 0.5)

    if pay_max:
        progress(f"  💰 最大給与入力中: {pay_max}", "info")
        try:
            px_el = page.wait_for_selector('input[name="payMax"]', timeout=5000)
            ph = px_el.get_attribute('placeholder') or ''
            pay_max_val = pay_max
            if '万' in ph and int(pay_max) >= 10000:
                pay_max_val = str(int(pay_max) // 10000)
            fill_text(page, 'input[name="payMax"]', pay_max_val)
        except Exception:
            fill_text(page, 'input[name="payMax"]', pay_max)
        rand_delay(0.2, 0.5)

    # 給与詳細テキスト
    progress(f"  📝 給与詳細テキスト入力中", "info")
    fill_text(page, 'textarea[name="benefit"]', salary_str)
    rand_delay(0.3, 0.6)

    # kyujinbox フィールドの文字数制限
    LIMIT_REWARDING     = 130  # やりがい（上限140字）
    LIMIT_WORKTIME      = 130  # 勤務時間・休日（上限140字）
    LIMIT_TRANSPORT     = 130  # アクセス（上限140字）
    LIMIT_QUALIFICATIONS= 130  # 応募資格（上限140字）

    # 仕事のやりがい (rewarding) - 140文字以内に切り詰め
    # DB は snake_case なので両方チェック。descriptionのフォールバックは使わない
    rewarding = (job.get('rewarding') or job.get('rewarding_text') or '').strip()
    if rewarding:
        rewarding_trunc = rewarding[:LIMIT_REWARDING]
        progress(f"  📝 やりがい入力中 ({len(rewarding)}→{len(rewarding_trunc)}字)", "info")
        fill_text(page, 'textarea[name="rewarding"]', rewarding_trunc)
        rand_delay(0.2, 0.4)

    # 労働時間・休日 (worktimeHoliday) - DB snake_case: worktime_holiday
    worktime = (job.get('worktimeHoliday') or job.get('worktime_holiday')
                or job.get('workTime') or '').strip()
    if worktime:
        worktime_trunc = worktime[:LIMIT_WORKTIME]
        progress(f"  📝 勤務時間・休日入力中 ({len(worktime)}→{len(worktime_trunc)}字)", "info")
        fill_text(page, 'textarea[name="worktimeHoliday"]', worktime_trunc)
        rand_delay(0.2, 0.4)

    # アクセス (transportation)
    transport = (job.get('transportation') or job.get('access') or '').strip()
    if transport:
        transport_trunc = transport[:LIMIT_TRANSPORT]
        progress(f"  📝 アクセス情報入力中 ({len(transport)}→{len(transport_trunc)}字)", "info")
        fill_text(page, 'textarea[name="transportation"]', transport_trunc)
        rand_delay(0.2, 0.4)

    # 応募資格（タグから生成） - 140文字以内
    tags = job.get('tags', [])
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except Exception:
            tags = []
    if tags:
        qual_text = ' / '.join(str(t) for t in tags)[:LIMIT_QUALIFICATIONS]
        progress(f"  📝 応募資格・タグ入力中 ({len(qual_text)}字)", "info")
        fill_text(page, 'textarea[name="qualifications"]', qual_text)
        rand_delay(0.2, 0.4)

    # ---- 特徴チェックボックス (characteristics) ----
    # 確認済みvalue: 未経験歓迎=1, 研修あり=19, 昇給あり=23, 社会保険完備=24, 週休2日制=43, 車通勤OK=52
    CHAR_VALUES = ['1', '19', '23', '24', '43', '52']
    try:
        checked_chars = page.evaluate(f"""(targetValues) => {{
            const checkboxes = document.querySelectorAll('input[name="characteristics"]');
            if (!checkboxes.length) return 'none found';
            let checked = 0;
            for (const cb of checkboxes) {{
                if (targetValues.includes(cb.value)) {{
                    if (!cb.checked) {{
                        const label = cb.closest('label') || cb.nextElementSibling
                            || document.querySelector('label[for="' + cb.id + '"]');
                        if (label) {{
                            label.click();
                        }} else {{
                            const setter = Object.getOwnPropertyDescriptor(
                                window.HTMLInputElement.prototype, 'checked')?.set;
                            if (setter) setter.call(cb, true);
                            cb.dispatchEvent(new Event('change', {{bubbles: true}}));
                        }}
                        checked++;
                    }}
                }}
            }}
            return 'checked ' + checked + '/' + checkboxes.length;
        }}""", CHAR_VALUES)
        progress(f"  ✅ characteristics: {checked_chars}", "info")
        rand_delay(0.3, 0.6)
    except Exception as e:
        progress(f"  ⚠️ characteristics 失敗: {e}", "warn")

    # ---- 応募方法 (howToApply) ----
    # DB の how_to_apply フィールドを優先し、未設定ならデフォルト文言を使用
    how_to_apply = (
        job.get('how_to_apply') or job.get('howToApply') or
        "下記URLよりWebでご応募ください。書類選考後にご連絡いたします。"
    ).strip()
    progress(f"  📝 応募方法入力中", "info")
    fill_text(page, 'textarea[name="howToApply"]', how_to_apply, timeout=3000)
    rand_delay(0.2, 0.4)

    # ---- 担当者情報 (relation) ----
    try:
        select_option_safe(page, 'select[name="relation"]', value='2', timeout=3000)
        rand_delay(0.1, 0.3)
    except Exception:
        pass

    # ---- 応募必要項目 (applicationInfo) ----
    # 「基本情報+職務経歴」を選択する（必須項目）
    try:
        result = page.evaluate("""() => {
            const radios = document.querySelectorAll('input[name="applicationInfo"]');
            if (!radios.length) return 'not found';

            // まずスクロールしてセクションを表示（Vue lazy render 対策）
            radios[0].scrollIntoView({block: 'center'});

            // すべてのラジオとラベルをダンプ（デバッグ用）
            const info = Array.from(radios).map(r => {
                const lbl = r.closest('label') || document.querySelector('label[for="' + r.id + '"]')
                          || r.nextElementSibling;
                return r.value + ':' + (lbl ? lbl.textContent.trim().slice(0,20) : '?');
            });

            // 「基本情報+職務経歴」または最も詳しいオプションを選択
            const keywords = ['基本情報+職務経歴', '基本情報＋職務経歴', '職務経歴', '基本情報'];
            for (const kw of keywords) {
                for (const r of radios) {
                    const lbl = r.closest('label') || document.querySelector('label[for="' + r.id + '"]')
                              || r.nextElementSibling;
                    const txt = lbl ? lbl.textContent.trim() : '';
                    if (txt.includes(kw)) {
                        if (lbl) { lbl.click(); return 'clicked: ' + txt + ' [opts:' + info.join('|') + ']'; }
                        r.checked = true;
                        r.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
                        return 'forced: ' + txt;
                    }
                }
            }
            // value=2 か value=3 を直接試す（基本情報+職務経歴は通常このvalue）
            for (const v of ['3', '2']) {
                const r = Array.from(radios).find(r => r.value === v);
                if (r) {
                    const lbl = r.closest('label') || document.querySelector('label[for="' + r.id + '"]');
                    if (lbl) { lbl.click(); return 'by-value-' + v + ': ' + lbl.textContent.trim().slice(0,20); }
                    r.checked = true;
                    r.dispatchEvent(new Event('change', {bubbles: true}));
                    return 'by-value-forced-' + v;
                }
            }
            // 最終フォールバック: 最後のラジオ（最も詳細な選択肢）
            const last = radios[radios.length - 1];
            const lbl = last.closest('label') || document.querySelector('label[for="' + last.id + '"]');
            if (lbl) { lbl.click(); return 'fallback-last: ' + lbl.textContent.trim().slice(0,30); }
            last.checked = true;
            last.dispatchEvent(new Event('change', {bubbles: true}));
            return 'fallback-last-check. opts:' + info.join('|');
        }""")
        progress(f"  ✅ 応募必要項目: {result}", "info")
        rand_delay(0.3, 0.6)
    except Exception as e:
        progress(f"  ⚠️ 応募必要項目 失敗: {e}", "warn")

    # ---- 電話番号 ----
    # 環境変数 KYUJINBOX_PHONE が設定されていれば入力して必須化
    # 未設定の場合はチェックを外しWeb応募のみにする
    company_phone = os.environ.get("KYUJINBOX_PHONE", "").strip()
    if company_phone:
        progress(f"  📞 電話番号入力: {company_phone}", "info")
        try:
            # 「電話番号を入力必須にする」チェックボックスをONにする
            cb_result = page.evaluate("""() => {
                const cb = document.querySelector('input[name="isPhoneNumberRequired"]');
                if (!cb) return 'not found';
                if (cb.checked) return 'already checked';
                const label = cb.closest('label') || cb.nextElementSibling
                    || document.querySelector('label[for="' + cb.id + '"]');
                if (label) { label.click(); return 'label clicked'; }
                cb.scrollIntoView({block: 'center'});
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'checked').set;
                setter.call(cb, true);
                cb.dispatchEvent(new Event('change', {bubbles: true}));
                return 'setter forced';
            }""")
            progress(f"  📞 電話必須チェック: {cb_result}", "info")
            # Vueがチェックボックス状態を更新してphoneフィールドを表示するまで待つ
            rand_delay(0.8, 1.2)
        except Exception as e:
            progress(f"  ⚠️ 電話必須チェック失敗: {e}", "warn")
        # 電話番号を入力（Vueがフィールドを表示するまで最大5秒待つ）
        ok = fill_text(page, 'input[name="applicationPhoneNumber"]', company_phone, timeout=5000)
        if ok:
            progress(f"  ✅ 電話番号入力完了", "info")
        else:
            progress(f"  ⚠️ 電話番号フィールドが見つかりません", "warn")
        rand_delay(0.2, 0.4)
    else:
        progress(f"  📞 電話番号なし（Web応募のみ）", "info")
        try:
            page.evaluate("""() => {
                const cb = document.querySelector('input[name="isPhoneNumberRequired"]');
                if (!cb || !cb.checked) return;
                const label = cb.closest('label') || cb.nextElementSibling
                    || document.querySelector('label[for="' + cb.id + '"]');
                if (label) { label.click(); return; }
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'checked').set;
                setter.call(cb, false);
                cb.dispatchEvent(new Event('change', {bubbles: true}));
            }""")
            rand_delay(0.2, 0.3)
        except Exception:
            pass
        try:
            tel = page.query_selector('input[name="applicationPhoneNumber"]')
            if tel:
                tel_el = page.wait_for_selector('input[name="applicationPhoneNumber"]', timeout=3000)
                tel_el.fill('')
                tel_el.press('Tab')
        except Exception:
            pass

    # ---- 同意チェックボックス ----
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

    # ---- Vue リアクティブ状態の直接パッチ（最後の確実な手段）----
    pay_type, pay_min, pay_max = parse_salary(job.get('salary', ''))
    pay_type_val = {'時給': 1, '日給': 2, '月給': 3, '年収': 4, '固定報酬': 5}.get(pay_type, 3)
    company_phone = os.environ.get("KYUJINBOX_PHONE", "").strip()
    patch_vue_kyujin_state(
        page, job,
        job_type_val=selected_job_type_val,
        pay_type_val=pay_type_val,
        pay_min=pay_min,
        pay_max=pay_max,
        pref_id=pref_id,
        char_values=CHAR_VALUES,
        company_phone=company_phone,
    )
    rand_delay(1.0, 1.5)

    # ---- 必須フィールドの最終確認・再入力 ----
    # Vueのパッチ後にDOMの値が空になっていたら再入力する
    try:
        empty_fields = page.evaluate("""() => {
            const checks = [
                {sel: 'input[name="title"]', name: 'title'},
                {sel: 'textarea[name="description"]', name: 'description'},
                {sel: 'select[name="jobType"]', name: 'jobType'},
                {sel: 'select[name="prefVal"]', name: 'prefVal'},
                {sel: 'select[name="payType"]', name: 'payType'},
                {sel: 'input[name="payMin"]', name: 'payMin'},
            ];
            return checks.map(c => {
                const el = document.querySelector(c.sel);
                return {name: c.name, value: el ? el.value : null, found: !!el};
            });
        }""")
        for f in empty_fields:
            progress(f"  📊 {f['name']}: found={f['found']} value={repr((f['value'] or '')[:30])}", "info")
    except Exception as e:
        progress(f"  ⚠️ フィールド確認失敗: {e}", "warn")

    # title が空なら再入力
    try:
        title_val = page.evaluate("() => { const el = document.querySelector('input[name=\"title\"]'); return el ? el.value : ''; }")
        if not title_val or not title_val.strip():
            progress(f"  ⚠️ タイトルが空のため再入力", "warn")
            fill_text(page, 'input[name="title"]', job['title'])
            rand_delay(0.3, 0.5)
    except Exception:
        pass

    # description が空なら再入力
    try:
        desc_val = page.evaluate("() => { const el = document.querySelector('textarea[name=\"description\"]'); return el ? el.value : ''; }")
        if not desc_val or not desc_val.strip():
            progress(f"  ⚠️ 仕事内容が空のため再入力", "warn")
            fill_text(page, 'textarea[name="description"]', job.get('description', ''))
            rand_delay(0.3, 0.5)
    except Exception:
        pass

    rand_delay(0.5, 1.0)

    # ---- POSTインターセプター用の完全ペイロードを構築 ----
    # POST本文の各キーが空の場合に注入するため、DOM input名と同じキー名で用意する。
    emp_type = job.get('employmentType') or job.get('employment_type', '')
    emp_keywords = {
        '正社員': '正社員', 'アルバイト': 'アルバイト・パート', 'パート': 'アルバイト・パート',
        '契約社員': '契約社員', '業務委託': '業務委託', '派遣': '派遣社員',
    }
    emp_label = '正社員'
    for k, v in emp_keywords.items():
        if k in emp_type:
            emp_label = v
            break

    tags = job.get('tags', [])
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except Exception:
            tags = []
    quals_text = ' / '.join(str(t) for t in tags)[:LIMIT_QUALIFICATIONS] if tags else ''

    rewarding_p = (job.get('rewarding') or job.get('rewarding_text') or '').strip()[:LIMIT_REWARDING]
    worktime_p  = (job.get('worktimeHoliday') or job.get('worktime_holiday') or job.get('workTime') or '').strip()[:LIMIT_WORKTIME]
    transport_p = (job.get('transportation') or job.get('access') or '').strip()[:LIMIT_TRANSPORT]
    how_to_apply_p = (job.get('how_to_apply') or job.get('howToApply') or
                      "下記URLよりWebでご応募ください。書類選考後にご連絡いたします。").strip()

    full_payload = {
        'company':         company_name,
        'title':           job.get('title', ''),
        'jobType':         selected_job_type_val,
        'description':     job.get('description', ''),
        'rewarding':       rewarding_p,
        'qualifications':  quals_text,
        'prefVal':         pref_id,
        'address':         location,
        'transportation':  transport_p,
        'payType':         pay_type_val,
        'payMin':          pay_min or '',
        'payMax':          pay_max or '',
        'benefit':         job.get('salary', ''),
        'worktimeHoliday': worktime_p,
        'howToApply':      how_to_apply_p,
        'employTypes':     [emp_label],
        'characteristics': [int(v) for v in CHAR_VALUES],
    }
    if company_phone:
        full_payload['applicationPhoneNumber'] = company_phone
        full_payload['isPhoneNumberRequired'] = True

    return selected_job_type_val, company_phone, full_payload


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
    headless     = os.environ.get("HEADLESS", "1").strip() not in ("0", "false", "no")

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

    if not headless:
        progress("🖥️ 有頭モードで起動 (HEADLESS=0)", "info")

    # SSE接続維持のため12秒ごとにkeepAliveメッセージを送信
    keepalive_stop = start_keepalive(12)

    with sync_playwright() as p:
        progress("🌐 ブラウザを起動しています...", "info")
        browser = p.chromium.launch(
            headless=headless,
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
            rand_delay(0.3, 0.8)

            page.click('button[type="submit"], input[type="submit"], .login-btn, form button')
            rand_delay(0.8, 1.5)
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

            # 環境変数で設定済みならURL探索をスキップ（33秒節約）
            new_job_url_env = os.environ.get("KYUJINBOX_NEW_JOB_URL", "").strip()
            if new_job_url_env:
                post_url = new_job_url_env
                progress(f"🔗 求人投稿ページ（設定済み）: {post_url}", "info")
            else:
                post_url = find_post_url(page)
                if not post_url:
                    progress("❌ 新規求人URLが取得できませんでした。管理画面で求人作成URLを確認してください", "error")
                    browser.close()
                    sys.exit(1)
                progress(f"🔗 求人投稿ページ: {post_url}", "info")

            target_jobs = jobs[:batch]
            success_count = 0

            for i, job in enumerate(target_jobs):
                progress(f"📝 [{i+1}/{len(target_jobs)}] 「{job['title']}」を投稿中...", "info")
                rand_delay(0.5, 1.0)

                try:
                    page.goto(post_url, timeout=30000)
                    page.wait_for_load_state('networkidle', timeout=15000)
                    rand_delay(1.0, 2.0)

                    actual_url = page.url
                    progress(f"📍 投稿フォームURL: {actual_url}", "info")

                    # Vue.js SPA がフォームを描画し終わるまで待機
                    # networkidle 後も JS がマウント中の場合があるため visible input が
                    # 複数現れるまでポーリングする
                    progress("  ⏳ Vueフォームの描画を待機中...", "info")
                    try:
                        page.wait_for_function("""() => {
                            const vis = Array.from(document.querySelectorAll(
                                'input:not([type="hidden"]), textarea'
                            )).filter(el => {
                                const s = window.getComputedStyle(el);
                                return s.display !== 'none' && s.visibility !== 'hidden';
                            });
                            return vis.length >= 3;
                        }""", timeout=15000)
                        rand_delay(0.5, 1.0)
                        progress("  ✅ フォーム描画完了", "info")
                    except Exception as fe:
                        progress(f"  ⚠️ フォーム描画待機タイムアウト（続行）: {fe}", "warn")
                        rand_delay(1.0, 2.0)

                    # Vue描画後に全フィールドをダンプ（毎回）
                    dump_visible_inputs(page)
                    save_screenshot(page, f"post_form_{i}")

                    selected_job_type_val, job_company_phone, full_payload = fill_kyujinbox_form(page, job, company_name)
                    rand_delay(0.8, 1.8)

                    # select値をJS確認（name or id どちらでも）
                    try:
                        sel_vals = page.evaluate("""() => {
                            function findSel(names) {
                                for (const n of names) {
                                    const el = document.querySelector('select[name="'+n+'"]')
                                            || document.querySelector('select[id="'+n+'"]');
                                    if (el) return {found: n, value: el.value,
                                        text: el.options[el.selectedIndex]?.text || null};
                                }
                                return {found: null, value: 'NOT FOUND', text: null};
                            }
                            return [
                                findSel(['jobType','job_type']),
                                findSel(['prefVal','pref']),
                                findSel(['payType','pay_type']),
                            ];
                        }""")
                        for sv in sel_vals:
                            progress(f"  📊 select[{sv['found']}] value='{sv['value']}' text='{sv['text']}'", "info")
                    except Exception as ex:
                        progress(f"  select確認失敗: {ex}", "warn")

                    save_screenshot(page, f"before_submit_{i}")

                    # ---- POSTインターセプター設定 ----
                    intercept_val = selected_job_type_val or '1'
                    phone_clear = not bool(job_company_phone)
                    intercepted, unroute = setup_submit_interceptor(page, intercept_val, phone_clear=phone_clear, full_payload=full_payload)
                    progress(f"  🔧 POSTインターセプター設定 (jobType={intercept_val}, phone_clear={phone_clear}, payload={len(full_payload)}項目)", "info")

                    submitted = click_submit_button(page)

                    # インターセプター解除
                    unroute()

                    if not submitted:
                        progress(f"⚠️ 「{job['title']}」: 送信ボタンが見つかりませんでした", "warn")
                        save_screenshot(page, f"no_submit_{i}")
                        continue

                    progress(f"  📊 POST修正回数: {intercepted['count']}", "info")

                    rand_delay(3.0, 6.0)
                    page.wait_for_load_state('networkidle', timeout=15000)

                    final_url = page.url
                    progress(f"📍 送信後URL: {final_url}", "info")
                    save_screenshot(page, f"after_submit_{i}")

                    url_changed = final_url != actual_url
                    # kyujinbox のジョブIDは 5922-7577-XXXX 形式（英数字ハイフン）
                    # /new → /edit/5922-7577-XXXX へのリダイレクトを成功と判定
                    was_new = '/jobs/new' in actual_url or '/jobs/edit' in actual_url
                    went_edit = '/jobs/edit/' in final_url
                    has_job_id = bool(re.search(r'/jobs/edit/[\w-]+', final_url))
                    # 一時保存も成功: /draft/ や /jobs/ トップへの遷移
                    went_draft = '/draft' in final_url or (url_changed and '/jobs' in final_url and 'login' not in final_url)

                    if went_edit or has_job_id or went_draft:
                        label = "一時保存" if not went_edit else "投稿"
                        progress(f"✅ 「{job['title']}」を{label}しました (URL: {final_url})", "success")
                        success_count += 1
                    elif url_changed and 'login' not in final_url and '/new' not in final_url:
                        # URL変化あり・ログインでもなく新規ページでもない
                        progress(f"✅ 「{job['title']}」を投稿しました (URL: {final_url})", "success")
                        success_count += 1
                    else:
                        # URL変化なし or /new のまま → バリデーションエラー
                        try:
                            # Vue のエラーメッセージは専用クラスに入っていることが多い
                            err_els = page.query_selector_all(
                                '.c-form--error, .error-message, [class*="error"], '
                                '[class*="Error"], .is-error, .form__error, .alert'
                            )
                            vue_errors = [e.inner_text().strip() for e in err_els
                                          if e.inner_text().strip() and len(e.inner_text().strip()) < 60]
                            if vue_errors:
                                progress(f"   ❌ Vueバリデーションエラー:", "warn")
                                for ve in vue_errors[:15]:
                                    progress(f"      {ve}", "warn")
                            else:
                                # テキスト全文からエラーを探す（ヒントテキストを除外）
                                body_text = page.inner_text('body')
                                # 「数字とハイフン」などのヒント文言は除外
                                HINT_TEXTS = ['数字とハイフンのみ', '例）', '※', 'お控えください',
                                              '記入します', 'アップロード', '設定が可能']
                                error_kw = ['必須', '選択してください', '職種区分を選択',
                                            '雇用形態を選択', '都道府県を選択', '入力してください']
                                lines = body_text.split('\n')
                                err_lines = [l.strip() for l in lines
                                             if l.strip()
                                             and any(kw in l for kw in error_kw)
                                             and not any(h in l for h in HINT_TEXTS)
                                             and len(l.strip()) < 40]
                                if err_lines:
                                    progress(f"   ❌ フォームエラー文言:", "warn")
                                    for el in err_lines[:10]:
                                        progress(f"      {el[:80]}", "warn")
                                else:
                                    progress(f"   ⚠️ 送信後もフォームページ（エラー文言不明）", "warn")
                        except Exception as ex:
                            progress(f"   ⚠️ 送信後フォームページ（本文取得失敗: {ex}）", "warn")

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
        keepalive_stop.set()
        progress(f"✅ {success_count}/{len(target_jobs)}件の投稿処理が完了しました", "success")

if __name__ == "__main__":
    main()
