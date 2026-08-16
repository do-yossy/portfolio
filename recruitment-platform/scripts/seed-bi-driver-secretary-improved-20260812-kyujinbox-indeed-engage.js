#!/usr/bin/env node
'use strict';
/**
 * 【改善版】bi（company='bi'）代表専属の送迎ドライバー（＋かんたん秘書サポート）
 * 分析で bi=応募0 だったため改善：
 *  ・タイトルを "秘書兼ドライバー" → "送迎ドライバー/運転手" 主語に（検索されるキーワードへ）
 *  ・job_type='送迎ドライバー'（媒体の職種名も検索されやすく）
 *  ・応募条件を緩和：必須は普通免許のみ。PC・秘書業務は「未経験OK・入社後にお任せ」に後ろ倒し
 *  ・target_media = 求人ボックス＋Indeed＋engage（単一媒体→複数で母数UP）
 * 実行: node --experimental-sqlite scripts/seed-bi-driver-secretary-improved-20260812-kyujinbox-indeed-engage.js
 * 冪等: company='bi' かつ job_type='送迎ドライバー' の自タイトルのみ入れ直す（既存の秘書兼ドライバーは触らない）
 */
const path = require('path');
const fs = require('fs');
(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.trim(); if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('='); if (eq < 0) return;
    const key = line.slice(0, eq).trim(); const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { Jobs } = require('../db-factory');
const { hashSeed } = require('./lib/kyujinbox-vary');

const COMPANY = 'bi';
const NOW = new Date().toISOString();
const TARGET_MEDIA = ['求人ボックス', 'Indeed', 'engage'];
const JOB_TYPE = '送迎ドライバー';
const EMP_TYPE = '正社員';
const SALARY = '月給350,000円〜430,000円（経験・能力を考慮）';
const IMAGE_URL = '/images/bi-secretary-driver.jpg';

const TOKYO = ['世田谷区上馬2丁目', '目黒区碑文谷5丁目', '品川区旗の台4丁目', '大田区久が原3丁目', '港区南青山6丁目', '渋谷区初台1丁目', '新宿区北新宿2丁目', '中野区沼袋3丁目', '杉並区宮前4丁目', '豊島区長崎4丁目', '江東区大島5丁目', '板橋区蓮根2丁目'];
const OSAKA = ['大阪市中央区瓦町2丁目', '大阪市北区堂島2丁目', '大阪市西区新町3丁目', '大阪市天王寺区玉造本町', '大阪市淀川区宮原5丁目', '大阪市都島区片町2丁目', '大阪市福島区玉川2丁目', '大阪市阿倍野区帝塚山1丁目'];
const AREAS = [...TOKYO.map(a => ({ area: a, pref: '東京都', location: `東京都${a}` })), ...OSAKA.map(a => ({ area: a, pref: '大阪府', location: `大阪府${a}` }))];

const pick = (pool, area, salt) => pool[hashSeed(`${salt}|${area}`) % pool.length];

const TITLE_CORE = [
  '社長専属ドライバー（送迎メイン＋かんたん秘書サポート）｜未経験歓迎・普通免許OK｜月給35〜43万・完全週休2日',
  '運転手（代表専属の送迎）｜未経験OK・普通免許でOK｜月給35万〜43万・週休2日・9〜18時｜PC不問',
  'ドライバー／代表の送迎＋簡単なサポート｜未経験歓迎・普通免許のみでOK｜月給35〜43万・転勤なし',
];
const INTRO = [
  a => `${a}周辺で、代表専属の送迎ドライバーを募集します。運転がメイン、慣れてきたら簡単なサポート業務もお任せします（未経験歓迎）。`,
  a => `${a}を中心に、代表を安全に送迎するドライバーのお仕事です。特別な経験は不要、普通免許があればOK。`,
  a => `${a}周辺での送迎ドライバー。まずは運転から。スケジュール確認や連絡などの簡単なサポートは入社後に少しずつお任せします。`,
];

const BODY = (a) =>
`代表専属の送迎ドライバーとして、安全な運転をメインにお任せします。運転に慣れてきたら、スケジュール確認や連絡対応など“かんたんなサポート業務”も少しずつお願いしますが、未経験からで大丈夫です。まずは「安全に送迎できること」を大切にしています。

【お任せする仕事（まずは運転から）】
・代表の送迎（東京・大阪を中心。状況により出張あり）
・車両の管理、洗車、日常点検
・目的地までのルート確認・安全運転
・（慣れてきたら）スケジュール確認・電話/メールの取次ぎ・かんたんな手配など
※運転がメインです。サポート業務は入社後にお任せするので、事務や秘書の経験は不要です。

【未経験歓迎・こんな方に】
・運転が好きな方／安全運転を心がけられる方
・普通自動車免許（AT限定可）をお持ちの方（必須はこれだけ）
・人当たりがよく、丁寧な対応ができる方
※PC操作・秘書経験・学歴は不問。ドライバー経験や接客経験がある方は活かせます。

【この仕事の魅力】
◎運転メインで未経験から始めやすい
◎代表の近くで仕事の進め方を学べる
◎慣れれば秘書サポートまで幅広いスキルが身につく
◎長期で安定して働ける環境

【応募資格】
普通自動車運転免許（AT限定可）　※必須はこれだけ
未経験歓迎・学歴不問（PC操作・秘書経験は不要）

【勤務地】
${a}周辺　※東京・大阪への送迎・出張あり

【勤務時間】
9:00〜18:00（実働8時間）※代表のスケジュールに応じて変動する場合があります。

【給与】
月給35万円〜43万円（経験・能力を考慮のうえ決定）／賞与：年2回（業績による）／昇給：年1回

【休日・休暇】
完全週休2日制／祝日／GW・夏季・年末年始休暇／有給休暇／慶弔休暇

【福利厚生】
各種社会保険完備／交通費支給／時間外手当／健康診断／社用車貸与／携帯電話・PC貸与`;

const JOBS = AREAS.map(a => ({
  title: `【${a.area}】${pick(TITLE_CORE, a.area, 'bi_drv:title')}`,
  location: a.location,
  salary: SALARY,
  jobType: JOB_TYPE,
  employmentType: EMP_TYPE,
  description: `${pick(INTRO, a.area, 'bi_drv:intro')(a.area)}\n\n${BODY(a.area)}\n\n※${a.area}周辺での募集です。運転が好きな方、まずはお気軽にご応募ください。`,
  tags: ['未経験歓迎', '普通免許OK', '送迎ドライバー', '運転手', 'PC不問', '完全週休2日制', '社用車貸与', '転勤なし', '賞与年2回'],
  catchcopy: `未経験歓迎・普通免許のみでOK｜代表専属の送迎ドライバー（${a.area}）｜月給35〜43万・完全週休2日・9〜18時｜PC/秘書経験は不要`,
  imageUrl: IMAGE_URL,
  isPublished: true,
  publishedAt: NOW,
  targetMedia: TARGET_MEDIA,
  company: COMPANY,
}));

async function main() {
  console.log(`\n🚗 bi 改善版・送迎ドライバー（求人ボックス＋Indeed＋engage）${JOBS.length}件 を登録します...\n`);
  const myTitles = new Set(JOBS.map(j => j.title));
  const existing = await Jobs.findAll();
  let removed = 0;
  for (const j of existing) {
    if (j.company === COMPANY && j.job_type === JOB_TYPE && myTitles.has(j.title)) { await Jobs.delete(j.id); removed++; }
  }
  if (removed) console.log(`  🧹 既存の同一タイトル ${removed}件 を削除（冪等・入れ直し）\n`);
  let added = 0;
  for (const job of JOBS) { await Jobs.create(job); console.log(`  ✅ 登録: ${job.title.slice(0, 52)}`); added++; }
  console.log(`\n📊 結果: 新規 ${added}件 / 合計 ${JOBS.length}件（削除 ${removed}件）`);
  console.log('→ 掲載管理の bi タブで、求人ボックス（投稿ボタン）／Indeed（3日ごと再掲載）／engage（半自動）に載せられます。\n');
}
main().catch(err => { console.error(err); process.exit(1); });
