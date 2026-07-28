#!/usr/bin/env node
'use strict';
/**
 * 株式会社NOWLIVE（nl）／移動販売車の送迎ドライバー 求人（求人ボックス掲載）— 補充バッチ（restock）
 * 会社理念「ワクワクする未来を選ぶ」・食品催事／イベントプロモーション／配送物流に合わせた内容。
 * 大阪の未使用エリア25か所で、内容が重複しないようエリア名でシードしたバリエーションを付与。
 *
 * ※ 既存バッチ（seed-nl-movingsales-kyujinbox.js）で使用済みのエリアとは重複させない。
 *    既に使用済み: 大阪市中央区/北区/浪速区/西区/淀川区/住之江区、東大阪市、豊中市、吹田市、堺市堺区
 *
 * 冪等化: タイトルはエリア名を含むため一意。既存の同一タイトル（＝今回の25件）のみを
 *         上書き更新し、それ以外の他バッチは一切変更しない（雛形の削除/上書き方式を踏襲）。
 *
 * 実行: node --experimental-sqlite scripts/seed-nl-movingsales-restock-kyujinbox.js
 *
 * ※ 給与は仮の相場（月給360,000〜460,000円）。実際の条件に合わせて後で調整可。
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
const SALARY       = '月給360,000円〜460,000円（経験・能力を考慮）';
const IMAGE_URL    = '/images/nl-movingsales.jpg';

// 大阪の掲載エリア（補充25か所・既存バッチと重複しない未使用エリア）
const AREAS = [
  // ── 大阪市の未使用区（18件）──
  { area: '大阪市都島区',   city: '大阪府大阪市都島区' },
  { area: '大阪市福島区',   city: '大阪府大阪市福島区' },
  { area: '大阪市此花区',   city: '大阪府大阪市此花区' },
  { area: '大阪市港区',     city: '大阪府大阪市港区' },
  { area: '大阪市大正区',   city: '大阪府大阪市大正区' },
  { area: '大阪市天王寺区', city: '大阪府大阪市天王寺区' },
  { area: '大阪市西淀川区', city: '大阪府大阪市西淀川区' },
  { area: '大阪市東淀川区', city: '大阪府大阪市東淀川区' },
  { area: '大阪市東成区',   city: '大阪府大阪市東成区' },
  { area: '大阪市生野区',   city: '大阪府大阪市生野区' },
  { area: '大阪市旭区',     city: '大阪府大阪市旭区' },
  { area: '大阪市城東区',   city: '大阪府大阪市城東区' },
  { area: '大阪市阿倍野区', city: '大阪府大阪市阿倍野区' },
  { area: '大阪市住吉区',   city: '大阪府大阪市住吉区' },
  { area: '大阪市東住吉区', city: '大阪府大阪市東住吉区' },
  { area: '大阪市西成区',   city: '大阪府大阪市西成区' },
  { area: '大阪市平野区',   city: '大阪府大阪市平野区' },
  { area: '大阪市鶴見区',   city: '大阪府大阪市鶴見区' },
  // ── 大阪府 外周市（7件）──
  { area: '高槻市',         city: '大阪府高槻市' },
  { area: '枚方市',         city: '大阪府枚方市' },
  { area: '茨木市',         city: '大阪府茨木市' },
  { area: '八尾市',         city: '大阪府八尾市' },
  { area: '守口市',         city: '大阪府守口市' },
  { area: '門真市',         city: '大阪府門真市' },
  { area: '寝屋川市',       city: '大阪府寝屋川市' },
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
  '移動販売車の送迎ドライバー｜未経験歓迎｜完全週休2日｜月給36万円〜｜普通免許OK',
  '移動販売車（キッチンカー）の送迎・回送ドライバー｜未経験歓迎｜月給36万円〜46万円',
  '催事・イベント会場への移動販売車送迎ドライバー｜完全週休2日・シフト制｜月給36万〜',
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
`【給与】
月給360,000円〜460,000円（経験・能力・前職給与を考慮して決定します）
・昇給あり（年1回）
・賞与あり（業績に応じて支給）
・各種手当あり（皆勤手当・深夜/早朝手当 など）
・試用期間3ヶ月（期間中も給与・待遇に変更はありません）
・固定残業代なし（残業が発生した場合は別途全額支給。実働8時間のシフト制で残業は少なめです）

【勤務時間】
9:00〜21:00の間で実働8時間（休憩あり）のシフト制

【休日・休暇】
・完全週休二日制（シフト制）
・年間休日110日以上
・有給休暇（入社半年後に付与／取得しやすい環境です）
・夏季休暇／年末年始休暇／慶弔休暇
・産前産後休暇・育児休暇／特別休暇
※シフト制のため平日にもお休みを取りやすく、役所・銀行の用事やお子さまの行事にも対応しやすい環境です。

【待遇・福利厚生】
雇用形態：正社員（雇用期間の定めなし）
・各種社会保険完備（健康保険・厚生年金・雇用保険・労災保険）
・交通費支給（規定内）／車通勤OK
・社用車・ガソリン代は会社負担（自己負担なし）
・制服貸与／資格取得支援制度／研修制度あり（未経験の方も先輩が丁寧にサポート）
・服装・髪型自由（清潔感のある範囲で）
・社員同士の交流イベントあり（“ワクワクする未来”を大切にする社風）

【応募資格】
普通自動車運転免許（AT限定可）
未経験歓迎／ブランクOK／学歴不問

【勤務地】
${area}周辺（大阪府内・近郊の催事／イベント会場）`;

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
  catchcopy: `未経験歓迎｜移動販売車の送迎ドライバー（${a.area}）｜月給36万〜46万円・完全週休二日制・シフト制（9〜21時内で実働8時間）｜普通免許OK・ブランク歓迎・各種社会保険完備`,
  imageUrl:  IMAGE_URL,
  isPublished: true,
  publishedAt: NOW,
  targetMedia: TARGET_MEDIA,
  company: COMPANY,
}));

async function main() {
  console.log(`\n🚚 NOWLIVE 移動販売車の送迎ドライバー求人（求人ボックス・補充）${JOBS.length}件 を登録/更新します...\n`);
  const existing = await Jobs.findAll();
  const byTitle = new Map(existing.filter(j => j.company === COMPANY).map(j => [j.title, j]));
  let added = 0, updated = 0;
  for (const job of JOBS) {
    const ex = byTitle.get(job.title);
    if (ex) {
      // 既存は画像・内容を更新（再実行で新しい画像を反映）
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
  console.log('→ 掲載管理の NOWLIVE タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
