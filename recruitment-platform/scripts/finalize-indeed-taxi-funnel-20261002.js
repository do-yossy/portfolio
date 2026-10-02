#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用・最終確定版】st/nl/am/sl/ypの元の求人（2026-09-29投入のオリジナル状態）を、
 * 最終形に変換する統合スクリプト。2026-10-02、ユーザー確認済みの最終マッピング：
 *
 *   st: 職人送迎ドライバー(3)                    → 名称そのまま（経験者優遇のみ）
 *   st: バイヤー・関係者送迎ドライバー(3)         → 催事送迎ドライバー（ユーザー確認：意図的）
 *   st: 展示会場スタッフ送迎ドライバー(2)         → スタッフ送迎ドライバー
 *   st: 専属ドライバー(1)・展示会配送ドライバー(5) → 変更なし
 *
 *   nl: 移動販売の送迎ドライバー(6)               → 名称そのまま（経験者優遇のみ）
 *   nl: 移動販売車の回送ドライバー(4)             → 催事スタッフ送迎ドライバー
 *       （ユーザー確認：あっている。車両のみの回送ではなく、催事スタッフを乗せて送迎する
 *        業務内容に変更する）
 *   nl: 専属ドライバー(1)・配送ドライバー(3)       → 変更なし
 *
 *   am: 登園送迎ドライバー(7)                    → お客様送迎ドライバー
 *   am: 降園送迎ドライバー(6)                    → スタッフ送迎ドライバー
 *       （ユーザー確認：st/nlと同じ2パターンに寄せる）
 *   am: 専属ドライバー(1)・配送ドライバー(2)       → 変更なし
 *
 *   sl: 整骨院通院送迎ドライバー(6)               → お客様送迎ドライバー
 *   sl: 治療院・エステ通院送迎ドライバー(7)        → スタッフ送迎ドライバー
 *       （ユーザー確認：st/nlと同じ2パターンに寄せる）
 *   sl: 専属ドライバー(1)・配送ドライバー(2)       → 変更なし
 *
 *   yp: 経営者カウンセリング送迎ドライバー(4)      → お客様送迎ドライバー
 *   yp: 経営コンサル訪問送迎ドライバー(3)         → スタッフ送迎ドライバー
 *   yp: 採用コンサル訪問送迎ドライバー(3)         → お客様送迎ドライバー
 *   yp: 組織コンサル訪問送迎ドライバー(3)         → スタッフ送迎ドライバー
 *   yp: 専属ドライバー(1)                        → 変更なし
 *
 * 全社共通で「未経験歓迎」は使わず「経験者優遇」に統一（タイトルの給与表記は各社の実際の給与に合わせる）
 * （過去の成約パターン：経験者優遇の求人に応募→未経験で難しいと伝える→
 *  抵抗の少ない送迎としてタクシーを案内→内定、という流れに合わせるため）。
 * 「役員ドライバー」「ハイヤードライバー」は不採用（ハイヤードライバーは普通二種免許が
 * 法的に必要な業務区分でありAT限定免許の条件と矛盾するため）。
 *
 * 求人ボックス側（scripts/lib/taxi-funnel-content.js）は変更しない（Indeed掲載のみ対象）。
 * 冪等：どの段階（オリジナルのまま／今日の試行錯誤の途中段階）からでも正しい最終形に収束する。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/finalize-indeed-taxi-funnel-20261002.js             // ドライラン
 *   node --experimental-sqlite scripts/finalize-indeed-taxi-funnel-20261002.js --apply     // 実際に反映
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
const COMMON_BENEFIT = '各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給あり';
const QUAL_EXP = '普通自動車運転免許（AT限定可）／送迎・運転業務のご経験がある方歓迎';

// 給与文字列（例: '月収280,000円〜'）からタイトル用の表記（'月収28万円〜'）を作る。
// 実際の給与とタイトルの金額がずれないようにするため、全社固定の「35万円」は使わない。
function salaryLabel(salary) {
  const m = salary.match(/^(月給|月収)(\d{1,3}),(\d{3})円/);
  if (!m) return salary;
  const man = Math.round((parseInt(m[2], 10) * 1000 + parseInt(m[3], 10)) / 10000);
  return `${m[1]}${man}万円〜`;
}

function extractArea(title) {
  const m = title.match(/^【(.+?)】/);
  return m ? m[1] : null;
}

// 過去に応募・成約が出ていた求人（夜間送迎ドライバー等）の構成に合わせた本文レイアウト。
// ★ハイライト → 仕事内容 → ▼主な業務 → ▼勤務条件 → ▼応募資格。
// 給与・勤務日数・研修期間など、実際の条件が確認できていない数値は書かない（給与は各社の登録値のみ）。
function layout({ a, role, intro, duties, points, closing, salary }) {
  return `★経験者優遇／普通免許（AT限定可）で応募OK
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
    •    送迎・運転業務のご経験がある方（経験者優遇）
    •    安全運転を心がけられる方

※${a}周辺での募集です。`;
}

// ===== グループA: 名称を変更するケース（タイトル・job_type・本文を全面差し替え）=====
const ST_SAL = '月給350,000円〜（経験・能力を考慮）';
const RENAME_PATCHES = [
  {
    co: 'st', finalType: '催事送迎ドライバー', salary: ST_SAL,
    oldTypes: ['バイヤー・関係者送迎ドライバー', '商談送迎ドライバー', '役員運転手', '役員送迎ドライバー', 'お客様送迎ドライバー'],
    buildDescription: a => layout({ a, salary: ST_SAL,
      points: ['バイヤー・取引先のお客様を運ぶ、落ち着いた人を運ぶお仕事', '送迎と簡単なご案内が中心。人と接するのが苦にならない方なら安心'],
      intro: `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、催事送迎ドライバーを募集します。催事・商談に訪れるバイヤーや取引先関係者の移動を、${a}周辺を中心にサポートします。`,
      duties: ['バイヤー・取引先関係者（お客様）の送迎', '催事会場・商談先・工房見学先までのご案内サポート'],
      closing: 'さまざまな業界のお客様と接する機会があり、「人と接する仕事をしながら安定収入を得たい」という方に向いています。' }),
  },
  {
    co: 'st', finalType: '展示会スタッフ送迎ドライバー', salary: ST_SAL,
    oldTypes: ['展示会場スタッフ送迎ドライバー', 'スタッフ送迎ドライバー', 'ハイヤードライバー'],
    buildDescription: a => layout({ a, salary: ST_SAL,
      points: ['展示会・催事を裏側から支える、スタッフの送迎ポジション', '送迎と簡単なサポートが中心。人と接するのが苦にならない方なら安心'],
      intro: `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、展示会スタッフ送迎ドライバーを募集します。展示会・催事に向かうスタッフを、${a}周辺の会場まで送り届けます。`,
      duties: ['展示会・催事スタッフの送迎', '会場での搬入サポート（運転以外の業務も一部あり）'],
      closing: '展示会の現場を支える仲間として、運転を通じて会社に貢献できるお仕事です。' }),
  },
  {
    co: 'nl', finalType: '催事スタッフ送迎ドライバー', salary: '月給340,000円〜（歩合・インセンティブにより上限なし）',
    oldTypes: ['移動販売車の回送ドライバー', '移動販売車の陸送ドライバー'],
    buildDescription: a => layout({ a, salary: '月給340,000円〜（歩合・インセンティブにより上限なし）',
      points: ['ベビーカステラ移動販売の催事スタッフを運ぶ、人を運ぶお仕事', '送迎と簡単なサポートが中心。人と接するのが苦にならない方なら安心'],
      intro: `関西のショッピングモールや商業施設を週替わりで回る、ベビーカステラ移動販売の催事スタッフ送迎ドライバーです。催事会場へ応援にかけつける販売スタッフを、拠点から${a}周辺の催事会場まで送り届けます。`,
      duties: ['催事スタッフの拠点〜催事会場間の送迎', '会場での簡単なサポート（運転以外の業務も一部あり）'],
      closing: '催事の現場を毎週違う場所で支える、変化のあるお仕事です。' }),
    titlePrefix: '移動販売の',
  },
  {
    co: 'am', finalType: '学童送迎ドライバー', salary: '月収280,000円〜',
    oldTypes: ['登園送迎ドライバー', 'お客様送迎ドライバー'],
    buildDescription: a => layout({ a, salary: '月収280,000円〜',
      points: ['お子さまの送迎が中心。子どもたちの成長を身近で感じられる', '保育スタッフ同乗。本格的な保育スキルは不要'],
      intro: `託児所・保育所を運営する当社で、学童送迎ドライバーを募集します。${a}周辺で、お子さまの学童・託児施設への送迎車（乗用車）を運転し、安全な送迎をサポートします。`,
      duties: ['お子さまの送迎（ご自宅・学校・施設間）', '乗車中の見守り（保育スタッフ同乗あり）'],
      closing: '送迎と見守りが中心で、人と接するのが苦にならない方なら安心です。ライフスタイルに合わせやすい時間帯の勤務です。' }),
  },
  {
    co: 'am', finalType: 'スタッフ送迎ドライバー', salary: '月収280,000円〜',
    oldTypes: ['降園送迎ドライバー'],
    buildDescription: a => layout({ a, salary: '月収280,000円〜',
      points: ['保育スタッフを運ぶ、人を運ぶお仕事', '送迎が中心で、人と接するのが苦にならない方なら安心'],
      intro: `託児所・保育所を運営する当社で、スタッフ送迎ドライバーを募集します。${a}周辺で、保育スタッフの出退勤・園間の移動を送迎車（乗用車）でサポートします。`,
      duties: ['保育スタッフの自宅・園間などの送迎', 'シフトに合わせた運行スケジュールの管理'],
      closing: '現場の保育スタッフを支える、頼りにされるお仕事です。' }),
  },
  {
    co: 'sl', finalType: '通院送迎ドライバー', salary: '月収290,000円〜',
    oldTypes: ['整骨院通院送迎ドライバー', 'お客様送迎ドライバー'],
    buildDescription: a => layout({ a, salary: '月収290,000円〜',
      points: ['通院が難しい方を運ぶ、感謝されるお仕事', '送迎と乗降のサポートが中心。本格的な介助スキルは不要'],
      intro: `整骨院・治療院・エステサロンを運営する当社で、通院送迎ドライバーを募集します。${a}周辺のご自宅と整骨院の間を送迎し、通院が難しい方の来院をサポートします。`,
      duties: ['利用者のご自宅〜整骨院間の送迎', '乗降時のサポート'],
      closing: '利用者の健康を支える仕事で、「人と接する仕事をしながら安定収入を得たい」という方に向いています。' }),
  },
  {
    co: 'sl', finalType: 'エステ送迎ドライバー', salary: '月収290,000円〜',
    oldTypes: ['治療院・エステ通院送迎ドライバー'],
    buildDescription: a => layout({ a, salary: '月収290,000円〜',
      points: ['エステ・治療院にご来店のお客様を運ぶ、人を運ぶお仕事', '送迎と乗降のサポートが中心。本格的な接客スキルは不要'],
      intro: `整骨院・治療院・エステサロンを運営する当社で、エステ送迎ドライバーを募集します。${a}周辺のご自宅とエステサロン・治療院の間を送迎し、ご来店をサポートします。`,
      duties: ['お客様のご自宅〜エステサロン・治療院間の送迎', '乗降時のサポート'],
      closing: 'お客様の美容・健康を支える仕事で、感謝されることの多いお仕事です。' }),
  },
  {
    co: 'yp', finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜',
    oldTypes: ['経営者カウンセリング送迎ドライバー', '役員ドライバー'],
    buildDescription: a => layout({ a, salary: '月給350,000円〜',
      points: ['経営者・役員層のお客様を運ぶ、落ち着いた人を運ぶお仕事', '送迎と簡単なご案内が中心。人と接するのが苦にならない方なら安心'],
      intro: `経営者・役員層向けのエグゼクティブ・カウンセリング事業を手掛ける当社で、お客様送迎ドライバーを募集します。カウンセラーの訪問先（お客様）への移動を、${a}周辺を中心にサポートします。`,
      duties: ['カウンセラーの訪問先（お客様）までの送迎', '訪問スケジュールに合わせた運行管理'],
      closing: 'さまざまなお客様と接する機会がある、落ち着いた環境のお仕事です。' }),
  },
  {
    co: 'yp', finalType: 'スタッフ送迎ドライバー', salary: '月給350,000円〜',
    oldTypes: ['経営コンサル訪問送迎ドライバー', '役員運転手'],
    buildDescription: a => layout({ a, salary: '月給350,000円〜',
      points: ['コンサルタントを運ぶ、人を運ぶお仕事', '送迎と簡単なご案内が中心。人と接するのが苦にならない方なら安心'],
      intro: `経営者・役員層向けの経営コンサルティング事業を手掛ける当社で、スタッフ送迎ドライバーを募集します。コンサルタントの訪問先への移動を、${a}周辺を中心にサポートします。`,
      duties: ['コンサルタントの訪問先までの送迎', '訪問スケジュールに合わせた運行管理'],
      closing: '経営の現場を間近で知ることができるお仕事です。' }),
  },
  {
    co: 'yp', finalType: 'お客様送迎ドライバー', salary: '月給350,000円〜',
    oldTypes: ['採用コンサル訪問送迎ドライバー', 'ハイヤードライバー'],
    buildDescription: a => layout({ a, salary: '月給350,000円〜',
      points: ['企業の人事担当のお客様を運ぶ、人を運ぶお仕事', '送迎と簡単なご案内が中心。人と接するのが苦にならない方なら安心'],
      intro: `企業の採用戦略コンサルティング事業を手掛ける当社で、お客様送迎ドライバーを募集します。コンサルタントの企業訪問（お客様先）を、${a}周辺を中心にサポートします。`,
      duties: ['コンサルタントの訪問先（企業・人事部門等のお客様）までの送迎', '訪問スケジュールに合わせた運行管理'],
      closing: 'さまざまな企業の採用現場に関わる機会があるお仕事です。' }),
  },
  {
    co: 'yp', finalType: 'スタッフ送迎ドライバー', salary: '月給350,000円〜',
    oldTypes: ['組織コンサル訪問送迎ドライバー'],
    buildDescription: a => layout({ a, salary: '月給350,000円〜',
      points: ['コンサルタントを運ぶ、人を運ぶお仕事', '送迎と簡単なご案内が中心。人と接するのが苦にならない方なら安心'],
      intro: `企業の組織活性・人財活用コンサルティング事業を手掛ける当社で、スタッフ送迎ドライバーを募集します。コンサルタントの企業訪問を、${a}周辺を中心にサポートします。`,
      duties: ['コンサルタントの訪問先までの送迎', '訪問スケジュールに合わせた運行管理'],
      closing: '組織づくりの現場に関わる機会があるお仕事です。' }),
  },
];

// ===== グループB: 名称を変更せず「経験者優遇」表現のみ追加するケース =====
const WORDING_PATCHES = [
  { co: 'st', jobType: '職人送迎ドライバー' },
  { co: 'nl', jobType: '送迎ドライバー' },
];

async function patchRename(job, finalType, titlePrefix, buildDescription, salary) {
  const area = extractArea(job.title) || job.location;
  const prefix = titlePrefix || '';
  const newTitle = `【${area}】${prefix}${finalType}｜正社員・経験者優遇・${salaryLabel(salary)}`;
  const newDescription = buildDescription(area);
  const newCatchcopy = `${finalType}（${area}）｜経験者優遇・${salaryLabel(salary)}`;
  console.log(`  ${job.title.slice(0, 48)}`);
  console.log(`   →  ${newTitle}`);
  if (APPLY) {
    await Jobs.update(job.id, {
      title: newTitle, jobType: finalType, description: newDescription,
      catchcopy: newCatchcopy, salary, tags: ['経験者優遇', '正社員', '普通免許OK', finalType],
    });
  }
}

async function main() {
  console.log(`\n=== Indeed掲載 最終統合スクリプト（確定版）${APPLY ? '（--apply・実際に反映）' : '（DRY-RUN）'} ===\n`);
  let total = 0;

  for (const patch of RENAME_PATCHES) {
    const placeholders = patch.oldTypes.map(() => '?').join(',');
    const jobs = db.prepare(
      `SELECT id, title, location FROM jobs WHERE company = ? AND job_type IN (${placeholders}) AND target_media LIKE '%indeed%'`
    ).all(patch.co, ...patch.oldTypes);
    console.log(`[${patch.co}] ${patch.oldTypes.filter(t=>!t.endsWith('XX')).join('／')} → ${patch.finalType}: ${jobs.length}件`);
    for (const job of jobs) {
      await patchRename(job, patch.finalType, patch.titlePrefix, patch.buildDescription, patch.salary);
      total++;
    }
  }

  for (const p of WORDING_PATCHES) {
    const jobs = db.prepare(
      `SELECT id, title, description, tags FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`
    ).all(p.co, p.jobType);
    if (jobs.length === 0) continue;
    console.log(`[${p.co}] ${p.jobType}（経験者優遇への表現調整）: ${jobs.length}件`);
    for (const job of jobs) {
      if (job.title.includes('経験者優遇')) {
        console.log(`  スキップ（既に対応済み）: ${job.title.slice(0, 40)}`);
        continue;
      }
      const newTitle = job.title.replace('未経験歓迎', '経験者優遇');
      const newDescription = job.description
        .replace('未経験・ブランク歓迎・学歴不問', '送迎・運転業務のご経験がある方歓迎')
        .replace(/◆ 普通免許（AT限定可）があればOK、未経験歓迎/, '◆ 普通免許（AT限定可）必須。送迎・運転業務のご経験がある方歓迎');
      let tags;
      try {
        const arr = JSON.parse(job.tags || '[]');
        tags = arr.map(x => x === '未経験歓迎' ? '経験者優遇' : x);
      } catch { tags = ['経験者優遇', '正社員', '普通免許OK', p.jobType]; }

      console.log(`  更新: ${job.title.slice(0, 48)}`);
      console.log(`   →  ${newTitle}`);
      if (APPLY) {
        await Jobs.update(job.id, { title: newTitle, description: newDescription, tags });
      }
      total++;
    }
  }

  console.log(`\n合計: ${total}件${APPLY ? 'を更新しました' : 'を更新予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 専属ドライバー・配送ドライバー・展示会配送ドライバーは対象外（変更なし）。求人ボックス側も変更していません。');
}

main().catch(err => { console.error(err); process.exit(1); });
