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
    } else if (/^[-*] /.test(l)) {
      const items = [];
      while (i < L.length && /^[-*] /.test(L[i])) { items.push(`<li>${inline(L[i].replace(/^[-*] /, ''))}</li>`); i++; }
      i--;
      out.push(`<ul>${items.join('')}</ul>`);
    } else if (/^\d+\. /.test(l)) {
      const items = [];
      while (i < L.length && /^\d+\. /.test(L[i])) { items.push(`<li>${inline(L[i].replace(/^\d+\. /, ''))}</li>`); i++; }
      i--;
      out.push(`<ol>${items.join('')}</ol>`);
    } else if (l.trim()) {
      out.push(`<p>${inline(l)}</p>`);
    }
  }
  return out.join('\n');
}
module.exports = { render };
