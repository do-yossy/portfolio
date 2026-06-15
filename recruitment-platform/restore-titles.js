'use strict';
// タイトルが消えた求人を復元する

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// job_type → 正式タイトルのマッピング（場所情報なし）
const TITLE_MAP = {
  'グラフィックデザイナー':  'グラフィックデザイナー',
  'DM制作ディレクター':      'DM制作ディレクター',
  'ITエンジニア':            'ITエンジニア',
  'エンジニア':              'ITエンジニア',
  '機械オペレーター':        '機械オペレーター',
  'コスメ製造':              'コスメ製造スタッフ',
  'ロケ同行ドライバー':      'ロケ同行ドライバー',
  'EC倉庫配送ドライバー':    'EC倉庫配送ドライバー',
  '夜勤配送ドライバー':      '夜勤配送ドライバー（倉庫業務あり）',
  '宅配便配送ドライバー':    '宅配便配送ドライバー',
  '製造・物流':              '製造・物流スタッフ',
};

const jobs = db.prepare('SELECT id, title, job_type FROM jobs').all();
let fixed = 0;

for (const job of jobs) {
  const titleOk = job.title && job.title.trim().length >= 4;
  if (titleOk) continue; // 問題なし

  const newTitle = TITLE_MAP[job.job_type] || job.job_type || '要設定';
  db.prepare('UPDATE jobs SET title=?, updated_at=? WHERE id=?').run(
    newTitle, new Date().toISOString(), job.id
  );
  console.log(`✓ 復元: [${job.job_type}] → "${newTitle}"`);
  fixed++;
}

if (fixed === 0) console.log('空タイトルの求人はありませんでした。');
console.log(`\n完了: ${fixed}件復元`);
