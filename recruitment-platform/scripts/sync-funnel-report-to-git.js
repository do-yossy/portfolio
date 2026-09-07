#!/usr/bin/env node
'use strict';
/**
 * daily-funnel-report.js の出力を、専用ブランチ reports/funnel-data へ自動push する。
 *
 * 【安全設計】
 *  - ユーザーのメイン作業ディレクトリ・作業ブランチには一切触れない。
 *    %USERPROFILE%\portfolio-funnel-sync という別ディレクトリに reports/funnel-data 専用の
 *    git worktree を作り、その中だけで fetch/commit/push を完結させる。
 *  - reports/funnel-data ブランチにはコード変更を一切含めない（reports/funnel/*.txt の追加のみ）。
 *    main や開発ブランチとはマージしないので、コンフリクトが起きようがない。
 *  - 何が起きても（git未設定・push失敗・ネットワーク断など）例外を握りつぶし、
 *    このスクリプト自体は必ず exit 0 で終わる。ローカルの logs\funnel-reports\*.txt への
 *    保存（daily-funnel-report.js 本体の仕事）を絶対に巻き込んで失敗させないため。
 *  - 送信されるのは daily-funnel-report.js の集計値（応募数・有効応募数等の数字と求人タイトル文字列）
 *    のみで、応募者の氏名・電話番号・メールアドレス等の個人情報は含まれない。
 *
 * 使い方: node scripts/sync-funnel-report-to-git.js <レポートファイルパス> <YYYY-MM-DD>
 *   （run-daily-funnel-report.bat から自動的に呼ばれる。単体実行も可能）
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const REPORT_PATH = process.argv[2];
const DATE = process.argv[3];
const BRANCH = 'reports/funnel-data';

function run(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' });
}

function main() {
  if (!REPORT_PATH || !DATE) {
    console.log('[sync-funnel-report-to-git] 引数不足のためスキップ（レポートファイルパス・日付が必要）');
    return;
  }
  if (!fs.existsSync(REPORT_PATH)) {
    console.log(`[sync-funnel-report-to-git] レポートファイルが見つからないためスキップ: ${REPORT_PATH}`);
    return;
  }

  const MAIN_REPO_ROOT = path.join(__dirname, '..', '..'); // recruitment-platform/scripts -> repo root
  const WORKTREE_DIR = path.join(os.homedir(), 'portfolio-funnel-sync');

  if (!fs.existsSync(WORKTREE_DIR)) {
    console.log('[sync-funnel-report-to-git] 初回セットアップ: worktreeを作成します...');
    run(`git fetch origin ${BRANCH}`, MAIN_REPO_ROOT);
    try {
      run(`git worktree add "${WORKTREE_DIR}" ${BRANCH}`, MAIN_REPO_ROOT);
    } catch {
      run(`git worktree add --track -b ${BRANCH} "${WORKTREE_DIR}" origin/${BRANCH}`, MAIN_REPO_ROOT);
    }
  } else {
    run(`git fetch origin ${BRANCH}`, WORKTREE_DIR);
    run(`git checkout ${BRANCH}`, WORKTREE_DIR);
    run(`git merge --ff-only origin/${BRANCH}`, WORKTREE_DIR);
  }

  const destDir = path.join(WORKTREE_DIR, 'recruitment-platform', 'reports', 'funnel');
  fs.mkdirSync(destDir, { recursive: true });
  const destFile = path.join(destDir, `${DATE}.txt`);
  fs.copyFileSync(REPORT_PATH, destFile);

  run(`git add "recruitment-platform/reports/funnel/${DATE}.txt"`, WORKTREE_DIR);
  try {
    run(`git commit -m "採用ファネル日次レポート ${DATE}"`, WORKTREE_DIR);
  } catch {
    console.log('[sync-funnel-report-to-git] コミットする変更なし（本日分は既にpush済みの可能性）');
    return;
  }
  run(`git push origin ${BRANCH}`, WORKTREE_DIR);
  console.log(`[sync-funnel-report-to-git] 完了: reports/funnel-data ブランチへ ${DATE}.txt をpushしました`);
}

try {
  main();
} catch (e) {
  console.log(`[sync-funnel-report-to-git] 同期に失敗しましたが、ローカル保存には影響ありません: ${e.message}`);
}
