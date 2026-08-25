/**
 * LIFE CHOICE ── ⑥ 無料品レーダー（距離と持ち帰り可能性）
 *
 * 既存の3軸（距離・運べる大きさ・受取時期）を維持したうえで、
 * ユーザーの移動手段から「持ち帰りおすすめ度」を★で判定する。
 *
 * @file lib/distance.js
 */
import { travelMinutes } from '../utils/format.js';

/** サイズ → 重量の目安（現状分析 10-3 の表） */
export const SIZE_INFO = {
  1: { label: '小', desc: '手で持てる',   weightKg: 3 },
  2: { label: '中', desc: '両手で運べる', weightKg: 15 },
  3: { label: '大', desc: '車が必要',     weightKg: 30 }
};

/** 移動手段 × サイズ の基礎点（5段階） */
const CARRY_BASE = {
  walk: { 1: 5, 2: 2, 3: 1 },
  bike: { 1: 5, 2: 3, 3: 1 },
  moto: { 1: 4, 2: 2, 3: 1 },
  kei:  { 1: 5, 2: 5, 3: 4 },
  car:  { 1: 5, 2: 5, 3: 5 }
};

/**
 * 持ち帰り可能性を判定する。
 * 基礎点から距離に応じて減点する（重い物を遠くまでは運べない）。
 * @param {import('../types/models.js').FreeItem} item
 * @param {'walk'|'bike'|'moto'|'kei'|'car'} transportation
 * @returns {{stars:number, minutes:number, weightKg:number, sizeLabel:string, note:string}}
 */
export function carryFeasibility(item, transportation = 'walk') {
  const base = (CARRY_BASE[transportation] || CARRY_BASE.walk)[item.size] ?? 3;
  const minutes = travelMinutes(item.distanceKm, transportation);

  let penalty = 0;
  if (transportation === 'walk' || transportation === 'bike') {
    if (item.size >= 2 && item.distanceKm >= 1.5) penalty += 1;
    if (item.size >= 2 && item.distanceKm >= 3) penalty += 1;
    if (item.size === 3) penalty += 1;
  }
  if (minutes > 40) penalty += 1;

  const stars = Math.max(1, Math.min(5, base - penalty));
  const info = SIZE_INFO[item.size];

  let note;
  if (stars >= 4) note = '無理なく持ち帰れます';
  else if (stars === 3) note = '運べますが少し大変です';
  else note = 'この移動手段だと厳しいかもしれません';

  return { stars, minutes, weightKg: info.weightKg, sizeLabel: info.label, note };
}

/**
 * 条件で絞って近い順に並べる
 * @param {import('../types/models.js').FreeItem[]} items
 * @param {{maxDistanceKm:number, maxSize:number, pickupEnd:'today'|'week', transportation?:string}} opts
 */
export function findFreeItems(items, opts) {
  return items
    .filter(i => i.distanceKm <= opts.maxDistanceKm)
    .filter(i => i.size <= opts.maxSize)
    .filter(i => (opts.pickupEnd === 'week' ? true : i.pickupEnd === 'today'))
    .map(i => ({ item: i, carry: carryFeasibility(i, opts.transportation) }))
    .sort((a, b) => a.item.distanceKm - b.item.distanceKm);
}
