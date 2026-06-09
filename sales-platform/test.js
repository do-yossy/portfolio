'use strict';
// 依存ゼロのスモークテスト： node test.js
const L = require('./logic');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name); } };

// scoreFromText
const s = L.scoreFromText('美容サロン向けのLP制作。予算5万円、参考サイトあり https://example.com 来店予約を増やしたい。', { source: 'lancers' });
ok(s.type === 'LP', 'type=LP を検出');
ok(s.budget === 50000, '予算 5万 を検出 (' + s.budget + ')');
ok(s.score >= 0 && s.score <= 100, 'スコアが0-100');
ok(['S', 'A', 'B', '見送り'].includes(s.priority), '優先度が有効');

// 低単価フラグ
const low = L.scoreFromText('簡単な作業 単価2000円', {});
ok(low.priority === '見送り', '極端低単価は見送り');

// quote
const q = L.quote({ type: 'corp', options: ['cms', 'seo'], channel: 'lancers', est_hours: 24, cost: 0 });
ok(q.total === 120000 + 40000 + 15000, '見積合計 (' + q.total + ')');
ok(q.fee === Math.round(q.total * 0.165), 'ランサーズ手数料16.5%');
ok(q.net === q.total - q.fee, '受取=合計-手数料');

// mediaFee
ok(L.mediaFee(100000, 'lp') === 0, 'LP直契約は手数料0');
ok(L.mediaFee(250000, 'crowdworks') === 32500, 'CW段階手数料 (' + L.mediaFee(250000, 'crowdworks') + ')');
ok(L.mediaFee(100000, 'coconala') === 22000, 'ココナラ手数料22% (' + L.mediaFee(100000, 'coconala') + ')');

// proposal
const p = L.proposal({ title: 'テスト案件', type: 'system', industry: '医療', amount: 200000 });
ok(p.includes('テスト案件') && p.includes('医療'), '提案文に変数差し込み');

// stages
ok(L.STAGES.length === 7 && L.stageProb('won') === 1, 'ステージ定義');

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'}  ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
