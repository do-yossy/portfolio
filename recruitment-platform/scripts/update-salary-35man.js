#!/usr/bin/env node
'use strict';
/**
 * 既存の軽貨物宅配ドライバー求人の給与を月収35万円以上に更新
 * 実行: node --experimental-sqlite scripts/update-salary-35man.js
 */

const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { DatabaseSync } = require('node:sqlite');
const dbPath = path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(dbPath);

// ── 1. 軽貨物宅配ドライバー（seed-haiso形式）──
const haisoJobs = db.prepare("SELECT id, title, salary, description, faq FROM jobs WHERE title LIKE '%月収30万円以上%'").all();

// ── 2. 正社員で月給35万円未満の求人 ──
const allSeishaJobs = db.prepare(`SELECT id, title, salary, description, faq FROM jobs WHERE employment_type = '正社員'`).all();
const lowSalaryJobsFallback = allSeishaJobs.filter(j => {
  const m = j.salary.match(/月給(\d+)万円/);
  return m && parseInt(m[1]) < 35;
});

const allTarget = [...haisoJobs, ...lowSalaryJobsFallback];

// deduplicate by id
const seen = new Set();
const jobs = allTarget.filter(j => { if (seen.has(j.id)) return false; seen.add(j.id); return true; });

console.log(`\n対象求人: ${jobs.length}件（月収30万形式: ${haisoJobs.length}件, 低給与正社員: ${lowSalaryJobsFallback.length}件）\n`);

let updated = 0;
const now = new Date().toISOString();

for (const job of jobs) {
  let newSalary = job.salary;
  let newTitle  = job.title;
  let newDesc   = job.description;
  let newFaq    = job.faq;

  if (job.title.includes('月収30万円以上') || job.salary === '月給270,000円〜400,000円') {
    // seed-haiso形式
    newSalary = '月給350,000円〜500,000円';
    newTitle  = job.title.replace(/月収30万円以上/g, '月収35万円以上');
    newDesc   = job.description
      .replace(/基本給 270,000円/g, '基本給 350,000円')
      .replace(/月収実績：平均320,000円〜360,000円/g, '月収実績：平均380,000円〜430,000円');
    try {
      const faqArr = JSON.parse(job.faq || '[]');
      newFaq = JSON.stringify(faqArr.map(f => ({
        ...f,
        q: (f.q || '').replace(/月収30万円以上/g, '月収35万円以上'),
        a: (f.a || '').replace(/基本給27万円/g, '基本給35万円').replace(/月平均32万円以上/g, '月平均38万円以上'),
      })));
    } catch {}
  } else {
    // 月給X万円〜Y万円 形式の給与を35万円以上に底上げ
    const m = job.salary.match(/^(月給)(\d+)万円〜(\d+)万円(.*)$/);
    if (m) {
      const minM = parseInt(m[2]);
      const maxM = parseInt(m[3]);
      const suffix = m[4] || '';
      const newMin = Math.max(minM, 35);
      const diff   = maxM - minM;
      const newMax = newMin + diff;
      newSalary = `月給${newMin}万円〜${newMax}万円${suffix}`;
    }
  }

  db.prepare(`UPDATE jobs SET title=?, salary=?, description=?, faq=?, updated_at=? WHERE id=?`)
    .run(newTitle, newSalary, newDesc, newFaq, now, job.id);

  console.log(`  ✅ 更新: ${newTitle}`);
  console.log(`     給与: ${job.salary} → ${newSalary}`);
  updated++;
}

console.log(`\n📊 更新完了: ${updated}件`);
