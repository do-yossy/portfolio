/**
 * LIFE CHOICE ── 機能間の回遊導線
 *
 * 「6つの別々のツール」を「1つのアプリ」にするための仕掛け。
 * ある機能の結果から、次に見るべき機能へ自然につなぐ。
 *
 * @file lib/cross-link.js
 */
import { getService } from './services.js';

/**
 * @typedef {Object} CrossLink
 * @property {string} serviceId
 * @property {string} label     誘導の文言
 * @property {string} href
 * @property {string} icon
 */

/**
 * ①買う前チェックの判定結果から、次に見るべき機能を返す
 * @param {'buy'|'used'|'rent'|'stop'} verdict
 * @param {string} productName
 * @returns {CrossLink|null}
 */
export function afterBuyCheck(verdict, productName) {
  if (verdict === 'rent') {
    return link('unnecessary-buy', `${productName}のほかにも「借りたほうが安い物」を見る`);
  }
  if (verdict === 'stop') {
    return link('unnecessary-buy', '買わずに済ませられる物をまとめて確認する');
  }
  return null;
}

/**
 * ②の一覧から、個別の判定へ誘導する
 */
export function afterBreakEven() {
  return link('buy-check', '気になる物を1つ選んで、詳しく判定する');
}

/**
 * ③の結果から、条件に応じて次を提案する
 * @param {{total:number, noBooking:number}} summary
 * @param {'solo'|'multi'} who
 */
export function afterNowWhat(summary, who) {
  if (summary.total === 0) {
    return link('today-deals', '条件に合う場所がなければ、今日だけ安いものを見てみる');
  }
  if (who === 'solo') {
    return link('solo-map', '一人で行きやすい場所だけを、さらに絞り込む');
  }
  return link('today-deals', '同じ時間帯で、今日だけ安くなっているものを見る');
}

/**
 * ④の結果から
 */
export function afterTodayDeals(count) {
  return count === 0
    ? link('now-what', '今から行ける場所を時間と予算から探す')
    : link('now-what', '予約が要らない場所も含めて、今から行けるところを探す');
}

/**
 * ⑤の結果から
 */
export function afterSoloMap() {
  return link('now-what', '営業時間から「今すぐ間に合う場所」に絞り込む');
}

/**
 * ⑥の結果から
 */
export function afterFreeItems(count) {
  return count === 0
    ? link('unnecessary-buy', 'もらえる物がなければ、借りるという選択肢を見る')
    : link('buy-check', 'もらえなかった物は、買うか借りるかを判定する');
}

function link(serviceId, label) {
  const s = getService(serviceId);
  return s ? { serviceId, label, href: s.path, icon: s.icon, name: s.name } : null;
}

/** 回遊カードのHTML */
export function CrossLinkCard(cl) {
  if (!cl) return '';
  return `
<a class="lc-card lc-card--tap" href="${cl.href}" data-service="${cl.serviceId}"
   style="display:block;text-decoration:none;color:inherit;margin-top:var(--sp-4)">
  <div class="lc-sub" style="margin-bottom:4px">次はこちら</div>
  <div style="display:flex;align-items:center;gap:var(--sp-3)">
    <span style="font-size:22px" aria-hidden="true">${cl.icon}</span>
    <div>
      <div style="font-weight:800">${cl.name}</div>
      <div class="lc-sub">${cl.label}</div>
    </div>
    <span style="margin-left:auto;color:var(--sub)" aria-hidden="true">›</span>
  </div>
</a>`;
}
