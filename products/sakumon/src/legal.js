// 法務ページ。文面は products/sakumon/legal/ の下書きをもとにしている。公開前に専門家の確認を推奨。
import { layout, esc } from './pages.js';
import { REQUIRED } from './company.js';

const BLANK_CSS = `<style>
.legal h1{font-size:26px}
.legal h2{font-size:18px;margin:26px 0 8px}
.legal table{width:100%;border-collapse:collapse;font-size:15px}
.legal th,.legal td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
.legal th{width:9em;background:var(--tint);white-space:nowrap}
.legal ol,.legal ul{padding-left:1.4em}
.blank{background:#fff1a8;color:#5c4400;padding:0 4px;border-radius:4px;font-weight:700}
@media (max-width:560px){.legal th{white-space:normal;width:7em}}
</style>`;

// 空欄は【未記入:◯◯】と目立たせる(確認用の表示。空欄があるうちは、公開側では404になる)
const val = (c, key) => (String(c[key] ?? '').trim() ? esc(c[key]) : `<span class="blank">【未記入:${esc(REQUIRED[key] || key)}】</span>`);
const contact = (c) =>
  `${c.contactUrl ? `<a href="${esc(encodeURI(c.contactUrl))}" rel="noopener">お問い合わせフォーム</a>` : val(c, 'contactUrl')}${c.contactEmail ? `(${esc(c.contactEmail)})` : ''}`;

const wrap = (title, body) => layout(title, `${BLANK_CSS}<main class="legal"><div class="hero" style="padding-top:8px">${body}</div></main>`);

export const tokushohoPage = (c) =>
  wrap(
    '特定商取引法に基づく表記',
    `<h1>特定商取引法に基づく表記</h1>
<table>
<tr><th>販売事業者</th><td>${val(c, 'sellerName')}</td></tr>
<tr><th>運営責任者</th><td>${val(c, 'representative')}</td></tr>
<tr><th>所在地</th><td>${val(c, 'address')}</td></tr>
<tr><th>電話番号</th><td>${val(c, 'phone')}</td></tr>
<tr><th>お問い合わせ</th><td>${contact(c)}</td></tr>
<tr><th>販売価格</th><td>月額980円(税込)</td></tr>
<tr><th>販売価格以外の必要料金</th><td>なし(インターネット接続料・通信料は、お客様のご負担です)</td></tr>
<tr><th>支払方法</th><td>クレジットカード(Stripe による決済)</td></tr>
<tr><th>支払時期</th><td>お申し込み時に、お申し込み日から月末までの日割り料金(税込)をお支払いいただきます。日割り料金は、Stripe が日数に応じて自動で計算します。月末の2日以内にお申し込みの場合は、お申し込み時のお支払いはなく、初回のお支払いは翌月1日です。以後、毎月1日に、月額980円(税込)が自動で更新され、請求されます。</td></tr>
<tr><th>提供時期</th><td>お支払いの確認後、すぐにご利用いただけます。</td></tr>
<tr><th>解約</th><td>会員ページの「解約・支払い方法の変更・請求書」から、いつでも手続きできます。解約しても、お支払い済みの請求期間の終わりまでは、ご利用いただけます。</td></tr>
<tr><th>返金</th><td>${val(c, 'refundPolicy')}</td></tr>
<tr><th>動作環境</th><td>インターネットに接続できる、一般的なブラウザ(最新版の Chrome・Safari・Edge など)</td></tr>
</table>`,
  );

export const termsPage = (c) =>
  wrap(
    'サクモン 利用規約',
    `<h1>サクモン 利用規約</h1>
<p>この規約は、${val(c, 'sellerName')}(以下「当社」)が提供する「サクモン」(以下「本サービス」)の利用条件を定めるものです。お申し込みをした方(以下「利用者」)は、この規約に同意したものとします。</p>
<h2>第1条(サービスの内容)</h2>
<p>本サービスは、教職員の方が保護者向けの文書などを作成する際に使える、文面のひな形を提供するものです。ひな形は、利用者が内容を確認し、実際の状況に合わせて書き換えてお使いください。</p>
<h2>第2条(料金と支払い)</h2>
<ol><li>利用料金は、月額980円(税込)です。</li><li>お申し込みの月は、お申し込み日から月末までの日割り料金をお支払いいただきます(Stripe が日数に応じて自動で計算します)。月末の2日以内にお申し込みの場合は、お申し込み月の料金はかかりません。</li><li>翌月1日から、毎月1日に、月額料金が自動で更新され、請求されます。</li><li>支払いは、Stripe を通じたクレジットカード決済とします。</li></ol>
<h2>第3条(解約と返金)</h2>
<ol><li>利用者は、会員ページの「解約・支払い方法の変更・請求書」から、いつでも解約できます。</li><li>解約しても、お支払い済みの請求期間の終わりまでは、利用できます。</li><li>返金の扱いは、次のとおりです。${val(c, 'refundPolicy')}</li></ol>
<h2>第4条(会員証とログイン)</h2>
<ol><li>本サービスは、お申し込みをしたブラウザに渡す会員証(Cookie)と、お申し込みのメールアドレスに送る確認コードで、利用者を確認します。</li><li>同じ契約で同時に使える端末は、最大3台までです。4台目で使い始めると、最も古い端末の利用が終了します。</li><li>利用者は、確認コードを他の人に教えてはいけません。</li></ol>
<h2>第5条(禁止事項)</h2>
<ol><li>ひな形や会員ページの内容を、再配布、転売、または第三者に有償で提供すること。</li><li>本サービスの運営を妨げる行為。</li><li>法令または公序良俗に反する行為。</li></ol>
<h2>第6条(著作権)</h2>
<p>ひな形の著作権は、当社に帰属します。利用者は、ご自身の学級・学校での業務の範囲で、書き換えて利用できます。</p>
<h2>第7条(免責)</h2>
<ol><li>ひな形は、利用者の状況に合うことを保証するものではありません。実際に利用するときの判断と責任は、利用者にあります。</li><li>当社は、本サービスの内容を変更し、または提供を終了することがあります。その場合は、あらかじめ本サービス上でお知らせします。</li></ol>
<h2>第8条(規約の変更)</h2>
<p>当社は、必要な場合に、この規約を変更できます。変更後の規約は、本サービスのウェブサイトに掲載した時点から効力を生じます。</p>
<h2>第9条(準拠法・管轄)</h2>
<p>この規約は日本法に従います。紛争が生じた場合は、${val(c, 'jurisdiction')}を第一審の専属的合意管轄裁判所とします。</p>
<p style="margin-top:20px">制定日:${val(c, 'enactedDate')}</p>`,
  );

export const privacyPage = (c) =>
  wrap(
    'サクモン プライバシーポリシー',
    `<h1>サクモン プライバシーポリシー</h1>
<p>${val(c, 'sellerName')}(以下「当社」)は、「サクモン」(以下「本サービス」)で取り扱う個人情報を、次のとおり扱います。</p>
<h2>1. 取得する情報</h2>
<ul><li>メールアドレス(お申し込み時に、Stripe の決済画面で入力いただくもの)</li><li>Stripe 上のお客様ID、契約ID、契約の状態(有効・解約など)</li><li>会員証の確認のために、ブラウザに保存する Cookie</li></ul>
<p>クレジットカード番号は Stripe が管理します。当社のサーバーには、保存されません。</p>
<h2>2. 利用目的</h2>
<ul><li>ご利用資格の確認(契約が有効かどうか)</li><li>ログイン用の確認コードの送信</li><li>解約や支払いに関するご連絡、お問い合わせへの対応</li></ul>
<h2>3. 第三者への提供・委託</h2>
<ul><li>決済は、Stripe, Inc. に委託します。</li><li>本サービスは、Cloudflare, Inc. のサービス上で運営します。</li><li>ログイン用の確認コードのメール送信は、メール送信サービス(Resend)に委託します。</li><li>上記のほか、法令に基づく場合を除き、本人の同意なく第三者に提供しません。</li></ul>
<h2>4. 保管期間</h2>
<p>契約の情報の保管期間は、${val(c, 'retentionPeriod')}です。</p>
<h2>5. 開示・訂正・削除のご請求</h2>
<p>ご本人からのご請求は、下記の窓口で受け付けます。</p>
<h2>6. お問い合わせ窓口</h2>
<p>${val(c, 'sellerName')}<br>${contact(c)}</p>
<p style="margin-top:20px">制定日:${val(c, 'enactedDate')}</p>`,
  );
