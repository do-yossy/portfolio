#!/usr/bin/env node
'use strict';
/**
 * 掲載プラン一括生成（2026-09-02版・求人ボックス専用）
 * ユーザー指定の「会社×職種構成」に合わせて求人ボックス向け求人を新規作成する（Indeed/engageはユーザー側で作成）。
 *  - target_media = ['求人ボックス'] 固定。職種カテゴリごとに画像(imageUrl)を自動割当。
 *  - 【重要】現在掲載中の求人は一切編集・削除しない。この新構成は「今後新規に作る求人」だけに適用。
 *  - 追加のみ（既存はそのまま）。同一タイトルが既にあればスキップ＝冪等（再実行しても増殖しない）。
 *  - 給与・本文は職種カテゴリ別の妥当な既定値（※要調整。数字はタイトル/本文に明記）。
 *
 * 実行: node --experimental-sqlite scripts/seed-plan-remix-20260902.js          （DRY-RUN・作成内容を表示）
 *        node --experimental-sqlite scripts/seed-plan-remix-20260902.js --apply （実際に新規追加）
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

// ── エリアプール（会社の地域） ──
const OSAKA = ['大阪市北区','大阪市中央区','大阪市西区','大阪市淀川区','大阪市東淀川区','大阪市都島区','大阪市城東区','大阪市鶴見区',
  '大阪市旭区','大阪市天王寺区','大阪市阿倍野区','大阪市住吉区','大阪市東住吉区','大阪市平野区','大阪市生野区','大阪市東成区',
  '大阪市浪速区','大阪市西成区','大阪市住之江区','大阪市港区','大阪市大正区','大阪市此花区','大阪市福島区','堺市堺区','堺市北区',
  '東大阪市','吹田市','豊中市','高槻市','茨木市','枚方市','八尾市','寝屋川市','守口市','門真市'];
const TOKYO = ['世田谷区','目黒区','品川区','大田区','港区','渋谷区','新宿区','中野区','杉並区','豊島区','江東区','板橋区','練馬区','中央区','文京区'];
// 大阪勢(sq/bg/st/nl/nx)は共通カウンタでエリアを全社通して一意化（タイトルに会社名が入らないため衝突回避）。
// biは東京プールで分離。2周目以降は丁目を付けて必ず一意にする。
const areaIdx = { osaka: 0, tokyo: 0 };
function nextArea(co){
  const isBi = co === 'bi';
  const p = isBi ? TOKYO : OSAKA; const L = p.length;
  const key = isBi ? 'tokyo' : 'osaka';
  const idx = areaIdx[key]++; const ward = p[idx % L]; const cycle = Math.floor(idx / L);
  const area = cycle === 0 ? ward : `${ward}${cycle + 1}丁目`;
  const pref = isBi ? '東京都' : '大阪府';
  return { area, pref, location: `${pref}${area}` };
}

// ── 職種カテゴリ（給与レンジは万円） ──
const CAT = {
  driver:  { s:[300000,450000] }, warehouse:{ s:[220000,300000] }, mfg:{ s:[260000,380000] },
  sales:   { s:[280000,500000] }, office:{ s:[230000,330000] }, event:{ s:[250000,360000] }, special:{ s:[300000,450000] },
};
const TYPE_CAT = {
  '配送':'driver','送迎':'driver','中型ドライバー':'driver','ec配送':'driver','イベント配送':'driver','展示会配送':'driver','企業配送':'driver',
  '軽作業':'warehouse','梱包':'warehouse','組み立て':'warehouse','ピッキング':'warehouse','検品':'warehouse','物流倉庫':'warehouse',
  '製造':'mfg','品質管理':'mfg','技術':'mfg','メンテナンス':'mfg',
  '営業':'sales','ルート営業':'sales','IT営業':'sales','コンサル営業':'sales','イベント営業':'sales','既存顧客営業':'sales',
  '事務':'office','ITサポート':'office','運行管理':'office',
  'イベント設営':'event','イベント企画':'event','イベント販売':'event','イベントスタッフ':'event','企画':'event',
  '昼アゲ様用':'special',
};
const man = n => `${Math.round(n/10000)}万`;
const salaryLabel = c => `月給${man(CAT[c].s[0])}〜${man(CAT[c].s[1])}円`;
const salaryDetail = c => `月給${CAT[c].s[0].toLocaleString()}円〜${CAT[c].s[1].toLocaleString()}円（経験・能力を考慮）`;

// ── カテゴリ別 本文テンプレ ──
const DESC = {
  driver: (t,a)=>`【仕事内容】\n${a}を中心に、${t}のお仕事をお任せします。決まったルート・エリアが中心なので、未経験の方でも安心して始められます。\n\n【主な業務】\n・荷物/商品の積み込み・運搬・お届け\n・配達先での受け渡し、伝票・記録の確認\n・車両の日常点検\n\n【応募資格】\n普通自動車運転免許（AT限定可）／未経験・ブランク歓迎・学歴不問\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給・賞与あり\n\n【勤務】\n日勤メイン・実働8時間／週休2日／転勤なし`,
  warehouse:(t,a)=>`【仕事内容】\n${a}の倉庫・作業場での${t}のお仕事です。かんたんな軽作業が中心で、未経験の方も歓迎です。\n\n【主な業務】\n・商品の${t}（仕分け・梱包・検品・ピッキング等）\n・入出荷の補助、数量チェック\n・作業場の整理\n\n【応募資格】\n未経験歓迎・学歴不問／もくもく作業が好きな方歓迎\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／空調完備／研修あり／昇給あり\n\n【勤務】\n実働8時間・週休2日／シフト応相談`,
  mfg:(t,a)=>`【仕事内容】\n${a}の拠点で、${t}のお仕事をお任せします。手順やマニュアルがあり、未経験からでも段階的に習得できます。\n\n【主な業務】\n・${t}に関わる作業・チェック・記録\n・機器/設備の点検・かんたんな保守\n・品質確認、報告\n\n【応募資格】\n未経験歓迎・学歴不問（経験者は優遇）\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／資格取得支援／昇給・賞与あり\n\n【勤務】\n実働8時間・週休2日／転勤なし`,
  sales:(t,a)=>`【仕事内容】\n${a}エリアで、${t}をお任せします。既存のお客様中心・ノルマに追われない提案営業です。未経験歓迎。\n\n【主な業務】\n・お客様への訪問・ヒアリング・提案\n・見積・受発注・アフターフォロー\n・活動記録の入力\n\n【応募資格】\n普通自動車運転免許（あれば尚可）／未経験歓迎・学歴不問\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／インセンティブ／昇給・賞与あり\n\n【勤務】\n実働8時間・週休2日／転勤なし`,
  office:(t,a)=>`【仕事内容】\n${a}の拠点で、${t}のお仕事をお任せします。基本的なPC操作ができればOK、未経験・ブランクの方も歓迎です。\n\n【主な業務】\n・データ入力・書類作成・電話/メール対応\n・各種手配・管理サポート\n・その他かんたんな庶務\n\n【応募資格】\n基本的なPC操作／未経験歓迎・学歴不問\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／研修あり／昇給あり\n\n【勤務】\n実働8時間・週休2日／転勤なし`,
  event:(t,a)=>`【仕事内容】\n${a}を中心に、${t}のお仕事をお任せします。イベント・展示会などの現場が中心で、活気ある環境です。未経験歓迎。\n\n【主な業務】\n・${t}（設営・運営・販売・企画補助など）\n・会場での準備・撤収、来場対応\n・関係先との連絡調整\n\n【応募資格】\n未経験歓迎・学歴不問／人と接するのが好きな方\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／昇給あり\n\n【勤務】\n実働8時間・シフト制／週休2日`,
  special:(t,a)=>`【仕事内容】\n${a}を中心に、${t}に関わる業務をお任せします。未経験の方も歓迎、丁寧にサポートします。\n\n【応募資格】\n未経験歓迎・学歴不問（普通自動車免許があれば尚可）\n\n【待遇・福利厚生】\n各種社会保険完備／交通費支給／研修あり／昇給あり\n\n【勤務】\n実働8時間・週休2日／転勤なし`,
};

// 画像は「会社（アカウント）× 職種カテゴリ」ごとに固有。27枚すべて別画像＝
//   ・同じ会社でも職種で写真が変わる ・同じ職種でも会社が違えば写真が変わる（社跨ぎ重複ゼロ）。
// driver は各社専用の写真（配送車両/送迎/コスメ配送等。ブランド写り込みなし）を使用。
//   ※当初 cosme-haisou.jpg / st-haisou-driver.jpg / nl-movingsales.jpg / bi-secretary-driver.jpg が
//     public/images に実体が無く404になっていたが、真因は「ファイル名の拡張子不一致」だった
//     （実体は .jpg.jpeg / .jpeg / .png で保存されていた）。画像自体をリネームして解消したので、
//     一時的にやっていた haisou-fleet.jpg への統一は撤回し、本来の専用画像に戻した。
//     nlのみ実体がPNGのため参照パスも .png のまま。
// driver以外はPexelsのフリーStock（商用可・表記不要）。
const IMG_CELL = {
  sq: { driver:'/images/haisou-fleet.jpg',        warehouse:'/images/pex-31043129.jpg', mfg:'/images/kikai-operator-kombinat.jpg', sales:'/images/pex-8555673.jpg',  office:'/images/jobcat-office.jpg' },
  bg: { driver:'/images/cosme-haisou.jpg',        warehouse:'/images/pex-5156696.jpg',  mfg:'/images/jobcat-factory.jpg',          sales:'/images/pex-18935245.jpg', office:'/images/it-office.jpg' },
  st: { driver:'/images/st-haisou-driver.jpg',    warehouse:'/images/pex-27111449.jpg', mfg:'/images/pex-31352672.jpg',            sales:'/images/pex-8171200.jpg',  office:'/images/pex-31198914.jpg' },
  nl: { driver:'/images/nl-movingsales.png',      warehouse:'/images/pex-4487360.jpg',  mfg:'/images/pex-8973132.jpg',             sales:'/images/pex-6592668.jpg',  office:'/images/pex-92628.jpg',   event:'/images/jobcat-event.jpg' },
  bi: { driver:'/images/bi-secretary-driver.jpg', warehouse:'/images/pex-4487361.jpg',  mfg:'/images/pex-8973680.jpg',             sales:'/images/pex-7550538.jpg',  office:'/images/pex-8606292.jpg', event:'/images/pex-7648050.jpg' },
};
const imageFor = (co, cat) => {
  const c = IMG_CELL[co] || IMG_CELL.sq;
  const key = (cat === 'special') ? 'driver' : cat;
  return c[key] || c.driver;
};

function buildJob(co, type){
  const cat = TYPE_CAT[type] || 'office';
  const { area, location } = nextArea(co);
  const sl = salaryLabel(cat);
  const isDriver = cat==='driver' || cat==='special';
  const title = `【${area}】${type}｜${sl}・未経験歓迎・正社員${isDriver?'・普通免許OK':''}`;
  const catchcopy = `${type}（${area}）｜${sl}・未経験歓迎の正社員募集。${isDriver?'普通免許でOK。':'マニュアル・研修があり安心。'}週休2日・各種社会保険完備。`;
  return {
    title, location, salary: salaryDetail(cat), jobType: type, employmentType: '正社員',
    description: DESC[cat](type, area), tags: ['未経験歓迎','正社員',type, sl,'週休2日','社会保険完備'],
    catchcopy, imageUrl: imageFor(co, cat), isPublished: true, publishedAt: NOW, targetMedia: null, company: co,
  };
}

// ── 掲載プラン（media は target_media 値、keep は削除も再作成もしない職種） ──
// 求人ボックスのみ（Indeed / engage はユーザー側で作成するため対象外）
const PLAN = [
  { media:'求人ボックス', co:'sq', mix:{'配送':6,'送迎':5,'中型ドライバー':6,'メンテナンス':1,'IT営業':1,'ITサポート':1,'製造':1,'品質管理':1,'軽作業':1,'梱包':1,'組み立て':1,'ピッキング':1} },
  { media:'求人ボックス', co:'bg', mix:{'配送':5,'送迎':5,'中型ドライバー':5,'メンテナンス':1,'ルート営業':1,'事務':1,'品質管理':1,'軽作業':1,'梱包':1,'組み立て':1,'ピッキング':1,'検品':1,'物流倉庫':1} },
  { media:'求人ボックス', co:'st', mix:{'送迎':5,'配送':5,'中型ドライバー':5,'技術':1,'メンテナンス':1,'ルート営業':1,'事務':1,'品質管理':1,'軽作業':1,'梱包':1,'検品':1,'ピッキング':1,'物流倉庫':1} },
  { media:'求人ボックス', co:'nl', mix:{'送迎':5,'配送':5,'中型ドライバー':5,'イベント設営':1,'イベント企画':1,'イベント販売':1,'ルート営業':1,'メンテナンス':1,'組み立て':1,'事務':1,'品質管理':1,'軽作業':1,'梱包':1} },
  { media:'求人ボックス', co:'bi', mix:{'送迎':6,'配送':6,'中型ドライバー':6,'コンサル営業':1,'企画':1,'イベント営業':1,'メンテナンス':1,'ITサポート':1,'軽作業':1,'技術':1} },
];

async function main(){
  console.log(`\n=== 掲載プラン ${APPLY?'反映(--apply)':'DRY-RUN'} / ${NOW.slice(0,10)} ===`);
  console.log('※ 現在掲載中の求人は編集・削除しません。新規のみ追加します（同一タイトルはスキップ）。');
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
        if (made===1) console.log(`   ・${type} ×${count}  例: ${job.title.slice(0,46)}`);
      }
    }
  }
  console.log(`\n${APPLY?'完了':'（DRY-RUN・未反映）'}: 新規作成 ${created}件 / スキップ(既存同名) ${skipped}件`);
  if (!APPLY) console.log('→ 反映するには: node --experimental-sqlite scripts/seed-plan-remix-20260902.js --apply');
  console.log('※ 既存求人は一切変更していません。給与/本文の調整が必要ならお知らせください。\n');
}
main().catch(e=>{ console.error(e); process.exit(1); });
