/**
 * LIFE CHOICE ── PreferenceBar
 *
 * 各機能の上部に「今どんな条件で見ているか」を常に表示する。
 * これがあることで、6機能が同じ設定を共有していると体感できる。
 *
 * @file components/preference-bar.js
 */
import { esc, $ } from '../utils/dom.js';
import { loadPreference, hasPreference } from '../utils/storage.js';
import { describe } from '../lib/preference-sync.js';

/**
 * @param {{compact?:boolean}} [opts]
 */
export function PreferenceBar(opts = {}) {
  const pref = loadPreference();
  const set = hasPreference();
  return `
<div class="lc-prefbar" id="lc-prefbar">
  <div class="lc-prefbar__body">
    <span class="lc-prefbar__icon" aria-hidden="true">${set ? '⚙️' : '✨'}</span>
    <div style="flex:1;min-width:0">
      <div class="lc-prefbar__label">${set ? 'あなたの条件' : '条件を設定すると6機能すべてに反映されます'}</div>
      ${set ? `<div class="lc-prefbar__value">${esc(describe(pref))}</div>` : ''}
    </div>
    <a class="lc-btn lc-btn--ghost lc-btn--sm" href="../app/settings.html">${set ? '変更' : '設定する'}</a>
  </div>
</div>`;
}

/** トップページ用（パスが1階層違う） */
export function PreferenceBarTop() {
  return PreferenceBar().replace('href="../app/settings.html"', 'href="app/settings.html"');
}

/** 条件が引き継がれたことを1度だけ知らせる */
export function noticeInherited(serviceId, applied) {
  if (!applied || !Object.keys(applied).length) return '';
  const labels = {
    budget: '予算', transportation: '移動手段',
    who: '人数', mood: '気分', fear: '避けたいこと'
  };
  const names = Object.keys(applied).map(k => labels[k]).filter(Boolean);
  if (!names.length) return '';
  return `<p class="lc-field__hint" style="margin-top:var(--sp-2)">
    保存済みの設定から <b>${esc(names.join('・'))}</b> を引き継ぎました
  </p>`;
}
