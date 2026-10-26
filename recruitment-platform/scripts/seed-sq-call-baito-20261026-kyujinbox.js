#!/usr/bin/env node
'use strict';
/**
 * 【2026-10-26 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-sq-call-baito-20261023-kyujinbox と同一）。
 * SocialQuality（sq）／アルバイト「お客様対応スタッフ」（午前のみ・扶養内相談可）求人ボックス用 25件（大阪府内）
 * 2026-10-23。求人ボックスに既に掲載中の同求人（10/14掲載・時給1,300円・平日10〜13時）と本文・条件を同一にし、勤務地だけ変える。
 * 本文は、掲載中の求人（5922-7577-2900）の内容をそのまま使用。
 * 掲載中の求人はタイトルが全件同一だが、下書きの公開時にDBの求人とタイトルで突き合わせるため、先頭に【町名】を付けて区別する。
 * アクセス（最寄り駅から徒歩○分）は勤務地ごとに実態が違うため記載しない。
 * 勤務地は、既存のseed全件・DBと重複しない実在の町名のみ。
 * 冪等: 今回のタイトル（company='sq'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-sq-call-baito-20261026-kyujinbox.js
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

const COMPANY = 'sq';
const NOW = new Date().toISOString();
const TARGET_MEDIA = ['求人ボックス'];
const SALARY = '時給1,300円';
const IMAGE_URL = '/images/jobcat-office.jpg';

const AREAS = [
  { area: '東大阪市六万寺町', city: '大阪府東大阪市六万寺町' },
  { area: '八尾市陽光園', city: '大阪府八尾市陽光園' },
  { area: '守口市豊秀町', city: '大阪府守口市豊秀町' },
  { area: '寝屋川市石津南町', city: '大阪府寝屋川市石津南町' },
  { area: '枚方市長尾家具町', city: '大阪府枚方市長尾家具町' },
  { area: '高槻市大塚町', city: '大阪府高槻市大塚町' },
  { area: '茨木市宮元町', city: '大阪府茨木市宮元町' },
  { area: '箕面市瀬川', city: '大阪府箕面市瀬川' },
  { area: '岸和田市額原町', city: '大阪府岸和田市額原町' },
  { area: '和泉市黒鳥町', city: '大阪府和泉市黒鳥町' },
  { area: '松原市大堀', city: '大阪府松原市大堀' },
  { area: '大東市中垣内', city: '大阪府大東市中垣内' },
  { area: '摂津市別府', city: '大阪府摂津市別府' },
  { area: '河内長野市楠町西', city: '大阪府河内長野市楠町西' },
  { area: '東大阪市西堤本通西', city: '大阪府東大阪市西堤本通西' },
  { area: '八尾市高美町', city: '大阪府八尾市高美町' },
  { area: '守口市錦町', city: '大阪府守口市錦町' },
  { area: '寝屋川市三井南町', city: '大阪府寝屋川市三井南町' },
  { area: '枚方市宮之阪', city: '大阪府枚方市宮之阪' },
  { area: '高槻市大蔵司', city: '大阪府高槻市大蔵司' },
  { area: '茨木市竹橋町', city: '大阪府茨木市竹橋町' },
  { area: '箕面市坊島', city: '大阪府箕面市坊島' },
  { area: '岸和田市並松町', city: '大阪府岸和田市並松町' },
  { area: '和泉市室堂町', city: '大阪府和泉市室堂町' },
  { area: '松原市立部', city: '大阪府松原市立部' },
];

const DESCRIPTION = `お客様対応スタッフ(アルバイト)を募集します。
主な業務は、お客様への電話対応です。

【主な業務】
・お客様へのご連絡(架電):応募のお礼、ご応募内容のご確認、ご希望のヒアリング
・ご案内:お客様のご希望に合わせたご案内
・対応内容の記録:電話の結果や、お客様のご希望を、管理システム(スプレッドシート)に入力します
・簡単な事務作業:リストの確認、対応状況の整理 など

営業・テレアポ・コール・人材業界で身につけた経験を、そのまま活かせます。

研修・サポート体制
研修あり:入社後に、業務の流れ・電話対応の進め方・個人情報の取扱いを、最初に学べます。
トークスクリプトあり:電話での話し方や、案内の流れを、あらかじめ用意しています。経験者の方も、会社のやり方を確認してから、安心して始められます。

【応募資格】
・営業・テレアポ・コールセンター・人材業界のご経験がある方(経験者優遇)
・平日の午前(10:00〜13:00)に継続して働ける方
・丁寧な言葉づかいで、電話応対ができる方

【給与】
時給1,300円／交通費規定支給

【勤務時間・休日】
10:00〜13:00(実働3時間)・固定時間制／土日祝休み
※扶養内を希望する方は、面接時にご相談ください。`;

const WORKTIME = '勤務形態：固定時間制\n10:00〜13:00(実働3時間)\n土日祝休み\n※扶養内を希望する方は、面接時にご相談ください。';

const JOBS = AREAS.map(a => ({
  title: `【${a.area}】アルバイト・パート｜お客様対応スタッフ／午前だけ働ける！｜扶養内相談可`,
  location: a.city, salary: SALARY, jobType: '事務・受付', employmentType: 'アルバイト',
  description: DESCRIPTION, rewarding: '', worktimeHoliday: WORKTIME, transportation: '',
  tags: ['アルバイト', '扶養内相談可', '午前のみ', '土日祝休み', '経験を活かす', '研修あり'],
  catchcopy: '午前だけ働ける｜お客様対応スタッフ｜時給1,300円・扶養内相談可・土日祝休み',
  imageUrl: IMAGE_URL, isPublished: true, publishedAt: NOW, targetMedia: TARGET_MEDIA, company: COMPANY,
}));

async function main() {
  console.log(`\n📞 SocialQuality アルバイト お客様対応スタッフ（求人ボックス・大阪府内）${JOBS.length}件 を登録します...\n`);
  const myTitles = new Set(JOBS.map(j => j.title));
  const existing = await Jobs.findAll();
  let removed = 0;
  for (const j of existing) { if (j.company === COMPANY && myTitles.has(j.title)) { await Jobs.delete(j.id); removed++; } }
  if (removed) console.log(`  🧹 既存の同一バッチ ${removed}件 を削除（冪等・入れ直し）\n`);
  for (const job of JOBS) { await Jobs.create(job); console.log(`  ✅ 登録完了: ${job.title}`); }
  console.log(`\n📊 結果: 新規 ${JOBS.length}件（削除 ${removed}件）`);
  console.log('→ 掲載管理の SOCIAL QUALITY タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}
main().catch(err => { console.error(err); process.exit(1); });
