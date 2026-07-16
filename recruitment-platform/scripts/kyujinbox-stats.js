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

console.log(`\n※ applies は「取得時点までの累計」です。月間見込みに直すには取得期間の長さで割ります。`);
console.log(`  この出力をそのまま共有してもらえれば、全国ブルーカラー無料掲載の月間応募見込みを実数から逆算します。`);
