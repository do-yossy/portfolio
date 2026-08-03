#!/usr/bin/env node
'use strict';
/**
 * 株式会社NOWLIVE（nl）／配送・ルートドライバー 今日のバッチ（2026-08-03・求人ボックス掲載）— 大阪・京都
 * seed-nl-osaka-kyoto-driver-kyujinbox.js を踏襲。job_type='配送ドライバー'。
 * 勤務地は既存NL配送ドライバーバッチと重複しない大阪10件＋京都15件（町名/丁目まで一意）。
 * 冪等: 自分のタイトル（company='nl' かつ job_type='配送ドライバー'）のみ削除してから投入。
 *
 * 実行: node --experimental-sqlite scripts/seed-nl-osaka-kyoto-driver-20260803-kyujinbox.js
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

const COMPANY      = 'nl';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['求人ボックス'];
const JOB_TYPE     = '配送ドライバー';
const EMP_TYPE     = '正社員';
const SALARY       = '月給330,000円〜460,000円（経験・能力を考慮）';
const IMAGE_URL    = '/images/haisou-fleet.jpg';

// 掲載エリア25件: 大阪府10（新規丁目）＋京都府15（新規町丁）。既存NL配送ドライバーバッチと重複しない。
const AREAS = [
  { area: '大阪市浪速区日本橋3丁目',   city: '大阪府大阪市浪速区日本橋3丁目' },
  { area: '大阪市西区靭本町2丁目',     city: '大阪府大阪市西区靭本町2丁目' },
  { area: '大阪市北区中崎西2丁目',     city: '大阪府大阪市北区中崎西2丁目' },
  { area: '大阪市淀川区田川3丁目',     city: '大阪府大阪市淀川区田川3丁目' },
  { area: '大阪市東淀川区上新庄1丁目', city: '大阪府大阪市東淀川区上新庄1丁目' },
  { area: '東大阪市御厨栄町2丁目',     city: '大阪府東大阪市御厨栄町2丁目' },
  { area: '八尾市南本町5丁目',         city: '大阪府八尾市南本町5丁目' },
  { area: '松原市天美東7丁目',         city: '大阪府松原市天美東7丁目' },
  { area: '岸和田市土生町3丁目',       city: '大阪府岸和田市土生町3丁目' },
  { area: '和泉市いぶき野5丁目',       city: '大阪府和泉市いぶき野5丁目' },
  { area: '京都市中京区西ノ京',   city: '京都府京都市中京区西ノ京' },
  { area: '京都市下京区烏丸通',   city: '京都府京都市下京区烏丸通' },
  { area: '京都市左京区一乗寺',   city: '京都府京都市左京区一乗寺' },
  { area: '京都市右京区嵯峨',     city: '京都府京都市右京区嵯峨' },
  { area: '京都市南区吉祥院',     city: '京都府京都市南区吉祥院' },
  { area: '京都市伏見区桃山町',   city: '京都府京都市伏見区桃山町' },
  { area: '京都市山科区西野',     city: '京都府京都市山科区西野' },
  { area: '京都市東山区今熊野',   city: '京都府京都市東山区今熊野' },
  { area: '京都市北区紫野',       city: '京都府京都市北区紫野' },
  { area: '京都市上京区室町',     city: '京都府京都市上京区室町' },
  { area: '宇治市莵道',           city: '京都府宇治市莵道' },
  { area: '城陽市平川',           city: '京都府城陽市平川' },
  { area: '木津川市木津',         city: '京都府木津川市木津' },
  { area: '向日市寺戸町',         city: '京都府向日市寺戸町' },
  { area: '八幡市八幡',           city: '京都府八幡市八幡' },
];

function pick(pool, area, salt) {
  return pool[hashSeed(`${salt}|${area}`) % pool.length];
}

const INTRO = [
  a => `${a}を拠点に、担当エリアの店舗・取引先・個人宅へ商品をお届けする配送・ルートドライバーのお仕事です。`,
  a => `${a}エリアで、決まったルートを回りながら商品をお届けするルートドライバーを募集します。`,
  a => `${a}周辺で、食品や日用品などをお届けし、積み下ろしもお任せする配送ドライバーです。`,
];
const TITLE_CORE = [
  '配送・ルートドライバー｜未経験歓迎｜完全週休2日｜月給33万円〜｜普通免許OK',
  'ルート配送ドライバー（正社員）｜未経験歓迎｜月給33万円〜46万円｜AT限定OK',
  '定期便のルートドライバー｜完全週休2日・シフト制｜月給33万〜46万円｜普通免許OK',
];
const APPEAL = [
  '◆ 決まったルート・取引先中心で覚えやすく続けやすい',
  '◆ 未経験・ブランクの方も歓迎、先輩が丁寧にサポート',
  '◆ 「やってみたい」という気持ちを尊重する社風',
  '◆ 普通自動車免許があればOK・特別な経験は不要',
  '◆ 一人で運転する時間が多く、自分のペースで働ける',
];

const COMPANY_BLOCK =
`【会社について】
株式会社NOWLIVEは「ワクワクする未来を選ぶ」を理念に、食品催事事業・イベントプロモーション事業を展開しています。人気スイーツや地域の特産品など多彩な商品をお客様へお届けしており、その現場を支えているのが商品の配送・物流です。ドライバーは会社の最前線で活躍する大切なポジションです。`;

const DUTIES =
`【お任せするお仕事】
・担当エリア内の店舗・取引先・個人宅へのルート配送
・商品・資材の積み込み・積み下ろし、簡単な仕分け
・伝票の確認・配送記録の入力（スマホ・アプリ操作）
・出発前の車両点検、簡単な清掃
※普通自動車免許（AT限定可）があればOK。決まったルート・取引先が中心で、未経験の方も安心してスタートできます。`;

const CONDITIONS = (area) =>
`【給与】
月給330,000円〜460,000円（経験・能力・前職給与を考慮して決定します）
・昇給あり（年1回）
・賞与あり（業績に応じて支給）
・各種手当あり（皆勤手当・深夜/早朝手当 など）
・試用期間3ヶ月（期間中も給与・待遇に変更はありません）
・固定残業代なし（残業が発生した場合は別途全額支給。実働8時間のシフト制で残業は少なめです）

【勤務時間】
8:00〜20:00の間で実働8時間（休憩あり）のシフト制

【休日・休暇】
・完全週休二日制（シフト制）
・年間休日110日以上
・有給休暇（入社半年後に付与／取得しやすい環境です）
・夏季休暇／年末年始休暇／慶弔休暇
・産前産後休暇・育児休暇／特別休暇
※シフト制のため平日にもお休みを取りやすく、役所・銀行の用事やお子さまの行事にも対応しやすい環境です。

【待遇・福利厚生】
雇用形態：正社員（雇用期間の定めなし）
・各種社会保険完備（健康保険・厚生年金・雇用保険・労災保険）
・交通費支給（規定内）／車通勤OK
・社用車・ガソリン代は会社負担（自己負担なし）
・制服貸与／資格取得支援制度／研修制度あり（未経験の方も先輩が丁寧にサポート）
・服装・髪型自由（清潔感のある範囲で）
・社員同士の交流イベントあり（“ワクワクする未来”を大切にする社風）

【応募資格】
普通自動車運転免許（AT限定可）
未経験歓迎／ブランクOK／学歴不問

【勤務地】
${area}周辺（大阪府・京都府内・近郊の配送先／取引先）`;

function buildDescription(a) {
  const intro = pick(INTRO, a.area, 'nl:dintro')(a.area);
  const appeal = (() => {
    const start = hashSeed(`nl:dap|${a.area}`) % APPEAL.length;
    const out = [];
    for (let k = 0; k < 4; k++) out.push(APPEAL[(start + k) % APPEAL.length]);
    return out.join('\n');
  })();
  return `${intro}

${COMPANY_BLOCK}

${DUTIES}

【この仕事の魅力】
${appeal}

${CONDITIONS(a.area)}

※${a.area}周辺での募集です。まずはお気軽にご応募ください。`;
}

const JOBS = AREAS.map(a => ({
  title:     `【${a.area}】${pick(TITLE_CORE, a.area, 'nl:dtitle')}`,
  location:  a.city,
  salary:    SALARY,
  jobType:   JOB_TYPE,
  employmentType: EMP_TYPE,
  description: buildDescription(a),
  tags: ['未経験歓迎', '正社員', '普通免許OK', 'ブランクOK', 'ルート配送', '配送', '大阪', '京都'],
  catchcopy: `未経験歓迎｜配送・ルートドライバー（${a.area}）｜月給33万〜46万円・完全週休二日制・シフト制（8〜20時内で実働8時間）｜普通免許OK・ブランク歓迎・各種社会保険完備`,
  imageUrl:  IMAGE_URL,
  isPublished: true,
  publishedAt: NOW,
  targetMedia: TARGET_MEDIA,
  company: COMPANY,
}));

async function main() {
  console.log(`\n🚚 NOWLIVE 配送・ルートドライバー（大阪/京都・今日のバッチ）${JOBS.length}件 を登録します...\n`);
  const myTitles = new Set(JOBS.map(j => j.title));
  const existing = await Jobs.findAll();
  let removed = 0;
  for (const j of existing) {
    if (j.company === COMPANY && j.job_type === JOB_TYPE && myTitles.has(j.title)) {
      await Jobs.delete(j.id);
      removed++;
    }
  }
  if (removed) console.log(`  🧹 既存の同一バッチ ${removed}件 を削除（冪等・入れ直し）\n`);
  let added = 0;
  for (const job of JOBS) { await Jobs.create(job); console.log(`  ✅ 登録: ${job.title}`); added++; }
  console.log(`\n📊 結果: 新規 ${added}件 / 合計 ${JOBS.length}件（削除 ${removed}件）`);
  console.log('→ 掲載管理の NOWLIVE タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
