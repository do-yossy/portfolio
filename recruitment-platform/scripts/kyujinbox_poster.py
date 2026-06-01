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
        if label:
            try:
                el.select_option(label=label)
                rand_delay(0.2, 0.5)
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
                        progress(f"    select 部分一致: '{txt}' (value={val})", "info")
                        rand_delay(0.2, 0.5)
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
            rand_delay(0.2, 0.5)
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


def setup_submit_interceptor(page, job_type_val, phone_clear=True):
    """
    フォーム送信POSTをインターセプトしてjobType・電話番号を強制修正する。
    Vue.jsのreactive状態が未更新でも確実に正しい値をサーバーに送信できる。
    JSON・form-encoded 両方に対応。
    """
    intercepted = {'count': 0}

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

        try:
            if 'application/json' in ct:
                data = json.loads(body)
                modified = []

                cur_jt = str(data.get('jobType', '')).strip()
                if cur_jt in ('', 'null', '0', 'None', 'undefined'):
                    data['jobType'] = job_type_val
                    modified.append(f"jobType={job_type_val}")

                if phone_clear:
                    if data.get('applicationPhoneNumber'):
                        data['applicationPhoneNumber'] = ''
                        modified.append('phone cleared')
                    if data.get('isPhoneNumberRequired'):
                        data['isPhoneNumberRequired'] = False
                        modified.append('phoneRequired=false')

                if modified:
                    intercepted['count'] += 1
                    new_body = json.dumps(data, ensure_ascii=False)
                    progress(f"  🔧 POST修正(JSON) [{req.url.split('?')[0][-60:]}]: {', '.join(modified)}", "info")
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

    page.route('**', handle)
    return intercepted, lambda: _safe_unroute(page, handle)


def _safe_unroute(page, handler):
    try:
        page.unroute('**', handler)
    except Exception:
        pass


def find_post_url(page, group_id=None):
    """
    求人新規作成URLを特定する。
    saiyo.kyujinbox.com のURL構造:
      https://saiyo.kyujinbox.com/company/groups/G????-????-???/jobs/new
    """
    current_url = page.url

    # ① 環境変数 KYUJINBOX_GROUP_ID を最優先
    if not group_id:
        group_id = os.environ.get("KYUJINBOX_GROUP_ID", "").strip()

    if group_id:
        url = f"https://saiyo.kyujinbox.com/company/groups/{group_id}/jobs/new"
        progress(f"  📎 新規求人URL(env): {url}", "info")
        return url

    # ② 現在のページURLからグループIDを抽出
    m = re.search(r'/company/groups/(G[\w-]+)', current_url)
    if m:
        gid = m.group(1)
        url = f"https://saiyo.kyujinbox.com/company/groups/{gid}/jobs/new"
        progress(f"  📎 新規求人URL(url抽出): {url}", "info")
        return url

    # ③ ページ内リンクからグループIDを抽出
    try:
        links = page.query_selector_all('a[href]')
        for link in links:
            href = link.get_attribute('href') or ''
            m = re.search(r'/company/groups/(G[\w-]+)', href)
            if m:
                gid = m.group(1)
                url = f"https://saiyo.kyujinbox.com/company/groups/{gid}/jobs/new"
                progress(f"  📎 新規求人URL(リンク抽出): {url}", "info")
                return url
            # 旧来のリンクテキスト検索
            text = (link.inner_text() or '').strip()
            if any(kw in text for kw in ['新規', '求人を作成', '求人を出す', '掲載申込']):
                if href.startswith('http'):
                    return href
                elif href.startswith('/'):
                    return f"https://saiyo.kyujinbox.com{href}"
    except Exception:
        pass

    progress("  ⚠️ グループIDが特定できません。KYUJINBOX_GROUP_ID を .env に設定してください", "warn")
    return "https://saiyo.kyujinbox.com/company/jobs/new"


def fill_kyujinbox_form(page, job, company_name):
    """
    求人ボックスの求人フォームを埋める。
    戻り値: 選択したjobTypeの value 文字列（インターセプター用）
    """
    # 会社名
    fill_text(page, 'input[name="company"]', company_name, timeout=5000)
    rand_delay(0.3, 0.7)

    # タイトル（必須）
    human_type(page, 'input[name="title"]', job['title'])
    rand_delay(0.5, 1.0)

    # 仕事内容（必須）
    fill_text(page, 'textarea[name="description"]', job.get('description', ''))
    rand_delay(0.5, 1.0)

    # キャッチコピー (input[name="catch"] 等)
    catchcopy = job.get('catchcopy', '')
    if catchcopy:
        for sel in ['input[name="catch"]', 'input[name="catchCopy"]', 'input[name="catchcopy"]',
                    'input[placeholder*="キャッチ"]', 'input[placeholder*="コピー"]']:
            if fill_text(page, sel, catchcopy, timeout=3000):
                progress(f"  ✅ catchcopy 入力: {catchcopy[:30]}", "info")
                break
        rand_delay(0.2, 0.5)

    # ---- 職種 (select[name="jobType"]) ----
    # 必須。空のままだと「公開する」ボタンが is-disab になる。
    # Vue reactiveの更新に依存しないよう、選択した value をインターセプターに渡す。
    selected_job_type_val = None
    # DB は snake_case で返すため両方チェック
    job_type = job.get('jobType') or job.get('job_type', '')
    try:
        jt_el = page.wait_for_selector('select[name="jobType"]', timeout=5000)
        opts = jt_el.query_selector_all('option')
        option_list = [(opt.get_attribute('value') or '', (opt.inner_text() or '').strip()) for opt in opts]
        progress(f"  📋 jobType オプション({len(option_list)}件): {[t for v,t in option_list[:6]]}", "info")

        chosen_val = None
        chosen_txt = None

        # ① ラベル一致で選択
        if job_type:
            for v, t in option_list:
                if v and (job_type in t or t in job_type):
                    chosen_val = v
                    chosen_txt = t
                    break

        # ② フォールバック: 最初の有効なオプション
        if not chosen_val:
            for v, t in option_list:
                if v:
                    chosen_val = v
                    chosen_txt = t
                    break

        if chosen_val:
            # Locator API で select_option（イベント発火がより確実）
            try:
                page.locator('select[name="jobType"]').select_option(value=chosen_val)
                rand_delay(0.3, 0.6)
                progress(f"  ✅ jobType 選択: '{chosen_txt}' (value={chosen_val})", "info")
            except Exception:
                jt_el.select_option(value=chosen_val)
                rand_delay(0.3, 0.6)
                progress(f"  ✅ jobType 選択(fallback): '{chosen_txt}' (value={chosen_val})", "info")

            # Vue reactive state を可能な限り更新
            try:
                result = page.evaluate(f"""(targetVal) => {{
                    const sel = document.querySelector('select[name="jobType"]');
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
    if pref:
        ok = select_option_safe(page, 'select[name="prefVal"]', label=pref, debug=True)
        if not ok:
            progress(f"  ⚠️ 都道府県 '{pref}' の選択失敗", "warn")
        rand_delay(0.3, 0.7)

    # ---- 住所テキスト (input[name="address"]) ----
    fill_text(page, 'input[name="address"]', location)
    rand_delay(0.3, 0.7)

    # ---- 給与 ----
    salary_str = job.get('salary', '')
    pay_type, pay_min, pay_max = parse_salary(salary_str)
    progress(f"  💰 給与解析: タイプ={pay_type}, 最小={pay_min}, 最大={pay_max}", "info")

    select_option_safe(page, 'select[name="payType"]', label=pay_type, debug=True)
    rand_delay(0.2, 0.5)

    if pay_min:
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
    fill_text(page, 'textarea[name="benefit"]', salary_str)
    rand_delay(0.3, 0.6)

    # 仕事のやりがい (rewarding) - あれば入力
    rewarding = job.get('rewarding', job.get('description', ''))
    if rewarding:
        fill_text(page, 'textarea[name="rewarding"]', rewarding)
        rand_delay(0.3, 0.6)

    # 労働時間・休日 (worktimeHoliday)
    worktime = job.get('worktimeHoliday', job.get('workTime', ''))
    if worktime:
        fill_text(page, 'textarea[name="worktimeHoliday"]', worktime)
        rand_delay(0.3, 0.6)

    # アクセス (transportation)
    transport = job.get('transportation', job.get('access', ''))
    if transport:
        fill_text(page, 'textarea[name="transportation"]', transport)
        rand_delay(0.3, 0.6)

    # 応募資格
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

    # ---- 電話番号 ----
    # DOM操作でクリアする（インターセプターでもバックアップ対応）
    try:
        phone_req_cb = page.query_selector('input[name="isPhoneNumberRequired"]')
        if phone_req_cb and phone_req_cb.is_checked():
            # ラベルクリックで Vue reactive に反映させる
            page.evaluate("""() => {
                const cb = document.querySelector('input[name="isPhoneNumberRequired"]');
                if (!cb) return;
                const label = cb.closest('label') || cb.nextElementSibling
                    || document.querySelector('label[for="' + cb.id + '"]');
                if (label) { label.click(); return; }
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'checked').set;
                setter.call(cb, false);
                cb.dispatchEvent(new Event('change', {bubbles: true}));
            }""")
            rand_delay(0.2, 0.4)
    except Exception:
        pass

    try:
        result = page.evaluate("""() => {
            const tel = document.querySelector('input[name="applicationPhoneNumber"]');
            if (!tel) return 'not found';
            const before = tel.value;
            // native setter で強制クリア
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(tel, '');
            ['input','change'].forEach(t =>
                tel.dispatchEvent(new Event(t, {bubbles: true}))
            );
            return 'cleared from: ' + before;
        }""")
        if 'cleared' in result:
            progress(f"  🔧 電話番号クリア: {result}", "info")
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

    return selected_job_type_val


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
                    if i == 0:
                        dump_inputs(page)
                    save_screenshot(page, f"post_form_{i}")

                    selected_job_type_val = fill_kyujinbox_form(page, job, company_name)
                    rand_delay(0.8, 1.8)

                    # select値をJS確認
                    try:
                        sel_vals = page.evaluate("""() => {
                            return ['jobType','prefVal','payType'].map(name => {
                                const el = document.querySelector('select[name="'+name+'"]');
                                if (!el) return {name, value: 'NOT FOUND', text: null};
                                const opt = el.options[el.selectedIndex];
                                return {name, value: el.value, text: opt ? opt.text : null};
                            });
                        }""")
                        for sv in sel_vals:
                            progress(f"  📊 select[{sv['name']}] value='{sv['value']}' text='{sv['text']}'", "info")
                    except Exception as ex:
                        progress(f"  select確認失敗: {ex}", "warn")

                    save_screenshot(page, f"before_submit_{i}")

                    # ---- POSTインターセプター設定 ----
                    # Vue reactive が未更新でも jobType・電話番号を強制修正
                    intercept_val = selected_job_type_val or '1'
                    intercepted, unroute = setup_submit_interceptor(page, intercept_val, phone_clear=True)
                    progress(f"  🔧 POSTインターセプター設定 (jobType={intercept_val})", "info")

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
                    was_new = '/jobs/new' in actual_url
                    went_edit = '/jobs/edit/' in final_url
                    has_job_id = bool(re.search(r'/jobs/edit/[\w-]+', final_url))

                    if (was_new and went_edit) or (url_changed and has_job_id):
                        # 新規作成→編集ページへ遷移: 成功
                        progress(f"✅ 「{job['title']}」を投稿しました (URL: {final_url})", "success")
                        success_count += 1
                    elif url_changed and 'login' not in final_url and '/new' not in final_url:
                        # URL変化あり・ログインでもなく新規ページでもない
                        progress(f"✅ 「{job['title']}」を投稿しました (URL: {final_url})", "success")
                        success_count += 1
                    else:
                        # URL変化なし or /new のまま → バリデーションエラー
                        try:
                            body_text = page.inner_text('body')
                            error_kw = ['必須', 'エラー', '入力してください', '選択してください',
                                        '不正', '無効', 'ご確認ください', '正しく入力', '半角数字']
                            lines = body_text.split('\n')
                            err_lines = [l.strip() for l in lines
                                         if l.strip() and any(kw in l for kw in error_kw)]
                            if err_lines:
                                progress(f"   ❌ ページ上のエラー文言:", "warn")
                                for el in err_lines[:15]:
                                    progress(f"      {el[:120]}", "warn")
                            else:
                                progress(f"   ⚠️ 送信後もフォームページ（エラー文言不明）", "warn")
                                progress(f"   ページ冒頭テキスト(500字): {body_text[:500]}", "warn")
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
        progress(f"✅ {success_count}/{len(target_jobs)}件の投稿処理が完了しました", "success")

if __name__ == "__main__":
    main()
