#!/usr/bin/env node
'use strict';
/**
 * ST（Style501）で「Indeedから取り込んだのに媒体がシニアジョブ(seniorjob)になっている応募者」を
 * Indeed(media='indeed') に修正するツール。
 * 新規応募ページ・媒体クロス集計は applicants.media で分類されるため、これを直せば集計も直る。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   ① まず対象を一覧表示（何も更新しない）:
 *      node --experimental-sqlite scripts/fix-st-indeed-media.js
 *   ② 最新2名を修正:
 *      node --experimental-sqlite scripts/fix-st-indeed-media.js --fix-latest 2
 *   ③ ID指定で修正（①で表示されたidを使用）:
 *      node --experimental-sqlite scripts/fix-st-indeed-media.js --ids <id1>,<id2>
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
function argVal(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}
const fixLatest = argVal('--fix-latest');
const idsArg    = argVal('--ids');

// ST かつ 媒体=シニアジョブ の応募者（新しい順）
const rows = db.prepare(
  `SELECT id, name, applied_at, created_at, media, source_media, is_imported, is_archived
     FROM applicants
    WHERE company = 'st' AND media = 'seniorjob'
    ORDER BY datetime(created_at) DESC, datetime(applied_at) DESC`
).all();

console.log(`\n■ ST × 媒体=シニアジョブ の応募者: ${rows.length}件\n`);
rows.forEach((r, i) => {
  console.log(`  [${i + 1}] id=${r.id}  ${r.name}  applied_at=${r.applied_at}  source_media=${r.source_media}  archived=${r.is_archived}`);
});

let targets = [];
if (idsArg) {
  const set = new Set(idsArg.split(',').map(s => s.trim()).filter(Boolean));
  targets = rows.filter(r => set.has(r.id));
} else if (fixLatest) {
  const n = Math.max(0, parseInt(fixLatest, 10) || 0);
  targets = rows.slice(0, n);
}

if (targets.length === 0) {
  console.log('\n（更新なし＝一覧表示のみ）');
  console.log('修正するには: node --experimental-sqlite scripts/fix-st-indeed-media.js --fix-latest 2');
  console.log('または      : node --experimental-sqlite scripts/fix-st-indeed-media.js --ids <id1>,<id2>\n');
  process.exit(0);
}

const upd = db.prepare(`UPDATE applicants SET media = 'indeed', source_media = 'Indeed' WHERE id = ?`);
let n = 0;
for (const t of targets) { n += upd.run(t.id).changes; console.log(`  ✅ 修正: ${t.name} (id=${t.id}) → media=indeed / source_media=Indeed`); }
console.log(`\n完了: ${n}件を Indeed に修正しました。新規応募ページ・媒体クロス集計にも即反映されます。\n`);
