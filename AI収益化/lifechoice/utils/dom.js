/**
 * LIFE CHOICE ── DOM操作のユーティリティ
 * 既存6HTMLで6回重複していた pick() をここへ集約する。
 * @file utils/dom.js
 */

/** name属性のラジオ/チェックボックスから選択値を取る（既存の pick() と同じ） */
export function pick(name, root = document) {
  const el = root.querySelector('input[name="' + name + '"]:checked');
  return el ? el.value : null;
}

/** 数値として取得 */
export function pickNumber(name, root = document) {
  const v = pick(name, root);
  return v === null ? null : parseFloat(v);
}

/** 全ての選択値（複数選択） */
export function pickAll(name, root = document) {
  return [...root.querySelectorAll('input[name="' + name + '"]:checked')].map(e => e.value);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** innerHTML への差し込み。null安全 */
export function html(sel, markup, root = document) {
  const el = typeof sel === 'string' ? $(sel, root) : sel;
  if (el) el.innerHTML = markup;
  return el;
}

/**
 * XSS対策のエスケープ。
 * データ由来の文字列を innerHTML に流す箇所では必ず通す。
 * 将来ユーザー入力や外部APIのデータを表示するようになると必須になる。
 */
export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 条件付きでクラス名を組み立てる */
export function cx(...args) {
  return args.filter(Boolean).join(' ');
}

/** 変更を監視して再描画する（chipsの即時反映用） */
export function onChange(names, handler, root = document) {
  const list = Array.isArray(names) ? names : [names];
  list.forEach(name => {
    $$('input[name="' + name + '"]', root).forEach(el => el.addEventListener('change', handler));
  });
}

/** クリップボードへコピー（失敗時は選択状態にする） */
export function copyText(text, onDone) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => onDone && onDone(true)).catch(() => onDone && onDone(false));
  } else {
    onDone && onDone(false);
  }
}

/** スムーズに先頭へ */
export function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
