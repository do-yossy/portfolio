'use strict';
// SQ（company='sq'）大阪府 今日のバッチ（2026-08-15）：ルート配送ドライバー25件（求人ボックス掲載）
// seed-sq-osaka-haisou-seizou-kyujinbox.js の配送テンプレを踏襲し、全25件を配送ドライバーで構成。
// 勤務地は大阪府の新規エリア25件（既存SQ seed群と重複しない実在の市区町・丁目まで一意）。
// 冪等: 本バッチ25勤務地（company='sq' かつ 求人ボックス）のみ削除してから作り直す（他バッチは消さない＝追加）。

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const HAISOU_IMAGE = '/images/ec-haisou-koujikyuu.jpg';
const HAISOU_SALARY_INCOME = '月給42万円〜62万円';
const HAISOU_SALARY_DETAIL = '月給420,000円〜620,000円（歩合・各種手当込み）';
const HAISOU_JOB_TYPE = 'ルート配送ドライバー（企業配送）';

// 大阪府の新規エリア25件（既存SQ seedの使用済み丁目とは重ならない実在の市区町・丁目）
const HAISOU_AREAS = [
  { pref: '大阪府', city: '大阪市北区', district: '堂山町', client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '大阪市中央区', district: '徳井町1丁目', client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '大阪市西区', district: '北堀江1丁目', client: '企業・商業施設向け日用品' },
  { pref: '大阪府', city: '大阪市天王寺区', district: '六万体町', client: '食品・日用品卸売' },
  { pref: '大阪府', city: '大阪市城東区', district: '諏訪1丁目', client: '食品・工業用品メーカー' },
  { pref: '大阪府', city: '大阪市旭区', district: '大宮5丁目', client: '医療機器・事業所向け用品' },
  { pref: '大阪府', city: '大阪市鶴見区', district: '焼野2丁目', client: '工場・物流センター向け' },
  { pref: '大阪府', city: '大阪市住吉区', district: '山之内3丁目', client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '大阪市東住吉区', district: '湯里6丁目', client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '大阪市平野区', district: '長吉長原3丁目', client: '企業・商業施設向け日用品' },
  { pref: '大阪府', city: '大阪市都島区', district: '片町1丁目', client: '食品・日用品卸売' },
  { pref: '大阪府', city: '大阪市淀川区', district: '十三東3丁目', client: '食品・工業用品メーカー' },
  { pref: '大阪府', city: '大阪市東成区', district: '中道1丁目', client: '医療機器・事業所向け用品' },
  { pref: '大阪府', city: '堺市堺区', district: '熊野町東5丁', client: '工場・物流センター向け' },
  { pref: '大阪府', city: '堺市中区', district: '深井水池町', client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '東大阪市', district: '足代3丁目', client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '吹田市', district: '泉町3丁目', client: '企業・商業施設向け日用品' },
  { pref: '大阪府', city: '豊中市', district: '岡町南1丁目', client: '食品・日用品卸売' },
  { pref: '大阪府', city: '高槻市', district: '芥川町1丁目', client: '食品・工業用品メーカー' },
  { pref: '大阪府', city: '茨木市', district: '上穂積2丁目', client: '医療機器・事業所向け用品' },
  { pref: '大阪府', city: '枚方市', district: '招提北町2丁目', client: '工場・物流センター向け' },
  { pref: '大阪府', city: '八尾市', district: '太子堂3丁目', client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '寝屋川市', district: '明和2丁目', client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '守口市', district: '京阪本通2丁目', client: '企業・商業施設向け日用品' },
  { pref: '大阪府', city: '門真市', district: '一番町', client: '食品・日用品卸売' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = HAISOU_AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE company='sq' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存の同一勤務地バッチを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < HAISOU_AREAS.length; i++) {
  const j = HAISOU_AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const id = crypto.randomBytes(10).toString('hex');
  const location = `${j.pref}${j.city}${j.district}`;
  const title = `【${areaLabel}】ルート配送ドライバー正社員募集｜${HAISOU_SALARY_INCOME}・法人固定ルート・未経験歓迎`;
  const catchcopy = `${HAISOU_SALARY_INCOME}／固定ルートで安心！${j.client}の商品を担当エリアにお届け。日勤メイン・1日20〜40件・取引先固定で効率よく高収入を実現。年齢不問・ブランクOK・幅広い世代が活躍中。`;
  const description = `■お仕事内容
法人・事業所への固定ルート配送がメインのお仕事です。${j.client}の商品を、担当エリアの企業・施設へ定期的にお届けします。
軽バン・小型トラック（社用車）を使って、毎日決まったルートで配送する安心のお仕事です。

■主な業務
・${j.client}の商品を法人・事業所へ定期配送
・出発前の車両点検・荷積み（荷積み補助あり）
・納品・荷降ろし（荷降ろし補助あり）
・受け取りサイン・引き取り業務
・配達記録の入力・管理

※固定ルート・固定取引先で安心して働けます
※1日の配達件数：20〜40件（法人向けのため個人宅より件数少なめ）
※荷物はやや重めですが、荷積み・荷降ろし補助あり
※日勤メイン（8:00〜17:00）
※ナビ使用のため土地感不要
※個人宅配送と異なり、不在による再配達がほぼなし

■アピールポイント
◎${HAISOU_SALARY_INCOME}の高収入
業界最高水準の報酬体系。法人配送ならではの効率的な配達で高収入を実現。

◎固定ルート・固定取引先で安心
毎日同じルート・同じ取引先への配送なので、慣れれば効率が上がり収入もアップ。

◎日勤メインで生活リズムが整う
基本は8:00〜17:00の日勤。プライベートの時間を確保できます。

◎車両・ガソリン・保険・メンテ費用はすべて会社負担
マイカー不要。コストは一切かかりません。

◎未経験歓迎・充実の研修
先輩スタッフが同行して丁寧に指導。1〜2週間で独り立ちできます。

◎幅広い世代が活躍・ブランクOK
年齢不問。20代〜60代まで幅広い世代が活躍中。ブランクのある方も歓迎です。

◎応募後は最短当日〜翌営業日にご連絡
お待たせせずスピーディーに選考を進めます。まずはお気軽にご応募ください。

【給与】
${HAISOU_SALARY_DETAIL}

【シフト・勤務時間】
日勤メイン（8:00〜17:00）
実働8時間・シフト制（希望休あり）

【休日・休暇】
完全週休2日制
年間休日120日以上
有給休暇・慶弔休暇

【応募資格】
普通自動車運転免許（AT限定可）
年齢・学歴・経験不問（未経験・ブランクのある方も歓迎）

【待遇・福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
車両・燃料・保険費用すべて会社負担
ユニフォーム支給
研修制度あり
昇給年1回
賞与年2回

【入社後の流れ】
1週目：社内研修・配達ルール説明
2〜3週目：先輩スタッフ同行OJT
4週目以降：担当ルートを独立して配送

転勤なし
車通勤可能（駐車場あり）
【勤務期間】長期`;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', 'AT限定OK',
    '車両費用会社負担', '日勤メイン', '固定ルート', '年齢不問',
    'ブランクOK', '幅広い世代活躍',
  ]);
  const rewarding = `固定ルートで法人配送する安心のお仕事。${HAISOU_SALARY_INCOME}の高収入で、慣れれば配達効率がどんどん上がります。年齢不問・ブランクOKで、幅広い世代が活躍しています。${j.client}の商品を担当エリアにお届けする、やりがいのある仕事です。`;
  const worktime = '日勤メイン（8:00〜17:00）　実働8時間・シフト制　完全週休2日　年間休日120日以上';
  const transport = `${location}エリア。車通勤OK・無料駐車場完備。社用車（軽バン・小型トラック）を貸与するため、マイカー不要です。`;
  const howToApply = [
    '【応募後のご案内】',
    '',
    'ご応募確認後、採用受付代行担当者よりお電話にてご連絡いたします。',
    '',
    'また、ご経験・ご希望条件等を踏まえ、ご本人の同意をいただいた上で、関連求人や提携企業求人をご案内させていただく場合がございます。',
  ].join('\n');

  stmt.run(
    id, title, location, HAISOU_SALARY_DETAIL, HAISOU_JOB_TYPE, '正社員',
    description, tags, catchcopy, HAISOU_IMAGE,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [配送 ${i + 1}/${HAISOU_AREAS.length}] ${title.slice(0, 60)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（SQ・大阪府 今日のバッチ・ルート配送ドライバー・求人ボックス）`);
