'use strict';
// タイトル・キャッチコピー・説明文から場所を特定できる文言を削除

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const ALL_TARGETS = [
  'ロケ同行ドライバー', 'EC倉庫配送ドライバー', '夜勤配送ドライバー', '宅配便配送ドライバー',
  '機械オペレーター', 'コスメ製造',
  'DM制作ディレクター', 'グラフィックデザイナー',
  'ITエンジニア', 'エンジニア',
];

// タイトル・キャッチコピー用：インライン除去のみ（行ごと消さない）
function cleanInline(text) {
  if (!text) return text;
  let t = text;
  t = t.replace(/[^\s　！!（(【「]*駅\s*(すぐ|徒歩\s*[\d〜～]*\s*分?(以内|圏内)?|徒歩圏内)/g, '');
  t = t.replace(/リモートワーク制度あり[^。\n]*/g, '');
  t = t.replace(/[\(（][^)）]*[都道府県市区町村][^)）]*[\)）]/g, ''); // （地名）括弧
  t = t.replace(/[\s　・\/／|｜]+$/, '').trim(); // 末尾の区切り文字
  return t;
}

// 説明文用：行ごと削除（転勤なし・国内出張・禁煙・車通勤は残す）
function cleanDescription(text) {
  if (!text) return text;
  let t = text;
  t = t.replace(/^[^\n]*駅[^\n]*(すぐ|徒歩|圏内)[^\n]*$/gm, '');
  t = t.replace(/^[^\n]*リモートワーク制度あり[^\n]*$/gm, '');
  t = t.replace(/^[^\n]*勤務地[^\n]*$/gm, '');
  t = t.replace(/^[^\n]*アクセス[^\n]*$/gm, '');
  t = t.replace(/^◆[^\n]*$/gm, '');
  t = t.replace(/^[^\n]*職場まで[^\n]*通勤[^\n]*$/gm, '');
  t = t.replace(/^[・✔✓•※◇▶]\s*$/gm, ''); // 残骸記号
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

const jobs = db.prepare('SELECT id, title, catchcopy, description FROM jobs').all();
let updated = 0;

for (const job of jobs) {
  if (!ALL_TARGETS.some(t => job.title.includes(t))) continue;

  const newTitle = cleanInline(job.title || '');
  const newCatch = cleanInline(job.catchcopy || '');
  const newDesc  = cleanDescription(job.description || '');

  if (newTitle === (job.title || '') && newCatch === (job.catchcopy || '') && newDesc === (job.description || '')) {
    console.log(`- スキップ（変更なし）: ${job.title}`);
    continue;
  }

  db.prepare('UPDATE jobs SET title=?, catchcopy=?, description=?, updated_at=? WHERE id=?').run(
    newTitle, newCatch, newDesc, new Date().toISOString(), job.id
  );
  if (newTitle !== job.title) console.log(`  タイトル: "${job.title}" → "${newTitle}"`);
  console.log(`✓ 更新: ${newTitle || job.title}`);
  updated++;
}

console.log(`\n完了: ${updated}件更新`);
