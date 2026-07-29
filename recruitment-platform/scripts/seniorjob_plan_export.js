'use strict';
// シニアジョブ 求人プラン展開（営業/企画/送迎/配送 × 大阪）
//
// 職種ごとに「実在の掲載済み求人」を雛形(153列)として複製し、
// 大阪の各区市へ 勤務地・求人タイトル・簡易職種名・仕事内容・写真 を差別化して展開する。
//   - 送迎/配送 : 既存の ref_job.json（ロケ同行ドライバー）を雛形に流用
//   - 営業/企画 : seniorjob/templates/営業.json ・ 企画.json（後から作成／無ければ自動スキップ）
//
// 掲載順位(新着順)維持のため、平日に分けて週1巡で更新する運用を想定。
// plan.csv の「更新グループ」A(月)〜E(金)。--group A で当日分だけ出力する。
//
// 使い方:
//   node scripts/seniorjob_plan_export.js --group A     # 当日分(グループA)をCSV出力
//   node scripts/seniorjob_plan_export.js --all         # 全件まとめて出力
//   node scripts/seniorjob_plan_export.js --jobtype 送迎 # 職種を絞って出力
//   node scripts/seniorjob_plan_export.js --status      # 割付・雛形の有無を表示
//
// 出力: scripts/out/seniorjob-plan-sq-YYYYMMDD-<GROUP>.csv （Shift-JIS・シニアジョブ取込形式）

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'seniorjob');
const OUT_DIR = path.join(__dirname, 'out');
const SJIS = require(path.join(DIR, 'sjis_table.json'));
const STATIONS = require(path.join(DIR, 'stations.json')).filter(s => s.pref === '大阪府');
const PLAN_CSV = path.join(DIR, 'plan.csv');
const CONTENTS = path.join(DIR, 'contents');
const TEMPLATES = path.join(DIR, 'templates');
const REF_DRIVER = path.join(DIR, 'ref_job.json'); // 送迎/配送 共通雛形（ロケ同行ドライバー）
const PHOTOS_FILE = path.join(DIR, 'photos.json');

// ── 引数 ──
const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

// ── UTF-8 → Shift-JIS(CP932) ──
function toSjis(str) {
  const bytes = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) { bytes.push(cp); continue; }
    const hex = SJIS[cp];
    if (hex) { for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16)); }
    else bytes.push(0x3f); // '?'
  }
  return Buffer.from(bytes);
}

// ── 職種系 → 雛形ファイル ──
// 職種専用の雛形(templates/<職種>.json)があれば優先。無い場合、送迎/配送は
// 既存のロケ同行ドライバー雛形(ref_job.json)へフォールバックする。
function templatePath(kei) {
  const specific = path.join(TEMPLATES, `${kei}.json`);
  if (fs.existsSync(specific)) return specific;
  if (kei === '送迎' || kei === '配送') return REF_DRIVER;
  return specific; // 営業/企画で未作成の場合はこのパス（存在せず→自動スキップ）
}
const _refCache = {};
function loadRef(kei) {
  if (kei in _refCache) return _refCache[kei];
  const p = templatePath(kei);
  let ref = null;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j && Array.isArray(j.headers) && Array.isArray(j.ref)) ref = j;
  } catch { /* 未作成 */ }
  _refCache[kei] = ref;
  return ref;
}

// ── 職種詳細 → 仕事内容テンプレ(stem) / 簡易職種名 ──
// 仕事内容は <stem>.txt を基本に、<stem>-2.txt 等があれば週次サイクル(CYCLE)でローテ（新着更新用）。
const CONTENT_MAP = {
  'ルート営業': '営業-ルート', '反響営業': '営業-反響', 'カウンター営業': '営業-カウンター',
  '企画営業・販促企画': '企画', '提案営業(企画)': '企画', '企画営業': '企画',
  '送迎ドライバー': '送迎', 'ルート配送': '配送',
  // ── 追加22職種（顧客折衝×運転・シニア向け） ──
  '法人ルート営業': '営業-法人ルート', 'ITルート営業': '営業-IT', '既存顧客フォロー営業': '営業-フォロー',
  '事務用品ルート提案': '提案-事務用品', 'リース・レンタル営業': '営業-リース',
  '設置点検・相談訪問': '訪問-点検相談', '定期メンテ・提案訪問': '訪問-メンテ提案',
  'カスタマーフォロー訪問': '訪問-カスタマーフォロー', '導入サポート訪問': '訪問-導入サポート',
  'アフターサービス巡回': '訪問-アフター', 'レンタル納品・提案': '提案-レンタル納品',
  '用具レンタル訪問提案': '提案-用具レンタル', '業務用品ラウンダー': '提案-ラウンダー',
  'リユース回収・提案': '提案-リユース回収', '訪問機器取替': '訪問-機器取替',
  '買替ラウンダー': '提案-買替ラウンダー', '集金・請求フォロー': '提案-集金フォロー',
  'ルート配送ご用聞き': '配送-ご用聞き', '補充・提案': '提案-補充',
  '催事イベント運営': '送迎-催事', '送迎・案内': '送迎-案内',
};
const KANNI_MAP = {
  'ルート配送': 'ルート配送ドライバー', '企画営業・販促企画': '企画営業', '提案営業(企画)': '提案営業',
  '法人ルート営業': '法人ルート営業', 'ITルート営業': 'ITルート営業', '既存顧客フォロー営業': 'フォロー営業',
  '事務用品ルート提案': 'ルート提案スタッフ', 'リース・レンタル営業': 'リース・レンタル営業',
  '設置点検・相談訪問': '点検・相談スタッフ', '定期メンテ・提案訪問': 'メンテ・提案スタッフ',
  'カスタマーフォロー訪問': 'カスタマーフォロー', '導入サポート訪問': '導入サポートスタッフ',
  'アフターサービス巡回': 'アフターサービス巡回', 'レンタル納品・提案': 'レンタル納品・提案',
  '用具レンタル訪問提案': '訪問提案アドバイザー', '業務用品ラウンダー': 'ラウンダー',
  'リユース回収・提案': 'リユース回収スタッフ', '訪問機器取替': '訪問取替スタッフ',
  '買替ラウンダー': '買替ラウンダー', '集金・請求フォロー': '集金・請求フォロー',
  'ルート配送ご用聞き': 'ルート配送(ご用聞き)', '補充・提案': '補充・提案スタッフ',
  '催事イベント運営': '催事・イベントスタッフ', '送迎・案内': '送迎・案内スタッフ',
};
const kanniName = d => KANNI_MAP[d] || d;
// 職種(153列の「(必須)職種」)を職種詳細ごとに細分化。営業系/企画系の中で内容に合わせて分ける。
// ※シニアジョブの職種一覧の正式名称に合わせる必要があるため、初回取込で弾かれた場合は要調整。
const CATEGORY_MAP = {
  'ルート営業': '営業\nラウンダー\n訪問・巡回・調査スタッフ',
  '反響営業': '営業\nカスタマーサポート\nコールセンター',
  'カウンター営業': '営業\nカスタマーサポート',
  '企画営業・販促企画': '販売促進・営業企画\n広告宣伝\nWebマーケティング・デジタルマーケティング',
  '提案営業(企画)': '販売促進・営業企画\n営業\n事業企画・事業統括',
  '企画営業': '販売促進・営業企画\n商品企画・商品開発\nWebマーケティング・デジタルマーケティング',
  // ── 追加22職種（既知の安全カテゴリで構成。初回取込で弾かれたら要調整） ──
  '法人ルート営業': '営業\nラウンダー\n訪問・巡回・調査スタッフ',
  'ITルート営業': '営業\nラウンダー\n訪問・巡回・調査スタッフ',
  '既存顧客フォロー営業': 'カスタマーサポート\n営業\n訪問・巡回・調査スタッフ',
  '事務用品ルート提案': 'ラウンダー\n営業\n訪問・巡回・調査スタッフ',
  'リース・レンタル営業': '営業\nラウンダー\n訪問・巡回・調査スタッフ',
  '設置点検・相談訪問': '訪問・巡回・調査スタッフ\nカスタマーサポート\n営業',
  '定期メンテ・提案訪問': '訪問・巡回・調査スタッフ\n営業\nラウンダー',
  'カスタマーフォロー訪問': 'カスタマーサポート\n営業\n訪問・巡回・調査スタッフ',
  '導入サポート訪問': 'カスタマーサポート\n訪問・巡回・調査スタッフ\n営業',
  'アフターサービス巡回': '訪問・巡回・調査スタッフ\nカスタマーサポート\nラウンダー',
  'レンタル納品・提案': 'ラウンダー\n営業\n訪問・巡回・調査スタッフ',
  '用具レンタル訪問提案': '営業\n訪問・巡回・調査スタッフ\nカスタマーサポート',
  '業務用品ラウンダー': 'ラウンダー\n営業\n訪問・巡回・調査スタッフ',
  'リユース回収・提案': 'ラウンダー\n営業\n訪問・巡回・調査スタッフ',
  '訪問機器取替': '営業\n訪問・巡回・調査スタッフ\nラウンダー',
  '買替ラウンダー': 'ラウンダー\n営業\n訪問・巡回・調査スタッフ',
  '集金・請求フォロー': 'ラウンダー\n営業\nカスタマーサポート',
  '補充・提案': 'ラウンダー\n営業\n訪問・巡回・調査スタッフ',
};
// 「そのまま」職種：雛形(ref_job=ロケ同行ドライバー)の内容をそのまま使い、勤務地だけ差し替える。
const AS_IS = new Set(['送迎']);
function contentVariants(stem) {
  const re = new RegExp('^' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(-\\d+)?\\.txt$');
  try { return fs.readdirSync(CONTENTS).filter(f => re.test(f)).sort(); } catch { return []; }
}
function contentText(detail, area, eki, cycle) {
  const stem = CONTENT_MAP[detail];
  if (!stem) return null;
  const vs = contentVariants(stem);
  if (!vs.length) return null;
  const f = vs[(cycle || 0) % vs.length];
  try {
    return fs.readFileSync(path.join(CONTENTS, f), 'utf8')
      .replace(/\r\n/g, '\n').replace(/\s+$/, '')
      .split('{area}').join(area).split('{eki}').join(eki);
  } catch { return null; }
}

// ── 写真プール（任意） ──
let PHOTOS = {};
try { PHOTOS = JSON.parse(fs.readFileSync(PHOTOS_FILE, 'utf8')) || {}; } catch { PHOTOS = {}; }

// ── 更新モード：求人ID（plan_ids.json）＋ 内容ローテのサイクル状態 ──
const IDS_FILE = path.join(DIR, 'plan_ids.json');
let PLAN_IDS = {};
try { PLAN_IDS = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) || {}; } catch { PLAN_IDS = {}; }
const CYCLE_FILE = path.join(OUT_DIR, 'seniorjob_plan_cycle.json');
function readCycle() { try { return parseInt(JSON.parse(fs.readFileSync(CYCLE_FILE, 'utf8')).cycle, 10) || 0; } catch { return 0; } }
function writeCycle(n) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(CYCLE_FILE, JSON.stringify({ cycle: n })); }
const UPDATE = has('--update');
const CYCLE = (val('--cycle', null) != null) ? (parseInt(val('--cycle', '0'), 10) || 0) : readCycle();

// ── plan.csv 読み込み（簡易CSVパーサ：ダブルクオート対応） ──
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c === '\r') { /* skip */ }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const planRows = (() => {
  const raw = parseCsv(fs.readFileSync(PLAN_CSV, 'utf8')).filter(r => r.length >= 5 && r[0] && r[0] !== 'No');
  // 列: No, 更新グループ, 区/市, 職種系, 職種詳細, タイトル案, 集め方
  return raw.map(r => ({ no: r[0], group: (r[1] || '').charAt(0), area: r[2], kei: r[3], detail: r[4], title: r[5] || '' }));
})();

// ── 区市 → 駅（実住所・駅コード） ──
const byCity = {};
for (const s of STATIONS) (byCity[s.city] = byCity[s.city] || []).push(s);
function findStation(area, used) {
  const cands = byCity[area] || byCity[area.replace(/^大阪市|^堺市/, '')]
    || STATIONS.filter(s => s.city.includes(area) || area.includes(s.city));
  if (!cands || !cands.length) return null;
  return cands.find(s => !used.has(s.station)) || cands[0];
}
function wardForm(city) {
  const m = city.match(/^(?:大阪市|神戸市|堺市|京都市)(.+区)$/);
  return m ? m[1] : city;
}

// ── CSV 1行を組み立て ──
const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
function buildRow(ref, p, st, photoIdx) {
  const H = ref.headers; const idx = n => H.indexOf(n);
  const row = ref.ref.slice();
  const set = (name, v) => { const i = idx(name); if (i >= 0) row[i] = v; };
  set('求人ID', UPDATE ? String(PLAN_IDS[String(p.no)] || '') : ''); // 更新時は求人IDを付与（空=新規）
  // 勤務地1
  set('(必須)勤務地1分類', '市区町村');
  set('勤務地1郵便番号', st.postal || '');
  set('勤務地1都道府県', st.pref || '');
  set('勤務地1市区町村', wardForm(st.city || ''));
  set('勤務地1詳細住所', st.address || '');
  const ekiName = st.nearest ? st.nearest.replace(/\s*徒歩.*$/, '') : (st.station + '駅');
  set('勤務地1最寄駅', st.code ? `${ekiName}(コード:${st.code}) 徒歩5分` : '');
  // 差別化（送迎=ロケ同行はタイトル/職種/仕事内容をそのまま使い、勤務地のみ差し替え）
  const asIs = AS_IS.has(p.kei);
  if (!asIs) {
    if (p.title) set('(必須)求人タイトル', p.title);
    set('(必須)簡易職種名', kanniName(p.detail));
    if (CATEGORY_MAP[p.detail]) set('(必須)職種', CATEGORY_MAP[p.detail]); // 営業系/企画系を内容に合わせ細分化
    const body = contentText(p.detail, p.area, ekiName, CYCLE);
    if (body) set('(必須)仕事内容', body);
  }
  // 写真プール（任意・区＋サイクルでローテ）。職種詳細ごとの割当を優先し、無ければ職種系。
  const pool = (Array.isArray(PHOTOS[p.detail]) && PHOTOS[p.detail].length) ? PHOTOS[p.detail] : PHOTOS[p.kei];
  if (Array.isArray(pool) && pool.length) set('(必須)写真ID1', String(pool[(photoIdx + CYCLE) % pool.length]));
  return { line: row.map(q).join(','), header: H };
}

// ── 実行 ──
function selectRows() {
  let rows = planRows;
  const group = val('--group', null);
  if (group) rows = rows.filter(r => r.group === group.toUpperCase());
  const jt = val('--jobtype', null);
  if (jt) rows = rows.filter(r => r.kei === jt);
  return rows;
}

if (has('--advance')) {
  const n = readCycle() + 1;
  writeCycle(n);
  console.log(`内容ローテのサイクルを ${n} に進めました（次回の更新から新しい仕事内容/写真バージョンになります）`);
  process.exit(0);
}

if (has('--status')) {
  const byKei = {};
  for (const r of planRows) (byKei[r.kei] = byKei[r.kei] || []).push(r);
  console.log('■ 割付(plan.csv):', planRows.length, '件');
  for (const kei of ['営業', '企画', '送迎', '配送']) {
    const n = (byKei[kei] || []).length;
    const ref = loadRef(kei);
    console.log(`  ${kei}: ${n}件  雛形=${ref ? 'あり(利用可)' : '未作成(スキップ)'}`);
  }
  const g = {}; for (const r of planRows) g[r.group] = (g[r.group] || 0) + 1;
  console.log('■ 更新グループ:', Object.keys(g).sort().map(k => `${k}=${g[k]}`).join(' / '));
  const idN = planRows.filter(r => PLAN_IDS[String(r.no)]).length;
  console.log('■ 更新モード:', `求人ID登録 ${idN}/${planRows.length}件` + (idN < planRows.length ? '（未登録分は --update で除外＝重複防止）' : ''));
  console.log('■ 内容サイクル(CYCLE):', CYCLE, '（--advance で+1／週次で進めると新着更新）');
  console.log('■ 写真プール:', Object.keys(PHOTOS).length ? JSON.stringify(PHOTOS) : '未設定(雛形の写真を使用)');
  process.exit(0);
}

const rows = selectRows();
if (!rows.length) { console.log('対象がありません（--group A〜E / --jobtype を確認）'); process.exit(0); }

fs.mkdirSync(OUT_DIR, { recursive: true });
const used = new Set();
const outLines = []; let headerArr = null;
let made = 0; const skipped = {}; const perKei = {};

rows.forEach((p, i) => {
  const ref = loadRef(p.kei);
  if (!ref) { skipped[p.kei] = (skipped[p.kei] || 0) + 1; return; }
  if (UPDATE && !PLAN_IDS[String(p.no)]) { skipped['(ID未登録)'] = (skipped['(ID未登録)'] || 0) + 1; return; } // 重複防止：IDが無い行は更新対象外
  const st = findStation(p.area, used);
  if (!st) { skipped['(駅なし)' + p.area] = 1; return; }
  used.add(st.station);
  const { line, header } = buildRow(ref, p, st, perKei[p.kei] || 0);
  perKei[p.kei] = (perKei[p.kei] || 0) + 1;
  if (!headerArr) headerArr = header;
  outLines.push(line);
  made++;
});

if (!made) {
  console.log('出力できる行がありません。営業/企画は雛形(templates/営業.json・企画.json)を作成してください。');
  if (Object.keys(skipped).length) console.log('スキップ:', JSON.stringify(skipped));
  process.exit(0);
}

const csv = [headerArr.map(q).join(','), ...outLines].join('\r\n') + '\r\n';
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const gLabel = ((val('--group', '') || (val('--jobtype', '') || 'ALL')) + (UPDATE ? '-UPD' : '-NEW') + '-c' + CYCLE).toUpperCase();
let n = 1, file;
do { file = path.join(OUT_DIR, `seniorjob-plan-sq-${stamp}-${gLabel}-${String(n).padStart(2, '0')}.csv`); n++; } while (fs.existsSync(file));
fs.writeFileSync(file, toSjis(csv));

console.log(`出力: ${made}件 → ${file}`);
console.log('  モード:', UPDATE ? '更新（求人ID付与＝既存を上書き・重複なし）' : '新規（求人ID空）', '／内容サイクル:', CYCLE);
console.log('  職種別:', Object.entries(perKei).map(([k, v]) => `${k}=${v}`).join(' / '));
if (Object.keys(skipped).length) console.log('  スキップ:', JSON.stringify(skipped));
console.log('  （Shift-JIS形式。シニアジョブの一括登録／一括編集にそのまま取込できます）');
