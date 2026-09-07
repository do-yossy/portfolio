#!/usr/bin/env node
'use strict';
/**
 * 新着応募（applied_at=指定日、既定は本日JST）のうち、49歳以下が何人・何%かを出す（読み取り専用）。
 * 重複(is_duplicate=1)は除外。年齢が未入力の人数も別に示す（分母の扱いが変わるため）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/age-split-today.js                 // 本日(JST)
 *   node --experimental-sqlite scripts/age-split-today.js --date 2026-09-06
 *   node --experimental-sqlite scripts/age-split-today.js --company sq
 *   node --experimental-sqlite scripts/age-split-today.js --threshold 39  // しきい値を変える（既定49）
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
const THRESH = parseInt(val('--threshold', '49'), 10);

const coCond = CO ? ` AND company='${CO.replace(/'/g, '')}'` : '';
const rows = db.prepare(
  `SELECT name, age, company, media FROM applicants
    WHERE is_duplicate=0 AND substr(applied_at,1,10)=?${coCond}`
).all(DATE);

const total = rows.length;
const withAge = rows.filter(r => r.age !== null && r.age !== undefined && r.age !== '');
const noAge = total - withAge.length;
const under = withAge.filter(r => Number(r.age) <= THRESH);
const over = withAge.filter(r => Number(r.age) > THRESH);

console.log(`\n==================== ${DATE} の新着応募 年齢分析${CO ? `（会社=${CO}）` : ''} ====================`);
console.log(`\n■ 新着応募 合計: ${total}人（重複除く）`);
console.log(`  うち年齢入力あり: ${withAge.length}人 / 年齢未入力: ${noAge}人`);

if (withAge.length === 0) {
  console.log('\n（年齢が入力された応募者がいないため、比率を計算できません）\n');
  process.exit(0);
}

const pctOfAged   = (n) => (n / withAge.length * 100).toFixed(1);
const pctOfTotal  = (n) => (n / total * 100).toFixed(1);

console.log(`\n■ ${THRESH}歳以下 vs ${THRESH + 1}歳以上（年齢入力ありの中での比率）`);
console.log(`  ${THRESH}歳以下  : ${under.length}人 / ${withAge.length}人中 = ${pctOfAged(under.length)}%`);
console.log(`  ${THRESH + 1}歳以上  : ${over.length}人 / ${withAge.length}人中 = ${pctOfAged(over.length)}%`);

console.log(`\n■ 参考：新着応募 全体（未入力含む）に対する比率`);
console.log(`  ${THRESH}歳以下  : ${under.length}人 / 全${total}人中 = ${pctOfTotal(under.length)}%`);

// 年齢入力ありの一覧（内訳の目視確認用）
console.log(`\n■ 年齢入力ありの内訳一覧`);
withAge
  .sort((a, b) => Number(a.age) - Number(b.age))
  .forEach(r => console.log(`  ${r.name}  ${r.age}歳  [${r.company}/${r.media}]  ${Number(r.age) <= THRESH ? `${THRESH}歳以下` : `${THRESH + 1}歳以上`}`));

console.log('');
