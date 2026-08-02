#!/usr/bin/env node
'use strict';
/**
 * Brand ideaL合同会社（bi）／東京都の配送ドライバー（一般）求人（求人ボックス掲載）
 * ── 新seed：既存BIの「秘書兼ドライバー」とは別の、一般の配送／ルートドライバー職。
 *
 * 既存BI seed（秘書兼ドライバー）は東京都の区・市を市区レベルで約50エリア使用済み：
 *  - seed-bi-secretary-driver-kyujinbox.js（base）
 *  - seed-bi-secretary-driver-restock-kyujinbox.js（restock）
 *  - seed-bi-secretary-driver-restock2-kyujinbox.js（restock2）
 *   → 23区すべて（千代田〜江戸川）＋多摩26市＋瑞穂町が市区町レベルで使用済み。
 * そこで本seedは重複を避けるため、勤務地を「区＋町名＋丁目」まで一意化した
 * 実在の東京都エリア25件で構成する（location文字列が既存の市区レベルと一切被らない）。
 *
 * 実行: node --experimental-sqlite scripts/seed-bi-tokyo-driver-kyujinbox.js
 *
 * 冪等: 今回の25勤務地（company='bi'／配送ドライバー）のみ削除してから投入する。
 *       （他バッチ・秘書兼ドライバー・他エリアの求人は削除しない＝追加）
 *   ※ findAll() は snake_case の行を返すため、冪等フィルタは j.job_type を使う
 *      （j.jobType は undefined になるので使わないこと）。
 *
 * ※ 給与は東京相場の月給30〜42万円。掲載画像は public/images/haisou-fleet.jpg を使用。
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
const JOB_TYPE     = '配送ドライバー';
const EMP_TYPE     = '正社員';
const SALARY       = '月給300,000円〜420,000円（経験・能力を考慮）';
const IMAGE_URL    = '/images/haisou-fleet.jpg';

// 東京都の掲載エリア（既存BI秘書兼ドライバーseedは市区レベルで使用済みのため、
// 「区＋町名＋丁目」まで一意化した実在エリア25件。location文字列が既存と非重複）。
const AREAS = [
  { area: '千代田区丸の内',   city: '東京都千代田区丸の内一丁目' },
  { area: '中央区銀座',       city: '東京都中央区銀座四丁目' },
  { area: '港区赤坂',         city: '東京都港区赤坂二丁目' },
  { area: '新宿区西新宿',     city: '東京都新宿区西新宿一丁目' },
  { area: '渋谷区道玄坂',     city: '東京都渋谷区道玄坂一丁目' },
  { area: '品川区大崎',       city: '東京都品川区大崎一丁目' },
  { area: '江東区豊洲',       city: '東京都江東区豊洲二丁目' },
  { area: '世田谷区三軒茶屋', city: '東京都世田谷区三軒茶屋一丁目' },
  { area: '文京区本郷',       city: '東京都文京区本郷三丁目' },
  { area: '台東区上野',       city: '東京都台東区上野四丁目' },
  { area: '墨田区錦糸',       city: '東京都墨田区錦糸三丁目' },
  { area: '江戸川区船堀',     city: '東京都江戸川区船堀一丁目' },
  { area: '荒川区西日暮里',   city: '東京都荒川区西日暮里五丁目' },
  { area: '足立区千住',       city: '東京都足立区千住一丁目' },
  { area: '葛飾区亀有',       city: '東京都葛飾区亀有三丁目' },
  { area: '北区赤羽',         city: '東京都北区赤羽一丁目' },
  { area: '板橋区高島平',     city: '東京都板橋区高島平二丁目' },
  { area: '練馬区豊玉北',     city: '東京都練馬区豊玉北六丁目' },
  { area: '中野区中野',       city: '東京都中野区中野五丁目' },
  { area: '杉並区阿佐谷南',   city: '東京都杉並区阿佐谷南一丁目' },
  { area: '豊島区南池袋',     city: '東京都豊島区南池袋一丁目' },
  { area: '大田区蒲田',       city: '東京都大田区蒲田五丁目' },
  { area: '目黒区自由が丘',   city: '東京都目黒区自由が丘一丁目' },
  { area: '武蔵野市吉祥寺本町', city: '東京都武蔵野市吉祥寺本町一丁目' },
  { area: '立川市曙町',       city: '東京都立川市曙町二丁目' },
];

function pick(pool, area, salt) {
  return pool[hashSeed(`${salt}|${area}`) % pool.length];
}

const INTRO = [
  a => `${a}を拠点に、担当エリアへ商品をお届けする配送ドライバーのお仕事です。`,
  a => `${a}エリアで、決まったルートを回る配送（ルート配送）ドライバーを募集します。`,
  a => `${a}周辺で、社用車を使って荷物をお届けする配送ドライバー（未経験歓迎）です。`,
];
const TITLE_CORE = [
  '配送ドライバー｜固定ルート中心｜未経験歓迎｜月給30万円〜42万円｜普通免許OK',
  'ルート配送ドライバー募集｜日勤メイン・残業少なめ｜未経験・シニア・フリーター歓迎｜週休2日',
  '配送ドライバー｜東京都内の担当エリア配送｜転勤なし・シフト自由｜月給30万〜42万円',
];
const APPEAL = [
  '◆ 固定ルート中心で、道を覚えれば安心して働ける',
  '◆ 日勤メイン・残業少なめでプライベートと両立しやすい',
  '◆ 未経験・シニア・フリーターの方も歓迎',
  '◆ 週休2日制・シフト自由・転勤なしで働きやすい',
  '◆ 普通自動車免許（AT限定可）があればOK・特別な経験は不要',
  '◆ 社会保険完備・交通費支給で長く働ける環境',
];

const COMPANY_BLOCK =
`【会社について】
Brand ideaL合同会社は「日本再生を企業から」を理念に、ブランドコンサルティング・マーケティング支援・商品プロデュース・物流サポートなど幅広い事業を展開しています。事業拡大に伴い、東京都内で商品を担当エリアにお届けする配送ドライバーを募集します。物流を支える、なくてはならないポジションです。`;

const DUTIES =
`【お任せするお仕事】
・社用車での商品の配送（担当エリアの固定ルートが中心）
・積み込み・積み下ろし、荷物の仕分け
・配送先での簡単な受け渡し・伝票確認
・配送前後の車両点検
・その他付随する業務
※普通自動車免許（AT限定可）があればOK。ルートや積み方は先輩が同乗して丁寧にお教えします。未経験の方も安心してスタートできます。`;

const CONDITIONS = (area) =>
`【給与】
月給300,000円〜420,000円（経験・能力・前職給与を考慮して決定します）
・昇給あり（年1回）
・賞与あり（業績に応じて支給）
・各種手当あり
・試用期間3ヶ月（期間中も給与・待遇に変更はありません）

【勤務時間】
8:00〜17:00（実働8時間・休憩あり）
※日勤メイン・残業少なめ

【休日・休暇】
・週休2日制（シフト自由）
・年間休日110日以上
・有給休暇（取得しやすい環境です）
・夏季休暇／年末年始休暇／慶弔休暇
・産前産後休暇・育児休暇／特別休暇

【待遇・福利厚生】
雇用形態：正社員（雇用期間の定めなし）
・各種社会保険完備（健康保険・厚生年金・雇用保険・労災保険）
・交通費支給（規定内）／車通勤・バイク通勤OK
・社用車・ガソリン代は会社負担（自己負担なし）
・研修制度あり（未経験の方も先輩が同乗して丁寧にサポート）
・転勤なし
・幅広い世代が活躍中、長く働ける環境

【応募資格】
・普通自動車運転免許（AT限定可）
未経験歓迎／学歴不問／シニア・フリーター歓迎／ブランクOK

【勤務地】
${area}周辺（東京都内）`;

function buildDescription(a) {
  const intro = pick(INTRO, a.area, 'bi-drv:intro')(a.area);
  const start = hashSeed(`bi-drv:ap|${a.area}`) % APPEAL.length;
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
  title:     `【${a.area}】${pick(TITLE_CORE, a.area, 'bi-drv:title')}`,
  location:  a.city,
  salary:    SALARY,
  jobType:   JOB_TYPE,
  employmentType: EMP_TYPE,
  description: buildDescription(a),
  tags: ['未経験歓迎', '学歴不問', 'シニア歓迎', 'フリーター歓迎', 'AT限定OK', '固定ルート', '日勤メイン', '転勤なし', 'シフト自由', '週休2日制'],
  catchcopy: `未経験歓迎｜東京都内の配送ドライバー（${a.area}）｜月給30万〜42万円・固定ルート中心・日勤メイン・週休2日制・転勤なし｜シニア・フリーターも歓迎`,
  imageUrl:  IMAGE_URL,
  isPublished: true,
  publishedAt: NOW,
  targetMedia: TARGET_MEDIA,
  company: COMPANY,
}));

async function main() {
  console.log(`\n🚚 Brand ideaL 配送ドライバー求人（東京都・求人ボックス）${JOBS.length}件 を投入します...\n`);

  // 冪等化: 今回の25勤務地（company='bi'／配送ドライバー）のみ削除してから作り直す。
  // findAll() は snake_case 行を返すため、フィルタは j.job_type を使う（j.jobType は undefined）。
  const targetLocations = new Set(AREAS.map(a => a.city));
  const existing = await Jobs.findAll();
  const toDelete = existing.filter(j =>
    j.company === COMPANY &&
    j.job_type === JOB_TYPE &&
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
  console.log('※ 画像は public/images/haisou-fleet.jpg を使用します。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
