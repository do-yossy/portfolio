'use strict';
// ST（company='st' 有限会社Style501）大阪府 今日のバッチ（2026-08-06）：配送ドライバー10件＋送迎ドライバー15件＝25件（求人ボックス掲載）
// seed-st-style501-osaka-batch3-kyujinbox.js を踏襲。本文/タイトル/キャッチは vary.build('st_haisou'|'st_soutei', areaLabel)。
// 勤務地は大阪府の新規エリア（既存ST seed群と重複しない実在の市区町・丁目まで一意）。
// 冪等: 今回の勤務地のみ job_type＋location で削除してから作り直す（他バッチは消さない）。

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const vary = require('./lib/kyujinbox-vary-bgst');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const COMPANY = 'st';
const SALARY_DETAIL = '月給390,000円〜440,000円';

const HAISOU_IMAGE = '/images/st-haisou-driver.jpg';
const HAISOU_JOB_TYPE = '配送ドライバー';
const AREAS_HAISOU = [
  { pref: '大阪府', city: '大阪市', district: '此花区伝法5丁目' },
  { pref: '大阪府', city: '大阪市', district: '西淀川区姫里2丁目' },
  { pref: '大阪府', city: '大阪市', district: '住之江区西加賀屋3丁目' },
  { pref: '大阪府', city: '大阪市', district: '大正区南恩加島4丁目' },
  { pref: '大阪府', city: '大阪市', district: '西成区南津守5丁目' },
  { pref: '大阪府', city: '大阪市', district: '港区田中3丁目' },
  { pref: '大阪府', city: '大阪市', district: '東成区東中本2丁目' },
  { pref: '大阪府', city: '大阪市', district: '城東区諏訪3丁目' },
  { pref: '大阪府', city: '大阪市', district: '鶴見区浜4丁目' },
  { pref: '大阪府', city: '大阪市', district: '生野区中川西2丁目' },
];

const HAISOU_REWARDING = `月給39万円〜44万円（年収500万円以上も可能）
未経験・ブランク・シニアも歓迎
普通自動車免許（AT限定可）でOK
固定ルート中心で安心
残業ほぼなし・日勤メイン
転勤なし`;
const HAISOU_TAGS = JSON.stringify([
  '未経験OK', '正社員', 'AT限定OK', 'シニア歓迎',
  'ブランクOK', '高収入', '日勤メイン', '固定ルート',
  '車通勤OK', '社会保険完備',
]);

const SOUTEI_IMAGE = '/images/st-soutei-driver.jpg';
const SOUTEI_JOB_TYPE = '送迎ドライバー';
const AREAS_SOUTEI = [
  { pref: '大阪府', city: '堺市', district: '堺区少林寺町東3丁' },
  { pref: '大阪府', city: '堺市', district: '中区八田寺町' },
  { pref: '大阪府', city: '堺市', district: '東区草尾' },
  { pref: '大阪府', city: '堺市', district: '西区浜寺諏訪森町' },
  { pref: '大阪府', city: '堺市', district: '南区豊田' },
  { pref: '大阪府', city: '堺市', district: '北区金岡町' },
  { pref: '大阪府', city: '堺市', district: '美原区大饗' },
  { pref: '大阪府', city: '和泉市', district: 'いぶき野4丁目' },
  { pref: '大阪府', city: '岸和田市', district: '岸城町' },
  { pref: '大阪府', city: '泉大津市', district: '東豊中町2丁目' },
  { pref: '大阪府', city: '貝塚市', district: '名越' },
  { pref: '大阪府', city: '泉佐野市', district: '鶴原' },
  { pref: '大阪府', city: '松原市', district: '天美西4丁目' },
  { pref: '大阪府', city: '大東市', district: '赤井2丁目' },
  { pref: '大阪府', city: '河内長野市', district: '木戸町' },
];

const SOUTEI_REWARDING = `月給39万円〜44万円（年収500万円以上も可能）
未経験・ブランク・シニアも歓迎
普通自動車免許（AT限定可）でOK
残業ほぼなし・日勤メイン
転勤なし
長期安定して働ける環境`;
const SOUTEI_TAGS = JSON.stringify([
  '未経験OK', '正社員', 'AT限定OK', 'シニア歓迎',
  'ブランクOK', '高収入', '日勤メイン', '残業ほぼなし',
  '車通勤OK', '社会保険完備',
]);

const WORKTIME = `8:30〜17:00（実働8時間／休憩1時間）
残業ほぼなし・日勤メイン
週休2日

年次有給休暇
長期休暇
慶弔休暇`;
const TRANSPORTATION = `車通勤可能
バイク通勤可能
転勤なし`;
const QUALIFICATIONS = `普通自動車運転免許（AT限定可）
未経験歓迎
学歴不問

【こんな方歓迎】
運転が好きな方
ブランクのある方
シニア・フリーターの方
コツコツ丁寧に取り組める方`;
const BENEFIT = `月給 ￥390,000 ～ ￥440,000（年収500万円以上も可能）
昇給あり
賞与あり
交通費支給
社会保険完備
資格取得支援
定期健康診断`;
const HOW_TO_APPLY = `【応募後のご案内】

ご応募確認後、採用受付代行担当者よりお電話にてご連絡いたします。

また、ご経験・ご希望条件等を踏まえ、ご本人の同意をいただいた上で、関連求人や提携企業求人をご案内させていただく場合がございます。`;

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications,benefit)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)
`);

function purge(jobType, areas) {
  const locations = areas.map(a => `${a.pref}${a.city}${a.district}`);
  const placeholders = locations.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, job_type FROM jobs WHERE company='${COMPANY}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
  ).all(...locations);
  const targets = rows.filter(j => j.job_type === jobType);
  if (targets.length === 0) return;
  const delStmt = db.prepare(`DELETE FROM jobs WHERE id = ?`);
  let removed = 0;
  for (const t of targets) removed += delStmt.run(t.id).changes;
  if (removed > 0) console.log(`既存${jobType}(Style501)を削除: ${removed}件`);
}

function insertBatch(familyKey, jobType, imageUrl, rewarding, tags, areas) {
  let created = 0;
  for (let i = 0; i < areas.length; i++) {
    const j = areas[i];
    const areaLabel = `${j.city}・${j.district}`;
    const _v = vary.build(familyKey, areaLabel);
    const id = crypto.randomBytes(10).toString('hex');
    stmt.run(
      id, _v.title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, jobType, '正社員',
      _v.description, tags, _v.catchcopy, imageUrl,
      JSON.stringify(['求人ボックス']),
      now, expires, now, now, COMPANY,
      rewarding, WORKTIME, TRANSPORTATION, HOW_TO_APPLY, QUALIFICATIONS, BENEFIT,
    );
    console.log(`✓ [${jobType}] [${i + 1}/${areas.length}] ${_v.title.slice(0, 55)}`);
    created++;
  }
  return created;
}

purge(HAISOU_JOB_TYPE, AREAS_HAISOU);
purge(SOUTEI_JOB_TYPE, AREAS_SOUTEI);

const cHaisou = insertBatch('st_haisou', HAISOU_JOB_TYPE, HAISOU_IMAGE, HAISOU_REWARDING, HAISOU_TAGS, AREAS_HAISOU);
const cSoutei = insertBatch('st_soutei', SOUTEI_JOB_TYPE, SOUTEI_IMAGE, SOUTEI_REWARDING, SOUTEI_TAGS, AREAS_SOUTEI);

console.log(`\n完了: ${cHaisou + cSoutei}件作成（Style501・大阪府 今日のバッチ／配送${cHaisou}件＋送迎${cSoutei}件・求人ボックス）`);
