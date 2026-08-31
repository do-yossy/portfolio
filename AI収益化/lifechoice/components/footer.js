/**
 * LIFE CHOICE ── ShareBox / Cta / Disclaimer
 * @file components/footer.js
 */
import { esc, copyText, $ } from '../utils/dom.js';

/* ═══ ShareBox ═══
 * 資金ゼロで集客する唯一の手段がSNS拡散。
 * 数字の入った結果テキストを生成してコピー／X投稿できるようにする。 */
export function ShareBox(text, opts = {}) {
  return `
<div class="lc-share">
  <div class="lc-share__label">${esc(opts.label || 'この結果をシェアする')}</div>
  <div class="lc-share__text" id="lc-share-text">${esc(text)}</div>
  <div class="lc-share__btns">
    <button class="lc-btn lc-btn--ghost lc-btn--sm" type="button" id="lc-share-copy">テキストをコピー</button>
    <a class="lc-btn lc-btn--sm" style="background:var(--ink);color:var(--surface)"
       href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}"
       target="_blank" rel="noopener">Xに投稿</a>
  </div>
</div>`;
}

/** ShareBox を差し込んだあとに呼ぶ（コピーボタンの挙動） */
export function bindShare(text) {
  const btn = $('#lc-share-copy');
  if (!btn) return;
  btn.addEventListener('click', () => {
    copyText(text, ok => {
      btn.textContent = ok ? 'コピーしました' : '選択してコピーしてください';
      setTimeout(() => { btn.textContent = 'テキストをコピー'; }, 1600);
    });
  });
}

/* ═══ Cta（送客）═══
 * links が空なら「提携準備中」を出す。ID未設定でも画面が壊れない。 */
export function Cta(p) {
  const links = p.links || [];
  const body = links.length
    ? links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener sponsored">${esc(l.label)}</a>`).join('')
    : `<a href="#" aria-disabled="true" onclick="return false;">${esc(p.pendingLabel || 'リンク準備中')}</a>`;
  return `
<div class="lc-cta">
  <div>${esc(p.heading || 'この判定に沿って進める場合はこちら')}</div>
  <div class="lc-cta__links">${body}</div>
  ${links.length ? '' : `<p style="font-size:var(--fs-xs);opacity:.7;margin-top:var(--sp-2)">${esc(p.pendingNote || 'アフィリエイトIDを設定すると有効になります')}</p>`}
</div>`;
}

/* ═══ Disclaimer ═══
 * 6機能すべてに同じものを出す。データの出所と法務ページへの導線。 */
export function Disclaimer(p = {}) {
  const lines = [];
  if (p.dataNote) lines.push(p.dataNote);
  if (p.hasDemoData) {
    lines.push('<b>この画面のデータはサンプルです。</b>実在の店舗・価格・出品ではありません。');
  }
  lines.push('表示している価格・営業時間・スコアは一般的な水準にもとづく参考情報です。最終的なご判断はご自身でお願いします。');
  return `
<footer class="lc-note">
  ${lines.map(l => `<p>${l}</p>`).join('')}
  <p style="margin-top:var(--sp-3)">
    <a href="../legal.html">利用規約・プライバシーポリシー・免責事項</a>
  </p>
</footer>`;
}
