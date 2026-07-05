'use strict';
// コスメ製造スタッフ 求人15件（Bigeyes・求人ボックス掲載）
// 会社: BigEyesコーポレーション株式会社(bg) / 給与: 月給25万円〜32万円
// 本文は求人ボックスの下書き（求人No.5148-4590-0005）の正式全文と同一
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
const TITLE_TAIL = '未経験歓迎★コスメ製造スタッフ★土日休み★年間休日123日★月給25万円以上';
const SALARY_DETAIL = '月給250,000円〜320,000円';

// 大阪府内15エリア（Bigeyesコスメ製造の勤務地）
const AREAS = [
  { pref: '大阪府', city: '大阪市', district: '中央区本町' },
  { pref: '大阪府', city: '大阪市', district: '北区中之島' },
  { pref: '大阪府', city: '大阪市', district: '西区新町' },
  { pref: '大阪府', city: '大阪市', district: '淀川区西中島' },
  { pref: '大阪府', city: '大阪市', district: '東成区大今里' },
  { pref: '大阪府', city: '大阪市', district: '城東区今福' },
  { pref: '大阪府', city: '大阪市', district: '住之江区南港' },
  { pref: '大阪府', city: '大阪市', district: '平野区加美' },
  { pref: '大阪府', city: '東大阪市', district: '長田' },
  { pref: '大阪府', city: '八尾市',   district: '太子堂' },
  { pref: '大阪府', city: '吹田市',   district: '江の木町' },
  { pref: '大阪府', city: '豊中市',   district: '庄内' },
  { pref: '大阪府', city: '高槻市',   district: '幸町' },
  { pref: '大阪府', city: '枚方市',   district: '招提' },
  { pref: '大阪府', city: '堺市',     district: '堺区戎島' },
];

// ── 求人ボックス下書き 5148-4590-0005 の正式全文 ──
const DESCRIPTION = `化粧品や美容関連商品の製造・検品・梱包を担当するお仕事です。

製造工程のサポート業務が中心となり、特別な知識や経験は必要ありません。

マニュアルに沿って作業を進めるため、未経験の方でも安心してスタートできます。

【主な業務内容】
コスメ商品の製造補助
商品の検品作業
商品の仕分け作業
梱包・箱詰め作業
出荷ラベルの貼付
簡単なデータ入力
製造ラインのサポート業務

【入社後の流れ】
入社後は安全教育と作業研修からスタートします。
先輩スタッフが丁寧にサポートするため、工場勤務未経験の方も安心です。`;

const REWARDING = `完全週休二日制（土日休み）
年間休日123日
転勤なし
コスメや美容に関わる仕事
空調完備の快適な職場環境
長期安定勤務可能`;

const QUALIFICATIONS = `未経験歓迎
学歴不問

【こんな方歓迎】
製造・梱包業務の経験がある方
コスメ・化粧品に興味がある方
コツコツ作業が得意な方`;

const WORKTIME = `シフト制（実働8時間／休憩1時間）

9:00～18:00
平均残業：月20時間程度
※繁忙期でも無理な長時間勤務はありません
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
月給 ￥250,000 ～ ￥320,000

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
if (del.changes > 0) console.log(`既存コスメ製造スタッフを削除: ${del.changes}件`);

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
  const catchcopy = `未経験から始める、キレイをつくるお仕事♪化粧品や美容関連商品の製造・検品・梱包。月給25万円以上・土日休み・年間休日123日・空調完備の快適な職場環境で正社員として安定して働けます。`;

  const tags = JSON.stringify([
    '未経験OK', '正社員', '土日休み', '年間休日123日',
    '空調完備', '賞与年2回', '各種手当あり', '社会保険完備',
    '軽作業', '女性活躍',
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

console.log(`\n完了: ${created}件作成（Bigeyes・コスメ製造スタッフ・大阪府15件・本文は求人No.5148-4590-0005と同一）`);
