'use strict';
// 工場軽作業スタッフ 求人10件・全国（求人ボックス掲載）
// 月収30万円以上（月給30〜37万円）・機械オペレーター・梱包作業員等と別job_type
// 既存の工場・倉庫・機械オペレーター・梱包全エリアと被らない都市を選定
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// 掲載写真 — 工場・機械系画像
const IMAGE_URL = '/images/kikai-opareta-tetsukou.jpg';
const SALARY_INCOME = '月収30万円以上';
const SALARY_DETAIL = '月給300,000円〜370,000円（各種手当込み）';

// 全国10エリア（工場・倉庫・機械オペレーター・梱包全弾と被りなし）
// 既使用例（倉庫・梱包系）: 函館,青森,福島,高崎,船橋,厚木,岡崎,高松,福岡,鹿児島
// 既使用例（機械系）: 苫小牧,石巻,秋田,仙台,八戸,いわき,川口,千葉,太田,富山,大垣,一宮,豊田,
//                   岡山,姫路,倉敷,福山,四日市,津,伊万里,大牟田,長崎,熊本/八代,坂出,
//                   那覇 ほか
// 本弾は上記と被らない都市を選定
const AREAS = [
  { pref: '北海道',   city: '帯広市',   facility: '食品加工・物流センター' },
  { pref: '岩手県',   city: '盛岡市',   facility: '製造工場・軽作業センター' },
  { pref: '山形県',   city: '山形市',   facility: '食品・日用品の軽作業センター' },
  { pref: '栃木県',   city: '宇都宮市', facility: '大型物流・軽作業センター' },
  { pref: '茨城県',   city: '水戸市',   facility: '製造工場・軽作業ライン' },
  { pref: '長野県',   city: '長野市',   facility: '食品加工・物流軽作業センター' },
  { pref: '静岡県',   city: '浜松市',   facility: '製造工場・部品組立ライン' },
  { pref: '滋賀県',   city: '大津市',   facility: 'EC物流・仕分け軽作業センター' },
  { pref: '愛媛県',   city: '松山市',   facility: '食品・日用品の軽作業センター' },
  { pref: '熊本県',   city: '熊本市',   facility: '製造工場・軽作業ライン' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

// 対象拠点のみ削除（冪等）
const locations = AREAS.map(a => `${a.pref}${a.city}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='工場軽作業スタッフ' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存工場軽作業スタッフを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.pref}${j.city}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】工場軽作業スタッフ 正社員募集｜${SALARY_INCOME}・未経験歓迎・日勤メイン`;
  const catchcopy = `${SALARY_INCOME}（月給30〜37万円）／${j.facility}での軽作業！未経験・ブランクOK。体に無理なく稼げる工場のお仕事。正社員で安定して働けます。`;
  const description = `■お仕事内容
${j.facility}（${j.pref}${j.city}）での軽作業がメインのお仕事です。
製品の検品・仕分け・梱包補助・ライン補助など、決まった手順でコツコツ取り組む仕事です。

■主な業務
・製品・部品の検品・目視確認
・仕分け・ラベル貼り・梱包補助
・ライン補助・材料補充
・作業記録の入力・チェック
・作業エリアの清掃・整理整頓

※重い荷物の持ち運びは少なめ・体への負担が少ない軽作業中心
※マニュアル完備・丁寧な研修あり
※日勤メイン（8:00〜17:00）・残業少なめ
※未経験スタートの先輩多数活躍中

■アピールポイント
◎${SALARY_INCOME}の安定収入
月給30万円〜37万円の高め水準。各種手当込みで月収30万円以上を実現できます。

◎未経験・ブランクOK
決まった手順で進める軽作業中心。特別なスキルや資格は不要です。

◎丁寧な研修あり
入社後は先輩スタッフがしっかり指導。2〜3週間で独り立ちできます。

◎日勤メインで生活リズムが整う
基本は8:00〜17:00の日勤。プライベートの時間をしっかり確保できます。

◎年間休日120日以上
完全週休2日制。ライフワークバランスを重視した働き方ができます。

◎正社員採用・社会保険完備
長期安定雇用。健康保険・厚生年金・雇用保険・労災保険に完全加入。

■給与内訳
基本給 + 精皆勤手当 + 各種手当
交通費支給（規定内）
昇給年1回
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
昇給年1回
賞与年2回

【入社後の流れ】
1〜2週目：社内研修・安全教育・作業手順説明
3〜4週目：先輩スタッフ同行OJT
2ヶ月目以降：担当工程を独立して担当

転勤なし
車通勤可能（無料駐車場あり）
【勤務期間】長期`;

  const tags = JSON.stringify([
    '未経験OK', '月収30万円以上', '正社員', '軽作業',
    '日勤メイン', '年間休日120日以上', '社会保険完備', '残業少なめ',
    '車通勤OK', '交通費支給',
  ]);
  const rewarding = `${j.facility}での軽作業は、コツコツ丁寧に取り組む方に向いたお仕事です。${SALARY_INCOME}の安定収入と充実した福利厚生で、未経験からでも長期的に安心して働けます。`;
  const worktime = '日勤メイン 8:00〜17:00（実働8時間）　残業少なめ　完全週休2日　年間休日120日以上';
  const transport = `${j.pref}${j.city}（${j.facility}周辺）。車通勤OK・無料駐車場完備。公共交通機関利用の場合は交通費支給（規定内）。`;
  const howToApply = 'このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';

  stmt.run(
    id, title, `${j.pref}${j.city}`, SALARY_DETAIL, '工場軽作業スタッフ', '正社員',
    description, tags, catchcopy, IMAGE_URL,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/10] ${title.slice(0, 55)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（${SALARY_INCOME}・工場軽作業スタッフ・全国10件）`);
