#!/usr/bin/env node
'use strict';
/**
 * Indeed経由でドライバー系職種のうち、どのjob_titleに応募が集まっているかを一覧化する（読み取り専用）。
 * daily-funnel-report.js と同じ定義（応募数=全件、有効応募=is_duplicate=0、対応中=status='対応中'）を使う。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/diag-indeed-driver-titles.js            // 直近30日
 *   node --experimental-sqlite scripts/diag-indeed-driver-titles.js --days 90  // 期間変更
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
const DAYS = parseInt(val('--days', '30'), 10);
const jst = ms => new Date(Date.now() + 9 * 3600 * 1000 + ms).toISOString().slice(0, 10);
const since = jst(-(DAYS - 1) * 86400000);
const today = jst(0);
const pct = (n, d) => (d > 0 ? (100 * n / d).toFixed(1) + '%' : '−');

const rows = db.prepare(`
  SELECT job_title, is_duplicate, status, company
  FROM applicants
  WHERE media = 'indeed'
    AND (job_title LIKE '%ドライバー%' OR job_title LIKE '%運転%')
    AND substr(applied_at,1,10) >= ? AND substr(applied_at,1,10) <= ?
`).all(since, today);

const byTitle = {};
for (const r of rows) {
  const t = r.job_title || '(空)';
  byTitle[t] = byTitle[t] || { total: 0, valid: 0, inprog: 0, companies: new Set() };
  byTitle[t].total++;
  byTitle[t].companies.add(r.company);
  if (r.is_duplicate === 0) {
    byTitle[t].valid++;
    if (r.status === '対応中') byTitle[t].inprog++;
  }
}

const ranked = Object.entries(byTitle).sort((a, b) => b[1].valid - a[1].valid);

console.log(`\n■ Indeed経由・ドライバー系職種 応募状況（直近${DAYS}日: ${since}〜${today}）\n`);
console.log('  ' + '求人タイトル(自由記述)'.padEnd(45) + '応募'.padStart(6) + '有効応募'.padStart(9) + '有効応募率'.padStart(11) + '対応中'.padStart(8) + '対応移行率'.padStart(11) + '  会社');
for (const [title, v] of ranked) {
  console.log(
    '  ' + title.padEnd(45) +
    String(v.total).padStart(6) +
    String(v.valid).padStart(9) +
    pct(v.valid, v.total).padStart(11) +
    String(v.inprog).padStart(8) +
    pct(v.inprog, v.valid).padStart(11) +
    '  ' + [...v.companies].join(',')
  );
}
console.log(`\n※ 有効応募数が多い順。job_titleは自由記述のため表記ゆれで同一求人が複数行に分かれることがある。\n`);
