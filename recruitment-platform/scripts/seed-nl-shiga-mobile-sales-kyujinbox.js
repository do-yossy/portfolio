#!/usr/bin/env node
'use strict';
/**
 * 株式会社NOWLIVE（nl）／移動販売（ベビーカステラ催事）の配送・送迎ドライバー求人（求人ボックス掲載）— 滋賀県バッチ
 *
 * 【実態に即した内容】2026-09-10、ユーザーとの確認に基づく:
 * ・NLの実際の業務は「滋賀・京都のショッピングモール等を週替わりで回るベビーカステラ移動販売」であり、
 *   これまでのNL配送ドライバー求人（seed-nl-osaka-kyoto-driver-*.js）が使っていた
 *   「法人取引先を回る一般的なルート配送」という設定は実態と異なっていたため、本バッチで修正する。
 * ・配送ドライバー：拠点倉庫から各催事会場への商品材料・什器・備品の配送。
 * ・送迎ドライバー：移動販売車（キッチンカー）・販売スタッフの会場までの送迎、現場サポートも含む。
 * ・給与は「月給30万円〜、歩合・インセンティブにより上限なし」（ユーザー確認済み・2026-09-10）。
 *
 * 【エリアの重複回避】既存のNL関連バッチ（movingsales系・osaka-kyoto-driver系、いずれも大阪・京都のみ）は
 * 一件も滋賀県を使っていないことを確認済み（2026-09-10）。本バッチは滋賀県内25市町（町丁目まで指定）を
 * 新規に使用するため、既存バッチとエリア・タイトルとも重複しない。
 *
 * 職種: 配送ドライバー13件 + 送迎ドライバー12件 = 計25件。job_type はそれぞれ '配送ドライバー' '送迎ドライバー'。
 *
 * 冪等化: 自分の勤務地/タイトル（＝本バッチ25件、company='nl' かつ job_type が '配送ドライバー' or '送迎ドライバー'で
 *         本バッチのタイトルと一致するもの）のみを削除してから投入する。既存の他バッチは一切変更しない＝追加。
 *
 * 実行: node --experimental-sqlite scripts/seed-nl-shiga-mobile-sales-kyujinbox.js          // DRY-RUN確認は無し、即登録
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
const TARGET_MEDIA = ['求人ボックス'];
const EMP_TYPE     = '正社員';
const SALARY       = '月給300,000円〜（歩合・インセンティブにより上限なし）';
const IMAGE_URL    = '/images/nl-movingsales.png';

// 滋賀県内25市町（町丁目まで指定して一意化）。既存NLバッチは大阪・京都のみのため重複なし。
const AREAS = [
  { area: '大津市中央',           city: '滋賀県大津市中央',           jobType: '配送ドライバー' },
  { area: '大津市瀬田',           city: '滋賀県大津市瀬田',           jobType: '配送ドライバー' },
  { area: '大津市堅田',           city: '滋賀県大津市堅田',           jobType: '配送ドライバー' },
  { area: '草津市野路',           city: '滋賀県草津市野路',           jobType: '配送ドライバー' },
  { area: '草津市矢橋',           city: '滋賀県草津市矢橋',           jobType: '配送ドライバー' },
  { area: '守山市守山',           city: '滋賀県守山市守山',           jobType: '配送ドライバー' },
  { area: '守山市浮気町',         city: '滋賀県守山市浮気町',         jobType: '配送ドライバー' },
  { area: '栗東市綣',             city: '滋賀県栗東市綣',             jobType: '配送ドライバー' },
  { area: '栗東市小柿',           city: '滋賀県栗東市小柿',           jobType: '配送ドライバー' },
  { area: '野洲市小篠原',         city: '滋賀県野洲市小篠原',         jobType: '配送ドライバー' },
  { area: '甲賀市水口町',         city: '滋賀県甲賀市水口町',         jobType: '配送ドライバー' },
  { area: '湖南市中央',           city: '滋賀県湖南市中央',           jobType: '配送ドライバー' },
  { area: '高島市今津町',         city: '滋賀県高島市今津町',         jobType: '配送ドライバー' },
  { area: '東近江市八日市',       city: '滋賀県東近江市八日市',       jobType: '送迎ドライバー' },
  { area: '東近江市五個荘',       city: '滋賀県東近江市五個荘',       jobType: '送迎ドライバー' },
  { area: '近江八幡市多賀町',     city: '滋賀県近江八幡市多賀町',     jobType: '送迎ドライバー' },
  { area: '彦根市城町',           city: '滋賀県彦根市城町',           jobType: '送迎ドライバー' },
  { area: '長浜市朝日町',         city: '滋賀県長浜市朝日町',         jobType: '送迎ドライバー' },
  { area: '米原市顔戸',           city: '滋賀県米原市顔戸',           jobType: '送迎ドライバー' },
  { area: '愛知郡愛荘町松原',     city: '滋賀県愛知郡愛荘町松原',     jobType: '送迎ドライバー' },
  { area: '犬上郡豊郷町吉田',     city: '滋賀県犬上郡豊郷町吉田',     jobType: '送迎ドライバー' },
  { area: '犬上郡甲良町尼子',     city: '滋賀県犬上郡甲良町尼子',     jobType: '送迎ドライバー' },
  { area: '犬上郡多賀町中川原',   city: '滋賀県犬上郡多賀町中川原',   jobType: '送迎ドライバー' },
  { area: '蒲生郡日野町松尾',     city: '滋賀県蒲生郡日野町松尾',     jobType: '送迎ドライバー' },
  { area: '蒲生郡竜王町岡屋',     city: '滋賀県蒲生郡竜王町岡屋',     jobType: '送迎ドライバー' },
];

function pick(pool, area, salt) {
  return pool[hashSeed(`${salt}|${area}`) % pool.length];
}
function pickN(pool, area, salt, n) {
  const seed = hashSeed(`${salt}|${area}`);
  const len = pool.length;
  const start = seed % len;
  const step = 1 + (seed % (len - 1 || 1));
  const out = [];
  const used = new Set();
  let idx = start;
  while (out.length < Math.min(n, len)) {
    if (!used.has(idx % len)) { used.add(idx % len); out.push(pool[idx % len]); }
    idx += step;
    if (idx > start + len * len) break;
  }
  return out;
}

const COMPANY_BLOCK =
`【会社について】
株式会社NOWLIVEは、滋賀・京都のショッピングモールや商業施設を週替わりで回る、ベビーカステラの移動販売（催事販売）を展開しています。固定店舗を持たず、毎週いろいろな商業施設で営業するのが特徴で、その現場を支えているのが配送・送迎の仕事です。`;

// ── 配送ドライバー（拠点倉庫から各催事会場への商品材料・什器・備品の配送） ──
const D_TITLE = [
  '移動販売の配送ドライバー｜月給30万円〜・歩合で上限なし・未経験歓迎・正社員',
  '催事配送ドライバー（移動販売）｜月給30万円〜・インセンティブで上限なし・正社員',
  '移動販売の商品配送スタッフ｜月給30万円〜・歩合次第で青天井・未経験OK・正社員',
];
const D_INTRO = [
  a => `滋賀・京都のショッピングモールや商業施設を週替わりで回る、ベビーカステラ移動販売の配送ドライバーです。拠点倉庫から${a}周辺の催事会場へ、商品材料・什器・販売用備品を運び、開店前の搬入・設置までを担当していただきます。`,
  a => `${a}周辺を含む滋賀・京都の催事会場へ、ベビーカステラ移動販売の商品材料や什器を届ける配送ドライバーのお仕事です。毎週会場が変わるため、単調になりがちな配送業務とは違う面白さがあります。`,
  a => `${a}周辺の商業施設へ向けて、移動販売（ベビーカステラ催事）に必要な材料・什器・備品を配送していただきます。搬入・開店準備のサポートも含めた、現場を支えるポジションです。`,
];
const D_DUTIES =
`【主な業務】
・拠点倉庫から各催事会場への商品材料・什器・備品の配送
・会場での搬入・荷下ろし、開店準備の手伝い
・車両（配送車）の日常点検・管理
・繁忙期は複数会場をまたぐ搬送スケジュール調整`;
const D_APPEAL = [
  '◆ 毎週違う商業施設が勤務先になるため、単調な配送とは違う面白さがある',
  '◆ 歩合・インセンティブ制で、頑張り次第で収入に上限がない',
  '◆ 未経験・ブランクの方も歓迎、先輩が丁寧にサポート',
  '◆ 普通自動車免許（AT限定可）があればOK',
  '◆ 移動販売の現場を支える、縁の下の力持ちのポジション',
];

// ── 送迎ドライバー（移動販売車・スタッフの送迎、現場サポート含む） ──
const C_TITLE = [
  '移動販売の送迎ドライバー｜月給30万円〜・歩合で上限なし・未経験歓迎・正社員',
  '催事送迎ドライバー（移動販売）｜月給30万円〜・インセンティブで上限なし・正社員',
  'キッチンカー送迎スタッフ｜月給30万円〜・歩合次第で青天井・未経験OK・正社員',
];
const C_INTRO = [
  a => `滋賀・京都のショッピングモールや商業施設を週替わりで回る、ベビーカステラ移動販売の送迎ドライバーです。移動販売車（キッチンカー）や販売スタッフを、拠点から${a}周辺の催事会場まで送り届け、営業中は現場のサポートも行っていただきます。`,
  a => `${a}周辺を含む滋賀・京都の催事会場へ、移動販売車と販売スタッフを送迎するお仕事です。運転だけでなく、現場での接客サポートも含めた「移動販売を動かす」ポジションです。`,
  a => `${a}周辺の商業施設で開催されるベビーカステラ催事に向けて、キッチンカー・スタッフの送迎を担当していただきます。毎週違う場所で働けるので、単調になりがちなドライバー業務とは一味違います。`,
];
const C_DUTIES =
`【主な業務】
・移動販売車・販売スタッフの会場までの送迎
・車両の清掃・日常点検・管理
・会場でのベビーカステラ販売・接客のサポート（運転以外の業務もあり）
・スケジュールに合わせた運行管理`;
const C_APPEAL = [
  '◆ 運転だけでなく、現場での接客サポートも含めた「移動販売を動かす」お仕事',
  '◆ 歩合・インセンティブ制で、頑張り次第で収入に上限がない',
  '◆ 毎週違う場所で働けるので、単調になりがちなドライバー業務とは一味違う',
  '◆ 未経験・ブランクの方も歓迎、丁寧な対応ができれば経験不問',
  '◆ 普通自動車免許（AT限定可）があればOK',
];

const CONDITIONS =
`【給与】
${SALARY}
・昇給あり
・交通費支給
・車両・燃料は会社負担

【勤務時間】
早番／9:30〜18:30　遅番／11:00〜20:00（実働8時間・休憩1時間）
シフト制。基本的に土日祝を含む勤務です。
※催事会場により勤務時間が多少前後する場合があります。搬入日は8:30〜18:00頃の勤務となり、状況により残業があります。

【休日・休暇】
シフト制／月8〜10日休み
年次有給休暇（法定通り）
【希望休について】2ヶ月以上前にご相談いただければ、ライブ・旅行などプライベートの予定による希望休も柔軟に調整しています。

【応募資格】
普通自動車運転免許（AT限定可）／未経験・ブランク歓迎・学歴不問

【待遇・福利厚生】
各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／副業OK／髪色自由・ネイルOK・ピアスOK`;

function buildDescription(a, kind) {
  const INTRO = kind === 'driver' ? D_INTRO : C_INTRO;
  const DUTIES = kind === 'driver' ? D_DUTIES : C_DUTIES;
  const APPEAL_POOL = kind === 'driver' ? D_APPEAL : C_APPEAL;
  const intro = pick(INTRO, a.area, `nl:sh:${kind}:intro`)(a.area);
  const appeal = pickN(APPEAL_POOL, a.area, `nl:sh:${kind}:appeal`, 4).join('\n');

  return `${intro}

${COMPANY_BLOCK}

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
  const title = `【${a.area}】${pick(TITLE_POOL, a.area, `nl:sh:${kind}:title`)}`;
  return {
    title,
    location: a.city,
    salary: SALARY,
    jobType: a.jobType,
    employmentType: EMP_TYPE,
    description: buildDescription(a, kind),
    tags: ['未経験歓迎', '正社員', '普通免許OK', 'ブランクOK', '移動販売', '滋賀', '京都', '歩合'],
    catchcopy: `未経験歓迎｜移動販売の${a.jobType}（${a.area}）｜月給30万円〜・歩合で上限なし｜普通免許OK・髪色ネイル自由`,
    imageUrl: IMAGE_URL,
    isPublished: true,
    publishedAt: NOW,
    targetMedia: TARGET_MEDIA,
    company: COMPANY,
  };
});

async function main() {
  console.log(`\n🚚 NOWLIVE 移動販売の配送・送迎ドライバー求人（求人ボックス・滋賀県）${JOBS.length}件 を登録します...\n`);

  const myTitles = new Set(JOBS.map(j => j.title));
  const existing = await Jobs.findAll();

  let removed = 0;
  for (const j of existing) {
    if (j.company === COMPANY && myTitles.has(j.title)) {
      await Jobs.delete(j.id);
      removed++;
    }
  }
  if (removed) console.log(`  🧹 既存の同一バッチ ${removed}件 を削除（冪等・入れ直し）\n`);

  let added = 0;
  for (const job of JOBS) {
    await Jobs.create(job);
    console.log(`  ✅ 登録完了 [${job.jobType}]: ${job.title}`);
    added++;
  }
  console.log(`\n📊 結果: 新規 ${added}件 / 合計 ${JOBS.length}件（削除 ${removed}件）`);
  console.log('→ 掲載管理の NOWLIVE タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
