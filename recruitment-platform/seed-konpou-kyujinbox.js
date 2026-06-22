'use strict';
// 工場内梱包・仕分け作業員 求人10件・全国（求人ボックス掲載）
// 工場・倉庫作業員／機械オペレーターとは別job_type
// 既存の工場・倉庫・機械オペレーター全エリアと被らない都市を選定
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// 掲載写真 — 機械オペレーター・工場系と同じ画像
const IMAGE_URL = '/images/kikai-opareta-tetsukou.jpg';
const SALARY_INCOME = '月収27万円以上（月給24万円〜30万円）';
const SALARY_DETAIL = '月給240,000円〜300,000円（各種手当込み）';

// 全国10エリア（工場・倉庫作業員／機械オペレーター全弾と被りなし）
// 既使用例: 札幌/横浜/さいたま/足立/沼津/一宮/岡山/広島/那覇/石巻（倉庫）、
//          市原/倉敷/福山/姫路/四日市/苫小牧/北九州/富士/仙台/秋田/太田/千葉/豊田/明石/坂出/
//          薩摩川内/大牟田/長崎/八戸/いわき/川口/富山/大垣/津/出雲/伊万里/八代/下関 ほか（機械）
const AREAS = [
  { pref: '北海道',   city: '函館市',   facility: '食品加工・物流梱包センター' },
  { pref: '青森県',   city: '青森市',   facility: '食品・水産加工梱包工場' },
  { pref: '福島県',   city: '福島市',   facility: '製造工場・物流梱包センター' },
  { pref: '群馬県',   city: '高崎市',   facility: '大型物流倉庫・梱包センター' },
  { pref: '千葉県',   city: '船橋市',   facility: 'EC物流・仕分け梱包センター' },
  { pref: '神奈川県', city: '厚木市',   facility: '大型物流倉庫・梱包センター' },
  { pref: '愛知県',   city: '岡崎市',   facility: '製造工場・部品梱包センター' },
  { pref: '香川県',   city: '高松市',   facility: '食品・日用品梱包センター' },
  { pref: '福岡県',   city: '福岡市',   facility: 'EC物流・仕分け梱包センター' },
  { pref: '鹿児島県', city: '鹿児島市', facility: '食品加工・物流梱包センター' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

// 対象拠点のみ削除（冪等）
const locations = AREAS.map(a => `${a.pref}${a.city}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='工場内梱包・仕分け作業員' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存工場内梱包・仕分け作業員を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.pref}${j.city}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】工場内梱包・仕分け作業員 正社員募集｜${SALARY_INCOME}・未経験歓迎・かんたん軽作業`;
  const catchcopy = `${SALARY_INCOME}／${j.facility}でのかんたん梱包・仕分け作業！未経験・ブランクOK。重い荷物は少なく、コツコツ作業が好きな方歓迎。正社員で長く働けます。`;
  const description = `■お仕事内容
${j.facility}（${j.pref}${j.city}）での梱包・仕分け作業がメインのお仕事です。
製品や商品を決められた手順で箱詰め・梱包し、出荷先ごとに仕分けする、かんたんな軽作業中心の業務です。

■主な業務
・製品・商品の箱詰め・梱包作業
・出荷先ごとの仕分け・ラベル貼り
・梱包資材の準備・補充
・検品・数量チェック・記録入力
・作業エリアの清掃・整理整頓

※かんたんな軽作業が中心（重い荷物は少なめ）
※マニュアル完備・手順がしっかり決まっているので未経験でも安心
※日勤メイン（8:00〜17:00）・残業少なめ
※丁寧な研修あり・未経験スタートの先輩多数活躍中
※コツコツとした作業が好きな方に向いています

■アピールポイント
◎${SALARY_INCOME}の安定収入
月給24万円〜30万円の安定した収入。各種手当込みで月収27万円以上を実現。

◎未経験・ブランクOK・かんたん軽作業
決まった手順で進めるかんたんな作業中心。特別なスキルや経験は不要です。

◎丁寧な研修あり
入社後は先輩スタッフがしっかり指導。マニュアルも完備しているので安心です。

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
※未経験・ブランクのある方も大歓迎

【待遇・福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）
制服・安全靴貸与
昇給あり（年1回査定）
賞与年2回

【入社後の流れ】
1〜2週目：社内研修・安全教育・作業手順説明
3〜4週目：先輩スタッフ同行OJT
2ヶ月目以降：担当工程を独立して担当

転勤なし

車通勤可能（無料駐車場あり）

【勤務期間】
長期`;

  const tags = JSON.stringify([
    '未経験OK', '月収27万円以上', '正社員', 'かんたん軽作業',
    '梱包・仕分け', '年間休日120日以上', '社会保険完備', '日勤メイン',
    '車通勤OK', '交通費支給',
  ]);
  const rewarding = `${j.facility}の出荷を支えるやりがいのある仕事。${SALARY_INCOME}の安定収入と充実した福利厚生で、未経験から長期的に安心して働けます。かんたんな軽作業中心なので、コツコツ作業が好きな方にぴったりです。`;
  const worktime = '日勤メイン 8:00〜17:00（実働8時間）　残業少なめ　完全週休2日　年間休日120日以上';
  const transport = `${j.pref}${j.city}（${j.facility}周辺）。車通勤OK・無料駐車場完備。公共交通機関利用の場合は交通費支給（規定内）。`;
  const howToApply = 'このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';

  stmt.run(
    id, title, `${j.pref}${j.city}`, SALARY_DETAIL, '工場内梱包・仕分け作業員', '正社員',
    description, tags, catchcopy, IMAGE_URL,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/10] ${title.slice(0, 50)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（${SALARY_INCOME}・工場内梱包・仕分け作業員・全国10件）`);
