'use strict';
// GATE1〜10 の定義（AI商品化実践システム本編と一致させる）
// usePrompt: GATE判定に使うレビュー（本編の表記のまま）
// steps: そのGATEで使う順番のプロンプト番号（各プロンプトの「使うタイミング」に基づく）
// extra: 必要な人だけ使うプロンプト / external: アプリ未収録の参考資料
module.exports = [
  { no: 1, name: '商品選定', phase: 'PHASE1', usePrompt: 'No.25', steps: [1, 2, 3, 25] },
  { no: 2, name: '市場検証', phase: 'PHASE1→2間', usePrompt: '市場検証・収益モデルガイド', steps: [29], external: '市場検証・収益モデルガイド' },
  { no: 3, name: '商品コンセプト', phase: 'PHASE2', usePrompt: 'No.19', steps: [4, 5, 19] },
  { no: 4, name: '商品構成', phase: 'PHASE2〜3', usePrompt: 'No.20', steps: [6, 20] },
  { no: 5, name: '商品完成', phase: 'PHASE3', usePrompt: 'No.26 / No.27', steps: [26, 27], extra: [7, 8, 9] },
  { no: 6, name: '販売ページ', phase: 'PHASE4', usePrompt: 'No.21', steps: [12, 21], setupLink: { href: '/product#payment', text: 'お客様からの代金の受け取り方を設定する' } },
  { no: 7, name: '販売導線', phase: 'PHASE4', usePrompt: '販売開始チェックリスト', steps: [], external: '販売開始チェックリスト', setupLink: { href: '/product#payment', text: 'お客様からの代金の受け取り方を設定する' } },
  { no: 8, name: 'SNS・販売', phase: 'PHASE5', usePrompt: 'No.22', steps: [11, 10, 22], extra: [13] },
  { no: 9, name: 'KPI・改善', phase: 'PHASE6', usePrompt: 'No.14 / No.15', steps: [14, 15] },
  { no: 10, name: '商品2', phase: 'PHASE7', usePrompt: 'No.25（再利用）', steps: [16, 25] },
];

// ロードマップ上のまとまり（表示用）
module.exports.STAGES = [
  { title: '商品を決める', sub: 'PHASE1', gates: [1, 2] },
  { title: '商品をつくる', sub: 'PHASE2〜3', gates: [3, 4, 5] },
  { title: '売る準備をする', sub: 'PHASE4', gates: [6, 7] },
  { title: '売って、数字で直す', sub: 'PHASE5〜6', gates: [8, 9] },
  { title: '次の商品へ', sub: 'PHASE7', gates: [10] },
];

// GATEから今のPHASE（選択肢表記）への対応
module.exports.PHASE_OF_GATE = { 1: 'PHASE1', 2: 'PHASE1', 3: 'PHASE2', 4: 'PHASE2', 5: 'PHASE3', 6: 'PHASE4', 7: 'PHASE4', 8: 'PHASE5', 9: 'PHASE6', 10: 'PHASE7' };
