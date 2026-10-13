#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】効果の高い職種へ掲載の配分を入れ替える（各社の合計件数は変えない・配送は変えない）。
 * 2026-10-13、Indeed アナリティクス（ST/SL/AM/YP・10/1〜10/13）に基づくユーザー確認済みの配分。
 *
 *   st (15件): 職人送迎 3→7 ／ 催事送迎 3→0 ／ 展示会スタッフ送迎 2→0 ／ 夜間送迎 1→2 ／ 専属 1 ／ 展示会配送 5（変更なし）
 *   nl (15件): 催事スタッフ送迎 4 → 移動販売スタッフの送迎ドライバー 4（他は変更なし）
 *   am (16件): スタッフ送迎 6→降園送迎 6 ／ 学童送迎 7→登園送迎 5＋学童送迎 2 ／ 専属 1 ／ 配送 2（変更なし）
 *   sl (17件): 変更なし（通院・エステ送迎が当日終了した原因の確認が先）
 *   yp (14件): お客様送迎(経営者カウンセリング) 4→6 ／ お客様送迎(採用コンサル) 3→5 ／
 *              スタッフ送迎(経営コンサル) 3→経営者送迎 2 ／ スタッフ送迎(組織コンサル) 3→0 ／ 専属 1
 *
 * 方式：既存求人の job_type 等を差し替える（件数は増減しない）。
 *   ・既にその職種になっている件数を数え、不足分だけを変換するので、何度実行しても同じ結果に収束する（冪等）。
 *   ・変換先と同じ会社に既存の求人があれば、その本文・給与・題名の書式を雛形にして、エリア表記だけを差し替える。
 *     雛形が無い職種（AM降園・登園、YP経営者送迎）は、本文をこのスクリプト内で作る。
 *   ・「経験者優遇／未経験歓迎」の表現は、各求人が現在使っているものをそのまま引き継ぐ（言い換えは別スクリプト
 *     revert-indeed-names-wording-20261013.js --wording で行う）。
 *   ・求人ボックス側は変更しない。配送ドライバー・展示会配送・専属ドライバーは変更しない。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/rebalance-indeed-20261013.js            // ドライラン
 *   node --experimental-sqlite scripts/rebalance-indeed-20261013.js --apply    // 実際に反映
 *   --co=am,st  対象の会社を絞る（まず --co=am で試すのを推奨。AMは募集中が0件で、失うものがない）
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
const APPLY = process.argv.includes('--apply');
const coArg = process.argv.find(a => a.startsWith('--co='));
const COMPANIES = coArg ? coArg.slice(5).split(',').map(s => s.trim()).filter(Boolean) : ['st', 'nl', 'am', 'yp'];
const db = new DatabaseSync(DB_PATH);

const COMMON_BENEFIT = '各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給あり';

function extractArea(title) {
  const m = (title || '').match(/^【(.+?)】/);
  return m ? m[1] : null;
}
function hookOf(title) {
  return (title || '').includes('未経験歓迎') ? '未経験歓迎' : '経験者優遇';
}
function salaryLabel(salary) {
  const m = salary.match(/^(月給|月収)(\d{1,3}),(\d{3})円/);
  if (!m) return salary;
  const man = Math.round((parseInt(m[2], 10) * 1000 + parseInt(m[3], 10)) / 10000);
  return `${m[1]}${man}万円〜`;
}
function parseTags(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// 本文レイアウト（finalize-indeed-taxi-funnel-20261002.js と同じ構成）。実際の条件が確認できていない数値は書かない。
function layout({ a, intro, duties, points, closing, salary, hook }) {
  const qual = hook === '未経験歓迎' ? '未経験・ブランク歓迎' : '送迎・運転業務のご経験がある方（経験者優遇）';
  return `★${hook}／普通免許（AT限定可）で応募OK
★${points[0]}
★${points[1]}
★各種社会保険完備・車両燃料は会社負担・研修あり

仕事内容

${intro}
入社後は研修で、安全運転・送迎ルートの管理・応対マナーをしっかり学べます。

▼主な業務
${duties.map(d => `    •    ${d}`).join('\n')}
    •    車両の清掃・日常点検

${closing}

▼勤務条件
    •    勤務地：${a}周辺
    •    勤務時間・日数：シフト制（ご希望は面談時にご相談ください）
【給与】${salary}
【待遇】${COMMON_BENEFIT}

▼応募資格
    •    普通自動車運転免許（AT限定可）
    •    ${qual}
    •    安全運転を心がけられる方

※${a}周辺での募集です。`;
}

const AM_SAL = '月収280,000円〜';
const YP_SAL = '月給350,000円〜';

// 雛形が既存求人に無い職種の本文（元の seed-taxi-funnel-indeed-20260929.js の業務内容に合わせる）
const BUILDERS = {
  '降園送迎ドライバー': (a, hook) => ({ salary: AM_SAL, description: layout({ a, salary: AM_SAL, hook,
    points: ['園児の降園（帰り）を支える、子どもたちの笑顔に会えるお仕事', '夕方の時間帯中心。保育スタッフ同乗で安心'],
    intro: `託児所・保育所を運営する当社で、園児の降園送迎ドライバーを募集します。園から${a}周辺のご自宅までの送迎車（乗用車）を運転し、安全な降園をサポートするお仕事です。`,
    duties: ['園〜園児の自宅までの降園送迎', '乗車中の見守り（保育スタッフ同乗あり）'],
    closing: '子どもたちの成長を身近で感じられる、夕方の時間帯中心のお仕事です。' }) }),
  '登園送迎ドライバー': (a, hook) => ({ salary: AM_SAL, description: layout({ a, salary: AM_SAL, hook,
    points: ['園児の登園（朝）を支える、子どもたちの笑顔に会えるお仕事', '朝の時間帯中心。保育スタッフ同乗で安心'],
    intro: `託児所・保育所を運営する当社で、園児の登園送迎ドライバーを募集します。${a}周辺のご自宅から園までの送迎車（乗用車）を運転し、安全な登園をサポートするお仕事です。`,
    duties: ['園児の自宅〜園までの登園送迎', '乗車中の見守り（保育スタッフ同乗あり）'],
    closing: '子どもたちの成長を身近で感じられる、朝の時間帯中心のお仕事です。' }) }),
  '経営者送迎ドライバー': (a, hook) => ({ salary: YP_SAL, description: layout({ a, salary: YP_SAL, hook,
    points: ['経営者・役員層のお客様を運ぶ、落ち着いた人を運ぶお仕事', '送迎と簡単なご案内が中心。人と接するのが苦にならない方なら安心'],
    intro: `経営者・役員層向けのエグゼクティブ・カウンセリング事業を手掛ける当社で、経営者送迎ドライバーを募集します。経営者・役員層のお客様の移動を、${a}周辺を中心にサポートします。`,
    duties: ['経営者・役員層のお客様の送迎', '訪問スケジュールに合わせた運行管理'],
    closing: 'さまざまなお客様と接する機会がある、落ち着いた環境のお仕事です。' }) }),
};

// 変換ルール（上から順に適用）。want は「変換後にその職種（＋descKey）になっているべき件数」。
// sources は変換元（上から順に消費）。descKey は本文に含まれる語で、同じ job_type 内の系統を見分ける。
const RULES = [
  // ---- st ----
  { co: 'st', sources: [{ type: '催事送迎ドライバー' }, { type: '展示会スタッフ送迎ドライバー' }],
    target: { type: '職人送迎ドライバー' }, want: 7 },
  { co: 'st', sources: [{ type: '催事送迎ドライバー' }, { type: '展示会スタッフ送迎ドライバー' }],
    target: { type: '夜間送迎ドライバー' }, want: 2 },
  // ---- nl（名称のみ変更。本文の語を置換）----
  { co: 'nl', rename: { from: '催事スタッフ送迎ドライバー', textFrom: '催事スタッフ送迎ドライバー',
    titleFrom: '移動販売の催事スタッフ送迎ドライバー', to: '移動販売スタッフの送迎ドライバー' } },
  // ---- am ----
  { co: 'am', sources: [{ type: 'スタッフ送迎ドライバー' }], target: { type: '降園送迎ドライバー' }, want: 6 },
  { co: 'am', sources: [{ type: '学童送迎ドライバー' }], target: { type: '登園送迎ドライバー' }, want: 5 },
  // ---- yp ----
  { co: 'yp', sources: [{ type: 'スタッフ送迎ドライバー', descKey: '経営コンサルティング' }],
    target: { type: '経営者送迎ドライバー' }, want: 2 },
  { co: 'yp', sources: [{ type: 'スタッフ送迎ドライバー', descKey: '経営コンサルティング' }, { type: 'スタッフ送迎ドライバー', descKey: '組織' }],
    target: { type: 'お客様送迎ドライバー', descKey: 'カウンセリング' }, want: 6 },
  { co: 'yp', sources: [{ type: 'スタッフ送迎ドライバー', descKey: '組織' }, { type: 'スタッフ送迎ドライバー' }],
    target: { type: 'お客様送迎ドライバー', descKey: '採用' }, want: 5 },
];

const COLS = 'id, title, location, description, tags, salary, catchcopy, job_type, worktime_holiday';
function rowsOf(co, type, descKey) {
  const rows = db.prepare(
    `SELECT ${COLS} FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%' ORDER BY id`
  ).all(co, type);
  return descKey ? rows.filter(r => (r.description || '').includes(descKey)) : rows;
}

async function applyDonor(row, donor, targetType) {
  const area = extractArea(row.title) || row.location;
  const donorArea = extractArea(donor.title);
  const swap = s => (donorArea && area ? (s || '').split(donorArea).join(area) : (s || ''));
  const hook = hookOf(row.title);
  const donorHook = hookOf(donor.title);
  const fixHook = s => (hook === donorHook ? s : s.split(donorHook).join(hook));
  const patch = {
    title: fixHook(swap(donor.title)), jobType: targetType, description: fixHook(swap(donor.description)),
    salary: donor.salary, catchcopy: fixHook(swap(donor.catchcopy)), worktimeHoliday: donor.worktime_holiday || '',
    tags: parseTags(donor.tags).map(x => (x === donorHook ? hook : x)),
  };
  console.log(`  ${row.title.slice(0, 48)}\n   →  ${patch.title.slice(0, 60)}`);
  if (APPLY) await Jobs.update(row.id, patch);
}

async function applyBuilder(row, targetType) {
  const area = extractArea(row.title) || row.location;
  const hook = hookOf(row.title);
  const built = BUILDERS[targetType](area, hook);
  const title = `【${area}】${targetType}｜正社員・${hook}・${salaryLabel(built.salary)}`;
  console.log(`  ${row.title.slice(0, 48)}\n   →  ${title}`);
  if (APPLY) {
    await Jobs.update(row.id, {
      title, jobType: targetType, description: built.description, salary: built.salary,
      catchcopy: `${targetType}（${area}）｜${hook}・${salaryLabel(built.salary)}`,
      worktimeHoliday: '', tags: [hook, '正社員', '普通免許OK', targetType],
    });
  }
}

async function main() {
  console.log(`\n=== Indeed掲載 配分の入れ替え ${APPLY ? '（--apply・実際に反映）' : '（DRY-RUN）'} ===`);
  console.log(`対象の会社: ${COMPANIES.join(',')}（配送ドライバー・展示会配送・専属ドライバーは変更しません）\n`);
  let total = 0;

  for (const rule of RULES) {
    if (!COMPANIES.includes(rule.co)) continue;

    if (rule.rename) {
      const r = rule.rename;
      const rows = rowsOf(rule.co, r.from);
      console.log(`[${rule.co}] ${r.from} → ${r.to}: ${rows.length}件`);
      for (const row of rows) {
        const newTitle = row.title.split(r.titleFrom).join(r.to).split(r.textFrom).join(r.to);
        console.log(`  ${row.title.slice(0, 48)}\n   →  ${newTitle.slice(0, 60)}`);
        if (APPLY) {
          await Jobs.update(row.id, {
            title: newTitle, jobType: r.to,
            description: (row.description || '').split(r.textFrom).join(r.to),
            catchcopy: (row.catchcopy || '').split(r.textFrom).join(r.to),
            tags: parseTags(row.tags).map(x => (x === r.from ? r.to : x)),
          });
        }
        total++;
      }
      continue;
    }

    const have = rowsOf(rule.co, rule.target.type, rule.target.descKey).length;
    let need = rule.want - have;
    const label = `${rule.target.type}${rule.target.descKey ? `（${rule.target.descKey}）` : ''}`;
    console.log(`[${rule.co}] ${label}: 現在${have}件／目標${rule.want}件 → 不足${Math.max(need, 0)}件`);
    if (need <= 0) continue;

    const donor = rowsOf(rule.co, rule.target.type, rule.target.descKey)[0];
    if (!donor && !BUILDERS[rule.target.type]) {
      console.log(`  ※ 雛形となる既存求人が無く、本文の作成定義もありません。スキップ: ${label}`);
      continue;
    }
    for (const src of rule.sources) {
      if (need <= 0) break;
      const rows = rowsOf(rule.co, src.type, src.descKey).slice(0, need);
      for (const row of rows) {
        if (donor) await applyDonor(row, donor, rule.target.type);
        else await applyBuilder(row, rule.target.type);
        need--; total++;
      }
    }
    if (need > 0) console.log(`  ※ 変換元の求人が不足しています（あと${need}件）。`);
  }

  console.log('\n--- 変換後の件数（Indeed掲載） ---');
  for (const co of COMPANIES) {
    const rows = db.prepare(
      `SELECT job_type, COUNT(*) n FROM jobs WHERE company = ? AND target_media LIKE '%indeed%' GROUP BY job_type ORDER BY n DESC`
    ).all(co);
    const sum = rows.reduce((s, r) => s + r.n, 0);
    console.log(`[${co}] 合計${sum}件: ${rows.map(r => `${r.job_type} ${r.n}`).join(' / ')}${APPLY ? '' : '  ※ドライランのため変更前の件数'}`);
  }
  console.log(`\n合計: ${total}件${APPLY ? 'を更新しました' : 'を更新予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 反映後は Indeed 管理画面で同期してください。一度に変更するため、1回だけ実施し、その後3日は触らず新着を計測してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
