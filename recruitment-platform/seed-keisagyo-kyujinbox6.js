'use strict';
// 工場軽作業スタッフ 求人10件・第6弾・全国（求人ボックス掲載）
// 月収30万円以上（月給30〜37万円）・第1〜5弾と被りなし
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const IMAGE_URL = '/images/kikai-opareta-tetsukou.jpg';
const SALARY_INCOME = '月収30万円以上';
const SALARY_DETAIL = '月給300,000円〜370,000円（各種手当込み）';

// 全国10エリア（軽作業第1〜5弾・機械オペレーター全弾・配送全弾と被りなし）
// 本弾: 大館,米沢,那須塩原,ひたちなか,上田,富士宮,伊勢,西脇,三原,都城（いずれも未使用）
const AREAS = [
  { pref: '秋田県',   city: '大館市',       facility: '食品・物流軽作業センター' },
  { pref: '山形県',   city: '米沢市',       facility: '製造工場・部品組立ライン' },
  { pref: '栃木県',   city: '那須塩原市',   facility: '食品・機械部品製造工場' },
  { pref: '茨城県',   city: 'ひたちなか市', facility: '製造工場・部品組立ライン' },
  { pref: '長野県',   city: '上田市',       facility: '精密機器・部品製造工場' },
  { pref: '静岡県',   city: '富士宮市',     facility: '食品・機械部品製造工場' },
  { pref: '三重県',   city: '伊勢市',       facility: '食品・日用品軽作業センター' },
  { pref: '兵庫県',   city: '西脇市',       facility: '食品・製造工場軽作業ライン' },
  { pref: '広島県',   city: '三原市',       facility: '食品・物流軽作業センター' },
  { pref: '宮崎県',   city: '都城市',       facility: '食品加工・物流軽作業センター' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => `${a.pref}${a.city}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='工場軽作業スタッフ' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存工場軽作業スタッフ第6弾を削除: ${del.changes}件`);

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

console.log(`\n完了: ${created}件作成（${SALARY_INCOME}・工場軽作業スタッフ・全国10件・第6弾）`);
