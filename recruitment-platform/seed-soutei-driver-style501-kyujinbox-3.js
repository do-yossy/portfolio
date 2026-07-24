'use strict';
// 送迎ドライバー 求人10件（Style501・求人ボックス掲載）
// 会社: 有限会社Style501(st) / 給与: 月給39万円〜44万円（年収500万円以上可）
// 内容は求人ボックス掲載（求人No.3743-6606-0005 等）の項目に基づく
// 冪等: 対象拠点のみ削除してから作り直す

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const vary = require('./scripts/lib/kyujinbox-vary-bgst');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'st';
const IMAGE_URL = '/images/st-soutei-driver.jpg';
const JOB_TYPE = '送迎ドライバー';
const TITLE_TAIL = '【事業拡大につき増員募集】送迎ドライバー★未経験歓迎★普通免許OK★福利厚生充実';
const SALARY_DETAIL = '月給390,000円〜440,000円';

// 東京都内10エリア（Style501 送迎ドライバーの勤務地・既存分と被りなし）
const AREAS = [
  { pref: '東京都', city: '世田谷区', district: '三軒茶屋' },
  { pref: '東京都', city: '中野区', district: '鷺宮' },
  { pref: '東京都', city: '品川区', district: '五反田' },
  { pref: '東京都', city: '大田区', district: '久が原' },
  { pref: '東京都', city: '杉並区', district: '阿佐谷' },
  { pref: '東京都', city: '板橋区', district: '常盤台' },
  { pref: '東京都', city: '江戸川区', district: '西葛西' },
  { pref: '東京都', city: '練馬区', district: '豊玉' },
  { pref: '東京都', city: '葛飾区', district: '金町' },
  { pref: '東京都', city: '足立区', district: '扇' },
];

const DESCRIPTION = `会社の拠点・車両置き場を起点に、従業員の送迎を中心としたドライバーのお仕事です。

スタッフの送り迎えや、業務に必要な物品の運搬・積み込みを担当していただきます。決められたルートでの移動が中心のため、未経験の方でも安心してスタートできます。

【主な業務内容】
従業員・スタッフの送迎（拠点間・現場への送り迎え）
社用車での移動・運転
物品・資材の運搬、積み込み・積み下ろし補助
出発前の車両点検・簡単な清掃
運行記録の記入
その他付随する業務

【入社後の流れ】
入社後は先輩ドライバーが同乗して丁寧に指導します。
運転にブランクのある方・未経験の方も、少しずつ独り立ちできるようサポートします。`;

const REWARDING = `月給39万円〜44万円（年収500万円以上も可能）
未経験・ブランク・シニアも歓迎
普通自動車免許（AT限定可）でOK
残業ほぼなし・日勤メイン
転勤なし
長期安定して働ける環境`;

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
if (del.changes > 0) console.log(`既存送迎ドライバー(Style501)を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications,benefit)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const _v = vary.build('st_soutei', areaLabel);
  const id = crypto.randomBytes(10).toString('hex');
  const title = _v.title;
  const catchcopy = _v.catchcopy;

  const tags = JSON.stringify([
    '未経験OK', '正社員', 'AT限定OK', 'シニア歓迎',
    'ブランクOK', '高収入', '日勤メイン', '残業ほぼなし',
    '車通勤OK', '社会保険完備',
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

console.log(`\n完了: ${created}件作成（Style501・送迎ドライバー・東京都10件）`);
