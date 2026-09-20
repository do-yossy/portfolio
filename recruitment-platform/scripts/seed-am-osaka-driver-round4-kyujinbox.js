#!/usr/bin/env node
'use strict';
/**
 * AMBITION合同会社（am）／配送・送迎ドライバー正社員求人（求人ボックス掲載）— 大阪バッチ・第4弾25件
 *
 * 2026-09-21、「AMも25件」の指示に伴う追加バッチ。既存89件（第1〜3弾）と重複しないよう、
 * 未使用の実在エリア11件＋既使用エリアの1丁目表記14件（いずれも実在の町名がベース）で構成。
 * 内容方針は第1〜3弾と同一。
 *
 * 冪等化: 自分のタイトル（company='am'）のみ削除してから投入。
 *
 * 実行: node --experimental-sqlite scripts/seed-am-osaka-driver-round4-kyujinbox.js
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

const COMPANY      = 'am';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['求人ボックス'];
const EMP_TYPE     = '正社員';
const SALARY       = '月給360,000円〜（基本給）';
const IMAGE_URL    = '/images/haisou-fleet.jpg';

// 既存89件（第1〜3弾）と重複しない新規25エリア
const AREAS = [
  { area: '大阪市北区天神橋',       city: '大阪府大阪市北区天神橋',       jobType: '配送ドライバー' },
  { area: '大阪市中央区本町',       city: '大阪府大阪市中央区本町',       jobType: '配送ドライバー' },
  { area: '大阪市東淀川区瑞光',     city: '大阪府大阪市東淀川区瑞光',     jobType: '配送ドライバー' },
  { area: '大阪市平野区平野本町',   city: '大阪府大阪市平野区平野本町',   jobType: '配送ドライバー' },
  { area: '大阪市大正区三軒家東',   city: '大阪府大阪市大正区三軒家東',   jobType: '配送ドライバー' },
  { area: '大阪市此花区春日出中',   city: '大阪府大阪市此花区春日出中',   jobType: '配送ドライバー' },
  { area: '大阪市福島区野田',       city: '大阪府大阪市福島区野田',       jobType: '配送ドライバー' },
  { area: '京都市山科区椥辻',       city: '京都府京都市山科区椥辻',       jobType: '配送ドライバー' },
  { area: '長岡京市長岡',           city: '京都府長岡京市長岡',           jobType: '配送ドライバー' },
  { area: '八幡市欽明台',           city: '京都府八幡市欽明台',           jobType: '配送ドライバー' },
  { area: '木津川市梅美台',         city: '京都府木津川市梅美台',         jobType: '配送ドライバー' },
  { area: '大阪市北区梅田1丁目',   city: '大阪府大阪市北区梅田1丁目',   jobType: '配送ドライバー' },
  { area: '大阪市北区茶屋町1丁目', city: '大阪府大阪市北区茶屋町1丁目', jobType: '配送ドライバー' },
  { area: '大阪市北区中崎西1丁目', city: '大阪府大阪市北区中崎西1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市中央区心斎橋1丁目', city: '大阪府大阪市中央区心斎橋1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市中央区難波1丁目', city: '大阪府大阪市中央区難波1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市中央区谷町1丁目', city: '大阪府大阪市中央区谷町1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市西区靭本町1丁目', city: '大阪府大阪市西区靭本町1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市西区新町1丁目',   city: '大阪府大阪市西区新町1丁目',   jobType: '送迎ドライバー' },
  { area: '大阪市西区阿波座1丁目', city: '大阪府大阪市西区阿波座1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市天王寺区悲田院町1丁目', city: '大阪府大阪市天王寺区悲田院町1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市天王寺区上本町1丁目', city: '大阪府大阪市天王寺区上本町1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市浪速区難波中1丁目', city: '大阪府大阪市浪速区難波中1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市浪速区恵美須西1丁目', city: '大阪府大阪市浪速区恵美須西1丁目', jobType: '送迎ドライバー' },
  { area: '大阪市淀川区西中島1丁目', city: '大阪府大阪市淀川区西中島1丁目', jobType: '送迎ドライバー' },
];

function pick(pool, area, salt) { return pool[hashSeed(`${salt}|${area}`) % pool.length]; }

const D_TITLE = [
  '配送ドライバー｜月給36万円〜・正社員・未経験歓迎',
  'ルート配送ドライバー｜月給36万円〜・正社員・普通免許OK',
  '配送スタッフ（正社員）｜月給36万円〜・未経験OK・普通免許あればOK',
];
const D_INTRO = [
  a => `${a}周辺を担当エリアとする配送ドライバーです。決まったルートでの配送が中心で、未経験の方でも覚えやすいお仕事です。`,
  a => `${a}周辺の取引先へ荷物をお届けする配送ドライバーのお仕事です。`,
  a => `${a}周辺エリアで、決まった取引先を回る配送業務を担当していただきます。`,
];
const D_DUTIES =
`【主な業務】
・担当エリアへの荷物・商品の配送
・配送先での受け渡し、伝票・記録の確認
・車両の日常点検`;

const C_TITLE = [
  '送迎ドライバー｜月給36万円〜・正社員・未経験歓迎',
  '送迎スタッフ（乗用車）｜月給36万円〜・正社員・普通免許OK',
  '送迎ドライバー（正社員）｜月給36万円〜・未経験OK・丁寧な対応ができる方歓迎',
];
const C_INTRO = [
  a => `${a}周辺を中心に、お客様・スタッフの送迎を担当する送迎ドライバーです。`,
  a => `${a}周辺エリアで、乗用車での送迎業務を担当していただきます。`,
  a => `${a}周辺を担当エリアとして、乗用車でのお客様・スタッフの送迎業務をお任せします。`,
];
const C_DUTIES =
`【主な業務】
・お客様・スタッフの送迎（乗用車）
・車内外の清掃、車両の日常点検
・スケジュールに合わせた運行管理`;

const APPEAL = [
  '◆ 基本給36万円〜としっかりした固定給',
  '◆ 未経験・ブランクの方も歓迎、先輩が丁寧にサポート',
  '◆ 普通自動車免許（AT限定可）があればOK',
  '◆ 各種社会保険完備・安定した正社員雇用',
];

const CONDITIONS =
`【給与】
${SALARY}
・昇給あり
・交通費支給
・車両・燃料は会社負担

【勤務時間】
実働8時間・シフト制（週休2日）

【応募資格】
普通自動車運転免許（AT限定可）／未経験・ブランク歓迎・学歴不問

【待遇・福利厚生】
各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給・賞与あり`;

const REWARDING = {
  driver: '決まった拠点からの配送なので覚えやすく、未経験からでも安心してスタートできます。基本給36万円〜としっかりした固定給で、安定して働けることが魅力です。',
  chauffeur: 'お客様やスタッフの送迎を通じて「ありがとう」を直接いただける、やりがいのあるお仕事です。基本給36万円〜としっかりした固定給で、安定して働けます。',
};

function buildDescription(a, kind) {
  const INTRO = kind === 'driver' ? D_INTRO : C_INTRO;
  const DUTIES = kind === 'driver' ? D_DUTIES : C_DUTIES;
  const intro = pick(INTRO, a.area, `am4:${kind}:intro`)(a.area);
  const appeal = APPEAL.join('\n');
  return `${intro}

【仕事内容】
${DUTIES}

【この仕事の魅力】
${appeal}

${CONDITIONS}

※${a.area}周辺での募集です。まずはお気軽にご応募ください。`;
}

const JOBS = AREAS.map(a => {
  const kind = a.jobType === '配送ドライバー' ? 'driver' : 'chauffeur';
  const TITLE_POOL = kind === 'driver' ? D_TITLE : C_TITLE;
  const title = `【${a.area}】${pick(TITLE_POOL, a.area, `am4:${kind}:title`)}`;
  return {
    title, location: a.city, salary: SALARY, jobType: a.jobType, employmentType: EMP_TYPE,
    description: buildDescription(a, kind),
    rewarding: REWARDING[kind],
    tags: ['未経験歓迎', '正社員', '普通免許OK', a.jobType === '配送ドライバー' ? '配送' : '送迎'],
    catchcopy: `未経験歓迎｜${a.jobType}（${a.area}）｜月給36万円〜・正社員｜普通免許OK`,
    imageUrl: IMAGE_URL, isPublished: true, publishedAt: NOW, targetMedia: TARGET_MEDIA, company: COMPANY,
  };
});

async function main() {
  console.log(`\n🚚 AMBITION 配送・送迎ドライバー求人 第4弾（求人ボックス・大阪/京都）${JOBS.length}件 を登録します...\n`);
  const myTitles = new Set(JOBS.map(j => j.title));
  const existing = await Jobs.findAll();
  let removed = 0;
  for (const j of existing) {
    if (j.company === COMPANY && myTitles.has(j.title)) { await Jobs.delete(j.id); removed++; }
  }
  if (removed) console.log(`  🧹 既存の同一バッチ ${removed}件 を削除（冪等・入れ直し）\n`);
  let added = 0;
  for (const job of JOBS) {
    await Jobs.create(job);
    console.log(`  ✅ 登録完了 [${job.jobType}]: ${job.title}`);
    added++;
  }
  console.log(`\n📊 結果: 新規 ${added}件 / 合計 ${JOBS.length}件（削除 ${removed}件）`);
  console.log('→ 掲載管理の AMBITION タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
