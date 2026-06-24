'use strict';
// Googleしごと検索 掲載修正スクリプト
// 有効期限切れ・未設定の公開中求人のexpires_atとpublished_atを更新する
// 冪等: 何度実行しても安全

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const now = new Date().toISOString();
const newExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const today = now.slice(0, 10);

// 有効期限切れ・未設定の公開中求人を取得
const expired = db.prepare(
  `SELECT id, title, expires_at FROM jobs WHERE is_published=1 AND (expires_at IS NULL OR expires_at < ?)`
).all(today);

console.log(`有効期限切れ・未設定: ${expired.length}件`);

if (expired.length === 0) {
  console.log('修正対象なし');
  process.exit(0);
}

// expires_at を30日後に延長、published_at を今日に更新（Google新着扱い）
const update = db.prepare(
  `UPDATE jobs SET expires_at=?, published_at=?, updated_at=? WHERE id=?`
);

let fixed = 0;
for (const job of expired) {
  update.run(newExpires, now, now, job.id);
  console.log(`✓ 修正: ${job.title.slice(0, 50)}`);
  fixed++;
}

console.log(`\n完了: ${fixed}件修正（有効期限を30日延長・掲載日を本日に更新）`);
console.log(`\n次のステップ:`);
console.log(`1. Google Search Console でサイトマップを再送信`);
console.log(`2. 求人ページURL を Google Search Console でインデックス登録リクエスト`);
console.log(`3. 数日〜1週間でGoogleしごと検索に反映`);
