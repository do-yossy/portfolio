#!/usr/bin/env node
'use strict';
// bi/bg の低反応タイトルを「検索語＋給与」先頭に書き直す（在庫を入れ替えず、既存公開求人のtitle/catchcopy/job_typeをUPDATE）。
// bi: 秘書兼ドライバー → 送迎ドライバー主語 / bg: コスメ配送・美容機器運搬・ヘアサロン配送 → ルート配送主語（製造・EC倉庫は対象外）。
// DRY-RUN既定。--apply で更新。DATA_DIRで対象DB切替。
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB);
try { db.exec('PRAGMA busy_timeout=8000'); } catch {}
const APPLY = process.argv.includes('--apply');

const areaOf = (t, loc) => { const m = String(t).match(/【([^】]+)】/); if (m) return m[1];
  return String(loc || '').replace(/^(東京都|大阪府|京都府|北海道|.{2,3}?[都道府県])/, '') || '担当エリア'; };
const sal = s => { const n = (String(s).match(/[\d,]{4,}/g) || []).map(x => parseInt(x.replace(/,/g, ''), 10)).filter(x => x >= 100000);
  if (n.length >= 2) return `${Math.round(n[0]/10000)}〜${Math.round(n[1]/10000)}万`;
  if (n.length === 1) return `${Math.round(n[0]/10000)}万〜`; return '高収入'; };
const h = s => { let x = 0; for (const c of String(s)) x = (x*31 + c.charCodeAt(0)) >>> 0; return x; };

const biTitles = (a,S) => [
 `【${a}】社長専属の送迎ドライバー｜未経験OK・普通免許のみ｜月給${S}・週休2日・9〜18時`,
 `【${a}】ドライバー（社長の送迎メイン＋かんたんサポート）｜未経験歓迎・普通免許OK｜月給${S}・転勤なし`,
 `【${a}】運転手／社長の送迎｜月給${S}・完全週休2日｜未経験OK・PC不問・普通免許OK`,
];
const biCatch = (a,S) => `未経験OK｜社長の送迎ドライバー（${a}）｜月給${S}・完全週休2日・9〜18時｜普通免許のみでOK。運転がメインで、かんたんなサポート業務もお任せします。`;
const bgTitles = (a,S) => [
 `【${a}】ルート配送ドライバー正社員｜月給${S}・未経験OK・普通免許OK・日勤・車両費全額会社負担`,
 `【${a}】ルート配送ドライバー｜未経験OK・普通免許OK・日勤・週休2日｜月給${S}・固定ルート中心`,
 `【${a}】配送ドライバー（固定ルート）｜月給${S}・未経験歓迎・AT限定OK｜日勤メイン・完全週休2日`,
];
const bgCatch = (a,S) => `月給${S}／未経験OK！決まったルートでお届けするルート配送ドライバー（${a}）。日勤メイン・完全週休2日・車両/ガソリン費は全額会社負担。普通免許でOK。`;

const upd = db.prepare('UPDATE jobs SET title=?, catchcopy=?, job_type=?, updated_at=? WHERE id=?');
const nowIso = new Date().toISOString();
function run(co, types, newType, tf, cf){
  const ph = types.map(()=>'?').join(',');
  const rows = db.prepare(`SELECT id,title,location,salary FROM jobs WHERE company=? AND is_published=1 AND job_type IN (${ph})`).all(co,...types);
  console.log(`\n[${co}] 対象 ${rows.length}件（${types.join(' / ')} → ${newType}）`);
  let i=0;
  for(const r of rows){ const a=areaOf(r.title,r.location), S=sal(r.salary); const nt=tf(a,S)[h(a+co)%3];
    if(i<4){ console.log(`  before: ${r.title}`); console.log(`  after : ${nt}`); console.log('  ---'); }
    if(APPLY) upd.run(nt, cf(a,S), newType, nowIso, r.id); i++; }
  return rows.length;
}
let t=0;
t+=run('bi',['秘書兼ドライバー'],'送迎ドライバー',biTitles,biCatch);
t+=run('bg',['コスメ配送ドライバー','美容機器運搬ドライバー','ヘアサロン向け配送スタッフ'],'ルート配送ドライバー',bgTitles,bgCatch);
console.log(`\n${APPLY?'✅ 更新完了':'（DRY-RUN・未更新）'}: 対象合計 ${t}件`);
if(!APPLY) console.log('→ 実行: node --experimental-sqlite scripts/rewrite-bi-bg-titles.js --apply');
