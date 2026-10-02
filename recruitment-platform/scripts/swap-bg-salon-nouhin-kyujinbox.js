#!/usr/bin/env node
'use strict';
/**
 * bg（Bigeyes）の求人ボックス掲載のうち、応募0件の「コスメ配送ドライバー」（一般的な
 * ルート配送ドライバー表記）を、実際の取引先に即した「サロン納品ドライバー」表記に
 * 入替える。2026-10-02、ユーザー確認済み：
 *   「その内容で応募が来ていないから作り直して」
 *
 * 背景（調査結果）：
 *   ・現行の「ルート配送ドライバー」系タイトルは求人ボックスで879〜1,070件とヒットし、
 *     一般的な「配送ドライバー」に埋もれて差別化できていない。
 *   ・実際の取引先（サロン・ドラッグストア・化粧品取扱店）に即した「サロン納品ドライバー」
 *     表記は大阪府で233件と、ニッチながら検索need自体は十分にある規模であることを確認。
 *   ・給与等の事実関係（月給390,000円〜450,000円、会社車両完備等）は変更しない。
 *     変えるのはタイトル・本文の「配送」→「サロン納品」への寄せのみ。
 *   ・新しい文面は scripts/lib/kyujinbox-vary-bgst.js の bg_salon_nouhin ファミリーを使用。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/swap-bg-salon-nouhin-kyujinbox.js             // ドライラン
 *   node --experimental-sqlite scripts/swap-bg-salon-nouhin-kyujinbox.js --apply     // 実際に入替
 *   node --experimental-sqlite scripts/swap-bg-salon-nouhin-kyujinbox.js --apply --limit 10
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
const vary = require('./lib/kyujinbox-vary-bgst');
const { Jobs } = require('../db-factory');

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LIMIT = parseInt(val('--limit', '25'), 10) || 25;

const COMPANY = 'bg';
const OLD_JOB_TYPE = 'コスメ配送ドライバー';
const NEW_JOB_TYPE = 'サロン納品ドライバー';
const SALARY = '月給390,000円〜450,000円';
const QUALIFICATIONS = '普通自動車運転免許（AT限定可）／未経験歓迎・学歴不問';
const BENEFIT = '昇給・賞与あり（前年度実績あり）／通勤手当支給／社会保険完備／交通費支給／定期健康診断／有給休暇制度あり';
const WORKTIME = 'シフト制（実働8時間／休憩1時間）10:00～19:00／完全週休二日制／年次有給休暇・長期休暇・産休育休・夏季休暇・介護休暇・年間休日120日';
const TRANSPORTATION = '車通勤可能／転勤なし';
const REWARDING = '日勤専属で生活リズムが安定／固定ルート中心で未経験でも始めやすい／車両・ガソリン代など完全会社負担／コスメ業界を支える安定企業';
const HOW_TO_APPLY = 'ご応募確認後、採用受付代行担当者よりお電話にてご連絡いたします。';

// job_metrics 最新スナップショットを求人ごとに集約（既存のswap-kyujinbox-taxi-funnel.jsと同じ考え方）
const metricsRows = db.prepare(`SELECT * FROM job_metrics`).all();
const latestByKey = new Map();
for (const r of metricsRows) {
  const key = r.job_id ? `id:${r.job_id}` : `num:${r.company}:${r.job_number}`;
  const cur = latestByKey.get(key);
  if (!cur || String(r.collected_at) > String(cur.collected_at)) latestByKey.set(key, r);
}

async function main() {
  console.log(`\n=== bg（Bigeyes）求人ボックス入替: サロン納品ドライバーへの置き換え${APPLY ? '（--apply・実際に入替）' : '（DRY-RUN）'} ===\n`);

  const jobs = db.prepare(
    `SELECT id, title, location, kyujinbox_job_number FROM jobs WHERE is_published = 1 AND target_media LIKE '%求人ボックス%' AND company = ? AND job_type = ?`
  ).all(COMPANY, OLD_JOB_TYPE);

  const zeroApp = jobs.filter(j => {
    const byId = latestByKey.get(`id:${j.id}`);
    const byNum = j.kyujinbox_job_number ? latestByKey.get(`num:${COMPANY}:${j.kyujinbox_job_number}`) : null;
    const metric = byId || byNum;
    return metric && Number(metric.applies) === 0;
  });

  const targetCount = Math.min(zeroApp.length, LIMIT);
  console.log(`[bg] 「${OLD_JOB_TYPE}」掲載中: ${jobs.length}件 / 応募0件（実績取得済み）: ${zeroApp.length}件 / 今回入替: ${targetCount}件\n`);

  const targets = zeroApp.slice(0, targetCount);
  let removed = 0, created = 0;
  for (const oldJob of targets) {
    // エリア名は既存の勤務地（location）から「市区・地区」部分を抽出して再利用し、
    // 入替後も同じ勤務地での掲載として扱う。
    const areaLabel = oldJob.location.replace(/^(大阪府|兵庫県|京都府|滋賀県)/, '');
    const v = vary.build('bg_salon_nouhin', areaLabel);

    const newJob = {
      title: v.title,
      location: oldJob.location,
      salary: SALARY,
      jobType: NEW_JOB_TYPE,
      employmentType: '正社員',
      description: `${v.description}\n\n【応募資格】${QUALIFICATIONS}\n【待遇】${BENEFIT}\n【給与】${SALARY}`,
      tags: ['未経験歓迎', '正社員', '普通免許OK', NEW_JOB_TYPE],
      catchcopy: v.catchcopy,
      imageUrl: '/images/cosme-haisou.jpg',
      isPublished: true,
      publishedAt: new Date().toISOString(),
      targetMedia: ['求人ボックス'],
      company: COMPANY,
      rewarding: REWARDING,
      worktimeHoliday: WORKTIME,
      transportation: TRANSPORTATION,
      howToApply: HOW_TO_APPLY,
    };

    console.log(`  削除: ${oldJob.title.slice(0, 50)}`);
    console.log(`  → 作成: [${NEW_JOB_TYPE}] ${newJob.title}`);

    if (APPLY) {
      db.prepare('DELETE FROM jobs WHERE id=?').run(oldJob.id);
      await Jobs.create(newJob);
    }
    removed++;
    created++;
  }

  console.log(`\n[bg] ${APPLY ? '入替完了' : '（DRY-RUN）'}: 削除${removed}件 / 作成${created}件`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 給与・待遇等の事実関係は変更していません（タイトル・本文を「サロン納品」表記に変更のみ）。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
