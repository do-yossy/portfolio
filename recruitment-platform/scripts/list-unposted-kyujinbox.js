#!/usr/bin/env node
'use strict';
/**
 * 求人ボックスへ「まだ投稿していない」求人の一覧（読み取り専用）。
 * 「🚀 求人ボックスに投稿する」ボタンを押すと実際に投稿される対象＝ここに出てくる求人。
 * 判定条件は server.js の投稿ボタンと同じ: is_published=1 かつ target_media に
 * 求人ボックス/kyujinbox を含み、kyujinbox_posted_at が未設定のもの。
 *
 * 1回のボタン押下で投稿されるのは会社ごとに最大25件（batchSize上限）なので、
 * 25件を超える会社は「次回投稿分」と「その次以降」を分けて表示する。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/list-unposted-kyujinbox.js
 *   node --experimental-sqlite scripts/list-unposted-kyujinbox.js --company sq
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const onlyCo = val('--company');
const BATCH_SIZE = 25;

const CONAME = { sq: 'SQ', bg: 'ビッグ(Bigeyes)', st: 'Style501', nl: 'NOWLIVE', bi: 'BrandideaL', nx: 'ネクサス' };

const rows = db.prepare(
  `SELECT company, title, location, job_type, target_media, created_at
     FROM jobs
    WHERE is_published = 1 AND kyujinbox_posted_at IS NULL${onlyCo ? ' AND company = ?' : ''}
    ORDER BY company, created_at`
).all(...(onlyCo ? [onlyCo] : []));

const unposted = rows.filter(r => {
  let m = []; try { m = JSON.parse(r.target_media || '[]'); } catch { /* noop */ }
  return m.includes('求人ボックス') || m.includes('kyujinbox');
});

if (unposted.length === 0) {
  console.log('\n求人ボックスへの投稿待ち求人はありません（全て投稿済み、または該当求人なし）。\n');
  process.exit(0);
}

const byCo = {};
for (const r of unposted) (byCo[r.company] = byCo[r.company] || []).push(r);

console.log(`\n==================== 求人ボックス 投稿待ち一覧（合計 ${unposted.length}件） ====================`);
console.log('※「🚀 求人ボックスに投稿する」ボタンを押すと、会社ごとに最大25件ずつ古い順に投稿されます。\n');

for (const co of Object.keys(byCo)) {
  const list = byCo[co];
  console.log(`【${CONAME[co] || co}】投稿待ち ${list.length}件`);
  list.forEach((r, i) => {
    const batch = Math.floor(i / BATCH_SIZE) + 1;
    const mark = i === 0 || i % BATCH_SIZE === 0 ? `  --- ${batch}回目のクリックで投稿される分 ---` : '';
    if (mark) console.log(mark);
    console.log(`  ${r.title}　［${r.location}］`);
  });
  console.log('');
}

console.log(`---- 合計 ${unposted.length}件（うち次回1クリックで投稿されるのは会社ごとに最大${BATCH_SIZE}件） ----\n`);
