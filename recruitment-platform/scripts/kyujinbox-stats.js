'use strict';
// 求人ボックス無料掲載の実績集計（job_metrics ベース）
// 使い方: recruitment-platform フォルダで
//   node scripts/kyujinbox-stats.js         ← 全社
//   node scripts/kyujinbox-stats.js sq      ← SQのみ
// 応募見込みの根拠になる「表示(views)・応募(applies)・応募率・1求人あたり応募」を出す。
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');

const company = (process.argv[2] || '').trim().toLowerCase(); // 空=全社
const db = new DatabaseSync(DB_PATH);

const where = company ? 'WHERE company = ?' : '';
const args = company ? [company] : [];

const rows = db.prepare(`SELECT * FROM job_metrics ${where}`).all(...args);
if (rows.length === 0) {
  console.log(`job_metrics にデータがありません（company=${company || 'all'}）。`);
  console.log('※ 求人ボックスの実績取得（views/applies のスクレイプ）を一度も回していない可能性があります。');
  process.exit(0);
}

// 最新スナップショットを求人ごとに1件へ集約（job_id 単位。null は job_number で代替）
const latest = new Map();
for (const r of rows) {
  const key = r.job_id || `num:${r.job_number}`;
  const cur = latest.get(key);
  if (!cur || String(r.collected_at) > String(cur.collected_at)) latest.set(key, r);
}
const jobs = [...latest.values()].filter(r => r.job_number !== '9999-0000-0001'); // テスト行除外

const n = jobs.length;
const sum = (f) => jobs.reduce((a, r) => a + (Number(r[f]) || 0), 0);
const views = sum('views');
const applies = sum('applies');
const withApply = jobs.filter(r => (Number(r.applies) || 0) > 0).length;
const dates = jobs.map(r => String(r.collected_at)).filter(Boolean).sort();
const applyRate = views > 0 ? (100 * applies / views) : 0;

const fmt = (x, d = 2) => Number(x).toFixed(d);
console.log(`\n===== 求人ボックス実績（company=${company || 'all'}）=====`);
console.log(`対象求人数（最新スナップショット）: ${n} 件`);
console.log(`取得期間: ${dates[0] || '-'}  〜  ${dates[dates.length - 1] || '-'}`);
console.log(`合計 表示(views):  ${views}`);
console.log(`合計 応募(applies): ${applies}`);
console.log(`応募率(applies/views): ${fmt(applyRate)} %`);
console.log(`1求人あたり 平均表示: ${fmt(n ? views / n : 0)} / 平均応募: ${fmt(n ? applies / n : 0)}`);
console.log(`応募が1件以上あった求人: ${withApply} / ${n} 件 (${fmt(n ? 100 * withApply / n : 0)}%)`);

console.log(`\n--- 応募数トップ10 ---`);
jobs.sort((a, b) => (Number(b.applies) || 0) - (Number(a.applies) || 0)).slice(0, 10)
  .forEach((r, i) => console.log(`${i + 1}. applies=${r.applies || 0} views=${r.views || 0}  ${String(r.title || '').slice(0, 40)}  [${r.location || ''}]`));

// ── 差分（実測の増加ペース）で月間見込みを逆算 ──
// 各求人の「最古スナップショット→最新スナップショット」でapplies/viewsの増加分を測り、
// 観測期間（全体の最古〜最新）で割って1日あたり→月間(×30)へ換算する。実測ベース。
const byKey = new Map();
for (const r of rows) {
  if (r.job_number === '9999-0000-0001') continue;
  const key = r.job_id || `num:${r.job_number}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(r);
}
let deltaApplies = 0, deltaViews = 0, multiSnap = 0;
for (const arr of byKey.values()) {
  arr.sort((a, b) => String(a.collected_at) < String(b.collected_at) ? -1 : 1);
  const first = arr[0], last = arr[arr.length - 1];
  if (arr.length < 2 || first.collected_at === last.collected_at) continue;
  multiSnap++;
  deltaApplies += Math.max(0, (Number(last.applies) || 0) - (Number(first.applies) || 0));
  deltaViews   += Math.max(0, (Number(last.views)   || 0) - (Number(first.views)   || 0));
}
const allDates = rows.map(r => String(r.collected_at)).filter(Boolean).sort();
const t0 = allDates[0] ? new Date(allDates[0]).getTime() : 0;
const t1 = allDates[allDates.length - 1] ? new Date(allDates[allDates.length - 1]).getTime() : 0;
const windowDays = t0 && t1 ? (t1 - t0) / 86400000 : 0;

console.log(`\n===== 実測ペース（スナップショット差分）=====`);
console.log(`観測期間: ${fmt(windowDays, 2)} 日（複数回取得された求人 ${multiSnap} 件で測定）`);
if (windowDays > 0 && multiSnap > 0) {
  const applyPerDay = deltaApplies / windowDays;
  const viewPerDay  = deltaViews / windowDays;
  console.log(`観測期間中に増えた 応募: ${deltaApplies} 件 / 表示: ${deltaViews}`);
  console.log(`1日あたり 実測: 応募 ${fmt(applyPerDay, 2)} 件 / 表示 ${fmt(viewPerDay, 1)}`);
  console.log(`→ 月間換算(×30): 応募 約 ${Math.round(applyPerDay * 30)} 件 / 表示 約 ${Math.round(viewPerDay * 30)}（現在の掲載規模 ${n} 件ベース）`);
  console.log(`→ 1求人あたり 月間応募: 約 ${fmt(applyPerDay * 30 / (n || 1), 2)} 件`);
} else {
  console.log(`※ 同一求人の複数回スナップショットが不足しており、増加ペースを測れません。`);
  console.log(`  実績取得（views/applies スクレイプ）を数日おきに複数回まわすと、実測の月間ペースが出せます。`);
}
console.log(`\n※ applies(上部)は掲載開始からの累計。月間見込みは上の「実測ペース」を参照してください。`);
