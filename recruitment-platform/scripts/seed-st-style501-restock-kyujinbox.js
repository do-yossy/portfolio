'use strict';
// Style501（st）補充seed：配送ドライバー15件＋送迎ドライバー10件＝合計25件（求人ボックス掲載）
// 会社: 有限会社Style501(st) / 給与: 月給39万円〜44万円（年収500万円以上可）
// 本文・タイトル・キャッチコピーは vary.build('st_haisou' | 'st_soutei', areaLabel) で
// エリアごとに決定論的に生成（雛形 seed-haisou-driver-style501-kyujinbox-osaka.js /
// seed-soutei-driver-style501-kyujinbox-osaka.js を踏襲）。
// 勤務地は大阪府内の新規エリア（既存で使用済みの市区町名とは重複させない）。
// 冪等: 今回の勤務地のみ job_type＋location で削除してから作り直す（他バッチは消さない）。

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
// 本ファイルは scripts/ 配下のため、lib は同階層の './lib/...' で解決する
const vary = require('./lib/kyujinbox-vary-bgst');

// 本ファイルは scripts/ 配下のため、data は一つ上の '..','data' を挟んで解決する
const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'st';
const SALARY_DETAIL = '月給390,000円〜440,000円';

/* ===================== 配送ドライバー（st_haisou・15件） ===================== */
const HAISOU_IMAGE = '/images/st-haisou-driver.jpg';
const HAISOU_JOB_TYPE = '配送ドライバー';

// 大阪府内15エリア（大阪市の未使用区の別町名で構成・既存分と被りなし）
const AREAS_HAISOU = [
  { pref: '大阪府', city: '大阪市', district: '北区中之島' },
  { pref: '大阪府', city: '大阪市', district: '福島区野田' },
  { pref: '大阪府', city: '大阪市', district: '此花区西九条' },
  { pref: '大阪府', city: '大阪市', district: '西区京町堀' },
  { pref: '大阪府', city: '大阪市', district: '港区弁天' },
  { pref: '大阪府', city: '大阪市', district: '大正区三軒家' },
  { pref: '大阪府', city: '大阪市', district: '天王寺区上本町' },
  { pref: '大阪府', city: '大阪市', district: '浪速区元町' },
  { pref: '大阪府', city: '大阪市', district: '西淀川区佃' },
  { pref: '大阪府', city: '大阪市', district: '東淀川区淡路' },
  { pref: '大阪府', city: '大阪市', district: '東成区中道' },
  { pref: '大阪府', city: '大阪市', district: '城東区蒲生' },
  { pref: '大阪府', city: '大阪市', district: '阿倍野区阪南町' },
  { pref: '大阪府', city: '大阪市', district: '住之江区粉浜' },
  { pref: '大阪府', city: '大阪市', district: '中央区本町' },
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

/* ===================== 送迎ドライバー（st_soutei・10件） ===================== */
const SOUTEI_IMAGE = '/images/st-soutei-driver.jpg';
const SOUTEI_JOB_TYPE = '送迎ドライバー';

// 大阪府内10エリア（堺市の未使用区・外周市の未使用町名で構成・既存分と被りなし）
const AREAS_SOUTEI = [
  { pref: '大阪府', city: '堺市', district: '中区深井' },
  { pref: '大阪府', city: '堺市', district: '東区日置荘' },
  { pref: '大阪府', city: '堺市', district: '西区鳳' },
  { pref: '大阪府', city: '堺市', district: '南区桃山台' },
  { pref: '大阪府', city: '堺市', district: '美原区黒山' },
  { pref: '大阪府', city: '池田市', district: '城南' },
  { pref: '大阪府', city: '箕面市', district: '半町' },
  { pref: '大阪府', city: '泉大津市', district: '旭町' },
  { pref: '大阪府', city: '貝塚市', district: '海塚' },
  { pref: '大阪府', city: '泉佐野市', district: '上町' },
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

/* ===================== 共通項目 ===================== */
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

// 冪等: 今回の勤務地のみ job_type＋location で削除（他バッチは消さない）
function purge(jobType, areas) {
  const locations = areas.map(a => `${a.pref}${a.city}${a.district}`);
  const placeholders = locations.map(() => '?').join(',');
  const del = db.prepare(
    `DELETE FROM jobs WHERE job_type='${jobType}' AND company='${COMPANY}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
  ).run(...locations);
  if (del.changes > 0) console.log(`既存${jobType}(Style501)を削除: ${del.changes}件`);
}

// 投入
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

console.log(`\n完了: ${cHaisou + cSoutei}件作成（Style501・大阪府 補充／配送${cHaisou}件＋送迎${cSoutei}件）`);
