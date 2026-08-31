/**
 * LIFE CHOICE ── 結果表示のコンポーネント群
 * ResultCard / Score / PriceComparison / EmptyState / ResultSummary / DemoBadge
 * @file components/result.js
 */
import { esc, cx } from '../utils/dom.js';
import { yen, stars } from '../utils/format.js';

/* ═══ DemoBadge ═══
 * 厳守事項11：架空データを事実のように表示しない。
 * isDemo が立っているデータには必ずこれを付ける。 */
export function DemoBadge() {
  return '<span class="lc-demo" title="このデータはサンプルです">DEMO</span>';
}

/** ページ上部に出す帯。架空データを含む機能で必ず表示する */
export function DemoBanner(text) {
  return `<div class="lc-demo-banner"><b>DEMO</b> ${esc(
    text || 'この画面のデータはすべてサンプルです。実在の店舗・価格・出品ではありません。'
  )}</div>`;
}

/* ═══ ResultCard ═══
 * ②③④⑤⑥のカードを1つの実装に統合。
 * @param {{title:string, price?:string, priceNote?:string, tags?:{label:string,variant?:string}[],
 *          why?:string, meters?:{label:string,value:number,max?:number,weighted?:boolean}[],
 *          score?:{value:number,label:string}, footer?:string, isDemo?:boolean}} p
 */
export function ResultCard(p) {
  const tags = (p.tags || []).map(t =>
    `<span class="${cx('lc-tag', t.variant && 'lc-tag--' + t.variant)}">${esc(t.label)}</span>`
  ).join('');
  const meters = (p.meters || []).map(m => Meter(m)).join('');
  return `
<article class="lc-card">
  <div class="lc-card__head">
    <h3 class="lc-card__title">${esc(p.title)} ${p.isDemo ? DemoBadge() : ''}</h3>
    ${p.price ? `<div class="lc-card__price">${esc(p.price)}${p.priceNote ? `<small>${esc(p.priceNote)}</small>` : ''}</div>` : ''}
    ${p.score ? Score(p.score) : ''}
  </div>
  ${tags ? `<div class="lc-tags" style="margin-bottom:var(--sp-3)">${tags}</div>` : ''}
  ${meters ? `<div style="margin-bottom:var(--sp-3)">${meters}</div>` : ''}
  ${p.why ? `<p class="lc-card__why">${esc(p.why)}</p>` : ''}
  ${p.footer || ''}
</article>`;
}

/* ═══ Score ═══ */
export function Score(p) {
  return `<div class="lc-score">
    <div class="lc-score__value">${esc(p.value)}</div>
    <div class="lc-score__label">${esc(p.label)}</div>
  </div>`;
}

/** 星評価（⑥の持ち帰りおすすめ度） */
export function StarScore(value, label) {
  return `<div class="lc-score">
    <div class="lc-score__value" style="font-size:15px;letter-spacing:1px">${stars(value)}</div>
    <div class="lc-score__label">${esc(label)}</div>
  </div>`;
}

/** 5段階のメーター（⑤のソロスコア内訳） */
export function Meter(p) {
  const pct = Math.round((p.value / (p.max || 5)) * 100);
  return `<div class="lc-meter${p.weighted ? ' lc-meter--on' : ''}">
    <span class="lc-meter__label">${esc(p.label)}${p.weighted ? '<span class="lc-meter__mark" title="この条件で重視した項目">重視</span>' : ''}</span>
    <span class="lc-meter__track"><span class="lc-meter__fill" style="width:${pct}%"></span></span>
  </div>`;
}

/* ═══ PriceComparison ═══
 * ②の横棒グラフ。2値の比較に使う。 */
export function PriceComparison(p) {
  const max = Math.max(p.a.value, p.b.value) || 1;
  const bar = (item, variant) => `
    <div class="lc-bar">
      <span class="lc-bar__label">${esc(item.label)}</span>
      <span class="lc-bar__track">
        <span class="lc-bar__fill lc-bar__fill--${variant}" style="width:${Math.round(item.value / max * 100)}%">${yen(item.value)}</span>
      </span>
    </div>`;
  return `<div class="lc-bars">${bar(p.a, 'a')}${bar(p.b, 'b')}</div>`;
}

/* ═══ ResultSummary ═══ */
export function ResultSummary(html) {
  return `<div class="lc-summary">${html}</div>`;
}

export function ResultCount(html) {
  return `<div class="lc-count">${html}</div>`;
}

/* ═══ EmptyState ═══ */
export function EmptyState(p = {}) {
  return `
<div class="lc-empty">
  <div class="lc-empty__icon" aria-hidden="true">${p.icon || '🔍'}</div>
  <p class="lc-empty__title">${esc(p.title || '条件に合うものが見つかりませんでした')}</p>
  <p class="lc-empty__hint">${esc(p.hint || '条件を広げてもう一度お試しください')}</p>
</div>`;
}
