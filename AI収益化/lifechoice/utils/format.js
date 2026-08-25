/**
 * LIFE CHOICE ── 表示フォーマット
 * 既存6HTMLで重複していた yen() / hhmm() をここへ集約する。
 * @file utils/format.js
 */

/** 円表記。既存実装と同じ結果を返す（'¥' + toLocaleString('ja-JP')） */
export function yen(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

/** 価格帯。無料と上限なしを区別する */
export function priceRange(lo, hi) {
  if (lo === 0 && hi === 0) return '無料';
  if (hi >= 99999) return yen(lo) + '〜';
  if (lo === hi) return yen(lo);
  return yen(lo) + '〜' + yen(hi);
}

/** 小数時間 → "HH:MM"（17.5 → "17:30"）。24を超える値は翌日として丸める */
export function hhmm(v) {
  const t = ((v % 24) + 24) % 24;
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** 分 → "2時間30分" / "45分" */
export function duration(min) {
  if (min < 60) return min + '分';
  const h = Math.floor(min / 60), m = min % 60;
  return h + '時間' + (m ? m + '分' : '');
}

/** 距離。1km未満はm表記 */
export function distance(km) {
  return km < 1 ? Math.round(km * 1000) + 'm' : km + 'km';
}

/** パーセント（0〜1 → "35%"） */
export function percent(rate, digits = 0) {
  return (rate * 100).toFixed(digits) + '%';
}

/** 星評価（3 → "★★★☆☆"） */
export function stars(score, max = 5) {
  const n = Math.max(0, Math.min(max, Math.round(score)));
  return '★'.repeat(n) + '☆'.repeat(max - n);
}

/** 移動手段ごとの所要時間（分）。③の移動30分固定を置き換える */
const SPEED_KMH = { walk: 4.8, bike: 15, moto: 25, kei: 22, car: 22 };
export function travelMinutes(km, transportation = 'walk') {
  const kmh = SPEED_KMH[transportation] || SPEED_KMH.walk;
  return Math.round((km / kmh) * 60);
}

/** 移動手段の表示名 */
export const TRANSPORT_LABEL = {
  walk: '徒歩', bike: '自転車', moto: 'バイク', kei: '軽自動車', car: '普通車'
};
