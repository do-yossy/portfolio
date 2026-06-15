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

// ドライバー系の求人タイトル
const DRIVER_TITLES = [
  'ロケ同行ドライバー',
  'EC倉庫配送ドライバー',
  '夜勤配送ドライバー',
  '宅配便配送ドライバー',
];

// 機械オペレーター・コスメ製造の勤務地（相模原・多摩エリア）
const KANTO_LOCATIONS = [
  '神奈川県相模原市中央区南橋本',
  '東京都町田市原町田',
  '東京都八王子市明神町',
  '東京都日野市大坂上',
  '東京都昭島市田中町',
  '東京都福生市福生',
  '東京都立川市柴崎町',
  '東京都府中本町',
  '東京都武蔵野市',
  '東京都杉並区',
  '東京都中野区中野',
  '東京都世田谷区松原',
];

const KANTO_TITLES = [
  '機械オペレーター',
  'コスメ製造',
];

// DM制作ディレクター・グラフィックデザイナーの勤務地（東京広域）
const TOKYO_LOCATIONS = [
  '東京都昭島市田中町',
  '東京都立川市柴崎町',
  '東京都府中本町',
  '東京都武蔵野市',
  '東京都杉並区',
  '東京都中野区中野',
  '東京都世田谷区松原',
  '東京都目黒区上目黒',
  '東京都渋谷区',
  '東京都新宿区',
  '東京都豊島区南池袋',
  '東京都千代田区飯田橋',
  '東京都北区',
  '東京都板橋区成増',
];

const TOKYO_TITLES = [
  'DM制作ディレクター',
  'グラフィックデザイナー',
];

const jobs = db.prepare('SELECT id, title FROM jobs').all();
let updated = 0;
for (const job of jobs) {
  if (DRIVER_TITLES.some(t => job.title.includes(t))) {
    db.prepare('UPDATE jobs SET locations=?, location=? WHERE id=?').run(
      JSON.stringify(DRIVER_LOCATIONS),
      '複数拠点（選択制）',
      job.id
    );
    console.log(`✓ ドライバー: ${job.title}`);
    updated++;
  } else if (KANTO_TITLES.some(t => job.title.includes(t))) {
    const cleanTitle = job.title.replace(/[\(（][^)）]+[\)）]/g, '').trim();
    db.prepare('UPDATE jobs SET locations=?, location=?, title=? WHERE id=?').run(
      JSON.stringify(KANTO_LOCATIONS),
      '複数拠点（選択制）',
      cleanTitle,
      job.id
    );
    console.log(`✓ 関東: "${job.title}"${cleanTitle !== job.title ? ` → "${cleanTitle}"` : ''}`);
    updated++;
  } else if (TOKYO_TITLES.some(t => job.title.includes(t))) {
    const cleanTitle = job.title.replace(/[\(（][^)）]+[\)）]/g, '').trim();
    db.prepare('UPDATE jobs SET locations=?, location=?, title=? WHERE id=?').run(
      JSON.stringify(TOKYO_LOCATIONS),
      '複数拠点（選択制）',
      cleanTitle,
      job.id
    );
    console.log(`✓ 東京: "${job.title}"${cleanTitle !== job.title ? ` → "${cleanTitle}"` : ''}`);
    updated++;
  }
}
console.log(`\nDone: ${updated} jobs updated.`);
