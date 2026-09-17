#!/usr/bin/env node
'use strict';
/**
 * 2026-09-17、過去の掲載全体に広がっていた架空住所（例: 大阪市北区36丁目）を
 * 実在する町名に修正する。対象は sq/bg/st/bi/nl の全求人（投稿済み・未投稿問わず）。
 *
 * 方式: title/description内の「架空エリア文字列」をピンポイントで実在エリア文字列に
 * 置換する（元の文章構成やスクリプト由来の違いに影響されない、最も安全な方法）。
 * locationフィールドも同じ実在エリアに更新する。給与・職種・会社等は一切変更しない。
 *
 * 投稿済み(kyujinbox_posted_at IS NOT NULL)かつ求人番号があるものは、実際の掲載への
 * 反映が別途必要（このスクリプトはDBのみ更新。反映は reflect-fake-address-fix.js で行う）。
 *
 * 実行: node --experimental-sqlite scripts/fix-fake-address-jobs.js          // 確認のみ
 *       node --experimental-sqlite scripts/fix-fake-address-jobs.js --apply  // 実際に更新
 */
const path = require('path');
const fs   = require('fs');
(function loadEnv() { const f=path.join(__dirname,'..','.env'); if(!fs.existsSync(f))return;
  fs.readFileSync(f,'utf8').split('\n').forEach(l=>{l=l.trim(); if(!l||l.startsWith('#'))return; const i=l.indexOf('='); if(i<0)return; const k=l.slice(0,i).trim(),v=l.slice(i+1).trim(); if(k&&!(k in process.env))process.env[k]=v;});
})();
const { Jobs } = require('../db-factory');
const { hashSeed } = require('./lib/kyujinbox-vary');

const APPLY = process.argv.includes('--apply');

const OLD_WARDS = [
  '大阪府大阪市北区','大阪府大阪市中央区','大阪府大阪市西区','大阪府大阪市淀川区','大阪府大阪市東淀川区',
  '大阪府大阪市都島区','大阪府大阪市城東区','大阪府大阪市鶴見区','大阪府大阪市旭区','大阪府大阪市天王寺区',
  '大阪府大阪市阿倍野区','大阪府大阪市住吉区','大阪府大阪市東住吉区','大阪府大阪市平野区','大阪府大阪市生野区',
  '大阪府大阪市東成区','大阪府大阪市浪速区','大阪府大阪市西成区','大阪府大阪市住之江区','大阪府大阪市港区',
  '大阪府大阪市大正区','大阪府大阪市此花区','大阪府大阪市福島区','大阪府堺市堺区','大阪府堺市北区',
  '大阪府東大阪市','大阪府吹田市','大阪府豊中市','大阪府高槻市','大阪府茨木市','大阪府枚方市','大阪府八尾市',
  '大阪府寝屋川市','大阪府守口市','大阪府門真市',
  '兵庫県尼崎市','兵庫県西宮市','兵庫県伊丹市','兵庫県宝塚市','兵庫県川西市','兵庫県芦屋市',
  '京都府京都市伏見区','京都府京都市南区','京都府向日市','京都府長岡京市','京都府八幡市','京都府京田辺市',
  '京都府乙訓郡大山崎町',
];
const wardsEsc = OLD_WARDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const STRICT_RE = new RegExp(`^(${wardsEsc})(\\d+丁目)$`);

// 実在する町名プール（generate-kyujinbox-from-performance.js と同一）
const KANSAI = [
  { area:'梅田',ward:'大阪市北区',pref:'大阪府' },{ area:'茶屋町',ward:'大阪市北区',pref:'大阪府' },
  { area:'中崎西',ward:'大阪市北区',pref:'大阪府' },{ area:'天神橋',ward:'大阪市北区',pref:'大阪府' },
  { area:'心斎橋',ward:'大阪市中央区',pref:'大阪府' },{ area:'難波',ward:'大阪市中央区',pref:'大阪府' },
  { area:'谷町',ward:'大阪市中央区',pref:'大阪府' },{ area:'本町',ward:'大阪市中央区',pref:'大阪府' },
  { area:'靭本町',ward:'大阪市西区',pref:'大阪府' },{ area:'新町',ward:'大阪市西区',pref:'大阪府' },
  { area:'阿波座',ward:'大阪市西区',pref:'大阪府' },
  { area:'悲田院町',ward:'大阪市天王寺区',pref:'大阪府' },{ area:'上本町',ward:'大阪市天王寺区',pref:'大阪府' },
  { area:'難波中',ward:'大阪市浪速区',pref:'大阪府' },{ area:'恵美須西',ward:'大阪市浪速区',pref:'大阪府' },
  { area:'西中島',ward:'大阪市淀川区',pref:'大阪府' },{ area:'十三本町',ward:'大阪市淀川区',pref:'大阪府' },
  { area:'豊里',ward:'大阪市東淀川区',pref:'大阪府' },{ area:'瑞光',ward:'大阪市東淀川区',pref:'大阪府' },
  { area:'都島本通',ward:'大阪市都島区',pref:'大阪府' },
  { area:'今福西',ward:'大阪市城東区',pref:'大阪府' },{ area:'蒲生',ward:'大阪市城東区',pref:'大阪府' },
  { area:'今津中',ward:'大阪市鶴見区',pref:'大阪府' },
  { area:'大宮',ward:'大阪市旭区',pref:'大阪府' },
  { area:'阪南町',ward:'大阪市阿倍野区',pref:'大阪府' },{ area:'昭和町',ward:'大阪市阿倍野区',pref:'大阪府' },
  { area:'帝塚山東',ward:'大阪市住吉区',pref:'大阪府' },
  { area:'駒川',ward:'大阪市東住吉区',pref:'大阪府' },
  { area:'平野本町',ward:'大阪市平野区',pref:'大阪府' },
  { area:'中川',ward:'大阪市生野区',pref:'大阪府' },
  { area:'玉津',ward:'大阪市東成区',pref:'大阪府' },
  { area:'岸里',ward:'大阪市西成区',pref:'大阪府' },
  { area:'南港',ward:'大阪市住之江区',pref:'大阪府' },
  { area:'磯路',ward:'大阪市港区',pref:'大阪府' },
  { area:'三軒家東',ward:'大阪市大正区',pref:'大阪府' },
  { area:'春日出中',ward:'大阪市此花区',pref:'大阪府' },
  { area:'野田',ward:'大阪市福島区',pref:'大阪府' },
  { area:'宿院町',ward:'堺市堺区',pref:'大阪府' },{ area:'新金岡町',ward:'堺市北区',pref:'大阪府' },
  { area:'鳳東町',ward:'堺市西区',pref:'大阪府' },
  { area:'長田',ward:'東大阪市',pref:'大阪府' },{ area:'江坂町',ward:'吹田市',pref:'大阪府' },
  { area:'曽根東町',ward:'豊中市',pref:'大阪府' },{ area:'城北町',ward:'高槻市',pref:'大阪府' },
  { area:'駅前町',ward:'茨木市',pref:'大阪府' },{ area:'岡東町',ward:'枚方市',pref:'大阪府' },
  { area:'若林町',ward:'八尾市',pref:'大阪府' },{ area:'早子町',ward:'寝屋川市',pref:'大阪府' },
  { area:'金田町',ward:'守口市',pref:'大阪府' },{ area:'速見町',ward:'門真市',pref:'大阪府' },
  { area:'阿保',ward:'松原市',pref:'大阪府' },{ area:'岡',ward:'藤井寺市',pref:'大阪府' },
  { area:'栄本町',ward:'池田市',pref:'大阪府' },{ area:'萱野',ward:'箕面市',pref:'大阪府' },
  { area:'塚口本町',ward:'尼崎市',pref:'兵庫県' },{ area:'甲子園町',ward:'西宮市',pref:'兵庫県' },
  { area:'中央',ward:'伊丹市',pref:'兵庫県' },{ area:'逆瀬川',ward:'宝塚市',pref:'兵庫県' },
  { area:'栄町',ward:'川西市',pref:'兵庫県' },{ area:'業平町',ward:'芦屋市',pref:'兵庫県' },
  { area:'白金',ward:'川辺郡猪名川町',pref:'兵庫県' },
  { area:'深草',ward:'京都市伏見区',pref:'京都府' },{ area:'上鳥羽',ward:'京都市南区',pref:'京都府' },
  { area:'烏丸',ward:'京都市中京区',pref:'京都府' },{ area:'四条',ward:'京都市下京区',pref:'京都府' },
  { area:'椥辻',ward:'京都市山科区',pref:'京都府' },
  { area:'宇治',ward:'宇治市',pref:'京都府' },{ area:'長岡',ward:'長岡京市',pref:'京都府' },
  { area:'欽明台',ward:'八幡市',pref:'京都府' },{ area:'興戸',ward:'京田辺市',pref:'京都府' },
  { area:'観音堂',ward:'城陽市',pref:'京都府' },{ area:'梅美台',ward:'木津川市',pref:'京都府' },
];

function realAreaFor(jobId) {
  const seed = hashSeed(`fix20260917|${jobId}`);
  const cycle = Math.floor(seed / KANSAI.length) % 3; // 0,1,2
  const item = KANSAI[seed % KANSAI.length];
  const suffix = cycle === 0 ? '' : `${cycle}丁目`;
  return { area: `${item.ward}${item.area}${suffix}`, pref: item.pref };
}

async function main() {
  const all = await Jobs.findAll();
  const targets = all.filter(j => STRICT_RE.test(j.location || ''));

  console.log(`\n=== 架空住所の一括修正${APPLY ? '（--apply・実際に更新）' : '（確認のみ）'} ===\n`);
  console.log(`対象: ${targets.length}件\n`);

  let fixed = 0, noHit = 0;
  const needsReflect = []; // 投稿済み・求人番号ありのもの
  for (const j of targets) {
    const oldLoc = j.location; // 例: 大阪府大阪市北区36丁目
    const oldAreaOnly = oldLoc.replace(/^(大阪府|京都府|兵庫県)/, ''); // 例: 大阪市北区36丁目（タイトル/本文はこちらで出現）
    const { area: newAreaOnly, pref } = realAreaFor(j.id);
    const newLoc = `${pref}${newAreaOnly}`;

    const titleHit = (j.title || '').includes(oldAreaOnly);
    const descHit = (j.description || '').includes(oldAreaOnly);
    if (!titleHit && !descHit) { noHit++; console.log(`  ⚠️ [${j.company}] 本文中に旧エリア文字列が見つからず: ${j.title}`); continue; }

    const newTitle = (j.title || '').split(oldAreaOnly).join(newAreaOnly);
    const newDescription = (j.description || '').split(oldAreaOnly).join(newAreaOnly);

    console.log(`  [${j.company}]${j.kyujinbox_posted_at ? '(投稿済み)' : '(未投稿)'} ${oldAreaOnly} → ${newAreaOnly}`);
    if (APPLY) {
      await Jobs.update(j.id, { title: newTitle, description: newDescription, location: newLoc });
    }
    fixed++;
    if (j.kyujinbox_posted_at && j.kyujinbox_job_number) {
      needsReflect.push({ id: j.id, company: j.company, jobNumber: j.kyujinbox_job_number, title: newTitle, description: newDescription });
    }
  }

  console.log(`\n${APPLY ? '更新しました' : '（確認のみ・未更新）'}: ${fixed}件 / 文字列不一致でスキップ: ${noHit}件`);
  console.log(`このうち実際の掲載への反映(reflect)が必要なもの: ${needsReflect.length}件`);

  if (APPLY) {
    const outDir = path.join(__dirname, '..', 'logs');
    fs.mkdirSync(outDir, { recursive: true });
    const byCo = {};
    for (const r of needsReflect) { (byCo[r.company] = byCo[r.company] || []).push(r); }
    for (const [co, list] of Object.entries(byCo)) {
      const outPath = path.join(outDir, `reflect-queue-${co}.json`);
      fs.writeFileSync(outPath, JSON.stringify(list.map(({company, ...rest}) => rest), null, 2), 'utf8');
      console.log(`  → ${co}: ${list.length}件を ${outPath} に書き出しました`);
    }
  }
  if (!APPLY) console.log('\n→ 反映するには --apply を付けて再実行してください。');
}
main().catch(err => { console.error(err); process.exit(1); });
