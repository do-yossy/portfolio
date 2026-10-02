#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】st・ypの送迎系7求人（専属・配送除く）を、最終的に
 * 「スタッフ送迎ドライバー」「お客様送迎ドライバー」の2種類に統一する。
 * 2026-10-02、ユーザー確認済み：
 *   「あくまでもスタッフ送迎とかお客さんの送迎とかそういう仕事」
 *   「役員運転手と役員送迎ドライバーもなし」
 *   （前段で検討した「役員ドライバー」「役員運転手」「ハイヤードライバー」
 *    「役員送迎ドライバー」は全て不採用。特に「ハイヤードライバー」は普通二種免許が
 *    法的に必要な業務区分であり、AT限定の普通免許でOKとする内容と矛盾するため
 *    使用しない。「役員」系の呼称も、実態が役員でなくスタッフ・一般のお客様の
 *    送迎であるケースが多く、不正確なため使わない。）
 *
 * このスクリプトは、以下のどの段階からでも正しい最終形に収束するよう、
 * 元のjob_type・中間段階のjob_type（役員ドライバー等）のどちらも対象にする。
 *
 * 新しい2職種（大阪府で実証済み・法的に問題のない一般的な表現）:
 *   スタッフ送迎ドライバー（大阪府27,868件）
 *   お客様送迎ドライバー（大阪府18,584件）
 *
 * 割り当て（元の業務内容に忠実に）:
 *   st: 職人送迎ドライバー（職人＝自社スタッフ）         → スタッフ送迎ドライバー
 *   st: 商談送迎ドライバー（バイヤー＝お客様）            → お客様送迎ドライバー
 *   st: 催事送迎ドライバー（展示会スタッフ）              → スタッフ送迎ドライバー
 *   yp: 経営者カウンセリング送迎ドライバー（経営者＝お客様） → お客様送迎ドライバー
 *   yp: 経営コンサル訪問送迎ドライバー（経営者＝お客様）    → スタッフ送迎ドライバー（表現の重複回避）
 *   yp: 採用コンサル訪問送迎ドライバー（企業人事＝お客様）  → お客様送迎ドライバー
 *   yp: 組織コンサル訪問送迎ドライバー（企業人事＝お客様）  → スタッフ送迎ドライバー（表現の重複回避）
 *
 * 専属ドライバー・配送系・展示会配送ドライバーは対象外（現状維持）。
 * 経験者優遇・月給35万円〜の訴求は維持（タイトルのみ「役員」系から変更）。
 * 求人ボックス側（scripts/lib/taxi-funnel-content.js）は変更しない。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/convert-indeed-to-staff-customer-sougei-20261002.js             // ドライラン
 *   node --experimental-sqlite scripts/convert-indeed-to-staff-customer-sougei-20261002.js --apply     // 実際に変換
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
const QUAL_YAKUIN = '普通自動車運転免許（AT限定可）／送迎・運転業務のご経験がある方歓迎';

function extractArea(title) {
  const m = title.match(/^【(.+?)】/);
  return m ? m[1] : null;
}

// 旧job_type（元のタイトル名・中間段階の役員系タイトルの両方）→ 最終的な割り当てを定義。
// 「どのタイトルから来たか」で元の業務文脈を判定し、本文の自然さを保つ。
const PATCHES = [
  // ---- st ----
  {
    co: 'st', oldTypes: ['職人送迎ドライバー', '役員ドライバー'], finalType: 'スタッフ送迎ドライバー', salary: '月給350,000円〜（経験・能力を考慮）',
    buildDescription: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、スタッフ送迎ドライバーを募集します。職人の工房〜展示会場・取引先間の移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・職人の工房〜展示会場・取引先間の送迎
・車内での道具・作品の取り扱いサポート
・車両の清掃・日常点検

【この仕事の魅力】
◆ 伝統工芸の現場を間近で知ることができる
◆ 送迎と簡単なサポートが中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜（経験・能力を考慮）
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'st', oldTypes: ['商談送迎ドライバー', '役員運転手'], finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜（経験・能力を考慮）',
    buildDescription: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、お客様送迎ドライバーを募集します。バイヤー・取引先関係者との商談・工房見学等でのお客様の移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・バイヤー・取引先関係者（お客様）の送迎
・商談先・工房見学先までの案内サポート
・車両の清掃・日常点検

【この仕事の魅力】
◆ さまざまな業界のお客様と接する機会がある
◆ 送迎と簡単なご案内が中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜（経験・能力を考慮）
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'st', oldTypes: ['催事送迎ドライバー', 'ハイヤードライバー'], finalType: 'スタッフ送迎ドライバー', salary: '月給350,000円〜（経験・能力を考慮）',
    buildDescription: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、スタッフ送迎ドライバーを募集します。展示会・催事スタッフの送迎を、${a}周辺の会場までサポートするお仕事です。

【主な業務】
・展示会場スタッフの送迎
・会場での搬入サポート（運転以外の業務も一部あり）
・車両の清掃・日常点検

【この仕事の魅力】
◆ 展示会の現場を裏側から支えるポジション
◆ 送迎と簡単なサポートが中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜（経験・能力を考慮）
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  // ---- yp ----
  {
    co: 'yp', oldTypes: ['経営者カウンセリング送迎ドライバー'], finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜',
    buildDescription: a => `経営者・役員層向けのエグゼクティブ・カウンセリング事業を手掛ける当社で、お客様送迎ドライバーを募集します。カウンセラーの訪問先（経営者・役員等のお客様）への移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・カウンセラーの訪問先（お客様）までの送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ さまざまなお客様と接する機会がある、落ち着いた環境のお仕事
◆ 送迎と簡単なご案内が中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', oldTypes: ['経営コンサル訪問送迎ドライバー', '役員運転手'], finalType: 'スタッフ送迎ドライバー', salary: '月給350,000円〜',
    buildDescription: a => `経営者・役員層向けの経営コンサルティング事業を手掛ける当社で、スタッフ送迎ドライバーを募集します。コンサルタントの訪問先への移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・コンサルタントの訪問先までの送迎
・訪問スケジュールに合わせた運行管理
・車内での対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ 経営の現場を間近で知ることができる
◆ 送迎と簡単なご案内が中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', oldTypes: ['採用コンサル訪問送迎ドライバー', 'ハイヤードライバー'], finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜',
    buildDescription: a => `企業の採用戦略コンサルティング事業を手掛ける当社で、お客様送迎ドライバーを募集します。コンサルタントの企業訪問（お客様先）を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・コンサルタントの訪問先（企業・人事部門等のお客様）までの送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ さまざまな企業の採用現場に関わる機会がある
◆ 送迎と簡単なご案内が中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', oldTypes: ['組織コンサル訪問送迎ドライバー', '役員ドライバー'], finalType: 'スタッフ送迎ドライバー', salary: '月給350,000円〜',
    buildDescription: a => `企業の組織活性・人財活用コンサルティング事業を手掛ける当社で、スタッフ送迎ドライバーを募集します。コンサルタントの企業訪問を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・コンサルタントの訪問先までの送迎
・訪問スケジュールに合わせた運行管理
・車内での対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ 組織づくりの現場に関わる機会がある
◆ 送迎と簡単なご案内が中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
];

// 役員送迎ドライバー（convert-indeed-to-yakuin-sougei-20261002.js由来）もお客様送迎ドライバーへ
const YAKUIN_SOUGEI_PATCH = {
  st: { finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜（経験・能力を考慮）',
    buildDescription: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、お客様送迎ドライバーを募集します。取引先企業の方の送迎を、商談・視察等で${a}周辺を中心にサポートするお仕事です。

【主な業務】
・取引先企業の方（お客様）の送迎
・商談・視察スケジュールに合わせた運行管理
・車両の清掃・日常点検

【この仕事の魅力】
◆ さまざまなお客様と接する、落ち着いた環境のお仕事
◆ 送迎と簡単なご案内が中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜（経験・能力を考慮）
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。` },
  yp: { finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜',
    buildDescription: a => `経営者・役員層向けのエグゼクティブカウンセリング・経営コンサルティング・採用戦略コンサルティング・組織活性コンサルティングを手掛ける当社で、お客様送迎ドライバーを募集します。顧問先企業の方の送迎を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・訪問先企業の方（お客様）の送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ さまざまなお客様と接する、落ち着いた環境のお仕事
◆ 送迎と簡単なご案内が中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。` },
};

async function patchOne(job, finalType, buildDescription, salary) {
  const area = extractArea(job.title) || job.location;
  const newTitle = `【${area}】${finalType}｜正社員・経験者優遇・月給35万円〜`;
  const newDescription = buildDescription(area);
  const newCatchcopy = `${finalType}（${area}）｜経験者優遇・月給35万円〜`;

  console.log(`  ${job.title.slice(0, 45)}`);
  console.log(`   →  ${newTitle}`);

  if (APPLY) {
    await Jobs.update(job.id, {
      title: newTitle,
      jobType: finalType,
      description: newDescription,
      catchcopy: newCatchcopy,
      salary,
      tags: ['経験者優遇', '正社員', '普通免許OK', finalType],
    });
  }
}

async function main() {
  console.log(`\n=== st/yp Indeed求人を「スタッフ送迎ドライバー」「お客様送迎ドライバー」に統一${APPLY ? '（--apply・実際に変換）' : '（DRY-RUN）'} ===\n`);

  let total = 0;
  for (const patch of PATCHES) {
    const placeholders = patch.oldTypes.map(() => '?').join(',');
    const jobs = db.prepare(
      `SELECT id, title, location, job_type FROM jobs WHERE company = ? AND job_type IN (${placeholders}) AND target_media LIKE '%indeed%'`
    ).all(patch.co, ...patch.oldTypes);

    console.log(`[${patch.co}] ${patch.oldTypes.join('／')} → ${patch.finalType}: ${jobs.length}件`);
    for (const job of jobs) {
      await patchOne(job, patch.finalType, patch.buildDescription, patch.salary);
      total++;
    }
  }

  // 役員送迎ドライバー（別スクリプト由来）もお客様送迎ドライバーへ統一
  for (const co of Object.keys(YAKUIN_SOUGEI_PATCH)) {
    const jobs = db.prepare(
      `SELECT id, title, location FROM jobs WHERE company = ? AND job_type = '役員送迎ドライバー' AND target_media LIKE '%indeed%'`
    ).all(co);
    console.log(`[${co}] 役員送迎ドライバー → ${YAKUIN_SOUGEI_PATCH[co].finalType}: ${jobs.length}件`);
    for (const job of jobs) {
      await patchOne(job, YAKUIN_SOUGEI_PATCH[co].finalType, YAKUIN_SOUGEI_PATCH[co].buildDescription, YAKUIN_SOUGEI_PATCH[co].salary);
      total++;
    }
  }

  console.log(`\n合計: ${total}件${APPLY ? 'を変換しました' : 'を変換予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 専属ドライバー・配送系・展示会配送ドライバーは対象外。求人ボックス側も変更していません。');
}

main().catch(err => { console.error(err); process.exit(1); });
