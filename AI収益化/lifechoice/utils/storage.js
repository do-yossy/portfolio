/**
 * LIFE CHOICE ── UserPreference の永続化
 *
 * 「大阪・一人・3,000円」を1回設定すれば6機能すべてに反映される、
 * という本サービスの中核をここが担う。
 *
 * localStorage はプライベートブラウジング等で例外を投げる環境があるため、
 * 読み書きは必ず try/catch で囲み、失敗時は既定値で動作させる。
 *
 * @file utils/storage.js
 */

const KEY = 'lifechoice.preference.v1';

/** @type {import('../types/models.js').UserPreference} */
export const DEFAULT_PREFERENCE = {
  version: '1',
  location: { lat: null, lng: null, areaName: null },
  budget: 3000,
  transportation: 'walk',
  soloPreference: 3,
  conversationPreference: 3,
  reservationPreference: 3,
  preferredCategories: [],
  updatedAt: null
};

let memoryFallback = null;   // localStorage が使えない環境用

/** 保存済みの設定を読む。失敗しても既定値を返すので呼び出し側は例外を気にしなくてよい */
export function loadPreference() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFERENCE };
    const parsed = JSON.parse(raw);
    if (parsed.version !== DEFAULT_PREFERENCE.version) return migrate(parsed);
    return { ...DEFAULT_PREFERENCE, ...parsed, location: { ...DEFAULT_PREFERENCE.location, ...(parsed.location || {}) } };
  } catch (e) {
    return memoryFallback ? { ...memoryFallback } : { ...DEFAULT_PREFERENCE };
  }
}

/** 差分だけ渡せば統合して保存する */
export function savePreference(patch) {
  const next = {
    ...loadPreference(),
    ...patch,
    version: DEFAULT_PREFERENCE.version,
    updatedAt: new Date().toISOString().slice(0, 10)
  };
  if (patch && patch.location) {
    next.location = { ...loadPreference().location, ...patch.location };
  }
  memoryFallback = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    // 保存できない環境ではメモリ上のみ保持する（セッション内は反映される）
  }
  return next;
}

export function clearPreference() {
  memoryFallback = null;
  try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
}

/** 何か設定済みか（初回訪問の判定に使う） */
export function hasPreference() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return !!memoryFallback; }
}

/** 将来スキーマが変わったときの移行口 */
function migrate(old) {
  return { ...DEFAULT_PREFERENCE, ...old, version: DEFAULT_PREFERENCE.version };
}

/* ═══════════════════════════════════════════
 * 閲覧履歴（Phase 6のおすすめ・Phase 9の通知候補で使う）
 * ═══════════════════════════════════════════ */
const HISTORY_KEY = 'lifechoice.history.v1';
const HISTORY_MAX = 30;

export function pushHistory(entry) {
  try {
    const list = loadHistory();
    list.unshift({ ...entry, at: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch (e) { /* noop */ }
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch (e) { return []; }
}
