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

// 設定と同じく、localStorage が使えない環境ではメモリ上に保持する。
// ここが無いと、プライベートブラウジングで履歴だけ静かに消えて
// 設定は残る、という食い違いが起きる。
let historyFallback = null;

export function pushHistory(entry) {
  const list = loadHistory();
  list.unshift({ ...entry, at: Date.now() });
  const next = list.slice(0, HISTORY_MAX);
  historyFallback = next;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch (e) { /* メモリ上のみ */ }
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
    return historyFallback ? [...historyFallback] : [];
  } catch (e) {
    return historyFallback ? [...historyFallback] : [];
  }
}

/** 履歴を消す（設定画面から） */
export function clearHistory() {
  historyFallback = null;
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* noop */ }
}

/** 書き出したデータから履歴を復元する（importData から使う） */
function restoreHistory(list) {
  const next = list.slice(0, HISTORY_MAX);
  historyFallback = next;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch (e) { /* メモリ上のみ */ }
}

/* ═══════════════════════════════════════════
 * 自分で追加した品目
 *
 * 同梱の products.json は書き換えない（厳守事項2）。
 * 追加分だけをここに持ち、読み出すときに束ねる。
 * ═══════════════════════════════════════════ */
const CUSTOM_KEY = 'lifechoice.customProducts.v1';
const CUSTOM_MAX = 200;
let customFallback = null;

export function loadCustomProducts() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw) return JSON.parse(raw);
    return customFallback ? [...customFallback] : [];
  } catch (e) {
    return customFallback ? [...customFallback] : [];
  }
}

/** 追加または上書き。同じIDがあれば差し替える */
export function saveCustomProduct(product) {
  const list = loadCustomProducts().filter(p => p.id !== product.id);
  list.unshift(product);
  writeCustom(list.slice(0, CUSTOM_MAX));
  return product;
}

export function removeCustomProduct(id) {
  writeCustom(loadCustomProducts().filter(p => p.id !== id));
}

export function clearCustomProducts() {
  customFallback = null;
  try { localStorage.removeItem(CUSTOM_KEY); } catch (e) { /* noop */ }
}

function writeCustom(list) {
  customFallback = list;
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (e) { /* メモリ上のみ */ }
}

/* ═══════════════════════════════════════════
 * 書き出し・読み込み
 *
 * 保存先が localStorage だけなので、ブラウザを変えたり
 * 履歴を消したりすると設定が消える。持ち出せる形を用意しておく。
 * ═══════════════════════════════════════════ */

/** 設定と履歴をまとめてJSON文字列にする */
export function exportData() {
  return JSON.stringify({
    kind: 'lifechoice-backup',
    version: DEFAULT_PREFERENCE.version,
    exportedAt: new Date().toISOString().slice(0, 10),
    preference: loadPreference(),
    history: loadHistory(),
    customProducts: loadCustomProducts()
  }, null, 2);
}

/**
 * 書き出したJSONを読み込む。
 * 他所からコピーした文字列が入る可能性があるので、形を確かめてから反映する。
 *
 * @param {string} text
 * @returns {{ok:boolean, message:string}}
 */
export function importData(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: '読み取れませんでした。書き出した内容をそのまま貼り付けてください。' };
  }
  if (!parsed || parsed.kind !== 'lifechoice-backup') {
    return { ok: false, message: 'LIFE CHOICE の書き出しデータではないようです。' };
  }
  if (!parsed.preference || typeof parsed.preference !== 'object') {
    return { ok: false, message: '設定が含まれていません。' };
  }

  // 既定値にある項目だけを取り込む（余計なキーを持ち込ませない）
  const clean = {};
  Object.keys(DEFAULT_PREFERENCE).forEach(k => {
    if (k === 'version' || k === 'updatedAt') return;
    if (parsed.preference[k] !== undefined) clean[k] = parsed.preference[k];
  });
  savePreference(clean);

  if (Array.isArray(parsed.history)) restoreHistory(parsed.history);

  // 自作の品目も一緒に戻す。壊れた要素は落とす
  if (Array.isArray(parsed.customProducts)) {
    const clean = parsed.customProducts.filter(p =>
      p && typeof p.id === 'string' && typeof p.name === 'string' && Number.isFinite(p.newPrice));
    writeCustom(clean.slice(0, CUSTOM_MAX));
  }
  return { ok: true, message: '読み込みました。' };
}
