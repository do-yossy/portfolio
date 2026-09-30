#!/usr/bin/env node
'use strict';
/**
 * Indeedへの新規追加（2026-09-29〜想定・ユーザー指示分）:
 *   ・st（Style501）：展示会配送ドライバー 1件
 *   ・nl（NOWLIVE）：移動販売の送迎ドライバー 1件
 *
 * 【重要】ここで作るのはDB上のjobsレコード（is_published=1, target_media=['indeed']）のみ。
 * 実際にIndeedへ掲載する作業（indeed_poster.py の実行、またはIndeed管理画面への手動投稿）は別途必要。
 * 既存求人は一切変更しない（追加のみ）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/seed-st-nl-indeed-add1each-20260929.js
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

const { Jobs } = require('../db-factory');
const NOW = new Date().toISOString();

// ── st: 展示会配送ドライバー（既存の改善版原稿と同じ内容を流用。update-tenjikai-haisou-driver-content.js準拠） ──
const ST_AREA = '大阪府東大阪市長田';
const ST_JOB = {
  title: `【${ST_AREA}】展示会配送ドライバー｜月収35万円以上・件数に応じて給与アップ・正社員・普通免許OK`,
  location: ST_AREA,
  salary: '月収350,000円以上（こなす件数に応じて給与アップ）',
  jobType: '展示会配送ドライバー',
  employmentType: '正社員',
  description: `【仕事内容】
決まった展示会場・取引先を回る、展示会配送ドライバーのお仕事です。固定のルートなので、未経験の方でも覚えやすく、安心して始められます。

【給与について】
月収35万円以上。こなす件数に応じて給与がアップする仕組みのため、頑張り次第で収入を伸ばせます。

【主な業務】
・決まった展示会場・取引先への荷物・什器の配送
・会場での搬入・荷下ろし
・伝票・記録の確認、車両の日常点検

【応募資格】
普通自動車運転免許（AT限定可）／未経験・ブランク歓迎・学歴不問

【待遇・福利厚生】
各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給・賞与あり

※${ST_AREA}周辺での募集です。まずはお気軽にご応募ください。`,
  tags: ['未経験歓迎', '正社員', '展示会配送ドライバー', '月収35万円以上', '普通免許OK'],
  catchcopy: `展示会配送ドライバー（${ST_AREA}）｜月収35万円以上・件数に応じて給与アップ｜正社員・普通免許OK`,
  imageUrl: '/images/haisou-fleet.jpg',
  isPublished: true,
  publishedAt: NOW,
  targetMedia: ['indeed'],
  company: 'st',
};

// ── nl: 移動販売の送迎ドライバー（seed-nl-osaka-kyoto-hyogo-mobile-sales-kyujinbox.js の内容を流用） ──
const NL_AREA = '大阪府吹田市江坂町';
const NL_SALARY = '月給340,000円〜（歩合・インセンティブにより上限なし）';
const NL_JOB = {
  title: `【${NL_AREA}】移動販売の送迎ドライバー｜月給34万円〜・歩合で上限なし・未経験歓迎・正社員`,
  location: NL_AREA,
  salary: NL_SALARY,
  jobType: '送迎ドライバー',
  employmentType: '正社員',
  description: `関西のショッピングモールや商業施設を週替わりで回る、ベビーカステラ移動販売の送迎ドライバーです。移動販売車（キッチンカー）や販売スタッフを、拠点から${NL_AREA}周辺の催事会場まで送り届け、営業中は現場のサポートも行っていただきます。

【会社について】
株式会社NOWLIVEは、関西のショッピングモールや商業施設を週替わりで回る、ベビーカステラの移動販売（催事販売）を展開しています。固定店舗を持たず、毎週いろいろな商業施設で営業するのが特徴で、その現場を支えているのが配送・送迎の仕事です。

【仕事内容】
・移動販売車・販売スタッフの会場までの送迎
・車両の清掃・日常点検・管理
・会場でのベビーカステラ販売・接客のサポート（運転以外の業務もあり）
・スケジュールに合わせた運行管理

【この仕事の魅力】
◆ 運転だけでなく、現場での接客サポートも含めた「移動販売を動かす」お仕事
◆ 歩合・インセンティブ制で、頑張り次第で収入に上限がない
◆ 毎週違う場所で働けるので、単調になりがちなドライバー業務とは一味違う
◆ 未経験・ブランクの方も歓迎、丁寧な対応ができれば経験不問

【給与】
${NL_SALARY}
・昇給あり
・交通費支給
・車両・燃料は会社負担

【勤務時間】
早番／9:30〜18:30　遅番／11:00〜20:00（実働8時間・休憩1時間）
シフト制。基本的に土日祝を含む勤務です。

【休日・休暇】
シフト制／月8〜10日休み・年次有給休暇（法定通り）

【応募資格】
普通自動車運転免許（AT限定可）／未経験・ブランク歓迎・学歴不問

【待遇・福利厚生】
各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／副業OK

※${NL_AREA}周辺での募集です。まずはお気軽にご応募ください。`,
  tags: ['未経験歓迎', '正社員', '普通免許OK', 'ブランクOK', '移動販売', '関西', '歩合'],
  catchcopy: `未経験歓迎｜移動販売の送迎ドライバー（${NL_AREA}）｜月給34万円〜・歩合で上限なし｜普通免許OK`,
  imageUrl: '/images/nl-movingsales.png',
  isPublished: true,
  publishedAt: NOW,
  targetMedia: ['indeed'],
  company: 'nl',
};

async function main() {
  console.log('\n=== Indeed新規追加（st:展示会配送ドライバー1件 / nl:移動販売送迎ドライバー1件） ===\n');
  const existing = await Jobs.findAll();
  for (const job of [ST_JOB, NL_JOB]) {
    if (existing.some(j => j.company === job.company && j.title === job.title)) {
      console.log(`  スキップ（既存同名あり）: [${job.company}] ${job.title}`);
      continue;
    }
    await Jobs.create(job);
    console.log(`  作成: [${job.company}] ${job.title}`);
  }
  console.log('\n完了。DB上には登録したが、Indeedへの実際の掲載（indeed_poster.py の実行、または手動投稿）は別途必要です。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
