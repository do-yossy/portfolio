#!/usr/bin/env node
'use strict';
/**
 * 合同会社スマイルライフ（sl）／配送・送迎ドライバー正社員求人（求人ボックス掲載）— 大阪バッチ・初回14件
 *
 * 2026-09-10、新規会社追加に伴う最初の求人。ユーザー指定: ドライバー正社員・大阪エリア・
 * 配送と送迎の両方・基本給月収36万円以上。当初8件で作成後、14件（配送7＋送迎7）に変更。
 * 件数増加に合わせ、タイトル・書き出し文のバリエーションを2→3パターンに増やし、
 * 内容の均質化（実質重複）リスクを抑えている。
 * スマイルライフの実際の事業（HPで確認済み: 北米アマゾン物販＝越境EC、治療院・エステサロンの直営運営）
 * に紐づけ、配送＝EC物販の出荷対応、送迎＝サロン・治療院のお客様/スタッフ送迎とした。
 *
 * 冪等化: 自分のタイトル（company='sl'）のみ削除してから投入。
 *
 * 実行: node --experimental-sqlite scripts/seed-sl-osaka-driver-kyujinbox.js
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
const IMAGE_URL    = '/images/haisou-fleet.jpg';

const AREAS = [
  { area: '大阪市西区靭本町', city: '大阪府大阪市西区靭本町', jobType: '配送ドライバー' },
  { area: '大阪市北区梅田',   city: '大阪府大阪市北区梅田',   jobType: '配送ドライバー' },
  { area: '大阪市浪速区難波', city: '大阪府大阪市浪速区難波', jobType: '配送ドライバー' },
  { area: '大阪市淀川区西中島', city: '大阪府大阪市淀川区西中島', jobType: '配送ドライバー' },
  { area: '大阪市阿倍野区阪南町', city: '大阪府大阪市阿倍野区阪南町', jobType: '配送ドライバー' },
  { area: '堺市西区鳳東町', city: '大阪府堺市西区鳳東町', jobType: '配送ドライバー' },
  { area: '茨木市駅前町', city: '大阪府茨木市駅前町', jobType: '配送ドライバー' },
  { area: '大阪市中央区心斎橋', city: '大阪府大阪市中央区心斎橋', jobType: '送迎ドライバー' },
  { area: '大阪市天王寺区悲田院町', city: '大阪府大阪市天王寺区悲田院町', jobType: '送迎ドライバー' },
  { area: '豊中市曽根東町', city: '大阪府豊中市曽根東町', jobType: '送迎ドライバー' },
  { area: '吹田市江坂町', city: '大阪府吹田市江坂町', jobType: '送迎ドライバー' },
  { area: '高槻市城北町', city: '大阪府高槻市城北町', jobType: '送迎ドライバー' },
  { area: '池田市栄本町', city: '大阪府池田市栄本町', jobType: '送迎ドライバー' },
  { area: '箕面市萱野', city: '大阪府箕面市萱野', jobType: '送迎ドライバー' },
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

function buildDescription(a, kind) {
  const INTRO = kind === 'driver' ? D_INTRO : C_INTRO;
  const DUTIES = kind === 'driver' ? D_DUTIES : C_DUTIES;
  const intro = pick(INTRO, a.area, `sl:${kind}:intro`)(a.area);
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
  const title = `【${a.area}】${pick(TITLE_POOL, a.area, `sl:${kind}:title`)}`;
  return {
    title, location: a.city, salary: SALARY, jobType: a.jobType, employmentType: EMP_TYPE,
    description: buildDescription(a, kind),
    tags: ['未経験歓迎', '正社員', '普通免許OK', a.jobType === '配送ドライバー' ? '配送' : '送迎'],
    catchcopy: `未経験歓迎｜${a.jobType}（${a.area}）｜月給36万円〜・正社員｜普通免許OK`,
    imageUrl: IMAGE_URL, isPublished: true, publishedAt: NOW, targetMedia: TARGET_MEDIA, company: COMPANY,
  };
});

async function main() {
  console.log(`\n🚚 スマイルライフ 配送・送迎ドライバー求人（求人ボックス・大阪）${JOBS.length}件 を登録します...\n`);
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
