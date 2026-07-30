'use strict';
/*
 * 過去応募者を架電リストに1件追加（富岡 祐一 / 求職者ID 117124）
 * --------------------------------------------------------------
 * status='新規' / is_archived=0 で登録し、架電リストに表示させる。
 * 冪等: notes に「求職者ID:117124」を含む既存レコードがあればスキップ。
 *
 * 実行: node --experimental-sqlite scripts/add-applicant-tomioka.js
 * ※ サーバーを止めずに実行してOK（追加後は掲載管理/架電リストで確認）。
 */
const { db, Applicants } = require('../db');

const SEEKER_ID = '117124';

// 既存チェック（冪等）
const exists = db
  .prepare(`SELECT id, name FROM applicants WHERE notes LIKE ?`)
  .get(`%求職者ID:${SEEKER_ID}%`);
if (exists) {
  console.log(`⏭  既に登録済みのためスキップ: ${exists.name}（${exists.id}）`);
  process.exit(0);
}

const notes = [
  `求職者ID:${SEEKER_ID} / 採用決定費:8万円(税別)`,
  `保有資格:8トン限定中型自動車免許、危険物取扱者(乙種)、普通自動車免許(保有)`,
  `希望職種:タクシードライバー、運送ドライバー(中・長距離)、トレーラー(牽引)ドライバー、ダンプドライバー、役員運転手、送迎ドライバー、収集運搬ドライバー、回送ドライバー、新聞配達・集金、バス運転手・バス乗務員、電車運転士・車掌・機関士・航海士、構内倉庫作業・倉庫管理、運行管理、運送現場作業員、セールスドライバー・配送・宅配`,
  `希望勤務地:大阪府(大阪市各区・堺市ほか府内全域)`,
  `経歴:お弁当の浜の家 営業(2019年〜2025年)`,
  `※電話番号未提供(要確認)`,
].join('\n');

const created = Applicants.create({
  name: '富岡 祐一',
  furigana: '',                 // 未設定
  phone: '',                    // ★未提供（架電前に要入力）
  email: '',
  age: 59,
  gender: '男性',
  address: '〒591-8002 大阪府堺市北区北花田町',
  birthDate: '',                // 生年月日 未設定
  currentJob: '',
  jobTitle: '',
  experience: '営業（お弁当の浜の家 / 2019年〜2025年）',
  education: '',                // 未設定
  workLocation: '大阪府（大阪市各区・堺市ほか府内全域）',
  sourceMedia: '過去応募',
  status: '新規',               // 架電リストに表示
  isImported: 1,
  isArchived: 0,
  allowEmptyDate: true,         // 本日の新規応募に誤カウントさせない
  notes,
});

console.log(`✅ 架電リストに追加しました: ${created.name}（ID:${created.id} / ${created.age}歳 / ${created.gender}）`);
console.log(`   住所: ${created.address}`);
console.log(`   ⚠️ 電話番号が未提供です。架電前に掲載管理から電話番号を入力してください。`);
