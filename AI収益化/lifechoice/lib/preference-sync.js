/**
 * LIFE CHOICE ── UserPreference と各機能のフィルタの相互変換
 *
 * 本サービスの中核。
 * 「大阪・ひとり・3,000円」を1回設定すれば、③④⑤⑥が同時に絞り込まれる。
 *
 *   UserPreference ──(toFilters)──▶ 各機能の初期値
 *   各機能の操作   ──(fromFilters)─▶ UserPreference へ反映
 *
 * @file lib/preference-sync.js
 */
import { loadPreference, savePreference } from '../utils/storage.js';
import { TRANSPORT_LABEL } from '../utils/format.js';

/**
 * 保存済みの設定から、各機能のフィルタ初期値を作る。
 * @param {string} serviceId
 * @param {import('../types/models.js').UserPreference} [pref]
 */
export function toFilters(serviceId, pref = loadPreference()) {
  const base = { budget: pref.budget, transportation: pref.transportation };

  switch (serviceId) {
    case 'now-what':
      return {
        ...base,
        // 一人を好む度合いが高ければ「ひとり」を既定にする
        who: pref.soloPreference >= 4 ? 'solo' : 'multi',
        // 会話を避けたい度合いが高ければ「静かに」を既定にする
        mood: pref.conversationPreference >= 4 ? 'quiet'
            : pref.conversationPreference <= 2 ? 'talk' : 'any'
      };

    case 'solo-map':
      return {
        ...base,
        // いちばん強い忌避を fear に採用する
        fear: strongestFear(pref)
      };

    case 'today-deals':
      return { ...base };

    case 'free-items':
      return { ...base };

    case 'buy-check':
    case 'unnecessary-buy':
      return { ...base };

    default:
      return base;
  }
}

/** 3つのpreferenceのうち最も強いものを fear に変換する */
function strongestFear(pref) {
  const cands = [
    { key: 'talk', v: pref.conversationPreference },
    { key: 'eye',  v: pref.soloPreference },
    { key: 'book', v: pref.reservationPreference }
  ].sort((a, b) => b.v - a.v);
  return cands[0].v >= 4 ? cands[0].key : 'none';
}

/**
 * 機能側で操作した値を UserPreference に書き戻す。
 * 「使っているうちに設定が育つ」ようにするための仕組み。
 * @param {string} serviceId
 * @param {Object} filters
 */
export function fromFilters(serviceId, filters) {
  const patch = {};
  if (typeof filters.budget === 'number' && filters.budget < 99999) patch.budget = filters.budget;
  if (filters.transportation) patch.transportation = filters.transportation;

  if (serviceId === 'now-what') {
    if (filters.who) patch.soloPreference = filters.who === 'solo' ? 5 : 2;
    if (filters.mood === 'quiet') patch.conversationPreference = 5;
    else if (filters.mood === 'talk') patch.conversationPreference = 1;
  }
  if (serviceId === 'solo-map' && filters.fear) {
    if (filters.fear === 'talk') patch.conversationPreference = 5;
    if (filters.fear === 'eye')  patch.soloPreference = 5;
    if (filters.fear === 'book') patch.reservationPreference = 5;
  }
  if (Object.keys(patch).length) savePreference(patch);
  return patch;
}

/** 現在の条件を1行で表す（PreferenceBar の表示用） */
export function describe(pref = loadPreference()) {
  const parts = [];
  if (pref.location.areaName) parts.push(pref.location.areaName);
  parts.push(pref.soloPreference >= 4 ? 'ひとり' : '複数人');
  parts.push('〜' + pref.budget.toLocaleString('ja-JP') + '円');
  parts.push(TRANSPORT_LABEL[pref.transportation] || '徒歩');
  return parts.join(' ／ ');
}

/** 設定が実際に効いている機能の数（PreferenceBar の説明用） */
export const AFFECTED_SERVICES = {
  budget: ['now-what', 'today-deals', 'solo-map'],
  transportation: ['now-what', 'free-items'],
  soloPreference: ['now-what', 'solo-map'],
  conversationPreference: ['now-what', 'solo-map'],
  reservationPreference: ['solo-map'],
  location: []   // 位置データが未整備のため現状は効かない（Phase以降で対応）
};

/**
 * 保存済みの予算を、その機能が持つ選択肢のいずれかに丸める。
 * 機能ごとに刻みが違う（③は0/1000/2000/3000/5000、⑤は0/1000/2000/4000）ため、
 * 「予算3,000円」を⑤へ引き継ぐと該当する選択肢が無い、という状態を防ぐ。
 *
 * 予算は上限なので、超える側へは寄せず「value以下で最大の選択肢」を選ぶ。
 * それも無ければ最小の選択肢（＝いちばん安い枠）にする。
 *
 * @param {number} value
 * @param {number[]} options
 * @returns {number}
 */
export function snapBudget(value, options) {
  const sorted = [...options].sort((a, b) => a - b);
  let hit = sorted[0];
  for (const o of sorted) if (o <= value) hit = o;
  return hit;
}
