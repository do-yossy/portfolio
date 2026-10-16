import { TEMPLATES } from './content.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
:root{--bg:#f7f5ef;--card:#fff;--ink:#1f2a26;--sub:#5b6762;--line:#e3dfd2;--brand:#1a6b4f;--brand-d:#14543e;--tint:#e8f2ec;--warn:#fff6e0;--warn-line:#ecd9a0}
@media (prefers-color-scheme:dark){:root{--bg:#141a17;--card:#1c2420;--ink:#eef2ef;--sub:#a3b0aa;--line:#2d3833;--brand:#4fb88a;--brand-d:#6fcfa3;--tint:#1d2e26;--warn:#2d2815;--warn-line:#4d4422}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,"Hiragino Sans","Yu Gothic UI","Yu Gothic",sans-serif;line-height:1.85;-webkit-text-size-adjust:100%}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
header.top{padding:18px 0}
.logo{font-weight:700;font-size:20px;letter-spacing:.04em;color:var(--brand);text-decoration:none}
h1{font-size:clamp(26px,6vw,38px);line-height:1.4;margin:0 0 16px}
h2{font-size:22px;margin:0 0 14px}
h3{font-size:17px;margin:0 0 6px}
p{margin:0 0 14px}
.hero{padding:36px 0 44px}
.lead{font-size:17px;color:var(--sub)}
.btn{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;font-size:17px;padding:15px 28px;border-radius:10px;border:0;cursor:pointer;font-family:inherit}
.btn:hover{background:var(--brand-d)}
.btn.sub{background:transparent;color:var(--brand);border:1.5px solid var(--brand)}
@media (prefers-color-scheme:dark){.btn{color:#0e1512}.btn.sub{color:var(--brand)}}
.note{font-size:14px;color:var(--sub)}
section{padding:34px 0;border-top:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.card p{margin:0;color:var(--sub);font-size:15px}
.steps{counter-reset:s;list-style:none;padding:0;margin:0}
.steps li{counter-increment:s;position:relative;padding:0 0 18px 46px}
.steps li:before{content:counter(s);position:absolute;left:0;top:0;width:32px;height:32px;border-radius:50%;background:var(--brand);color:#fff;text-align:center;line-height:32px;font-weight:700}
@media (prefers-color-scheme:dark){.steps li:before{color:#0e1512}}
.price{background:var(--card);border:2px solid var(--brand);border-radius:16px;padding:26px;text-align:center}
.price .yen{font-size:44px;font-weight:700;color:var(--brand);line-height:1.2}
.price .yen small{font-size:16px;color:var(--sub);font-weight:400}
.price ul{list-style:none;padding:0;margin:14px auto 20px;display:inline-block;text-align:left}
.price li:before{content:"✓ ";color:var(--brand);font-weight:700}
details{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin-bottom:10px}
summary{cursor:pointer;font-weight:700}
details p{margin:10px 0 0;color:var(--sub)}
footer{padding:28px 0 44px;border-top:1px solid var(--line);color:var(--sub);font-size:13px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px}
.urlbox{word-break:break-all;background:var(--tint);border-radius:8px;padding:12px 14px;font-size:14px;margin:12px 0}
.warn{background:var(--warn);border:1px solid var(--warn-line);border-radius:10px;padding:12px 16px;font-size:15px;margin:16px 0}
.list{list-style:none;padding:0;margin:0}
.list a{display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:10px;color:var(--ink);text-decoration:none}
.list a:hover{border-color:var(--brand)}
.list span{display:block;font-size:13px;color:var(--sub)}
pre.tpl{white-space:pre-wrap;word-break:break-word;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;font:inherit;margin:0 0 16px}
.back{display:inline-block;margin:6px 0 14px;color:var(--brand);text-decoration:none;font-size:15px}
`;

const SCRIPT = `
document.querySelectorAll('[data-copy]').forEach(function(b){
  b.addEventListener('click',function(){
    var t=document.querySelector(b.getAttribute('data-copy'));
    var s=t.innerText||t.textContent;
    var done=function(){var o=b.textContent;b.textContent='コピーしました';setTimeout(function(){b.textContent=o},1800)};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(done,function(){})}
    else{var r=document.createRange();r.selectNodeContents(t);var g=getSelection();g.removeAllRanges();g.addRange(r);try{document.execCommand('copy');done()}catch(e){}}
  });
});`;

const layout = (title, inner, { index = false, script = false } = {}) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${index ? '' : '<meta name="robots" content="noindex">'}
<title>${esc(title)}</title>
<style>${CSS}</style></head><body>
<div class="wrap"><header class="top"><a class="logo" href="/">サクモン</a></header>
${inner}
</div>${script ? `<script>${SCRIPT}</script>` : ''}</body></html>`;

export const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export const landing = () =>
  layout(
    'サクモン | 先生のための文面ひな形集',
    `<div class="hero">
<h1>学級通信も、保護者へのお知らせも。<br>ゼロから書かない。</h1>
<p class="lead">サクモンは、先生が保護者向けの文書を書くときの「書き出し」を用意する、文面ひな形集です。ひな形を開いて、{{ }} の部分を書き換えるだけ。</p>
<p><a class="btn" href="/subscribe">月額プランに申し込む</a></p>
<p class="note">月額980円(税込)・いつでも解約できます</p>
</div>

<section>
<h2>こんなひな形が入っています</h2>
<div class="grid">${TEMPLATES.map((t) => `<div class="card"><h3>${esc(t.title)}</h3></div>`).join('')}</div>
</section>

<section>
<h2>使い方</h2>
<ol class="steps">
<li><h3>申し込む</h3><p>クレジットカードで月額プランに申し込みます。</p></li>
<li><h3>ひな形を開く</h3><p>申し込み後、そのブラウザで会員ページが開きます。使いたいひな形を選びます。</p></li>
<li><h3>書き換えてコピー</h3><p>{{ }} の部分を、ご自身の学級の内容に書き換えて、そのまま使えます。</p></li>
</ol>
<p class="note">ひな形は、ご自身で確認して書き換えてお使いください。ページ上で文字を入力する欄はなく、入力した内容がサクモンに送られることはありません。</p>
</section>

<section>
<h2>料金</h2>
<div class="price">
<div class="yen">980円<small>／月(税込)</small></div>
<ul><li>すべてのひな形が使えます</li><li>いつでも解約できます</li><li>解約後も、請求期間の終わりまで使えます</li></ul>
<div><a class="btn" href="/subscribe">月額プランに申し込む</a></div>
</div>
</section>

<section>
<h2>よくある質問</h2>
<details><summary>支払い方法は?</summary><p>クレジットカードです。決済は Stripe を通じて行われ、カード番号はサクモンには保存されません。</p></details>
<details><summary>解約はどうすればいいですか?</summary><p>申し込み後のあなた専用ページに、解約・支払い方法の変更・請求書の確認へのリンクがあります。いつでも、ご自身で手続きできます。解約しても、請求期間の終わりまでは利用できます。</p></details>
<details><summary>ログインは必要ですか?</summary><p>パスワードはありません。お申し込みをしたブラウザは、そのまま会員として使えます。別の端末や、ブラウザのデータを消した後は、お申し込みのメールアドレスに届く6桁の確認コードでログインできます。</p></details>
<details><summary>複数の端末で使えますか?</summary><p>同じ契約で使える端末は、最大3台までです。4台目で使い始めると、最も古い端末の利用が終了します。</p></details>
</section>

<footer>© サクモン</footer>`,
    { index: true },
  );

export const successPage = () =>
  layout(
    'お申し込みありがとうございます',
    `<div class="hero">
<h1>お申し込みありがとうございます</h1>
<p class="lead">お支払いを確認しました。このブラウザが、会員として登録されました。</p>
<div class="panel">
<h2>さっそく使ってみましょう</h2>
<p><a class="btn" href="/m">ひな形を開く</a></p>
<p class="note">次回からは、このブラウザで、下のアドレスを開くだけで使えます。ブックマークしておくと便利です。</p>
<div class="urlbox">https://sakumon.sakumon-app.workers.dev/m</div>
</div>
<div class="warn"><strong>会員として使えるのは、お申し込みをしたブラウザです。</strong><br>アドレスだけを他の人に伝えても、開けません。別の端末で使うときや、ブラウザのデータを消したときは、<a href="/login">ログイン</a>から、お申し込みのメールアドレスに届く確認コードで入れます。</div>
<h3>この後の流れ</h3>
<ol class="steps">
<li><p>「ひな形を開く」を押して、使いたいひな形を選びます。</p></li>
<li><p>{{ }} の部分を書き換えて、コピーして使います。</p></li>
<li><p>解約や支払い方法の変更は、会員ページの下のリンクからできます。</p></li>
</ol>
</div>`,
  );

const FORM_CSS = `<style>
form{margin:16px 0}
label{display:block;font-weight:700;margin-bottom:6px}
input[type=email],input[type=text]{width:100%;font-size:18px;padding:13px 14px;border:1.5px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font-family:inherit}
input:focus{outline:2px solid var(--brand);border-color:var(--brand)}
.err{background:#fde8e8;border:1px solid #f0b4b4;color:#8a1f1f;border-radius:10px;padding:10px 14px;margin:12px 0;font-size:15px}
@media (prefers-color-scheme:dark){.err{background:#3a1c1c;border-color:#6b3030;color:#f3b4b4}}
</style>`;

export const loginPage = (error) =>
  layout(
    'ログイン',
    `${FORM_CSS}<div class="hero" style="padding-top:8px">
<h1 style="font-size:28px">ログイン</h1>
<p class="lead">お申し込みのときに入力したメールアドレスに、6桁の確認コードを送ります。</p>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<form method="post" action="/login">
<label for="email">メールアドレス</label>
<input id="email" name="email" type="email" autocomplete="email" inputmode="email" required>
<p style="margin-top:16px"><button class="btn" type="submit">確認コードを送る</button></p>
</form>
<p class="note">まだお申し込みがない方は、<a href="/subscribe">こちらから</a>どうぞ。</p>
</div>`,
  );

export const codePage = (email, error) =>
  layout(
    '確認コードの入力',
    `${FORM_CSS}<div class="hero" style="padding-top:8px">
<h1 style="font-size:28px">確認コードを入力</h1>
<p class="lead">${esc(email)} に、契約中のアドレスであれば、確認コードを送りました。メールが届かないときは、迷惑メールのフォルダも確認してください。</p>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<form method="post" action="/login/verify">
<input type="hidden" name="email" value="${esc(email)}">
<label for="code">6桁の確認コード</label>
<input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required>
<p style="margin-top:16px"><button class="btn" type="submit">ログイン</button></p>
</form>
<p class="note">コードの有効期間は10分です。<a href="/login">メールアドレスを入力し直す</a></p>
</div>`,
  );

export const claimedPage = () =>
  layout(
    'このお申し込みは開始済みです',
    `<div class="hero"><h1 style="font-size:28px">このお申し込みは開始済みです</h1>
<p class="lead">この画面は、お申し込みをしたブラウザでのみ開けます。別のブラウザや端末からは、開けません。</p>
<p class="note">お申し込みをしたブラウザで、会員ページをご利用ください。別の端末では、メールの確認コードでログインできます。</p>
<p><a class="btn sub" href="/login">メールでログインする</a></p></div>`,
  );

export const pendingPage = () =>
  layout(
    '決済の確認中',
    `<div class="hero"><h1>お支払いを確認しています</h1><p class="lead">確認が終わっていません。少し待ってから、このページを再読み込みしてください。</p></div>`,
  );

export const memberPage = (templates) =>
  layout(
    'サクモン 会員ページ',
    `<div class="hero" style="padding-bottom:20px">
<h1 style="font-size:28px">ひな形一覧</h1>
<p class="lead">使いたいものを選んでください。</p>
<ul class="list">${templates.map((t) => `<li><a href="/m/t/${esc(t.id)}">${esc(t.title)}<span>開いて書き換える →</span></a></li>`).join('')}</ul>
</div>
<section>
<h3>ご契約について</h3>
<p><a class="btn sub" href="/m/portal">解約・支払い方法の変更・請求書</a></p>
</section>`,
  );

export const templatePage = (t) =>
  layout(
    t.title,
    `<div class="hero" style="padding-top:8px">
<a class="back" href="/m">← 一覧へ戻る</a>
<h1 style="font-size:26px">${esc(t.title)}</h1>
<p class="note">{{ }} の部分を、ご自身の内容に書き換えてお使いください。コピーしたあと、お使いのワープロやメールで編集できます。</p>
<pre class="tpl" id="tpl">${esc(t.body)}</pre>
<button class="btn" type="button" data-copy="#tpl">文面をコピー</button>
</div>`,
    { script: true },
  );

export const inactivePage = () =>
  layout(
    'ご利用にはお申し込みが必要です',
    `<div class="hero"><h1 style="font-size:28px">ご利用にはお申し込みが必要です</h1>
<p class="lead">このブラウザは、有効な会員として確認できません。解約済み、お支払いが確認できていない、または、お申し込みをしたブラウザではない可能性があります。</p>
<p><a class="btn" href="/login">メールでログインする</a></p>
<p class="note">まだお申し込みがない方は、<a href="/subscribe">こちらから</a>どうぞ。</p></div>`,
  );

export const notFound = () =>
  html(layout('見つかりません', `<div class="hero"><h1 style="font-size:28px">見つかりません</h1><p><a class="btn sub" href="/">トップへ</a></p></div>`), 404);
