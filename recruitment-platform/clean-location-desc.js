'use strict';
// 各ドライバー・機械オペレーター求人の説明文から
// 特定の勤務地・アクセス記載を削除するスクリプト

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const TARGET_TITLES = [
  'ロケ同行ドライバー',
  'EC倉庫配送ドライバー',
  '夜勤配送ドライバー',
  '宅配便配送ドライバー',
  '機械オペレーター',
  'ITエンジニア',
  'エンジニア',
  'グラフィックデザイナー',
  'DM制作ディレクター',
];

// 削除対象の行パターン（転勤なし・国内出張・禁煙・車通勤は残す）
const REMOVE_PATTERNS = [
  /^[^\n]*勤務地[^\n]*$/gm,              // 勤務地を含む行
  /^[^\n]*アクセス[^\n]*$/gm,            // アクセスを含む行
  /^◆.+$/gm,                             // ◆箇条書き（路線情報等）
  /^[^\n]*駅[^\n]*(すぐ|徒歩|圏内)[^\n]*$/gm,  // ○○駅すぐ/徒歩/圏内を含む行
  /^[^\n]*リモートワーク制度あり[^\n]*$/gm,     // リモートワーク制度ありを含む行
  /^[^\n]*職場まで[^\n]*通勤[^\n]*$/gm,  // 職場まで〜通勤を含む行
];

const jobs = db.prepare('SELECT id, title, description FROM jobs').all();
let updated = 0;

for (const job of jobs) {
  if (!TARGET_TITLES.some(t => job.title.includes(t))) continue;

  let desc = job.description;
  for (const pat of REMOVE_PATTERNS) {
    desc = desc.replace(pat, '');
  }
  // 連続する空行を1行に圧縮
  desc = desc.replace(/\n{3,}/g, '\n\n').trim();

  if (desc === job.description) {
    console.log(`- スキップ（変更なし）: ${job.title}`);
    continue;
  }

  db.prepare('UPDATE jobs SET description=?, updated_at=? WHERE id=?').run(
    desc,
    new Date().toISOString(),
    job.id
  );
  console.log(`✓ 更新: ${job.title}`);
  updated++;
}

console.log(`\n完了: ${updated}件更新`);
