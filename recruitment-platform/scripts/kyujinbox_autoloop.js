'use strict';
// 求人ボックス 自動改善ループ CLI（スケジュール実行用）
//   node scripts/kyujinbox_autoloop.js [--company sq|bg|all] [--apply] [--limit 20]
// 動作: 成績取得 → 低調求人の検知 → Claude(Sonnet)で改善案生成 → （--apply時）DBへ反映
//   --apply なし: ドライラン（検知と改善案の提示のみ・DBは変更しない）
//   --apply あり: 改善をDBに適用（自社サイトへ即反映）。求人ボックスへの反映は別途 restart→掲載更新。
// 前提: .env に会社別の求人ボックス認証(KYUJINBOX_*_<CO>)と ANTHROPIC_API_KEY が設定済み。

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const APP_DIR = path.join(__dirname, '..');

// ── .env 読み込み（server.js と同じ方式）──
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

const optimizer = require(path.join(APP_DIR, 'lib', 'optimizer.js'));
const insights = require(path.join(APP_DIR, 'lib', 'insights.js'));
const { COMPANIES } = require(path.join(APP_DIR, 'db.js'));

// ── 引数 ──
const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const APPLY = args.includes('--apply');
const PUSH = args.includes('--push');            // 改善内容を求人ボックス掲載へ反映（既定はドライラン）
const PUSH_SAVE = args.includes('--push-save');  // 反映時に実際に保存する（未指定＝入力＋スクショのみ）
const ENRICH = args.includes('--enrich');        // 新規求人を掲載実績の学びで先回り最適化する
const COMPANY = getArg('--company', 'all');
const LIMIT = parseInt(getArg('--limit', '20'), 10);
const ENRICH_DAYS = parseInt(getArg('--enrich-days', '1'), 10);

// ── 会社別の求人ボックス認証情報を解決（server.js と同じ規則）──
function credsForCompany(id) {
  const co = String(id || 'sq').toUpperCase();
  const pick = base => (process.env[`${base}_${co}`] || '').trim() || (process.env[base] || '').trim();
  const email = pick('KYUJINBOX_EMAIL'), pw = pick('KYUJINBOX_PASSWORD'), gid = pick('KYUJINBOX_GROUP_ID');
  const env = {};
  if (email) env.KYUJINBOX_EMAIL = email;
  if (pw) env.KYUJINBOX_PASSWORD = pw;
  if (gid) env.KYUJINBOX_GROUP_ID = gid;
  return { env, hasCreds: !!(email && pw && gid) };
}
const companyName = id => (COMPANIES.find(c => c.id === id) || {}).name || id;

// ── Python 実行コマンドの簡易検出 ──
function detectPython() {
  const cands = [];
  if ((process.env.PYTHON_PATH || '').trim()) cands.push([process.env.PYTHON_PATH.trim()]);
  if (process.platform === 'win32') { for (const v of ['3.12', '3.11', '3.13']) cands.push(['py', `-${v}`]); }
  cands.push(['python']); cands.push(['python3']);
  const TEST = 'from playwright.sync_api import sync_playwright';
  for (const c of cands) {
    try {
      const r = spawnSync(c[0], [...c.slice(1), '-c', TEST], { timeout: 12000, windowsHide: true });
      if (r && r.status === 0) return c;
    } catch { /* next */ }
  }
  return ['python'];
}

async function runCompany(pyCmd, id) {
  const { env, hasCreds } = credsForCompany(id);
  const name = companyName(id);
  if (!hasCreds) { console.log(`\n⏭️  ${name}: 求人ボックス認証(.env)が未設定のためスキップ`); return; }

  console.log(`\n=== ${name} (${id}) ===`);
  console.log('📊 成績を取得中...（ブラウザが起動します）');
  const script = path.join(__dirname, 'kyujinbox_metrics.py');
  const proc = spawnSync(pyCmd[0], [...pyCmd.slice(1), script], {
    env: { ...process.env, ...env },
    cwd: APP_DIR,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
  });
  // 進捗ログを軽く表示
  for (const line of (proc.stdout || '').split('\n')) {
    try { const o = JSON.parse(line); if (o.type === 'progress') console.log('  ' + o.message); } catch { /* skip */ }
  }
  const metricsFile = path.join(APP_DIR, 'logs', 'kyujinbox_metrics.json');
  if (!fs.existsSync(metricsFile)) { console.log('  ⚠️ 成績ファイルが生成されませんでした（ログイン失敗の可能性）'); return; }
  const rows = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
  const stored = optimizer.storeMetrics(id, rows);
  console.log(`  ✅ 取得 ${stored.stored}件（DB求人と突合 ${stored.matched}件）`);

  const flags = optimizer.detectUnderperformers(id, {
    minAgeDays: parseInt(process.env.OPT_MIN_AGE_DAYS || '3', 10),
    maxAgeDays: parseInt(process.env.OPT_MAX_AGE_DAYS || '0', 10), // 0=上限なし。例:21で掲載3週間以内のみ
    viewFloor: parseInt(process.env.OPT_VIEW_FLOOR || '30', 10),
    cooldownDays: parseInt(process.env.OPT_COOLDOWN_DAYS || '5', 10),
    maxOptimize: parseInt(process.env.OPT_MAX_COUNT || '3', 10),
    limit: LIMIT,
  });
  console.log(`🔎 要改善の求人: ${flags.length}件${APPLY ? '（改善を適用します）' : '（ドライラン: 提示のみ）'}`);

  const { db } = require(path.join(APP_DIR, 'db.js'));
  let applied = 0, failed = 0;
  const appliedJobs = [];
  for (const f of flags) {
    const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(f.jobId);
    if (!job) continue;
    console.log(`\n  ▸ ${job.title.slice(0, 42)}…`);
    console.log(`    ${f.reason}`);
    try {
      const improved = await optimizer.rewriteJob(job, f.diagnosis, f.reason);
      console.log(`    改善案: ${improved.note || '(タイトル/本文/タグを最適化)'}`);
      console.log(`      新タイトル: ${improved.title.slice(0, 48)}…`);
      if (APPLY) {
        optimizer.applyImprovement(job.id, improved); applied++;
        console.log('    ✅ DBへ適用しました');
        const jn = (job.kyujinbox_job_number || f.jobNumber || '').trim();
        if (jn) appliedJobs.push({ jobNumber: jn, title: improved.title, description: improved.description, rewarding: improved.rewarding });
      }
    } catch (e) {
      failed++;
      console.log(`    ❌ 改善生成に失敗: ${e.message}`);
      if (/ANTHROPIC_API_KEY/.test(e.message)) break; // キー未設定なら以降も失敗するので中断
    }
  }
  console.log(`\n  完了: 検知${flags.length}件 / 適用${applied}件 / 失敗${failed}件`);
  if (APPLY && applied > 0) console.log('  ℹ️ 自社サイト(DB)へ反映済み');

  // ── 求人ボックス掲載への反映（--push） ──
  if (PUSH && appliedJobs.length > 0) {
    console.log(`\n  📤 求人ボックス掲載へ反映${PUSH_SAVE ? '（保存する）' : '（ドライラン: 入力＋スクショのみ・保存しない）'}: ${appliedJobs.length}件`);
    const reflectScript = path.join(__dirname, 'kyujinbox_reflect.py');
    const rp = spawnSync(pyCmd[0], [...pyCmd.slice(1), reflectScript], {
      env: { ...process.env, ...env, APPLY: PUSH_SAVE ? '1' : '0' },
      cwd: APP_DIR, input: JSON.stringify(appliedJobs), encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024, timeout: 25 * 60 * 1000,
    });
    for (const line of (rp.stdout || '').split('\n')) {
      try { const o = JSON.parse(line); if (o.type === 'progress') console.log('    ' + o.message); } catch { /* skip */ }
    }
  } else if (PUSH && appliedJobs.length === 0) {
    console.log('  （反映対象なし。--push は --apply と併用し、求人番号が紐付いた求人が対象です）');
  }

  // ── 新規求人を掲載実績の学びで先回り最適化（--enrich） ──
  if (ENRICH) {
    const ins = insights.buildInsights(id);
    if (!ins.hasSignal) {
      console.log('\n  🆕 新規求人の実績反映: 応募実績がまだ無いためスキップ');
    } else {
      const summary = insights.summarize(ins);
      const since = new Date(Date.now() - ENRICH_DAYS * 86400000).toISOString();
      const newer = db.prepare(`
        SELECT * FROM jobs
        WHERE company = ? AND is_published = 1 AND target_media LIKE '%求人ボックス%'
          AND COALESCE(optimize_count, 0) = 0 AND created_at >= ?
        ORDER BY created_at DESC LIMIT ?
      `).all(id, since, LIMIT);
      console.log(`\n  🆕 新規求人を実績で最適化: ${newer.length}件${APPLY ? '（適用）' : '（ドライラン）'}`);
      let en = 0, ef = 0;
      for (const job of newer) {
        console.log(`    ▸ ${job.title.slice(0, 40)}…`);
        try {
          const improved = await optimizer.rewriteNewJob(job, summary);
          console.log(`      ${improved.note || '実績に最適化'} → ${improved.title.slice(0, 40)}…`);
          if (APPLY) { optimizer.applyImprovement(job.id, improved); en++; }
        } catch (e) {
          ef++;
          console.log(`      ❌ ${e.message}`);
          if (/ANTHROPIC_API_KEY/.test(e.message)) break;
        }
      }
      console.log(`  新規最適化 完了: 対象${newer.length}件 / 適用${en}件 / 失敗${ef}件`);
    }
  }
}

(async () => {
  console.log('=== 求人ボックス 自動改善ループ ===');
  console.log(`モード: ${APPLY ? '適用(--apply)' : 'ドライラン'} / 対象: ${COMPANY} / 1社あたり上限: ${LIMIT}件`);
  if (!(process.env.ANTHROPIC_API_KEY || '').trim() || (process.env.ANTHROPIC_API_KEY || '').startsWith('sk-ant-your')) {
    console.log('⚠️ ANTHROPIC_API_KEY が未設定です。改善案の生成にはClaude APIキーが必要です（.envに設定してください）。');
  }
  const pyCmd = detectPython();
  console.log('使用Python:', pyCmd.join(' '));

  const targets = COMPANY === 'all'
    ? COMPANIES.map(c => c.id).filter(id => credsForCompany(id).hasCreds)
    : [COMPANY];
  if (targets.length === 0) { console.log('対象会社がありません（.envの認証設定を確認してください）。'); process.exit(0); }

  for (const id of targets) {
    try { await runCompany(pyCmd, id); }
    catch (e) { console.log(`  ❌ ${companyName(id)}: エラー: ${e.message}`); }
  }
  console.log('\n=== すべて完了 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
