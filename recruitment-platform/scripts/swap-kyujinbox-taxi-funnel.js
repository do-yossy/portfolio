#!/usr/bin/env node
'use strict';
/**
 * 求人ボックスの応募0件の求人を検出し、タクシー推薦の入口（送迎・専属ドライバー系）
 * 求人に入れ替える（st/nl/am/sl対象）。2026-09-29、ユーザー確認済みの運用:
 *   「求人ボックスは純増しない。入替のみ。入替はこの小分類プールを使っていく」
 *
 * 動作:
 *   1. job_metrics（求人ボックスの実績スクレイプ結果）の最新スナップショットで
 *      応募0件の求人を検出する（実績未取得の求人は対象外）。
 *   2. 検出した求人を1件ずつ削除し、同数だけ scripts/lib/taxi-funnel-content.js の
 *      職種プールから重み付き巡回で選んだ内容を新規作成する（削除→作成なので総数は変わらない）。
 *   3. エリアは会社ごとに既存の同プール由来の求人数をもとに巡回させ、毎回違う地名・
 *      文言（buildDescription内のエリア差し込み）になるようにする。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/swap-kyujinbox-taxi-funnel.js                       // ドライラン（全社・既定10件まで/社）
 *   node --experimental-sqlite scripts/swap-kyujinbox-taxi-funnel.js --apply                // 実際に入替
 *   node --experimental-sqlite scripts/swap-kyujinbox-taxi-funnel.js --apply --company st --limit 14
 */
const path = require('path');
const fs = require('fs');
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

const { DatabaseSync } = require('node:sqlite');
const { buildJob, pickByWeight, POOL } = require('./lib/taxi-funnel-content');
const { Jobs } = require('../db-factory');

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const APPLY = has('--apply');
const COMPANY = val('--company', null);
const LIMIT_PER_CO = parseInt(val('--limit', '10'), 10) || 10;
const COMPANIES = COMPANY ? [COMPANY] : Object.keys(POOL); // st, nl, am, sl

// ── エリアプール（実在地名。seed-taxi-funnel-indeed-20260929.jsと同系統だが求人ボックス入替専用に別配列） ──
const AREAS = [
  { area: '中崎西', ward: '大阪市北区', pref: '大阪府' }, { area: '谷町', ward: '大阪市中央区', pref: '大阪府' },
  { area: '悲田院町', ward: '大阪市天王寺区', pref: '大阪府' }, { area: '恵美須西', ward: '大阪市浪速区', pref: '大阪府' },
  { area: '十三本町', ward: '大阪市淀川区', pref: '大阪府' }, { area: '今福西', ward: '大阪市城東区', pref: '大阪府' },
  { area: '阪南町', ward: '大阪市阿倍野区', pref: '大阪府' }, { area: '駒川', ward: '大阪市東住吉区', pref: '大阪府' },
  { area: '磯路', ward: '大阪市港区', pref: '大阪府' }, { area: '三軒家東', ward: '大阪市大正区', pref: '大阪府' },
  { area: '新金岡町', ward: '堺市北区', pref: '大阪府' }, { area: '栄本町', ward: '池田市', pref: '大阪府' },
  { area: '萱野', ward: '箕面市', pref: '大阪府' }, { area: '早子町', ward: '寝屋川市', pref: '大阪府' },
  { area: '金田町', ward: '守口市', pref: '大阪府' }, { area: '業平町', ward: '芦屋市', pref: '兵庫県' },
  { area: '栄町', ward: '川西市', pref: '兵庫県' }, { area: '四条', ward: '京都市下京区', pref: '京都府' },
  { area: '椥辻', ward: '京都市山科区', pref: '京都府' }, { area: '観音堂', ward: '城陽市', pref: '京都府' },
];

function nextArea(offset) {
  const a = AREAS[offset % AREAS.length];
  const cycle = Math.floor(offset / AREAS.length);
  const suffixArea = cycle > 0 ? `${a.area}${cycle + 1}` : a.area;
  return { area: suffixArea, location: `${a.pref}${a.ward}${a.area}` };
}

// ── job_metrics 最新スナップショットを求人ごとに集約（kyujinbox-stats.js と同じ考え方） ──
const metricsRows = db.prepare(`SELECT * FROM job_metrics`).all();
const latestByKey = new Map();
for (const r of metricsRows) {
  const key = r.job_id ? `id:${r.job_id}` : `num:${r.company}:${r.job_number}`;
  const cur = latestByKey.get(key);
  if (!cur || String(r.collected_at) > String(cur.collected_at)) latestByKey.set(key, r);
}

async function main() {
  console.log(`\n=== 求人ボックス入替: タクシー推薦強化プールへの置き換え${APPLY ? '（--apply・実際に入替）' : '（DRY-RUN）'} ===\n`);

  let grandRemoved = 0, grandCreated = 0;
  for (const co of COMPANIES) {
    if (!POOL[co]) { console.log(`  [${co}] プール未定義のためスキップ`); continue; }

    const jobs = db.prepare(
      `SELECT id, title, kyujinbox_job_number FROM jobs WHERE is_published = 1 AND target_media LIKE '%求人ボックス%' AND company = ?`
    ).all(co);

    const zeroApp = jobs.filter(j => {
      const byId = latestByKey.get(`id:${j.id}`);
      const byNum = j.kyujinbox_job_number ? latestByKey.get(`num:${co}:${j.kyujinbox_job_number}`) : null;
      const metric = byId || byNum;
      return metric && Number(metric.applies) === 0;
    });

    const targetCount = Math.min(zeroApp.length, LIMIT_PER_CO);
    console.log(`[${co}] 求人ボックス掲載中: ${jobs.length}件 / 応募0件（実績取得済み）: ${zeroApp.length}件 / 今回入替: ${targetCount}件`);

    // 既にこのプール由来の求人がいくつあるか（エリア巡回・重み付き選択のオフセットに使う）
    const existingPoolCount = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE company = ? AND job_type IN (${POOL[co].map(() => '?').join(',')})`)
      .get(co, ...POOL[co].map(p => p.jobType)).c;

    const targets = zeroApp.slice(0, targetCount);
    let removed = 0, created = 0;
    for (let i = 0; i < targets.length; i++) {
      const oldJob = targets[i];
      const poolEntry = pickByWeight(co, existingPoolCount + i);
      const { area, location } = nextArea(existingPoolCount + i);
      const newJob = buildJob(co, poolEntry, area, location, '求人ボックス');

      console.log(`  削除: ${oldJob.title.slice(0, 40)}`);
      console.log(`  → 作成: [${newJob.jobType}] ${newJob.title}`);

      if (APPLY) {
        db.prepare('DELETE FROM jobs WHERE id=?').run(oldJob.id);
        await Jobs.create(newJob);
      }
      removed++;
      created++;
    }
    grandRemoved += removed; grandCreated += created;
    console.log(`[${co}] ${APPLY ? '入替完了' : '（DRY-RUN）'}: 削除${removed}件 / 作成${created}件\n`);
  }

  console.log(`合計: 削除${grandRemoved}件 / 作成${grandCreated}件`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 総掲載数は変わりません（1件削除→1件作成の入替のみ）。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
