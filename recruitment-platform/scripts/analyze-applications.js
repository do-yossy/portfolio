#!/usr/bin/env node
'use strict';
/**
 * 媒体別 応募数の分析（お盆前後の増減つき）
 * - 媒体別 合計 / 日別推移 / 会社×媒体クロス / 期間比較（お盆 vs 直前）
 * - 重複(is_duplicate=1)は除外してカウント（純粋な応募数）。archived は含める（過去分も応募実績）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/analyze-applications.js
 *   node --experimental-sqlite scripts/analyze-applications.js --days 35
 *   node --experimental-sqlite scripts/analyze-applications.js --company sq
 *   期間比較の境目を変える: --obon-start 2026-08-10 --obon-end 2026-08-17 --base-start 2026-08-03 --base-end 2026-08-09
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const DAYS = parseInt(val('--days', '28'), 10);
const CO = val('--company', null);

const MEDIA_NAME = { indeed: 'Indeed', kyujinbox: '求人ボックス', stanby: 'スタンバイ', google: 'Googleしごと', engage: 'engage', seniorjob: 'シニアジョブ', '': '(未設定)' };
const jst = ms => new Date(Date.now() + 9 * 3600 * 1000 + ms).toISOString().slice(0, 10);
const TODAY = jst(0);
const OBON_S = val('--obon-start', jst(-4 * 86400000));   // 既定: 直近5日をお盆側
const OBON_E = val('--obon-end', TODAY);
const BASE_S = val('--base-start', jst(-11 * 86400000));  // 既定: その前5日を平常側
const BASE_E = val('--base-end', jst(-5 * 86400000));

const coCond = CO ? ` AND company='${CO.replace(/'/g, '')}'` : '';
const D = `substr(applied_at,1,10)`;
const base = `FROM applicants WHERE is_duplicate=0 AND applied_at IS NOT NULL AND applied_at!=''${coCond}`;

const pad = (s, n) => String(s).padEnd(n, ' ');
const padL = (s, n) => String(s).padStart(n, ' ');

console.log(`\n==================== 応募数分析${CO ? `（会社=${CO}）` : ''}  基準日(JST)=${TODAY} ====================`);

// ① 媒体別 合計（直近DAYS日）
const sinceN = jst(-(DAYS - 1) * 86400000);
const m1 = db.prepare(`SELECT media, COUNT(*) c ${base} AND ${D} >= ? GROUP BY media ORDER BY c DESC`).all(sinceN);
const totalN = m1.reduce((a, r) => a + r.c, 0);
console.log(`\n【① 媒体別 応募数（直近${DAYS}日: ${sinceN}〜${TODAY}）】 合計 ${totalN}件`);
for (const r of m1) console.log(`  ${pad(MEDIA_NAME[r.media] ?? r.media, 12)} ${padL(r.c, 5)}  (${totalN ? Math.round(r.c / totalN * 100) : 0}%)`);

// ② 会社×媒体 クロス（直近DAYS日）
const cx = db.prepare(`SELECT company, media, COUNT(*) c ${base} AND ${D} >= ? GROUP BY company, media`).all(sinceN);
const companies = [...new Set(cx.map(r => r.company))].sort();
const medias = [...new Set(cx.map(r => r.media))];
console.log(`\n【② 会社 × 媒体 クロス（直近${DAYS}日）】`);
console.log('  ' + pad('会社', 6) + medias.map(m => padL(MEDIA_NAME[m] ?? m, 10)).join('') + padL('計', 8));
for (const co of companies) {
  const row = medias.map(m => (cx.find(r => r.company === co && r.media === m) || {}).c || 0);
  const sum = row.reduce((a, b) => a + b, 0);
  console.log('  ' + pad(co, 6) + row.map(v => padL(v, 10)).join('') + padL(sum, 8));
}

// ③ 日別推移（直近DAYS日 × 媒体）
const daily = db.prepare(`SELECT ${D} d, media, COUNT(*) c ${base} AND ${D} >= ? GROUP BY d, media`).all(sinceN);
const days = [];
for (let i = DAYS - 1; i >= 0; i--) days.push(jst(-i * 86400000));
console.log(`\n【③ 日別 応募数（直近${DAYS}日）】`);
console.log('  ' + pad('日付', 12) + medias.map(m => padL(MEDIA_NAME[m] ?? m, 8)).join('') + padL('計', 7));
for (const d of days) {
  const row = medias.map(m => (daily.find(r => r.d === d && r.media === m) || {}).c || 0);
  const sum = row.reduce((a, b) => a + b, 0);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(d + 'T00:00:00+09:00').getDay()];
  console.log('  ' + pad(`${d}(${wd})`, 12) + row.map(v => padL(v || '.', 8)).join('') + padL(sum, 7));
}

// ④ 期間比較（お盆 vs 直前）
function periodByMedia(s, e) {
  return db.prepare(`SELECT media, COUNT(*) c ${base} AND ${D} >= ? AND ${D} <= ? GROUP BY media`).all(s, e);
}
const dayspan = (s, e) => Math.round((new Date(e) - new Date(s)) / 86400000) + 1;
const ob = periodByMedia(OBON_S, OBON_E), bs = periodByMedia(BASE_S, BASE_E);
const obN = dayspan(OBON_S, OBON_E), bsN = dayspan(BASE_S, BASE_E);
const obTot = ob.reduce((a, r) => a + r.c, 0), bsTot = bs.reduce((a, r) => a + r.c, 0);
console.log(`\n【④ 期間比較】  お盆側 ${OBON_S}〜${OBON_E}(${obN}日) vs 直前 ${BASE_S}〜${BASE_E}(${bsN}日)`);
console.log('  ' + pad('媒体', 12) + padL('お盆/日', 9) + padL('直前/日', 9) + padL('増減', 8));
const allM = [...new Set([...ob, ...bs].map(r => r.media))];
for (const m of allM) {
  const o = (ob.find(r => r.media === m) || {}).c || 0;
  const b = (bs.find(r => r.media === m) || {}).c || 0;
  const oa = (o / obN), ba = (b / bsN);
  const pct = ba ? Math.round((oa - ba) / ba * 100) : (oa ? 999 : 0);
  console.log('  ' + pad(MEDIA_NAME[m] ?? m, 12) + padL(oa.toFixed(1), 9) + padL(ba.toFixed(1), 9) + padL((pct >= 0 ? '+' : '') + pct + '%', 8));
}
const oaT = obTot / obN, baT = bsTot / bsN;
const pctT = baT ? Math.round((oaT - baT) / baT * 100) : 0;
console.log('  ' + pad('── 合計 ──', 12) + padL(oaT.toFixed(1), 9) + padL(baT.toFixed(1), 9) + padL((pctT >= 0 ? '+' : '') + pctT + '%', 8));
console.log(`\n※ 「/日」は1日あたり平均応募数（期間日数で割った値）。増減はお盆側が直前比で何%か。`);
console.log('※ 重複は除外・確定した applied_at ベース。媒体別掲載数や単価は job_metrics / 求人ボックス管理画面と併せて見ると精度が上がります。\n');
