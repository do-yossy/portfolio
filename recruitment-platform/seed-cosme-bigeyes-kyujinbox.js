'use strict';
// コスメ製造スタッフ 求人15件（Bigeyes・求人ボックス掲載）
// 会社: BigEyesコーポレーション株式会社(bg) / 給与: 月給25万円〜32万円
// 添付バナー（コスメ製造スタッフ）をテンプレート化し、大阪府内の勤務地に拡散
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'bg';
const IMAGE_URL = '/images/cosme-seizou.jpg';
const JOB_TYPE = 'コスメ製造スタッフ';
const SALARY_INCOME = '月給25万円〜32万円';
const SALARY_DETAIL = '月給250,000円〜320,000円（各種手当込み）';

// 大阪府内15エリア（Bigeyesコスメ製造の勤務地）
const AREAS = [
  { pref: '大阪府', city: '大阪市', district: '中央区本町',   plant: '化粧品・美容関連商品の製造工場' },
  { pref: '大阪府', city: '大阪市', district: '北区中之島',   plant: '化粧品・美容関連商品の製造工場' },
  { pref: '大阪府', city: '大阪市', district: '西区新町',     plant: '化粧品・スキンケア製品の製造工場' },
  { pref: '大阪府', city: '大阪市', district: '淀川区西中島', plant: '化粧品・美容関連商品の製造工場' },
  { pref: '大阪府', city: '大阪市', district: '東成区大今里', plant: '化粧品・日用品の製造工場' },
  { pref: '大阪府', city: '大阪市', district: '城東区今福',   plant: '化粧品・美容関連商品の製造工場' },
  { pref: '大阪府', city: '大阪市', district: '住之江区南港', plant: '化粧品・スキンケア製品の製造工場' },
  { pref: '大阪府', city: '大阪市', district: '平野区加美',   plant: '化粧品・美容関連商品の製造工場' },
  { pref: '大阪府', city: '東大阪市', district: '長田',       plant: '化粧品・美容関連商品の製造工場' },
  { pref: '大阪府', city: '八尾市',   district: '太子堂',     plant: '化粧品・日用品の製造工場' },
  { pref: '大阪府', city: '吹田市',   district: '江の木町',   plant: '化粧品・スキンケア製品の製造工場' },
  { pref: '大阪府', city: '豊中市',   district: '庄内',       plant: '化粧品・美容関連商品の製造工場' },
  { pref: '大阪府', city: '高槻市',   district: '幸町',       plant: '化粧品・美容関連商品の製造工場' },
  { pref: '大阪府', city: '枚方市',   district: '招提',       plant: '化粧品・日用品の製造工場' },
  { pref: '大阪府', city: '堺市',     district: '堺区戎島',   plant: '化粧品・美容関連商品の製造工場' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='${JOB_TYPE}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存コスメ製造スタッフを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】未経験歓迎★コスメ製造スタッフ★土日休み★年間休日123日★${SALARY_INCOME}`;
  const catchcopy = `未経験から始める、キレイをつくるお仕事♪化粧品や美容関連商品の製造・検品・梱包。${SALARY_INCOME}・土日休み・年間休日123日・空調完備の快適な職場環境で正社員として安定して働けます。`;
  const description = `■お仕事内容
${j.plant}（${j.pref}${j.city}${j.district}）でのコスメ製造スタッフのお仕事です。
化粧品や美容関連商品の製造・検品・梱包などを行います。未経験から「キレイをつくる」お仕事を始められます。

■主な業務
・コスメ商品の製造補助
・商品の検品作業（目視チェック）
・商品の仕分け作業
・梱包・箱詰め作業
・出荷ラベルの貼付
・簡単なデータ入力
・製造ラインのサポート業務

※重い物の扱いは少なめ・体への負担が少ない軽作業中心
※空調完備の快適な職場環境
※マニュアル完備・丁寧な研修あり
※工場勤務が初めての方も安心してスタートできます

■アピールポイント
◎${SALARY_INCOME}の安定収入
昇給年1回・賞与年2回あり。通勤手当・家族手当・残業手当も充実。

◎未経験歓迎・充実の研修
安全教育・作業研修からスタート。先輩スタッフが丁寧にサポートするので、工場勤務が初めての方も安心です。

◎土日休み・年間休日123日
完全週休二日制でプライベートも充実。しっかり休めてオン・オフの切り替えができます。

◎空調完備の快適な職場環境
一年を通して働きやすい環境を整えています。

◎各種休暇制度・社会保険完備
産休・育休・介護休暇など制度が充実。安心して長く働ける環境です。

◎正社員採用
安定した雇用で、長期的にキャリアを築けます。

【給与】
${SALARY_DETAIL}

【シフト・勤務時間】
日勤メイン：8:00〜17:00（実働8時間）
残業少なめ

【休日・休暇】
完全週休二日制（土日休み）
年間休日123日
有給休暇・産休育休・介護休暇・慶弔休暇

【応募資格】
年齢・学歴・経験不問
※未経験・ブランクのある方も大歓迎

【待遇・福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
通勤手当・家族手当・残業手当
昇給年1回・賞与年2回
制服貸与・研修制度あり

【入社後の流れ】
1〜2週目：安全教育・作業研修
3〜4週目：先輩スタッフ同行OJT
2ヶ月目以降：担当工程を独立して担当

転勤なし
車通勤可能
【勤務期間】長期`;

  const tags = JSON.stringify([
    '未経験OK', '正社員', '土日休み', '年間休日123日',
    '空調完備', '賞与年2回', '各種手当あり', '社会保険完備',
    '軽作業', '女性活躍',
  ]);
  const rewarding = `美容業界を支える、やりがいのあるお仕事です。あなたの手でコスメ商品が仕上がり、多くの人の「キレイ」を届けられます。${SALARY_INCOME}の安定収入と充実した福利厚生で、未経験からでも長く安心して働けます。`;
  const worktime = '日勤メイン 8:00〜17:00（実働8時間）　残業少なめ　完全週休二日制（土日休み）　年間休日123日';
  const transport = `${j.pref}${j.city}${j.district}エリア。車通勤OK。公共交通機関利用の場合は通勤手当を支給します。`;
  const howToApply = 'このページよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';

  stmt.run(
    id, title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, JOB_TYPE, '正社員',
    description, tags, catchcopy, IMAGE_URL,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now, COMPANY,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/${AREAS.length}] ${title.slice(0, 55)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（Bigeyes・コスメ製造スタッフ・大阪府15件）`);
