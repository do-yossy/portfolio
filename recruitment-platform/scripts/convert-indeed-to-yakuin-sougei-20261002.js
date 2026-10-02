#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】st・ypに、過去のタクシー推薦成約データで実証済みの
 * 「役員ドライバー」系キーワードを使った新職種「役員送迎ドライバー」を追加する。
 * 2026-10-02、ユーザー確認済み：
 *   「このことを踏まえたうえでインディード用の求人の掲載内容を考えてほしい」
 *   「他のアカウントも修正が必要　まとめてどのようにインディード用で掲載すればいいか」
 *
 * 背景：
 *   ・過去のタクシー推薦成約19件の分析で「役員・専属ドライバー系」が32%を占めていた。
 *   ・「役員ドライバー」はそれ単体では大阪府14,518件と超大型市場（埋もれる前提のキーワード
 *     だが、過去に実際の内定に繋がった実証済みキーワードのため、無理に絞らずそのまま使う）。
 *   ・既存の14件/16件の内訳から2件ずつを振替て導入（総数は変えない）。
 *
 * 件数の振替（総数は変えない）:
 *   st: 職人送迎ドライバー(3→2)・商談送迎ドライバー(3→2)から1件ずつ → 役員送迎ドライバー2件
 *   yp: 経営コンサル訪問送迎ドライバー(3→2)・組織コンサル訪問送迎ドライバー(3→2)から1件ずつ
 *       → 役員送迎ドライバー2件
 *
 * nl・sl・amは対象外（役員との自然な接点が無い／既に好調のため）。
 * 求人ボックス側（scripts/lib/taxi-funnel-content.js）は変更しない（Indeed掲載のみが対象）。
 * 新職種の本文には「抵抗感の少なさ」の訴求も最初から織り込み済み。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/convert-indeed-to-yakuin-sougei-20261002.js             // ドライラン
 *   node --experimental-sqlite scripts/convert-indeed-to-yakuin-sougei-20261002.js --apply     // 実際に変換
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
const COMMON_BENEFIT = '各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給あり';
const COMMON_QUAL = '普通自動車運転免許（AT限定可）／未経験・ブランク歓迎・学歴不問';
const NEW_JOB_TYPE = '役員送迎ドライバー';

function extractArea(title) {
  const m = title.match(/^【(.+?)】/);
  return m ? m[1] : null;
}

const BUILD_DESC = {
  st: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、取引先企業・提携先の役員の送迎を担当する役員送迎ドライバーを募集します。商談・視察等での役員の移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・取引先・提携先企業役員の送迎
・商談・視察スケジュールに合わせた運行管理
・車両の清掃・日常点検

【この仕事の魅力】
◆ 役員クラスの方々と接する、落ち着いた環境のお仕事
◆ 送迎と簡単なご案内が中心で、本格的な秘書業務・同乗対応は不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】月給350,000円〜（経験・能力を考慮）
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`,
  yp: a => `経営者・役員層向けのエグゼクティブカウンセリング・経営コンサルティング・採用戦略コンサルティング・組織活性コンサルティングを手掛ける当社で、訪問先企業の役員の送迎を担当する役員送迎ドライバーを募集します。顧問先企業役員の移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・訪問先企業役員の送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ 役員クラスの方々と接する、落ち着いた環境のお仕事
◆ 送迎と簡単なご案内が中心で、本格的な秘書業務・同乗対応は不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`,
};

const SALARY = { st: '月給350,000円〜（経験・能力を考慮）', yp: '月給350,000円〜' };

// 会社ごとに「どの既存job_typeから1件ずつ振り替えるか」を指定（計2件→役員送迎ドライバー2件）
const DONORS = {
  st: ['職人送迎ドライバー', '商談送迎ドライバー'],
  yp: ['経営コンサル訪問送迎ドライバー', '組織コンサル訪問送迎ドライバー'],
};

async function main() {
  console.log(`\n=== st/yp Indeed求人に「役員送迎ドライバー」を追加${APPLY ? '（--apply・実際に変換）' : '（DRY-RUN）'} ===\n`);

  let totalConverted = 0;
  for (const co of Object.keys(DONORS)) {
    for (const donorType of DONORS[co]) {
      const job = db.prepare(
        `SELECT id, title, location FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%' LIMIT 1`
      ).get(co, donorType);

      if (!job) {
        console.log(`[${co}] 「${donorType}」の対象求人が見つかりません。スキップ`);
        continue;
      }

      const area = extractArea(job.title) || job.location;
      const newTitle = `【${area}】${NEW_JOB_TYPE}｜正社員・未経験歓迎・普通免許OK`;
      const newDescription = BUILD_DESC[co](area);
      const newCatchcopy = `${NEW_JOB_TYPE}（${area}）｜未経験歓迎・普通免許OK`;

      console.log(`[${co}] 「${donorType}」1件 → 「${NEW_JOB_TYPE}」に変換`);
      console.log(`  ${job.title.slice(0, 45)}`);
      console.log(`   →  ${newTitle}`);

      if (APPLY) {
        await Jobs.update(job.id, {
          title: newTitle,
          jobType: NEW_JOB_TYPE,
          description: newDescription,
          catchcopy: newCatchcopy,
          salary: SALARY[co],
          tags: ['未経験歓迎', '正社員', '普通免許OK', NEW_JOB_TYPE],
        });
      }
      totalConverted++;
    }
  }

  console.log(`\n合計: ${totalConverted}件${APPLY ? 'を変換しました' : 'を変換予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 総掲載数は変わりません（既存求人を役員送迎ドライバーに書き換えるのみ）。求人ボックス側は変更していません。');
}

main().catch(err => { console.error(err); process.exit(1); });
