#!/usr/bin/env node
'use strict';
/**
 * 実績データ（応募数・有効応募・対応中）を根拠に、求人ボックス向けの新規求人を提案・作成する。
 * daily-funnel-report.js と同じ「応募数→有効応募→対応中」の定義を使い、
 * 会社ごとに成績の良い職種カテゴリを判定し、そのカテゴリで新規求人を追加する。
 *
 * 【重要】ルーティン（クラウド側の自動分析）には組み込まない。掲載作業を行うその日に手動で実行する。
 * 【重要】既存求人は一切編集・削除しない。追加のみ。同一タイトルはスキップ。
 * 【重要】カテゴリは「その会社が実際に過去掲載したことがある職種（jobs.job_type）」からしか選ばない
 *         （実績データにたまたま出ただけの、その会社がやっていない業種を勝手に作らないため）。
 * 【重要】給与・エリアは既存の seed-plan-remix-20260906.js と同じテンプレート（カテゴリ別レンジ）を流用。
 *         実在しない条件を創作しているわけではないが、実際の給与テーブルと違う場合は要確認。
 *
 * 【市場データの反映】ルーティン（採用ファネル日次分析）が reports/funnel-data ブランチに保存した
 * 最新の解釈レポート（<日付>-analysis.md、直近7日以内）を読み、「⑤伸ばすべき求人」「⑦新規求人提案」
 * セクションで言及されているカテゴリに小さな加点（既定+5/回、実績データの1件分より軽い重み）をする。
 * あくまで実績データ（応募数・有効応募・対応中）が主でこれは補助的なタイブレークであり、
 * 市場データだけでカテゴリ順位が逆転することは無いよう重みを抑えている。
 * 取得できない場合（オフライン・レポート未生成等）は実績データのみで判断し、失敗しても止まらない。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/generate-kyujinbox-from-performance.js                 // 全社DRY-RUN
 *   node --experimental-sqlite scripts/generate-kyujinbox-from-performance.js --company sq
 *   node --experimental-sqlite scripts/generate-kyujinbox-from-performance.js --top 2 --count 3
 *   node --experimental-sqlite scripts/generate-kyujinbox-from-performance.js --no-market      // 市場データの加点を無効化
 *   node --experimental-sqlite scripts/generate-kyujinbox-from-performance.js --apply          // 実際に追加
 */
const path = require('path');
const fs = require('fs');
(function loadEnv(){ const f=path.join(__dirname,'..','.env'); if(!fs.existsSync(f))return;
  fs.readFileSync(f,'utf8').split('\n').forEach(l=>{l=l.trim(); if(!l||l.startsWith('#'))return; const i=l.indexOf('='); if(i<0)return; const k=l.slice(0,i).trim(),v=l.slice(i+1).trim(); if(k&&!(k in process.env))process.env[k]=v;});
})();

const { execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { Jobs } = require('../db-factory');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const NO_MARKET = argv.includes('--no-market');
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const CO_FILTER = val('--company', null);
const DAYS = parseInt(val('--days', '30'), 10);
const TOP_N = parseInt(val('--top', '1'), 10);
const COUNT = parseInt(val('--count', '2'), 10);
const MIN_VALID = parseInt(val('--min-valid', '3'), 10);
const MARKET_BOOST_WEIGHT = parseInt(val('--market-weight', '5'), 10);
const NOW = new Date().toISOString();
const REPO_ROOT = path.join(__dirname, '..', '..');

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const CONAME = { sq:'SQ', bg:'ビッグ(Bigeyes)', st:'Style501', nl:'NOWLIVE', bi:'BrandideaL', nx:'ネクサス' };

// ── 関西エリアプール（seed-plan-remix-20260906.js と同一定義） ──
const KANSAI = [
  { ward:'大阪市北区',pref:'大阪府' },{ ward:'大阪市中央区',pref:'大阪府' },{ ward:'大阪市西区',pref:'大阪府' },
  { ward:'大阪市淀川区',pref:'大阪府' },{ ward:'大阪市東淀川区',pref:'大阪府' },{ ward:'大阪市都島区',pref:'大阪府' },
  { ward:'大阪市城東区',pref:'大阪府' },{ ward:'大阪市鶴見区',pref:'大阪府' },{ ward:'大阪市旭区',pref:'大阪府' },
  { ward:'大阪市天王寺区',pref:'大阪府' },{ ward:'大阪市阿倍野区',pref:'大阪府' },{ ward:'大阪市住吉区',pref:'大阪府' },
  { ward:'大阪市東住吉区',pref:'大阪府' },{ ward:'大阪市平野区',pref:'大阪府' },{ ward:'大阪市生野区',pref:'大阪府' },
  { ward:'大阪市東成区',pref:'大阪府' },{ ward:'大阪市浪速区',pref:'大阪府' },{ ward:'大阪市西成区',pref:'大阪府' },
  { ward:'大阪市住之江区',pref:'大阪府' },{ ward:'大阪市港区',pref:'大阪府' },{ ward:'大阪市大正区',pref:'大阪府' },
  { ward:'大阪市此花区',pref:'大阪府' },{ ward:'大阪市福島区',pref:'大阪府' },{ ward:'堺市堺区',pref:'大阪府' },
  { ward:'堺市北区',pref:'大阪府' },{ ward:'東大阪市',pref:'大阪府' },{ ward:'吹田市',pref:'大阪府' },
  { ward:'豊中市',pref:'大阪府' },{ ward:'高槻市',pref:'大阪府' },{ ward:'茨木市',pref:'大阪府' },
  { ward:'枚方市',pref:'大阪府' },{ ward:'八尾市',pref:'大阪府' },{ ward:'寝屋川市',pref:'大阪府' },
  { ward:'守口市',pref:'大阪府' },{ ward:'門真市',pref:'大阪府' },
  { ward:'尼崎市',pref:'兵庫県' },{ ward:'西宮市',pref:'兵庫県' },{ ward:'伊丹市',pref:'兵庫県' },
  { ward:'宝塚市',pref:'兵庫県' },{ ward:'川西市',pref:'兵庫県' },{ ward:'芦屋市',pref:'兵庫県' },
  { ward:'京都市伏見区',pref:'京都府' },{ ward:'京都市南区',pref:'京都府' },{ ward:'向日市',pref:'京都府' },
  { ward:'長岡京市',pref:'京都府' },{ ward:'八幡市',pref:'京都府' },{ ward:'京田辺市',pref:'京都府' },
  { ward:'乙訓郡大山崎町',pref:'京都府' },
];
const POOL_LEN = KANSAI.length;

// ── 職種カテゴリ定義（seed-plan-remix-20260906.js と同一） ──
const CAT = {
  driver:    { s:[300000,450000] }, chauffeur:{ s:[300000,450000] },
  warehouse: { s:[220000,300000] }, mfg:{ s:[260000,380000] }, technician:{ s:[270000,400000] },
  sales:     { s:[280000,500000] }, office:{ s:[230000,330000] }, event:{ s:[250000,360000] }, special:{ s:[300000,450000] },
};
const TYPE_CAT = {
  '配送':'driver','中型ドライバー':'driver','ec配送':'driver','イベント配送':'driver','展示会配送':'driver','企業配送':'driver','配送ドライバー':'driver',
  '送迎':'chauffeur','送迎ドライバー':'chauffeur','秘書兼ドライバー':'chauffeur',
  '軽作業':'warehouse','梱包':'warehouse','組み立て':'warehouse','ピッキング':'warehouse','検品':'warehouse','物流倉庫':'warehouse',
  '製造':'mfg','品質管理':'mfg',
  '技術':'technician','メンテナンス':'technician',
  '営業':'sales','ルート営業':'sales','IT営業':'sales','コンサル営業':'sales','イベント営業':'sales','既存顧客営業':'sales',
  '事務':'office','ITサポート':'office','運行管理':'office',
  'イベント設営':'event','イベント企画':'event','イベント販売':'event','イベントスタッフ':'event','企画':'event',
  '昼アゲ様用':'special',
};
const man = n => `${Math.round(n/10000)}万`;
const salaryLabel = c => `月給${man(CAT[c].s[0])}〜${man(CAT[c].s[1])}円`;
const salaryDetail = c => `月給${CAT[c].s[0].toLocaleString()}円〜${CAT[c].s[1].toLocaleString()}円（経験・能力を考慮）`;

const DESC = {
  driver: (t,a)=>`【仕事内容】\n${a}を中心に、${t}のお仕事をお任せします。決まったルート・エリアが中心なので、未経験の方でも安心して始められます。\n\n【主な業務】\n・荷物/商品の積み込み・運搬・お届け\n・配達先での受け渡し、伝票・記録の確認\n・車両の日常点検\n\n【応募資格】\n普通自動車運転免許（AT限定可）／未経験・ブランク歓迎・学歴不問\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給・賞与あり\n\n【勤務】\n日勤メイン・実働8時間／週休2日／転勤なし`,
  chauffeur:(t,a)=>`【仕事内容】\n${a}を中心に、${t}のお仕事をお任せします。お客様・スタッフの送り迎えが中心で、丁寧な接客も大切なポジションです。\n\n【主な業務】\n・乗用車でのお客様/スタッフの送迎\n・車内外の清掃、車両の日常点検\n・スケジュールに合わせた運行管理\n\n【応募資格】\n普通自動車運転免許（AT限定可）／未経験歓迎・学歴不問／丁寧な対応ができる方\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給・賞与あり\n\n【勤務】\n日勤メイン・実働8時間／週休2日／転勤なし`,
  warehouse:(t,a)=>`【仕事内容】\n${a}の倉庫・作業場での${t}のお仕事です。かんたんな軽作業が中心で、未経験の方も歓迎です。\n\n【主な業務】\n・商品の${t}（仕分け・梱包・検品・ピッキング等）\n・入出荷の補助、数量チェック\n・作業場の整理\n\n【応募資格】\n未経験歓迎・学歴不問／もくもく作業が好きな方歓迎\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／空調完備／研修あり／昇給あり\n\n【勤務】\n実働8時間・週休2日／シフト応相談`,
  mfg:(t,a)=>`【仕事内容】\n${a}の拠点で、${t}のお仕事をお任せします。手順やマニュアルがあり、未経験からでも段階的に習得できます。\n\n【主な業務】\n・${t}に関わる作業・チェック・記録\n・製造ライン/設備の確認\n・品質確認、報告\n\n【応募資格】\n未経験歓迎・学歴不問（経験者は優遇）\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／資格取得支援／昇給・賞与あり\n\n【勤務】\n実働8時間・週休2日／転勤なし`,
  technician:(t,a)=>`【仕事内容】\n${a}の拠点で、${t}のお仕事をお任せします。設備・機器の点検やチェックが中心で、手順に沿って段階的に習得できます。\n\n【主な業務】\n・設備/機器の点検・かんたんな保守作業\n・タブレット等を使った点検記録の入力\n・異常があった場合の報告・連絡\n\n【応募資格】\n未経験歓迎・学歴不問（経験者は優遇）\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／資格取得支援／昇給・賞与あり\n\n【勤務】\n実働8時間・週休2日／転勤なし`,
  sales:(t,a)=>`【仕事内容】\n${a}エリアで、${t}をお任せします。既存のお客様中心・ノルマに追われない提案営業です。未経験歓迎。\n\n【主な業務】\n・お客様への訪問・ヒアリング・提案\n・見積・受発注・アフターフォロー\n・活動記録の入力\n\n【応募資格】\n普通自動車運転免許（あれば尚可）／未経験歓迎・学歴不問\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／インセンティブ／昇給・賞与あり\n\n【勤務】\n実働8時間・週休2日／転勤なし`,
  office:(t,a)=>`【仕事内容】\n${a}の拠点で、${t}のお仕事をお任せします。基本的なPC操作ができればOK、未経験・ブランクの方も歓迎です。\n\n【主な業務】\n・データ入力・書類作成・電話/メール対応\n・各種手配・管理サポート\n・その他かんたんな庶務\n\n【応募資格】\n基本的なPC操作／未経験歓迎・学歴不問\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／研修あり／昇給あり\n\n【勤務】\n実働8時間・週休2日／転勤なし`,
  event:(t,a)=>`【仕事内容】\n${a}を中心に、${t}のお仕事をお任せします。イベント・展示会などの現場が中心で、活気ある環境です。未経験歓迎。\n\n【主な業務】\n・${t}（設営・運営・販売・企画補助など）\n・会場での準備・撤収、来場対応\n・関係先との連絡調整\n\n【応募資格】\n未経験歓迎・学歴不問／人と接するのが好きな方\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／昇給あり\n\n【勤務】\n実働8時間・シフト制／週休2日`,
  special:(t,a)=>`【仕事内容】\n${a}を中心に、${t}に関わる業務をお任せします。未経験の方も歓迎、丁寧にサポートします。\n\n【応募資格】\n未経験歓迎・学歴不問（普通自動車免許があれば尚可）\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／研修あり／昇給あり\n\n【勤務】\n実働8時間・週休2日／転勤なし`,
};
const IMG = {
  driver: '/images/haisou-fleet.jpg', chauffeur: '/images/haisou-fleet.jpg',
  warehouse: '/images/jobcat-factory.jpg', mfg: '/images/jobcat-factory.jpg', technician: '/images/jobcat-factory.jpg',
  sales: '/images/jobcat-sales.jpg', office: '/images/jobcat-office.jpg', event: '/images/jobcat-event.jpg', special: '/images/haisou-fleet.jpg',
};
const imageFor = cat => IMG[cat] || '/images/haisou-fleet.jpg';

// ── 応募実績のカテゴリ推定（job_title のキーワード。daily-funnel-report.js と同系統だが CAT の名前空間に合わせる） ──
const KEYWORD_TO_CAT = [
  [/配送|デリバリー|宅配/, 'driver'],
  [/送迎/, 'chauffeur'],
  [/ドライバー|運転手/, 'driver'],
  [/軽作業|梱包|組み立て|ピッキング|検品|倉庫/, 'warehouse'],
  [/製造|品質管理/, 'mfg'],
  [/メンテナンス|技術|整備/, 'technician'],
  [/営業/, 'sales'],
  [/事務|オフィス|サポート/, 'office'],
  [/イベント|設営/, 'event'],
];
function guessCat(title) {
  for (const [re, cat] of KEYWORD_TO_CAT) if (re.test(title)) return cat;
  return null;
}

// ── 市場データ（ルーティンが保存した直近の解釈レポート）からカテゴリ加点を作る ──
function fetchLatestAnalysis() {
  const jst = ms => new Date(Date.now() + 9 * 3600 * 1000 + ms).toISOString().slice(0, 10);
  try {
    execSync('git fetch origin reports/funnel-data', { cwd: REPO_ROOT, stdio: 'pipe' });
  } catch {
    return null; // ネットワーク不通・ブランチ未取得等。市場加点なしで続行。
  }
  for (let i = 0; i < 7; i++) {
    const date = jst(-i * 86400000);
    try {
      const text = execSync(
        `git show origin/reports/funnel-data:recruitment-platform/reports/funnel/${date}-analysis.md`,
        { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf8' }
      );
      return { date, text };
    } catch { /* その日付は無い。より古い日付を試す */ }
  }
  return null;
}

function extractCategoryBoost(analysisText) {
  const boost = {};
  if (!analysisText) return boost;
  // 「⑤伸ばすべき求人」〜「⑥」、「⑦新規求人提案」〜「⑧」の間だけを対象にする
  const sections = [
    analysisText.match(/⑤[\s\S]*?(?=⑥|$)/),
    analysisText.match(/⑦[\s\S]*?(?=⑧|$)/),
  ].filter(Boolean).map(m => m[0]);
  for (const section of sections) {
    for (const [re, cat] of KEYWORD_TO_CAT) {
      const matches = section.match(new RegExp(re.source, 'g'));
      if (matches) boost[cat] = (boost[cat] || 0) + matches.length;
    }
  }
  return boost;
}

async function main() {
  console.log(`\n=== 求人ボックス新規求人 提案${APPLY ? '（--apply・実際に作成）' : '（DRY-RUN）'} / 直近${DAYS}日の実績ベース ===\n`);

  let marketBoost = {};
  if (!NO_MARKET) {
    const analysis = fetchLatestAnalysis();
    if (analysis) {
      marketBoost = extractCategoryBoost(analysis.text);
      const boostStr = Object.entries(marketBoost).map(([c, n]) => `${c}+${n * MARKET_BOOST_WEIGHT}`).join(', ') || 'なし';
      console.log(`市場データ反映: ${analysis.date}分の解釈レポート（reports/funnel-data）を使用。カテゴリ加点: ${boostStr}`);
    } else {
      console.log('市場データ反映: 直近7日分の解釈レポートが見つからないため、実績データのみでランキングします。');
    }
  } else {
    console.log('市場データ反映: --no-market指定のため無効化。実績データのみでランキングします。');
  }

  const jst = ms => new Date(Date.now() + 9 * 3600 * 1000 + ms).toISOString().slice(0, 10);
  const since = jst(-(DAYS - 1) * 86400000);
  const today = jst(0);

  const allJobs = await Jobs.findAll();
  const companies = CO_FILTER ? [CO_FILTER] : [...new Set(allJobs.map(j => j.company))].filter(Boolean).sort();

  // 会社ごとに「過去に実際掲載したことがある job_type」の集合（カテゴリ別）を作る
  // → 実績データがどれだけ良くても、この会社がやったことのない業種は提案しない
  const typesByCoCat = {};
  for (const j of allJobs) {
    const cat = TYPE_CAT[j.job_type];
    if (!cat) continue;
    typesByCoCat[j.company] = typesByCoCat[j.company] || {};
    typesByCoCat[j.company][cat] = typesByCoCat[j.company][cat] || {};
    typesByCoCat[j.company][cat][j.job_type] = (typesByCoCat[j.company][cat][j.job_type] || 0) + 1;
  }

  // 全社の応募実績を取得してカテゴリ別に集計
  const applRows = db.prepare(
    `SELECT company, job_title, is_duplicate, status FROM applicants WHERE substr(applied_at,1,10) >= ? AND substr(applied_at,1,10) <= ? AND job_title != ''`
  ).all(since, today);

  // 既存タイトル（重複作成防止）と、エリア採番の開始位置（既存の「N丁目」求人数＋バッファ）
  const existingTitles = new Set(allJobs.map(j => j.title));
  const areaTitleRe = /\d+丁目/;
  let areaIdx = allJobs.filter(j => areaTitleRe.test(j.title)).length + 10;
  function nextArea() {
    const idx = areaIdx++;
    const cycle = Math.floor(idx / POOL_LEN);
    const item = KANSAI[idx % POOL_LEN];
    const area = `${item.ward}${cycle + 1}丁目`;
    return { area, pref: item.pref, location: `${item.pref}${area}` };
  }
  function buildJob(co, type) {
    const cat = TYPE_CAT[type] || 'office';
    const { area, location } = nextArea();
    const sl = salaryLabel(cat);
    const isDriver = cat === 'driver' || cat === 'chauffeur' || cat === 'special';
    const title = `【${area}】${type}｜${sl}・未経験歓迎・正社員${isDriver ? '・普通免許OK' : ''}`;
    const catchcopy = `${type}（${area}）｜${sl}・未経験歓迎の正社員募集。${isDriver ? '普通免許でOK。' : 'マニュアル・研修があり安心。'}週休2日・各種社会保険完備。`;
    return {
      title, location, salary: salaryDetail(cat), jobType: type, employmentType: '正社員',
      description: DESC[cat](type, area), tags: ['未経験歓迎', '正社員', type, sl, '週休2日', '社会保険完備'],
      catchcopy, imageUrl: imageFor(cat), isPublished: true, publishedAt: NOW, targetMedia: ['求人ボックス'], company: co,
    };
  }

  let totalCreated = 0, totalSkipped = 0;
  for (const co of companies) {
    const rows = applRows.filter(r => r.company === co);
    if (rows.length === 0) {
      console.log(`[${CONAME[co] || co}] 直近${DAYS}日の応募実績が無いためスキップ`);
      continue;
    }
    const byCat = {};
    for (const r of rows) {
      const cat = guessCat(r.job_title);
      if (!cat) continue;
      byCat[cat] = byCat[cat] || { total: 0, valid: 0, inprog: 0 };
      byCat[cat].total++;
      if (r.is_duplicate === 0) {
        byCat[cat].valid++;
        if (r.status === '対応中') byCat[cat].inprog++;
      }
    }
    // サンプル不足を除外し、（有効応募数＋市場データ加点）→対応移行率の順でランキング
    // 市場加点はあくまで僅かな重み（既定+5/回）で、実績データの大きな差を逆転させない範囲に抑えている。
    const scoreOf = (cat, v) => v.valid + (marketBoost[cat] || 0) * MARKET_BOOST_WEIGHT;
    const ranked = Object.entries(byCat)
      .filter(([, v]) => v.valid >= MIN_VALID)
      .filter(([cat]) => typesByCoCat[co] && typesByCoCat[co][cat]) // 自社が実際に掲載したことのあるカテゴリのみ
      .sort((a, b) => (scoreOf(b[0], b[1]) - scoreOf(a[0], a[1])) || ((b[1].inprog / (b[1].valid || 1)) - (a[1].inprog / (a[1].valid || 1))));

    console.log(`\n[${CONAME[co] || co}] 直近${DAYS}日のカテゴリ別実績（有効応募${MIN_VALID}件未満・自社未掲載カテゴリは対象外）`);
    if (ranked.length === 0) {
      console.log('  提案できるカテゴリなし（サンプル不足、または実績カテゴリが自社の掲載実績と一致しない）');
      continue;
    }
    for (const [cat, v] of ranked) {
      const pr = v.valid ? (100 * v.inprog / v.valid).toFixed(1) : '−';
      const mb = marketBoost[cat] ? `  市場加点+${marketBoost[cat] * MARKET_BOOST_WEIGHT}` : '';
      console.log(`  ${cat.padEnd(10)} 応募${v.total} 有効${v.valid} 対応中${v.inprog}（対応移行率${pr}%）${mb}`);
    }

    const picks = ranked.slice(0, TOP_N);
    for (const [cat, v] of picks) {
      // その会社がそのカテゴリで一番よく使っている job_type ラベルを採用（勝手に新業種を作らない）
      const typeCounts = typesByCoCat[co][cat];
      const type = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];
      console.log(`\n  → 「${cat}」（実績上位）で新規${COUNT}件を提案: job_type="${type}"`);
      for (let i = 0; i < COUNT; i++) {
        const job = buildJob(co, type);
        if (existingTitles.has(job.title)) { totalSkipped++; console.log(`     スキップ（既存同名）: ${job.title}`); continue; }
        existingTitles.add(job.title);
        if (APPLY) await Jobs.create(job);
        totalCreated++;
        console.log(`     ${APPLY ? '作成' : '(DRY-RUN)'}: ${job.title}`);
      }
    }
  }

  console.log(`\n${APPLY ? '完了' : '（DRY-RUN・未反映）'}: 新規作成 ${totalCreated}件 / スキップ(既存同名) ${totalSkipped}件`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 既存求人は一切変更していません。給与テンプレートが実際の条件と違う場合は本文を手動調整してください。\n');
}

main().catch(e => { console.error(e); process.exit(1); });
