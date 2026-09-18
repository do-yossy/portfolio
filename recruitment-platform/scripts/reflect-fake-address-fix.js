#!/usr/bin/env node
'use strict';
/**
 * logs/reflect-queue-<company>.json を読み、kyujinbox_reflect.py で実際の掲載へ反映する。
 * 2026-09-17、過去の架空住所を修正した701件（投稿済み分）を実際の求人ボックス掲載へ反映するために作成。
 *
 * 使い方: node scripts/reflect-fake-address-fix.js --company sq
 *         node scripts/reflect-fake-address-fix.js --all   （全社を順番に・時間がかかります）
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

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
const ALL = args.includes('--all');
const COMPANY = getArg('--company', null);
const LIMIT = parseInt(getArg('--limit', '0'), 10) || 0;
const OFFSET = parseInt(getArg('--offset', '0'), 10) || 0;
const ONLY = getArg('--only', null); // カンマ区切りの求人番号を指定して、その求人だけ再試行する
const QUEUE_PREFIX = getArg('--queue-prefix', 'reflect-queue'); // logs/<prefix>-<co>.json を使う
const PYTHON = getArg('--python', 'C:\\Users\\sqtan\\AppData\\Local\\Programs\\Python\\Python312\\python.exe');

function credsFor(co) {
  const up = co.toUpperCase();
  return {
    KYUJINBOX_EMAIL: process.env[`KYUJINBOX_EMAIL_${up}`] || '',
    KYUJINBOX_PASSWORD: process.env[`KYUJINBOX_PASSWORD_${up}`] || '',
    KYUJINBOX_GROUP_ID: process.env[`KYUJINBOX_GROUP_ID_${up}`] || '',
  };
}

function runOne(co) {
  const queuePath = path.join(APP_DIR, 'logs', `${QUEUE_PREFIX}-${co}.json`);
  if (!fs.existsSync(queuePath)) { console.log(`[${co}] キューファイルが無いためスキップ: ${queuePath}`); return; }
  const jobs0 = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  let jobs = jobs0;
  if (ONLY) {
    const nums = new Set(ONLY.split(',').map(s => s.trim()));
    jobs = jobs0.filter(j => nums.has(j.jobNumber));
  } else {
    const sliced = OFFSET > 0 ? jobs0.slice(OFFSET) : jobs0;
    jobs = LIMIT > 0 ? sliced.slice(0, LIMIT) : sliced;
  }
  if (jobs.length === 0) { console.log(`[${co}] 対象0件`); return; }
  const creds = credsFor(co);
  if (!creds.KYUJINBOX_EMAIL || !creds.KYUJINBOX_PASSWORD || !creds.KYUJINBOX_GROUP_ID) {
    console.log(`[${co}] 認証情報が.envに無いためスキップ`); return;
  }
  console.log(`\n=== [${co}] ${jobs.length}件を実際の掲載へ反映します ===`);
  const script = path.join(__dirname, 'kyujinbox_reflect.py');
  const r = spawnSync(PYTHON, [script], {
    env: { ...process.env, ...creds, APPLY: '1', HEADLESS: '1' },
    cwd: APP_DIR,
    input: JSON.stringify(jobs.map(({ id, ...rest }) => rest)),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 3 * 60 * 60 * 1000, // 3時間
  });
  for (const line of (r.stdout || '').split('\n')) {
    try {
      const o = JSON.parse(line);
      if (o.type === 'progress') console.log(`  [${co}] ${o.message}`);
      if (o.type === 'reflected') console.log(`  [${co}] ✅ ${o.jobNumber} saved=${o.saved}`);
    } catch { /* skip non-JSON lines */ }
  }
  if (r.stderr) console.log(`  [${co}] stderr: ${r.stderr.slice(0, 2000)}`);
  console.log(`[${co}] 完了（exit code ${r.status}）`);
}

(async () => {
  if (ALL) {
    for (const co of ['sq', 'bg', 'st', 'bi', 'nl']) runOne(co);
  } else if (COMPANY) {
    runOne(COMPANY);
  } else {
    console.log('使い方: --company <sq|bg|st|bi|nl> または --all');
    process.exit(1);
  }
  console.log('\n=== すべて完了 ===');
})();
