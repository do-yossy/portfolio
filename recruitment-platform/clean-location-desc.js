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

function cleanText(text) {
  if (!text) return text;
  let t = text;

  // ── 行単位で削除（説明文向け） ──
  t = t.replace(/^[^\n]*駅[^\n]*(すぐ|徒歩|圏内)[^\n]*$/gm, '');    // ○○駅すぐ/徒歩/圏内 を含む行
  t = t.replace(/^[^\n]*リモートワーク制度あり[^\n]*$/gm, '');        // リモートワーク制度あり を含む行
  t = t.replace(/^[^\n]*勤務地[^\n]*$/gm, '');                        // 勤務地 を含む行
  t = t.replace(/^[^\n]*アクセス[^\n]*$/gm, '');                      // アクセス を含む行
  t = t.replace(/^◆[^\n]*$/gm, '');                                   // ◆箇条書き

  // ── インライン削除（タイトル・キャッチコピー向け） ──
  t = t.replace(/[^\s　！!（(（【]*駅\s*(すぐ|徒歩\s*[\d〜～]*\s*分?(以内|圏内)?|徒歩圏内)/g, '');
  t = t.replace(/リモートワーク制度あり[^。\n]*/g, '');
  t = t.replace(/勤務地[^\s　、。\n]*/g, '');

  // ── 残骸の記号・連続空行を整理 ──
  t = t.replace(/^[・✔✓•※◇▶]\s*$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

const jobs = db.prepare('SELECT id, title, catchcopy, description FROM jobs').all();
let updated = 0;

for (const job of jobs) {
  if (!ALL_TARGETS.some(t => job.title.includes(t))) continue;

  const newTitle    = cleanText(job.title   || '');
  const newCatch    = cleanText(job.catchcopy || '');
  const newDesc     = cleanText(job.description || '');

  if (newTitle === (job.title || '') && newCatch === (job.catchcopy || '') && newDesc === (job.description || '')) {
    console.log(`- スキップ（変更なし）: ${job.title}`);
    continue;
  }

  db.prepare('UPDATE jobs SET title=?, catchcopy=?, description=?, updated_at=? WHERE id=?').run(
    newTitle, newCatch, newDesc, new Date().toISOString(), job.id
  );
  console.log(`✓ 更新: ${job.title}`);
  updated++;
}

console.log(`\n完了: ${updated}件更新`);
