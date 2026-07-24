#!/usr/bin/env node
'use strict';
/**
 * Brand ideaL合同会社（bi）／秘書兼ドライバー（代表を支える）求人（求人ボックス掲載）
 * 会社理念「日本再生を企業から」・マーケティング支援／商品プロデュース／物流サポートに合わせた内容。
 * 千葉県の複数エリアで、内容が重複しないようエリア名でシードしたバリエーションを付与。
 *
 * 実行: node --experimental-sqlite scripts/seed-bi-secretary-driver-kyujinbox.js
 *
 * ※ 勤務時間はシフト制（詳細未確定）。実際の条件に合わせて後で調整可。
 * ※ 掲載画像は public/images/bi-secretary-driver.jpg を使用（要保存）。
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
const TARGET_MEDIA = ['kyujinbox'];
const JOB_TYPE     = '秘書兼ドライバー';
const EMP_TYPE     = '正社員';
const SALARY       = '月給350,000円〜430,000円（経験・能力を考慮）';
const IMAGE_URL    = '/images/bi-secretary-driver.jpg';

// 千葉県の掲載エリア（主要都市）
const AREAS = [
  { area: '千葉市中央区', city: '千葉県千葉市中央区' },
  { area: '千葉市美浜区', city: '千葉県千葉市美浜区' },
  { area: '船橋市',       city: '千葉県船橋市' },
  { area: '市川市',       city: '千葉県市川市' },
  { area: '松戸市',       city: '千葉県松戸市' },
  { area: '柏市',         city: '千葉県柏市' },
  { area: '浦安市',       city: '千葉県浦安市' },
  { area: '習志野市',     city: '千葉県習志野市' },
];

function pick(pool, area, salt) {
  return pool[hashSeed(`${salt}|${area}`) % pool.length];
}

const INTRO = [
  a => `${a}を拠点に、代表の送迎・業務サポートをお任せする秘書兼ドライバーのお仕事です。`,
  a => `${a}エリアで、代表を支える秘書兼ドライバー（運転＋秘書サポート）を募集します。`,
  a => `${a}周辺で、代表の運転・スケジュール補助・簡単な事務を担う秘書兼ドライバーです。`,
];
const TITLE_CORE = [
  '秘書兼ドライバー｜代表を支える｜未経験歓迎｜月給35万円〜43万円｜普通免許OK',
  '代表の送迎＆秘書サポート｜秘書兼ドライバー｜未経験・シニア・フリーター歓迎｜週休2日',
  '秘書兼ドライバー募集｜代表を支えるやりがい｜転勤なし・シフト自由｜月給35万〜43万円',
];
const APPEAL = [
  '◆ 代表のすぐそばで、幅広い経験が積める',
  '◆ 未経験・シニア・フリーターの方も歓迎',
  '◆ シフト自由・週休2日制・転勤なしで働きやすい',
  '◆ 普通自動車免許があればOK・特別な経験は不要',
  '◆ 産休・育休の取得実績あり、長く働ける環境',
];

const COMPANY_BLOCK =
`【会社について】
Brand ideaL合同会社は「日本再生を企業から」を理念に、マーケティング支援・商品プロデュース・物流サポートなど幅広い事業を展開しています。事業拡大に伴い、代表の業務を支える秘書兼ドライバーを募集します。代表の一番近くで会社の成長を支える、やりがいのあるポジションです。`;

const DUTIES =
`【お任せするお仕事】
・代表の送迎（社用車での運転）
・移動・スケジュールのサポート
・簡単な事務・秘書業務（書類整理・データ入力など）
・来客対応・電話対応の補助
・その他付随する業務
※普通自動車免許（AT限定可）があればOK。運転が中心で、秘書業務は先輩が丁寧にお教えします。未経験の方も安心してスタートできます。`;

const CONDITIONS = (area) =>
`【募集条件・待遇】
雇用形態：正社員
給与：月給350,000円〜430,000円（経験・能力を考慮）
勤務時間：シフト制（時間は応相談）
休日：週休2日制・シフト自由
勤務地：${area}周辺（千葉県内）
必要な資格：普通自動車運転免許（AT限定可）
未経験歓迎／学歴不問／シニア・フリーター歓迎／転勤なし／産休・育休取得実績あり／各種社会保険完備`;

function buildDescription(a) {
  const intro = pick(INTRO, a.area, 'bi:intro')(a.area);
  const start = hashSeed(`bi:ap|${a.area}`) % APPEAL.length;
  const appeal = [0, 1, 2, 3].map(k => APPEAL[(start + k) % APPEAL.length]).join('\n');
  return `${intro}

${COMPANY_BLOCK}

${DUTIES}

【この仕事の魅力】
${appeal}

${CONDITIONS(a.area)}

※${a.area}周辺での募集です。まずはお気軽にご応募ください。`;
}

const JOBS = AREAS.map(a => ({
  title:     `【${a.area}】${pick(TITLE_CORE, a.area, 'bi:title')}`,
  location:  a.city,
  salary:    SALARY,
  jobType:   JOB_TYPE,
  employmentType: EMP_TYPE,
  description: buildDescription(a),
  tags: ['未経験歓迎', '学歴不問', 'シニア歓迎', 'フリーター歓迎', '産休・育休取得実績あり', '転勤なし', 'シフト自由', '週休2日制'],
  catchcopy: `未経験歓迎｜代表を支える秘書兼ドライバー（${a.area}）｜月給35万〜43万円・週休2日制・シフト自由・転勤なし｜シニア・フリーターも歓迎`,
  imageUrl:  IMAGE_URL,
  isPublished: true,
  publishedAt: NOW,
  targetMedia: TARGET_MEDIA,
  company: COMPANY,
}));

async function main() {
  console.log(`\n🚗 Brand ideaL 秘書兼ドライバー求人（求人ボックス）${JOBS.length}件 を登録/更新します...\n`);
  const existing = await Jobs.findAll();
  const byTitle = new Map(existing.filter(j => j.company === COMPANY).map(j => [j.title, j]));
  let added = 0, updated = 0;
  for (const job of JOBS) {
    const ex = byTitle.get(job.title);
    if (ex) {
      await Jobs.update(ex.id, job);
      console.log(`  ♻️  更新（画像・内容）: ${job.title}`);
      updated++;
    } else {
      await Jobs.create(job);
      console.log(`  ✅ 登録完了: ${job.title}`);
      added++;
    }
  }
  console.log(`\n📊 結果: 新規 ${added}件 / 更新 ${updated}件 / 合計 ${JOBS.length}件`);
  console.log('→ 掲載管理の Brand ideaL タブ →「🚀 求人ボックスに投稿する」で投稿できます。');
  console.log('※ 画像は public/images/bi-secretary-driver.jpg を保存しておいてください。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
