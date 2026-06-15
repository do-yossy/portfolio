'use strict';
// 説明文・キャッチコピーから場所特定フレーズを削除する（タイトルは一切変更しない）

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// 削除するフレーズ（完全一致）
const REMOVE_PHRASES = [
  '・鴫野駅すぐ',
  '・鴫野駅徒歩圏内',
  '鴫野駅徒歩圏内',
  '・梅田駅すぐ',
  '梅田駅 徒歩5分以内',
  '梅田駅徒歩5分以内',
  '梅田駅徒歩5分',
  '・リモートワーク制度あり',
  '✔ 梅田駅徒歩5分',
  '✔ リモートワーク制度あり',
  '※リモートワーク制度あり（週2〜3日を目安）',
  '新宿駅 徒歩圏内',
  '✔ 新宿駅徒歩圏内',
  '新宿駅徒歩圏内',
];

function removePhrases(text) {
  if (!text) return text;
  let t = text;
  for (const phrase of REMOVE_PHRASES) {
    while (t.includes(phrase)) t = t.split(phrase).join('');
  }
  // 残った空行を整理
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

const jobs = db.prepare('SELECT id, title, catchcopy, description FROM jobs').all();
let updated = 0;

for (const job of jobs) {
  const newCatch = removePhrases(job.catchcopy || '');
  const newDesc  = removePhrases(job.description || '');

  if (newCatch === (job.catchcopy || '') && newDesc === (job.description || '')) continue;

  // タイトルは変更しない
  db.prepare('UPDATE jobs SET catchcopy=?, description=?, updated_at=? WHERE id=?').run(
    newCatch, newDesc, new Date().toISOString(), job.id
  );
  console.log(`✓ 更新: ${job.title}`);
  updated++;
}

console.log(`\n完了: ${updated}件`);
