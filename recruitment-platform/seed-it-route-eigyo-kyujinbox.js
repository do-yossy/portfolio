'use strict';
// ITルート営業（既存顧客）求人10件（求人ボックス掲載・SQ）
// 先日のシニア歓迎7職種と同テーマ: シニア歓迎(50代60代活躍)／顧客折衝経験を活かす／
//   社用車・普通免許OK／新規開拓なし・既存顧客中心／IT未経験歓迎(専門知識不要)／日勤・正社員
// 給与は相場より高め: 月給35万円〜48万円
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'sq';
const IMAGE_URL = '/images/it-office.jpg';
const JOB_TYPE = 'ITルート営業';
const SALARY_INCOME = '月給35万円〜48万円';
const SALARY_DETAIL = '月給350,000円〜480,000円（各種手当込み）';

// 大阪府10エリア
const AREAS = [
  { loc: '大阪府大阪市北区',     label: '大阪市北区' },
  { loc: '大阪府大阪市中央区',   label: '大阪市中央区' },
  { loc: '大阪府大阪市西区',     label: '大阪市西区' },
  { loc: '大阪府大阪市淀川区',   label: '大阪市淀川区' },
  { loc: '大阪府大阪市天王寺区', label: '大阪市天王寺区' },
  { loc: '大阪府大阪市阿倍野区', label: '大阪市阿倍野区' },
  { loc: '大阪府東大阪市',       label: '東大阪市' },
  { loc: '大阪府吹田市',         label: '吹田市' },
  { loc: '大阪府豊中市',         label: '豊中市' },
  { loc: '大阪府枚方市',         label: '枚方市' },
];

const QUALIFICATIONS = `【必須】営業・接客・窓口など「顧客折衝」のご経験／普通自動車運転免許（AT限定可）
【歓迎】50代・60代の方／セカンドキャリアをお探しの方／ブランクのある方
年齢不問・学歴不問・IT未経験歓迎（PCの基本操作ができればOK）`;
const WORKTIME = '日勤メイン（9:00〜18:00）　実働8時間・シフト制（希望休あり）　完全週休2日　年間休日120日以上';
const HOW_TO_APPLY = 'このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';
const REWARDING = '既存のお客様との信頼関係をベースに、「もっとこう使いたい」に応える提案営業です。押し売りではなく、相手の役に立つ提案で感謝される仕事。長年培った折衝力・対人力を、年齢を重ねたからこその落ち着きとともに活かせます。';

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => a.loc);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='${JOB_TYPE}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存ITルート営業を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?)
`);

const tags = JSON.stringify([
  'シニア歓迎', '50代60代活躍', '正社員', '普通免許OK',
  '社用車貸与', '新規開拓なし', '既存顧客のみ', 'IT未経験歓迎',
  '日勤メイン', '高収入',
]);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const a = AREAS[i];
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${a.label}】ITルート営業（既存顧客・社用車）｜${SALARY_INCOME}・シニア歓迎・専門知識不要・新規開拓なし・折衝経験を活かせる正社員`;
  const catchcopy = `${SALARY_INCOME}／社用車で既存のお客様を回るITルート営業。飛び込みなし・専門知識不要（PC基本操作でOK）。これまでの折衝・営業経験を活かして落ち着いて働けます。`;
  const description = `■お仕事内容
すでにお取引のある企業を、社用車で定期的に訪問するルート営業のお仕事です（${a.label}周辺の担当エリア）。
IT製品・システム・機器（パソコン、ネットワーク機器、ソフト・クラウドサービス、複合機など）をご利用中のお客様に対し、利用状況の確認・ご相談対応・追加や上位プランのご提案（アップセル）を行います。
新規開拓（飛び込み）はありません。これまでの営業・接客・窓口などの折衝経験がそのまま活きます。
IT製品といっても専門的な知識は不要。商品知識はマニュアルと入社後研修で身につき、先輩スタッフの同行研修があるので、IT業界が初めての方・ブランクのある方も安心です。

■主な業務
・既存取引先への定期訪問（社用車・担当エリア固定）
・利用状況のヒアリング・お困りごとのご相談対応
・追加機器・上位プラン・オプションのご提案（アップセル）
・見積作成・受注・納期や導入日の調整
・納品・簡単な設定確認の立ち会い（技術作業は専門スタッフが対応）
・訪問記録・日報の入力

■こんなお仕事です
※お客様は「すでにご利用中の企業」中心。関係づくりと最適なご提案がメインです
※飛び込み営業・厳しいノルマはありません
※社用車での訪問（普通免許OK・AT限定可・長距離なし・担当エリア固定）
※専門知識は不要（マニュアル・研修あり／PCの基本操作ができればOK）

■アピールポイント
◎シニア・中高年活躍中
50代・60代の未経験スタート多数。人生経験・対人スキルが活きます。

◎これまでの折衝経験が武器に
営業・接客・窓口などのご経験があれば大歓迎。信頼関係ベースのご提案です。

◎既存顧客のみ・新規開拓なし
飛び込みなし・ノルマ控えめ。落ち着いて働けます。

◎専門知識・資格は不要
商品知識は研修で習得。技術作業は専門スタッフが担当します。

◎社用車貸与・普通免許でOK
マイカー不要。車両・ガソリン代・保険・メンテ費用は会社負担。長距離運転なし。

◎日勤メイン・正社員採用
安定した働き方。社会保険完備・有給休暇あり。

【給与】
${SALARY_DETAIL}
※経験・能力を考慮して決定／昇給年1回・賞与年2回

【シフト・勤務時間】
日勤メイン：9:00〜18:00（実働8時間・シフト制／希望休あり）

【休日・休暇】
完全週休2日制
年間休日120日以上
有給休暇・慶弔休暇

【応募資格】
${QUALIFICATIONS}

【待遇・福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
社用車貸与・車両/燃料/保険/メンテ費用すべて会社負担
交通費支給（規定内）
昇給年1回・賞与年2回
研修制度あり（先輩同行OJT）

【入社後の流れ】
1週目：会社・商品・ルール説明／安全運転研修
2〜3週目：先輩スタッフ同行OJT
4週目以降：担当エリア・担当顧客を独立して担当

転勤なし
【勤務期間】長期`;

  const transport = `${a.label}周辺エリア。社用車を貸与するためマイカー不要。車両・燃料・保険・メンテ費用はすべて会社負担です。`;

  stmt.run(
    id, title, a.loc, SALARY_DETAIL, JOB_TYPE, '正社員',
    description, tags, catchcopy, IMAGE_URL,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now, COMPANY,
    REWARDING, WORKTIME, transport, HOW_TO_APPLY, QUALIFICATIONS,
  );

  console.log(`✓ [${i + 1}/${AREAS.length}] ${title.slice(0, 45)}…`);
  created++;
}

console.log(`\n完了: ${created}件作成（ITルート営業・シニア歓迎・大阪府10件・SQ・${SALARY_INCOME}）`);
