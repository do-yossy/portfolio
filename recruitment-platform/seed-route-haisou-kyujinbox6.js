'use strict';
// ルート配送ドライバー（企業配送）求人15件・第6弾（求人ボックス掲載）
// 大阪市内残り9区＋大阪府市6件（第1〜5弾と全エリア重複なし）
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

const HAISOU_IMAGE = '/images/ec-haisou-koujikyuu.jpg';
const SALARY_INCOME = '月給42万円〜62万円';
const SALARY_DETAIL = '月給420,000円〜620,000円（歩合・各種手当込み）';

// 企業配送 既使用エリア（重複回避）:
// 1弾大阪: 交野星田,柏原,富田林,河内長野,大阪狭山,和泉中央,高石,堺西区,泉佐野,貝塚
// 1弾兵庫: 神戸三宮,神戸西区,加古川,高砂,明石
// 2弾大阪: 門真古川橋,泉南樽井,堺東区,堺南区,阪南尾崎,島本水無瀬,熊取
// 2弾兵庫: 神戸垂水,須磨,兵庫区,長田,三木,小野,姫路,たつの
// 3弾大阪市: 中央区船場,北区中津,西区阿波座,淀川区新大阪,港区弁天町,住之江区南港,此花区西九条,
//          西淀川区御幣島,東成区今里,旭区千林,鶴見区横堤,住吉区我孫子,西成区玉出,大正区鶴町,東淀川区上新庄
// 4弾兵庫: 尼崎立花,西宮西宮北口,伊丹昆陽,宝塚売布,川西川西池田,芦屋打出,神戸北区,神戸東灘区,三田,西脇
// 5弾大阪: 高槻市摂津富田,枚方市樟葉
// 本弾: 大阪市内残り9区＋大阪府市6件で全エリア重複なし
const AREAS = [
  // 大阪市内 残り9区（第3弾未使用区）
  { pref: '大阪府', city: '大阪市', district: '都島区桜宮',     client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '大阪市', district: '福島区福島',     client: 'オフィス・商業施設向け用品' },
  { pref: '大阪府', city: '大阪市', district: '城東区蒲生',     client: '日用品・事業所向け備品' },
  { pref: '大阪府', city: '大阪市', district: '生野区桃谷',     client: '食品・工業資材メーカー' },
  { pref: '大阪府', city: '大阪市', district: '阿倍野区昭和町', client: '医療機器・日用品卸' },
  { pref: '大阪府', city: '大阪市', district: '東住吉区針中野', client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '大阪市', district: '平野区長吉',     client: '物流倉庫・商業施設向け' },
  { pref: '大阪府', city: '大阪市', district: '浪速区難波',     client: '商業施設・企業向け' },
  { pref: '大阪府', city: '大阪市', district: '天王寺区上本町', client: '医療・オフィス向け資材' },
  // 大阪府市 6件（第1〜5弾ルート配送で未使用）
  { pref: '大阪府', city: '豊中市', district: '庄内',           client: '企業・工場向け食品・資材' },
  { pref: '大阪府', city: '吹田市', district: '豊津',           client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '茨木市', district: '総持寺',         client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '東大阪市', district: '荒本',         client: '製造工場・事業所向け資材' },
  { pref: '大阪府', city: '八尾市', district: '南八尾',         client: '食品・工業資材卸' },
  { pref: '大阪府', city: '守口市', district: '滝井',           client: '企業・医療向け日用品' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='ルート配送ドライバー（企業配送）' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = j.city === '大阪市' ? `大阪市${j.district}` : `${j.city}・${j.district}`;
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

◎未経験歓迎・充実の研修
先輩スタッフが同行して丁寧に指導。1〜2週間で独り立ちできます。

◎正社員採用
社会保険完備・有給休暇あり・安定して長く働けます。

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
【勤務期間】長期`;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', 'AT限定OK',
    '車両費用会社負担', '日勤メイン', '固定ルート', '法人配送',
    '完全週休2日', '普通免許OK',
  ]);
  const rewarding = `固定ルートで法人配送する安心のお仕事。${SALARY_INCOME}の高収入で、慣れれば配達効率がどんどん上がります。${j.client}の商品を担当エリアにお届けする、やりがいのある仕事です。`;
  const worktime = '日勤メイン（8:00〜17:00）　実働8時間・シフト制　完全週休2日　年間休日120日以上';
  const transport = `${j.pref}${j.city}${j.district}エリア。車通勤OK・無料駐車場完備。社用車（軽バン・小型トラック）を貸与するため、マイカー不要です。`;
  const howToApply = 'このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';

  stmt.run(
    id, title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, 'ルート配送ドライバー（企業配送）', '正社員',
    description, tags, catchcopy, HAISOU_IMAGE,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/${AREAS.length}] ${title.slice(0, 60)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（ルート配送ドライバー（企業配送）第6弾・大阪15件）`);
