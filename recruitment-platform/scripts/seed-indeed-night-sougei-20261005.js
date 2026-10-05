#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】深夜勤務の「夜間送迎ドライバー」を別求人として新規作成（sl/nl/st 各2件・計6件）。
 * 2026-10-05、ユーザー確認：「深夜勤務はSL、NOWLIVE、STYLE501で可能」
 *
 * 既存の日勤・時間選択制の送迎求人は変更しない（比較の基準として残す）。
 * 求人ボックス側は作らない（Indeed専用）。
 *
 * 書いた条件（実際の運用と一致しているか、掲載前に必ず確認すること）:
 *   ・勤務時間 22:00〜翌7:00（実働8時間・休憩1時間）  ※ユーザー未確認の仮置き
 *   ・給与は各社の既存求人の基本給をそのまま使用し「深夜手当別途支給」と明記（金額を上乗せして書かない）
 *   ・応募は18歳以上（深夜は18歳未満不可）
 *
 * 冪等：会社ごとに job_type='夜間送迎ドライバー'（Indeed）が既にある場合は不足分のみ作成する。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/seed-indeed-night-sougei-20261005.js           // ドライラン
 *   node --experimental-sqlite scripts/seed-indeed-night-sougei-20261005.js --apply   // 実際に作成
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
const { KANSAI_AREAS } = require('./lib/taxi-funnel-content');

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);
const APPLY = process.argv.includes('--apply');

const JOB_TYPE = '夜間送迎ドライバー';
const COMMON_BENEFIT = '各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給あり';
const HOURS = '22:00〜翌7:00';

const COMPANIES = [
  {
    co: 'st', count: 2, base: '月給350,000円〜', label: '月給35万円〜',
    salary: '月給350,000円〜（経験・能力を考慮／深夜手当別途支給）',
    intro: a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、夜間送迎ドライバーを募集します。当社スタッフ・関係者の夜間の移動（催事・展示会の準備や撤去の時間帯を含む）を、${a}周辺を中心にサポートします。`,
    duties: ['スタッフ・関係者の夜間の送迎', '催事・展示会の準備・撤去の時間帯の送迎サポート'],
    point: '催事・展示会の現場を、夜間の移動から支えるお仕事',
    reason: '催事・展示会の準備や撤去は夜間に行うことがあり、夜間の送迎に対応するため、深夜帯のシフトを設けています。',
    image: '/images/haisou-fleet.jpg',
  },
  {
    co: 'nl', count: 2, base: '月給340,000円〜', label: '月給34万円〜',
    salary: '月給340,000円〜（歩合・インセンティブにより上限なし／深夜手当別途支給）',
    intro: a => `関西のショッピングモールや商業施設を週替わりで回る、ベビーカステラ移動販売の当社で、夜間送迎ドライバーを募集します。催事スタッフの夜間の移動（設営・撤去の時間帯を含む）を、${a}周辺を中心にサポートします。`,
    duties: ['催事スタッフの夜間の送迎', '催事の設営・撤去の時間帯の送迎サポート'],
    point: '移動販売の催事を、夜間の移動から支えるお仕事',
    reason: '催事の設営・撤去は夜間になることがあり、夜間の送迎に対応するため、深夜帯のシフトを設けています。',
    image: '/images/nl-movingsales.png',
  },
  {
    co: 'sl', count: 2, base: '月収290,000円〜', label: '月収29万円〜',
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
  console.log(`\n=== Indeed 夜間送迎ドライバー（深夜勤務）新規作成${APPLY ? '（--apply・実際に作成）' : '（DRY-RUN）'} ===\n`);
  let created = 0;
  for (const [ci, c] of COMPANIES.entries()) {
    const have = db.prepare(
      `SELECT COUNT(*) n FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`
    ).get(c.co, JOB_TYPE).n;
    const need = c.count - have;
    console.log(`[${c.co}] 既存${have}件 → 追加${Math.max(need, 0)}件`);
    if (need <= 0) continue;

    // 同じ会社のIndeed求人と重複しないエリアを選ぶ
    const used = new Set(
      db.prepare(`SELECT title FROM jobs WHERE company = ? AND target_media LIKE '%indeed%'`).all(c.co)
        .map(r => (r.title.match(/^【(.+?)】/) || [])[1]).filter(Boolean)
    );
    // 会社間で同じエリアが並ばないよう、会社ごとに開始位置をずらす
    const areas = KANSAI_AREAS.filter(a => !used.has(a.area)).slice(ci * 4, ci * 4 + need);
    for (const a of areas) {
      const job = {
        title: `【${a.area}】夜間送迎ドライバー｜正社員・深夜手当あり・経験者優遇・${c.label}`,
        location: `${a.pref}${a.ward}${a.area}`,
        salary: c.salary,
        jobType: JOB_TYPE,
        employmentType: '正社員',
        description: describe(c, a.area),
        tags: ['経験者優遇', '正社員', '普通免許OK', '深夜手当あり', JOB_TYPE],
        catchcopy: `${JOB_TYPE}（${a.area}）｜深夜手当あり・経験者優遇・${c.label}`,
        imageUrl: c.image,
        isPublished: true,
        publishedAt: new Date().toISOString(),
        targetMedia: ['indeed'],
        company: c.co,
      };
      console.log(`  作成: ${job.title}`);
      if (APPLY) await Jobs.create(job);
      created++;
    }
  }
  console.log(`\n合計: ${created}件${APPLY ? 'を作成しました' : 'を作成予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ DB登録のみ。Indeedへの実際の掲載は別途必要です。勤務時間・深夜手当・休憩は掲載前に実際の運用と照合してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
