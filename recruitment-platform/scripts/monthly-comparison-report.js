#!/usr/bin/env node
'use strict';
/**
 * 先月・今月（暦月）の応募データを比較するレポート（読み取り専用）。
 * daily-funnel-report.js と同じ定義（応募数=全件、有効応募=is_duplicate=0、対応中=status='対応中'）を使い、
 * 期間だけを「直近N日」ではなく暦月（YYYY-MM、applied_atベース）に変える。
 * applicants.applied_month列は実運用で入力されていないため使わず、applied_atから計算する。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/monthly-comparison-report.js               // 今月・先月
 *   node --experimental-sqlite scripts/monthly-comparison-report.js --month 2026-07 --compare 2026-06
 */
const path = require('path');
const fs = require('fs');
(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { DatabaseSync } = require('node:sqlite');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const jst = ms => new Date(Date.now() + 9 * 3600 * 1000 + ms).toISOString().slice(0, 10);
const todayJst = jst(0);
const thisMonth = todayJst.slice(0, 7);
function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const MONTH_A = val('--month', thisMonth);
const MONTH_B = val('--compare', prevMonth(MONTH_A));
const pct = (n, d) => (d > 0 ? (100 * n / d).toFixed(1) + '%' : '−');
const pad = (s, n) => String(s).padEnd(n, ' ');
const padL = (s, n) => String(s).padStart(n, ' ');

function ageBand(age) {
  if (!age || age <= 0) return '不明';
  if (age < 20) return '10代以下';
  if (age < 30) return '20代';
  if (age < 40) return '30代';
  if (age < 50) return '40代';
  if (age < 60) return '50代';
  return '60代以上';
}
const AGE_ORDER = ['10代以下', '20代', '30代', '40代', '50代', '60代以上', '不明'];

const MEDIA_NAME = { indeed: 'Indeed', kyujinbox: '求人ボックス', stanby: 'スタンバイ/engage(旧データ混在の可能性)', google: 'Googleしごと', engage: 'engage', seniorjob: 'シニアジョブ', '': '(未設定)' };

function report(ym) {
  const rows = db.prepare(
    `SELECT is_duplicate, status, age, media, job_title FROM applicants WHERE substr(applied_at,1,7) = ?`
  ).all(ym);
  const total = rows.length;
  const valid = rows.filter(r => r.is_duplicate === 0).length;
  const inprog = rows.filter(r => r.is_duplicate === 0 && r.status === '対応中').length;

  const byAge = {};
  for (const r of rows) {
    if (r.is_duplicate !== 0) continue;
    const b = ageBand(r.age);
    byAge[b] = byAge[b] || { valid: 0, inprog: 0 };
    byAge[b].valid++;
    if (r.status === '対応中') byAge[b].inprog++;
  }

  const byMedia = {};
  for (const r of rows) {
    const m = r.media || '';
    byMedia[m] = byMedia[m] || { total: 0, valid: 0, inprog: 0 };
    byMedia[m].total++;
    if (r.is_duplicate === 0) {
      byMedia[m].valid++;
      if (r.status === '対応中') byMedia[m].inprog++;
    }
  }

  const titleRows = rows.filter(r => r.job_title);
  const byTitle = {};
  for (const r of titleRows) {
    const t = r.job_title;
    byTitle[t] = byTitle[t] || { total: 0, valid: 0, inprog: 0 };
    byTitle[t].total++;
    if (r.is_duplicate === 0) {
      byTitle[t].valid++;
      if (r.status === '対応中') byTitle[t].inprog++;
    }
  }

  // 媒体×職種クロス
  const byMediaTitle = {};
  for (const r of titleRows) {
    const m = r.media || '';
    byMediaTitle[m] = byMediaTitle[m] || {};
    const t = r.job_title;
    byMediaTitle[m][t] = byMediaTitle[m][t] || { total: 0, valid: 0, inprog: 0 };
    byMediaTitle[m][t].total++;
    if (r.is_duplicate === 0) {
      byMediaTitle[m][t].valid++;
      if (r.status === '対応中') byMediaTitle[m][t].inprog++;
    }
  }

  // 媒体×年齢層クロス（有効応募ベース）
  const byMediaAge = {};
  for (const r of rows) {
    if (r.is_duplicate !== 0) continue;
    const m = r.media || '';
    const bnd = ageBand(r.age);
    byMediaAge[m] = byMediaAge[m] || {};
    byMediaAge[m][bnd] = byMediaAge[m][bnd] || { valid: 0, inprog: 0 };
    byMediaAge[m][bnd].valid++;
    if (r.status === '対応中') byMediaAge[m][bnd].inprog++;
  }

  return { ym, total, valid, inprog, byAge, byMedia, byTitle, byMediaTitle, byMediaAge };
}

const isCurrentMonth = ym => ym === thisMonth;

const a = report(MONTH_A);
const b = report(MONTH_B);

console.log(`\n==================== 月次比較レポート（暦月・applied_atベース） ====================\n`);
console.log(`対象月A: ${a.ym}${isCurrentMonth(a.ym) ? `（今月・${todayJst}時点でまだ月末まで途中）` : ''}`);
console.log(`対象月B: ${b.ym}${isCurrentMonth(b.ym) ? `（今月・${todayJst}時点でまだ月末まで途中）` : ''}\n`);

console.log('■① 全体KPI');
console.log('  ' + pad('月', 10) + padL('応募数', 8) + padL('有効応募', 9) + padL('有効応募率', 11) + padL('対応中', 8) + padL('対応移行率', 11));
for (const r of [a, b]) {
  console.log('  ' + pad(r.ym, 10) + padL(r.total, 8) + padL(r.valid, 9) + padL(pct(r.valid, r.total), 11) + padL(r.inprog, 8) + padL(pct(r.inprog, r.valid), 11));
}

console.log('\n■② 年齢層別（有効応募ベース）');
console.log('  ' + pad('年齢層', 10) + padL(`${a.ym}有効`, 10) + padL('対応移行率', 11) + padL(`${b.ym}有効`, 10) + padL('対応移行率', 11));
for (const band of AGE_ORDER) {
  const va = a.byAge[band] || { valid: 0, inprog: 0 };
  const vb = b.byAge[band] || { valid: 0, inprog: 0 };
  if (va.valid === 0 && vb.valid === 0) continue;
  console.log('  ' + pad(band, 10) + padL(va.valid, 10) + padL(pct(va.inprog, va.valid), 11) + padL(vb.valid, 10) + padL(pct(vb.inprog, vb.valid), 11));
}

console.log('\n■③ 媒体別ファネル');
for (const r of [a, b]) {
  console.log(`\n  [${r.ym}${isCurrentMonth(r.ym) ? '・今月途中' : ''}]`);
  console.log('  ' + pad('媒体', 30) + padL('応募数', 8) + padL('有効応募', 9) + padL('有効応募率', 11) + padL('対応中', 8) + padL('対応移行率', 11));
  const sorted = Object.entries(r.byMedia).sort((x, y) => y[1].valid - x[1].valid);
  for (const [m, v] of sorted) {
    console.log('  ' + pad(MEDIA_NAME[m] ?? m, 30) + padL(v.total, 8) + padL(v.valid, 9) + padL(pct(v.valid, v.total), 11) + padL(v.inprog, 8) + padL(pct(v.inprog, v.valid), 11));
  }
}

console.log('\n■④ 職種別（job_title・有効応募数トップ10、月ごと）');
for (const r of [a, b]) {
  console.log(`\n  [${r.ym}${isCurrentMonth(r.ym) ? '・今月途中' : ''}]`);
  console.log('  ' + pad('求人タイトル(自由記述)', 42) + padL('応募', 6) + padL('有効応募', 9) + padL('有効応募率', 11) + padL('対応中', 8) + padL('対応移行率', 11));
  const sorted = Object.entries(r.byTitle).sort((x, y) => y[1].valid - x[1].valid).slice(0, 10);
  if (sorted.length === 0) console.log('    該当なし');
  for (const [title, v] of sorted) {
    console.log('  ' + pad(title.slice(0, 40), 42) + padL(v.total, 6) + padL(v.valid, 9) + padL(pct(v.valid, v.total), 11) + padL(v.inprog, 8) + padL(pct(v.inprog, v.valid), 11));
  }
}
console.log('  ※ job_titleは自由記述のため、同一求人でも表記ゆれで別行に分かれることがある。');

const MIN_MEDIA_VALID = 3; // 媒体別セクションに載せる最低有効応募数（サンプル過少な媒体は省略）
console.log('\n■⑤ 媒体×職種クロス（媒体ごとに職種別トップ5、月ごと）');
for (const r of [a, b]) {
  console.log(`\n  [${r.ym}${isCurrentMonth(r.ym) ? '・今月途中' : ''}]`);
  const medias = Object.entries(r.byMediaTitle)
    .map(([m, titles]) => [m, Object.values(titles).reduce((s, v) => s + v.valid, 0)])
    .filter(([, v]) => v >= MIN_MEDIA_VALID)
    .sort((x, y) => y[1] - x[1]);
  if (medias.length === 0) console.log('    該当なし（サンプル不足）');
  for (const [m] of medias) {
    console.log(`\n  ◆ ${MEDIA_NAME[m] ?? m}`);
    console.log('    ' + pad('求人タイトル(自由記述)', 40) + padL('応募', 6) + padL('有効応募', 9) + padL('対応中', 8) + padL('対応移行率', 11));
    const top = Object.entries(r.byMediaTitle[m]).sort((x, y) => y[1].valid - x[1].valid).slice(0, 5);
    for (const [title, v] of top) {
      console.log('    ' + pad(title.slice(0, 38), 40) + padL(v.total, 6) + padL(v.valid, 9) + padL(v.inprog, 8) + padL(pct(v.inprog, v.valid), 11));
    }
  }
}
console.log('  ※ 応募数が少ない媒体×職種の組み合わせは1〜2件のセルも多く、比率は参考程度に見ること。');

console.log('\n■⑥ 媒体×年齢層クロス（有効応募ベース、月ごと）');
for (const r of [a, b]) {
  console.log(`\n  [${r.ym}${isCurrentMonth(r.ym) ? '・今月途中' : ''}]`);
  const medias = Object.entries(r.byMedia).filter(([, v]) => v.valid >= MIN_MEDIA_VALID).sort((x, y) => y[1].valid - x[1].valid);
  if (medias.length === 0) console.log('    該当なし（サンプル不足）');
  for (const [m] of medias) {
    console.log(`\n  ◆ ${MEDIA_NAME[m] ?? m}`);
    console.log('    ' + pad('年齢層', 10) + padL('有効応募', 9) + padL('対応移行率', 11));
    for (const band of AGE_ORDER) {
      const v = (r.byMediaAge[m] || {})[band];
      if (!v || v.valid === 0) continue;
      console.log('    ' + pad(band, 10) + padL(v.valid, 9) + padL(pct(v.inprog, v.valid), 11));
    }
  }
}
console.log('  ※ 媒体×職種×年齢の3軸クロスはセルが1〜2件になり過ぎて参考にならないため出していない。特定の媒体・職種を絞って年齢を見たい場合は指定してほしい。');

console.log(`\n※ ${isCurrentMonth(a.ym) || isCurrentMonth(b.ym) ? '今月分は月の途中までのデータのため、完了月と単純比較すると少なく見える点に注意。' : ''}`);
console.log('※ 年齢は媒体フォームの入力・架電リストでの手入力に依存するため、未入力の応募者は「不明」に集計される。\n');
