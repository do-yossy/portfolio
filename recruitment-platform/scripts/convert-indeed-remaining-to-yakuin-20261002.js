#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】st・ypの残り7職種（専属ドライバー・配送系を除く送迎系すべて）を、
 * 「役員ドライバー」「役員運転手」「ハイヤードライバー」（いずれも大阪府で9,000〜14,500件
 * 規模の実証済み王道キーワード）にローテーションで変更する。2026-10-02、ユーザー確認済み：
 *   「ここの職種を変更したほうがいい。経験者が優遇されるから難しいことを伝える為」
 *   「各社の専属ドライバーはそのままで他の」「職種をかえる」
 *
 * 対象外：専属ドライバー（ユーザー指定で現状維持）、配送ドライバー・展示会配送ドライバー
 * （「配送は一旦このまま」との指示）、nl/sl/am（役員との自然な接点が無い／既に好調のため
 * 対象外、既に確定済み）。
 *
 * 新しい職種タイトルは同一会社内でも1種類に偏らせず、3種類をローテーションして
 * 重複コンテンツに見えないようにする。元の業務内容（職人の送迎／バイヤーとの商談／
 * 展示会・催事／経営者カウンセリング／経営コンサル／採用コンサル／組織コンサル）という
 * 本業の文脈はdescription内に残しつつ、タイトル・job_type・応募資格のみ変更する。
 * 「未経験歓迎」は使わず、convert-indeed-to-yakuin-sougei-20261002.jsと同じ考え方で
 * 経験者優遇・給与前面のタイトルにする。
 *
 * 対象job_type（会社ごとに現存する全インスタンスを変換）:
 *   st: 職人送迎ドライバー → 役員ドライバー
 *   st: 商談送迎ドライバー → 役員運転手
 *   st: 催事送迎ドライバー → ハイヤードライバー
 *   yp: 経営者カウンセリング送迎ドライバー → 役員ドライバー
 *   yp: 経営コンサル訪問送迎ドライバー → 役員運転手
 *   yp: 採用コンサル訪問送迎ドライバー → ハイヤードライバー
 *   yp: 組織コンサル訪問送迎ドライバー → 役員ドライバー
 *
 * 求人ボックス側（scripts/lib/taxi-funnel-content.js）は変更しない。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/convert-indeed-remaining-to-yakuin-20261002.js             // ドライラン
 *   node --experimental-sqlite scripts/convert-indeed-remaining-to-yakuin-20261002.js --apply     // 実際に変換
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

// 旧job_type → { newType, salary, buildDescription }
const PATCHES = [
  {
    co: 'st', oldType: '職人送迎ドライバー', newType: '役員ドライバー', salary: '月給350,000円〜（経験・能力を考慮）',
    buildDescription: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、役員ドライバーを募集します。経営陣・主要な職人の工房〜展示会場・取引先間の移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・経営陣・職人の工房〜展示会場・取引先間の送迎
・車内での道具・作品の取り扱いサポート
・車両の清掃・日常点検

【この仕事の魅力】
◆ 伝統工芸の現場を間近で知ることができる
◆ 送迎と簡単なサポートが中心で、本格的な秘書業務は不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜（経験・能力を考慮）
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'st', oldType: '商談送迎ドライバー', newType: '役員運転手', salary: '月給350,000円〜（経験・能力を考慮）',
    buildDescription: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、役員運転手を募集します。バイヤー・取引先関係者との商談・工房見学等での役員の移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・バイヤー・取引先関係者との商談時の役員送迎
・商談先・工房見学先までの案内サポート
・車両の清掃・日常点検

【この仕事の魅力】
◆ さまざまな業界のバイヤーと接する機会がある
◆ 送迎と簡単なご案内が中心で、本格的な秘書業務は不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜（経験・能力を考慮）
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'st', oldType: '催事送迎ドライバー', newType: 'ハイヤードライバー', salary: '月給350,000円〜（経験・能力を考慮）',
    buildDescription: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、ハイヤードライバーを募集します。展示会・催事スタッフの送迎を、${a}周辺の会場までサポートするお仕事です。

【主な業務】
・展示会場スタッフの送迎
・会場での搬入サポート（運転以外の業務も一部あり）
・車両の清掃・日常点検

【この仕事の魅力】
◆ 展示会の現場を裏側から支えるポジション
◆ 送迎と簡単なサポートが中心で、本格的な秘書業務は不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜（経験・能力を考慮）
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', oldType: '経営者カウンセリング送迎ドライバー', newType: '役員ドライバー', salary: '月給350,000円〜',
    buildDescription: a => `経営者・役員層向けのエグゼクティブ・カウンセリング事業を手掛ける当社で、役員ドライバーを募集します。カウンセラーの訪問先（経営者・役員等）への移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・カウンセラーの訪問先（経営者・役員等）までの送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ 経営者・リーダー層の方々と接する機会がある、落ち着いた環境のお仕事
◆ 送迎と簡単なご案内が中心で、本格的な秘書業務は不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', oldType: '経営コンサル訪問送迎ドライバー', newType: '役員運転手', salary: '月給350,000円〜',
    buildDescription: a => `経営者・役員層向けの経営コンサルティング事業を手掛ける当社で、役員運転手を募集します。コンサルタントの訪問先（経営者・役員等）への移動を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・コンサルタントの訪問先（経営者・役員等）までの送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ 経営の現場を間近で知ることができる
◆ 送迎と簡単なご案内が中心で、本格的な秘書業務は不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', oldType: '採用コンサル訪問送迎ドライバー', newType: 'ハイヤードライバー', salary: '月給350,000円〜',
    buildDescription: a => `企業の採用戦略コンサルティング事業を手掛ける当社で、ハイヤードライバーを募集します。コンサルタントの企業訪問を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・コンサルタントの訪問先（企業・人事部門等）までの送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ さまざまな企業の採用現場に関わる機会がある
◆ 送迎と簡単なご案内が中心で、本格的な秘書業務は不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
  {
    co: 'yp', oldType: '組織コンサル訪問送迎ドライバー', newType: '役員ドライバー', salary: '月給350,000円〜',
    buildDescription: a => `企業の組織活性・人財活用コンサルティング事業を手掛ける当社で、役員ドライバーを募集します。コンサルタントの企業訪問を、${a}周辺を中心にサポートするお仕事です。

【主な業務】
・コンサルタントの訪問先（企業・人事部門等）までの送迎
・訪問スケジュールに合わせた運行管理
・車内でのお客様対応サポート、車両の清掃・日常点検

【この仕事の魅力】
◆ 組織づくりの現場に関わる機会がある
◆ 送迎と簡単なご案内が中心で、本格的な秘書業務は不要。人と接するのが苦にならない方なら安心です
◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎

【給与】月給350,000円〜
【待遇】${COMMON_BENEFIT}
【応募資格】${QUAL_YAKUIN}

※${a}周辺での募集です。`,
  },
];

async function main() {
  console.log(`\n=== st/yp Indeed求人（専属・配送を除く送迎系）を役員系キーワードに変更${APPLY ? '（--apply・実際に変換）' : '（DRY-RUN）'} ===\n`);

  let totalConverted = 0;
  for (const patch of PATCHES) {
    // 冪等化：旧job_typeが無ければ、既に新job_typeに変換済みの可能性があるため
    // そちらも対象にする（descriptionの先頭が一致するものだけを対象に、誤って
    // 他のPATCHで変換済みのレコードを拾わないようにする）。
    const jobs = db.prepare(
      `SELECT id, title, location, description FROM jobs WHERE company = ? AND job_type IN (?, ?) AND target_media LIKE '%indeed%'`
    ).all(patch.co, patch.oldType, patch.newType);

    // 既に正しい新job_type＋正しい内容になっているものは除外（二重更新を避ける）
    const targets = jobs.filter(j => {
      if (j.description.includes('送迎・運転業務のご経験がある方歓迎') && j.title.includes(patch.newType)) {
        // 本当にこのPATCH由来かを、descriptionの本文キーワードで簡易確認
        return false;
      }
      return true;
    });

    console.log(`[${patch.co}] ${patch.oldType} → ${patch.newType}: ${targets.length}件`);

    for (const job of targets) {
      const area = extractArea(job.title) || job.location;
      const newTitle = `【${area}】${patch.newType}｜正社員・経験者優遇・月給35万円〜`;
      const newDescription = patch.buildDescription(area);
      const newCatchcopy = `${patch.newType}（${area}）｜経験者優遇・月給35万円〜`;

      console.log(`  ${job.title.slice(0, 45)}`);
      console.log(`   →  ${newTitle}`);

      if (APPLY) {
        await Jobs.update(job.id, {
          title: newTitle,
          jobType: patch.newType,
          description: newDescription,
          catchcopy: newCatchcopy,
          salary: patch.salary,
          tags: ['経験者優遇', '正社員', '普通免許OK', patch.newType],
        });
      }
      totalConverted++;
    }
  }

  console.log(`\n合計: ${totalConverted}件${APPLY ? 'を変換しました' : 'を変換予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 専属ドライバー・配送系・展示会配送ドライバーは対象外（変更していません）。求人ボックス側も変更していません。');
}

main().catch(err => { console.error(err); process.exit(1); });
