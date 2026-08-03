'use strict';
/*
 * 求人ボックス 応募ブースト診断
 * ------------------------------------------------------------------
 * 「応募が来ている求人」を分析し、掲載中で応募が少ない求人へ具体的な改善
 * アクションを出す。kyujinbox-winners.js（勝ち型の全体傾向）を土台に、
 * (1) 実際に受信した応募（applicants: media=kyujinbox）を job_title で集計、
 * (2) job_metrics（表示views / 応募applies）と突き合わせ、
 * (3) 掲載中求人を「勝ち / コピー改善 / 露出改善 / 要見直し」に分類し、
 * (4) 各求人に勝ち型を当てはめた改善提案を出力する。
 *
 * 実行:
 *   node --experimental-sqlite scripts/kyujinbox-apply-boost.js [--company all|sq|bg|...] [--min 5] [--md]
 *     --company : 対象会社（既定 all）
 *     --min     : キーワード集計の最小該当件数（既定 5）
 *     --md      : Markdownレポートを scripts/out/ に保存
 *
 * job_metrics は kyujinbox_metrics.py（求人ボックス管理画面の表示/応募スクレイプ）で
 * 収集される。未収集の場合は applicants(media=kyujinbox) の受信応募のみで簡易分析する。
 */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const COMPANY = (getArg('--company', 'all') || 'all').toLowerCase();
const MIN = parseInt(getArg('--min', '5'), 10) || 5;
const WRITE_MD = args.includes('--md');
// 勝ち型ワードをタイトルへ自動反映。既定はドライラン、--apply-titles でDB更新。
const APPLY_TITLES = args.includes('--apply-titles');
const TITLE_MAX = parseInt(getArg('--title-max', '64'), 10) || 64;

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const COMPANY_LABEL = {
  sq: 'Social Quality', bg: 'Bigeyes', pe: 'ピープル', lt: 'Life Tailor',
  nc: 'ニクール', nx: 'ネクサス', st: 'Style501', bi: 'Brand ideaL', nl: 'NOWLIVE',
};

// 応募・露出に効きやすいタイトル語（winners.js と揃える）
const KEYWORDS = [
  '未経験', '経験不問', '未経験歓迎', '学歴不問', 'ブランク', 'シニア', 'フリーター', '年齢不問', '中高年',
  '月収28万', '月収30万', '月収32万', '月収35万', '月収38万', '月収40万', '月給', '高収入', '年収',
  '正社員', '日勤', '夜勤', '週休2日', '完全週休', '土日祝', '残業なし', '残業少',
  '賞与', '昇給', '手当', '寮', '社宅', '送迎', 'まかない', '車通勤', '転勤なし', '交通費',
  'ドライバー', '配送', 'ルート', '運転手', '送迎ドライバー',
  '倉庫', 'ピッキング', '検品', '仕分け', '軽作業', '座り作業', '製造', 'オペレーター',
  '営業', '接客', '販売', '介護', '事務',
];

const out = [];
const P = (s = '') => { out.push(s); console.log(s); };

// ── job_metrics 最新スナップショットを求人ごとに集約 ──
function loadMetrics() {
  let rows;
  try {
    const where = COMPANY === 'all' ? '' : 'WHERE m.company = ?';
    rows = db.prepare(
      `SELECT m.company, m.job_id, m.job_number, m.title, m.location, m.status,
              m.views, m.applies, m.collected_at,
              j.job_type AS j_job_type, j.salary AS j_salary, j.is_published AS j_pub
       FROM job_metrics m LEFT JOIN jobs j ON j.id = m.job_id ${where}`
    ).all(...(COMPANY === 'all' ? [] : [COMPANY]));
  } catch { return []; }
  const latest = {};
  for (const r of rows) {
    const key = r.job_id || `${r.job_number}|${r.title}`;
    if (!latest[key] || String(r.collected_at) > String(latest[key].collected_at)) latest[key] = r;
  }
  return Object.values(latest).map(r => ({
    ...r, views: Number(r.views) || 0, applies: Number(r.applies) || 0,
  })).filter(r => r.job_number !== '9999-0000-0001');
}

// ── 受信した求人ボックス応募を job_title で集計 ──
function loadReceivedApplies() {
  try {
    const where = COMPANY === 'all' ? '' : 'AND company = ?';
    const rows = db.prepare(
      `SELECT company, COALESCE(NULLIF(job_title,''),'（不明）') AS jt, COUNT(*) AS n
       FROM applicants
       WHERE media = 'kyujinbox' AND is_archived = 0 ${where}
       GROUP BY company, jt ORDER BY n DESC`
    ).all(...(COMPANY === 'all' ? [] : [COMPANY]));
    return rows.map(r => ({ company: r.company, title: String(r.jt), received: Number(r.n) || 0 }));
  } catch { return []; }
}

const norm = s => String(s || '').replace(/\s|　|＜.*?＞|【.*?】|［.*?］|\(.*?\)|（.*?）/g, '').toLowerCase();

const salaryMan = (salary, title) => {
  const src = `${salary || ''} ${title || ''}`;
  const man = [...src.matchAll(/(\d{2,3})\s*万/g)].map(x => +x[1]).filter(n => n >= 15 && n <= 120);
  if (man.length) return Math.max(...man);
  const yen = [...src.matchAll(/(\d{6,7})\s*円/g)].map(x => Math.round(+x[1] / 10000)).filter(n => n >= 15 && n <= 120);
  return yen.length ? Math.max(...yen) : 0;
};

// ── メイン ──
const metrics = loadMetrics();
const received = loadReceivedApplies();
const receivedTotal = received.reduce((s, r) => s + r.received, 0);

P(`\n===== 求人ボックス 応募ブースト診断（company=${COMPANY}）=====`);

if (!metrics.length && !received.length) {
  P('データがありません。');
  P('  1) 応募実績: 求人ボックスの応募者CSVを取り込む（管理画面 → 応募者管理）。');
  P('  2) 表示/応募: node scripts/../kyujinbox_metrics.py で表示・応募数を収集。');
  P('  収集後にこのスクリプトを再実行してください。');
  db.close();
  process.exit(0);
}

// ── 1) 応募が来ている求人ランキング（受信ベース） ──
if (received.length) {
  P(`\n■ 応募が来ている求人 TOP（受信応募ベース・計${receivedTotal}件）`);
  P('   ' + '会社'.padEnd(6) + '応募'.padStart(4) + '  求人タイトル');
  for (const r of received.slice(0, 15)) {
    const lab = (COMPANY_LABEL[r.company] || r.company || '?').slice(0, 6);
    P('   ' + lab.padEnd(6) + String(r.received).padStart(4) + '  ' + r.title.slice(0, 46));
  }
} else {
  P('\n■ 受信応募（applicants: media=kyujinbox）はまだありません。job_metrics のみで分析します。');
}

// ── 2) 勝ち型（応募に効くタイトル語）の抽出 ──
// applies の判定は job_metrics.applies を優先、無ければ受信応募を title 一致で付与
let scored = [];
if (metrics.length) {
  const recByTitle = {};
  for (const r of received) recByTitle[norm(r.title)] = (recByTitle[norm(r.title)] || 0) + r.received;
  scored = metrics.map(m => ({
    job_id: m.job_id || null,
    company: m.company, title: m.title || '', location: m.location || '',
    views: m.views, applies: m.applies || recByTitle[norm(m.title)] || 0,
    salary: m.j_salary || '', job_type: m.j_job_type || '', published: m.j_pub == null ? 1 : m.j_pub,
  }));
} else {
  // job_metrics 無し: 受信応募のみを疑似求人として扱う（露出は不明）
  scored = received.map(r => ({
    company: r.company, title: r.title, location: '', views: null, applies: r.received,
    salary: '', job_type: '', published: 1,
  }));
}

const base = scored.length ? scored.filter(j => j.applies >= 1).length / scored.length * 100 : 0;
const kwStat = {};
for (const j of scored) {
  for (const k of KEYWORDS) if ((j.title || '').includes(k)) {
    const g = kwStat[k] || (kwStat[k] = { n: 0, win: 0, apps: 0 });
    g.n++; if (j.applies >= 1) g.win++; g.apps += j.applies;
  }
}
const winKeywords = Object.entries(kwStat)
  .map(([k, g]) => ({ k, n: g.n, winPct: g.win / g.n * 100, apps: g.apps }))
  .filter(x => x.n >= MIN)
  .sort((a, b) => b.winPct - a.winPct || b.apps - a.apps);
const strongKw = winKeywords.filter(x => x.winPct > Math.max(base * 1.2, base + 5)).map(x => x.k);

P(`\n■ 応募に効くタイトル語（応募あり率の基準 ${base.toFixed(1)}% を上回る型）`);
if (winKeywords.length) {
  P('   ' + 'キーワード'.padEnd(12) + '件数'.padStart(4) + ' 応募計'.padStart(6) + ' 応募あり率'.padStart(9));
  for (const x of winKeywords.slice(0, 12)) {
    P('   ' + x.k.padEnd(13) + String(x.n).padStart(4) + String(x.apps).padStart(6) + (x.winPct.toFixed(0) + '%').padStart(9));
  }
  P(`   ◎ 勝ち型キーワード: ${strongKw.join(' / ') || '（有意差なし）'}`);
} else {
  P(`   （--min ${MIN} を満たすキーワードがありません。--min を下げて再実行してください）`);
}

// ── 3) 掲載中求人の分類 & 4) 改善提案 ──
if (metrics.length) {
  const published = scored.filter(j => j.published);
  const cat = { win: [], copy: [], expo: [], dead: [] };
  for (const j of published) {
    if (j.applies >= 1) cat.win.push(j);
    else if (j.views >= 30) cat.copy.push(j);       // 見られてるのに応募0 → コピー/条件
    else if (j.views > 0) cat.expo.push(j);         // 露出不足
    else cat.dead.push(j);                          // 表示0
  }
  P(`\n■ 掲載中求人の内訳（${published.length}件）`);
  P(`   ✅ 応募あり(勝ち):        ${cat.win.length}`);
  P(`   ✏️ 表示十分・応募0(コピー改善): ${cat.copy.length}`);
  P(`   📉 露出不足(表示<30):      ${cat.expo.length}`);
  P(`   🛑 表示0(要見直し/間引き): ${cat.dead.length}`);

  const recFor = (j) => {
    const recs = [];
    const missing = strongKw.filter(k => !(j.title || '').includes(k)).slice(0, 3);
    if (missing.length) recs.push(`タイトルに勝ち型「${missing.join('・')}」を追加`);
    const man = salaryMan(j.salary, j.title);
    if (man && !/月給|月収|年収|日給|時給/.test(j.title)) recs.push(`給与訴求をタイトルへ（例「月収${man}万円可」）`);
    if (!/未経験|経験不問|資格不問/.test(j.title)) recs.push('「未経験歓迎」等の間口ワードを追加');
    if (!/シニア|年齢不問|中高年|ブランク/.test(j.title)) recs.push('シニア/年齢不問の訴求を追加（シニア層の応募増）');
    return recs.slice(0, 3);
  };

  const showList = (title, arr, note) => {
    if (!arr.length) return;
    P(`\n▼ ${title}（${arr.length}件）${note ? ' — ' + note : ''}`);
    arr.sort((a, b) => (b.views || 0) - (a.views || 0));
    for (const j of arr.slice(0, 12)) {
      const lab = (COMPANY_LABEL[j.company] || j.company || '?').slice(0, 4);
      P(`   [${lab}] 表示${String(j.views).padStart(4)} 応募${j.applies}  ${(j.title || '').slice(0, 40)}`);
      for (const r of recFor(j)) P(`        → ${r}`);
    }
  };
  showList('コピー改善（表示はあるが応募0）', cat.copy, 'AI改善ループ(kyujinbox_autoloop --apply)の最優先対象');
  showList('露出改善（表示が伸びていない）', cat.expo, '勝ち型タイトルへ寄せる・画像追加・再掲で表示増を狙う');
  if (cat.dead.length) P(`\n▼ 表示0（${cat.dead.length}件）: 掲載枠を圧迫。勝ち型へ作り直すか間引きを推奨。`);
}

// ── 勝ち型ワードのタイトル自動反映 ──
// 応募0の掲載中求人タイトルへ、不足している勝ち型キーワードを付与する。
// 既定はドライラン（提案のみ）。--apply-titles でDBを更新する。
if (metrics.length && strongKw.length) {
  const targets = scored.filter(j => j.published && j.applies < 1 && j.job_id);
  const APPEND_TAGS = ['未経験歓迎', '年齢不問', 'シニア歓迎', '月給', '完全週休2日', 'ブランクOK'];
  const preferred = [...strongKw, ...APPEND_TAGS.filter(k => !strongKw.includes(k))];
  const plans = [];
  for (const j of targets) {
    const missing = preferred.filter(k => !(j.title || '').includes(k));
    let title = j.title || '';
    const added = [];
    for (const k of missing) {
      const cand = `${title}｜${k}`;
      if (cand.length > TITLE_MAX) continue;
      title = cand; added.push(k);
      if (added.length >= 2) break;
    }
    if (added.length) plans.push({ job_id: j.job_id, from: j.title, to: title, added });
  }
  P(`\n■ 勝ち型ワードのタイトル反映${APPLY_TITLES ? '（DB更新）' : '（ドライラン：--apply-titles で反映）'} — 対象${plans.length}件`);
  for (const pl of plans.slice(0, 15)) P(`   ＋[${pl.added.join('・')}]  ${pl.to.slice(0, 60)}`);
  if (APPLY_TITLES && plans.length) {
    const upd = db.prepare(`UPDATE jobs SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`);
    let n = 0;
    for (const pl of plans) n += upd.run(pl.to, pl.job_id).changes;
    P(`   → ${n}件のタイトルを更新しました。掲載管理タブから「求人ボックスに投稿」で反映してください。`);
  } else if (plans.length) {
    P('   → 反映するには --apply-titles を付けて再実行してください。');
  }
}

// ── まとめ ──
P('\n===== 打ち手サマリー =====');
if (strongKw.length) P(`1. 勝ち型キーワード（${strongKw.slice(0, 6).join('・')}）を、応募0の掲載中求人タイトルへ反映。`);
P('2. 「表示十分・応募0」を最優先で改善（node --experimental-sqlite scripts/kyujinbox_autoloop.js --company <co> --apply）。');
P('3. 「表示0/露出不足」は勝ち型タイトルへ寄せて再掲し、まず表示を作る（応募は表示にほぼ比例）。');
P('4. 効果は再度 kyujinbox_metrics.py 収集 → 本診断で確認。改善→計測を回す。');
if (!metrics.length) P('※ 現在 job_metrics 未収集のため露出分析は限定的。kyujinbox_metrics.py の収集を推奨。');

if (WRITE_MD) {
  const dir = path.join(__dirname, 'out');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `求人ボックス応募ブースト診断_${COMPANY}.md`);
  fs.writeFileSync(f, '```\n' + out.join('\n') + '\n```\n', 'utf8');
  console.log(`\nMarkdown保存: ${f}`);
}

db.close();
