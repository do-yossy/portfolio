'use strict';
// EC倉庫配送スタッフ 求人15件（Bigeyes・求人ボックス掲載）
// 会社: BigEyesコーポレーション株式会社(bg) / 給与: 月給40万円〜44万円（夜勤専属 22:00〜7:00）
// 本文は求人ボックスの下書き（求人No.5148-4590-0002）の正式全文と同一
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const vary = require('./scripts/lib/kyujinbox-vary-bgst');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'bg';
const IMAGE_URL = '/images/ec-souko-haisou.jpg';
const JOB_TYPE = 'EC倉庫配送スタッフ';
const TITLE_TAIL = '未経験歓迎★EC倉庫配送スタッフ★月給40万円以上★普通免許OK★完全週休二日制';
const SALARY_DETAIL = '月給400,000円〜440,000円';

// 東京エリア（Bigeyes）
const AREAS = [
  { pref: '東京都', city: '品川区', district: '東品川' },
  { pref: '東京都', city: '大田区', district: '平和島' },
  { pref: '東京都', city: '江東区', district: '新木場' },
  { pref: '東京都', city: '港区', district: '海岸' },
  { pref: '東京都', city: '中央区', district: '晴海' },
  { pref: '東京都', city: '江戸川区', district: '臨海町' },
  { pref: '東京都', city: '足立区', district: '加平' },
  { pref: '東京都', city: '板橋区', district: '舟渡' },
  { pref: '東京都', city: '北区', district: '豊島' },
  { pref: '東京都', city: '葛飾区', district: '奥戸' },
  { pref: '東京都', city: '世田谷区', district: '千歳台' },
  { pref: '東京都', city: '杉並区', district: '上井草' },
  { pref: '東京都', city: '練馬区', district: '北町' },
  { pref: '東京都', city: '八王子市', district: '子安町' },
  { pref: '東京都', city: '立川市', district: '曙町' },
];

// ── 求人ボックス下書き 5148-4590-0002 の正式全文 ──
const DESCRIPTION = `事業拡大および物流体制強化に伴い、関西エリアで新たな仲間を募集しています。

現在、多くのお取引先様からご依頼をいただいており、今後さらなる事業成長を見据えて組織体制の強化を進めています。

倉庫内での商品管理や積み込み作業、取引先への配送業務を担当していただくお仕事です。

配送に使用する車両やガソリン代、保険、メンテナンス費用はすべて会社負担。

固定ルート中心のため、未経験の方でも安心してスタートできます。

【主な業務内容】

■ 倉庫業務

商品の入出庫管理
仕分け作業
在庫確認
出荷準備
配送商品の積み込み

■ 配送業務
取引先への商品の配送
配送ルートに沿った納品
配送伝票の確認
配送完了報告

■ その他業務
車両の日常点検
簡単な清掃業務
配送記録の入力

【取扱商品例】
日用品
雑貨類
美容関連商品
小型機器
各種物流商品`;

const REWARDING = `夜勤専属で高収入
未経験歓迎
固定ルート中心
普通免許で応募可能
車両費用完全会社負担
研修制度充実
安定した仕事量
長距離運転少なめ
配送未経験スタート多数活躍中`;

const QUALIFICATIONS = `普通自動車運転免許（AT限定可）
運転経験3年以上の方
未経験歓迎
学歴不問

【こんな方歓迎】
運転が好きな方
美容業界に興味がある方
人と接することが苦にならない方`;

const WORKTIME = `シフト制（実働8時間／休憩1時間）

22:00～7:00
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
月給 ￥400,000 ～ ￥440,000

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
if (del.changes > 0) console.log(`既存EC倉庫配送スタッフを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications,benefit)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const _v = vary.build('bg_ec_souko', areaLabel);
  const id = crypto.randomBytes(10).toString('hex');
  const title = _v.title;
  const catchcopy = _v.catchcopy;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', '普通免許OK',
    '車両費用会社負担', '完全週休2日', '固定ルート', '夜勤専属',
    '深夜手当あり', '賞与年2回',
  ]);

  stmt.run(
    id, title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, JOB_TYPE, '正社員',
    _v.description, tags, catchcopy, IMAGE_URL,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now, COMPANY,
    REWARDING, WORKTIME, TRANSPORTATION, HOW_TO_APPLY, QUALIFICATIONS, BENEFIT,
  );

  console.log(`✓ [${i + 1}/${AREAS.length}] ${title.slice(0, 55)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（Bigeyes・EC倉庫配送スタッフ・東京15件・本文は求人No.5148-4590-0002と同一）`);
