'use strict';
// 新規求人を「掲載実績の学び」で投稿前に最適化する（ブラウザ不要・API＋DBのみ）
//   node scripts/kyujinbox_enrich_new.js [--company sq|bg|all] [--apply] [--limit 25] [--days 1]
// 動作:
//   1) 対象会社の掲載実績（job_metrics＋applicants）から勝ちパターンを学習
//   2) 直近 --days 日に作成され、まだ最適化されていない求人ボックス向け求人を抽出
//   3) Claude(Sonnet)で新規求人を実績に寄せて最適化
//   --apply なし: ドライラン（改善案の提示のみ・DBは変更しない）
//   --apply あり: DBへ反映。以降、通常の自動投稿で最適化済みの内容が掲載される。
// 前提: .env に ANTHROPIC_API_KEY と、成績取得済みのDB（先に autoloop で成績を溜めておく）。

const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');

// ── .env 読み込み（server.js と同じ方式・最初の出現を採用）──
(function loadEnv() {
  const envFile = fs.existsSync(path.join(process.cwd(), '.env'))
    ? path.join(process.cwd(), '.env')
    : path.join(APP_DIR, '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim(), val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { db, COMPANIES } = require(path.join(APP_DIR, 'db.js'));
const optimizer = require(path.join(APP_DIR, 'lib', 'optimizer.js'));
const insights = require(path.join(APP_DIR, 'lib', 'insights.js'));

const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const APPLY = args.includes('--apply');
const COMPANY = getArg('--company', 'all');
const LIMIT = parseInt(getArg('--limit', '25'), 10);
const DAYS = parseInt(getArg('--days', '1'), 10);

const companyName = id => (COMPANIES.find(c => c.id === id) || {}).name || id;

// 直近作成・未最適化・求人ボックス向けの公開求人を抽出
function newJobs(company) {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  return db.prepare(`
    SELECT * FROM jobs
    WHERE company = ? AND is_published = 1
      AND target_media LIKE '%求人ボックス%'
      AND COALESCE(optimize_count, 0) = 0
      AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(company, since, LIMIT);
}

async function runCompany(id) {
  const name = companyName(id);
  console.log(`\n=== ${name} (${id}) ===`);

  const ins = insights.buildInsights(id);
  if (!ins.hasSignal) {
    console.log('  ⏭️ 応募実績がまだありません（成績を先に溜めてください）。今回はスキップします。');
    return { applied: 0, failed: 0, targets: 0 };
  }
  const summary = insights.summarize(ins);
  console.log('  📚 学習した実績:');
  for (const line of summary.split('\n')) console.log('    ' + line);

  const jobs = newJobs(id);
  console.log(`\n  🆕 最適化対象の新規求人: ${jobs.length}件${APPLY ? '（適用します）' : '（ドライラン: 提示のみ）'}`);

  let applied = 0, failed = 0;
  for (const job of jobs) {
    console.log(`\n  ▸ ${job.title.slice(0, 44)}…`);
    try {
      const improved = await optimizer.rewriteNewJob(job, summary);
      console.log(`    反映: ${improved.note || '(タイトル/本文/タグを実績に最適化)'}`);
      console.log(`      新タイトル: ${improved.title.slice(0, 50)}…`);
      if (APPLY) {
        optimizer.applyImprovement(job.id, improved);
        applied++;
        console.log('    ✅ DBへ適用しました（次回の自動投稿で反映）');
      }
    } catch (e) {
      failed++;
      console.log(`    ❌ 最適化に失敗: ${e.message}`);
      if (/ANTHROPIC_API_KEY/.test(e.message)) break;
    }
  }
  console.log(`\n  完了: 対象${jobs.length}件 / 適用${applied}件 / 失敗${failed}件`);
  return { applied, failed, targets: jobs.length };
}

(async () => {
  console.log('=== 求人ボックス 新規求人の実績反映（学習ループ）===');
  console.log(`モード: ${APPLY ? '適用(--apply)' : 'ドライラン'} / 対象: ${COMPANY} / 直近${DAYS}日 / 上限${LIMIT}件`);
  if (!(process.env.ANTHROPIC_API_KEY || '').trim() || (process.env.ANTHROPIC_API_KEY || '').startsWith('sk-ant-your')) {
    console.log('⚠️ ANTHROPIC_API_KEY が未設定です（.envに本物のAPIキーを設定してください）。');
  }
  const targets = COMPANY === 'all' ? COMPANIES.map(c => c.id) : [COMPANY];
  let total = { applied: 0, failed: 0, targets: 0 };
  for (const id of targets) {
    try {
      const r = await runCompany(id);
      total.applied += r.applied; total.failed += r.failed; total.targets += r.targets;
    } catch (e) { console.log(`  ❌ ${companyName(id)}: エラー: ${e.message}`); }
  }
  console.log(`\n=== 全体完了: 対象${total.targets}件 / 適用${total.applied}件 / 失敗${total.failed}件 ===`);
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
