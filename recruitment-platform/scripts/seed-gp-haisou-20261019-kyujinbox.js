#!/usr/bin/env node
'use strict';
/**
 * 株式会社五方（gp）／早朝・夜間 配送ドライバー2件（求人ボックス掲載・大阪）
 * 2026-10-19、ユーザー確認済みの配送ドライバー（早朝4:00〜13:00／夜間22:00〜翌7:00、深夜割増賃金・18歳以上）。
 * 条件は五方の既存求人と同じ：月収340,000円〜、年収500万円〜、完全週休2日制・シフト制、各種社会保険完備、会社車両使用、研修あり、試用期間なし。
 * 冪等: 今回のタイトル（company='gp'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-gp-haisou-20261019-kyujinbox.js
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
const { hashSeed } = require('./lib/kyujinbox-vary');

const COMPANY = 'gp';
const NOW = new Date().toISOString();
const TARGET_MEDIA = ['求人ボックス'];
const SALARY = '月収340,000円〜';
const IMAGE_URL = '/images/haisou-fleet.jpg';

const AREAS = [
  { area: '大阪市此花区西九条', city: '大阪府大阪市此花区西九条' },
  { area: '大阪市此花区高見', city: '大阪府大阪市此花区高見' },
];

function pick(pool, area, salt) { return pool[hashSeed(`${salt}|${area}`) % pool.length]; }

const BIZ = '当社は「超熟成製法 五方（GOHOU）」のブランドで、熟成させた魚「五方ぶり」などの食品や、熟成保存シートの企画・販売を行っています。';
const HOURS_N = '早朝勤務（4:00〜13:00）または夜間勤務（22:00〜翌7:00）から選択・実働8時間・休憩1時間／固定時間制\n※22:00〜翌5:00の勤務には、深夜割増賃金を支給します。\n※18歳未満の方は応募できません（22時以降の勤務があるため）。\n完全週休2日制\nシフト制・休み希望制';
const BENEFIT = '各種社会保険完備／交通費支給／会社車両を使用／車両・燃料は会社負担／研修あり／昇給あり／試用期間なし\n月収340,000円〜／年収500万円〜（経験・能力などを考慮して決定します）';
const TITLES = [
  a => `【${a}】早朝・夜間 配送ドライバー｜月収34万円〜・正社員・経験者優遇・深夜割増あり`,
  a => `【${a}】早朝・夜間の配送ドライバー（正社員）｜経験者優遇・普通免許OK・月収34万円〜`,
];
const body = a => `${a}周辺を拠点に、早朝・夜間の時間帯に、食品などの商品配送を担当するドライバーです。

${BIZ}

今回お任せするのは、熟成魚などの商品を、早朝や夜間の時間帯に、指定先へ届ける配送ドライバーの仕事です。鮮度が大切な商品のため、指定された時間に、丁寧に、確実にお届けします。

【具体的な仕事内容】
① 早朝の配送
・朝の時間帯に届ける商品の積み込み・配送、配送先・配送ルート・配送時間の確認、配送先での丁寧な受け渡し
② 夜間の配送
・夜間の時間帯に届ける商品の積み込み・配送、配送完了後の確認、車両の戻し
③ 配送スケジュールの確認
・配送先・配送時間、運行ルート・移動時間の確認、荷物の積み忘れや配送先の間違いの防止
④ 商品の取り扱いへの配慮
・商品の状態の確認（外装・数量など）、衛生面に配慮した取り扱い
⑤ 車両の清掃・日常点検・給油
※配送の具体的な内容や件数は、配送先や当日のスケジュールによって異なります。

【なぜ早朝・夜間の勤務があるの？】
食品は、受け取る側の営業や仕込みの時間に合わせて、早朝や夜間に届ける必要があります。そのため、その時間帯の配送のシフトを設けています。シフト制で、休憩もしっかり取れます（夜通しの無理な長時間勤務ではありません）。`;
const QUAL = '【必須条件】普通自動車運転免許（AT限定可）／18歳以上の方（22時以降の勤務があるため）\n【歓迎する経験・人物像】配送ドライバーの経験がある方／運転業務の経験がある方／安全運転を心掛けられる方／時間やルールを守れる方／早朝や夜間の時間帯の勤務にも対応できる方／商品や荷物を丁寧に扱える方／食品や衛生面に配慮して取り扱える方';

const JOBS = AREAS.map((ar, i) => {
  const title = TITLES[i % TITLES.length](ar.area);
  const description = `${body(ar.area)}

【勤務地】${ar.area}周辺
【勤務時間】${HOURS_N}
【給与】${SALARY}（年収500万円〜）
【待遇】${BENEFIT}
【応募資格】
${QUAL}

※${ar.area}周辺での募集です。ご応募確認後、担当者よりお電話にてご連絡いたします。`;
  return {
    title, location: ar.city, salary: SALARY, jobType: '早朝・夜間配送ドライバー', employmentType: '正社員',
    description, rewarding: '早朝・夜間の時間帯に、食品を丁寧に、確実にお届けする仕事です。深夜割増賃金も支給します。',
    worktimeHoliday: HOURS_N, transportation: '車通勤可能',
    tags: ['経験者優遇', '正社員', '普通免許OK', '早朝・夜間', '配送'],
    catchcopy: `早朝・夜間配送ドライバー（${ar.area}）｜経験者優遇・月収34万円〜｜深夜割増あり・普通免許OK`,
    imageUrl: IMAGE_URL, isPublished: true, publishedAt: NOW, targetMedia: TARGET_MEDIA, company: COMPANY,
  };
});

async function main() {
  console.log(`\n🚚 五方 早朝・夜間 配送ドライバー求人（求人ボックス・大阪）${JOBS.length}件 を登録します...\n`);
  const myTitles = new Set(JOBS.map(j => j.title));
  const existing = await Jobs.findAll();
  let removed = 0;
  for (const j of existing) { if (j.company === COMPANY && myTitles.has(j.title)) { await Jobs.delete(j.id); removed++; } }
  for (const job of JOBS) { await Jobs.create(job); console.log(`  ✅ 登録完了 [${job.jobType}]: ${job.title}`); }
  console.log(`\n📊 結果: 新規 ${JOBS.length}件（削除 ${removed}件）\n`);
}
main().catch(err => { console.error(err); process.exit(1); });
