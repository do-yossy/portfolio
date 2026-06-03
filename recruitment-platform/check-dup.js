'use strict';
// CSVの電話番号がDBに既に存在するか確認するスクリプト
const { DatabaseSync } = require('node:sqlite');
const { normalizePhone, normalizeEmail } = require('./normalize');
const db = new DatabaseSync('data/recruitment.db');

// 今回送られたIndeed CSVの電話番号サンプル
const samples = [
  { name: '赤松 伸',       phone: '+81 90 1144 3365' },
  { name: '井上 繁則',     phone: '+81 90 1227 1212' },
  { name: '清水 翔太',     phone: '+81 80 4370 5230' },
  { name: '巽 裕也',       phone: '+81 90 9713 8808' },
  { name: '山浦 秀寛',     phone: '+81 70 8557 2789' },
];

const total = db.prepare('SELECT COUNT(*) as c FROM applicants').get().c;
console.log('DB総件数:', total);
console.log('---');

for (const s of samples) {
  // mapCSVRow と同じ整形: '+81 90...' → 0始まり
  let raw = s.phone.replace(/^'+/, '').replace(/[\s\-ー−]/g, '');
  if (raw.startsWith('+81')) raw = '0' + raw.slice(3);
  if (/^[789]/.test(raw)) raw = '0' + raw;
  const formatted = raw.replace(/^(\d{2,3})(\d{4})(\d{4})$/, '$1-$2-$3');
  const nPhone = normalizePhone(formatted);

  const hit = db.prepare("SELECT name, phone, created_at FROM applicants WHERE normalized_phone = ? LIMIT 1").get(nPhone);
  if (hit) {
    console.log(`【重複】${s.name} (${nPhone}) → 既存: ${hit.name} / ${hit.phone} / 登録日 ${hit.created_at}`);
  } else {
    console.log(`【新規】${s.name} (${nPhone}) → DB内に該当なし`);
  }
}
db.close();
