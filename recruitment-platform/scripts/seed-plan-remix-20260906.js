#!/usr/bin/env node
'use strict';
/**
 * 掲載プラン一括生成（2026-09-06版・求人ボックス専用・関西エリア統一）
 * seed-plan-remix-20260902.js を踏襲。会社×職種の構成（ミックス）は同一のまま、
 * エリアを「大阪＋大阪寄りの兵庫・京都」に統一（bi も東京プールから関西プールへ変更）。
 *  - target_media = ['求人ボックス'] 固定。職種カテゴリごとに画像(imageUrl)を自動割当。
 *  - 【重要】現在掲載中の求人は一切編集・削除しない。追加のみ（既存はそのまま）。
 *  - 全社共通の単一エリアカウンタを使用（タイトルに会社名が入らないため、会社間でエリアが重複しないよう統一管理）。
 *  - 開始インデックスをプール3周分（サフィックス4丁目〜）にオフセットし、9/2バッチ（大阪35件プール・0〜2周目）
 *    および東京プール(bi旧版)と丁目サフィックスが被らないようにして重複を防止。
 *
 * 実行: node --experimental-sqlite scripts/seed-plan-remix-20260906.js          （DRY-RUN・作成内容を表示）
 *        node --experimental-sqlite scripts/seed-plan-remix-20260906.js --apply （実際に新規追加）
 */
const path = require('path');
const fs = require('fs');
(function loadEnv(){ const f=path.join(__dirname,'..','.env'); if(!fs.existsSync(f))return;
  fs.readFileSync(f,'utf8').split('\n').forEach(l=>{l=l.trim(); if(!l||l.startsWith('#'))return; const i=l.indexOf('='); if(i<0)return; const k=l.slice(0,i).trim(),v=l.slice(i+1).trim(); if(k&&!(k in process.env))process.env[k]=v;});
})();

const { Jobs } = require('../db-factory');
const APPLY = process.argv.includes('--apply');
const NOW = new Date().toISOString();

// ── 会社名 ──
const CONAME = { sq:'SQ', bg:'ビッグ(Bigeyes)', st:'Style501', nl:'NOWLIVE', bi:'BrandideaL', nx:'ネクサス' };

// ── 関西エリアプール（大阪中心＋大阪寄りの兵庫・京都）。全社共通の単一プール／単一カウンタで重複防止 ──
const KANSAI = [
  // 大阪（35：既存0902バッチと同一の大阪ワード群）
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
  // 大阪寄りの兵庫（阪神間・6）
  { ward:'尼崎市',pref:'兵庫県' },{ ward:'西宮市',pref:'兵庫県' },{ ward:'伊丹市',pref:'兵庫県' },
  { ward:'宝塚市',pref:'兵庫県' },{ ward:'川西市',pref:'兵庫県' },{ ward:'芦屋市',pref:'兵庫県' },
  // 大阪寄りの京都（洛南・7）
  { ward:'京都市伏見区',pref:'京都府' },{ ward:'京都市南区',pref:'京都府' },{ ward:'向日市',pref:'京都府' },
  { ward:'長岡京市',pref:'京都府' },{ ward:'八幡市',pref:'京都府' },{ ward:'京田辺市',pref:'京都府' },
  { ward:'乙訓郡大山崎町',pref:'京都府' },
];
const POOL_LEN = KANSAI.length; // 48
// 9/2バッチ（大阪35件プール×3周＝105件／bi東京15件プール×2周弱＝26件）と丁目サフィックスが
// 絶対に被らないよう、3周目終了以降（サフィックス"4丁目"〜）から開始する。
let areaIdx = POOL_LEN * 3;
function nextArea(){
  const idx = areaIdx++;
  const cycle = Math.floor(idx / POOL_LEN);
  const item = KANSAI[idx % POOL_LEN];
  const area = `${item.ward}${cycle + 1}丁目`; // cycle3→"4丁目", cycle4→"5丁目", ...
  return { area, pref: item.pref, location: `${item.pref}${area}` };
}

// ── 職種カテゴリ（給与レンジは万円） ──
// 0902版の6カテゴリから、実際の仕事内容と画像が一致するよう8カテゴリに再分割。
//   driver（配送系）と chauffeur（送迎＝乗用車での送り迎え）を分離。
//   mfg（製造/品管）と technician（メンテナンス/技術）を分離。
//   warehouse（軽作業系）と sales（営業系）は office/mfg から独立の専用画像に。
const CAT = {
  driver:    { s:[300000,450000] }, chauffeur:{ s:[300000,450000] },
  warehouse: { s:[220000,300000] }, mfg:{ s:[260000,380000] }, technician:{ s:[270000,400000] },
  sales:     { s:[280000,500000] }, office:{ s:[230000,330000] }, event:{ s:[250000,360000] }, special:{ s:[300000,450000] },
};
const TYPE_CAT = {
  '配送':'driver','中型ドライバー':'driver','ec配送':'driver','イベント配送':'driver','展示会配送':'driver','企業配送':'driver',
  '送迎':'chauffeur',
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

// ── カテゴリ別 本文テンプレ（chauffeur/technicianを新規追加。他は0902版と同一） ──
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

// 職種カテゴリ → 画像。
//   「顔なし・文字なし」の条件で用意できた jobcat-sales.jpg のみ新規反映。
//   chauffeur/technician/warehouse は生成済みだが顔が写っており不採用（クレジット切れで撮り直し未了）。
//   撮り直しまでは、顔なし・文字なしを確認済みの既存アセットへ一時フォールバックする。
//   jobcat-event.jpg は元画像に架空社名の看板テキストが写り込んでいたため、画像編集でぼかして除去済み。
const IMG = {
  driver: '/images/haisou-fleet.jpg',        // 配送車両（既存・顔なし/文字なし確認済み）
  chauffeur: '/images/haisou-fleet.jpg',     // 【暫定】専用画像は顔あり不採用のため既存流用。要差し替え
  warehouse: '/images/jobcat-factory.jpg',   // 【暫定】専用画像は顔あり不採用のため既存流用。要差し替え
  mfg: '/images/jobcat-factory.jpg',         // 既存：整った工場/作業場（顔なし/文字なし確認済み）
  technician: '/images/jobcat-factory.jpg',  // 【暫定】専用画像は顔あり不採用のため既存流用。要差し替え
  sales: '/images/jobcat-sales.jpg',         // 新規生成：外回り営業・後ろ姿（顔なし/文字なし確認済み）
  office: '/images/jobcat-office.jpg',       // 既存：明るいオフィス（顔なし/文字なし確認済み）
  event: '/images/jobcat-event.jpg',         // 既存：展示会/イベント設営（看板テキストをぼかして除去済み）
  special: '/images/haisou-fleet.jpg',
};
const imageFor = cat => IMG[cat] || '/images/haisou-fleet.jpg';

function buildJob(co, type){
  const cat = TYPE_CAT[type] || 'office';
  const { area, location } = nextArea();
  const sl = salaryLabel(cat);
  const isDriver = cat==='driver' || cat==='chauffeur' || cat==='special';
  const title = `【${area}】${type}｜${sl}・未経験歓迎・正社員${isDriver?'・普通免許OK':''}`;
  const catchcopy = `${type}（${area}）｜${sl}・未経験歓迎の正社員募集。${isDriver?'普通免許でOK。':'マニュアル・研修があり安心。'}週休2日・各種社会保険完備。`;
  return {
    title, location, salary: salaryDetail(cat), jobType: type, employmentType: '正社員',
    description: DESC[cat](type, area), tags: ['未経験歓迎','正社員',type, sl,'週休2日','社会保険完備'],
    catchcopy, imageUrl: imageFor(cat), isPublished: true, publishedAt: NOW, targetMedia: null, company: co,
  };
}

// ── 掲載プラン（0902版と同一のミックス。エリアのみ関西統一プールに変更）──
const PLAN = [
  { media:'求人ボックス', co:'sq', mix:{'配送':6,'送迎':5,'中型ドライバー':6,'メンテナンス':1,'IT営業':1,'ITサポート':1,'製造':1,'品質管理':1,'軽作業':1,'梱包':1,'組み立て':1,'ピッキング':1} },
  { media:'求人ボックス', co:'bg', mix:{'配送':5,'送迎':5,'中型ドライバー':5,'メンテナンス':1,'ルート営業':1,'事務':1,'品質管理':1,'軽作業':1,'梱包':1,'組み立て':1,'ピッキング':1,'検品':1,'物流倉庫':1} },
  { media:'求人ボックス', co:'st', mix:{'送迎':5,'配送':5,'中型ドライバー':5,'技術':1,'メンテナンス':1,'ルート営業':1,'事務':1,'品質管理':1,'軽作業':1,'梱包':1,'検品':1,'ピッキング':1,'物流倉庫':1} },
  { media:'求人ボックス', co:'nl', mix:{'送迎':5,'配送':5,'中型ドライバー':5,'イベント設営':1,'イベント企画':1,'イベント販売':1,'ルート営業':1,'メンテナンス':1,'組み立て':1,'事務':1,'品質管理':1,'軽作業':1,'梱包':1} },
  { media:'求人ボックス', co:'bi', mix:{'送迎':6,'配送':6,'中型ドライバー':6,'コンサル営業':1,'企画':1,'イベント営業':1,'メンテナンス':1,'ITサポート':1,'軽作業':1,'技術':1} },
];

async function main(){
  console.log(`\n=== 掲載プラン ${APPLY?'反映(--apply)':'DRY-RUN'} / ${NOW.slice(0,10)}（関西エリア統一版） ===`);
  console.log('※ 現在掲載中の求人は編集・削除しません。新規のみ追加します（同一タイトルはスキップ）。');
  console.log(`※ エリアは大阪＋大阪寄りの兵庫・京都（全${POOL_LEN}拠点）から、開始インデックス${areaIdx}（4丁目〜）で採番し、9/2バッチと重複しません。\n`);
  const existing = await Jobs.findAll();
  const existingTitles = new Set(existing.map(j => j.title));
  let created=0, skipped=0;
  for (const p of PLAN) {
    const total = Object.values(p.mix).reduce((a,b)=>a+b,0);
    console.log(`\n[${p.media}] ${CONAME[p.co]}(${p.co})  新規追加 ${total}件`);
    for (const [type,count] of Object.entries(p.mix)) {
      let made=0;
      for (let i=0;i<count;i++){
        const job = buildJob(p.co, type); job.targetMedia = [p.media];
        if (existingTitles.has(job.title)) { skipped++; continue; }
        existingTitles.add(job.title);
        if (APPLY) await Jobs.create(job);
        created++; made++;
        if (made===1) console.log(`   ・${type} ×${count}  例: ${job.title.slice(0,50)}`);
      }
    }
  }
  console.log(`\n${APPLY?'完了':'（DRY-RUN・未反映）'}: 新規作成 ${created}件 / スキップ(既存同名) ${skipped}件`);
  if (!APPLY) console.log('→ 反映するには: node --experimental-sqlite scripts/seed-plan-remix-20260906.js --apply');
  console.log('※ 既存求人は一切変更していません。給与/本文の調整が必要ならお知らせください。\n');
}
main().catch(e=>{ console.error(e); process.exit(1); });
