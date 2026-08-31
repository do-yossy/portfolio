/**
 * LIFE CHOICE ── ⑤ ソロマップ（SOLO SCORE）
 *
 *   SOLO SCORE = 一人入りやすさ + 会話不要度 + 予約不要度 + 初心者安心度 + 滞在自由度
 *
 * 既存実装は3要素（solo / quiet / nobook）だったが、指示どおり5要素へ拡張。
 * 「いちばん避けたいこと」で重み付けが変わる仕組みは既存を踏襲する。
 *
 * @file lib/solo-score.js
 */

/** 各要素の重み。fear（避けたいこと）に応じて切り替える */
const WEIGHTS = {
  talk:     { solo: 1, conv: 3, res: 1, beginner: 1, stay: 1 },  // 話しかけられたくない
  eye:      { solo: 3, conv: 1, res: 1, beginner: 1, stay: 1 },  // 一人だと目立つのが嫌
  book:     { solo: 1, conv: 1, res: 3, beginner: 1, stay: 1 },  // 予約が面倒
  beginner: { solo: 1, conv: 1, res: 1, beginner: 3, stay: 1 },  // 初めてで不安
  stay:     { solo: 1, conv: 1, res: 1, beginner: 1, stay: 3 },  // ゆっくり居たい
  none:     { solo: 1, conv: 1, res: 1, beginner: 1, stay: 1 }
};

/** 避けたいことに対応する、重み3倍の項目。同点時の並べ替えにも使う */
const PRIMARY = {
  talk: 'conversationFreeScore',
  eye: 'soloScore',
  book: 'reservationFreeScore',
  beginner: 'beginnerScore',
  stay: 'stayFreedomScore',
  none: null
};

export const FEAR_OPTIONS = [
  { value: 'talk',     label: '店員に話しかけられる' },
  { value: 'eye',      label: '一人だと目立つ' },
  { value: 'book',     label: '予約が要る' },
  { value: 'beginner', label: '初めてで勝手が分からない' },
  { value: 'stay',     label: '長く居られない' },
  { value: 'none',     label: '特にない' }
];

/**
 * @param {import('../types/models.js').Store} store
 * @param {keyof WEIGHTS} fear
 * @returns {{score:number, breakdown:{label:string,value:number}[]}}
 */
export function calcSoloScore(store, fear = 'none') {
  const w = WEIGHTS[fear] || WEIGHTS.none;
  const primary = PRIMARY[fear] || null;
  const raw =
    store.soloScore * w.solo +
    store.conversationFreeScore * w.conv +
    store.reservationFreeScore * w.res +
    store.beginnerScore * w.beginner +
    store.stayFreedomScore * w.stay;
  const max = 5 * (w.solo + w.conv + w.res + w.beginner + w.stay);
  return {
    score: Math.round((raw / max) * 100),
    // 重み3倍で効いている項目に印を付ける（何が効いたかを画面で示すため）
    breakdown: [
      { label: '一人で入りやすい', value: store.soloScore,             weighted: primary === 'soloScore' },
      { label: '話しかけられない', value: store.conversationFreeScore, weighted: primary === 'conversationFreeScore' },
      { label: '予約が要らない',   value: store.reservationFreeScore,  weighted: primary === 'reservationFreeScore' },
      { label: '初めてでも安心',   value: store.beginnerScore,         weighted: primary === 'beginnerScore' },
      { label: 'ゆっくり居られる', value: store.stayFreedomScore,      weighted: primary === 'stayFreedomScore' }
    ],
    primaryValue: primary ? store[primary] : 0
  };
}

/**
 * 条件で絞ってスコア順に並べる
 * @param {import('../types/models.js').Store[]} stores
 * @param {{fear?:string, budget?:number, maxStayMinutes?:number}} opts
 */
export function rankSolo(stores, opts = {}) {
  const budget = opts.budget ?? 99999;
  const maxStay = opts.maxStayMinutes ?? 999;
  return stores
    .filter(s => s.budgetMin <= budget)
    .filter(s => s.estimatedStayMinutes <= maxStay * 1.3)
    .map(s => ({ store: s, ...calcSoloScore(s, opts.fear) }))
    // 同点のときは、避けたいことに直結する項目が高いほうを先に出す。
    // （5項目すべて満点の業態は同点のままになるため、画面側で「同率」と明示する）
    .sort((a, b) => b.score - a.score || b.primaryValue - a.primaryValue);
}
