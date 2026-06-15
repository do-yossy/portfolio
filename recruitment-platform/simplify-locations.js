'use strict';
// 勤務地フィールドを簡略化: 市区町村以下を削除し都道府県レベルに統一
// 主力求人（ドライバー・IT等）は「複数拠点（選択制）」に設定

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const PREFS = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];

// 主力求人のタイトルパターン（複数拠点（選択制）に設定する）
const MULTI_LOC_PATTERNS = [
  'ITエンジニア', 'グラフィックデザイナー', 'DM制作ディレクター',
  'コスメ製造', 'ロケ同行ドライバー', 'EC倉庫配送ドライバー',
  '夜勤配送ドライバー', '宅配便配送ドライバー', '機械オペレーター',
];

function simplifyLocation(loc, title) {
  if (!loc) return loc;
  if (loc === '複数拠点（選択制）' || loc === '複数拠点（選択制・車通勤可）') return loc;

  // 主力求人 → 複数拠点
  if (MULTI_LOC_PATTERNS.some(p => (title || '').includes(p))) {
    return '複数拠点（選択制）';
  }

  // 都道府県だけを抽出
  const pref = PREFS.find(p => (loc || '').startsWith(p));
  if (pref) return pref;

  return loc;
}

const jobs = db.prepare('SELECT id, title, location FROM jobs').all();
let updated = 0;

for (const job of jobs) {
  const newLoc = simplifyLocation(job.location, job.title);
  if (newLoc === job.location) continue;

  db.prepare('UPDATE jobs SET location=?, updated_at=? WHERE id=?')
    .run(newLoc, new Date().toISOString(), job.id);
  console.log(`✓ ${job.title.slice(0, 30)} : "${job.location}" → "${newLoc}"`);
  updated++;
}

console.log(`\n完了: ${updated}件更新`);
