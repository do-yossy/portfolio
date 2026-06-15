'use strict';
// 主力求人（★タイトル）の説明文から単独住所行を削除

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const jobs = db.prepare("SELECT id, title, description FROM jobs WHERE title LIKE '%★'").all();

let updated = 0;
for (const job of jobs) {
  let d = job.description || '';

  // 単独の住所行を削除（助詞「の・で・から」等を含まない純粋な住所行）
  d = d.replace(/^[^\n　]*[都道府県][^\nのでからまでをにはがも。、！？「」]+[市区町村郡][^\nのでからまでをにはがも。、！？「」]{0,20}（?）?[\r]?$/gm, '');
  // 空カッコ残骸を削除
  d = d.replace(/（\s*）/g, '').replace(/\(\s*\)/g, '');
  // 連続空行を整理
  d = d.replace(/\n{3,}/g, '\n\n').trim();

  if (d === (job.description || '')) continue;

  db.prepare('UPDATE jobs SET description=?, updated_at=? WHERE id=?')
    .run(d, new Date().toISOString(), job.id);
  console.log(`✓ 更新: ${job.title.slice(0, 40)}`);
  updated++;
}
console.log(`\n完了: ${updated}件`);
