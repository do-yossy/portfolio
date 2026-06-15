'use strict';
// タイトルが空になった求人を job_type から復元する

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const jobs = db.prepare('SELECT id, title, job_type, catchcopy, description FROM jobs').all();

console.log('=== タイトルが空の求人 ===');
let restored = 0;
for (const job of jobs) {
  if (job.title && job.title.trim() !== '') continue;

  // 説明文の先頭からヒントを取得
  const descHint = (job.description || '').trim().split('\n')[0].slice(0, 40);
  console.log(`\n職種: ${job.job_type}`);
  console.log(`キャッチ: ${job.catchcopy || '(なし)'}`);
  console.log(`説明冒頭: ${descHint}`);

  // job_type をタイトルとして復元
  const newTitle = job.job_type || '(要設定)';
  db.prepare('UPDATE jobs SET title=?, updated_at=? WHERE id=?').run(
    newTitle, new Date().toISOString(), job.id
  );
  console.log(`→ タイトルを "${newTitle}" に復元しました`);
  restored++;
}

if (restored === 0) {
  console.log('タイトルが空の求人はありませんでした。');
}
console.log(`\n完了: ${restored}件復元`);
console.log('\n※ 管理画面(/admin/jobs)から正式なタイトルに編集してください。');
