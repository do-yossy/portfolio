'use strict';
// ヘアサロン向け配送スタッフ 求人15件（Bigeyes・求人ボックス掲載）
// 会社: BigEyesコーポレーション株式会社(bg) / 給与: 月給39万円〜45万円
// 本文は求人ボックスの下書き（求人No.5148-4590-0004）の正式全文と同一
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
const TITLE_TAIL = '未経験歓迎★ヘアサロン向け配送スタッフ★月給39万円以上★普通免許OK★完全週休二日制';
const SALARY_DETAIL = '月給390,000円〜450,000円';

// 東京エリア（Bigeyes）
const AREAS = [
  { pref: '東京都', city: '渋谷区', district: '代官山' },
  { pref: '東京都', city: '港区', district: '麻布十番' },
  { pref: '東京都', city: '中央区', district: '銀座' },
];

// ── 求人ボックス下書き 5148-4590-0004 の正式全文 ──
const DESCRIPTION = `事業拡大および物流体制強化に伴い、関西エリアで新たな仲間を募集しています。

現在、多くのヘアサロン・美容室・美容関連企業様よりご依頼をいただいており、さらなる事業拡大に向けて新しい仲間を募集しています。

ヘアサロンや美容室へ美容用品やサロン専売品をお届けする配送スタッフのお仕事です。

配送に使用する車両やガソリン代、保険、メンテナンス費用はすべて会社負担。

固定ルート中心のため、未経験の方でも安心してスタートできます。

【主な業務内容】

■ 配送業務
ヘアサロンや美容室への商品の配送
美容用品やサロン専売品の納品
配送ルートに沿った商品のお届け
配送伝票や納品書の確認

■ 商品管理業務
商品の積み込み、積み下ろし
納品商品の確認
簡単な在庫確認

■ その他業務
配送完了報告
車両の日常点検
簡単な清掃業務
配送記録の入力

【取扱商品例】
シャンプー
トリートメント
カラー剤
スタイリング剤
美容機器
サロン専売品
各種美容商材`;

const REWARDING = `日勤専属で生活リズムが安定
固定ルート中心で未経験でも始めやすい
車両・ガソリン代など完全会社負担
コスメ業界を支える安定企業
配送業未経験スタート多数
研修制度ありで安心スタート`;

const QUALIFICATIONS = `普通自動車運転免許（AT限定可）
運転経験3年以上の方
未経験歓迎
学歴不問

【こんな方歓迎】
運転が好きな方
美容業界に興味がある方
人と接することが苦にならない方`;

const WORKTIME = `シフト制（実働8時間／休憩1時間）

9:00～18:00
完全週休二日制

年次有給休暇
長期休暇
産休・育休制度
夏季休暇
介護休暇
年間休日120日`;

const TRANSPORTATION = `車通勤可能
転勤なし`;

const BENEFIT = `昇給・賞与あり（前年度実績あり）昇給年１回、賞与年２回
通勤手当支給
家族手当
深夜手当
月給 ￥390,000 ～ ￥450,000

社会保険完備
交通費支給
定期健康診断
有給休暇制度あり`;

const HOW_TO_APPLY = `【応募後のご案内】

ご応募確認後、採用受付代行担当者よりお電話にてご連絡いたします。

また、ご経験・ご希望条件等を踏まえ、ご本人の同意をいただいた上で、関連求人や提携企業求人をご案内させていただく場合がございます。`;

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='${JOB_TYPE}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存ヘアサロン向け配送スタッフを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications,benefit)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】${TITLE_TAIL}`;
  const catchcopy = `美容業界を支える、やりがいのあるお仕事♪ヘアサロンや美容室へ美容用品やサロン専売品をお届けします。月給39万円以上・普通免許OK・完全週休二日制・固定ルート中心で安心。車両費用はすべて会社負担です。`;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', '普通免許OK',
    '車両費用会社負担', '完全週休2日', '固定ルート', '日勤専属',
    '長距離運転なし', '賞与年2回',
  ]);

  stmt.run(
    id, title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, JOB_TYPE, '正社員',
    DESCRIPTION, tags, catchcopy, IMAGE_URL,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now, COMPANY,
    REWARDING, WORKTIME, TRANSPORTATION, HOW_TO_APPLY, QUALIFICATIONS, BENEFIT,
  );

  console.log(`✓ [${i + 1}/${AREAS.length}] ${title.slice(0, 55)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（Bigeyes・ヘアサロン向け配送スタッフ・東京3件(第3弾)・本文は求人No.5148-4590-0004と同一）`);
