'use strict';
// EC配送系求人15件（求人ボックス掲載・EC配送写真・大阪のみ・場所被りなし）を作成
// 給与は掲載写真(ec-haisou-driver.svg)の「月収38万円以上」に合わせる
// 冪等: 既存のEC配送ドライバー(求人ボックス)を削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// 掲載写真（EC配送ドライバー）— ユーザーが public/images/ に配置済み
const EC_IMAGE = '/images/ec-haisou-driver.jpg';
// 写真に合わせた給与（月給42万円〜62万円）
const SALARY_INCOME = '月給42万円〜62万円';
const SALARY_DETAIL = '月給420,000円〜620,000円（歩合・各種手当込み）';

// 大阪市内の15エリア（区＋地区名で細分化・既存求人とも重複なし）
// 既存求人は区レベルまでしか使っていないため、地区名で一意にする
const AREAS = [
  { ward: '大阪市北区',     district: '中之島',   service: 'Amazon・EC通販大手' },
  { ward: '大阪市福島区',   district: '野田',     service: '楽天市場・Amazon倉庫直発' },
  { ward: '大阪市西区',     district: '新町',     service: '大型EC倉庫発・通販各社' },
  { ward: '大阪市中央区',   district: '本町',     service: 'Yahoo!ショッピング・EC各社' },
  { ward: '大阪市天王寺区', district: '上本町',   service: 'Amazon配送パートナー便' },
  { ward: '大阪市浪速区',   district: '難波中',   service: 'Amazon・楽天EC大手' },
  { ward: '大阪市淀川区',   district: '西中島',   service: 'EC通販各社・大型倉庫発' },
  { ward: '大阪市東淀川区', district: '淡路',     service: '食品・日用品EC通販' },
  { ward: '大阪市城東区',   district: '関目',     service: '楽天・AmazonのEC配送' },
  { ward: '大阪市阿倍野区', district: '文の里',   service: '生活雑貨・日用品EC' },
  { ward: '大阪市住吉区',   district: '長居',     service: 'Amazon・EC通販各社' },
  { ward: '大阪市東住吉区', district: '駒川',     service: '大手EC倉庫発の配送' },
  { ward: '大阪市平野区',   district: '喜連',     service: 'アパレル・雑貨EC各社' },
  { ward: '大阪市生野区',   district: '鶴橋',     service: 'スポーツ・家電EC配送' },
  { ward: '大阪市都島区',   district: '京橋',     service: 'EC通販各社・城東エリア' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

// 既存のEC配送ドライバー(求人ボックス)を削除して作り直す
const del = db.prepare("DELETE FROM jobs WHERE job_type='EC配送ドライバー' AND target_media LIKE '%求人ボックス%'").run();
if (del.changes > 0) console.log(`既存EC配送ドライバーを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.ward}・${j.district}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】EC配送ドライバー正社員募集｜${SALARY_INCOME}・車両費用完全会社負担`;
  const catchcopy = `${SALARY_INCOME}／高時給エリア配送！${j.service}の荷物をお届け。未経験から始められる高収入のお仕事です。`;
  const description = `■お仕事内容
都心エリアで効率配送！高収入を実現する高時給エリア配送ドライバーです。
${j.service}の商品を担当エリアにお届けします。
軽自動車（社用車）を使って、個人宅・マンションへの配送がメイン業務となります。

■主な業務
・EC通販商品の個人宅・事業所への配達
・出発前の車両点検・積み込み
・配達記録の入力・管理（アプリの配達システム使用）
・お客様への丁寧な対応

※夜間帯配送（17時〜21時）が中心
※1日の配達件数：60〜80件程度
※コンパクトエリアでの効率配送
※再配達が少なく受け取り率が高いエリア
※長距離運転はほとんどなし
※アプリの配達システムを使用するため土地感不要

■アピールポイント
◎${SALARY_INCOME}の高収入
業界最高水準の報酬体系。頑張った分だけ収入に直結します。

◎コンパクトエリアで効率配送
担当エリアが密集しているため、移動が少なく効率的に配達できます。

◎定期顧客の構築で収入アップも
ルートが固定化されるため、慣れれば配達効率がどんどん上がります。

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
${SALARY_DETAIL}

【シフト・勤務時間】
稼働時間 11:00〜20:00を想定（調整可能）
夜間帯配送（17時〜21時）が中心
実働8時間・シフト制（希望休あり）

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
    '車両費用会社負担', '夜間帯配送', 'コンパクトエリア', 'アプリ配達',
    '完全週休2日', '普通免許OK',
  ]);
  const rewarding = `コンパクトエリアで効率配送できる高時給エリア配送の仕事。${SALARY_INCOME}の高収入で、定期顧客を構築すればさらに収入アップも可能です。未経験からスタートして活躍しているスタッフが多数います。`;
  const worktime = '稼働時間 11:00〜20:00を想定（調整可能）　夜間帯配送（17時〜21時）が中心　実働8時間・シフト制　週休2日　年間休日120日以上';
  const transport = `大阪府${j.ward}（${j.district}）エリア。車通勤OK・無料駐車場完備。社用車（軽自動車）を貸与するため、マイカー不要です。`;
  const howToApply = 'このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';

  stmt.run(
    id, title, `大阪府${j.ward}${j.district}`, SALARY_DETAIL, 'EC配送ドライバー', '正社員',
    description, tags, catchcopy, EC_IMAGE,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/15] ${title.slice(0, 45)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（大阪府・${SALARY_INCOME}・写真付き）`);
