'use strict';
// 【再改善版】BG（company='bg'）サロン納品ドライバー：求人ボックス＋Indeed 掲載
// 2026-10-02、ユーザー確認済み：「その内容で応募が来ていないから作り直して」「インディード用の求人掲載も」
//
// 前バージョン（seed-bg-route-driver-improved-20260812-kyujinbox-indeed.js）は
// 「"コスメ配送"はニッチ語のため一般語を主に」という判断で job_type を"ルート配送ドライバー"に
// 広げていたが、この一般語は求人ボックスで879〜1,070件ヒットし、一般的な「配送ドライバー」に
// 埋もれて差別化できていないことが判明した。
//
// 今回は逆に、実際の取引先（サロン・ドラッグストア・化粧品取扱店）に即した
// 「サロン納品ドライバー」（大阪府233件・程よいニッチ、求人ボックス側の入替スクリプト
// swap-bg-salon-nouhin-kyujinbox.js と表記を統一）に変更する。給与等の事実関係
// （月給390,000円〜450,000円等）は変更しない。
//
// 件数は前バージョンと同じ20件（20エリア）を維持。target_mediaも同じく
// ['求人ボックス','Indeed']の両方向け。
//
// 冪等: company='bg' かつ job_type IN ('ルート配送ドライバー','サロン納品ドライバー') かつ
//       今回の勤務地のみ削除→作り直し（旧「ルート配送ドライバー」分もこのエリアでは入替対象）。
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const vary = require('./lib/kyujinbox-vary-bgst');

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const COMPANY = 'bg';
const IMAGE_URL = '/images/cosme-haisou.jpg';
const JOB_TYPE = 'サロン納品ドライバー';
const OLD_JOB_TYPE = 'ルート配送ドライバー';
const SALARY_DETAIL = '月給390,000円〜450,000円';
const TARGET_MEDIA = ['求人ボックス', 'Indeed'];

const AREAS = [
  { pref: '大阪府', city: '大阪市', district: '西成区岸里東2丁目' },
  { pref: '大阪府', city: '大阪市', district: '住之江区浜口東2丁目' },
  { pref: '大阪府', city: '大阪市', district: '大正区平尾6丁目' },
  { pref: '大阪府', city: '大阪市', district: '港区弁天4丁目' },
  { pref: '大阪府', city: '大阪市', district: '此花区四貫島4丁目' },
  { pref: '大阪府', city: '大阪市', district: '福島区鷺洲1丁目' },
  { pref: '大阪府', city: '大阪市', district: '淀川区西中島6丁目' },
  { pref: '大阪府', city: '大阪市', district: '東淀川区瑞光1丁目' },
  { pref: '大阪府', city: '大阪市', district: '東成区玉造3丁目' },
  { pref: '大阪府', city: '大阪市', district: '生野区林寺3丁目' },
  { pref: '大阪府', city: '大阪市', district: '城東区今福南2丁目' },
  { pref: '大阪府', city: '大阪市', district: '鶴見区放出東3丁目' },
  { pref: '大阪府', city: '大阪市', district: '旭区高殿1丁目' },
  { pref: '大阪府', city: '大阪市', district: '都島区中野町3丁目' },
  { pref: '大阪府', city: '大阪市', district: '北区豊崎7丁目' },
  { pref: '大阪府', city: '大阪市', district: '中央区谷町3丁目' },
  { pref: '大阪府', city: '大阪市', district: '天王寺区四天王寺2丁目' },
  { pref: '大阪府', city: '大阪市', district: '住吉区沢之町1丁目' },
  { pref: '大阪府', city: '大阪市', district: '東住吉区湯里1丁目' },
  { pref: '大阪府', city: '大阪市', district: '平野区瓜破東3丁目' },
];

const QUALIFICATIONS = `普通自動車運転免許（AT限定可）
未経験歓迎
学歴不問

【こんな方歓迎】
運転が好きな方
コツコツ丁寧に取り組める方
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
const REWARDING = `日勤専属で生活リズムが安定
固定ルート中心で未経験でも始めやすい
車両・ガソリン代など完全会社負担
化粧品を扱う安定企業のサロン納品
配送業未経験スタート多数
研修制度ありで安心スタート`;
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
  `DELETE FROM jobs WHERE company='${COMPANY}' AND job_type IN ('${OLD_JOB_TYPE}','${JOB_TYPE}') AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存（旧ルート配送ドライバー／今回エリア）を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications,benefit)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const v = vary.build('bg_salon_nouhin', areaLabel); // タイトル・キャッチコピー・本文すべて流用
  const id = crypto.randomBytes(10).toString('hex');
  const tags = JSON.stringify(['未経験OK', '高収入', '正社員', '普通免許OK', 'AT限定OK', '会社車両完備', '完全週休2日', '固定ルート', '日勤専属', '車両費用会社負担']);
  stmt.run(
    id, v.title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, JOB_TYPE, '正社員',
    v.description, tags, v.catchcopy, IMAGE_URL,
    JSON.stringify(TARGET_MEDIA),
    now, expires, now, now, COMPANY,
    REWARDING, WORKTIME, TRANSPORTATION, HOW_TO_APPLY, QUALIFICATIONS, BENEFIT,
  );
  console.log(`✓ [${i + 1}/${AREAS.length}] ${v.title.slice(0, 55)}`);
  created++;
}

console.log(`\n完了: 作成${created}件（bg／サロン納品ドライバー／求人ボックス＋Indeed）`);
