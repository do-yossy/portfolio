'use strict';
// EC倉庫配送スタッフ 求人15件（Bigeyes・求人ボックス掲載）
// 会社: BigEyesコーポレーション株式会社(bg) / 給与: 月給40万円〜44万円
// 添付バナー（EC倉庫配送スタッフ）をテンプレート化し、大阪府内の勤務地に拡散
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'bg';
const IMAGE_URL = '/images/ec-souko-haisou.jpg';
const JOB_TYPE = 'EC倉庫配送スタッフ';
const SALARY_INCOME = '月給40万円〜44万円';
const SALARY_DETAIL = '月給400,000円〜440,000円（各種手当込み）';

// 大阪府内15エリア（BigeyesのEC倉庫配送スタッフの勤務地。物流拠点の多いエリア中心）
const AREAS = [
  { pref: '大阪府', city: '大阪市', district: '西淀川区姫島' },
  { pref: '大阪府', city: '大阪市', district: '此花区島屋' },
  { pref: '大阪府', city: '大阪市', district: '住之江区南港東' },
  { pref: '大阪府', city: '大阪市', district: '大正区鶴町' },
  { pref: '大阪府', city: '大阪市', district: '東淀川区東中島' },
  { pref: '大阪府', city: '大阪市', district: '平野区長吉' },
  { pref: '大阪府', city: '大阪市', district: '城東区関目' },
  { pref: '大阪府', city: '大阪市', district: '淀川区加島' },
  { pref: '大阪府', city: '東大阪市', district: '高井田' },
  { pref: '大阪府', city: '八尾市',   district: '泉町' },
  { pref: '大阪府', city: '摂津市',   district: '鳥飼本町' },
  { pref: '大阪府', city: '茨木市',   district: '宮島' },
  { pref: '大阪府', city: '門真市',   district: '松葉町' },
  { pref: '大阪府', city: '堺市',     district: '西区築港新町' },
  { pref: '大阪府', city: '豊中市',   district: '名神口' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='${JOB_TYPE}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存EC倉庫配送スタッフを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】未経験歓迎★EC倉庫配送スタッフ★${SALARY_INCOME}★普通免許OK★完全週休二日制`;
  const catchcopy = `${SALARY_INCOME}の高収入！EC（ネット通販）商品を倉庫から配送先へお届けするお仕事です。固定ルート中心・普通免許OK・完全週休二日制。車両・ガソリン代はすべて会社負担で、未経験から安心してスタートできます。`;
  const description = `■お仕事内容
EC（ネット通販）商品の倉庫配送スタッフのお仕事です（${j.pref}${j.city}${j.district}エリア）。
倉庫拠点で商品を積み込み、担当エリアの配送先へ確実にお届けします。固定ルート中心で道も覚えやすく、未経験でも始めやすいお仕事です。

■主な業務
・EC商品（ネット通販商品）の倉庫からの配送
・出発前の車両点検・荷積み（荷積み補助あり）
・納品・荷降ろし（荷降ろし補助あり）
・受け取りサイン・伝票管理
・配達記録の入力

※固定ルート中心で安心
※日勤メイン
※ナビ使用のため土地感不要
※社用車貸与でマイカー不要

■アピールポイント
◎${SALARY_INCOME}の高収入
昇給年1回・賞与年2回あり。各種手当も充実で安心の待遇。

◎車両・ガソリン代・保険・メンテナンス費用はすべて会社負担
マイカー不要。コストは一切かかりません。

◎未経験歓迎・研修制度あり
先輩スタッフが同行して丁寧に指導。配送のお仕事が初めての方も安心してスタートできます。

◎伸びているEC業界で安定して働ける
ネット通販の拡大で配送需要は右肩上がり。将来性のある業界で長く働けます。

◎完全週休二日制・年間休日120日
プライベートも充実。オン・オフの切り替えができます。

◎正社員採用・普通免許OK
普通自動車免許があればOK。安定して長く働けます。

【給与】
${SALARY_DETAIL}

【シフト・勤務時間】
日勤メイン（8:00〜17:00）
実働8時間・シフト制（希望休あり）

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

転勤なし
【勤務期間】長期`;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', '普通免許OK',
    '車両費用会社負担', '完全週休2日', '固定ルート', '日勤メイン',
    'EC・物流', '賞与年2回',
  ]);
  const rewarding = `${SALARY_INCOME}の高収入。拡大を続けるEC業界を配送で支える、やりがいのあるお仕事です。固定ルート中心で慣れれば効率よく働け、未経験からでも安心して長く続けられます。`;
  const worktime = '日勤メイン（8:00〜17:00）　実働8時間・シフト制　完全週休二日制　年間休日120日';
  const transport = `${j.pref}${j.city}${j.district}エリア。社用車を貸与するためマイカー不要。車両・燃料・保険・メンテナンス費用はすべて会社負担です。`;
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

console.log(`\n完了: ${created}件作成（Bigeyes・EC倉庫配送スタッフ・大阪府15件）`);
