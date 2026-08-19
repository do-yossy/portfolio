#!/usr/bin/env node
'use strict';
/**
 * 今日(JST)の新着応募を「改善に使える粒度」で分析する。
 * - 会社×媒体の当日集計
 * - 応募者の属性（年齢/性別/現職/希望職種/希望勤務地）一覧
 * - 応募が付いた求人タイトル/エリア（applications紐付けがあるもの）
 * 重複(is_duplicate=1)は除外。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/analyze-today.js            // 今日
 *   node --experimental-sqlite scripts/analyze-today.js --date 2026-08-13
 *   node --experimental-sqlite scripts/analyze-today.js --company sq
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const jstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const DATE = val('--date', jstToday);
const CO = val('--company', null);
const MEDIA_NAME = { indeed: 'Indeed', kyujinbox: '求人ボックス', stanby: 'スタンバイ', google: 'Google', engage: 'engage', seniorjob: 'シニアジョブ', '': '(未設定)' };
const g = (r, k) => (r[k] === null || r[k] === undefined || r[k] === '') ? '' : r[k];

const coCond = CO ? ` AND company='${CO.replace(/'/g, '')}'` : '';
const rows = db.prepare(
  `SELECT * FROM applicants
    WHERE is_duplicate=0 AND substr(applied_at,1,10)=?${coCond}
    ORDER BY company, media`
).all(DATE);

console.log(`\n==================== ${DATE} の新着応募 分析${CO ? `（会社=${CO}）` : ''} ====================`);
console.log(`\n■ 当日の新着応募数（重複除く）: ${rows.length}件`);

// 会社×媒体
const cx = {};
for (const r of rows) { const k = `${r.company}|${r.media}`; cx[k] = (cx[k] || 0) + 1; }
console.log(`\n【会社 × 媒体】`);
const cos = [...new Set(rows.map(r => r.company))].sort();
const meds = [...new Set(rows.map(r => r.media))];
console.log('  会社   ' + meds.map(m => (MEDIA_NAME[m] ?? m).padStart(10)).join('') + '     計');
for (const c of cos) {
  const row = meds.map(m => cx[`${c}|${m}`] || 0);
  console.log('  ' + c.padEnd(6) + row.map(v => String(v).padStart(10)).join('') + String(row.reduce((a, b) => a + b, 0)).padStart(7));
}

// 属性一覧
console.log(`\n【応募者の属性一覧】`);
if (rows.length === 0) console.log('  （該当なし）');
rows.forEach((r, i) => {
  const attrs = [
    `会社=${r.company}`, `媒体=${MEDIA_NAME[r.media] ?? r.media}`,
    g(r, 'age') !== '' ? `${r.age}歳` : '', g(r, 'gender'), g(r, 'current_job') && `現職:${r.current_job}`,
    g(r, 'job_title') && `希望職種:${r.job_title}`, g(r, 'work_location') && `希望勤務地:${r.work_location}`,
    `status=${r.status}`,
  ].filter(Boolean);
  console.log(`  [${i + 1}] ${r.name}  ` + attrs.join(' / '));
});

// 年齢分布
const ages = rows.map(r => r.age).filter(a => a != null && a !== '');
if (ages.length) {
  const bins = { '〜29': 0, '30-39': 0, '40-49': 0, '50-59': 0, '60〜': 0 };
  for (const a of ages) { a < 30 ? bins['〜29']++ : a < 40 ? bins['30-39']++ : a < 50 ? bins['40-49']++ : a < 60 ? bins['50-59']++ : bins['60〜']++; }
  console.log(`\n【年齢分布】(${ages.length}件) ` + Object.entries(bins).map(([k, v]) => `${k}:${v}`).join('  '));
}

// 応募が付いた求人（applications紐付けがある場合）
try {
  const jobs = db.prepare(
    `SELECT ap.job_title jt, COUNT(*) c
       FROM applications ap JOIN applicants a ON a.id = ap.applicant_id
      WHERE substr(ap.applied_at,1,10)=? AND a.is_duplicate=0${CO ? ` AND a.company='${CO.replace(/'/g, '')}'` : ''}
      GROUP BY ap.job_title ORDER BY c DESC`
  ).all(DATE);
  if (jobs.length) {
    console.log(`\n【応募が付いた求人タイトル（紐付けあり）】`);
    for (const j of jobs) console.log(`  ${String(j.c).padStart(3)}件  ${j.jt || '(タイトル不明)'}`);
  }
} catch {}
console.log('');
