#!/usr/bin/env node
'use strict';
/**
 * AMBITION合同会社（am）／配送・送迎ドライバー正社員求人（求人ボックス掲載）— 大阪バッチ・初回8件
 *
 * 2026-09-10、新規会社追加に伴う最初の求人。ユーザー指定: ドライバー正社員・大阪エリア・
 * 配送と送迎の両方・基本給月収36万円以上。
 * AMBITIONの主事業（経費削減コンサル）とドライバー職の直接の関連は確認できていないため、
 * 事業内容には触れず、一般的な配送・送迎ドライバーの求人として作成した。
 * 初回のため様子見で8件（配送4＋送迎4）に絞り、反応を見て件数を増やす想定。
 *
 * 冪等化: 自分のタイトル（company='am'）のみ削除してから投入。
 *
 * 実行: node --experimental-sqlite scripts/seed-am-osaka-driver-kyujinbox.js
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

const AREAS = [
  { area: '大阪市住之江区南港', city: '大阪府大阪市住之江区南港', jobType: '配送ドライバー' },
  { area: '大阪市城東区今福', city: '大阪府大阪市城東区今福', jobType: '配送ドライバー' },
  { area: '東大阪市長田', city: '大阪府東大阪市長田', jobType: '配送ドライバー' },
  { area: '八尾市若林町', city: '大阪府八尾市若林町', jobType: '配送ドライバー' },
  { area: '大阪市阿倍野区昭和町', city: '大阪府大阪市阿倍野区昭和町', jobType: '送迎ドライバー' },
  { area: '堺市北区新金岡町', city: '大阪府堺市北区新金岡町', jobType: '送迎ドライバー' },
  { area: '高槻市芥川町', city: '大阪府高槻市芥川町', jobType: '送迎ドライバー' },
  { area: '枚方市岡東町', city: '大阪府枚方市岡東町', jobType: '送迎ドライバー' },
];

function pick(pool, area, salt) { return pool[hashSeed(`${salt}|${area}`) % pool.length]; }

const D_TITLE = [
  '配送ドライバー｜月給36万円〜・正社員・未経験歓迎',
  'ルート配送ドライバー｜月給36万円〜・正社員・普通免許OK',
];
const D_INTRO = [
  a => `${a}周辺を担当エリアとする配送ドライバーです。決まったルートでの配送が中心で、未経験の方でも覚えやすいお仕事です。`,
  a => `${a}周辺の取引先へ荷物をお届けする配送ドライバーのお仕事です。`,
];
const D_DUTIES =
`【主な業務】
・担当エリアへの荷物・商品の配送
・配送先での受け渡し、伝票・記録の確認
・車両の日常点検`;

const C_TITLE = [
  '送迎ドライバー｜月給36万円〜・正社員・未経験歓迎',
  '送迎スタッフ（乗用車）｜月給36万円〜・正社員・普通免許OK',
];
const C_INTRO = [
  a => `${a}周辺を中心に、お客様・スタッフの送迎を担当する送迎ドライバーです。`,
  a => `${a}周辺エリアで、乗用車での送迎業務を担当していただきます。`,
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

function buildDescription(a, kind) {
  const INTRO = kind === 'driver' ? D_INTRO : C_INTRO;
  const DUTIES = kind === 'driver' ? D_DUTIES : C_DUTIES;
  const intro = pick(INTRO, a.area, `am:${kind}:intro`)(a.area);
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
  const title = `【${a.area}】${pick(TITLE_POOL, a.area, `am:${kind}:title`)}`;
  return {
    title, location: a.city, salary: SALARY, jobType: a.jobType, employmentType: EMP_TYPE,
    description: buildDescription(a, kind),
    tags: ['未経験歓迎', '正社員', '普通免許OK', a.jobType === '配送ドライバー' ? '配送' : '送迎'],
    catchcopy: `未経験歓迎｜${a.jobType}（${a.area}）｜月給36万円〜・正社員｜普通免許OK`,
    imageUrl: IMAGE_URL, isPublished: true, publishedAt: NOW, targetMedia: TARGET_MEDIA, company: COMPANY,
  };
});

async function main() {
  console.log(`\n🚚 AMBITION 配送・送迎ドライバー求人（求人ボックス・大阪）${JOBS.length}件 を登録します...\n`);
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
