/**
 * LIFE CHOICE ── Header / BottomNavigation
 * どの機能から入っても「同じサービス」に見えるための共通シェル。
 * @file components/layout.js
 */
import { esc } from '../utils/dom.js';
import { getService, navItems } from '../lib/services.js';

/**
 * ヘッダー。戻る導線とサービス名を出す。
 * @param {{serviceId?:string, title?:string, showBack?:boolean}} opts
 */
export function Header(opts = {}) {
  const svc = opts.serviceId ? getService(opts.serviceId) : null;
  const title = opts.title || (svc ? svc.name : 'LIFE CHOICE');
  const back = opts.showBack !== false && svc;
  return `
<header class="lc-header">
  <div class="lc-header__inner">
    ${back ? '<a class="lc-header__back" href="../index.html" aria-label="ホームへ戻る">←</a>' : ''}
    <div style="flex:1;min-width:0">
      <div class="lc-header__brand">LIFE CHOICE</div>
      <h1 class="lc-header__title">${svc ? svc.icon + ' ' : ''}${esc(title)}</h1>
    </div>
  </div>
</header>`;
}

/**
 * ボトムナビ。スマホでは下部固定、700px以上では上部の横並びに切り替わる。
 * @param {string} currentId
 */
export function BottomNavigation(currentId) {
  const items = navItems().map(it => {
    const active = it.id === currentId;
    return `<a class="lc-nav__item" href="${it.path}"${active ? ' aria-current="page"' : ''}>
      <span class="lc-nav__icon" aria-hidden="true">${it.icon}</span>
      <span>${esc(it.name)}</span>
    </a>`;
  }).join('');
  return `<nav class="lc-nav" aria-label="メインナビゲーション"><div class="lc-nav__inner">${items}</div></nav>`;
}

/**
 * ページ全体のシェルを一度に差し込む。
 * 各app/*.html は body の先頭で mountShell() を呼ぶだけでよい。
 */
export function mountShell(serviceId, opts = {}) {
  document.body.setAttribute('data-service', serviceId);
  document.body.insertAdjacentHTML('afterbegin', Header({ serviceId, ...opts }));
  document.body.insertAdjacentHTML('beforeend', BottomNavigation(serviceId));
}
