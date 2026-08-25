/**
 * LIFE CHOICE ── DataProvider
 *
 * 6機能すべてがこのモジュール経由でデータを取得する。
 * 実装を差し替えるだけで、同梱JSON → API → 提携フィード へ移行できる。
 *
 *   StaticDataProvider    同梱JSONを読む（現在これ）
 *   ApiDataProvider       自社/公開APIを叩く（要サーバー）
 *   PartnerDataProvider   提携先フィード（ASPの商品フィード等）
 *   ScrapingDataProvider  ★枠のみ。実装は保留（規約リスク）
 *
 * @file lib/data-provider.js
 */

/** 同梱JSONの配置場所（app/*.html から見た相対パス） */
const DATA_BASE = '../data/';

/** 取得済みデータのメモリキャッシュ（同一セッション内で再取得しない） */
const cache = new Map();

async function loadJson(file) {
  if (cache.has(file)) return cache.get(file);
  const res = await fetch(DATA_BASE + file, { cache: 'no-cache' });
  if (!res.ok) throw new Error('データ取得に失敗しました: ' + file + ' (' + res.status + ')');
  const json = await res.json();
  cache.set(file, json);
  return json;
}

/* ═══════════════════════════════════════════════
 * StaticDataProvider ── 同梱JSON
 * ═══════════════════════════════════════════════ */
export const StaticDataProvider = {
  async getProducts() {
    return loadJson('products.json');
  },

  async getRentals(productId) {
    const all = await loadJson('rentals.json');
    return productId ? all.filter(r => r.productId === productId) : all;
  },

  /**
   * @param {{category?:string, maxBudget?:number, openAt?:number}} [opts]
   */
  async getStores(opts = {}) {
    let list = await loadJson('stores.json');
    if (opts.category) list = list.filter(s => s.category === opts.category);
    if (typeof opts.maxBudget === 'number') list = list.filter(s => s.budgetMin <= opts.maxBudget);
    return list;
  },

  /**
   * @param {{category?:string, maxPrice?:number}} [opts]
   */
  async getDeals(opts = {}) {
    let list = await loadJson('deals.json');
    if (opts.category && opts.category !== 'all') list = list.filter(d => d.category === opts.category);
    if (typeof opts.maxPrice === 'number') list = list.filter(d => d.salePrice <= opts.maxPrice);
    return list;
  },

  /**
   * @param {{maxDistanceKm?:number, maxSize?:number, pickupEnd?:'today'|'week'}} [opts]
   */
  async getFreeItems(opts = {}) {
    let list = await loadJson('free-items.json');
    if (typeof opts.maxDistanceKm === 'number') list = list.filter(f => f.distanceKm <= opts.maxDistanceKm);
    if (typeof opts.maxSize === 'number') list = list.filter(f => f.size <= opts.maxSize);
    if (opts.pickupEnd === 'today') list = list.filter(f => f.pickupEnd === 'today');
    return list;
  },

  /** 統合検索用。「キャンプを始めたい」→必要な品目 の対応表 */
  async getActivitySets() {
    return loadJson('activity-sets.json');
  },

  meta() {
    return { name: 'StaticDataProvider', updatedAt: '2026-08-26', isLive: false };
  }
};

/* ═══════════════════════════════════════════════
 * ApiDataProvider ── 将来用の枠（サーバーが必要）
 * ═══════════════════════════════════════════════ */
export function createApiDataProvider(baseUrl) {
  const get = async (path, params) => {
    const url = new URL(baseUrl + path);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('API error: ' + res.status);
    return res.json();
  };
  return {
    getProducts: () => get('/products'),
    getRentals: productId => get('/rentals', { productId }),
    getStores: opts => get('/stores', opts),
    getDeals: opts => get('/deals', opts),
    getFreeItems: opts => get('/free-items', opts),
    meta: () => ({ name: 'ApiDataProvider', updatedAt: new Date().toISOString().slice(0, 10), isLive: true })
  };
}

/* ═══════════════════════════════════════════════
 * PartnerDataProvider ── 提携先フィード（ASPの商品フィード等）
 *   規約上クリーンな取得手段。ScrapingDataProviderより優先する。
 * ═══════════════════════════════════════════════ */
export function createPartnerDataProvider(feedUrl, mapFn) {
  return {
    async getProducts() {
      const raw = await (await fetch(feedUrl)).json();
      return raw.map(mapFn);
    },
    getRentals: async () => [],
    getStores: async () => [],
    getDeals: async () => [],
    getFreeItems: async () => [],
    meta: () => ({ name: 'PartnerDataProvider', updatedAt: new Date().toISOString().slice(0, 10), isLive: true })
  };
}

/* ═══════════════════════════════════════════════
 * ScrapingDataProvider ── ★枠のみ。実装しない。
 *
 *   リポジトリ方針（CLAUDE.md）に「自動巡回・自動応募は規約違反のため
 *   実装しない」と明記されている。また、レンタル各社・予約サイトの多くは
 *   利用規約でスクレイピングを禁止している。
 *
 *   実装する場合は、対象サイトごとに
 *     ・利用規約の確認
 *     ・robots.txt の遵守
 *     ・アクセス頻度の制御
 *   が前提。無断のスクレイピングはサービス停止リスクになる。
 * ═══════════════════════════════════════════════ */
export const ScrapingDataProvider = {
  getActivitySets: notImplemented,
  getProducts: notImplemented,
  getRentals: notImplemented,
  getStores: notImplemented,
  getDeals: notImplemented,
  getFreeItems: notImplemented,
  meta: () => ({ name: 'ScrapingDataProvider (未実装)', updatedAt: '-', isLive: false })
};

function notImplemented() {
  return Promise.reject(new Error(
    'ScrapingDataProvider は意図的に未実装です。' +
    '対象サイトの利用規約とrobots.txtを確認し、許諾を得たうえで実装してください。' +
    'まずは PartnerDataProvider（提携フィード）と ApiDataProvider（公式API）を検討してください。'
  ));
}

/* ═══════════════════════════════════════════════
 * 既定のProvider ── ここを差し替えるだけで全機能の取得元が変わる
 * ═══════════════════════════════════════════════ */
export let dataProvider = StaticDataProvider;

/** @param {import('../types/models.js').DataProvider} provider */
export function setDataProvider(provider) {
  dataProvider = provider;
  cache.clear();
}
