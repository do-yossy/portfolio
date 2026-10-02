#!/usr/bin/env node
'use strict';
/**
 * st/nl/slの既存Indeed求人（タクシー推薦強化バッチ・2026-09-29投入分）のうち、
 * 求人ボックスで検索需要が低い（または広すぎて埋もれる）ことが確認できた3職種を、
 * よりニッチで実需のある表現に改名する（2026-10-02、ユーザー確認済み）。
 *
 * 変更内容（市場規模は求人ボックス・大阪府で確認済み）:
 *   st: バイヤー・関係者送迎ドライバー（簡略形で1件＝実質存在しない語）→ 商談送迎ドライバー（112件）
 *   st: 展示会場スタッフ送迎ドライバー（簡略形で1件＝実質存在しない語）→ 催事送迎ドライバー（227件）
 *   nl: 移動販売車の回送ドライバー（122件・適正だが「回送」は運行停止中を連想させる懸念）
 *       → 移動販売車の陸送ドライバー（69件・業界で一般的な用語に変更）
 *   sl: 整骨院通院送迎ドライバー（1,194件＝広すぎ）→ 整骨院送迎ドライバー（43件）
 *   sl: 治療院・エステ通院送迎ドライバー（広すぎ）→ エステ送迎ドライバー（198件、確定済みの名称）
 *
 * amは対象外（既に最適・好調のため変更しない）。職人送迎ドライバー（st, 91件）・
 * 送迎ドライバー（nl, titlePrefix "移動販売の"）・専属ドライバー・配送ドライバー・
 * 展示会配送ドライバーも対象外（変更不要と判断済み）。
 *
 * 新しい職種名・本文は scripts/lib/taxi-funnel-content.js の POOL（更新済み）を使う。
 * 既存求人は勤務地（location）を変えずに、タイトル・本文・job_type・catchcopyのみ
 * UPDATE する（delete+createではなく、既存レコードのIDを維持する）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/update-indeed-niche-titles-20261002.js             // ドライラン
 *   node --experimental-sqlite scripts/update-indeed-niche-titles-20261002.js --apply     // 実際に更新
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
const { POOL, titleFor } = require('./lib/taxi-funnel-content');
const { Jobs } = require('../db-factory');

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const APPLY = process.argv.includes('--apply');

// 旧job_type → 新job_type の対応表（会社ごと）
const RENAME_MAP = {
  st: {
    'バイヤー・関係者送迎ドライバー': '商談送迎ドライバー',
    '展示会場スタッフ送迎ドライバー': '催事送迎ドライバー',
  },
  nl: {
    '移動販売車の回送ドライバー': '移動販売車の陸送ドライバー',
  },
  sl: {
    '整骨院通院送迎ドライバー': '整骨院送迎ドライバー',
    '治療院・エステ通院送迎ドライバー': 'エステ送迎ドライバー',
  },
};

// タイトルからエリア名（【】内）を抽出する
function extractArea(title) {
  const m = title.match(/^【(.+?)】/);
  return m ? m[1] : null;
}

async function main() {
  console.log(`\n=== st/nl/sl Indeed求人のニッチ表現への改名${APPLY ? '（--apply・実際に更新）' : '（DRY-RUN）'} ===\n`);

  let totalUpdated = 0;
  for (const co of Object.keys(RENAME_MAP)) {
    const renames = RENAME_MAP[co];
    for (const oldType of Object.keys(renames)) {
      const newType = renames[oldType];
      const newPoolEntry = POOL[co].find(p => p.jobType === newType);
      if (!newPoolEntry) {
        console.log(`  [${co}] プールに${newType}が見つかりません。スキップ`);
        continue;
      }

      const jobs = db.prepare(
        `SELECT id, title, location FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`
      ).all(co, oldType);

      console.log(`[${co}] 「${oldType}」→「${newType}」: ${jobs.length}件`);

      for (const job of jobs) {
        const area = extractArea(job.title) || job.location;
        const newTitle = titleFor(co, newPoolEntry, area);
        const newDescription = newPoolEntry.buildDescription(area);
        const newCatchcopy = `${newPoolEntry.jobType}（${area}）｜未経験歓迎・普通免許OK`;

        console.log(`  更新: ${job.title.slice(0, 50)}`);
        console.log(`   →  ${newTitle}`);

        if (APPLY) {
          await Jobs.update(job.id, {
            title: newTitle,
            jobType: newType,
            description: newDescription,
            catchcopy: newCatchcopy,
            salary: newPoolEntry.salary,
          });
        }
        totalUpdated++;
      }
    }
  }

  console.log(`\n合計: ${totalUpdated}件${APPLY ? 'を更新しました' : 'を更新予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
