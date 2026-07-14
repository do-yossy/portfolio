'use strict';
// 配送ドライバー 求人15件（Style501・求人ボックス掲載）
// 会社: 有限会社Style501(st) / 給与: 月給39万円〜44万円（年収500万円以上可）
// 内容は求人ボックス掲載（事業継承・資産形成OK）の項目に基づく
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'st';
const IMAGE_URL = '/images/st-haisou-driver.jpg';
const JOB_TYPE = '配送ドライバー';
const TITLE_TAIL = '【事業拡大につき事業継承】配送ドライバー★未経験歓迎★資産形成OK★月給39万円以上';
const SALARY_DETAIL = '月給390,000円〜440,000円';

// 東京都内15エリア（Style501 配送ドライバーの勤務地）
const AREAS = [
  { pref: '東京都', city: '足立区',   district: '梅田' },
  { pref: '東京都', city: '江戸川区', district: '船堀' },
  { pref: '東京都', city: '葛飾区',   district: '青戸' },
  { pref: '東京都', city: '板橋区',   district: '成増' },
  { pref: '東京都', city: '練馬区',   district: '光が丘' },
  { pref: '東京都', city: '北区',     district: '王子' },
  { pref: '東京都', city: '足立区',   district: '西新井' },
  { pref: '東京都', city: '江東区',   district: '有明' },
  { pref: '東京都', city: '大田区',   district: '平和島' },
  { pref: '東京都', city: '品川区',   district: '東品川' },
  { pref: '東京都', city: '世田谷区', district: '用賀' },
  { pref: '東京都', city: '杉並区',   district: '荻窪' },
  { pref: '東京都', city: '中野区',   district: '東中野' },
  { pref: '東京都', city: '足立区',   district: '綾瀬' },
  { pref: '東京都', city: '八王子市', district: '大和田町' },
];

const DESCRIPTION = `会社の拠点・車両置き場を起点に、担当エリアへの配送を行うドライバーのお仕事です。

荷物や資材を、決められたルートで法人・事業所などへお届けします。ルートが決まっているため、未経験の方でも安心してスタートできます。

【主な業務内容】
社用車での荷物・資材のルート配送
納品・荷降ろし（荷積み・荷降ろし補助あり）
出発前の車両点検・簡単な清掃
配達記録の記入・管理
その他付随する業務

※固定ルート中心・ナビ使用のため土地感は不要です
※荷物はやや重めですが、積み込み・積み下ろしの補助があります

【入社後の流れ】
入社後は先輩ドライバーが同乗して丁寧に指導します。
運転にブランクのある方・未経験の方も、少しずつ独り立ちできるようサポートします。`;

const REWARDING = `月給39万円〜44万円（年収500万円以上も可能）
未経験・ブランク・シニアも歓迎
普通自動車免許（AT限定可）でOK
固定ルート中心で安心
残業ほぼなし・日勤メイン
転勤なし`;

const QUALIFICATIONS = `普通自動車運転免許（AT限定可）
未経験歓迎
学歴不問

【こんな方歓迎】
運転が好きな方
ブランクのある方
シニア・フリーターの方
コツコツ丁寧に取り組める方`;

const WORKTIME = `8:30〜17:00（実働8時間／休憩1時間）
残業ほぼなし・日勤メイン
週休2日

年次有給休暇
長期休暇
慶弔休暇`;

const TRANSPORTATION = `車通勤可能
バイク通勤可能
転勤なし`;

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

const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='${JOB_TYPE}' AND company='${COMPANY}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存配送ドライバー(Style501)を削除: ${del.changes}件`);

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
  const catchcopy = `未経験歓迎★普通免許OK（AT限定可）★固定ルート中心の配送ドライバー★月給39万円〜44万円（年収500万円以上も可能）。ブランク・シニアも歓迎。残業ほぼなし・日勤メインで正社員として安定して働けます。`;

  const tags = JSON.stringify([
    '未経験OK', '正社員', 'AT限定OK', 'シニア歓迎',
    'ブランクOK', '高収入', '日勤メイン', '固定ルート',
    '車通勤OK', '社会保険完備',
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

console.log(`\n完了: ${created}件作成（Style501・配送ドライバー・東京都15件）`);
