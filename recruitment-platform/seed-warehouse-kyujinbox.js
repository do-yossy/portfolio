'use strict';
// 工場・倉庫作業員 求人10件（求人ボックス掲載・機械オペレーターとは別job_type）
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const IMAGE_URL = '/images/kikai-opareta-tetsukou.jpg';
const SALARY_INCOME = '月収28万円以上（月給25万円〜32万円）';
const SALARY_DETAIL = '月給250,000円〜320,000円（各種手当込み）';

// 10エリア（機械オペレーター除外済み全エリアと被りなし）
const AREAS = [
  { pref: '北海道',   city: '札幌市',     district: '白石区',   facility: '大型物流倉庫・食品加工工場' },
  { pref: '宮城県',   city: '石巻市',     district: '石巻',     facility: '食品加工・水産工場' },
  { pref: '神奈川県', city: '横浜市',     district: '鶴見区',   facility: '大型物流倉庫・製造工場' },
  { pref: '埼玉県',   city: 'さいたま市', district: '岩槻区',   facility: '大型物流倉庫・EC仕分けセンター' },
  { pref: '東京都',   city: '足立区',     district: '西新井',   facility: '物流倉庫・EC配送センター' },
  { pref: '静岡県',   city: '沼津市',     district: '沼津',     facility: '食品加工・物流倉庫' },
  { pref: '愛知県',   city: '一宮市',     district: '尾西',     facility: '物流倉庫・製造工場' },
  { pref: '岡山県',   city: '岡山市',     district: '南区',     facility: '物流倉庫・食品加工工場' },
  { pref: '広島県',   city: '広島市',     district: '安佐南区', facility: '大型物流センター・工場' },
  { pref: '沖縄県',   city: '那覇市',     district: '小禄',     facility: '物流倉庫・食品加工工場' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

// 対象拠点のみ削除（冪等）
const locations = AREAS.map(a => `${a.pref}${a.city}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='工場・倉庫作業員' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存工場・倉庫作業員を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.pref}${j.city}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】工場・倉庫作業員 正社員募集｜${SALARY_INCOME}・未経験歓迎・資格取得支援`;
  const catchcopy = `${SALARY_INCOME}／${j.facility}で安定勤務！未経験・ブランクOK。フォークリフト等の資格取得支援あり。正社員で長く働ける環境です。`;
  const description = `■お仕事内容
${j.facility}（${j.pref}${j.city}${j.district}）での工場・倉庫作業員業務です。
倉庫内でのピッキング・仕分け・梱包・出荷作業、または工場内の組み立て・検品・ライン作業をお任せします。

■主な業務
・倉庫内ピッキング・仕分け・梱包・出荷作業
・工場内組み立て・検品・ラインでの製造補助
・フォークリフトを使用した荷役・搬送作業（資格取得支援あり）
・在庫管理・棚卸補助
・職場環境の清掃・整理整頓

※資格取得支援制度あり（フォークリフト等）
※日勤メイン（8:00〜17:00）・残業少なめ
※丁寧な研修あり・未経験スタートの先輩多数活躍中
※チームでの協力作業のため、コミュニケーションを取りながら働けます

■アピールポイント
◎${SALARY_INCOME}の安定収入
月給25万円〜32万円の安定した収入。各種手当込みで月収28万円以上を実現。

◎未経験・ブランクOK・丁寧な研修
入社後は先輩スタッフがしっかり指導。工場・倉庫での経験がなくてもゼロから習得できます。

◎フォークリフト等の資格取得支援あり
フォークリフト免許など業務に必要な資格の取得を会社が支援。スキルアップで昇給も目指せます。

◎年間休日120日以上
完全週休2日制。プライベートも充実した働き方ができます。

◎正社員採用・社会保険完備
長期安定雇用。健康保険・厚生年金・雇用保険・労災保険に完全加入。

■給与内訳
基本給 + 各種手当（精皆勤手当等）
交通費支給（規定内）
昇給あり（年1回査定）
賞与年2回

【給与】
${SALARY_DETAIL}

【シフト・勤務時間】
日勤メイン：8:00〜17:00（実働8時間）
残業少なめ（月平均10〜20時間程度）

【休日・休暇】
完全週休2日制
年間休日120日以上
有給休暇・慶弔休暇

【応募資格】
年齢・学歴・経験不問
※フォークリフト免許があれば尚可（なくてもOK・取得支援あり）

【待遇・福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）
制服・安全靴貸与
資格取得支援（フォークリフト等）
昇給あり（年1回査定）
賞与年2回

【入社後の流れ】
1〜2週目：社内研修・安全教育・設備説明
3〜4週目：先輩スタッフ同行OJT
2ヶ月目以降：担当工程を独立して担当

転勤なし

車通勤可能（無料駐車場あり）

【勤務期間】
長期`;

  const tags = JSON.stringify([
    '未経験OK', '月収28万円以上', '正社員', 'フォークリフト歓迎',
    '資格取得支援', '年間休日120日以上', '社会保険完備', '日勤メイン',
    '車通勤OK', '交通費支給',
  ]);
  const rewarding = `${j.facility}の現場を支えるやりがいのある仕事。${SALARY_INCOME}の安定収入と充実した福利厚生で、未経験から長期的にスキルアップしながら働けます。フォークリフト等の資格取得支援も充実しており、昇給を目指せます。`;
  const worktime = '日勤メイン 8:00〜17:00（実働8時間）　残業少なめ　完全週休2日　年間休日120日以上';
  const transport = `${j.pref}${j.city}${j.district}（${j.facility}周辺）。車通勤OK・無料駐車場完備。公共交通機関利用の場合は交通費支給（規定内）。`;
  const howToApply = 'このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';

  stmt.run(
    id, title, `${j.pref}${j.city}`, SALARY_DETAIL, '工場・倉庫作業員', '正社員',
    description, tags, catchcopy, IMAGE_URL,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/10] ${title.slice(0, 50)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（${SALARY_INCOME}・工場・倉庫作業員）`);
