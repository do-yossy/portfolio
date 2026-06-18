'use strict';
// 機械オペレーター（鉄鋼・化学品）求人10件・第4弾（求人ボックス掲載・場所被りなし）
// 第1〜3弾・既存求人と被らない大手コンビナート拠点を選定
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// 掲載写真（機械オペレーター・鉄鋼化学品）
const KIKAI_IMAGE = '/images/kikai-opareta-tetsukou.jpg';
const SALARY_INCOME = '月収30万円以上（月給30万円〜37万円）';
const SALARY_DETAIL = '月給300,000円〜370,000円（各種手当込み）';

// 第4弾10エリア（全既存求人と被りなし）
// 除外済み第1弾: 千葉市原, 岡山倉敷, 広島福山, 兵庫姫路, 三重四日市,
//               大分大分, 山口周南, 北海道苫小牧, 福岡北九州, 静岡富士
// 除外済み第2弾: 埼玉春日部, 茨城つくば, 栃木小山, 長野佐久, 静岡浜松,
//               大阪東大阪, 滋賀大津, 愛媛松山, 福島郡山, 山形山形
// 除外済み第3弾: 茨城鹿嶋, 神奈川川崎, 和歌山和歌山, 兵庫加古川, 山口宇部,
//               愛知東海, 宮崎延岡, 新潟新潟, 千葉袖ケ浦, 岩手釜石
// 除外済み既存: 愛知刈谷/田原/名古屋, 岩手北上, 栃木宇都宮, 新潟長岡, 京都京都, 熊本菊池郡, 神奈川相模原
const AREAS = [
  { pref: '宮城県',   city: '仙台市',     plant: '仙台港臨海工業地帯',   specialty: '石油化学・金属製造' },
  { pref: '秋田県',   city: '秋田市',     plant: '秋田臨海工業地帯',     specialty: '金属・化学品製造' },
  { pref: '群馬県',   city: '太田市',     plant: '北関東工業地帯',       specialty: '自動車部材・金属加工製造' },
  { pref: '千葉県',   city: '千葉市',     plant: '京葉工業地帯',         specialty: '鉄鋼・石油化学製造' },
  { pref: '愛知県',   city: '豊田市',     plant: '中京工業地帯',         specialty: '鉄鋼・自動車部材製造' },
  { pref: '兵庫県',   city: '明石市',     plant: '播磨・阪神工業地帯',   specialty: '金属加工・化学品製造' },
  { pref: '香川県',   city: '坂出市',     plant: '坂出コンビナート',     specialty: '化学品・石油精製' },
  { pref: '鹿児島県', city: '薩摩川内市', plant: '薩摩川内臨海工業地帯', specialty: '鉄鋼・化学品製造' },
  { pref: '福岡県',   city: '大牟田市',   plant: '三池コンビナート',     specialty: '化学品・エネルギー製造' },
  { pref: '長崎県',   city: '長崎市',     plant: '長崎臨海工業地帯',     specialty: '造船・金属加工製造' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

// 対象拠点のみ削除
const locations = AREAS.map(a => `${a.pref}${a.city}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='機械オペレーター（鉄鋼・化学品）' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存機械オペレーター（鉄鋼・化学品）第4弾を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.pref}${j.city}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】機械オペレーター（鉄鋼・化学品）正社員募集｜${SALARY_INCOME}・資格取得支援あり`;
  const catchcopy = `${SALARY_INCOME}で安定した正社員雇用！${j.plant}での${j.specialty}オペレーター。未経験から始めてスキルアップを目指せます。`;
  const description = `■お仕事内容
${j.plant}（${j.pref}${j.city}）の大型製造ラインでの機械オペレーター業務です。
${j.specialty}を担う大規模コンビナート内で、製造ラインの操作・監視・メンテナンス補助を担当します。

■主な業務
・製造ラインの機械操作・運転管理
・各種メーター・センサーの監視業務
・製品品質チェック・記録入力
・機械の清掃・簡易メンテナンス補助
・異常発生時の速やかな報告対応

※資格取得支援制度あり（フォークリフト・玉掛け・クレーン等）
※日勤メイン（シフト制）
※作業エリアは空調完備
※チームでの協力作業のため、コミュニケーションを取りながら働けます

■アピールポイント
◎${SALARY_INCOME}の安定収入
月給30万円〜37万円の安定した収入。各種手当込みで月収30万円以上を実現。

◎未経験歓迎・丁寧な研修
入社後は先輩スタッフが1〜2ヶ月間OJTでしっかり指導。機械の知識がなくてもゼロから習得できます。

◎資格取得支援あり
フォークリフト・玉掛け・クレーン等の資格取得を会社が全面支援。スキルアップで昇給も目指せます。

◎年間休日120日以上
完全週休2日制。プライベートも充実した働き方ができます。

◎制服・安全靴貸与
必要な作業着・安全靴はすべて会社が貸与。自己負担なしで働けます。

◎正社員採用・社会保険完備
長期安定雇用。健康保険・厚生年金・雇用保険・労災保険に完全加入。

■給与内訳
基本給 + 各種手当（危険手当・精皆勤手当）
交通費支給（規定内）
昇給あり（年1回査定）
賞与年2回

【給与】
${SALARY_DETAIL}

【シフト・勤務時間】
日勤メイン：8:00〜17:00（実働8時間）
シフト制（希望休あり）

【休日・休暇】
完全週休2日制
年間休日120日以上
有給休暇・慶弔休暇

【応募資格】
年齢・学歴・経験不問
※資格・経験不問（入社後に取得支援あり）

【待遇・福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）
制服・安全靴貸与
資格取得支援（フォークリフト・玉掛け・クレーン等）
昇給あり（年1回査定）
賞与年2回

【入社後の流れ】
1〜2週目：社内研修・安全教育・設備説明
3〜6週目：先輩スタッフ同行OJT
2ヶ月目以降：担当工程を独立して担当

転勤なし

車通勤可能（無料駐車場あり）

【勤務期間】
長期`;

  const tags = JSON.stringify([
    '未経験OK', '月収30万円以上', '正社員', '資格取得支援',
    '年間休日120日以上', '制服・安全靴貸与', '社会保険完備', '昇給あり',
    '日勤メイン', '交通費支給',
  ]);
  const rewarding = `大型コンビナートの製造ラインを支えるやりがいのある仕事。${SALARY_INCOME}の安定収入と充実した福利厚生で、長期的にスキルアップしながら働けます。資格取得支援も充実しており、フォークリフト・クレーン等を取得して昇給を目指せます。`;
  const worktime = '日勤メイン 8:00〜17:00（実働8時間）　シフト制　完全週休2日　年間休日120日以上';
  const transport = `${j.pref}${j.city}（${j.plant}周辺）。車通勤OK・無料駐車場完備。公共交通機関利用の場合は交通費支給（規定内）。`;
  const howToApply = 'このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';

  stmt.run(
    id, title, `${j.pref}${j.city}`, SALARY_DETAIL, '機械オペレーター（鉄鋼・化学品）', '正社員',
    description, tags, catchcopy, KIKAI_IMAGE,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/10] ${title.slice(0, 50)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（${SALARY_INCOME}・大型コンビナート第4弾）`);
