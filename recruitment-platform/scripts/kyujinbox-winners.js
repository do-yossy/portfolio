'use strict';
/*
 * 求人ボックス「勝ち型」分析
 * ------------------------------------------------------------
 * job_metrics（最新スナップショット）から、応募・表示が付く求人の共通点を
 * 給与帯 / 職種 / タイトルのキーワード / エリア / 会社 の切り口で数値化する。
 * 露出(views)に効く型と、応募(applies)に効く型を分けて出力する。
 *
 * 実行: node --experimental-sqlite scripts/kyujinbox-winners.js [--company all|sq|bg|...] [--min 8]
 *   --company: 対象会社（既定 all）
 *   --min    : キーワード集計の最小該当件数（既定 8。ノイズ除去）
 */
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const COMPANY = (getArg('--company', 'all') || 'all').toLowerCase();
const MIN = parseInt(getArg('--min', '8'), 10) || 8;

const DB = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB);

// ── 最新スナップショットを求人ごとに1件へ集約 ──
const where = COMPANY === 'all' ? '' : 'WHERE m.company = ?';
const rows = db.prepare(
  `SELECT m.company, m.job_id, m.job_number, m.title, m.location, m.status,
          m.views, m.applies, m.collected_at, j.job_type AS j_job_type, j.salary AS j_salary
   FROM job_metrics m LEFT JOIN jobs j ON j.id = m.job_id ${where}`
).all(...(COMPANY === 'all' ? [] : [COMPANY]));

const latest = {};
for (const r of rows) {
  const key = r.job_id || `${r.job_number}|${r.title}`;
  if (!latest[key] || String(r.collected_at) > String(latest[key].collected_at)) latest[key] = r;
}
const jobs = Object.values(latest).map(r => ({
  ...r,
  views: Number(r.views) || 0,
  applies: Number(r.applies) || 0,
}));

if (jobs.length === 0) {
  console.log(`job_metrics にデータがありません（company=${COMPANY}）。先に kyujinbox_metrics.py で収集してください。`);
  process.exit(0);
}

// ── ヘルパ ──
const pref = loc => {
  const m = String(loc || '').match(/^(.{2,3}?[都道府県])/);
  return m ? m[1] : '不明';
};
const salaryMan = j => {
  // jobs.salary か title から「月収/月給 XX万」または「XX万円」の最大値（万円）を推定
  const src = `${j.j_salary || ''} ${j.title || ''}`;
  const nums = [...src.matchAll(/(\d{2,3})\s*万/g)].map(x => parseInt(x[1], 10)).filter(n => n >= 15 && n <= 120);
  if (nums.length) return Math.max(...nums);
  const yen = [...src.matchAll(/(\d{6,7})\s*円/g)].map(x => Math.round(parseInt(x[1], 10) / 10000)).filter(n => n >= 15 && n <= 120);
  return yen.length ? Math.max(...yen) : 0;
};
const salaryBand = man => (man === 0 ? '不明' : man < 28 ? '〜27万' : man < 32 ? '28〜31万' : man < 36 ? '32〜35万' : '36万〜');
const jobTypeOf = j => (j.j_job_type || '').trim() || '（DB未紐付）';

// ── 全体サマリー ──
const total = jobs.length;
const winners = jobs.filter(j => j.applies >= 1);
const viewed = jobs.filter(j => j.views >= 30);
const zeroView = jobs.filter(j => j.views === 0);
const avg = arr => (arr.length ? arr.reduce((s, j) => s + j.views, 0) / arr.length : 0);
const applyRate = arr => {
  const v = arr.reduce((s, j) => s + j.views, 0), a = arr.reduce((s, j) => s + j.applies, 0);
  return v ? (a / v * 100) : 0;
};

console.log(`\n===== 求人ボックス 勝ち型分析（company=${COMPANY}）=====`);
console.log(`対象求人: ${total}件 ／ 応募あり: ${winners.length}件(${(winners.length / total * 100).toFixed(1)}%) ／ 表示30以上: ${viewed.length}件 ／ 表示0: ${zeroView.length}件`);
console.log(`平均表示: 応募あり群 ${avg(winners).toFixed(1)} vs 応募なし群 ${avg(jobs.filter(j => j.applies === 0)).toFixed(1)}`);
console.log(`→ 応募の有無はほぼ「表示されたか」で決まる（＝露出差）\n`);

// ── 汎用: グループ集計を表示 ──
function report(title, keyFn, sortBy) {
  const g = {};
  for (const j of jobs) {
    const k = keyFn(j);
    if (k == null) continue;
    (g[k] || (g[k] = [])).push(j);
  }
  let entries = Object.entries(g).map(([k, arr]) => ({
    k, n: arr.length, avgV: avg(arr), apps: arr.reduce((s, j) => s + j.applies, 0),
    rate: applyRate(arr), winPct: arr.filter(j => j.applies >= 1).length / arr.length * 100,
  })).filter(e => e.n >= 3);
  entries.sort(sortBy === 'views' ? (a, b) => b.avgV - a.avgV : (a, b) => b.apps - a.apps || b.avgV - a.avgV);
  console.log(`■ ${title}`);
  console.log('   ' + '区分'.padEnd(16) + '件数  平均表示  応募計  応募率   応募あり率');
  for (const e of entries.slice(0, 12)) {
    console.log('   ' + String(e.k).slice(0, 15).padEnd(16) +
      String(e.n).padStart(4) + String(e.avgV.toFixed(1)).padStart(9) +
      String(e.apps).padStart(7) + (e.rate.toFixed(2) + '%').padStart(8) +
      (e.winPct.toFixed(0) + '%').padStart(9));
  }
  console.log('');
}

report('給与帯別（応募計 順）', j => salaryBand(salaryMan(j)));
report('職種別（応募計 順）', j => jobTypeOf(j));
report('都道府県別・表示が付く地域（平均表示 順）', j => pref(j.location), 'views');
report('会社別', j => (j.company || '?'));

// ── タイトルのキーワード別 勝ち型 ──
const KEYWORDS = [
  '未経験', '経験不問', '未経験歓迎', '学歴不問', 'ブランク', 'シニア', 'フリーター',
  '月収28万', '月収30万', '月収32万', '月収35万', '月収38万', '月収40万', '月給', '高収入', '年収',
  '正社員', '日勤', '夜勤', '週休2日', '完全週休', '土日祝', '残業なし', '残業少',
  '賞与', '昇給', '手当', '寮', '社宅', '送迎', 'まかない', '車通勤', '転勤なし',
  'ドライバー', '配送', 'ルート', '運転手', '役員運転手', '送迎ドライバー',
  '倉庫', 'ピッキング', '検品', '品質', '仕分け', '入出荷', '在庫', '軽作業', '座り作業', '製造', 'オペレーター',
  '営業', '接客', '販売', '介護', '事務', 'IT', 'エンジニア',
];
const kw = {};
for (const j of jobs) {
  const t = j.title || '';
  for (const k of KEYWORDS) {
    if (t.includes(k)) (kw[k] || (kw[k] = [])).push(j);
  }
}
function kwTable(title, sortBy) {
  let e = Object.entries(kw).map(([k, arr]) => ({
    k, n: arr.length, avgV: avg(arr), apps: arr.reduce((s, j) => s + j.applies, 0),
    rate: applyRate(arr), winPct: arr.filter(j => j.applies >= 1).length / arr.length * 100,
  })).filter(x => x.n >= MIN);
  e.sort(sortBy === 'views' ? (a, b) => b.avgV - a.avgV : (a, b) => b.winPct - a.winPct || b.apps - a.apps);
  console.log(`■ ${title}`);
  console.log('   ' + 'キーワード'.padEnd(14) + '件数  平均表示  応募計  応募あり率');
  for (const x of e.slice(0, 15)) {
    console.log('   ' + String(x.k).padEnd(15) + String(x.n).padStart(4) +
      String(x.avgV.toFixed(1)).padStart(9) + String(x.apps).padStart(7) +
      (x.winPct.toFixed(0) + '%').padStart(9));
  }
  console.log('');
}
kwTable('タイトル語 × 応募が付きやすい（応募あり率 順）');
kwTable('タイトル語 × 表示が付きやすい（平均表示 順）', 'views');

// ── 自動サマリー ──
const baseWin = winners.length / total * 100;
const baseView = avg(jobs);
const strong = Object.entries(kw).map(([k, arr]) => ({
  k, n: arr.length, winPct: arr.filter(j => j.applies >= 1).length / arr.length * 100, avgV: avg(arr),
})).filter(x => x.n >= MIN);
const topApply = strong.filter(x => x.winPct > baseWin * 1.3).sort((a, b) => b.winPct - a.winPct).slice(0, 6).map(x => x.k);
const topView = strong.filter(x => x.avgV > baseView * 1.3).sort((a, b) => b.avgV - a.avgV).slice(0, 6).map(x => x.k);
console.log('===== 自動サマリー =====');
console.log(`基準: 応募あり率 ${baseWin.toFixed(1)}% / 平均表示 ${baseView.toFixed(1)}`);
console.log(`◎ 応募に効くタイトル語: ${topApply.join(' / ') || '（有意差なし）'}`);
console.log(`◎ 表示に効くタイトル語: ${topView.join(' / ') || '（有意差なし）'}`);
console.log('→ この“勝ち型”に寄せて掲載を集中し、表示0の負け求人を間引くと、無料掲載の枠内で応募効率が上がります。');
console.log('※ ただし1求人あたり平均表示が低い場合、最短で応募を増やすのは運用型（有料露出）です。\n');

db.close();
