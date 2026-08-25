/**
 * LIFE CHOICE ── 共通データモデル（JSDoc型定義）
 *
 * TypeScriptを導入するとビルド工程が必要になるため、
 * リポジトリ方針（依存ゼロ・ビルドなし）に合わせてJSDocで定義する。
 * エディタの補完・型チェックはこれで効く。
 *
 * @file types/models.js
 */

/* ═══════════════════════════════════════════════
 * Product ── 商品（①買う前チェック / ②買わなくていい物レーダー で共用）
 * ═══════════════════════════════════════════════ */
/**
 * @typedef {Object} Product
 * @property {string}  id                       kebab-case（例 "pressure-washer"）
 * @property {string}  name                     表示名
 * @property {string}  category                 カメラ / 家周り / 旅行 / アウトドア / スポーツ / 衣類 / 家電 / 育児 / 趣味 / その他
 * @property {number|null} newPrice             新品の実勢価格帯の中央値
 * @property {number|null} usedPrice            中古価格（newPrice × usedPriceRate）
 * @property {number|null} usedPriceRate        中古相場率（0.2〜0.6）
 * @property {number}  rentalPrice              レンタル料
 * @property {'回'|'月'} rentalUnit             課金単位。'回'=3泊4日 / '月'=1ヶ月
 * @property {number|null} estimatedResaleRate  新品を使用後に売却するときの率（対newPrice）
 * @property {number|null} usedEstimatedResaleRate 中古で買った物を売却するときの率（対newPrice）
 * @property {number|null} lifespanYears        一般的な使用可能年数
 * @property {string|null} image
 * @property {'実測'|'推定'} source             実測=掲載価格を確認済み
 * @property {string|null} sourceNote           出典の文言
 * @property {boolean} isDemo                   true なら架空データ。UIにDEMOバッジを出す
 * @property {string}  updatedAt                YYYY-MM-DD
 */

/* ═══════════════════════════════════════════════
 * Rental ── レンタル提供（Productから分離。将来は複数プロバイダを持つ）
 * ═══════════════════════════════════════════════ */
/**
 * @typedef {Object} Rental
 * @property {string}  id
 * @property {string}  productId
 * @property {string}  provider                 Rentio / ホームセンター各社 / そらのした など
 * @property {number}  price
 * @property {string}  period                   "3泊4日" / "1ヶ月"
 * @property {'回'|'月'} unit
 * @property {string|null} url                  未設定ならAFFで動的生成
 * @property {'available'|'unavailable'|'unknown'} availability
 * @property {'実測'|'推定'} source
 * @property {string|null} sourceNote
 * @property {boolean} isDemo
 * @property {string}  updatedAt
 */

/* ═══════════════════════════════════════════════
 * Store ── 場所（③いまから何する / ④今日だけ安い / ⑤ソロマップ で共用）
 * ═══════════════════════════════════════════════ */
/**
 * @typedef {Object} Store
 * @property {string}  id
 * @property {string}  name
 * @property {string}  category
 * @property {number|null} latitude
 * @property {number|null} longitude
 * @property {string|null} address
 * @property {'business-type'|'store'} areaLevel  business-type=業態単位（実在店舗ではない）
 * @property {number|null} openingTime            小数時間（17.5 = 17:30）
 * @property {number|null} closingTime            日跨ぎは24を超える値ではなく、計算側で補正する
 * @property {number}  estimatedStayMinutes
 * @property {number}  budgetMin
 * @property {number}  budgetMax
 * @property {number}  soloScore                 一人入りやすさ 1-5
 * @property {number}  conversationFreeScore     会話不要度 1-5（5=話しかけられない）
 * @property {number}  reservationFreeScore      予約不要度 1-5（5=予約不要）
 * @property {number}  beginnerScore             初心者安心度 1-5（5=手順が明瞭）
 * @property {number}  stayFreedomScore          滞在自由度 1-5（5=好きなだけ居られる）
 * @property {number|null} activityLevel         0=のんびり 1=中間 2=運動
 * @property {boolean} requiresReservation
 * @property {string}  why                       提案理由（UXの要）
 * @property {'solomap'|'converted-from-nowdo'} scoreOrigin  スコアの出所
 * @property {string}  source
 * @property {boolean} isDemo
 * @property {string}  updatedAt
 */

/* ═══════════════════════════════════════════════
 * Deal ── 当日限定の値引き（④今日だけ安い）
 * ═══════════════════════════════════════════════ */
/**
 * @typedef {Object} Deal
 * @property {string}  id
 * @property {string|null} storeId               Phase 5で実在店舗と紐づけ
 * @property {string}  storeName
 * @property {string}  title
 * @property {string}  category
 * @property {number}  normalPrice
 * @property {number}  salePrice
 * @property {number}  discountRate              0〜1
 * @property {number}  remainingCount
 * @property {number}  deadlineHour              小数時間
 * @property {string|null} availableFrom
 * @property {string|null} availableUntil
 * @property {number|null} latitude
 * @property {number|null} longitude
 * @property {string}  reason
 * @property {string|null} url
 * @property {boolean} isDemo                    ★現状は全件true（架空データ）
 * @property {string}  source
 * @property {string}  updatedAt
 */

/* ═══════════════════════════════════════════════
 * FreeItem ── 無料品（⑥無料品レーダー）
 * ═══════════════════════════════════════════════ */
/**
 * @typedef {Object} FreeItem
 * @property {string}  id
 * @property {string}  title
 * @property {string}  category
 * @property {number|null} latitude
 * @property {number|null} longitude
 * @property {number}  distanceKm
 * @property {1|2|3}   size                      1=手で持てる 2=両手 3=車が必要
 * @property {number}  estimatedWeightKg         sizeからの推定値
 * @property {string|null} pickupStart
 * @property {'today'|'week'} pickupEnd
 * @property {string}  condition
 * @property {string|null} image
 * @property {boolean} isDemo                    ★現状は全件true（架空データ）
 * @property {string}  source
 * @property {string}  updatedAt
 */

/* ═══════════════════════════════════════════════
 * UserPreference ── 6機能すべてで共用（localStorage）
 * ═══════════════════════════════════════════════ */
/**
 * @typedef {Object} UserPreference
 * @property {string}  version                   スキーマ移行用
 * @property {{lat:number|null, lng:number|null, areaName:string|null}} location
 * @property {number}  budget
 * @property {'walk'|'bike'|'moto'|'kei'|'car'} transportation
 * @property {number}  soloPreference            1-5（高いほど一人を好む）
 * @property {number}  conversationPreference    1-5（高いほど会話を避けたい）
 * @property {number}  reservationPreference     1-5（高いほど予約を避けたい）
 * @property {string[]} preferredCategories
 * @property {string}  updatedAt
 */

/* ═══════════════════════════════════════════════
 * ActivitySet ── 統合検索用（「キャンプを始めたい」→必要品目）
 * ═══════════════════════════════════════════════ */
/**
 * @typedef {Object} ActivitySetItem
 * @property {string}  productId
 * @property {number}  priority                  1が最優先
 * @property {boolean} essential                 必須か
 *
 * @typedef {Object} ActivitySet
 * @property {string}  id
 * @property {string}  name
 * @property {string[]} keywords                 自由入力の照合用
 * @property {ActivitySetItem[]} items
 */

/* ═══════════════════════════════════════════════
 * NotificationCandidate ── 通知候補（Phase 9）
 * ═══════════════════════════════════════════════ */
/**
 * @typedef {Object} NotificationCandidate
 * @property {'deal'|'price-drop'|'free-item'} type
 * @property {string}  title
 * @property {string}  body
 * @property {number}  score                     優先度 0-100
 * @property {string}  url
 * @property {string}  expiresAt
 * @property {Object}  context                   何にマッチしたか
 */

/* ═══════════════════════════════════════════════
 * DataProvider ── データ取得の抽象インターフェース
 *   全メソッドがPromiseを返す。API差し替え時に呼び出し側を変えずに済む。
 * ═══════════════════════════════════════════════ */
/**
 * @typedef {Object} ProviderMeta
 * @property {string}  name
 * @property {string}  updatedAt
 * @property {boolean} isLive                    false=同梱データ
 *
 * @typedef {Object} DataProvider
 * @property {() => Promise<Product[]>}   getProducts
 * @property {(productId?:string) => Promise<Rental[]>} getRentals
 * @property {(opts?:Object) => Promise<Store[]>}    getStores
 * @property {(opts?:Object) => Promise<Deal[]>}     getDeals
 * @property {(opts?:Object) => Promise<FreeItem[]>} getFreeItems
 * @property {() => ProviderMeta} meta
 */

// JSDocのみのファイル。実行時のエクスポートは無し。
export {};
