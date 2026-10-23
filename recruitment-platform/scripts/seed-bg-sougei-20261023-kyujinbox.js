#!/usr/bin/env node
'use strict';
/**
 * 【2026-10-23 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-bg-sougei-20261021-kyujinbox と同一）。
 * BIGEYES（bg）／スタッフ送迎・お客様送迎ドライバー（求人ボックス掲載・関西）25件
 * 2026-10-16、日次の求人ボックス求人作成。ユーザー確認：BGにも送迎業務がある。
 * 送迎の具体的な内容（誰を乗せるか等）は未確認のため、本文は「当社スタッフ・お客様の送迎」と一般的に記載。
 * 給与はBGの既存求人（サロン納品ドライバー）と同じ月給390,000〜450,000円（送迎の実際の給与は未確認）。掲載前に実際の条件と一致しているか確認すること。
 * 勤務地は、既存の全弾と重複しない実在の町名のみ（連番丁目は使わない）。
 * 冪等: 今回のタイトル（company='bg'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-bg-sougei-20261023-kyujinbox.js
 */
const path = require('path');
const fs = require('fs');
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

const COMPANY = 'bg';
const NOW = new Date().toISOString();
const TARGET_MEDIA = ['求人ボックス'];
const SALARY = '月給390,000円〜450,000円';
const SALARY_TITLE = '月給39万〜45万円';
const IMAGE_URL = '/images/haisou-fleet.jpg';

const AREAS = [
  { area: '大阪市東淀川区南江口', city: '大阪府大阪市東淀川区南江口' },
  { area: '大阪市旭区泉町', city: '大阪府大阪市旭区泉町' },
  { area: '大阪市城東区天王田', city: '大阪府大阪市城東区天王田' },
  { area: '大阪市都島区大東町', city: '大阪府大阪市都島区大東町' },
  { area: '大阪市東淀川区北島', city: '大阪府大阪市東淀川区北島' },
  { area: '大阪市城東区新喜多', city: '大阪府大阪市城東区新喜多' },
  { area: '大阪市都島区御幸町', city: '大阪府大阪市都島区御幸町' },
  { area: '大阪市城東区新喜多東', city: '大阪府大阪市城東区新喜多東' },
  { area: '大阪市都島区淀川町', city: '大阪府大阪市都島区淀川町' },
  { area: '東大阪市荒本新町', city: '大阪府東大阪市荒本新町' },
  { area: '八尾市久宝寺', city: '大阪府八尾市久宝寺' },
  { area: '守口市菊水通', city: '大阪府守口市菊水通' },
  { area: '寝屋川市香里北之町', city: '大阪府寝屋川市香里北之町' },
  { area: '枚方市岡山手町', city: '大阪府枚方市岡山手町' },
  { area: '高槻市白梅町', city: '大阪府高槻市白梅町' },
  { area: '茨木市北春日丘', city: '大阪府茨木市北春日丘' },
  { area: '箕面市箕面公園', city: '大阪府箕面市箕面公園' },
  { area: '岸和田市宮本町', city: '大阪府岸和田市宮本町' },
  { area: '和泉市和気町', city: '大阪府和泉市和気町' },
  { area: '松原市上田', city: '大阪府松原市上田' },
  { area: '大東市住道矢野', city: '大阪府大東市住道矢野' },
  { area: '京都市伏見区下鳥羽', city: '京都府京都市伏見区下鳥羽' },
  { area: '京都市山科区小山', city: '京都府京都市山科区小山' },
  { area: '京都市南区梅小路', city: '京都府京都市南区梅小路' },
  { area: '京都市右京区宇多野', city: '京都府京都市右京区宇多野' },
];

function pick(pool, area, salt) { return pool[hashSeed(`${salt}|${area}`) % pool.length]; }

// 職種は2系統（スタッフ送迎／お客様送迎）を、エリアごとに決定論的に振り分け
const KINDS = [
  { jobType: 'スタッフ送迎ドライバー',
    titles: [
      `スタッフ送迎ドライバー｜${SALARY_TITLE}・正社員・未経験歓迎`,
      `スタッフ送迎ドライバー（正社員）｜${SALARY_TITLE}・普通免許OK`,
      `送迎ドライバー（スタッフの送迎）｜${SALARY_TITLE}・正社員・未経験OK`,
    ],
    intros: [
      a => `${a}周辺を中心に、当社スタッフの送迎を担当する送迎ドライバーです。`,
      a => `${a}周辺エリアで、当社スタッフの移動を乗用車でサポートしていただきます。`,
      a => `${a}周辺を担当エリアとして、スタッフの送迎業務をお任せします。`,
    ],
    duties: '・スタッフの送迎（乗用車）\n・車内外の清掃、車両の日常点検\n・スケジュールに合わせた運行管理',
    reward: 'スタッフの移動を支える、頼りにされるお仕事です。しっかりした固定給で、安定して働けます。' },
  { jobType: 'お客様送迎ドライバー',
    titles: [
      `お客様送迎ドライバー｜${SALARY_TITLE}・正社員・未経験歓迎`,
      `お客様送迎ドライバー（正社員）｜${SALARY_TITLE}・普通免許OK`,
      `送迎ドライバー（お客様の送迎）｜${SALARY_TITLE}・正社員・丁寧な対応ができる方歓迎`,
    ],
    intros: [
      a => `${a}周辺を中心に、お客様の送迎を担当する送迎ドライバーです。`,
      a => `${a}周辺エリアで、お客様の移動を乗用車でサポートしていただきます。`,
      a => `${a}周辺を担当エリアとして、お客様の送迎業務をお任せします。`,
    ],
    duties: '・お客様の送迎（乗用車）\n・車内外の清掃、車両の日常点検\n・スケジュールに合わせた運行管理',
    reward: 'お客様の送迎を通じて「ありがとう」を直接いただける、やりがいのあるお仕事です。しっかりした固定給で、安定して働けます。' },
];

const CONDITIONS = `【給与】
${SALARY}
・昇給あり
・交通費支給
・車両・燃料は会社負担

【勤務時間】
実働8時間・シフト制（週休2日）

【応募資格】
普通自動車運転免許（AT限定可）／未経験・ブランク歓迎・学歴不問

【待遇・福利厚生】
各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給あり`;

const APPEAL = [
  '◆ しっかりした固定給で安定して働ける',
  '◆ 未経験・ブランクの方も歓迎、先輩が丁寧にサポート',
  '◆ 普通自動車免許（AT限定可）があればOK',
  '◆ 各種社会保険完備・正社員雇用',
].join('\n');

const JOBS = AREAS.map(a => {
  const kind = KINDS[hashSeed(`${COMPANY}|kind|${a.area}`) % KINDS.length];
  const title = `【${a.area}】${pick(kind.titles, a.area, `${COMPANY}:t`)}`;
  const intro = pick(kind.intros, a.area, `${COMPANY}:i`)(a.area);
  const description = `${intro}

【仕事内容】
【主な業務】
${kind.duties}

【この仕事の魅力】
${APPEAL}

${CONDITIONS}

※${a.area}周辺での募集です。まずはお気軽にご応募ください。`;
  return {
    title, location: a.city, salary: SALARY, jobType: kind.jobType, employmentType: '正社員',
    description, rewarding: kind.reward,
    tags: ['未経験歓迎', '正社員', '普通免許OK', '送迎'],
    catchcopy: `未経験歓迎｜${kind.jobType}（${a.area}）｜${SALARY_TITLE}・正社員｜普通免許OK`,
    imageUrl: IMAGE_URL, isPublished: true, publishedAt: NOW, targetMedia: TARGET_MEDIA, company: COMPANY,
  };
});

async function main() {
  console.log(`\n🚗 BIGEYES 送迎ドライバー求人（求人ボックス・関西）${JOBS.length}件 を登録します...\n`);
  const myTitles = new Set(JOBS.map(j => j.title));
  const existing = await Jobs.findAll();
  let removed = 0;
  for (const j of existing) { if (j.company === COMPANY && myTitles.has(j.title)) { await Jobs.delete(j.id); removed++; } }
  if (removed) console.log(`  🧹 既存の同一バッチ ${removed}件 を削除（冪等・入れ直し）\n`);
  for (const job of JOBS) { await Jobs.create(job); console.log(`  ✅ 登録完了 [${job.jobType}]: ${job.title}`); }
  console.log(`\n📊 結果: 新規 ${JOBS.length}件（削除 ${removed}件）`);
  console.log('→ 掲載管理の BIGEYES タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}
main().catch(err => { console.error(err); process.exit(1); });
