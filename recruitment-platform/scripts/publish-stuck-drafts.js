#!/usr/bin/env node
'use strict';
/**
 * 求人ボックスへの投稿処理(kyujinbox_poster.py)は、稀に「公開する」の確認モーダルまで
 * 到達せず下書き止まりになることがある(2026-09-19、スマイルライフで複数回確認)。
 * 根本原因はレガシーな投稿フロー内の分岐にあり完全特定には至っていないため、
 * 投稿処理の後に必ずこのスイープを実行し、下書きが残っていれば
 * 動作実績のあるkyujinbox_reflect.py経由で「公開する」まで反映させる安全網。
 *
 * 使い方: node scripts/publish-stuck-drafts.js --company sl
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const APP_DIR = path.join(__dirname, '..');
(function loadEnv() {
  const f = path.join(APP_DIR, '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split('\n').forEach(l => {
    l = l.trim(); if (!l || l.startsWith('#')) return;
    const i = l.indexOf('='); if (i < 0) return;
    const k = l.slice(0, i).trim(), v = l.slice(i + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  });
})();

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const COMPANY = getArg('--company', null);
const PYTHON = getArg('--python', 'C:/Users/sqtan/AppData/Local/Programs/Python/Python312/python.exe');

if (!COMPANY) { console.log('使い方: --company <co>'); process.exit(1); }

function credsFor(co) {
  const up = co.toUpperCase();
  return {
    KYUJINBOX_EMAIL: process.env[`KYUJINBOX_EMAIL_${up}`] || '',
    KYUJINBOX_PASSWORD: process.env[`KYUJINBOX_PASSWORD_${up}`] || '',
    KYUJINBOX_GROUP_ID: process.env[`KYUJINBOX_GROUP_ID_${up}`] || '',
  };
}

function main() {
  const creds = credsFor(COMPANY);
  if (!creds.KYUJINBOX_EMAIL || !creds.KYUJINBOX_PASSWORD || !creds.KYUJINBOX_GROUP_ID) {
    console.log(`[${COMPANY}] 認証情報が.envに無いためスキップ`);
    return;
  }

  console.log(`[${COMPANY}] 下書き一覧を取得中...`);
  const listScript = path.join(__dirname, 'kyujinbox_poster.py');
  const r = spawnSync(PYTHON, [listScript], {
    env: { ...process.env, ...creds },
    cwd: APP_DIR,
    input: JSON.stringify({ mode: 'list_drafts' }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  let drafts = [];
  for (const line of (r.stdout || '').split('\n')) {
    try {
      const o = JSON.parse(line);
      if (o.type === 'drafts') drafts = o.items || [];
    } catch { /* progress行等はスキップ */ }
  }
  if (drafts.length === 0) {
    console.log(`[${COMPANY}] 下書きはありませんでした`);
    return;
  }
  console.log(`[${COMPANY}] 候補 ${drafts.length}件（実際は公開済みの場合も含む。reflect側が自動判別）`);

  const db = new DatabaseSync(path.join(process.env.DATA_DIR || path.join(APP_DIR, 'data'), 'recruitment.db'));
  const queue = [];
  for (const d of drafts) {
    if (!d.title) continue;
    const job = db.prepare('SELECT rewarding, image_url FROM jobs WHERE company=? AND title=?').get(COMPANY, d.title);
    if (!job) { console.log(`  ⚠️ DBに該当求人が見つかりません: ${d.title.slice(0, 30)}`); continue; }
    const entry = { jobNumber: d.jobNumber };
    if (job.rewarding) entry.rewarding = job.rewarding;
    if (job.image_url && !job.image_url.startsWith('http')) {
      const local = path.join(APP_DIR, 'public', job.image_url.replace(/^\//, ''));
      if (fs.existsSync(local)) entry.imagePath = local;
    }
    queue.push(entry);
  }
  if (queue.length === 0) {
    console.log(`[${COMPANY}] DB照合できた対象が無いため終了`);
    return;
  }
  const logsDir = path.join(APP_DIR, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, `sweep-queue-${COMPANY}.json`), JSON.stringify(queue, null, 2));

  console.log(`[${COMPANY}] ${queue.length}件を公開反映します...`);
  const reflectDriver = path.join(__dirname, 'reflect-fake-address-fix.js');
  const r2 = spawnSync(process.execPath, [reflectDriver, '--company', COMPANY, '--queue-prefix', 'sweep-queue', '--python', PYTHON], {
    cwd: APP_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000,
  });
  console.log(r2.stdout || '');
  if (r2.stderr) console.log('stderr:', r2.stderr.slice(0, 2000));
}

main();
