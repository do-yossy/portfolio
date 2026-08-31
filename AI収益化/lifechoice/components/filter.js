/**
 * LIFE CHOICE ── Filter / SearchBox / LocationSelector
 * 6機能すべてで使っていた chips を1つの実装に集約する。
 * @file components/filter.js
 */
import { esc } from '../utils/dom.js';
import { TRANSPORT_LABEL } from '../utils/format.js';

/**
 * chips（ラジオをボタン風に見せる選択UI）
 * @param {{name:string, label:string, hint?:string, options:{value:string|number,label:string}[], value?:string|number}} p
 */
export function Filter(p) {
  const opts = p.options.map((o, i) => {
    const id = p.name + '-' + i;
    const checked = String(o.value) === String(p.value) ? ' checked' : '';
    return `<input type="radio" name="${p.name}" id="${id}" value="${esc(o.value)}"${checked}>` +
           `<label for="${id}">${esc(o.label)}</label>`;
  }).join('');
  return `
<div class="lc-field">
  <span class="lc-field__label">${esc(p.label)}</span>
  ${p.hint ? `<p class="lc-field__hint">${esc(p.hint)}</p>` : ''}
  <div class="lc-chips">${opts}</div>
</div>`;
}

/**
 * 複数選べる chips。Filter と見た目は同じで、input が checkbox になる。
 * 値の取り出しは utils/dom.js の pickAll(name) を使う。
 *
 * @param {{name:string, label:string, hint?:string, options:{value:string|number,label:string}[], values?:(string|number)[]}} p
 */
export function MultiFilter(p) {
  const selected = (p.values || []).map(String);
  const opts = p.options.map((o, i) => {
    const id = p.name + '-' + i;
    const checked = selected.includes(String(o.value)) ? ' checked' : '';
    return `<input type="checkbox" name="${p.name}" id="${id}" value="${esc(o.value)}"${checked}>` +
           `<label for="${id}">${esc(o.label)}</label>`;
  }).join('');
  return `
<div class="lc-field">
  <span class="lc-field__label">${esc(p.label)}</span>
  ${p.hint ? `<p class="lc-field__hint">${esc(p.hint)}</p>` : ''}
  <div class="lc-chips">${opts}</div>
</div>`;
}

/** 自由入力の検索欄（トップの「何をすればいい？」で使用） */
export function SearchBox(p = {}) {
  return `
<form class="lc-search" id="${p.id || 'lc-search'}" role="search" onsubmit="return false;">
  <input class="lc-search__input" type="search" name="q"
         placeholder="${esc(p.placeholder || '例：3万円くらいでキャンプを始めたい')}"
         value="${esc(p.value || '')}" autocomplete="off" enterkeyhint="search">
  <button class="lc-btn lc-btn--sm" type="submit">探す</button>
</form>`;
}

/** エリア選択。位置情報が許可されない前提で、手動選択を必ず併設する */
export function LocationSelector(p = {}) {
  const areas = p.areas || ['大阪市', '堺市', '東大阪市', '京都市', '神戸市', '名古屋市', '東京23区', '横浜市', 'その他'];
  const opts = areas.map(a =>
    `<option value="${esc(a)}"${a === p.value ? ' selected' : ''}>${esc(a)}</option>`
  ).join('');
  return `
<div class="lc-field">
  <span class="lc-field__label">エリア</span>
  <div class="lc-row">
    <select id="${p.id || 'lc-area'}" style="flex:1;padding:12px 13px;border:1.5px solid var(--line);border-radius:var(--r-sm);background:var(--surface)">
      <option value="">選択してください</option>${opts}
    </select>
    <button class="lc-btn lc-btn--ghost lc-btn--sm" type="button" id="lc-geo">現在地</button>
  </div>
  <p class="lc-field__hint">現在地の取得には許可が必要です。許可しない場合はエリアを選んでください。</p>
</div>`;
}

/** 移動手段の選択（③の移動時間・⑥の持ち帰り判定で共用） */
export function TransportSelector(value = 'walk') {
  return Filter({
    name: 'transportation',
    label: '移動手段',
    value,
    options: Object.entries(TRANSPORT_LABEL).map(([v, l]) => ({ value: v, label: l }))
  });
}
