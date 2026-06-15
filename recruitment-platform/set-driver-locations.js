'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// Make sure locations column exists
try { db.exec("ALTER TABLE jobs ADD COLUMN locations TEXT DEFAULT '[]'"); } catch {}

const DRIVER_LOCATIONS = [
  '兵庫県尼崎市潮江',
  '兵庫県神戸市東灘区深江北町',
  '京都府京都市伏見区桃山筒井伊賀西町',
  '大阪府大阪市淀川区十三東',
  '大阪府池田市石橋',
  '大阪府茨木市永代町',
  '大阪府高槻市城北町',
  '大阪府守口市大日町',
  '大阪府大阪市城東区古市',
  '大阪府大阪市城東区鴫野西',
  '大阪府東大阪市川俣',
  '大阪府八尾市龍華町',
  '大阪府大阪市東淀川区東淡路',
  '大阪府大阪市北区芝田',
  '大阪府大阪市中央区難波',
  '大阪府堺市北区中百舌鳥町',
  '大阪府堺市堺区戎島町',
  '大阪府堺市西区津久野町',
  '東京都豊島区南池袋',
  '東京都新宿区新宿',
  '東京都千代田区有楽町',
  '東京都墨田区横綱',
  '東京都荒川区南千住',
];

const TARGET_TITLES = [
  'ロケ同行ドライバー',
  'EC倉庫配送ドライバー',
  '夜勤配送ドライバー',
  '宅配便配送ドライバー',
  '機械オペレーター',
];

const jobs = db.prepare('SELECT id, title FROM jobs').all();
let updated = 0;
for (const job of jobs) {
  if (TARGET_TITLES.some(t => job.title.includes(t))) {
    // 機械オペレーターのタイトルから「（相模原）」などの地名括弧を除去
    const cleanTitle = job.title.replace(/[\(（][^)）]*[都道府県市区町村][^)）]*[\)）]/g, '').trim();
    db.prepare('UPDATE jobs SET locations=?, location=?, title=? WHERE id=?').run(
      JSON.stringify(DRIVER_LOCATIONS),
      DRIVER_LOCATIONS[0],
      cleanTitle,
      job.id
    );
    console.log(`✓ Updated: "${job.title}"${cleanTitle !== job.title ? ` → title: "${cleanTitle}"` : ''}`);
    updated++;
  }
}
console.log(`\nDone: ${updated} jobs updated.`);
