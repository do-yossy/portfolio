#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】既存の送迎系求人（st/sl/yp）の本文に、「人を運ぶ・接客はあるが
 * 抵抗感は少ない」という訴求を補強する一文を追加する。2026-10-02、ユーザー確認済み：
 *   「タクシーに最終着地するように求人を掲載する。過去に来ていた送迎ドライバーと
 *    汎用ドライバーの部分を今掲載する内容に落とし込む。人を運ぶドライバーであり
 *    人との折衝は少なからずあるが抵抗がなく応募が増えるようにしている。」
 *   「既存の送迎系求人の文面を、この軸でもう一度見直す（強調が足りない箇所を直す）」
 *   「配送は一旦このまま」（配送ドライバー・展示会配送ドライバーは対象外）
 *   「新しい会社も見直す」（yp＝YUMIPRO AGENCYも対象に含める）
 *   「インディード用の求人だけ見直す」（求人ボックス側・scripts/lib/taxi-funnel-content.js
 *    の共通buildDescriptionは変更しない。既存のIndeed掲載レコードのみをUPDATEする）
 *
 * amは既に実績が好調なため対象外。専属ドライバー・配送ドライバー・展示会配送ドライバーも
 * 今回は対象外（配送系は「一旦このまま」との指示）。
 *
 * 対象（レビューで「抵抗感の少なさ」の訴求が弱いと判断した6職種）:
 *   st: 職人送迎ドライバー／商談送迎ドライバー／催事送迎ドライバー
 *   sl: 整骨院送迎ドライバー／エステ送迎ドライバー
 *   yp: 採用コンサル訪問送迎ドライバー／組織コンサル訪問送迎ドライバー
 *       （yp内の経営者カウンセリング送迎・経営コンサル訪問送迎は既に「車内でのお客様
 *        対応サポート」の記載があり対象外。採用コンサル／組織コンサルはこの記載が
 *        抜け落ちていたため、追加のうえ補強する）
 *
 * 給与・勤務地・タイトル・job_type・タグ等の事実関係は一切変更しない。
 * description内の該当箇所にのみ、ピンポイントで一文を挿入する。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/update-indeed-sougei-resistance-20261002.js             // ドライラン
 *   node --experimental-sqlite scripts/update-indeed-sougei-resistance-20261002.js --apply     // 実際に更新
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

// 会社・job_type ごとに「description内で一致する部分文字列」→「置き換え後の文字列」を定義。
// 既存の本文の中の該当箇所だけをピンポイントで書き換える（全文再生成はしない）。
const PATCHES = [
  {
    co: 'st', jobType: '職人送迎ドライバー',
    from: '◆ 決まった職人を担当するため、信頼関係を築きながら働ける\n◆ 普通免許',
    to: '◆ 決まった職人を担当するため、信頼関係を築きながら働ける\n◆ 送迎と車内での簡単なサポートが中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です\n◆ 普通免許',
  },
  {
    co: 'st', jobType: '商談送迎ドライバー',
    from: '◆ さまざまな業界のバイヤーと接する機会がある\n◆ 普通免許',
    to: '◆ さまざまな業界のバイヤーと接する機会がある（本格的な商談同席は無く、送迎と簡単なご案内が中心です）\n◆ 普通免許',
  },
  {
    co: 'st', jobType: '催事送迎ドライバー',
    from: '◆ 展示会の現場を裏側から支えるポジション\n◆ 普通免許',
    to: '◆ 展示会の現場を裏側から支えるポジション\n◆ スタッフの送迎が中心で、人と接するのが苦にならない方なら安心。本格的な接客スキルは不要です\n◆ 普通免許',
  },
  {
    co: 'sl', jobType: '整骨院送迎ドライバー',
    from: '◆ 利用者の健康を支える、感謝されるお仕事\n◆ 普通免許',
    to: '◆ 利用者の健康を支える、感謝されるお仕事\n◆ 送迎と乗降のサポートが中心で、本格的な介助・接客スキルは不要。人と接するのが苦にならない方なら安心です\n◆ 普通免許',
  },
  {
    co: 'sl', jobType: 'エステ送迎ドライバー',
    from: '◆ 利用者の健康・美容を支える、感謝されるお仕事\n◆ 普通免許',
    to: '◆ 利用者の健康・美容を支える、感謝されるお仕事\n◆ 送迎と乗降のサポートが中心で、本格的な介助・接客スキルは不要。人と接するのが苦にならない方なら安心です\n◆ 普通免許',
  },
  {
    co: 'yp', jobType: '採用コンサル訪問送迎ドライバー',
    from: '・コンサルタントの訪問先（企業・人事部門等）までの送迎\n・訪問スケジュールに合わせた運行管理\n・車両の清掃・日常点検\n\n【この仕事の魅力】\n◆ さまざまな企業の採用現場に関わる機会がある\n◆ 普通免許',
    to: '・コンサルタントの訪問先（企業・人事部門等）までの送迎\n・訪問スケジュールに合わせた運行管理\n・車内でのお客様対応サポート、車両の清掃・日常点検\n\n【この仕事の魅力】\n◆ さまざまな企業の採用現場に関わる機会がある（本格的な商談同席は無く、送迎と簡単なご案内が中心です）\n◆ 普通免許',
  },
  {
    co: 'yp', jobType: '組織コンサル訪問送迎ドライバー',
    from: '・コンサルタントの訪問先（企業・人事部門等）までの送迎\n・訪問スケジュールに合わせた運行管理\n・車両の清掃・日常点検\n\n【この仕事の魅力】\n◆ 組織づくりの現場に関わる機会がある\n◆ 普通免許',
    to: '・コンサルタントの訪問先（企業・人事部門等）までの送迎\n・訪問スケジュールに合わせた運行管理\n・車内でのお客様対応サポート、車両の清掃・日常点検\n\n【この仕事の魅力】\n◆ 組織づくりの現場に関わる機会がある（本格的な商談同席は無く、送迎と簡単なご案内が中心です）\n◆ 普通免許',
  },
];

async function main() {
  console.log(`\n=== Indeed掲載の送迎系求人：抵抗感の少なさを補強${APPLY ? '（--apply・実際に更新）' : '（DRY-RUN）'} ===\n`);

  let totalUpdated = 0, totalSkipped = 0;
  for (const patch of PATCHES) {
    const jobs = db.prepare(
      `SELECT id, title, description FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`
    ).all(patch.co, patch.jobType);

    console.log(`[${patch.co}] ${patch.jobType}: ${jobs.length}件`);

    for (const job of jobs) {
      if (!job.description.includes(patch.from)) {
        console.log(`  ⚠️ スキップ（本文が想定と不一致）: ${job.title.slice(0, 40)}`);
        totalSkipped++;
        continue;
      }
      const newDescription = job.description.replace(patch.from, patch.to);
      console.log(`  更新: ${job.title.slice(0, 50)}`);
      if (APPLY) {
        await Jobs.update(job.id, { description: newDescription });
      }
      totalUpdated++;
    }
  }

  console.log(`\n合計: ${totalUpdated}件${APPLY ? 'を更新' : 'を更新予定（DRY-RUN）'} / ${totalSkipped}件スキップ`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 求人ボックス側（scripts/lib/taxi-funnel-content.js）は変更していません（Indeed掲載のみが対象）。');
}

main().catch(err => { console.error(err); process.exit(1); });
