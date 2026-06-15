'use strict';
// EC配送系求人15件（求人ボックス掲載・写真付き・場所被りなし）を作成

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// EC配送ドライバーの写真（Unsplash・配送/物流テーマ）
const IMAGES = [
  'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1565793979882-b4c3a08bed90?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1493932484895-752d1471eab5?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1591768793355-74d04bb6608f?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1568515387631-8b650bbcdb90?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1590247813693-5541d1c609fd?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1585704032915-c3400305e979?auto=format&fit=crop&w=800&q=80',
];

const JOBS = [
  {
    area: '東京都渋谷区', pref: '東京都', station: '渋谷駅',
    service: 'Amazon・メルカリ等EC大手',
    income: '月収55万円〜78万円',
    salary: '月給260,000円〜350,000円（歩合込み）',
  },
  {
    area: '東京都江東区豊洲', pref: '東京都', station: '豊洲駅',
    service: '楽天市場・Amazon倉庫直発',
    income: '月収52万円〜75万円',
    salary: '月給250,000円〜340,000円（歩合込み）',
  },
  {
    area: '東京都板橋区', pref: '東京都', station: '成増駅',
    service: 'Yahoo!ショッピング・EC通販各社',
    income: '月収50万円〜72万円',
    salary: '月給240,000円〜330,000円（歩合込み）',
  },
  {
    area: '埼玉県さいたま市大宮区', pref: '埼玉県', station: '大宮駅',
    service: 'Amazon配送パートナー便',
    income: '月収48万円〜70万円',
    salary: '月給230,000円〜320,000円（歩合込み）',
  },
  {
    area: '埼玉県越谷市', pref: '埼玉県', station: '越谷駅',
    service: '大型EC倉庫直発・通販各社',
    income: '月収47万円〜68万円',
    salary: '月給225,000円〜310,000円（歩合込み）',
  },
  {
    area: '栃木県宇都宮市', pref: '栃木県', station: '宇都宮駅',
    service: 'Amazon・楽天EC北関東エリア',
    income: '月収45万円〜65万円',
    salary: '月給215,000円〜300,000円（歩合込み）',
  },
  {
    area: '兵庫県神戸市中央区', pref: '兵庫県', station: '三宮駅',
    service: 'Amazon・EC通販大手',
    income: '月収50万円〜72万円',
    salary: '月給240,000円〜330,000円（歩合込み）',
  },
  {
    area: '京都府京都市伏見区', pref: '京都府', station: '桃山駅',
    service: '楽天市場・Yahoo! EC各社',
    income: '月収47万円〜68万円',
    salary: '月給225,000円〜310,000円（歩合込み）',
  },
  {
    area: '滋賀県草津市', pref: '滋賀県', station: '草津駅',
    service: 'EC通販大手・大型倉庫発',
    income: '月収45万円〜65万円',
    salary: '月給215,000円〜300,000円（歩合込み）',
  },
  {
    area: '岐阜県岐阜市', pref: '岐阜県', station: '岐阜駅',
    service: 'Amazon・EC通販各社',
    income: '月収44万円〜63万円',
    salary: '月給210,000円〜290,000円（歩合込み）',
  },
  {
    area: '静岡県浜松市', pref: '静岡県', station: '浜松駅',
    service: '楽天・Amazon浜松エリア',
    income: '月収45万円〜65万円',
    salary: '月給215,000円〜300,000円（歩合込み）',
  },
  {
    area: '福岡県福岡市博多区', pref: '福岡県', station: '博多駅',
    service: 'Amazon・楽天EC九州エリア',
    income: '月収50万円〜72万円',
    salary: '月給240,000円〜330,000円（歩合込み）',
  },
  {
    area: '広島県広島市中区', pref: '広島県', station: '広島駅',
    service: 'EC通販各社・中国地方拠点',
    income: '月収46万円〜66万円',
    salary: '月給220,000円〜305,000円（歩合込み）',
  },
  {
    area: '北海道札幌市中央区', pref: '北海道', station: '札幌駅',
    service: 'Amazon・EC通販北海道エリア',
    income: '月収48万円〜69万円',
    salary: '月給230,000円〜315,000円（歩合込み）',
  },
  {
    area: '宮城県仙台市若林区', pref: '宮城県', station: '仙台駅',
    service: '楽天・Amazon東北エリア',
    income: '月収46万円〜67万円',
    salary: '月給220,000円〜305,000円（歩合込み）',
  },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < JOBS.length; i++) {
  const j = JOBS[i];
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${j.area}】EC配送ドライバー正社員募集｜${j.income}・車両費用完全会社負担`;
  const catchcopy = `${j.income}を目指せる！${j.service}の荷物をお届け。普通免許1枚・未経験OK！`;
  const description = `■お仕事内容
${j.service}の商品を担当エリアにお届けするEC配送ドライバーです。
軽自動車（社用車）を使って、個人宅・マンションへの配送がメイン業務となります。

■主な業務
・EC通販商品の個人宅・事業所への配達
・出発前の車両点検・積み込み
・配達記録の入力・管理
・お客様への丁寧な対応

※1日の配達件数：40〜80件程度
※長距離運転はほとんどなし
※GPSナビを使用するため土地感不要

■アピールポイント
◎${j.income}を目指せる歩合制
業界最高水準の報酬体系。頑張った分だけ収入に直結します。

◎車両・ガソリン・保険・メンテ費用はすべて会社負担
マイカー不要。コストは一切かかりません。

◎未経験歓迎・丁寧な研修あり
先輩スタッフが同行して丁寧に指導。1〜2週間で独り立ちできます。

◎正社員採用
社会保険完備・有給休暇あり・安定して長く働けます。

■給与内訳
基本給 + 歩合給（配達件数連動）
各種手当（燃料手当・深夜手当）
賞与年2回

【給与】
${j.salary}

【シフト・勤務時間】
8:00〜19:00（実働8時間）
シフト制（希望休あり）

【休日・休暇】
週休2日制
年間休日120日以上
有給休暇・慶弔休暇

【応募資格】
普通自動車運転免許（AT限定可）
年齢・学歴・経験不問

【待遇・福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
車両・燃料・保険費用すべて会社負担
ユニフォーム支給
スマートフォン支給
研修制度あり
昇給年1回
賞与年2回

【入社後の流れ】
1週目：社内研修・配達ルール説明
2〜3週目：先輩スタッフ同行OJT
4週目以降：担当エリアを独立して配達

転勤なし

車通勤可能（駐車場あり）

【勤務期間】
長期`;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', 'AT限定OK',
    '車両費用会社負担', '完全週休2日', 'EC配送', '普通免許OK',
  ]);
  const rewarding = `頑張った分だけ収入に直結するEC配送の仕事。${j.income}を目指せる環境で、未経験からスタートして月収60万円以上稼いでいるスタッフも多数います。`;
  const worktime = `シフト制（8:00〜19:00の間で実働8時間）　週休2日　年間休日120日以上　希望休取得しやすい環境`;
  const transport = `${j.area}エリア。車通勤OK・無料駐車場完備。社用車（軽自動車）を貸与するため、マイカー不要です。`;
  const howToApply = `このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。`;

  stmt.run(
    id, title, j.pref, j.salary, 'EC配送ドライバー', '正社員',
    description, tags, catchcopy, IMAGES[i],
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/15] ${title.slice(0, 45)}`);
  created++;
}

console.log(`\n完了: ${created}件作成`);
