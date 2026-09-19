#!/usr/bin/env node
'use strict';
/**
 * 合同会社スマイルライフ(sl)の求人ボックス求人(14件)のDB修正。
 *
 * 発見した問題(2026-09-19):
 * 1) 画像: 送迎ドライバー(乗用車でのお客様送迎)の求人にも配送トラック車列の画像
 *    (/images/haisou-fleet.jpg)が使われており、仕事内容と合っていなかった。
 *    → 送迎ドライバー分を /images/bi-secretary-driver.jpg（送迎向け）に変更。
 *    配送ドライバー分はそのままで内容と合っている。
 * 2) 文章の途切れ: rewarding(この仕事のやりがい)フィールドが空のまま投稿されており、
 *    kyujinbox_poster.pyのフォールバック(descriptionの先頭100字)がそのまま使われた結果、
 *    文の途中で切れた内容が実際の求人ボックス掲載に反映されていた。
 *    → 130字制限に収まる自然な文章をrewardingに設定。
 * 3) DBとライブ掲載の不一致: 「吹田市江坂町」の送迎ドライバー求人はDB上posted=falseだが
 *    実際には求人ボックスに掲載済み(求人番号2696-1190-0005)だったため、DBを実態に合わせる。
 *
 * 使い方: node scripts/fix-sl-jobs.js
 */
const path = require('path');
const fs = require('fs');
(function loadEnv() { const f = path.join(__dirname, '..', '.env'); if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split('\n').forEach(l => { l = l.trim(); if (!l || l.startsWith('#')) return;
    const i = l.indexOf('='); if (i < 0) return; const k = l.slice(0, i).trim(), v = l.slice(i + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v; }); })();

const { Jobs } = require('../db-factory');
const { db } = require('../db');

const REWARDING = {
  driver: '決まった拠点からの配送なので覚えやすく、未経験からでも安心してスタートできます。基本給36万円〜としっかりした固定給で、安定して働けることが魅力です。',
  chauffeur: 'お客様やスタッフの送迎を通じて「ありがとう」を直接いただける、やりがいのあるお仕事です。基本給36万円〜としっかりした固定給で、安定して働けます。',
};
const CHAUFFEUR_IMAGE = '/images/bi-secretary-driver.jpg';

// 2026-09-19、実際の求人ボックス掲載(diag-sl-list.py)で確認した実態
const REALITY_FIX = {
  '【吹田市江坂町】送迎ドライバー｜月給36万円〜・正社員・未経験歓迎': {
    kyujinbox_job_number: '2696-1190-0005',
    kyujinbox_posted_at: new Date().toISOString(),
  },
};

async function main() {
  const all = await Jobs.findAll();
  const slJobs = all.filter(j => j.company === 'sl');
  console.log(`対象: sl求人 ${slJobs.length}件\n`);

  let updated = 0;
  for (const j of slJobs) {
    const kind = j.job_type === '配送ドライバー' ? 'driver' : 'chauffeur';
    const patch = { rewarding: REWARDING[kind] };
    if (kind === 'chauffeur' && j.image_url !== CHAUFFEUR_IMAGE) {
      patch.image_url = CHAUFFEUR_IMAGE;
    }
    const reality = REALITY_FIX[j.title];
    if (reality && !j.kyujinbox_posted_at) {
      patch.kyujinbox_posted_at = reality.kyujinbox_posted_at;
    }
    await Jobs.update(j.id, patch);
    if (reality && !j.kyujinbox_posted_at) {
      db.prepare('UPDATE jobs SET kyujinbox_job_number = ? WHERE id = ?').run(reality.kyujinbox_job_number, j.id);
    }
    console.log(`✅ [${j.job_type}] ${j.title}`);
    console.log(`   image_url: ${patch.image_url || j.image_url}${patch.image_url ? ' (変更)' : ''}`);
    console.log(`   rewarding: ${patch.rewarding.slice(0, 40)}...`);
    if (reality) console.log(`   ⚡ DB/実態の不一致を修正: kyujinbox_job_number=${reality.kyujinbox_job_number}`);
    updated++;
  }
  console.log(`\n完了: ${updated}件更新`);
}

main().catch(err => { console.error(err); process.exit(1); });
