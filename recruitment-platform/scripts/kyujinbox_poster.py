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


def patch_vue_kyujin_state(page, job, job_type_val, pay_type_val, pay_min, pay_max, pref_id, char_values):
    """
    kyujin hidden フィールドの親Vueコンポーネントを見つけて
    リアクティブ状態を直接パッチする。
    DOM操作と組み合わせることで投稿成功率を大幅向上させる。
    """
    emp_type = job.get('employmentType') or job.get('employment_type', '')
    emp_keywords = {
        '正社員': '正社員', 'アルバイト': 'アルバイト・パート', 'パート': 'アルバイト・パート',
        '契約社員': '契約社員', '業務委託': '業務委託', '派遣': '派遣社員',
    }
    emp_label = '業務委託'  # デフォルト
    for k, v in emp_keywords.items():
        if k in emp_type:
            emp_label = v
            break

    desc      = job.get('description', '')
    rewarding = job.get('rewarding', desc[:100] if desc else '')
    quals     = job.get('qualifications', '')
    transport = job.get('transportation', job.get('access', ''))
    worktime  = job.get('worktimeHoliday', job.get('workTime', ''))
    benefit   = job.get('salary', '')
    title     = job.get('title', '')
    location  = job.get('location', '')

    patch_data = {
        'title': title,
        'description': desc,
        'rewarding': rewarding,
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
        'isPhoneNumberRequired': False,
        'applicationPhoneNumber': '',
        'workLocations': [{'prefectureId': pref_id, 'location': location}],
    }

    try:
        result = page.evaluate("""(patch) => {
            const msgs = [];

            // kyujin hidden input の親をたどってVueインスタンスを探す
            function findVueVm(startEl) {
                let el = startEl;
                for (let i = 0; i < 80; i++) {
                    if (!el) break;
                    // Vue2
                    if (el.__vue__) {
                        let vm = el.__vue__;
                        // $parent をたどって kyujin プロパティを持つ最上位を探す
                        while (vm.$parent) {
                            if ('kyujin' in (vm.$parent.$data || {})) vm = vm.$parent;
                            else break;
                        }
                        if ('kyujin' in (vm.$data || {})) return {type:'v2', vm};
                    }
                    // Vue3
                    if (el.__vueParentComponent) {
                        let comp = el.__vueParentComponent;
                        for (let j = 0; j < 30; j++) {
                            const s = comp.setupState || comp.ctx || {};
                            if (s.kyujin !== undefined) return {type:'v3', comp, state: s};
                            if (comp.parent) comp = comp.parent;
                            else break;
                        }
                    }
                    el = el.parentElement;
                }
                return null;
            }

            const kyujinInput = document.querySelector('input[name="kyujin"]');
            if (!kyujinInput) { msgs.push('kyujin hidden field not found'); return msgs.join('; '); }

            const found = findVueVm(kyujinInput);
            if (!found) { msgs.push('vue vm not found'); return msgs.join('; '); }

            const kyujinData = found.type === 'v2'
                ? found.vm.$data.kyujin
                : found.state.kyujin;

            if (!kyujinData) { msgs.push('kyujin data null'); return msgs.join('; '); }

            // パッチ適用
            for (const [k, v] of Object.entries(patch)) {
                try {
                    if (v === null || v === undefined) continue;
                    if (k === 'workLocations') {
                        if (Array.isArray(kyujinData.workLocations) && kyujinData.workLocations.length > 0) {
                            const wl = kyujinData.workLocations[0];
                            if (wl) {
                                if (v[0].prefectureId !== null) wl.prefectureId = v[0].prefectureId;
                                if (v[0].location)              wl.location      = v[0].location;
                                msgs.push('workLocations patched');
                            }
                        }
                        continue;
                    }
                    const before = JSON.stringify(kyujinData[k]);
                    if (found.type === 'v2') {
                        found.vm.$set(kyujinData, k, v);
                    } else {
                        kyujinData[k] = v;
                    }
                    const after = JSON.stringify(kyujinData[k]);
                    if (before !== after) msgs.push(k + '=' + after.slice(0, 40));
                } catch(e) {
                    msgs.push(k + ' ERR:' + e.message.slice(0, 30));
                }
            }

            return msgs.join('; ') || 'no changes';
        }""", patch_data)
        progress(f"  🔧 Vue kyujinパッチ: {result}", "info")
        rand_delay(0.5, 1.0)
        return True
    except Exception as e:
        progress(f"  ⚠️ Vue kyujinパッチ失敗: {e}", "warn")
        return False


def fill_kyujinbox_form(page, job, company_name):
    """
    求人ボックスの求人フォームを埋める。
    戻り値: 選択したjobTypeの value 文字列（インターセプター用）
    """
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
        title_el.click()
        rand_delay(0.3, 0.6)
        title_el.fill(job['title'])
        rand_delay(0.5, 1.0)
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

    # ---- Vue リアクティブ状態の直接パッチ（最後の確実な手段）----
    # DOM操作後にVueのリアクティブデータを直接更新して投稿データを保証する
    pay_type, pay_min, pay_max = parse_salary(job.get('salary', ''))
    pay_type_val = {'時給': 1, '日給': 2, '月給': 3, '年収': 4, '固定報酬': 5}.get(pay_type, 3)
    patch_vue_kyujin_state(
        page, job,
        job_type_val=selected_job_type_val,
        pay_type_val=pay_type_val,
        pay_min=pay_min,
        pay_max=pay_max,
        pref_id=pref_id,
        char_values=CHAR_VALUES,
    )
    rand_delay(0.5, 1.0)

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
            if not post_url:
                progress("❌ 新規求人URLが取得できませんでした。管理画面で求人作成URLを確認してください", "error")
                browser.close()
                sys.exit(1)
            progress(f"🔗 求人投稿ページ: {post_url}", "info")

            target_jobs = jobs[:batch]
            success_count = 0

            for i, job in enumerate(target_jobs):
                progress(f"📝 [{i+1}/{len(target_jobs)}] 「{job['title']}」を投稿中...", "info")
                rand_delay(1.5, 3.0)

                try:
                    page.goto(post_url, timeout=30000)
                    page.wait_for_load_state('networkidle', timeout=15000)
                    rand_delay(2.0, 4.0)

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
                        }""", timeout=30000)
                        rand_delay(1.0, 2.0)
                        progress("  ✅ フォーム描画完了", "info")
                    except Exception as fe:
                        progress(f"  ⚠️ フォーム描画待機タイムアウト（続行）: {fe}", "warn")
                        rand_delay(3.0, 5.0)

                    # Vue描画後に全フィールドをダンプ（毎回）
                    dump_visible_inputs(page)
                    save_screenshot(page, f"post_form_{i}")

                    selected_job_type_val = fill_kyujinbox_form(page, job, company_name)
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
