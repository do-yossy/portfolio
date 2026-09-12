#!/usr/bin/env node
'use strict';
/**
 * ネクサス株式会社（nx）／送迎ドライバー正社員求人（engage掲載）— 大阪バッチ・初回8件
 *
 * 2026-09-12、市場データに基づく新規求人。
 * NXはこれまでengageのみ運用（求人ボックスアカウント無し、既存はフルリモート事務求人1本に依存）。
 * 市場データ（engage・大阪府の送迎ドライバー：掲載162件、時給1,177〜1,400円のパート中心、
 * 正社員・月給35万円以上の提示はほぼ無い）を踏まえ、正社員・月給35万円以上で差別化する求人を提案。
 * NXの主事業と送迎ドライバーの直接の関連は確認できていないため、事業内容には触れず、
 * 一般的な送迎ドライバーの求人として作成した。初回のため様子見で8件に絞る。
 *
 * 【重要】target_media = engageのみ（NXは求人ボックスアカウントが無いため）。
 * engageへの実際の掲載は engage_poster.py（Playwright・半自動）で行う。ENGAGE_PK_NX等の
 * 認証情報が.envに設定済みであることが前提（未設定なら別途確認が必要）。
 *
 * 冪等化: 自分のタイトル（company='nx'）のみ削除してから投入。
 *
 * 実行: node --experimental-sqlite scripts/seed-nx-osaka-chauffeur-engage.js
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

const COMPANY      = 'nx';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['engage'];
const EMP_TYPE     = '正社員';
const SALARY       = '月給350,000円〜（基本給）';
const IMAGE_URL    = '/images/haisou-fleet.jpg';

const AREAS = [
  { area: '大阪市北区中崎西', city: '大阪府大阪市北区中崎西' },
  { area: '大阪市中央区谷町', city: '大阪府大阪市中央区谷町' },
  { area: '大阪市天王寺区悲田院町', city: '大阪府大阪市天王寺区悲田院町' },
  { area: '大阪市阿倍野区阪南町', city: '大阪府大阪市阿倍野区阪南町' },
  { area: '豊中市曽根東町', city: '大阪府豊中市曽根東町' },
  { area: '吹田市江坂町', city: '大阪府吹田市江坂町' },
  { area: '東大阪市長田', city: '大阪府東大阪市長田' },
  { area: '八尾市若林町', city: '大阪府八尾市若林町' },
];

function pick(pool, area, salt) { return pool[hashSeed(`${salt}|${area}`) % pool.length]; }

const TITLE = [
  '送迎ドライバー｜月給35万円〜・正社員・未経験歓迎',
  '送迎スタッフ（乗用車）｜月給35万円〜・正社員・普通免許OK',
  '送迎ドライバー（正社員）｜月給35万円〜・未経験OK・丁寧な対応ができる方歓迎',
];
const INTRO = [
  a => `${a}周辺を中心に、お客様・スタッフの送迎を担当する送迎ドライバーです。`,
  a => `${a}エリアで、乗用車での送迎業務を担当していただきます。`,
  a => `${a}周辺を担当エリアとして、乗用車でのお客様・スタッフの送迎業務をお任せします。`,
];
const DUTIES =
`【主な業務】
・お客様・スタッフの送迎（乗用車）
・車内外の清掃、車両の日常点検
・スケジュールに合わせた運行管理`;
const APPEAL = [
  '◆ 正社員で月給35万円〜としっかりした固定給',
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

function buildDescription(a) {
  const intro = pick(INTRO, a.area, 'nx:chauffeur:intro')(a.area);
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
  const title = `【${a.area}】${pick(TITLE, a.area, 'nx:chauffeur:title')}`;
  return {
    title, location: a.city, salary: SALARY, jobType: '送迎ドライバー', employmentType: EMP_TYPE,
    description: buildDescription(a),
    tags: ['未経験歓迎', '正社員', '普通免許OK', '送迎'],
    catchcopy: `未経験歓迎｜送迎ドライバー（${a.area}）｜月給35万円〜・正社員｜普通免許OK`,
    imageUrl: IMAGE_URL, isPublished: true, publishedAt: NOW, targetMedia: TARGET_MEDIA, company: COMPANY,
  };
});

async function main() {
  console.log(`\n🚗 ネクサス 送迎ドライバー求人（engage・大阪）${JOBS.length}件 を登録します...\n`);
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
    console.log(`  ✅ 登録完了: ${job.title}`);
    added++;
  }
  console.log(`\n📊 結果: 新規 ${added}件 / 合計 ${JOBS.length}件（削除 ${removed}件）`);
  console.log('→ engageへの実際の掲載は engage_poster.py（Playwright・半自動）で行ってください。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
