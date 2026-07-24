#!/usr/bin/env node
'use strict';
/**
 * 株式会社NOWLIVE（nl）／移動販売車の送迎ドライバー 求人（求人ボックス掲載）
 * 会社理念「ワクワクする未来を選ぶ」・食品催事／イベントプロモーション／配送物流に合わせた内容。
 * 大阪の複数エリアで、内容が重複しないようエリア名でシードしたバリエーションを付与。
 *
 * 実行: node --experimental-sqlite scripts/seed-nl-movingsales-kyujinbox.js
 *
 * ※ 給与は仮の相場（月給280,000〜350,000円）。実際の条件に合わせて後で調整可。
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
const TARGET_MEDIA = ['kyujinbox'];
const JOB_TYPE     = '送迎・配送ドライバー';
const EMP_TYPE     = '正社員';
const SALARY       = '月給280,000円〜350,000円（経験・能力を考慮）';
const IMAGE_URL    = '/images/ec-haisou-driver.jpg';

// 大阪の掲載エリア（都心＋近郊）
const AREAS = [
  { area: '大阪市中央区', city: '大阪府大阪市中央区' },
  { area: '大阪市北区',   city: '大阪府大阪市北区' },
  { area: '大阪市浪速区', city: '大阪府大阪市浪速区' },
  { area: '東大阪市',     city: '大阪府東大阪市' },
  { area: '堺市堺区',     city: '大阪府堺市堺区' },
];

function pick(pool, area, salt) {
  return pool[hashSeed(`${salt}|${area}`) % pool.length];
}

const INTRO = [
  a => `${a}を拠点に、食品催事やイベント会場へ移動販売車（キッチンカー）を送迎するドライバーのお仕事です。`,
  a => `${a}エリアで、催事・イベント運営を支える移動販売車の送迎（回送）ドライバーを募集します。`,
  a => `${a}周辺で、移動販売車をイベント会場へお届けし、資材の搬入もお任せする送迎ドライバーです。`,
];
const TITLE_CORE = [
  '移動販売車の送迎ドライバー｜未経験歓迎｜催事・イベントを支える｜普通免許OK',
  '移動販売車（キッチンカー）の送迎・回送ドライバー｜未経験歓迎｜月給28万円〜',
  '催事・イベント会場への移動販売車送迎ドライバー｜普通免許OK｜未経験・ブランク歓迎',
];
const APPEAL = [
  '◆ イベント・催事の“最前線”を支えるやりがい',
  '◆ 未経験・ブランクの方も歓迎、先輩が丁寧にサポート',
  '◆ 「やってみたい」という気持ちを尊重する社風',
  '◆ 普通自動車免許があればOK・特別な経験は不要',
  '◆ 決まった会場・ルート中心で覚えやすい',
];

const COMPANY_BLOCK =
`【会社について】
株式会社NOWLIVEは「ワクワクする未来を選ぶ」を理念に、食品催事事業・イベントプロモーション事業を展開しています。人気スイーツや地域の特産品など多彩な商品をお客様へお届けしており、その現場を支えているのが移動販売車の送迎・物流です。ドライバーは会社の最前線で活躍する大切なポジションです。`;

const DUTIES =
`【お任せするお仕事】
・移動販売車（キッチンカー）を催事・イベント会場へ送迎（回送）
・イベント資材の搬入・搬出、積み込み・積み下ろし
・各拠点・取引先へのルート配送
・出発前の車両点検、簡単な清掃
※普通自動車免許（AT限定可）があればOK。決まった会場・ルートが中心で、未経験の方も安心してスタートできます。`;

const CONDITIONS = (area) =>
`【募集条件・待遇】
雇用形態：正社員
給与：月給280,000円〜350,000円（経験・能力を考慮）
勤務地：${area}周辺（大阪府内・近郊の催事／イベント会場）
必要な資格：普通自動車運転免許（AT限定可）
未経験歓迎／ブランクOK／各種社会保険完備／交通費支給`;

function buildDescription(a) {
  const intro = pick(INTRO, a.area, 'nl:intro')(a.area);
  const appeal = (() => {
    const start = hashSeed(`nl:ap|${a.area}`) % APPEAL.length;
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
  title:     `【${a.area}】${pick(TITLE_CORE, a.area, 'nl:title')}`,
  location:  a.city,
  salary:    SALARY,
  jobType:   JOB_TYPE,
  employmentType: EMP_TYPE,
  description: buildDescription(a),
  tags: ['未経験歓迎', '正社員', '普通免許OK', 'ブランクOK', '送迎', '配送', '大阪', 'イベント'],
  catchcopy: `未経験歓迎｜移動販売車の送迎ドライバー（${a.area}）｜催事・イベントを支えるやりがい｜普通免許OK・ブランク歓迎・各種社会保険完備`,
  imageUrl:  IMAGE_URL,
  isPublished: true,
  publishedAt: NOW,
  targetMedia: TARGET_MEDIA,
  company: COMPANY,
}));

async function main() {
  console.log(`\n🚚 NOWLIVE 移動販売車の送迎ドライバー求人（求人ボックス）${JOBS.length}件 を登録します...\n`);
  const existing = await Jobs.findAll();
  const existingTitles = new Set(existing.map(j => j.title));
  let added = 0, skipped = 0;
  for (const job of JOBS) {
    if (existingTitles.has(job.title)) {
      console.log(`  ⏭️  スキップ（既存）: ${job.title}`);
      skipped++;
      continue;
    }
    await Jobs.create(job);
    console.log(`  ✅ 登録完了: ${job.title}`);
    added++;
  }
  console.log(`\n📊 結果: 登録 ${added}件 / スキップ ${skipped}件 / 合計 ${JOBS.length}件`);
  console.log('→ 掲載管理の NOWLIVE タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
