import { TEMPLATES, templatesByCategory } from './content.js';
import { COMPANY } from './company.js';

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
ul.tips{padding-left:1.3em;margin:0;display:flex;flex-direction:column;gap:6px}
ul.tips li{font-size:15px}
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

export const layout = (title, inner, { index = false, script = false, meta = '' } = {}) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${index ? '' : '<meta name="robots" content="noindex">'}${meta}
<title>${esc(title)}</title>
<style>${CSS}</style></head><body>
<div class="wrap"><header class="top"><a class="logo" href="/">サクモン</a></header>
${inner}
</div>${script ? `<script>${SCRIPT}</script>` : ''}</body></html>`;

export const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

// 法務ページは、会社情報がそろって公開スイッチが入るまで出さない。そのあいだはリンクも出さない
const legalLinks = `<p><a href="/legal/tokushoho">特定商取引法に基づく表記</a>　<a href="/legal/terms">利用規約</a>　<a href="/legal/privacy">プライバシーポリシー</a></p>`;

const LP_META = '<meta name="description" content="先生が保護者向けの文書を書くときの「書き出し」を用意する、文面ひな形集。月額980円(税込)。いつでも解約できます。">\n<meta property="og:type" content="website">\n<meta property="og:title" content="サクモン | 先生のための文面ひな形集">\n<meta property="og:description" content="学級通信も、保護者へのお知らせも。ゼロから書かない。月額980円(税込)・いつでも解約できます。">\n<meta name="twitter:card" content="summary">';

const contactLink = `<p><a href="${esc(encodeURI(COMPANY.contactUrl))}" rel="noopener">お問い合わせ</a></p>`;
const contactAnchor = `<a href="${esc(encodeURI(COMPANY.contactUrl))}" rel="noopener">お問い合わせフォーム</a>`;

// メール送信(Resend)が設定されているか。設定されると、メールの確認コードのログインに自動で切り替わる。未設定のあいだは、問い合わせ経由の手動の復旧を案内する
export const mailLoginOn = (env) => !!(env.RESEND_API_KEY && env.MAIL_FROM);

// src: 流入元の目印(note・threads など)。申込ボタンと見本ページに引き継ぎ、Stripe の契約に記録する
export const landing = (legalOpen = false, src = '', mail = true) => {
  const q = src ? '?src=' + encodeURIComponent(src) : '';
  return layout(
    'サクモン | 先生のための文面ひな形集',
    `<div class="hero">
<h1>学級通信も、保護者へのお知らせも。<br>ゼロから書かない。</h1>
<p class="lead">サクモンは、先生が保護者向けの文書を書くときの「書き出し」を用意する、文面ひな形集です。ひな形を開いて、{{ }} の部分をご自身の内容に書き換えてお使いいただけます。</p>
<p><a class="btn" href="/subscribe${q}">月額プランに申し込む</a></p>
<p class="note">月額980円(税込)・いつでも解約できます</p>
<p><a href="/sample${q}">申し込む前に、ひな形の見本を1つ見る →</a></p>
</div>

<section>
<h2>こんなひな形が入っています(全${TEMPLATES.length}点)</h2>
<p class="note" style="margin-bottom:6px">どのひな形にも、使う場面の説明、記入例(架空の内容)、書き方のポイントが付いています。</p>
${templatesByCategory().map((g) => `<h3 style="margin:18px 0 8px">${esc(g.category)}</h3><div class="grid">${g.items.map((t) => `<div class="card"><h3>${esc(t.title)}</h3><p>${esc(t.use)}</p></div>`).join('')}</div>`).join('')}
</section>

<section>
<h2>使い方</h2>
<ol class="steps">
<li><h3>申し込む</h3><p>クレジットカードで月額プランに申し込みます。</p></li>
<li><h3>ひな形を開く</h3><p>申し込み後、そのブラウザで会員ページが開きます。使いたいひな形を選びます。</p></li>
<li><h3>書き換えてコピー</h3><p>{{ }} の部分を、ご自身の学級の内容に書き換えてお使いいただけます。</p></li>
</ol>
<p class="note">ひな形は、ご自身で確認して書き換えてお使いください。児童・保護者の個人情報(病名など)の取り扱いは、所属校・自治体のルールに従ってください。ひな形のページには文字を入力する欄がなく、{{ }} を書き換えた内容がサクモンに送られることはありません(ご契約のメールアドレスなどは除きます)。</p>
</section>

<section>
<h2>料金</h2>
<div class="price">
<div class="yen">980円<small>／月(税込)</small></div>
<ul><li>すべてのひな形が使えます</li><li>お申し込みの月は、月末までの日割り料金(月の最後の2日間のお申し込みは、お申し込み月の料金なし)</li><li>翌月1日から、毎月1日に自動で更新</li><li>いつでも解約できます</li><li>解約後も、請求期間の終わり(月末)まで使えます</li><li>お支払い済みの料金の返金はありません</li></ul>
<div><a class="btn" href="/subscribe${q}">月額プランに申し込む</a></div>
</div>
</section>

<section>
<h2>よくある質問</h2>
<details><summary>料金はいつ請求されますか?</summary><p>お申し込みのときに、その月の残りの日数分の日割り料金(税込)をお支払いいただきます。金額は、決済画面に表示されます。翌月1日からは、毎月1日に月額980円(税込)が自動で請求されます。その月の最後の2日間(最終日とその前日)にお申し込みの場合は、お申し込み時のお支払いはなく、翌月1日が初回です。</p></details>
<details><summary>支払い方法は?</summary><p>クレジットカードです。決済は Stripe を通じて行われ、カード番号はサクモンには保存されません。</p></details>
<details><summary>解約はどうすればいいですか?</summary><p>申し込み後のあなた専用ページに、解約・支払い方法の変更・請求書の確認へのリンクがあります。いつでも、ご自身で手続きできます。解約しても、請求期間の終わり(月末)までは利用できます。翌月分の請求を避けるには、毎月の末日(日本時間)までに解約の手続きを完了してください。</p></details>
<details><summary>ログインは必要ですか?</summary><p>パスワードはありません。お申し込みをしたブラウザは、会員として使えます(会員証の有効期間は最長1年です)。${mail ? '別の端末や、ブラウザのデータを消した後は、お申し込みのメールアドレスに届く6桁の確認コードでログインできます。' : '別の端末で使いたいときや、ブラウザのデータを消したときは、' + contactAnchor + 'からご連絡ください。ご本人の確認のうえ、入り直しのためのリンクをお送りします。新しくお申し込みをする前に、必ずご連絡ください(二重のご請求を防ぐためです)。'}</p></details>
<details><summary>複数の端末で使えますか?</summary><p>同じ契約で使える端末は、最大3台までです。4台目で使い始めると、最も古い端末の利用が終了します。</p></details>
</section>

<footer>${legalOpen ? legalLinks + contactLink : ''}© サクモン</footer>`,
    { index: true, meta: LP_META },
  );
};

// 申し込む前に見られる、ひな形の見本(集客用に共有できるページ)
export const SAMPLE_ID = 'gakkyu-tsushin';
export const samplePage = (t, src = '', legalOpen = false) => {
  const q = src ? '?src=' + encodeURIComponent(src) : '';
  const meta = '<meta name="description" content="サクモンのひな形の見本です。{{ }} の部分を書き換えてお使いいただけます。">\n<meta property="og:type" content="website">\n<meta property="og:title" content="ひな形の見本 | サクモン">\n<meta name="twitter:card" content="summary">';
  return layout(
    `ひな形の見本 | サクモン`,
    `<div class="hero" style="padding-top:8px">
<a class="back" href="/${q}">← サクモンのトップへ</a>
<h1 style="font-size:26px">ひな形の見本:${esc(t.title)}</h1>
<p class="note">サクモンのひな形の見本です。{{ }} の部分を、ご自身の内容に書き換えてお使いください。児童・保護者の個人情報(病名など)は、所属校・自治体のルールに従って取り扱ってください。</p>
<pre class="tpl" id="tpl">${esc(t.body)}</pre>
<button class="btn" type="button" data-copy="#tpl">文面をコピー</button>
<details style="margin-top:14px"><summary>記入例を見る(架空の内容)</summary><pre class="tpl" id="ex" style="margin-top:10px">${esc(t.example)}</pre></details>
<section><h2>ほかのひな形も使いたい方へ</h2>
<p>サクモンには、この見本を含めて${TEMPLATES.length}点のひな形があります。月額980円(税込)。お申し込みの月は日割り、翌月1日から毎月1日に自動で更新します。解約は、毎月の末日(日本時間)までに手続きしてください。お支払い済みの料金の返金はありません。</p>
<p><a class="btn" href="/subscribe${q}">月額プランに申し込む</a></p></section>
<footer>運営:${esc(COMPANY.sellerName)}${legalOpen ? legalLinks + contactLink : ''}</footer>
</div>`,
    { index: true, script: true, meta },
  );
};

export const successPage = (mail = true) =>
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
<div class="warn"><strong>会員として使えるのは、お申し込みをしたブラウザです。</strong><br>アドレスだけを他の人に伝えても、開けません。別の端末で使うときや、ブラウザのデータを消したときは、${mail ? '<a href="/login">ログイン</a>から、お申し込みのメールアドレスに届く確認コードで入れます。' : contactAnchor + 'からご連絡ください。ご本人の確認のうえ、入り直しのためのリンクをお送りします。'}</div>
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
<p class="lead">入力されたアドレス(${esc(email)})が契約中の場合は、確認コードを送りました。メールが届かないときは、迷惑メールのフォルダも確認してください。</p>
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

export const claimedPage = (mail = true) =>
  layout(
    'このお申し込みは開始済みです',
    `<div class="hero"><h1 style="font-size:28px">このお申し込みは開始済みです</h1>
<p class="lead">この画面は、お申し込みをしたブラウザでのみ開けます。別のブラウザや端末からは、開けません。</p>
${mail ? '<p class="note">お申し込みをしたブラウザで、会員ページをご利用ください。別の端末では、メールの確認コードでログインできます。</p><p><a class="btn sub" href="/login">メールでログインする</a></p>' : '<p class="note">お申し込みをしたブラウザで、会員ページをご利用ください。別の端末で使いたいときは、' + contactAnchor + 'からご連絡ください。</p>'}</div>`,
  );

export const pendingPage = () =>
  layout(
    '決済の確認中',
    `<div class="hero"><h1>お支払いを確認しています</h1><p class="lead">確認が終わっていません。少し待ってから、このページを再読み込みしてください。</p></div>`,
  );

export const memberPage = (templates) => {
  const groups = templatesByCategory().map((g) => ({ category: g.category, items: g.items.filter((t) => templates.includes(t)) })).filter((g) => g.items.length);
  return layout(
    'サクモン 会員ページ',
    `<div class="hero" style="padding-bottom:20px">
<h1 style="font-size:28px">ひな形一覧(全${templates.length}点)</h1>
<p class="lead">使いたいものを選んでください。はじめての方は、「使い方ガイド」をご覧ください。</p>
<p><a class="btn sub" href="/m/guide">使い方ガイド</a></p>
${groups.map((g) => `<h2 style="margin:22px 0 10px;font-size:18px">${esc(g.category)}</h2><ul class="list">${g.items.map((t) => `<li><a href="/m/t/${esc(t.id)}">${esc(t.title)}<span>${esc(t.use)}</span></a></li>`).join('')}</ul>`).join('')}
</div>
<section>
<h3>ご契約について</h3>
<p><a class="btn sub" href="/m/portal">解約・支払い方法の変更・請求書</a></p>
</section>`,
  );
};

export const templatePage = (t) =>
  layout(
    t.title,
    `<div class="hero" style="padding-top:8px">
<a class="back" href="/m">← 一覧へ戻る</a>
<p class="note">${esc(t.category)}</p>
<h1 style="font-size:26px">${esc(t.title)}</h1>
<p class="lead" style="font-size:16px">${esc(t.use)}</p>
<p class="note">{{ }} の部分を、ご自身の内容に書き換えてお使いください。コピーしたあと、お使いのワープロやメールで編集できます。児童・保護者の個人情報(病名など)は、所属校・自治体のルールに従って取り扱ってください。</p>
<pre class="tpl" id="tpl">${esc(t.body)}</pre>
<button class="btn" type="button" data-copy="#tpl">文面をコピー</button>
<section><h2>記入例(架空の内容)</h2>
<pre class="tpl" id="ex">${esc(t.example)}</pre>
<button class="btn sub" type="button" data-copy="#ex">記入例をコピー</button></section>
<section><h2>書き方のポイント</h2>
<ul class="tips">${t.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
<p><a class="back" href="/m">← 一覧へ戻る</a></p>
</div>`,
    { script: true },
  );

export const inactivePage = (mail = true) =>
  layout(
    'ご利用にはお申し込みが必要です',
    `<div class="hero"><h1 style="font-size:28px">ご利用にはお申し込みが必要です</h1>
<p class="lead">このブラウザは、有効な会員として確認できません。解約済み、お支払いが確認できていない、または、お申し込みをしたブラウザではない可能性があります。</p>
${mail ? '<p><a class="btn" href="/login">メールでログインする</a></p>' : '<p class="note">お申し込み済みで、別の端末などから入れない場合は、' + contactAnchor + 'からご連絡ください。ご本人の確認のうえ、入り直しのためのリンクをお送りします。新しくお申し込みをする前に、必ずご連絡ください(二重のご請求を防ぐためです)。</p>'}
<p class="note">まだお申し込みがない方は、<a href="/subscribe">こちらから</a>どうぞ。</p></div>`,
  );

export const comingSoonPage = () =>
  layout('サクモン', `<div class="hero"><h1 style="font-size:28px">サクモン</h1><p class="lead">ただいま準備中です。</p></div>`);

export const notFound = () =>
  html(layout('見つかりません', `<div class="hero"><h1 style="font-size:28px">見つかりません</h1><p><a class="btn sub" href="/">トップへ</a></p></div>`), 404);

// メールのログインが未設定のあいだの /login
export const loginOffPage = () =>
  layout(
    '別の端末で使うには',
    `<div class="hero" style="padding-top:8px"><h1 style="font-size:28px">別の端末で使うには</h1>
<p class="lead">現在、メールの確認コードによるログインは、ご用意していません。</p>
<p>別の端末で使いたいとき、ブラウザのデータを消したときは、${contactAnchor}からご連絡ください。ご本人の確認のうえ、入り直しのためのリンク(1回限り・有効期間24時間)をお送りします。</p>
<p class="note">新しくお申し込みをする前に、必ずご連絡ください(二重のご請求を防ぐためです)。</p></div>`,
  );

// 入り直しのリンク(お問い合わせへの返信で、運営から送る1回限りのリンク)。ボタンを押して初めて使われる(メールの自動プレビューで消費されないため)
export const recoverPage = (token) =>
  layout(
    '入り直し',
    `<div class="hero" style="padding-top:8px"><h1 style="font-size:28px">入り直し</h1>
<p class="lead">下のボタンを押すと、このブラウザが、会員として登録されます。</p>
<form method="post" action="/recover/${esc(token)}"><p><button class="btn" type="submit">このブラウザで入り直す</button></p></form>
<p class="note">このリンクは、1回だけ使えます。他の人に教えないでください。</p></div>`,
  );

export const recoverFailPage = () =>
  layout(
    'このリンクは使えません',
    `<div class="hero" style="padding-top:8px"><h1 style="font-size:28px">このリンクは使えません</h1>
<p class="lead">期限が切れているか、すでに使われています。</p>
<p>お手数ですが、${contactAnchor}から、もう一度ご連絡ください。</p></div>`,
  );

// 会員向けの使い方ガイド
export const guidePage = () =>
  layout(
    '使い方ガイド | サクモン',
    `<div class="hero" style="padding-top:8px">
<a class="back" href="/m">← ひな形一覧へ</a>
<h1 style="font-size:28px">使い方ガイド</h1>
<p class="lead">ひな形を、保護者向けの文書に、仕上げるまでの流れと、気をつけたいことです。</p>

<section><h2>1. 使い方の流れ</h2>
<ol class="steps">
<li><h3>ひな形を選ぶ</h3><p>一覧から、場面に合うものを開きます。「使う場面」の説明で、合っているか確かめられます。</p></li>
<li><h3>{{ }} を書き換える</h3><p>「文面をコピー」(コピーできないときは、文面を選んで、手動でコピーしてください)で、ワープロやメールに貼り付け、{{ }} の部分を、ご自身の学級の内容に書き換えます。「記入例」を、見ながら書けます。</p></li>
<li><h3>読み直して、出す</h3><p>下の「出す前のチェック」で、確かめてから、配付や送信をします。</p></li>
</ol></section>

<section><h2>2. 書き換えるときのコツ</h2>
<ul class="tips">
<li>{{ }} が、すべて、書き換わっているか、検索(「{{」)で確かめます。</li>
<li>ひな形の文は、ご自身の言葉に、直して構いません。学級の様子や、先生の人柄が出るところは、書き換えたほうが、伝わります。</li>
<li>長くしすぎず、「いつ・どこで・何を・いつまでに」を、先に書きます。</li>
<li>学級の様子は、ひとつの場面を、具体的に書きます。</li>
</ul></section>

<section><h2>3. 出す前のチェック</h2>
<ul class="tips">
<li>日付と曜日は、カレンダーと、合っているか。</li>
<li>時刻・場所・持ち物・提出日・連絡方法は、合っているか。</li>
<li>{{ }} が、残っていないか。</li>
<li>児童・保護者の名前や、体調などの個人情報が、ほかの人の目に触れる形で、入っていないか。</li>
<li>所属校・自治体の、文書のルール(様式、決裁、配付の方法)に、合っているか。</li>
</ul></section>

<section><h2>4. 個人情報の扱い</h2>
<ul class="tips">
<li>児童の名前や、病名など体調の詳しい情報は、ほかの人の目に触れる文書には、書きません。</li>
<li>個別の連絡(けがの連絡、欠席の返信など)は、学校の決まりに従った方法で行います。</li>
<li>サクモンのひな形のページには、文字を入力する欄がなく、{{ }} を書き換えた内容が、サクモンに送られることは、ありません。書き換えは、お使いのワープロやメールの上で行います。</li>
</ul></section>

<section><h2>5. ご注意</h2>
<ul class="tips">
<li>ひな形は、書き出しの助けとして、用意したものです。実際に使うときの判断と責任は、ご利用の先生にあります。</li>
<li>学校ごとに、文書の決まりが違います。ひな形が、所属校の様式と、合わない場合は、所属校の様式を、優先してください。</li>
<li>けが・体調不良の連絡などは、管理職への報告や連絡の方法が、決まっている場合があります。このひな形は、その代わりにはなりません。</li>
</ul></section>
</div>`,
  );
