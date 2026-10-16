export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const layout = (title, inner) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
body{font-family:system-ui,"Hiragino Sans","Yu Gothic",sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.8;color:#222}
a.btn{display:inline-block;background:#1a6b4f;color:#fff;border-radius:6px;padding:12px 20px;font-size:16px;text-decoration:none}
pre{white-space:pre-wrap;background:#f6f6f2;border:1px solid #ddd;border-radius:6px;padding:16px;font:inherit}
.note{color:#666;font-size:14px}
</style></head><body>${inner}</body></html>`;

export const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export const landing = () =>
  layout('サクモン', `<h1>サクモン</h1>
<p>先生が学級通信や保護者向けのお知らせを書く時間を減らすための、文面ひな形集です。</p>
<p>月額980円(税込)。いつでも解約できます。</p>
<p><a class="btn" href="/subscribe">月額プランに申し込む</a></p>
<p class="note">決済はStripeで行います。解約・支払方法の変更は、会員ページのリンクからいつでもできます。</p>`);

export const successPage = (url) =>
  layout('お申し込みありがとうございます', `<h1>お申し込みありがとうございます</h1>
<p>下のボタンが、あなた専用の会員ページです。<strong>このページをブックマークしてください。</strong>リンクを知っている人は誰でも開けるため、他の人には共有しないでください。</p>
<p><a class="btn" href="${esc(url)}">会員ページを開く</a></p>`);

export const pendingPage = () =>
  layout('決済の確認中', `<h1>決済を確認しています</h1><p>お支払いの確認が終わっていません。少し待ってから、このページを再読み込みしてください。</p>`);

export const memberPage = (token, templates) =>
  layout('サクモン 会員ページ', `<h1>サクモン 会員ページ</h1>
<ul>${templates.map((t) => `<li><a href="/m/${esc(token)}/t/${esc(t.id)}">${esc(t.title)}</a></li>`).join('')}</ul>
<p><a href="/m/${esc(token)}/portal">解約・支払方法の変更・請求書</a></p>`);

export const templatePage = (token, t) =>
  layout(t.title, `<p><a href="/m/${esc(token)}">← 一覧へ</a></p><h1>${esc(t.title)}</h1>
<p class="note">{{ }} の部分を書き換えてお使いください。</p><pre>${esc(t.body)}</pre>`);

export const inactivePage = () =>
  layout('契約が有効ではありません', `<h1>契約が有効ではありません</h1>
<p>契約が解約済み、またはお支払いが確認できていません。</p><p><a class="btn" href="/subscribe">申し込む</a></p>`);

export const notFound = () => html(layout('見つかりません', '<h1>見つかりません</h1>'), 404);
