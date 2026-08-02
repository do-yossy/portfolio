'use strict';
// SQ（company='sq'）大阪府 追加バッチ：配送ドライバー15件 ＋ 製造系10件 ＝ 計25件（求人ボックス掲載）
// 大阪府の新規エリア（既存SQ seedと重複しない実在の市区町・丁目まで一意）で構成。
//   - 配送15件: seed-sq-weekly-restock-kyujinbox.js のルート配送テンプレを踏襲（勤務地のみ大阪の新エリアに差し替え）。
//   - 製造10件: seed_kyujinbox_factory.js の 倉庫内軽作業／検品・検査／機械オペレーター テンプレを流用（大阪の新エリアで）。
// 既存SQ seedとの重複回避（確認済み）:
//   - google-jobs は大阪市の区・堺市中区/北区・八尾/吹田/守口/摂津/東大阪/松原/豊中を「区・市」レベル（丁目なし）で使用。
//   - weekly-restock の大阪は 堺市中区深井沢町／東大阪市長田／豊中市岡町／吹田市江坂町 の4件のみ。
//   - restock2・factory は大阪未使用。
//   本バッチは上記いずれとも一致しない区・市＋丁目で構成し、location文字列が全て新規になるようにしている。
// 冪等: 本バッチの25勤務地（company='sq' かつ 求人ボックス）のみ削除してから作り直す（他バッチは消さない＝追加）。
//   DBはサーバの db.js がテーブル作成済み前提（空DB検証時は先に db.js を require してスキーマ作成すること）。

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

// 本ファイルは scripts/ 配下のため、__dirname から '..','data' を挟んで data/recruitment.db を解決する。
const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// ------------------------------------------------------------------
// 配送ドライバー（ルート配送）テンプレ設定
// ------------------------------------------------------------------
const HAISOU_IMAGE = '/images/ec-haisou-koujikyuu.jpg';
const HAISOU_SALARY_INCOME = '月給42万円〜62万円';
const HAISOU_SALARY_DETAIL = '月給420,000円〜620,000円（歩合・各種手当込み）';
const HAISOU_JOB_TYPE = 'ルート配送ドライバー（企業配送）';

// 配送15件：大阪府の新規エリア（大阪市の未使用区＋堺区／各件ユニークな実在の市区町・丁目）。
const HAISOU_AREAS = [
  { pref: '大阪府', city: '大阪市都島区',   district: '東野田町1丁目', client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '大阪市福島区',   district: '海老江2丁目',   client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '大阪市此花区',   district: '西九条3丁目',   client: '企業・商業施設向け日用品' },
  { pref: '大阪府', city: '大阪市港区',     district: '市岡1丁目',     client: '食品・日用品卸売' },
  { pref: '大阪府', city: '大阪市大正区',   district: '三軒家東2丁目', client: '食品・工業用品メーカー' },
  { pref: '大阪府', city: '大阪市浪速区',   district: '難波中3丁目',   client: '医療機器・事業所向け用品' },
  { pref: '大阪府', city: '大阪市西淀川区', district: '御幣島1丁目',   client: '工場・物流センター向け' },
  { pref: '大阪府', city: '大阪市淀川区',   district: '西中島5丁目',   client: '食品・工業資材メーカー' },
  { pref: '大阪府', city: '大阪市東淀川区', district: '東中島4丁目',   client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '大阪市東成区',   district: '中道2丁目',     client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '大阪市生野区',   district: '巽中1丁目',     client: '企業・商業施設向け日用品' },
  { pref: '大阪府', city: '大阪市阿倍野区', district: '阪南町3丁目',   client: '食品・日用品卸売' },
  { pref: '大阪府', city: '大阪市住之江区', district: '新北島1丁目',   client: '食品・工業用品メーカー' },
  { pref: '大阪府', city: '大阪市西成区',   district: '玉出中2丁目',   client: '医療機器・事業所向け用品' },
  { pref: '大阪府', city: '堺市堺区',       district: '戎島町4丁目',   client: '工場・物流センター向け' },
];

// ------------------------------------------------------------------
// 製造系テンプレ設定（seed_kyujinbox_factory.js を流用）
// ------------------------------------------------------------------
const SEIZOU_IMAGE = '/images/ec-haisou-koujikyuu.jpg';

const ROLES = {
  warehouse: {
    jobType: '倉庫内軽作業',
    titleRole: '倉庫内軽作業（ピッキング・仕分け）',
    work: `・棚から指定の商品を集めるピッキング
・商品の仕分け・棚入れ
・出荷前の梱包・ラベル貼り
ハンディ端末を使った簡単な作業が中心で、重量物はほとんどありません。`,
    appeal: 'もくもく作業が好きな方にぴったり。覚えることが少なく、初日から活躍できます。',
    reward: '商品をピッキング・仕分けするシンプルな軽作業。立ち仕事ですが重い荷物は少なく、体への負担が軽めです。',
  },
  inspection: {
    jobType: '検品・検査',
    titleRole: '検品・検査スタッフ',
    work: `・完成した製品にキズや汚れがないかの目視チェック
・サイズや数量の確認
・問題のある製品の取り分け
座り作業・立ち作業どちらもあり、細かい作業が好きな方に向いています。`,
    appeal: '丁寧にコツコツ取り組める方を歓迎。空調完備の快適な環境で一年中働きやすいです。',
    reward: '製品の状態を目視でチェックするシンプルな検品作業。きれいな環境で座り作業中心の職場もあります。',
  },
  operator: {
    jobType: '機械オペレーター',
    titleRole: '機械オペレーター',
    work: `・機械に材料をセットしてボタンを操作
・加工された製品の取り出し・チェック
・かんたんな機械のメンテナンス
操作はマニュアル化されているので、機械を触るのが初めての方でも安心です。`,
    appeal: '機械が作業してくれるので体力に自信がなくてもOK。手に職をつけたい方にもおすすめです。',
    reward: '機械の操作・監視がメインのお仕事。一度覚えれば安定して働け、スキルも身につきます。',
  },
};

// 製造10件：大阪府の新規エリア（各件ユニークな実在の市区町・丁目）。job_type を3種に分散。
const SEIZOU_AREAS = [
  { pref: '大阪府', city: '堺市西区',   district: '築港新町1丁目',   salary: [28, 34], role: 'warehouse' },
  { pref: '大阪府', city: '堺市南区',   district: '宮山台2丁目',     salary: [29, 36], role: 'inspection' },
  { pref: '大阪府', city: '堺市東区',   district: '日置荘原寺町',     salary: [29, 37], role: 'operator' },
  { pref: '大阪府', city: '東大阪市',   district: '西石切町3丁目',   salary: [30, 38], role: 'warehouse' },
  { pref: '大阪府', city: '東大阪市',   district: '高井田中4丁目',   salary: [28, 35], role: 'inspection' },
  { pref: '大阪府', city: '豊中市',     district: '二葉町2丁目',     salary: [29, 37], role: 'operator' },
  { pref: '大阪府', city: '吹田市',     district: '片山町1丁目',     salary: [27, 33], role: 'warehouse' },
  { pref: '大阪府', city: '茨木市',     district: '宮島1丁目',       salary: [28, 36], role: 'inspection' },
  { pref: '大阪府', city: '高槻市',     district: '芥川町2丁目',     salary: [28, 34], role: 'operator' },
  { pref: '大阪府', city: '寝屋川市',   district: '点野1丁目',       salary: [29, 37], role: 'warehouse' },
];

// ------------------------------------------------------------------
// 冪等削除：本バッチ25勤務地（company='sq' かつ 求人ボックス）のみ削除
// ------------------------------------------------------------------
const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const haisouLocations = HAISOU_AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const seizouLocations = SEIZOU_AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const allLocations = [...haisouLocations, ...seizouLocations];
const placeholders = allLocations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE company='sq' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...allLocations);
if (del.changes > 0) console.log(`既存の同一勤務地バッチを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

// ------------------------------------------------------------------
// 配送15件 投入
// ------------------------------------------------------------------
let createdHaisou = 0;
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
  createdHaisou++;
}

// ------------------------------------------------------------------
// 製造10件 投入
// ------------------------------------------------------------------
function buildSeizouDescription(locLabel, r) {
  return `${locLabel}のきれいな倉庫・工場での${r.titleRole}のお仕事です。${r.appeal}

【仕事内容】
${r.work}

【未経験者が活躍中】
スタッフの約8割が未経験スタート。先輩が一から丁寧に教えるので、ブランクのある方や初めての方でも安心してスタートできます。

【正社員で安定】
・賞与年2回 / 昇給年1回
・各種社会保険完備
・交通費支給 / 制服貸与
・長期で安定して働けます

【働きやすさ】
・日勤のみでプライベートも充実
・完全週休2日制（土日）で予定が立てやすい
・空調完備で一年中快適

【こんな方を歓迎】
・コツコツ取り組むのが得意な方
・安定した正社員を目指す方
・未経験から手に職をつけたい方`;
}

let createdSeizou = 0;
for (let i = 0; i < SEIZOU_AREAS.length; i++) {
  const a = SEIZOU_AREAS[i];
  const r = ROLES[a.role];
  const id = crypto.randomBytes(10).toString('hex');
  const location = `${a.pref}${a.city}${a.district}`;
  const areaLabel = `${a.city}・${a.district}`;
  const title = `【${areaLabel}】${r.titleRole}｜正社員｜未経験歓迎｜日勤・土日休み`;
  const salaryStr = `月給${a.salary[0]}万円〜${a.salary[1]}万円（各種手当込・試用期間3ヶ月／同条件）`;
  const catchcopy = `未経験OK／日勤のみ／完全週休2日／月給${a.salary[0]}万円〜${a.salary[1]}万円`;
  const description = buildSeizouDescription(`${a.pref}${a.city}${a.district}`, r);
  const tags = JSON.stringify([r.jobType, '正社員', '日勤', '完全週休2日', '未経験歓迎', '軽作業']);
  const worktime = '日勤のみ（8:00〜17:00 など）／完全週休2日制（土日）／年間休日120日以上／GW・夏季・年末年始の長期休暇あり／有給休暇';
  const transport = '規定により支給';
  const howToApply = 'ウェブフォームまたはお電話からご応募ください。書類選考後、面接（1回）を実施します。お気軽にご応募ください。';

  stmt.run(
    id, title, location, salaryStr, r.jobType, '正社員',
    description, tags, catchcopy, SEIZOU_IMAGE,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    r.reward, worktime, transport, howToApply,
  );

  console.log(`✓ [製造 ${i + 1}/${SEIZOU_AREAS.length}] ${title.slice(0, 60)}  (${salaryStr})`);
  createdSeizou++;
}

console.log(`\n完了: 配送${createdHaisou}件 ＋ 製造${createdSeizou}件 ＝ 計${createdHaisou + createdSeizou}件作成（SQ・大阪府新規エリア・求人ボックス）`);
