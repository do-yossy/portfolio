'use strict';
// ヘアサロン向け配送スタッフ 求人15件（Bigeyes・求人ボックス掲載）
// 会社: BigEyesコーポレーション株式会社(bg) / 給与: 月給39万円〜45万円
// 添付バナー（ヘアサロン向け配送スタッフ）をテンプレート化し、大阪府内の勤務地に拡散
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'bg';
const IMAGE_URL = '/images/hairsalon-haisou.jpg';
const JOB_TYPE = 'ヘアサロン向け配送スタッフ';
const SALARY_INCOME = '月給39万円〜45万円';
const SALARY_DETAIL = '月給390,000円〜450,000円（各種手当込み）';

// 大阪府内15エリア（Bigeyesヘアサロン配送の勤務地）
const AREAS = [
  { pref: '大阪府', city: '大阪市', district: '天王寺区上本町' },
  { pref: '大阪府', city: '大阪市', district: '浪速区難波中' },
  { pref: '大阪府', city: '大阪市', district: '都島区都島本通' },
  { pref: '大阪府', city: '大阪市', district: '福島区福島' },
  { pref: '大阪府', city: '大阪市', district: '港区弁天町' },
  { pref: '大阪府', city: '大阪市', district: '生野区鶴橋' },
  { pref: '大阪府', city: '大阪市', district: '阿倍野区阿倍野' },
  { pref: '大阪府', city: '大阪市', district: '西成区岸里' },
  { pref: '大阪府', city: '守口市',   district: '八雲' },
  { pref: '大阪府', city: '門真市',   district: '幸福町' },
  { pref: '大阪府', city: '寝屋川市', district: '早子町' },
  { pref: '大阪府', city: '茨木市',   district: '別院町' },
  { pref: '大阪府', city: '岸和田市', district: '別所町' },
  { pref: '大阪府', city: '松原市',   district: '阿保' },
  { pref: '大阪府', city: '大東市',   district: '住道' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='${JOB_TYPE}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存ヘアサロン向け配送スタッフを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】未経験歓迎★ヘアサロン向け配送スタッフ★${SALARY_INCOME}★普通免許OK★完全週休二日`;
  const catchcopy = `美容業界を支える、やりがいのあるお仕事♪ヘアサロンや美容室へ美容用品やサロン専売品をお届けします。${SALARY_INCOME}・普通免許OK・完全週休二日制・長距離運転なしで安心。車両費用はすべて会社負担です。`;
  const description = `■お仕事内容
ヘアサロンや美容室へ、美容用品やサロン専売品をお届けするお仕事です（${j.pref}${j.city}${j.district}エリア）。
固定ルート配送なので未経験でも始めやすく、長距離運転もありません。あなたの運転で、美容の現場を支えませんか？

■主な業務
・ヘアサロン・美容室への美容用品／サロン専売品の配送
・出発前の車両点検・荷積み
・納品・荷降ろし
・受け取りサイン・伝票管理
・配達記録の入力

■取扱商品例
・シャンプー・トリートメント
・カラー剤
・スタイリング剤
・美容機器
・サロン専売品・各種美容商材

※固定ルート配送で未経験でも始めやすい
※長距離運転なしで安心
※日勤メイン
※ナビ使用のため土地感不要

■アピールポイント
◎${SALARY_INCOME}の高収入
昇給年1回・賞与年2回あり。各種手当も充実で安心の待遇。

◎車両・ガソリン代・保険・メンテナンス費用はすべて会社負担
マイカー不要。コストは一切かかりません。

◎未経験歓迎・研修制度が充実
研修制度が充実しているので、配送のお仕事が初めての方も安心です。

◎美容業界を支えるやりがい
サロンの"キレイ"を陰から支える、やりがいのあるお仕事です。

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
車両・燃料・保険・メンテナンス費用すべて会社負担
昇給年1回・賞与年2回
各種手当・研修制度あり

【入社後の流れ】
1週目：安全教育・配送ルール説明
2〜3週目：先輩スタッフ同行OJT
4週目以降：担当ルートを独立して配送

転勤なし・長距離運転なし
【勤務期間】長期`;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', '普通免許OK',
    '車両費用会社負担', '完全週休2日', '固定ルート', '日勤メイン',
    '長距離運転なし', '賞与年2回',
  ]);
  const rewarding = `美容業界を支える、やりがいのあるお仕事です。あなたの運転でサロンの"キレイ"を陰から支えられます。${SALARY_INCOME}の高収入と充実した待遇で、未経験からでも安心して長く働けます。`;
  const worktime = '日勤メイン（8:00〜17:00）　実働8時間　完全週休二日制　年間休日120日';
  const transport = `${j.pref}${j.city}${j.district}エリア。社用車を貸与するためマイカー不要。車両・燃料・保険費用はすべて会社負担です。`;
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

console.log(`\n完了: ${created}件作成（Bigeyes・ヘアサロン向け配送スタッフ・大阪府15件）`);
