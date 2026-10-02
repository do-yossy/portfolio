#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】nl・sl・amの送迎系求人（専属・配送・陸送除く）も、st/ypと同じく
 * 「未経験歓迎」から「経験者優遇」へ表現を変更する。2026-10-02、ユーザー確認済み：
 *   「他の企業の分も」「amもかえて」
 *   （AMは現在タクシー推薦ファネルの中で唯一応募が急増している会社のため、この変更で
 *    応募数が一時的に減るリスクをユーザーに提示した上で、「予定通り変える（統一を優先）」
 *    との回答を得て実施）
 *
 * st/ypと違い、nl「送迎ドライバー」・sl「整骨院送迎ドライバー」「エステ送迎ドライバー」・
 * am「登園送迎ドライバー」「降園送迎ドライバー」は既にタイトル・job_typeが実態に即した
 * 適正な表現になっている（求人ボックス側の命名とも統一済み）ため、job_type・タイトルの
 * 「職種名」部分は変更しない。タイトル内の「未経験歓迎」、本文の応募資格、タグのみを
 * 「経験者優遇」に差し替える。
 *
 * 対象外：専属ドライバー・配送ドライバー（現状維持）、nl「移動販売車の陸送ドライバー」
 * （乗客を乗せない車両回送のため、今回の「お客様・スタッフを乗せる送迎」の対象外）。
 *
 * 求人ボックス側（scripts/lib/taxi-funnel-content.js）は変更しない。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/update-indeed-nl-sl-experience-20261002.js             // ドライラン
 *   node --experimental-sqlite scripts/update-indeed-nl-sl-experience-20261002.js --apply     // 実際に更新
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
const { Jobs } = require('../db-factory');

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const APPLY = process.argv.includes('--apply');

const TARGETS = [
  { co: 'nl', jobType: '送迎ドライバー' },
  { co: 'sl', jobType: '整骨院送迎ドライバー' },
  { co: 'sl', jobType: 'エステ送迎ドライバー' },
  { co: 'am', jobType: '登園送迎ドライバー' },
  { co: 'am', jobType: '降園送迎ドライバー' },
];

async function main() {
  console.log(`\n=== nl/sl/am Indeed求人：未経験歓迎→経験者優遇${APPLY ? '（--apply・実際に更新）' : '（DRY-RUN）'} ===\n`);

  let total = 0, skipped = 0;
  for (const t of TARGETS) {
    const jobs = db.prepare(
      `SELECT id, title, description, tags FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`
    ).all(t.co, t.jobType);

    console.log(`[${t.co}] ${t.jobType}: ${jobs.length}件`);

    for (const job of jobs) {
      if (!job.title.includes('未経験歓迎')) {
        console.log(`  ⚠️ スキップ（既に変更済みか想定と不一致）: ${job.title.slice(0, 40)}`);
        skipped++;
        continue;
      }

      const newTitle = job.title.replace('未経験歓迎', '経験者優遇');
      const newDescription = job.description
        .replace('未経験・ブランク歓迎・学歴不問', '送迎・運転業務のご経験がある方歓迎')
        .replace(/◆ 普通免許（AT限定可）があればOK、未経験歓迎/, '◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎');
      let tags;
      try {
        const arr = JSON.parse(job.tags || '[]');
        tags = JSON.stringify(arr.map(x => x === '未経験歓迎' ? '経験者優遇' : x));
      } catch {
        tags = job.tags;
      }

      console.log(`  更新: ${job.title.slice(0, 50)}`);
      console.log(`   →  ${newTitle}`);

      if (APPLY) {
        await Jobs.update(job.id, { title: newTitle, description: newDescription, tags: JSON.parse(tags) });
      }
      total++;
    }
  }

  console.log(`\n合計: ${total}件${APPLY ? 'を更新' : 'を更新予定（DRY-RUN）'} / ${skipped}件スキップ`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 職種名（job_type）・タイトルの職種部分は変更していません。専属・配送・陸送は対象外です。');
}

main().catch(err => { console.error(err); process.exit(1); });
