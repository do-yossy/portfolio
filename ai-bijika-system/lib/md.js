'use strict';
// 法務文書（legal/*.md）を表示するための最小のMarkdown→HTML変換。見出し・表・箇条書き・段落・太字・リンクのみ。
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s) {
  let t = esc(s).replace(/&lt;br&gt;/g, '<br>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return t;
}
// 箇条書き（- / * / 1.）。字下げした行は、直前の項目の中の箇条書きとして扱う
const LIST_RE = /^(\s*)([-*]|\d+\.) /;
const indentOf = (l) => l.match(/^\s*/)[0].length;
function parseList(L, start, indent) {
  const ordered = /^\s*\d+\. /.test(L[start]);
  const items = [];
  let i = start;
  while (i < L.length) {
    const l = L[i];
    if (!LIST_RE.test(l)) break;
    const ind = indentOf(l);
    if (ind < indent) break;
    if (ind > indent) {
      const sub = parseList(L, i, ind);
      if (items.length) items[items.length - 1] += sub.html; else items.push(sub.html);
      i = sub.next;
      continue;
    }
    if (/^\s*\d+\. /.test(l) !== ordered) break; // 種類が変わったら別のリスト
    items.push(inline(l.replace(LIST_RE, '')));
    i++;
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>${items.map((x) => `<li>${x}</li>`).join('')}</${tag}>`, next: i };
}

function render(md) {
  const L = String(md).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (/^#{1,3} /.test(l)) {
      const n = l.match(/^#+/)[0].length;
      out.push(`<h${n + 1}>${inline(l.replace(/^#+ /, ''))}</h${n + 1}>`);
    } else if (l.startsWith('|')) {
      const rows = [];
      while (i < L.length && L[i].startsWith('|')) { rows.push(L[i]); i++; }
      i--;
      const cells = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      out.push('<table>' + cells.map((c, k) => '<tr>' + c.map((x) => (k === 0 && cells.length > 1 && /^\|\s*項目/.test(rows[0]) ? `<th>${inline(x)}</th>` : `<td>${inline(x)}</td>`)).join('') + '</tr>').join('') + '</table>');
    } else if (LIST_RE.test(l)) {
      const r = parseList(L, i, indentOf(l));
      out.push(r.html);
      i = r.next - 1;
    } else if (l.trim()) {
      out.push(`<p>${inline(l)}</p>`);
    }
  }
  return out.join('\n');
}
module.exports = { render };
