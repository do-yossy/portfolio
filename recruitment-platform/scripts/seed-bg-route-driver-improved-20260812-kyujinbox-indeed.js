'use strict';
// 【改善版】BG（company='bg'）ルート配送ドライバー（化粧品ルート）：求人ボックス＋Indeed 掲載
// 分析で bg=応募少 だったため改善：
//  ・タイトルを "ルート配送ドライバー" 主語に（"コスメ配送"はニッチ語のため一般語を主・化粧品を補足）
//  ・job_type='ルート配送ドライバー'（＝媒体の職種名も検索されやすく）
//  ・target_media に Indeed を追加（単一媒体→複数媒体で母数UP）
//  ・本文(description)は既存の bg_cosme_haisou テンプレ(vary)を流用しリッチさ維持
// 冪等: company='bg' かつ job_type='ルート配送ドライバー' かつ 今回の勤務地のみ削除→作り直し（既存のコスメ配送ドライバーは触らない）
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const vary = require('./lib/kyujinbox-vary-bgst');

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const COMPANY = 'bg';
const IMAGE_URL = '/images/cosme-haisou.jpg';
const JOB_TYPE = 'ルート配送ドライバー';
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

const REWARDING = `日勤専属で生活リズムが安定
固定ルート中心で未経験でも始めやすい
車両・ガソリン代など完全会社負担
化粧品を扱う安定企業のルート配送
配送業未経験スタート多数
研修制度ありで安心スタート`;
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
  `DELETE FROM jobs WHERE company='${COMPANY}' AND job_type='${JOB_TYPE}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存の同一(改善版ルート配送・今回エリア)を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications,benefit)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)
`);

// ドライバー主語の改善タイトル（決定論でエリアごとに少しだけ変える）
const { hashSeed } = require('./lib/kyujinbox-vary');
const TITLE_CORE = [
  'ルート配送ドライバー（化粧品ルート）｜月給39〜45万・未経験歓迎・普通免許OK｜固定ルート・日勤・車両費会社負担',
  '配送ドライバー（化粧品の固定ルート）｜未経験歓迎・AT限定OK｜月給39万〜45万・完全週休2日・日勤メイン',
  'ルート配送ドライバー正社員｜化粧品を決まったルートでお届け｜月給39〜45万・未経験OK・車両/ガソリン会社負担',
];
const CATCH = [
  '月給39〜45万／固定ルートで安心！化粧品を担当エリアにお届けする日勤ドライバー。未経験歓迎・普通免許（AT限定可）でOK・車両費用は会社負担。完全週休2日で働きやすい。',
  '未経験から月給39万円スタート。化粧品の固定ルート配送で、決まった道・決まった取引先だから安心。車・ガソリン・保険は会社負担、マイカー不要。日勤メインで生活が整います。',
];
const pick = (pool, al, salt) => pool[hashSeed(`${salt}|${al}`) % pool.length];

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const _v = vary.build('bg_cosme_haisou', areaLabel); // 本文のみ流用
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】${pick(TITLE_CORE, areaLabel, 'bg_route:title')}`;
  const catchcopy = pick(CATCH, areaLabel, 'bg_route:cc');
  const tags = JSON.stringify(['未経験OK', '高収入', '正社員', '普通免許OK', 'AT限定OK', '会社車両完備', '完全週休2日', '固定ルート', '日勤専属', '車両費用会社負担']);
  stmt.run(
    id, title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, JOB_TYPE, '正社員',
    _v.description, tags, catchcopy, IMAGE_URL,
    JSON.stringify(TARGET_MEDIA),
    now, expires, now, now, COMPANY,
    REWARDING, WORKTIME, TRANSPORTATION, HOW_TO_APPLY, QUALIFICATIONS, BENEFIT,
  );
  console.log(`✓ [${i + 1}/${AREAS.length}] ${title.slice(0, 55)}`);
  created++;
}
console.log(`\n完了: ${created}件作成（BG改善版・ルート配送ドライバー・求人ボックス＋Indeed）`);
