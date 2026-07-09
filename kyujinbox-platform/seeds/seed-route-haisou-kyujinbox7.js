'use strict';
// ルート配送ドライバー（企業配送）求人15件・第7弾（求人ボックス掲載）
// 大阪府市15件（第1〜6弾と全エリア重複なし）
// 給与は掲載写真の「月給42万円〜62万円」に合わせる
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const HAISOU_IMAGE = '/images/ec-haisou-koujikyuu.jpg';
const SALARY_INCOME = '月給42万円〜62万円';
const SALARY_DETAIL = '月給420,000円〜620,000円（歩合・各種手当込み）';

// 既使用エリア（重複回避）:
// 1弾大阪: 交野星田,柏原,富田林,河内長野,大阪狭山,和泉中央,高石,堺西区,泉佐野,貝塚
// 2弾大阪: 門真古川橋,泉南樽井,堺東区,堺南区,阪南尾崎,島本水無瀬,熊取
// 3弾大阪市: 中央区船場,北区中津,西区阿波座,淀川区新大阪,港区弁天町,住之江区南港,此花区西九条,
//           西淀川区御幣島,東成区今里,旭区千林,鶴見区横堤,住吉区我孫子,西成区玉出,大正区鶴町,東淀川区上新庄
// 5弾大阪: 高槻市摂津富田,枚方市樟葉
// 6弾大阪市残り9区: 都島区桜宮,福島区福島,城東区蒲生,生野区桃谷,阿倍野区昭和町,
//                   東住吉区針中野,平野区長吉,浪速区難波,天王寺区上本町
// 6弾大阪府市: 豊中市庄内,吹田市豊津,茨木市総持寺,東大阪市荒本,八尾市南八尾,守口市滝井
// 本弾: 上記以外の大阪府市15件
const AREAS = [
  { pref: '大阪府', city: '松原市',   district: '天美',     client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '大東市',   district: '野崎',     client: '日用品・工業資材卸' },
  { pref: '大阪府', city: '四條畷市', district: '忍ヶ丘',   client: '食品・物流センター向け' },
  { pref: '大阪府', city: '藤井寺市', district: '藤井寺',   client: '医療機器・日用品卸' },
  { pref: '大阪府', city: '羽曳野市', district: '高鷲',     client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '泉大津市', district: '泉大津',   client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '岸和田市', district: '東岸和田', client: '食品・工業用品メーカー' },
  { pref: '大阪府', city: '池田市',   district: '池田',     client: '企業・商業施設向け' },
  { pref: '大阪府', city: '箕面市',   district: '箕面',     client: '食品・日用品卸売' },
  { pref: '大阪府', city: '摂津市',   district: '正雀',     client: '工場・物流センター向け' },
  { pref: '大阪府', city: '寝屋川市', district: '寝屋川',   client: '食品・医療機器卸' },
  { pref: '大阪府', city: '堺市',     district: '北区新金岡', client: '企業・事業所向け日用品' },
  { pref: '大阪府', city: '堺市',     district: '堺区堺',   client: '商業施設・工場向け資材' },
  { pref: '大阪府', city: '高槻市',   district: '高槻',     client: '食品・工業資材メーカー' },
  { pref: '大阪府', city: '枚方市',   district: '牧野',     client: '医療機器・事業所向け用品' },
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

console.log(`\n完了: ${created}件作成（ルート配送ドライバー（企業配送）第7弾・大阪15件）`);
