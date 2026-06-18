'use strict';
// ルート配送ドライバー（企業配送）求人15件（求人ボックス掲載・大阪府10＋兵庫県5）
// 法人・事業所への固定ルート配送（食品・飲料・日用品・医療機器等）
// 給与は掲載写真の「月給42万円〜62万円」に合わせる
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// 掲載写真 — 配送ドライバーと同じ画像
const HAISOU_IMAGE = '/images/ec-haisou-koujikyuu.jpg';
// 写真に合わせた給与
const SALARY_INCOME = '月給42万円〜62万円';
const SALARY_DETAIL = '月給420,000円〜620,000円（歩合・各種手当込み）';

// 除外済みエリア（高時給エリア配送ドライバー第1・2弾）:
// 第1弾: 豊中市岡町, 吹田市江坂, 茨木市南茨木, 高槻市富田, 枚方市招提,
//        八尾市近鉄八尾, 寝屋川市香里園, 東大阪市布施, 守口市大日, 松原市河内松原,
//        堺市堺区, 尼崎市武庫之荘, 西宮市甲子園, 伊丹市伊丹, 宝塚市逆瀬川
// 第2弾: 池田市石橋, 箕面市牧落, 摂津市千里丘, 大東市住道, 四條畷市四条畷,
//        藤井寺市道明寺, 羽曳野市古市, 堺市中区, 泉大津市泉大津, 岸和田市岸和田,
//        川西市川西能勢口, 芦屋市芦屋, 神戸市東灘区魚崎, 神戸市灘区六甲道, 三田市三田
// 既存除外: 大阪市全24区, 堺市北区
const AREAS = [
  { pref: '大阪府', city: '交野市',     district: '星田',       client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '柏原市',     district: '柏原',       client: '医療機器・日用品卸' },
  { pref: '大阪府', city: '富田林市',   district: '富田林',     client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '河内長野市', district: '河内長野',   client: '医療・介護用品卸' },
  { pref: '大阪府', city: '大阪狭山市', district: '大阪狭山',   client: '日用品・事務用品卸' },
  { pref: '大阪府', city: '和泉市',     district: '和泉中央',   client: '食品・工業資材' },
  { pref: '大阪府', city: '高石市',     district: '高石',       client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '堺市',       district: '西区',       client: '食品・飲料・日用品' },
  { pref: '大阪府', city: '泉佐野市',   district: '泉佐野',     client: '物流倉庫・商業施設' },
  { pref: '大阪府', city: '貝塚市',     district: '貝塚',       client: '食品・日用品卸売' },
  { pref: '兵庫県', city: '神戸市',     district: '中央区三宮', client: 'オフィス・商業施設向け' },
  { pref: '兵庫県', city: '神戸市',     district: '西区伊川谷', client: '工場・物流センター向け' },
  { pref: '兵庫県', city: '加古川市',   district: '加古川',     client: '食品・工業資材メーカー' },
  { pref: '兵庫県', city: '高砂市',     district: '高砂',       client: '工場・企業向け資材' },
  { pref: '兵庫県', city: '明石市',     district: '明石',       client: '食品・医療機器・日用品' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

// 対象拠点のみ削除（他の求人種別は消さない）
const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='ルート配送ドライバー（企業配送）' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存ルート配送ドライバー（企業配送）を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】ルート配送ドライバー正社員募集｜${SALARY_INCOME}・法人固定ルート・未経験歓迎`;
  const catchcopy = `${SALARY_INCOME}／固定ルートで安心！${j.client}の商品を担当エリアにお届け。日勤メイン・1日20〜40件・取引先固定で効率よく高収入を実現。`;
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
◎${SALARY_INCOME}の高収入
業界最高水準の報酬体系。法人配送ならではの効率的な配達で高収入を実現。

◎固定ルート・固定取引先で安心
毎日同じルート・同じ取引先への配送なので、慣れれば効率が上がり収入もアップ。

◎日勤メインで生活リズムが整う
基本は8:00〜17:00の日勤。プライベートの時間を確保できます。

◎車両・ガソリン・保険・メンテ費用はすべて会社負担
マイカー不要。コストは一切かかりません。

◎荷積み・荷降ろし補助あり
体力に不安がある方も安心。補助機器・チームでサポートします。

◎未経験歓迎・充実の研修
先輩スタッフが同行して丁寧に指導。1〜2週間で独り立ちできます。

◎正社員採用
社会保険完備・有給休暇あり・安定して長く働けます。

■給与内訳
基本給 + 歩合給（配達件数連動）
各種手当（燃料手当・精皆勤手当）
賞与年2回

【給与】
${SALARY_DETAIL}

【シフト・勤務時間】
日勤メイン（8:00〜17:00）
実働8時間・シフト制（希望休あり）

【休日・休暇】
完全週休2日制
年間休日120日以上
有給休暇・慶弔休暇

【応募資格】
普通自動車運転免許（AT限定可）
年齢・学歴・経験不問

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

【勤務期間】
長期`;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', 'AT限定OK',
    '車両費用会社負担', '日勤メイン', '固定ルート', '法人配送',
    '完全週休2日', '普通免許OK',
  ]);
  const rewarding = `固定ルートで法人配送する安心のお仕事。${SALARY_INCOME}の高収入で、慣れれば配達効率がどんどん上がります。${j.client}の商品を担当エリアにお届けする、やりがいのある仕事です。`;
  const worktime = '日勤メイン（8:00〜17:00）　実働8時間・シフト制　完全週休2日　年間休日120日以上';
  const transport = `${j.pref}${j.city}（${j.district}）エリア。車通勤OK・無料駐車場完備。社用車（軽バン・小型トラック）を貸与するため、マイカー不要です。`;
  const howToApply = 'このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';

  stmt.run(
    id, title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, 'ルート配送ドライバー（企業配送）', '正社員',
    description, tags, catchcopy, HAISOU_IMAGE,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/15] ${title.slice(0, 50)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（ルート配送ドライバー（企業配送）・大阪府＋兵庫県・${SALARY_INCOME}・写真付き）`);
