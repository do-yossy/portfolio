'use strict';
// お送りいただいたCSVの電話番号・メールをDBから削除するスクリプト
const { DatabaseSync } = require('node:sqlite');
const { normalizePhone, normalizeEmail } = require('./normalize');
const db = new DatabaseSync('data/recruitment.db');

// 送付されたCSVに含まれていた全員のデータ
const csvRecords = [
  // 求人ボックス
  { name: '齋藤飛蝶',     phone: '07089791107',   email: 'hien34042@gmail.com' },
  // Indeed
  { name: '赤松 伸',       phone: '09011443365',   email: 'shintant012222eg9_5xf@indeedemail.com' },
  { name: '井上 繁則',     phone: '09012271212',   email: '0903maxmaxzfb54_7ej@indeedemail.com' },
  { name: '村山 悠人',     phone: '08061168644',   email: 'harutoon0297_vea@indeedemail.com' },
  { name: '平山 幸',       phone: '09092160405',   email: 'midoridaisuki06116_ztv@indeedemail.com' },
  { name: '薮上 朋希',     phone: '08014848670',   email: 'yabutomo773wua_ezv@indeedemail.com' },
  { name: '清水 翔太',     phone: '08043705230',   email: 'lovet5foevercxueo_pzm@indeedemail.com' },
  { name: '山本 貴文',     phone: '09036044640',   email: 'tabo1104189_dir@indeedemail.com' },
  { name: 'ライ パルバティ', phone: '07033328362', email: 'raiparubatib3h8z_7jv@indeedemail.com' },
  { name: '巽 裕也',       phone: '09097138808',   email: 'hellohiro8086_pw5@indeedemail.com' },
  { name: '佐藤 和男',     phone: '09064713223',   email: 'kazufuku01yasfm_7p5@indeedemail.com' },
  { name: '西本 義弘',     phone: '09046393271',   email: 'michinokuyn9_nev@indeedemail.com' },
  { name: '藤田 剛史',     phone: '09097035354',   email: '2ngnfkphvtaiitx_scy@indeedemail.com' },
  { name: '山浦 秀寛',     phone: '07085572789',   email: 'xiukuanshangtian3_x5t@indeedemail.com' },
  // doda/他媒体
  { name: '藤丸 龍兵',     phone: '09075786726',   email: 'gerwqegweg@yahoo.co.jp' },
  { name: '須藤 沙織',     phone: '08065306608',   email: 'sa_214vip@ezweb.ne.jp' },
];

let deleted = 0, notFound = 0;
for (const r of csvRecords) {
  const nPhone = normalizePhone(r.phone);
  const nEmail = normalizeEmail(r.email);
  // 電話番号またはメールで検索して削除
  let row = nPhone ? db.prepare("SELECT id,name FROM applicants WHERE normalized_phone=? LIMIT 1").get(nPhone) : null;
  if (!row && nEmail) row = db.prepare("SELECT id,name FROM applicants WHERE normalized_email=? LIMIT 1").get(nEmail);
  if (row) {
    db.prepare("DELETE FROM applications WHERE applicant_id=?").run(row.id);
    db.prepare("DELETE FROM applicants WHERE id=?").run(row.id);
    console.log(`削除: ${row.name} (${r.phone})`);
    deleted++;
  } else {
    console.log(`なし: ${r.name}`);
    notFound++;
  }
}

console.log(`\n✅ 削除: ${deleted}件 / 見つからず: ${notFound}件`);
console.log('残り応募者数:', db.prepare('SELECT COUNT(*) as c FROM applicants').get().c);
db.close();
