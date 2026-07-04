'use strict';
// 美容機器運搬ドライバー 求人15件（Bigeyes・求人ボックス掲載）
// 会社: BigEyesコーポレーション株式会社(bg) / 給与: 月給39万円〜45万円
// 添付バナー（美容機器運搬ドライバー）をテンプレート化し、大阪府内の勤務地に拡散
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'bg';
const IMAGE_URL = '/images/biyoukiki-driver.jpg';
const JOB_TYPE = '美容機器運搬ドライバー';
const SALARY_INCOME = '月給39万円〜45万円';
const SALARY_DETAIL = '月給390,000円〜450,000円（各種手当込み）';

// 大阪府内15エリア（Bigeyes美容機器運搬ドライバーの勤務地）
const AREAS = [
  { pref: '大阪府', city: '大阪市', district: '中央区南船場' },
  { pref: '大阪府', city: '大阪市', district: '北区梅田' },
  { pref: '大阪府', city: '大阪市', district: '西区北堀江' },
  { pref: '大阪府', city: '大阪市', district: '淀川区十三' },
  { pref: '大阪府', city: '大阪市', district: '東淀川区淡路' },
  { pref: '大阪府', city: '大阪市', district: '鶴見区放出' },
  { pref: '大阪府', city: '大阪市', district: '旭区千林' },
  { pref: '大阪府', city: '大阪市', district: '住吉区長居' },
  { pref: '大阪府', city: '東大阪市', district: '荒本' },
  { pref: '大阪府', city: '八尾市',   district: '光町' },
  { pref: '大阪府', city: '吹田市',   district: '広芝町' },
  { pref: '大阪府', city: '摂津市',   district: '千里丘' },
  { pref: '大阪府', city: '大東市',   district: '赤井' },
  { pref: '大阪府', city: '守口市',   district: '滝井' },
  { pref: '大阪府', city: '堺市',     district: '北区中百舌鳥' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='${JOB_TYPE}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存美容機器運搬ドライバーを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】未経験歓迎★美容機器運搬ドライバー★${SALARY_INCOME}★普通免許OK★完全週休二日`;
  const catchcopy = `美容業界を支える、やりがいのあるお仕事♪サロン・美容室・取引先店舗へ、美容機器や関連商材を安全・確実にお届けします。${SALARY_INCOME}・普通免許OK・会社車両完備・完全週休二日制。固定ルートで安心、車両費用はすべて会社負担です。`;
  const description = `■お仕事内容
サロン・美容室・取引先店舗へ、美容機器や関連商材を安全・確実にお届けするお仕事です（${j.pref}${j.city}${j.district}エリア）。
固定ルート配送で担当エリア中心のため道も覚えやすく、未経験でも安心してスタートできます。あなたの運転で、美容の未来を支えませんか？

■主な業務
・サロン・美容室・取引先店舗への美容機器／関連商材の配送
・出発前の車両点検・荷積み
・機器の搬入・設置補助
・受け取りサイン・伝票管理
・配達記録の入力

■取扱商品例
・美容機器（ドライヤー・スチーマー・カットチェアなど）
・ヘアケア・美容用品（シャンプー・トリートメント・スタイリング剤など）
・サロン専売品（サロン専用備品・店販商品など）
・消耗品・備品（カラー剤・タオル・クロスなど）
・関連商材（ワゴン・スツール・ミラー・その他備品など）

※固定ルート配送で担当エリア中心・道も覚えやすい
※日勤メイン
※ナビ使用のため土地感不要
※会社車両完備でマイカー不要

■アピールポイント
◎${SALARY_INCOME}の高収入
昇給年1回・賞与年2回あり。各種手当も充実で安心の待遇。

◎車両・ガソリン代・保険・メンテナンス費用はすべて会社負担
会社車両完備。マイカー不要でコストは一切かかりません。

◎未経験歓迎・研修制度が充実
研修制度があるので、配送のお仕事が初めての方も安心してスタートできます。

◎美容業界を支えるやりがい
美容の現場を支える大切なお仕事。感謝されるやりがいがあります。

◎完全週休二日制・年間休日120日
プライベートも充実。オン・オフの切り替えができます。

◎正社員採用・普通免許OK
普通自動車免許があればOK。安定して長く働けます。

【給与】
${SALARY_DETAIL}

【シフト・勤務時間】
日勤メイン（8:00〜17:00）
実働8時間

【休日・休暇】
完全週休二日制
年間休日120日
有給休暇・慶弔休暇

【応募資格】
普通自動車運転免許（AT限定可）
年齢・学歴・経験不問

【待遇・福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
会社車両完備・車両／燃料／保険／メンテナンス費用すべて会社負担
昇給年1回・賞与年2回
各種手当・研修制度あり

【入社後の流れ】
1週目：安全教育・配送ルール説明
2〜3週目：先輩スタッフ同行OJT
4週目以降：担当ルートを独立して配送

転勤なし
【勤務期間】長期`;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', '普通免許OK',
    '会社車両完備', '完全週休2日', '固定ルート', '日勤メイン',
    '車両費用会社負担', '賞与年2回',
  ]);
  const rewarding = `美容業界を支える、やりがいのあるお仕事です。あなたの運転で、美容機器や商材を必要とするサロンへ確実にお届けし、美容の未来を支えられます。${SALARY_INCOME}の高収入と充実した待遇で、未経験からでも安心して長く働けます。`;
  const worktime = '日勤メイン（8:00〜17:00）　実働8時間　完全週休二日制　年間休日120日';
  const transport = `${j.pref}${j.city}${j.district}エリア。会社車両を貸与するためマイカー不要。車両・燃料・保険・メンテナンス費用はすべて会社負担です。`;
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

console.log(`\n完了: ${created}件作成（Bigeyes・美容機器運搬ドライバー・大阪府15件）`);
