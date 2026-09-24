'use strict';
// GATE1〜10 の定義（AI商品化実践システム本編と一致させる）
module.exports = [
  { no: 1, name: '商品選定', phase: 'PHASE1', usePrompt: 'No.25' },
  { no: 2, name: '市場検証', phase: 'PHASE1→2間', usePrompt: '市場検証・収益モデルガイド' },
  { no: 3, name: '商品コンセプト', phase: 'PHASE2', usePrompt: 'No.19' },
  { no: 4, name: '商品構成', phase: 'PHASE2〜3', usePrompt: 'No.20' },
  { no: 5, name: '商品完成', phase: 'PHASE3', usePrompt: 'No.26 / No.27' },
  { no: 6, name: '販売ページ', phase: 'PHASE4', usePrompt: 'No.21' },
  { no: 7, name: '販売導線', phase: 'PHASE4', usePrompt: '販売開始チェックリスト' },
  { no: 8, name: 'SNS・販売', phase: 'PHASE5', usePrompt: 'No.22' },
  { no: 9, name: 'KPI・改善', phase: 'PHASE6', usePrompt: 'No.14 / No.15' },
  { no: 10, name: '商品2', phase: 'PHASE7', usePrompt: 'No.25（再利用）' },
];
