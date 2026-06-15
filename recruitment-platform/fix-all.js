'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// ── 正しいタイトルを job_type で決定（スクリプトが壊した分の復元）──
const CORRECT_TITLES = {
  'グラフィックデザイナー':  'グラフィックデザイナー',
  'DM制作ディレクター':      'DM制作ディレクター',
  'ITエンジニア':            'ITエンジニア',
  '機械オペレーター':        '機械オペレーター',
  'コスメ製造':              'コスメ製造スタッフ',
  'ロケ同行ドライバー':      'ロケ同行ドライバー',
  'EC倉庫配送ドライバー':    'EC倉庫配送ドライバー',
  '夜勤配送ドライバー':      '夜勤配送ドライバー（倉庫業務あり）',
  '宅配便配送ドライバー':    '宅配便配送ドライバー',
};

// ── 削除するフレーズ（説明文・キャッチのみ。タイトルは触らない）──
const REMOVE_PHRASES = [
  '・鴫野駅すぐ', '・鴫野駅徒歩圏内', '鴫野駅徒歩圏内',
  '・梅田駅すぐ', '梅田駅 徒歩5分以内', '梅田駅徒歩5分以内', '梅田駅徒歩5分',
  '・リモートワーク制度あり', '✔ 梅田駅徒歩5分', '✔ リモートワーク制度あり',
  '※リモートワーク制度あり（週2〜3日を目安）',
  '新宿駅 徒歩圏内', '✔ 新宿駅徒歩圏内', '新宿駅徒歩圏内',
];

function removePhrases(text) {
  if (!text) return text;
  let t = text;
  for (const p of REMOVE_PHRASES) t = t.split(p).join('');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

const jobs = db.prepare('SELECT id, title, job_type, catchcopy, description FROM jobs').all();
let fixed = 0;

for (const job of jobs) {
  const correctTitle = CORRECT_TITLES[job.job_type];
  const newTitle = correctTitle || job.title || '';
  const newCatch = removePhrases(job.catchcopy || '');
  const newDesc  = removePhrases(job.description || '');

  const titleChanged = correctTitle && newTitle !== job.title;
  const catchChanged = newCatch !== (job.catchcopy || '');
  const descChanged  = newDesc  !== (job.description || '');

  if (!titleChanged && !catchChanged && !descChanged) continue;

  db.prepare('UPDATE jobs SET title=?, catchcopy=?, description=?, updated_at=? WHERE id=?').run(
    newTitle, newCatch, newDesc, new Date().toISOString(), job.id
  );
  if (titleChanged) console.log(`  タイトル: "${job.title}" → "${newTitle}"`);
  console.log(`✓ 更新: ${newTitle}`);
  fixed++;
}

console.log(`\n完了: ${fixed}件`);
