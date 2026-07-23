'use strict';
// シニアジョブ 50件プラン展開（営業/企画/送迎/配送 × 大阪30分圏50区市）
//
// 職種ごとに「実在の掲載済み求人」を雛形(153列)として複製し、
// 大阪50区市へ 勤務地・求人タイトル・簡易職種名・仕事内容・写真 を差別化して展開する。
//   - 送迎/配送 : 既存の ref_job.json（ロケ同行ドライバー）を雛形に流用
//   - 営業/企画 : seniorjob/templates/営業.json ・ 企画.json（後から作成／無ければ自動スキップ）
//
// 掲載順位(新着順)維持のため、平日1日10件・週1巡で更新する運用を想定。
// plan.csv の「更新グループ」A(月)〜E(金) が各10件。--group A で当日分だけ出力する。
//
// 使い方:
//   node scripts/seniorjob_plan_export.js --group A     # 月曜分(10件)をCSV出力
//   node scripts/seniorjob_plan_export.js --all         # 50件まとめて出力
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

// ── 職種詳細 → 仕事内容テンプレ / 簡易職種名 ──
const CONTENT_MAP = {
  'ルート営業': '営業-ルート.txt', '反響営業': '営業-反響.txt', 'カウンター営業': '営業-カウンター.txt',
  '企画営業・販促企画': '企画.txt', '提案営業(企画)': '企画.txt', '企画営業': '企画.txt',
  '送迎ドライバー': '送迎.txt', 'ルート配送': '配送.txt',
};
const KANNI_MAP = {
  'ルート配送': 'ルート配送ドライバー', '企画営業・販促企画': '企画営業', '提案営業(企画)': '提案営業',
};
const kanniName = d => KANNI_MAP[d] || d;
function contentText(detail, area, eki) {
  const f = CONTENT_MAP[detail];
  if (!f) return null;
  try {
    return fs.readFileSync(path.join(CONTENTS, f), 'utf8')
      .replace(/\r\n/g, '\n').replace(/\s+$/, '')
      .split('{area}').join(area).split('{eki}').join(eki);
  } catch { return null; }
}

// ── 写真プール（任意） ──
let PHOTOS = {};
try { PHOTOS = JSON.parse(fs.readFileSync(PHOTOS_FILE, 'utf8')) || {}; } catch { PHOTOS = {}; }

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
  set('求人ID', ''); // 空=新規
  // 勤務地1
  set('(必須)勤務地1分類', '市区町村');
  set('勤務地1郵便番号', st.postal || '');
  set('勤務地1都道府県', st.pref || '');
  set('勤務地1市区町村', wardForm(st.city || ''));
  set('勤務地1詳細住所', st.address || '');
  const ekiName = st.nearest ? st.nearest.replace(/\s*徒歩.*$/, '') : (st.station + '駅');
  set('勤務地1最寄駅', st.code ? `${ekiName}(コード:${st.code}) 徒歩5分` : '');
  // 差別化
  if (p.title) set('(必須)求人タイトル', p.title);
  set('(必須)簡易職種名', kanniName(p.detail));
  const body = contentText(p.detail, p.area, ekiName);
  if (body) set('(必須)仕事内容', body);
  // 写真プール（任意・区ごとにローテ）
  const pool = PHOTOS[p.kei];
  if (Array.isArray(pool) && pool.length) set('(必須)写真ID1', String(pool[photoIdx % pool.length]));
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
const gLabel = (val('--group', '') || (val('--jobtype', '') ? val('--jobtype', '') : 'ALL')).toUpperCase();
let n = 1, file;
do { file = path.join(OUT_DIR, `seniorjob-plan-sq-${stamp}-${gLabel}-${String(n).padStart(2, '0')}.csv`); n++; } while (fs.existsSync(file));
fs.writeFileSync(file, toSjis(csv));

console.log(`出力: ${made}件 → ${file}`);
console.log('  職種別:', Object.entries(perKei).map(([k, v]) => `${k}=${v}`).join(' / '));
if (Object.keys(skipped).length) console.log('  スキップ(雛形未作成など):', JSON.stringify(skipped));
console.log('  （Shift-JIS形式。シニアジョブの一括登録にそのまま取込できます）');
