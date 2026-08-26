/**
 * LIFE CHOICE ── お知らせ帯（Phase 9）
 *
 * 締切のあるものだけを、トップページに1か所だけ出す。
 * ブラウザのプッシュ通知は使わない（HTTPS配信と常駐が要るうえ、
 * 本サービスは公開しない方針のため）。アプリ内の表示だけで完結させる。
 *
 * 候補の作成は lib/recommendation.js の notificationCandidates() が担う。
 * ここは表示だけを受け持つ。
 *
 * @file components/notice.js
 */
import { esc } from '../utils/dom.js';
import { DemoBadge } from './result.js';

/**
 * @param {import('../types/models.js').NotificationCandidate[]} candidates
 * @param {{max?:number, basePath?:string}} [opts]
 * @returns {string} HTML。候補が無ければ空文字
 */
export function NoticeBar(candidates, opts = {}) {
  const max = opts.max || 3;
  const base = opts.basePath ?? '';
  const list = (candidates || []).slice(0, max);
  if (!list.length) return '';

  // 全部がサンプル由来なら、帯ごと「サンプル」と分かる見た目にする（厳守事項11）
  const allDemo = list.every(c => c.isDemo);

  return `
<section class="lc-notice${allDemo ? ' lc-notice--demo' : ''}" aria-label="締切が近いもの">
  <div class="lc-notice__head">
    <span aria-hidden="true">⏳</span>
    <b>まもなく終わるもの ${list.length}件</b>
    ${allDemo ? DemoBadge() : ''}
  </div>
  <ul class="lc-notice__list">
    ${list.map(c => `
      <li>
        <a href="${esc(base + c.url)}">
          <span class="lc-notice__title">${esc(c.title)}</span>
          <span class="lc-notice__body">${esc(c.body)}</span>
        </a>
      </li>`).join('')}
  </ul>
  ${allDemo
    ? '<p class="lc-notice__note">掲載はすべてサンプルです。実在の店舗・出品ではありません。</p>'
    : ''}
</section>`;
}

/**
 * 機能ごとの件数バッジ。入口カードの右上に出す。
 * @param {number} n
 */
export function CountBadge(n, isDemo) {
  if (!n) return '';
  return `<span class="lc-badge${isDemo ? ' lc-badge--demo' : ''}">${n}</span>`;
}

/**
 * 候補を機能ごとに数える（入口カードのバッジ用）
 * @param {import('../types/models.js').NotificationCandidate[]} candidates
 * @returns {Record<string, {count:number, isDemo:boolean}>}
 */
export function countByService(candidates) {
  const out = {};
  (candidates || []).forEach(c => {
    const id = c.type === 'deal' ? 'today-deals' : c.type === 'free-item' ? 'free-items' : null;
    if (!id) return;
    if (!out[id]) out[id] = { count: 0, isDemo: true };
    out[id].count++;
    if (!c.isDemo) out[id].isDemo = false;
  });
  return out;
}
