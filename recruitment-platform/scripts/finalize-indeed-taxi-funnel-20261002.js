#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用・最終版】st/nl/am/sl/ypの元の求人（2026-09-29投入のオリジナル状態）を、
 * 一度で最終形に変換する統合スクリプト。2026-10-02、これまでの一連のユーザー確認の最終結論：
 *   ・タクシー推薦ファネルの狙い：「人を運ぶ・多少の接客はあるが抵抗感は少ない」求人で
 *     広く応募を集め、合わない方には電話で「経験者優遇で難しい」と伝えた上でタクシーを案内する。
 *     そのため「未経験歓迎」は使わず「経験者優遇」で統一する。
 *   ・「役員ドライバー」「役員運転手」「ハイヤードライバー」は不採用（ハイヤードライバーは
 *     普通二種免許が法的に必要な業務区分でありAT限定免許の条件と矛盾するため）。
 *   ・st/ypは実態（職人=スタッフ／バイヤー=お客様／展示会スタッフ=スタッフ／
 *     yp全職種=お客様＜経営者・役員・企業人事部門を訪問＞）に忠実に
 *     「スタッフ送迎ドライバー」「お客様送迎ドライバー」の2種類（ypはお客様のみ）に統一。
 *   ・nl/sl/amは職種名（job_type・タイトルの職種部分）は変更せず、「経験者優遇」表現のみ追加
 *     （sl「整骨院通院送迎」「治療院・エステ通院送迎」は「通院」を外した簡潔な名称にも変更。
 *     求人ボックス側で既にこの名称を使っているため統一）。
 *   ・専属ドライバー・配送ドライバー・展示会配送ドライバー・移動販売車の回送（→陸送に改称）は
 *     「未経験歓迎」のままで変更しない（配送は「一旦このまま」との指示）。
 *   ・amは唯一応募が伸びている会社だが、「経験者優遇への統一を優先」とのユーザー確認済み。
 *
 * 求人ボックス側（scripts/lib/taxi-funnel-content.js）は変更しない（Indeed掲載のみ対象）。
 * 冪等：どの段階（オリジナルのまま／途中まで変換済み）からでも正しい最終形に収束する。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/finalize-indeed-taxi-funnel-20261002.js             // ドライラン
 *   node --experimental-sqlite scripts/finalize-indeed-taxi-funnel-20261002.js --apply     // 実際に反映
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
const QUAL_EXP = '普通自動車運転免許（AT限定可）／送迎・運転業務のご経験がある方歓迎';

function extractArea(title) {
  const m = title.match(/^【(.+?)】/);
  return m ? m[1] : null;
}

// ===== グループA: st/ypをスタッフ送迎/お客様送迎に変換（タイトル・job_type・本文を全面差し替え）=====
// oldTypesには「オリジナル名」と「今日の試行錯誤で変換済みかもしれない中間名」を両方含める。
const RENAME_PATCHES = [
  {
    co: 'st', finalType: 'スタッフ送迎ドライバー', salary: '月給350,000円〜（経験・能力を考慮）',
    oldTypes: ['職人送迎ドライバー', '役員ドライバー'],
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
【応募資格】${QUAL_EXP}

※${a}周辺での募集です。`,
  },
  {
    co: 'st', finalType: 'スタッフ送迎ドライバー', salary: '月給350,000円〜（経験・能力を考慮）',
    oldTypes: ['展示会場スタッフ送迎ドライバー', '催事送迎ドライバー', 'ハイヤードライバー'],
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
【応募資格】${QUAL_EXP}

※${a}周辺での募集です。`,
  },
  {
    co: 'st', finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜（経験・能力を考慮）',
    oldTypes: ['バイヤー・関係者送迎ドライバー', '商談送迎ドライバー', '役員運転手', '役員送迎ドライバー'],
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
【応募資格】${QUAL_EXP}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜',
    oldTypes: ['経営者カウンセリング送迎ドライバー', '役員ドライバー'],
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
【応募資格】${QUAL_EXP}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜',
    oldTypes: ['経営コンサル訪問送迎ドライバー', '役員運転手'],
    buildDescription: a => `経営者・役員層向けの経営コンサルティング事業を手掛ける当社で、お客様送迎ドライバーを募集します。コンサルタントの訪問先（経営者・役員等のお客様）への移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・コンサルタントの訪問先（お客様）までの送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ 経営の現場を間近で知ることができる
◆ 送迎と簡単なご案内が中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_EXP}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜',
    oldTypes: ['採用コンサル訪問送迎ドライバー', 'ハイヤードライバー'],
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
【応募資格】${QUAL_EXP}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜',
    oldTypes: ['組織コンサル訪問送迎ドライバー'],
    buildDescription: a => `企業の組織活性・人財活用コンサルティング事業を手掛ける当社で、お客様送迎ドライバーを募集します。コンサルタントの企業訪問（お客様先）を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・コンサルタントの訪問先（企業・人事部門等のお客様）までの送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ 組織づくりの現場に関わる機会がある
◆ 送迎と簡単なご案内が中心で、本格的な接客スキルは不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_EXP}

※${a}周辺での募集です。`,
  },
];

// ===== グループB: nl/sl/amは職種名（job_type・タイトルの職種部分）は維持し、
//      「未経験歓迎」→「経験者優遇」のみ変更。slのみ名称を簡潔化（求人ボックス側と統一）。=====
const WORDING_PATCHES = [
  { co: 'nl', oldType: '送迎ドライバー', newType: '送迎ドライバー' },
  { co: 'sl', oldType: '整骨院通院送迎ドライバー', newType: '整骨院送迎ドライバー',
    descReplace: ['整骨院への通院送迎ドライバー', '整骨院への送迎ドライバー'] },
  { co: 'sl', oldType: '整骨院送迎ドライバー', newType: '整骨院送迎ドライバー' }, // 既に改称済みの場合
  { co: 'sl', oldType: '治療院・エステ通院送迎ドライバー', newType: 'エステ送迎ドライバー',
    descReplace: ['治療院・エステサロンへの通院送迎ドライバー', '治療院・エステサロンへの送迎ドライバー'] },
  { co: 'sl', oldType: 'エステ送迎ドライバー', newType: 'エステ送迎ドライバー' }, // 既に改称済みの場合
  { co: 'am', oldType: '登園送迎ドライバー', newType: '登園送迎ドライバー' },
  { co: 'am', oldType: '降園送迎ドライバー', newType: '降園送迎ドライバー' },
];

// nlの回送ドライバーは陸送ドライバーへ改称（求人ボックス側のKANSAI_AREAS命名と統一済みの考え方）
const NL_HAISO_PATCH = { co: 'nl', oldTypes: ['移動販売車の回送ドライバー', '移動販売車の陸送ドライバー'], newType: '移動販売車の陸送ドライバー' };

async function patchJob(job, newType, newTitlePrefix, buildDescription, salary) {
  const area = extractArea(job.title) || job.location;
  const titlePrefix = newTitlePrefix != null ? newTitlePrefix : '';
  const newTitle = `【${area}】${titlePrefix}${newType}｜正社員・経験者優遇・月給35万円〜`;
  const newDescription = buildDescription(area);
  const newCatchcopy = `${newType}（${area}）｜経験者優遇・月給35万円〜`;
  console.log(`  ${job.title.slice(0, 48)}`);
  console.log(`   →  ${newTitle}`);
  if (APPLY) {
    await Jobs.update(job.id, {
      title: newTitle, jobType: newType, description: newDescription,
      catchcopy: newCatchcopy, salary, tags: ['経験者優遇', '正社員', '普通免許OK', newType],
    });
  }
}

async function main() {
  console.log(`\n=== Indeed掲載 最終統合スクリプト${APPLY ? '（--apply・実際に反映）' : '（DRY-RUN）'} ===\n`);
  let total = 0;

  // --- グループA: st/yp ---
  for (const patch of RENAME_PATCHES) {
    const placeholders = patch.oldTypes.map(() => '?').join(',');
    const jobs = db.prepare(
      `SELECT id, title, location FROM jobs WHERE company = ? AND job_type IN (${placeholders}) AND target_media LIKE '%indeed%'`
    ).all(patch.co, ...patch.oldTypes);
    console.log(`[${patch.co}] ${patch.oldTypes.join('／')} → ${patch.finalType}: ${jobs.length}件`);
    for (const job of jobs) {
      await patchJob(job, patch.finalType, null, patch.buildDescription, patch.salary);
      total++;
    }
  }

  // --- グループB: nl/sl/am（文言のみ。既に経験者優遇済みのものはスキップ） ---
  for (const p of WORDING_PATCHES) {
    const jobs = db.prepare(
      `SELECT id, title, description, tags, job_type FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`
    ).all(p.co, p.oldType);
    if (jobs.length === 0) continue;
    console.log(`[${p.co}] ${p.oldType} → ${p.newType}（表現調整）: ${jobs.length}件`);
    for (const job of jobs) {
      if (job.title.includes('経験者優遇') && job.job_type === p.newType) {
        console.log(`  スキップ（既に対応済み）: ${job.title.slice(0, 40)}`);
        continue;
      }
      let newTitle = job.title.replace('未経験歓迎', '経験者優遇');
      if (p.newType !== p.oldType) newTitle = newTitle.replace(p.oldType, p.newType);
      let newDescription = job.description
        .replace('未経験・ブランク歓迎・学歴不問', '送迎・運転業務のご経験がある方歓迎')
        .replace(/◆ 普通免許（AT限定可）があればOK、未経験歓迎/, '◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎');
      if (p.descReplace) newDescription = newDescription.replace(p.descReplace[0], p.descReplace[1]);
      let tags;
      try {
        const arr = JSON.parse(job.tags || '[]');
        tags = arr.map(x => x === '未経験歓迎' ? '経験者優遇' : x);
      } catch { tags = ['経験者優遇', '正社員', '普通免許OK', p.newType]; }

      console.log(`  更新: ${job.title.slice(0, 48)}`);
      console.log(`   →  ${newTitle}`);
      if (APPLY) {
        await Jobs.update(job.id, { title: newTitle, jobType: p.newType, description: newDescription, tags });
      }
      total++;
    }
  }

  // --- nlの回送→陸送改称（給与・待遇等は変更なし、タイトル・job_typeのみ） ---
  {
    const placeholders = NL_HAISO_PATCH.oldTypes.map(() => '?').join(',');
    const jobs = db.prepare(
      `SELECT id, title, description, tags FROM jobs WHERE company = ? AND job_type IN (${placeholders}) AND target_media LIKE '%indeed%'`
    ).all(NL_HAISO_PATCH.co, ...NL_HAISO_PATCH.oldTypes);
    console.log(`[nl] ${NL_HAISO_PATCH.oldTypes.join('／')} → ${NL_HAISO_PATCH.newType}: ${jobs.length}件`);
    for (const job of jobs) {
      if (job.title.includes('経験者優遇') && job.title.includes('陸送ドライバー')) {
        console.log(`  スキップ（既に対応済み）: ${job.title.slice(0, 40)}`);
        continue;
      }
      const newTitle = job.title.replace('回送ドライバー', '陸送ドライバー').replace('未経験歓迎', '経験者優遇');
      const newDescription = job.description
        .replace(/回送/g, '陸送')
        .replace('未経験・ブランク歓迎・学歴不問', '送迎・運転業務のご経験がある方歓迎')
        .replace(/◆ 普通免許（AT限定可）があればOK、未経験歓迎/, '◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎');
      console.log(`  更新: ${job.title.slice(0, 48)}`);
      console.log(`   →  ${newTitle}`);
      if (APPLY) {
        await Jobs.update(job.id, {
          title: newTitle, jobType: NL_HAISO_PATCH.newType, description: newDescription,
          tags: ['経験者優遇', '正社員', '普通免許OK', NL_HAISO_PATCH.newType],
        });
      }
      total++;
    }
  }

  console.log(`\n合計: ${total}件${APPLY ? 'を更新しました' : 'を更新予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 専属ドライバー・配送ドライバー・展示会配送ドライバーは対象外（変更なし）。求人ボックス側も変更していません。');
}

main().catch(err => { console.error(err); process.exit(1); });
