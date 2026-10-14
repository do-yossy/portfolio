#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】効果が落ちた「名称変更」と「未経験歓迎→経験者優遇の言い換え」を戻すスクリプト。
 * 2026-10-13、Indeed アナリティクス（ST/SL/AM/YP・10/1〜10/13）の分析に基づく。
 *
 * 根拠（掲載1件あたり。作成日で 前=〜10/1 / 後=10/6〜 を比較、倉庫・軽作業を除く）:
 *   ・全求人: 表示 123→95（-23%）、CTR 14.0%→8.0%（-43%）、応募 1.02→0.44（-57%）
 *   ・名称も本文も触っていない「展示会配送ドライバー」(ST) は CTR 11.8→12.4→12.0% で横ばい（対照）
 *   ・名称は同じで言い換えのみの「職人送迎ドライバー」(ST) は CTR 22.9→17.3→9.2→7.8%、表示 226→249→122→90 と低下
 *   ・名称を変えた AM「降園送迎」→「スタッフ送迎」は 応募/件 2.0→0.38
 *   ※ 件数が少なく（職人送迎は計11件）、名称・言い換え・掲載日の新しさが重なっているため、因果は断定できない。
 *
 * 2つの部品を独立に選べる（どちらも指定しなければ両方が対象）:
 *   --names     名称を戻す（AM のみ。データ上、元の名称のほうが明らかに良かったもの）
 *                 AM: スタッフ送迎ドライバー → 降園送迎ドライバー
 *                 AM: 学童送迎ドライバー     → 登園送迎ドライバー
 *               本文も新しい名称に合わせて作り直す（題名と本文が食い違わないようにする）。
 *               ST/SL/YP は、元の名称のほうが良かったという根拠が無い（ST関係者送迎は応募0、YPコンサル系は同程度）ため対象外。
 *   --wording   題名・タグ・本文の「経験者優遇」を「未経験歓迎」へ戻す（Indeed掲載分すべて）
 *               ※ 実際に未経験を受け入れられる場合のみ使うこと（未経験歓迎と掲載して、
 *                  経験不足を理由にお断りする運用は、求人表示と実態が食い違い、虚偽表示・苦情・垢BANの原因になる）。
 *   --co=am,st  対象の会社を絞る（既定: st,nl,am,sl,yp）。まず --co=am,st など小さく試すことを推奨。
 *   --apply     実際に反映（既定はドライラン）
 *
 * 冪等：どの段階から実行しても同じ最終形に収束する。求人ボックス側は変更しない。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/revert-indeed-names-wording-20261013.js --co=am,st            // ドライラン
 *   node --experimental-sqlite scripts/revert-indeed-names-wording-20261013.js --co=am,st --apply    // 反映
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
const wantNames = process.argv.includes('--names');
const wantWording = process.argv.includes('--wording');
const DO_NAMES = wantNames || !wantWording;
const DO_WORDING = wantWording || !wantNames;
const coArg = process.argv.find(a => a.startsWith('--co='));
const COMPANIES = coArg ? coArg.slice(5).split(',').map(s => s.trim()).filter(Boolean) : ['st', 'nl', 'am', 'sl', 'yp'];

const db = new DatabaseSync(DB_PATH);
const COMMON_BENEFIT = '各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給あり';

function extractArea(title) {
  const m = title.match(/^【(.+?)】/);
  return m ? m[1] : null;
}

function salaryLabel(salary) {
  const m = salary.match(/^(月給|月収)(\d{1,3}),(\d{3})円/);
  if (!m) return salary;
  const man = Math.round((parseInt(m[2], 10) * 1000 + parseInt(m[3], 10)) / 10000);
  return `${m[1]}${man}万円〜`;
}

// 本文レイアウト（finalize-indeed-taxi-funnel-20261002.js と同じ構成）。
// 実際の条件が確認できていない数値（勤務日数・研修期間など）は書かない。
function layout({ a, intro, duties, points, closing, salary, hookWord }) {
  const qual = hookWord === '未経験歓迎'
    ? '未経験・ブランク歓迎'
    : '送迎・運転業務のご経験がある方（経験者優遇）';
  return `★${hookWord}／普通免許（AT限定可）で応募OK
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
// 元の名称へ戻す対象（根拠は冒頭コメント参照）。本文は元の seed-taxi-funnel-indeed-20260929.js の業務内容に合わせる。
const NAME_REVERTS = [
  {
    co: 'am', from: 'スタッフ送迎ドライバー', to: '降園送迎ドライバー', salary: AM_SAL,
    build: (a, hookWord) => layout({ a, salary: AM_SAL, hookWord,
      points: ['園児の降園（帰り）を支える、子どもたちの笑顔に会えるお仕事', '夕方の時間帯中心。保育スタッフ同乗で安心'],
      intro: `託児所・保育所を運営する当社で、園児の降園送迎ドライバーを募集します。園から${a}周辺のご自宅までの送迎車（乗用車）を運転し、安全な降園をサポートするお仕事です。`,
      duties: ['園〜園児の自宅までの降園送迎', '乗車中の見守り（保育スタッフ同乗あり）'],
      closing: '子どもたちの成長を身近で感じられる、夕方の時間帯中心のお仕事です。' }),
  },
  {
    co: 'am', from: '学童送迎ドライバー', to: '登園送迎ドライバー', salary: AM_SAL,
    build: (a, hookWord) => layout({ a, salary: AM_SAL, hookWord,
      points: ['園児の登園（朝）を支える、子どもたちの笑顔に会えるお仕事', '朝の時間帯中心。保育スタッフ同乗で安心'],
      intro: `託児所・保育所を運営する当社で、園児の登園送迎ドライバーを募集します。${a}周辺のご自宅から園までの送迎車（乗用車）を運転し、安全な登園をサポートするお仕事です。`,
      duties: ['園児の自宅〜園までの登園送迎', '乗車中の見守り（保育スタッフ同乗あり）'],
      closing: '子どもたちの成長を身近で感じられる、朝の時間帯中心のお仕事です。' }),
  },
];

// 「経験者優遇」→「未経験歓迎」の復元（finalize の WORDING_PATCHES / layout の逆変換）
const WORDING_PAIRS = [
  ['★経験者優遇／普通免許（AT限定可）で応募OK', '★未経験歓迎／普通免許（AT限定可）で応募OK'],
  ['送迎・運転業務のご経験がある方（経験者優遇）', '未経験・ブランク歓迎'],
  ['◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎', '◆ 普通免許（AT限定可）があればOK、未経験歓迎'],
  ['送迎・運転業務のご経験がある方歓迎', '未経験・ブランク歓迎・学歴不問'],
];

function parseTags(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function main() {
  console.log(`\n=== Indeed 名称・言い換えの戻し ${APPLY ? '（--apply・実際に反映）' : '（DRY-RUN）'} ===`);
  console.log(`対象: 会社=${COMPANIES.join(',')} / 名称=${DO_NAMES ? 'する' : 'しない'} / 言い換え(未経験歓迎)=${DO_WORDING ? 'する' : 'しない'}\n`);
  let total = 0;

  if (DO_NAMES) {
    for (const r of NAME_REVERTS) {
      if (!COMPANIES.includes(r.co)) continue;
      const jobs = db.prepare(
        `SELECT id, title, location FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`
      ).all(r.co, r.from);
      console.log(`[${r.co}] ${r.from} → ${r.to}: ${jobs.length}件`);
      for (const job of jobs) {
        const area = extractArea(job.title) || job.location;
        // 言い換えを戻す指定のとき、または既に題名が未経験歓迎のときは、未経験歓迎で作る
        const hook = (DO_WORDING || job.title.includes('未経験歓迎')) ? '未経験歓迎' : '経験者優遇';
        const newTitle = `【${area}】${r.to}｜正社員・${hook}・${salaryLabel(r.salary)}`;
        console.log(`  ${job.title.slice(0, 50)}`);
        console.log(`   →  ${newTitle}`);
        if (APPLY) {
          await Jobs.update(job.id, {
            title: newTitle, jobType: r.to, description: r.build(area, hook), salary: r.salary,
            catchcopy: `${r.to}（${area}）｜${hook}・${salaryLabel(r.salary)}`,
            worktimeHoliday: '', tags: [hook, '正社員', '普通免許OK', r.to],
          });
        }
        total++;
      }
    }
  }

  if (DO_WORDING) {
    for (const co of COMPANIES) {
      // 上の名称戻しで既に更新した求人は、題名に経験者優遇が残っていないため自然に除外される（--apply 時）
      const jobs = db.prepare(
        `SELECT id, title, description, tags FROM jobs WHERE company = ? AND target_media LIKE '%indeed%' AND (title LIKE '%経験者優遇%' OR description LIKE '%経験者優遇%')`
      ).all(co);
      if (jobs.length === 0) continue;
      console.log(`[${co}] 経験者優遇 → 未経験歓迎（表現のみ戻す）: ${jobs.length}件`);
      for (const job of jobs) {
        const newTitle = job.title.replace(/経験者優遇/g, '未経験歓迎');
        let newDesc = job.description || '';
        for (const [from, to] of WORDING_PAIRS) newDesc = newDesc.split(from).join(to);
        const tags = parseTags(job.tags).map(x => x === '経験者優遇' ? '未経験歓迎' : x);
        if (newTitle === job.title && newDesc === job.description) continue;
        console.log(`  ${job.title.slice(0, 50)}`);
        console.log(`   →  ${newTitle.slice(0, 50)}`);
        if (APPLY) await Jobs.update(job.id, { title: newTitle, description: newDesc, tags });
        total++;
      }
    }
  }

  console.log(`\n合計: ${total}件${APPLY ? 'を更新しました' : 'を更新予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 反映後は Indeed 管理画面で同期してください。求人ボックス側は変更していません。');
  console.log('※ 一度にまとめて変更すると表示順位が再び落ちるため、1回だけ実施し、その後3日は触らず、新着を計測してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
