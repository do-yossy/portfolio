#!/usr/bin/env node
'use strict';
/**
 * Brand ideaL合同会社（bi）／秘書兼ドライバー（代表専属）求人（求人ボックス掲載）
 * 東京15件＋大阪10件＝25件。ユーザー提供の本文をベースに、エリアごとの導入文・
 * タイトルを決定論的に差し替えて重複を回避。
 * ・東京は既存BI求人で未使用の多摩地域の市15、大阪はBI未使用の大阪市10区。
 * ・job_type='秘書兼ドライバー' / target_media=['求人ボックス'] / 正社員 / 月給35〜43万。
 *
 * 実行: node --experimental-sqlite scripts/seed-bi-secretary-driver-kyujinbox-tokyo15-osaka10.js
 * ※ 掲載画像は public/images/bi-secretary-driver.jpg を使用。
 * 冪等: 自分のタイトル（company='bi' かつ job_type='秘書兼ドライバー'）のみ入れ直す。
 */
const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { Jobs } = require('../db-factory');
const { hashSeed } = require('./lib/kyujinbox-vary');

const COMPANY      = 'bi';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['求人ボックス'];
const JOB_TYPE     = '秘書兼ドライバー';
const EMP_TYPE     = '正社員';
const SALARY       = '月給350,000円〜430,000円（経験・能力を考慮）';
const IMAGE_URL    = '/images/bi-secretary-driver.jpg';

// 東京：既存BI求人で未使用の多摩地域の市15
const TOKYO = ['小平市', '昭島市', '日野市', '東村山市', '国立市', '福生市', '狛江市',
               '東大和市', '清瀬市', '東久留米市', '武蔵村山市', '多摩市', '稲城市',
               '羽村市', 'あきる野市'];
// 大阪：BI未使用の大阪市10区
const OSAKA = ['大阪市北区', '大阪市中央区', '大阪市西区', '大阪市淀川区', '大阪市天王寺区',
               '大阪市浪速区', '大阪市福島区', '大阪市都島区', '大阪市城東区', '大阪市阿倍野区'];

const AREAS = [
  ...TOKYO.map(a => ({ area: a, pref: '東京都', location: `東京都${a}` })),
  ...OSAKA.map(a => ({ area: a, pref: '大阪府', location: `大阪府${a}` })),
];

function pick(pool, area, salt) { return pool[hashSeed(`${salt}|${area}`) % pool.length]; }

const TITLE_CORE = [
  '代表専属の秘書兼ドライバー｜送迎＋秘書業務｜未経験歓迎｜月給35万〜43万円｜普通免許OK',
  '秘書兼ドライバー（代表専属）｜安全送迎＆秘書サポート｜完全週休2日｜月給35万〜43万円',
  '代表を支える秘書兼ドライバー｜運転＋スケジュール管理など｜未経験OK・普通免許OK｜月給35万〜43万円',
];
const INTRO = [
  a => `${a}周辺エリアで、代表専属ドライバーとして安全な送迎と秘書業務をお任せします。`,
  a => `${a}を含むエリアで、代表を支える秘書兼ドライバー（送迎＋秘書サポート）を募集します。`,
  a => `${a}周辺で、代表の送迎・スケジュール管理・各種手配などを担う秘書兼ドライバーです。`,
];

const BODY = (a) =>
`代表の活動エリアは東京・千葉・大阪を中心としており、企業様への訪問や商談、各種打ち合わせなど、幅広い業務を行っています。
安全運転で目的地まで送迎することはもちろん、移動中も代表が業務に集中できる環境づくりや、スケジュール管理などの秘書業務も担当していただきます。
運転だけではなく、代表を支えるパートナーとして活躍できるポジションです。

【送迎業務】
・代表の送迎（東京・千葉・大阪を中心）
・車両の管理、洗車、日常点検
・目的地までのルート確認
・安全運転での送迎

【秘書業務】
・スケジュール管理
・電話・メール対応
・会食・出張・宿泊などの各種手配
・資料整理、簡単な事務作業
・その他、代表のサポート業務
※送迎と秘書業務の割合は、日によって異なります。

【この仕事の魅力】
◆代表の近くで経営視点や仕事の進め方を学べる
◆運転だけではなく秘書業務にも携われるため、幅広いスキルが身につく
◆裁量を持って代表を支えるやりがいのある仕事
◆未経験からでもチャレンジ可能
◆長期的に安定して働ける環境

【募集背景】
当社では事業拡大に伴い、代表のサポート体制をより強化するため、新たなメンバーを募集します。移動中も電話対応や資料確認などの業務を効率的に進め、より多くの時間を本来の業務に充てられる体制を整えるため、このたび秘書兼ドライバーを募集することとなりました。

【対象となる方】
＜応募条件＞
・普通自動車第一種運転免許（AT限定可）
・基本的なPC操作（Word・Excel・メール）ができる方
＜歓迎する経験・人物像＞
・ドライバー経験をお持ちの方／秘書や営業アシスタントの経験をお持ちの方
・安全運転を心掛けられる方／守秘義務を守れる方
・気配りやコミュニケーションを大切にできる方／柔軟な対応ができる方
※未経験の方も歓迎します。

【勤務地】
${a}周辺　※東京・千葉・大阪への出張・送迎あり

【勤務時間】
9:00〜18:00（実働8時間）※代表のスケジュールに応じて変動する場合があります。

【給与】
月給35万円〜43万円（経験・能力を考慮のうえ決定）／賞与：年2回（業績による）／昇給：年1回

【休日・休暇】
完全週休2日制／祝日／GW休暇／夏季休暇／年末年始休暇／有給休暇／慶弔休暇

【福利厚生】
各種社会保険完備／交通費支給／時間外手当／健康診断／社用車貸与／携帯電話貸与／PC貸与`;

function buildDescription(a) {
  const intro = pick(INTRO, a.area, 'bi2:intro')(a.area);
  return `${intro}\n\n${BODY(a.area)}\n\n※${a.area}周辺での募集です。まずはお気軽にご応募ください。`;
}

const JOBS = AREAS.map(a => ({
  title:     `【${a.area}】${pick(TITLE_CORE, a.area, 'bi2:title')}`,
  location:  a.location,
  salary:    SALARY,
  jobType:   JOB_TYPE,
  employmentType: EMP_TYPE,
  description: buildDescription(a),
  tags: ['未経験歓迎', '普通免許OK', '秘書兼ドライバー', '完全週休2日制', '社用車貸与', '転勤なし', 'PC貸与', '賞与年2回'],
  catchcopy: `未経験歓迎｜代表専属の秘書兼ドライバー（${a.area}）｜月給35万〜43万円・完全週休2日・9〜18時｜普通免許OK・PC基本操作でOK`,
  imageUrl:  IMAGE_URL,
  isPublished: true,
  publishedAt: NOW,
  targetMedia: TARGET_MEDIA,
  company: COMPANY,
}));

async function main() {
  console.log(`\n🚗 Brand ideaL 秘書兼ドライバー（求人ボックス）東京${AREAS.filter(a=>a.pref==='東京都').length}＋大阪${AREAS.filter(a=>a.pref==='大阪府').length}＝${JOBS.length}件 を登録します...\n`);
  const myTitles = new Set(JOBS.map(j => j.title));
  const existing = await Jobs.findAll();
  let removed = 0;
  for (const j of existing) {
    if (j.company === COMPANY && j.job_type === JOB_TYPE && myTitles.has(j.title)) {
      await Jobs.delete(j.id); removed++;
    }
  }
  if (removed) console.log(`  🧹 既存の同一タイトル ${removed}件 を削除（冪等・入れ直し）\n`);
  let added = 0;
  for (const job of JOBS) { await Jobs.create(job); console.log(`  ✅ 登録: ${job.title.slice(0,48)}`); added++; }
  console.log(`\n📊 結果: 新規 ${added}件 / 合計 ${JOBS.length}件（削除 ${removed}件）`);
  console.log('→ 掲載管理の Brand ideaL タブ →「🚀 求人ボックスに投稿する」で投稿できます。');
  console.log('※ 画像は public/images/bi-secretary-driver.jpg を保存しておいてください。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
