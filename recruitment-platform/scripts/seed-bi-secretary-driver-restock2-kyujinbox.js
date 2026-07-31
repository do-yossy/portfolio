#!/usr/bin/env node
'use strict';
/**
 * Brand ideaL合同会社（bi）／秘書兼ドライバー（代表を支える）求人（求人ボックス掲載）
 * ── 補充seed その2（restock2）：既存バッチ・補充seed（restock）と重複しない
 *    東京都の新エリア25件を「追加」投入する。
 *
 * 雛形: scripts/seed-bi-secretary-driver-restock-kyujinbox.js を厳密に踏襲。
 *  - AREAS配列 ＋ hashSeed による内容バリエーション ＋ INSERT
 *  - JOB_TYPE / SALARY / IMAGE_URL / target_media / company / is_published は雛形と同一
 * ※補充seed（restock）で使用済みのエリア（文京区/台東区/墨田区/江戸川区/荒川区/足立区/
 *   葛飾区/北区/板橋区/練馬区/中野区/杉並区/豊島区/大田区/目黒区／武蔵野市/三鷹市/立川市/
 *   町田市/調布市/府中市/八王子市/西東京市/小金井市/国分寺市）とは重複させず、
 *   未使用の実在する東京の区市で25件を構成する。
 *
 * 実行: node --experimental-sqlite scripts/seed-bi-secretary-driver-restock2-kyujinbox.js
 *
 * 冪等: 今回の25勤務地（company='bi'／秘書兼ドライバー）のみ削除してから投入する。
 *       （他バッチ・補充seed・他エリアの求人は削除しない＝追加投入）
 *
 * ※ 勤務時間は9:00〜18:00（実働8時間）。応募資格に基本的なPC操作を含む。
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

// 東京都の掲載エリア（既存バッチ・補充seed（restock）と重複しない新エリア25件）
// restock使用済み: 文京/台東/墨田/江戸川/荒川/足立/葛飾/北/板橋/練馬/中野/杉並/豊島/大田/目黒
//                  ／武蔵野/三鷹/立川/町田/調布/府中/八王子/西東京/小金井/国分寺
const AREAS = [
  // ── 23区（restock未使用の区・8件）──
  { area: '千代田区', city: '東京都千代田区' },
  { area: '中央区',   city: '東京都中央区' },
  { area: '港区',     city: '東京都港区' },
  { area: '新宿区',   city: '東京都新宿区' },
  { area: '品川区',   city: '東京都品川区' },
  { area: '世田谷区', city: '東京都世田谷区' },
  { area: '渋谷区',   city: '東京都渋谷区' },
  { area: '江東区',   city: '東京都江東区' },
  // ── 多摩地域の市（未使用・16件）──
  { area: '青梅市',     city: '東京都青梅市' },
  { area: '昭島市',     city: '東京都昭島市' },
  { area: '小平市',     city: '東京都小平市' },
  { area: '日野市',     city: '東京都日野市' },
  { area: '東村山市',   city: '東京都東村山市' },
  { area: '国立市',     city: '東京都国立市' },
  { area: '福生市',     city: '東京都福生市' },
  { area: '狛江市',     city: '東京都狛江市' },
  { area: '東大和市',   city: '東京都東大和市' },
  { area: '清瀬市',     city: '東京都清瀬市' },
  { area: '東久留米市', city: '東京都東久留米市' },
  { area: '武蔵村山市', city: '東京都武蔵村山市' },
  { area: '多摩市',     city: '東京都多摩市' },
  { area: '稲城市',     city: '東京都稲城市' },
  { area: '羽村市',     city: '東京都羽村市' },
  { area: 'あきる野市', city: '東京都あきる野市' },
  // ── 多摩地域の町（未使用・1件）──
  { area: '瑞穂町',     city: '東京都西多摩郡瑞穂町' },
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
  '◆ 経営者の仕事を間近で見られ、通常では得られない経験が積める',
  '◆ 未経験・シニア・フリーターの方も歓迎',
  '◆ 週休2日制・シフト自由・転勤なしで働きやすい',
  '◆ 普通自動車免許があればOK・特別な経験は不要',
  '◆ 産休・育休の取得実績あり、長く働ける環境',
];

const COMPANY_BLOCK =
`【会社について】
Brand ideaL合同会社は「日本再生を企業から」を理念に、ブランドコンサルティング・マーケティング支援・商品プロデュース・物流サポートなど幅広い事業を展開しています。事業拡大に伴い、代表の業務をサポートする秘書兼ドライバーを募集します。代表の一番近くで会社の成長を支える、やりがいのあるポジションです。`;

const DUTIES =
`【お任せするお仕事】
・代表の送迎（社用車での運転）
・移動・スケジュールのサポート
・簡単な事務・秘書業務（書類整理・データ入力など）
・来客対応・電話対応の補助
・その他付随する業務
※普通自動車免許（AT限定可）があればOK。運転が中心で、秘書業務は先輩が丁寧にお教えします。未経験の方も安心してスタートできます。`;

const CONDITIONS = (area) =>
`【給与】
月給350,000円〜430,000円（経験・能力・前職給与を考慮して決定します）
・昇給あり（年1回）
・賞与あり（業績に応じて支給）
・各種手当あり
・試用期間3ヶ月（期間中も給与・待遇に変更はありません）

【勤務時間】
9:00〜18:00（実働8時間・休憩あり）

【休日・休暇】
・週休2日制（シフト自由）
・年間休日110日以上
・有給休暇（取得しやすい環境です）
・夏季休暇／年末年始休暇／慶弔休暇
・産前産後休暇・育児休暇（取得実績あり）／特別休暇

【待遇・福利厚生】
雇用形態：正社員（雇用期間の定めなし）
・各種社会保険完備（健康保険・厚生年金・雇用保険・労災保険）
・交通費支給（規定内）／車通勤・バイク通勤OK
・社用車・ガソリン代は会社負担（自己負担なし）
・資格取得支援制度／研修制度あり（未経験の方も先輩が丁寧にサポート）
・転勤なし
・産休・育休取得実績あり、長く働ける環境

【応募資格】
・普通自動車運転免許（AT限定可）
・基本的なPC操作（Word・Excel・メール）
未経験歓迎／学歴不問／シニア・フリーター歓迎／ブランクOK

【勤務地】
${area}周辺（東京都内）`;

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
  console.log(`\n🚗 Brand ideaL 秘書兼ドライバー求人（求人ボックス・補充seed2）${JOBS.length}件 を投入します...\n`);

  // 冪等化: 今回の25勤務地（company='bi'／秘書兼ドライバー）のみ削除してから作り直す
  const targetLocations = new Set(AREAS.map(a => a.city));
  const existing = await Jobs.findAll();
  const toDelete = existing.filter(j =>
    j.company === COMPANY &&
    (j.job_type === JOB_TYPE || j.jobType === JOB_TYPE) &&
    targetLocations.has(j.location)
  );
  let deleted = 0;
  for (const j of toDelete) {
    await Jobs.delete(j.id);
    console.log(`  🗑️  削除（今回エリア分）: ${j.title}`);
    deleted++;
  }
  if (deleted > 0) console.log(`  → 既存の今回エリア分を ${deleted}件 削除しました。\n`);

  let added = 0;
  for (const job of JOBS) {
    await Jobs.create(job);
    console.log(`  ✅ 登録完了: ${job.title}`);
    added++;
  }

  console.log(`\n📊 結果: 削除 ${deleted}件 / 新規 ${added}件 / 合計 ${JOBS.length}件`);
  console.log('→ 掲載管理の Brand ideaL タブ →「🚀 求人ボックスに投稿する」で投稿できます。');
  console.log('※ 画像は public/images/bi-secretary-driver.jpg を保存しておいてください。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
