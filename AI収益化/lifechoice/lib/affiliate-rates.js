/**
 * LIFE CHOICE ── アフィリエイト料率
 *
 * docs/料率とAPIの実確認.md で公式情報から確認した値をコードに落としたもの。
 * 売上の見積もりは全てここを通す（推測値をあちこちに散らさないため）。
 *
 * 出典：Amazonアソシエイト 紹介料率表（2026-08-25 確認）
 *       楽天アフィリエイト 成果報酬について（2026-08-25 確認）
 *
 * @file lib/affiliate-rates.js
 */

/**
 * Amazon の紹介料率。
 *
 * ⚠ 美容家電は「ビューティー・コスメ 5%」ではなく「家電 2%」。
 *   ここを取り違えると売上想定が2.5倍ずれる。
 */
export const AMAZON_RATE = {
  'カメラ・PC・家電': 0.02,
  'スポーツ・ベビー・工具': 0.04,
  'ドラッグストア・ビューティー': 0.05,
  'ファッション・シューズ・バッグ': 0.08,
  'その他': 0.02
};

/** 楽天は1商品1個あたり1,000円が上限（Amazonに上限は無い） */
export const RAKUTEN_CAP = 1000;

/** 楽天のジャンル別料率は未確認のため、一般的な下限で置く */
export const RAKUTEN_RATE_ASSUMED = 0.03;

/**
 * products.json のカテゴリ → Amazonの料率区分。
 * 同じカテゴリでも商品によって区分が変わるものは PRODUCT_OVERRIDE で個別指定する。
 */
const CATEGORY_TO_BUCKET = {
  'カメラ':     'カメラ・PC・家電',
  '家電':       'カメラ・PC・家電',
  '育児':       'スポーツ・ベビー・工具',
  'アウトドア': 'スポーツ・ベビー・工具',
  'スポーツ':   'スポーツ・ベビー・工具',
  '家周り':     'スポーツ・ベビー・工具',   // 工具・機械
  '衣類':       'ファッション・シューズ・バッグ',
  '旅行':       'ファッション・シューズ・バッグ',   // スーツケース＝バッグ
  '趣味':       'その他'
};

/** カテゴリだけでは区分が決まらない品目 */
const PRODUCT_OVERRIDE = {
  // 自転車は「趣味」だがAmazonではスポーツ用品扱い
  'bicycle':   'スポーツ・ベビー・工具',
  'road-bike': 'スポーツ・ベビー・工具'
};

/**
 * その品目のAmazon料率区分を返す。
 * @param {{id:string, category:string}} product
 * @returns {string}
 */
export function amazonBucket(product) {
  if (!product) return 'その他';
  return PRODUCT_OVERRIDE[product.id] || CATEGORY_TO_BUCKET[product.category] || 'その他';
}

/**
 * Amazonに送った場合の紹介料。
 * 紹介料の上限は2024年8月7日に廃止済みなので、高額品でも満額入る。
 * @param {Object} product
 * @param {number} price  取引額
 */
export function amazonReward(product, price) {
  return Math.round(price * AMAZON_RATE[amazonBucket(product)]);
}

/**
 * 楽天に送った場合の紹介料。1商品1,000円で頭打ちになる。
 * @param {number} price
 * @param {number} [rate]
 */
export function rakutenReward(price, rate = RAKUTEN_RATE_ASSUMED) {
  return Math.min(RAKUTEN_CAP, Math.round(price * rate));
}

/**
 * 同じ商品でどちらへ送るのが有利かを判定する。
 * 楽天は上限があるため、高額品はAmazonが勝つ。
 *
 * @returns {{shop:'amazon'|'rakuten', reward:number, amazon:number, rakuten:number}}
 */
export function bestShop(product, price) {
  const a = amazonReward(product, price);
  const r = rakutenReward(price);
  return a >= r
    ? { shop: 'amazon', reward: a, amazon: a, rakuten: r }
    : { shop: 'rakuten', reward: r, amazon: a, rakuten: r };
}

/**
 * レンタルの成果報酬。
 * ⚠ ASPの実額が未確認のため仮定値。管理画面で実額を見たら差し替えること。
 */
export const RENT_RATE_ASSUMED = 0.05;
export function rentReward(price) {
  return Math.round(price * RENT_RATE_ASSUMED);
}

/** 中古専門店（駿河屋・ゲオ等のASP案件）。実額未確認のため仮定値 */
export const USED_SHOP_RATE_ASSUMED = 0.03;

/**
 * 1つの推奨（買う／中古／借りる）から見込める報酬。
 *
 * @param {Object} product
 * @param {{kind:string, cost:number}} way
 * @returns {{reward:number, channel:string, verified:boolean}}
 */
export function rewardFor(product, way) {
  if (!way || !way.cost) return { reward: 0, channel: 'なし', verified: true };

  if (way.kind === 'buy') {
    const b = bestShop(product, way.cost);
    return { reward: b.reward, channel: b.shop === 'amazon' ? 'Amazon' : '楽天', verified: true };
  }
  if (way.kind === 'used') {
    // 中古はASP案件のある専門店へ送る前提（個人間フリマは成果報酬が無い）
    return { reward: Math.round(way.cost * USED_SHOP_RATE_ASSUMED), channel: '中古専門店', verified: false };
  }
  if (way.kind === 'rent') {
    return { reward: rentReward(way.cost), channel: 'レンタル', verified: false };
  }
  return { reward: 0, channel: 'なし', verified: true };
}
