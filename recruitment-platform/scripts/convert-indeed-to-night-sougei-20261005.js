#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】既存の送迎求人のうち一部を、深夜勤務の「夜間送迎ドライバー」に切り替える
 * （st/nl/sl 各2件・計6件）。2026-10-05、ユーザー確認：
 *   「深夜勤務はSL、NOWLIVE、STYLE501で可能」「掲載数は各社変えないようにして」
 * → 求人を新規に足さず、既存求人の一部を切り替えるので、各社のIndeed掲載数は変わらない。
 *
 * 切り替え元（旧名・新名のどちらの状態でも動く。finalize-indeed-taxi-funnel-20261002.js の前後どちらで実行してもよい）:
 *   st: 展示会スタッフ送迎ドライバー 1件、職人送迎ドライバー 1件
 *   nl: 催事スタッフ送迎ドライバー 1件、送迎ドライバー 1件
 *   sl: エステ送迎ドライバー 2件
 * 専属・配送は対象外。求人ボックス側は変更しない（Indeed専用）。
 *
 * 書いた条件（実際の運用と一致しているか、掲載前に必ず確認すること）:
 *   ・勤務時間 22:00〜翌7:00（実働8時間・休憩1時間）  ※ユーザー未確認の仮置き
 *   ・給与は各社の既存求人の基本給をそのまま使用し「深夜手当別途支給」と明記（金額を上乗せして書かない）
 *   ・応募は18歳以上（深夜は18歳未満不可）
 *
 * 冪等：会社ごとに job_type='夜間送迎ドライバー'（Indeed）が既にある場合は、不足分のみ切り替える。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/convert-indeed-to-night-sougei-20261005.js           // ドライラン
 *   node --experimental-sqlite scripts/convert-indeed-to-night-sougei-20261005.js --apply   // 実際に切り替え
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

const JOB_TYPE = '夜間送迎ドライバー';
const COMMON_BENEFIT = '各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給あり';
const HOURS = '22:00〜翌7:00';

const COMPANIES = [
  {
    co: 'st', count: 2,
    donors: [
      ['展示会スタッフ送迎ドライバー', '展示会場スタッフ送迎ドライバー', 'スタッフ送迎ドライバー'],
      ['職人送迎ドライバー'],
    ], base: '月給350,000円〜', label: '月給35万円〜',
    salary: '月給350,000円〜（経験・能力を考慮／深夜手当別途支給）',
    intro: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、夜間送迎ドライバーを募集します。当社スタッフ・関係者の夜間の移動（催事・展示会の準備や撤去の時間帯を含む）を、${a}周辺を中心にサポートします。`,
    duties: ['スタッフ・関係者の夜間の送迎', '催事・展示会の準備・撤去の時間帯の送迎サポート'],
    point: '催事・展示会の現場を、夜間の移動から支えるお仕事',
    reason: '催事・展示会の準備や撤去は夜間に行うことがあり、夜間の送迎に対応するため、深夜帯のシフトを設けています。',
    image: '/images/haisou-fleet.jpg',
  },
  {
    co: 'nl', count: 2,
    donors: [
      ['催事スタッフ送迎ドライバー', '移動販売車の回送ドライバー', '移動販売車の陸送ドライバー'],
      ['送迎ドライバー'],
    ], base: '月給340,000円〜', label: '月給34万円〜',
    salary: '月給340,000円〜（歩合・インセンティブにより上限なし／深夜手当別途支給）',
    intro: a => `関西のショッピングモールや商業施設を週替わりで回る、ベビーカステラ移動販売の当社で、夜間送迎ドライバーを募集します。催事スタッフの夜間の移動（設営・撤去の時間帯を含む）を、${a}周辺を中心にサポートします。`,
    duties: ['催事スタッフの夜間の送迎', '催事の設営・撤去の時間帯の送迎サポート'],
    point: '移動販売の催事を、夜間の移動から支えるお仕事',
    reason: '催事の設営・撤去は夜間になることがあり、夜間の送迎に対応するため、深夜帯のシフトを設けています。',
    image: '/images/nl-movingsales.png',
  },
  {
    co: 'sl', count: 2,
    donors: [
      ['エステ送迎ドライバー', '治療院・エステ通院送迎ドライバー'],
      ['エステ送迎ドライバー', '治療院・エステ通院送迎ドライバー'],
    ], base: '月収290,000円〜', label: '月収29万円〜',
    salary: '月収290,000円〜（深夜手当別途支給）',
    intro: a => `整骨院・治療院・エステサロンを運営する当社で、夜間送迎ドライバーを募集します。夜間にご来店・ご帰宅されるお客様の送迎を、${a}周辺を中心にサポートします。`,
    duties: ['夜間にご来店・ご帰宅されるお客様の送迎', '乗降時のサポート'],
    point: 'お客様の夜間の移動を、安全に支えるお仕事',
    reason: '夜の時間帯に送迎のご希望があるため、夜間の送迎に対応する深夜帯のシフトを設けています。',
    image: '/images/haisou-fleet.jpg',
  },
];

function describe(c, a) {
  return `★経験者優遇／普通免許（AT限定可）で応募OK
★深夜手当（22:00〜翌5:00）を別途支給
★${c.point}
★各種社会保険完備・車両燃料は会社負担・研修あり

仕事内容

${c.intro(a)}
入社後は研修で、安全運転・夜間運転の注意点・送迎ルートの管理・応対マナーをしっかり学べます。

なぜ夜間の勤務があるの？

${c.reason}
シフト制で、休憩もしっかり取れます（夜通しの無理な長時間勤務ではありません）。

▼主な業務
${c.duties.map(d => `    •    ${d}`).join('\n')}
    •    送迎スケジュールの確認
    •    車両の清掃・日常点検

▼勤務条件
    •    勤務地：${a}周辺
    •    勤務時間：${HOURS}（実働8時間・休憩1時間）
    •    勤務日数：シフト制（ご希望は面談時にご相談ください）
    •    ※18歳未満の方は応募できません
【給与】${c.salary}
【待遇】${COMMON_BENEFIT}

▼応募資格
    •    普通自動車運転免許（AT限定可）
    •    送迎・運転業務のご経験がある方（経験者優遇）
    •    夜間の勤務が可能な方（18歳以上）
    •    安全運転を心がけられる方

▼こんな方におすすめ
    •    日中に別の予定がある方（家庭・学業・副業など）
    •    夜の時間帯の方が落ち着いて働ける方
    •    運転が好きな方
    •    人をサポートする仕事がしたい方

※${a}周辺での募集です。`;
}

async function main() {
  console.log(`\n=== Indeed 送迎求人 → 夜間送迎ドライバー（深夜勤務）への切り替え${APPLY ? '（--apply・実際に切り替え）' : '（DRY-RUN）'} ===\n`);
  let converted = 0;
  for (const c of COMPANIES) {
    const total = db.prepare(`SELECT COUNT(*) n FROM jobs WHERE company = ? AND target_media LIKE '%indeed%'`).get(c.co).n;
    const have = db.prepare(
      `SELECT COUNT(*) n FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`
    ).get(c.co, JOB_TYPE).n;
    let need = c.count - have;
    console.log(`[${c.co}] Indeed掲載${total}件／夜間送迎 既存${have}件 → 切り替え${Math.max(need, 0)}件`);
    const taken = new Set();
    for (const types of c.donors) {
      if (need <= 0) break;
      const ph = types.map(() => '?').join(',');
      const rows = db.prepare(
        `SELECT id, title, location FROM jobs WHERE company = ? AND job_type IN (${ph}) AND target_media LIKE '%indeed%' ORDER BY id DESC`
      ).all(c.co, ...types).filter(r => !taken.has(r.id));
      const row = rows[0];
      if (!row) { console.log(`  ⚠️ 切り替え元が見つかりません: ${types[0]}`); continue; }
      taken.add(row.id);
      const area = (row.title.match(/^【(.+?)】/) || [])[1] || row.location;
      const update = {
        title: `【${area}】夜間送迎ドライバー｜正社員・深夜手当あり・経験者優遇・${c.label}`,
        jobType: JOB_TYPE,
        salary: c.salary,
        description: describe(c, area),
        catchcopy: `${JOB_TYPE}（${area}）｜深夜手当あり・経験者優遇・${c.label}`,
        worktimeHoliday: `${HOURS}（実働8時間・休憩1時間）\nシフト制`,
        tags: ['経験者優遇', '正社員', '普通免許OK', '深夜手当あり', JOB_TYPE],
        imageUrl: c.image,
      };
      console.log(`  切替: ${row.title.slice(0, 44)}`);
      console.log(`   →  ${update.title}`);
      if (APPLY) await Jobs.update(row.id, update);
      converted++; need--;
    }
  }
  console.log(`\n合計: ${converted}件${APPLY ? 'を切り替えました' : 'を切り替え予定（DRY-RUN）'}（各社のIndeed掲載数は変わりません）`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ DB更新のみ。Indeed管理画面の該当求人も同じ内容に直してください。勤務時間・深夜手当・休憩は実際の運用と照合してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
