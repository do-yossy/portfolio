#!/usr/bin/env node
'use strict';
/**
 * 「展示会配送ドライバー」求人（job_type='展示会配送ドライバー'）の原稿を改善版に更新する。
 *
 * 背景（2026-09-14〜09-15、ユーザー確認済み）:
 * ・有効応募率60.0%前後で複数日変化がなく、原稿改善が必要と判断。
 * ・実態: 決まった展示会場・取引先を回る／月収35万円以上・こなす件数により給与アップ。
 * ・既存求人は削除せず、対象求人のtitle/salary/descriptionのみを更新する（location/company/媒体は変更しない）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/update-tenjikai-haisou-driver-content.js          // DRY-RUN
 *   node --experimental-sqlite scripts/update-tenjikai-haisou-driver-content.js --apply  // 実際に更新
 */

const path = require('path');
const fs   = require('fs');

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

const APPLY = process.argv.includes('--apply');
const JOB_TYPE = '展示会配送ドライバー';
const SALARY = '月収350,000円以上（こなす件数に応じて給与アップ）';

function buildDescription(area) {
  return `【仕事内容】
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

※${area || 'ご相談'}周辺での募集です。まずはお気軽にご応募ください。`;
}

function buildTitle(area) {
  const prefix = area ? `【${area}】` : '';
  return `${prefix}展示会配送ドライバー｜月収35万円以上・件数に応じて給与アップ・正社員・普通免許OK`;
}

async function main() {
  const all = await Jobs.findAll();
  const targets = all.filter(j => j.job_type === JOB_TYPE || j.jobType === JOB_TYPE);

  console.log(`\n=== 展示会配送ドライバー求人 原稿更新${APPLY ? '（--apply・実際に反映）' : '（DRY-RUN）'} ===\n`);
  if (targets.length === 0) {
    console.log(`job_type="${JOB_TYPE}" に一致する求人が見つかりませんでした。\n`);
    console.log('※ 実際のjob_type文字列が異なる可能性があります。管理画面で該当求人のjob_typeを確認してください。\n');
    process.exit(0);
  }

  console.log(`対象: ${targets.length}件\n`);
  for (const j of targets) {
    // location文字列から末尾の都道府県以降(市区町村)をエリア表記に使う（無ければ空）
    const area = (j.location || '').replace(/^.*?[都道府県]/, '').trim() || j.location || '';
    const newTitle = buildTitle(area);
    const newDescription = buildDescription(area);

    const alreadyApplied = j.title === newTitle && j.salary === SALARY;

    console.log(`  [${j.company}] ${j.title}`);
    console.log(`    旧給与: ${j.salary}`);
    console.log(`    新給与: ${SALARY}`);
    console.log(`    新タイトル: ${newTitle}`);
    console.log(`    判定: ${alreadyApplied ? '★反映済み（変更なし）' : '未反映（title/salaryが改善版と不一致）'}`);
    console.log(`    ${APPLY ? '更新しました' : '(DRY-RUN・未反映)'}`);
    console.log('');

    if (APPLY) {
      await Jobs.update(j.id, { title: newTitle, salary: SALARY, description: newDescription });
    }
  }

  console.log(`${APPLY ? '完了' : '（DRY-RUN・未反映）'}: ${targets.length}件${APPLY ? 'を更新しました' : 'が対象です'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 対象求人のtitle/salary/descriptionのみ変更し、location・company・掲載媒体・掲載状態は一切変更していません。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
