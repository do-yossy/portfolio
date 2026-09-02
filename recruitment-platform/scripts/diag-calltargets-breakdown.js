#!/usr/bin/env node
'use strict';
/**
 * 「本日架電対象（全体）」の数字が架電リストの見た目件数と合わない原因を内訳で診断する。
 * - 架電リスト(is_archived=0)の総数と、ステータス別内訳
 * - 「本日架電対象」の集計条件（新規/不通/架電済(不通)/対応中）でのカウント
 * - どのステータスが集計から外れているか（＝差分の正体）
 * 会社別も表示。更新はしない（読み取り専用）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/diag-calltargets-breakdown.js
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

// 集計に使われている「架電対象」ステータス（db.js todayCallTargets と同じ想定）
const ACTIVE_DBJS = ['新規', '不通', '対応中'];
// 実データで使われうる同義ステータス（server.js のドロップダウン）
const ACTIVE_ALL = ['新規', '不通', '架電済(不通)', '対応中'];

const list = db.prepare(`SELECT status, COUNT(*) c FROM applicants WHERE is_archived = 0 GROUP BY status ORDER BY c DESC`).all();
const listTotal = list.reduce((a, r) => a + r.c, 0);

console.log(`\n■ 架電リスト（is_archived=0）総数: ${listTotal}件`);
console.log('  ステータス別内訳:');
for (const r of list) console.log(`    ${String(r.c).padStart(4)}  ${r.status || '(空)'}`);

const cnt = (arr) => db.prepare(`SELECT COUNT(*) c FROM applicants WHERE is_archived = 0 AND status IN (${arr.map(() => '?').join(',')})`).get(...arr).c;
const nowDbjs = cnt(ACTIVE_DBJS);
const nowAll = cnt(ACTIVE_ALL);

console.log(`\n■ 「本日架電対象」カウント`);
console.log(`    現在の集計条件 [${ACTIVE_DBJS.join('/')}] = ${nowDbjs}件   ← いま画面に出ている数字`);
console.log(`    同義を含めた条件 [${ACTIVE_ALL.join('/')}] = ${nowAll}件   ← 「架電済(不通)」も数えた場合`);

const excluded = list.filter(r => !ACTIVE_ALL.includes(r.status));
console.log(`\n■ 集計から外れているステータス（架電リストには居るが本日架電対象に入らない）`);
if (excluded.length === 0) console.log('    なし');
for (const r of excluded) console.log(`    ${String(r.c).padStart(4)}  ${r.status || '(空)'}`);

// 会社別（現条件）
const byCo = db.prepare(`SELECT company, COUNT(*) c FROM applicants WHERE is_archived = 0 AND status IN (${ACTIVE_DBJS.map(() => '?').join(',')}) GROUP BY company ORDER BY c DESC`).all(...ACTIVE_DBJS);
console.log(`\n■ 会社別（現在の集計条件）`);
for (const r of byCo) console.log(`    ${String(r.c).padStart(4)}  ${r.company}`);

console.log(`\n判定の目安:`);
console.log(`  ・「架電済(不通)」が上の"外れている"に出ていれば → 集計条件のバグ（不通の表記ゆれ）。コード修正で解決。`);
console.log(`  ・「対応終了/終了/断られた/辞退/重複」が差分なら → それらは本来"架電対象外"。数え方の定義の問題。`);
console.log('');
