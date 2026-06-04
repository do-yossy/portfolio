'use strict';
// サンプル案件を投入（既にデータがあればスキップ）。 node seed.js
const { Deals } = require('./db');
if (Deals.findAll().length > 0) { console.log('既にデータがあります。スキップ。'); process.exit(0); }
const samples = [
  { title: 'クリニック予約管理システム', source: 'lancers', type: 'system', stage: 'meeting', amount: 220000, score: 82, priority: 'S', pred_win_rate: 66, next_action: '要件の優先順位をヒアリング' },
  { title: 'カフェLP（LP問い合わせ）', source: 'lp', type: 'LP', stage: 'build', amount: 50000, score: 75, priority: 'S', pred_win_rate: 80, next_action: 'FV初稿を作成' },
  { title: '工務店コーポレートサイト', source: 'crowdworks', type: 'corp', stage: 'applied', amount: 120000, score: 60, priority: 'A', pred_win_rate: 48, next_action: '返信待ち' },
  { title: 'AI文章添削ツール PoC', source: 'lp', type: 'ai', stage: 'lead', amount: 300000, score: 71, priority: 'A', pred_win_rate: 57, next_action: 'スコープ一次見積もり' },
  { title: 'アパレルECサイト', source: 'lancers', type: 'ec', stage: 'won', amount: 300000, score: 80, priority: 'S', pred_win_rate: 64, profit_rate: 60, maintenance: 20000, next_action: '保守運用中' },
  { title: '美容LP（相見積）', source: 'crowdworks', type: 'LP', stage: 'lost', amount: 50000, score: 55, priority: 'B', pred_win_rate: 40, next_action: '価格負け' }
];
samples.forEach(s => Deals.create(s));
console.log(`${samples.length}件を投入しました。`);
