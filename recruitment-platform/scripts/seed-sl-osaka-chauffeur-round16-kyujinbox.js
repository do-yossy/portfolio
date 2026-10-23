#!/usr/bin/env node
'use strict';
/**
 * 【2026-10-23 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-sl-osaka-chauffeur-round15-kyujinbox と同一）。
 * 合同会社スマイルライフ（sl）／配送・送迎ドライバー正社員求人（求人ボックス掲載）— 大阪バッチ・第15弾25件
 *
 * 2026-10-14、日次の求人ボックス求人作成に伴う追加バッチ。既存421件（第1〜11弾、1〜8丁目まで使用済み）
 * と重複しないよう、第3〜6弾と同一エリアの9丁目表記で構成。内容方針・画像/rewardingの扱いは第1〜4弾と同一。
 *
 * 冪等化: 自分のタイトル（company='sl'）のみ削除してから投入。
 *
 * 実行: node --experimental-sqlite scripts/seed-sl-osaka-driver-round12-kyujinbox.js
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

const COMPANY      = 'sl';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['求人ボックス'];
const EMP_TYPE     = '正社員';
const SALARY       = '月給360,000円〜（基本給）';
const DRIVER_IMAGE    = '/images/haisou-fleet.jpg';
const CHAUFFEUR_IMAGE = '/images/bi-secretary-driver.jpg';

// 既存の全弾と重複しない新規25エリア（実在の町名のみ。連番丁目は使わない）
const AREAS = [
  { area: '豊中市新千里西町', city: '大阪府豊中市新千里西町', jobType: '送迎ドライバー' },
  { area: '吹田市千里山西', city: '大阪府吹田市千里山西', jobType: '送迎ドライバー' },
  { area: '池田市緑丘', city: '大阪府池田市緑丘', jobType: '送迎ドライバー' },
  { area: '豊中市新千里南町', city: '大阪府豊中市新千里南町', jobType: '送迎ドライバー' },
  { area: '吹田市千里山竹園', city: '大阪府吹田市千里山竹園', jobType: '送迎ドライバー' },
  { area: '池田市荘園', city: '大阪府池田市荘園', jobType: '送迎ドライバー' },
  { area: '豊中市新千里北町', city: '大阪府豊中市新千里北町', jobType: '送迎ドライバー' },
  { area: '吹田市千里山高塚', city: '大阪府吹田市千里山高塚', jobType: '送迎ドライバー' },
  { area: '池田市栄町', city: '大阪府池田市栄町', jobType: '送迎ドライバー' },
  { area: '豊中市千里園', city: '大阪府豊中市千里園', jobType: '送迎ドライバー' },
  { area: '吹田市千里山星が丘', city: '大阪府吹田市千里山星が丘', jobType: '送迎ドライバー' },
  { area: '池田市菅原町', city: '大阪府池田市菅原町', jobType: '送迎ドライバー' },
  { area: '豊中市上新田', city: '大阪府豊中市上新田', jobType: '送迎ドライバー' },
  { area: '吹田市山田東', city: '大阪府吹田市山田東', jobType: '送迎ドライバー' },
  { area: '池田市神田', city: '大阪府池田市神田', jobType: '送迎ドライバー' },
  { area: '豊中市柴原町', city: '大阪府豊中市柴原町', jobType: '送迎ドライバー' },
  { area: '吹田市山田南', city: '大阪府吹田市山田南', jobType: '送迎ドライバー' },
  { area: '池田市鉢塚', city: '大阪府池田市鉢塚', jobType: '送迎ドライバー' },
  { area: '豊中市蛍池東町', city: '大阪府豊中市蛍池東町', jobType: '送迎ドライバー' },
  { area: '吹田市山田北', city: '大阪府吹田市山田北', jobType: '送迎ドライバー' },
  { area: '池田市室町', city: '大阪府池田市室町', jobType: '送迎ドライバー' },
  { area: '豊中市蛍池西町', city: '大阪府豊中市蛍池西町', jobType: '送迎ドライバー' },
  { area: '吹田市山田丘', city: '大阪府吹田市山田丘', jobType: '送迎ドライバー' },
  { area: '池田市井口堂', city: '大阪府池田市井口堂', jobType: '送迎ドライバー' },
  { area: '豊中市蛍池南町', city: '大阪府豊中市蛍池南町', jobType: '送迎ドライバー' },
];

function pick(pool, area, salt) { return pool[hashSeed(`${salt}|${area}`) % pool.length]; }

const D_TITLE = [
  '物流配送ドライバー｜月給36万円〜・正社員・未経験歓迎',
  'EC物販の配送ドライバー｜月給36万円〜・正社員・普通免許OK',
  '配送スタッフ（正社員）｜月給36万円〜・未経験OK・普通免許あればOK',
];
const D_INTRO = [
  a => `${a}周辺を拠点に、越境EC（北米向けアマゾン物販）の出荷対応・配送を担当する配送ドライバーです。`,
  a => `${a}周辺の倉庫・拠点から、EC事業の出荷商品を配送先まで届ける配送ドライバーのお仕事です。`,
  a => `${a}周辺エリアで、EC物販事業の商品配送を担当していただきます。決まった拠点からの出発なので覚えやすいお仕事です。`,
];
const D_DUTIES =
`【主な業務】
・EC物販事業の出荷商品の集荷・配送
・配送先での受け渡し、伝票・記録の確認
・車両の日常点検
・倉庫内での積み込み・仕分けの補助`;

const C_TITLE = [
  '送迎ドライバー｜月給36万円〜・正社員・未経験歓迎',
  'サロン・治療院の送迎ドライバー｜月給36万円〜・正社員・普通免許OK',
  '送迎スタッフ（正社員）｜月給36万円〜・未経験OK・丁寧な対応ができる方歓迎',
];
const C_INTRO = [
  a => `${a}周辺の直営治療院・エステサロンにて、お客様・スタッフの送迎を担当する送迎ドライバーです。`,
  a => `${a}周辺を中心に、サロン・治療院に通われるお客様や勤務スタッフの送迎を担当していただきます。`,
  a => `${a}周辺エリアで、直営サロン・治療院のお客様・スタッフの送迎業務を担当していただきます。`,
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
  const intro = pick(INTRO, a.area, `sl15:${kind}:intro`)(a.area);
  const appeal = APPEAL.join('\n');
  return `${intro}

【会社について】
合同会社スマイルライフは、越境EC（北米アマゾン物販）事業と、治療院・エステサロンの直営運営を展開しています。

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
  const title = `【${a.area}】${pick(TITLE_POOL, a.area, `sl15:${kind}:title`)}`;
  return {
    title, location: a.city, salary: SALARY, jobType: a.jobType, employmentType: EMP_TYPE,
    description: buildDescription(a, kind),
    rewarding: REWARDING[kind],
    tags: ['未経験歓迎', '正社員', '普通免許OK', a.jobType === '配送ドライバー' ? '配送' : '送迎'],
    catchcopy: `未経験歓迎｜${a.jobType}（${a.area}）｜月給36万円〜・正社員｜普通免許OK`,
    imageUrl: kind === 'driver' ? DRIVER_IMAGE : CHAUFFEUR_IMAGE,
    isPublished: true, publishedAt: NOW, targetMedia: TARGET_MEDIA, company: COMPANY,
  };
});

async function main() {
  console.log(`\n🚚 スマイルライフ 配送・送迎ドライバー求人 第15弾（求人ボックス・大阪/京都/兵庫）${JOBS.length}件 を登録します...\n`);
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
  console.log('→ 掲載管理の スマイルライフ タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
