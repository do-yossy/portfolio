'use strict';
// BG（company='bg'）大阪府 今日のバッチ（2026-08-03）：コスメ配送ドライバー25件（求人ボックス掲載）
// seed-bg-osaka-driver-kyujinbox.js を踏襲。本文/タイトル/キャッチは vary.build('bg_cosme_haisou', areaLabel)。
// 勤務地は大阪府の新エリア25件（既存BG seed群と重複しない実在の市区町名・丁目まで一意）。
// 冪等: 今回の勤務地（job_type=コスメ配送ドライバー かつ 求人ボックス）のみ削除してから作り直す。

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const vary = require('./lib/kyujinbox-vary-bgst');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const COMPANY = 'bg';
const IMAGE_URL = '/images/cosme-haisou.jpg';
const JOB_TYPE = 'コスメ配送ドライバー';
const SALARY_DETAIL = '月給390,000円〜450,000円';

// 大阪府の新エリア25件（既存BG使用分と重複しない丁目で構成）
const AREAS = [
  { pref: '大阪府', city: '大阪市', district: '都島区友渕町1丁目' },
  { pref: '大阪府', city: '大阪市', district: '西淀川区姫島2丁目' },
  { pref: '大阪府', city: '大阪市', district: '大正区泉尾3丁目' },
  { pref: '大阪府', city: '大阪市', district: '住之江区南港中1丁目' },
  { pref: '大阪府', city: '大阪市', district: '西成区岸里1丁目' },
  { pref: '大阪府', city: '大阪市', district: '旭区新森4丁目' },
  { pref: '大阪府', city: '大阪市', district: '鶴見区緑1丁目' },
  { pref: '大阪府', city: '大阪市', district: '東住吉区田辺3丁目' },
  { pref: '大阪府', city: '大阪市', district: '天王寺区筆ケ崎町' },
  { pref: '大阪府', city: '大阪市', district: '中央区島之内2丁目' },
  { pref: '大阪府', city: '大阪市', district: '北区曽根崎2丁目' },
  { pref: '大阪府', city: '大阪市', district: '西区京町堀1丁目' },
  { pref: '大阪府', city: '大阪市', district: '港区波除3丁目' },
  { pref: '大阪府', city: '大阪市', district: '淀川区十三東2丁目' },
  { pref: '大阪府', city: '大阪市', district: '東淀川区淡路4丁目' },
  { pref: '大阪府', city: '大阪市', district: '生野区田島2丁目' },
  { pref: '大阪府', city: '大阪市', district: '城東区今福東1丁目' },
  { pref: '大阪府', city: '大阪市', district: '阿倍野区松崎町2丁目' },
  { pref: '大阪府', city: '大阪市', district: '住吉区墨江2丁目' },
  { pref: '大阪府', city: '大阪市', district: '平野区長吉川辺2丁目' },
  { pref: '大阪府', city: '堺市',   district: '堺区大浜北町3丁' },
  { pref: '大阪府', city: '堺市',   district: '中区深阪1丁目' },
  { pref: '大阪府', city: '東大阪市', district: '高井田本通3丁目' },
  { pref: '大阪府', city: '豊中市', district: '庄内西町1丁目' },
  { pref: '大阪府', city: '吹田市', district: '垂水町2丁目' },
];

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

10:00～19:00
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
if (del.changes > 0) console.log(`既存コスメ配送ドライバー（今回エリア分）を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications,benefit)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const _v = vary.build('bg_cosme_haisou', areaLabel);
  const id = crypto.randomBytes(10).toString('hex');

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', '普通免許OK',
    '会社車両完備', '完全週休2日', '固定ルート', '日勤専属',
    '車両費用会社負担', '賞与年2回',
  ]);

  stmt.run(
    id, _v.title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, JOB_TYPE, '正社員',
    _v.description, tags, _v.catchcopy, IMAGE_URL,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now, COMPANY,
    REWARDING, WORKTIME, TRANSPORTATION, HOW_TO_APPLY, QUALIFICATIONS, BENEFIT,
  );

  console.log(`✓ [${i + 1}/${AREAS.length}] ${_v.title.slice(0, 55)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（Bigeyes・コスメ配送ドライバー・大阪府 今日のバッチ25件）`);
