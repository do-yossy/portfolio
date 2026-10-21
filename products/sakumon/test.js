// 依存ゼロのスモークテスト(sales-platform/test.js と同じ ok(cond, name) 形式)。
// D1 は node:sqlite で代用し、本物の schema.sql と SQL を通す。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { legalOpen } from './src/worker.js';
import { COMPANY, legalMissing } from './src/company.js';
import { tokushohoPage, termsPage, privacyPage } from './src/legal.js';
import { landing } from './src/pages.js';
import { TEMPLATES, CATEGORIES, LEVELS, forLevel } from './src/content.js';
import { validEmail, buildSql, hashToken } from './scripts/recovery-link.mjs';
import { billingPlan } from './src/stripe.js';
import { buildSql as fbSql, report as fbReport } from './scripts/feedback-report.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) pass++;
  else { fail++; console.log('NG:', name); }
};

function makeDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let args = [];
      const o = {
        bind: (...a) => { args = a; return o; },
        first: async () => stmt.get(...args) ?? null,
        run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      };
      return o;
    },
  };
}

const SECRET = 'whsec_test';
const env = { DB: makeDb(), STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_ID: 'price_x', RESEND_API_KEY: 're_test', MAIL_FROM: 'サクモン <login@example.test>' };
const sentMails = [];
let lastCheckoutBody = '';

// Stripe API の擬似応答(申込完了画面が Checkout Session を取りにいく)
const realFetch = globalThis.fetch;
globalThis.fetch = async function (u) {
  const m = String(u).match(/checkout\/sessions\/(cs_\w+)/);
  if (m) {
    return new Response(JSON.stringify({ id: m[1], status: 'complete', customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid', customer_details: { email: 'a@example.com' } }), { status: 200 });
  }
  if (String(u).endsWith('/v1/checkout/sessions') && arguments[1] && arguments[1].method === 'POST') {
    lastCheckoutBody = arguments[1].body;
    return new Response(JSON.stringify({ id: 'cs_new', url: 'https://checkout.stripe.test/c/pay/cs_new' }), { status: 200 });
  }
  if (String(u) === 'https://api.resend.com/emails') {
    sentMails.push(JSON.parse(arguments[1].body));
    return new Response('{"id":"m1"}', { status: 200 });
  }
  return new Response('{}', { status: 404 });
};

async function sign(body, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${sig}`;
}

async function send(ev, header) {
  const body = JSON.stringify(ev);
  const res = await worker.fetch(new Request('https://x.test/stripe/webhook', {
    method: 'POST', body, headers: { 'stripe-signature': header ?? (await sign(body)) },
  }), env);
  return res.status;
}

const get = (path, cookie) => worker.fetch(new Request(`https://x.test${path}`, { headers: cookie ? { cookie } : {} }), env);
const row = () => env.DB.prepare('SELECT * FROM members WHERE customer_id = ?').bind('cus_1').first();
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

// --- 署名 ---
ok((await send({ id: 'e0', type: 'x' }, 't=1,v1=bad')) === 400, '不正な署名は400');
ok((await send({ id: 'e0', type: 'x' }, await sign('{"id":"e0","type":"x"}', 'wrong'))) === 400, '別の秘密鍵の署名は400');
ok((await send({ id: 'e0', type: 'x' }, await sign('{"id":"e0","type":"x"}', SECRET, 1000))) === 400, '古いタイムスタンプは400');
ok((await send({ id: 'e1', type: 'x' })) === 200, '正しい署名は200');

// --- 契約の開始 ---
ok((await send({ id: 'e2', type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid', customer_details: { email: 'a@example.com' } } } })) === 200, 'checkout完了');
const m = await row();
ok(m && m.status === 'active' && m.email === 'a@example.com', '契約中として記録');

// --- 会員証は、購入したブラウザにだけ渡る ---
ok((await get('/m')).status === 403, '会員証のないブラウザは会員ページを開けない');
ok((await get(`/m/${m.token}`)).status !== 200, '以前のトークンURLは使えない');
const first = await get('/success?session_id=cs_A');
const cookie = cookieOf(first);
ok(first.status === 200 && cookie.startsWith('sakumon_session=') && (first.headers.get('set-cookie') || '').includes('HttpOnly'), '申込完了で会員証(HttpOnly Cookie)が渡る');
ok(!(await first.text()).includes(cookie.split('=')[1]), '会員証の値が画面に表示されない');
const second = await get('/success?session_id=cs_A');
ok(second.status === 403 && !second.headers.get('set-cookie'), '同じ申込完了URLを別のブラウザで開いても会員証は渡らない');
ok((await get('/success?session_id=cs_A', cookie)).status === 200, '会員証を持つブラウザは申込完了画面をもう一度見られる');

// --- アクセス制御 ---
const page = await get('/m', cookie);
ok(page.status === 200 && (await page.text()).includes('学級通信'), '会員証のあるブラウザは会員ページが見える');
ok((await get('/m/t/gakkyu-tsushin', cookie)).status === 200, '会員証のあるブラウザは教材が見える');
ok((await get('/m/t/gakkyu-tsushin')).status === 403, '会員証のないブラウザは教材が見えない');
ok((await get('/m', 'sakumon_session=' + '0'.repeat(48))).status === 403, 'でたらめな会員証は無効');

// --- 端末数の上限(3台)---
const c2 = cookieOf(await get('/success?session_id=cs_B'));
const c3 = cookieOf(await get('/success?session_id=cs_C'));
ok((await get('/m', c2)).status === 200 && (await get('/m', c3)).status === 200 && (await get('/m', cookie)).status === 200, '3台までは同時に使える');
const c4 = cookieOf(await get('/success?session_id=cs_D'));
ok((await get('/m', c4)).status === 200, '4台目も使える');
ok((await get('/m', cookie)).status === 403, '4台目を使い始めると、最も古い端末は使えなくなる');
ok((await get('/m', c2)).status === 200, '新しい端末は使えたまま');

// --- 再送(冪等) ---
ok((await send({ id: 'e2', type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'cus_1', payment_status: 'unpaid' } } })) === 200, '同じイベントIDの再送は200');
ok((await row()).status === 'active', '再送で状態が変わらない');

// --- 支払い失敗・回復 ---
await send({ id: 'e3', type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } });
ok((await row()).status === 'past_due', '支払い失敗でpast_due');
ok((await get('/m', c4)).status === 403, 'past_dueは教材が見えない');
await send({ id: 'e4', type: 'invoice.paid', data: { object: { customer: 'cus_1' } } });
ok((await row()).status === 'active', '支払い成功でactiveに戻る');
ok((await get('/m', c4)).status === 200, '回復すると、同じ端末で再び見える');

// --- 解約 ---
await send({ id: 'e5', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1' } } });
ok((await row()).status === 'canceled', '解約でcanceled');
ok((await get('/m', c4)).status === 403, '解約後は会員証があっても教材が見えない');
await send({ id: 'e6', type: 'invoice.paid', data: { object: { customer: 'cus_1' } } });
ok((await row()).status === 'canceled', '解約後に遅れて届いたinvoice.paidで復活しない');

// --- イベントの到着順が前後しても作成される ---
await send({ id: 'e7', type: 'customer.subscription.created', data: { object: { id: 'sub_2', customer: 'cus_2', status: 'active' } } });
const m2 = await env.DB.prepare('SELECT * FROM members WHERE customer_id = ?').bind('cus_2').first();
ok(m2 && m2.status === 'active', 'subscription.createdが先に届いても契約者が作られる');

const closed = await (await get('/')).text();
ok(closed.includes('準備中') && !closed.includes('月額プランに申し込む'), 'LP_PUBLICが未設定なら、トップは「準備中」でLPは出ない');
env.LP_PUBLIC = 'false';
ok(!(await (await get('/')).text()).includes('月額プランに申し込む'), 'LP_PUBLIC=falseでもLPは出ない');
env.LP_PUBLIC = 'true';
ok((await (await get('/')).text()).includes('月額プランに申し込む'), 'LP_PUBLIC=trueならLPが表示される');
delete env.LP_PUBLIC;
ok((await get('/nope')).status === 404, '未定義のパスは404');

// --- メールの確認コードでログイン ---
const post = (path, fields, cookie) =>
  worker.fetch(new Request(`https://x.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(fields).toString(),
  }), env);
const codeOf = (mail) => mail.text.match(/([0-9]{6})/)[1];
const resetInterval = () => env.DB.prepare('UPDATE login_codes SET last_sent = last_sent - 120').run();

await send({ id: 'e8', type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'cus_3', subscription: 'sub_3', payment_status: 'paid', customer_details: { email: 'Teacher@Example.com' } } } });
ok((await get('/login')).status === 200, 'ログイン画面が表示される');

const r0 = await post('/login', { email: 'nobody@example.com' });
ok(r0.status === 200 && sentMails.length === 0, '登録のないアドレスには送らず、同じ画面を返す');
const rCanceled = await post('/login', { email: 'a@example.com' });
ok(rCanceled.status === 200 && sentMails.length === 0, '解約済みの人にはコードを送らない');

const r1 = await post('/login', { email: 'teacher@example.com' });
ok(r1.status === 200 && sentMails.length === 1, '契約中のアドレスにコードを送る(大文字小文字は区別しない)');
ok(sentMails[0].to[0] === 'teacher@example.com' && sentMails[0].from.includes('login@example.test'), '宛先と差出人が正しい');
ok(/^\d{6}$/.test(codeOf(sentMails[0])), '6桁のコード');
ok(!(await r1.text()).includes(codeOf(sentMails[0])), 'コードは画面に表示されない');

await post('/login', { email: 'teacher@example.com' });
ok(sentMails.length === 1, '60秒以内の再送は受け付けない');

const code1 = codeOf(sentMails[0]);
const wrong = await post('/login/verify', { email: 'teacher@example.com', code: code1 === '000000' ? '111111' : '000000' });
ok(wrong.status === 400 && !wrong.headers.get('set-cookie'), '違うコードではログインできない');
const good = await post('/login/verify', { email: 'Teacher@example.com', code: code1 });
const loginCookie = cookieOf(good);
ok(good.status === 303 && good.headers.get('location') === '/m' && loginCookie.startsWith('sakumon_session='), '正しいコードでログインでき、会員証が渡る');
ok((await get('/m', loginCookie)).status === 200, 'ログイン後は会員ページが見える');
const reuse = await post('/login/verify', { email: 'teacher@example.com', code: code1 });
ok(reuse.status === 400, '使ったコードは再利用できない');

await resetInterval();
await post('/login', { email: 'teacher@example.com' });
const code2 = codeOf(sentMails[1]);
for (let i = 0; i < 5; i++) await post('/login/verify', { email: 'teacher@example.com', code: code2 === '123456' ? '654321' : '123456' });
ok((await post('/login/verify', { email: 'teacher@example.com', code: code2 })).status === 400, '5回間違えると、正しいコードでも使えなくなる');

await resetInterval();
await post('/login', { email: 'teacher@example.com' });
await env.DB.prepare('UPDATE login_codes SET expires_at = expires_at - 700').run();
ok((await post('/login/verify', { email: 'teacher@example.com', code: codeOf(sentMails[sentMails.length - 1]) })).status === 400, '期限(10分)を過ぎたコードは使えない');

for (let i = 0; i < 6; i++) { await resetInterval(); await post('/login', { email: 'teacher@example.com' }); }
ok(sentMails.length <= 1 + 1 + 1 + 5 + 0, '1時間に送れるのは5通まで');
const crossOrigin = await worker.fetch(new Request('https://x.test/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.test' }, body: 'email=teacher@example.com' }), env);
ok(crossOrigin.status === 404, '他のサイトからの送信は受け付けない');

// --- 法務ページ(空欄があるうちは公開されない) ---
const FULL = { ...COMPANY, phone: '請求があれば遅滞なく開示します', refundPolicy: 'テスト返金方針', retentionPeriod: '解約から5年', enactedDate: '2026年10月1日', jurisdiction: '大阪地方裁判所' };
const BLANK = { ...COMPANY, retentionPeriod: '' };
ok(legalMissing(COMPANY).length === 0, '会社情報の必須項目は、すべて記入済み');
ok(legalMissing(BLANK).length === 1 && legalMissing(BLANK)[0] === 'retentionPeriod', '空欄にすると、不足として判定される');
ok(!legalMissing(COMPANY).includes('refundPolicy') && !legalMissing(COMPANY).includes('enactedDate'), '返金の方針と制定日は、記入済み');
ok(!legalMissing(COMPANY).includes('phone') && !legalMissing(COMPANY).includes('jurisdiction'), '電話番号の表示と管轄裁判所は、記入済み');
ok(legalMissing(FULL).length === 0, '全項目を埋めれば不足なし');
for (const p of ['/legal/tokushoho', '/legal/terms', '/legal/privacy']) {
  env.LEGAL_PUBLIC = undefined;
  ok((await get(p)).status === 404, p + ': スイッチ未設定なら404');
  env.LEGAL_PUBLIC = 'true';
  ok((await get(p)).status === 200, p + ': スイッチが"true"で全項目が記入済みなら公開される');
}
delete env.LEGAL_PUBLIC;
ok(!legalOpen({ LEGAL_PUBLIC: 'false' }, FULL), 'スイッチが"false"なら、全項目が埋まっていても公開されない');
ok(legalOpen({ LEGAL_PUBLIC: 'true' }, FULL), 'スイッチが"true"で全項目が埋まれば公開される');
ok(!legalOpen({ LEGAL_PUBLIC: 'true' }, BLANK), 'スイッチが"true"でも、空欄があれば公開されない');
ok(!legalOpen({}, COMPANY) && !legalOpen({ LEGAL_PUBLIC: 'false' }, COMPANY), '全項目が記入済みでも、スイッチが入るまでは公開されない');
const tk = tokushohoPage(FULL), tkBlank = tokushohoPage(COMPANY);
ok(tk.includes('安藤 嘉啓') && tk.includes('大阪府大阪市浪速区') && tk.includes('月額980円(税込)') && tk.includes('テスト返金方針') && !tk.includes('【未記入'), '特商法の表記に、記入済みの内容が出る');
ok(privacyPage(BLANK).includes('【未記入:保管期間】') && privacyPage(COMPANY).includes('契約期間中および解約後1年間') && tkBlank.includes('請求があれば遅滞なく開示します') && tkBlank.includes('返金しません'), '空欄は【未記入】と目立つ表示になり、記入済みの内容は出る(確認用)');
ok(termsPage(FULL).includes('大阪地方裁判所') && termsPage(FULL).includes('2026年10月1日') && !termsPage(FULL).includes('【未記入'), '規約に、管轄と制定日が出る');
ok(privacyPage(FULL).includes('解約から5年') && privacyPage(FULL).includes('Stripe') && privacyPage(FULL).includes('Resend'), 'プライバシーポリシーに、保管期間と委託先が出る');
ok(!landing(false).includes('/legal/terms') && landing(true).includes('/legal/terms'), 'LPの法務リンクは、公開できるときだけ出る');
env.LP_PUBLIC = 'true';
ok(!(await (await get('/')).text()).includes('/legal/'), '法務が未公開のうちは、LPに法務リンクが出ない');
env.LEGAL_PUBLIC = 'true';
ok((await (await get('/')).text()).includes('/legal/terms'), '法務が公開できる状態なら、LPのフッターに法務リンクが出る');
delete env.LEGAL_PUBLIC;
delete env.LP_PUBLIC;

// --- 請求の方式(申込月は日割り・翌月1日から毎月1日に自動継続) ---
const at = (s) => Date.parse(s + '+09:00');
const jstOf = (sec) => new Date(sec * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 16);
const p1 = billingPlan(at('2026-10-17T12:00:00'));
ok(jstOf(p1.anchor) === '2026-11-01T00:00' && p1.proration === 'create_prorations', '月の途中の申込: 翌月1日0時(日本時間)が請求日で、申込月は日割り');
ok(jstOf(billingPlan(at('2026-12-15T09:00:00')).anchor) === '2027-01-01T00:00', '12月の申込は、翌年1月1日が請求日(年またぎ)');
ok(jstOf(billingPlan(at('2026-10-01T00:00:00')).anchor) === '2026-11-01T00:00', '月初(1日0時)の申込も、翌月1日が請求日');
ok(billingPlan(at('2026-10-29T12:00:00')).proration === 'create_prorations', '月末まで2日以上あれば日割りで請求する');
ok(billingPlan(at('2026-10-30T12:00:00')).proration === 'none' && billingPlan(at('2026-10-31T12:00:00')).proration === 'none', '月末の2日以内は、最低決済額(50円)を下回るため日割りせず、翌月1日が初回の請求');
// UTCでは前日でも、日本時間で翌日なら、日本時間で数える
ok(jstOf(billingPlan(Date.parse('2026-10-31T16:00:00Z')).anchor) === '2026-12-01T00:00', '日本時間11月1日0時(UTC10月31日16時)の申込は、12月1日が請求日');
const sub = await get('/subscribe');
ok(sub.status === 303 && String(sub.headers.get('location')).startsWith('https://checkout.stripe.test/'), '申込ボタンはStripeの決済画面へ転送する');
const sent = new URLSearchParams(lastCheckoutBody);
ok(/^\d{10}$/.test(sent.get('subscription_data[billing_cycle_anchor]')) && ['create_prorations', 'none'].includes(sent.get('subscription_data[proration_behavior]')), 'Stripeに、請求日と日割りの指定を送っている');
ok(Number(sent.get('subscription_data[billing_cycle_anchor]')) * 1000 > Date.now() && sent.get('managed_payments[enabled]') === 'false' && sent.get('mode') === 'subscription', '請求日は未来で、Managed Paymentsは使わない');
ok(sent.get('adaptive_pricing[enabled]') === 'false', '通貨の自動変換(Adaptive Pricing)を使わない=常に円で表示・請求する');

// --- 集客の導線(流入元の目印・見本ページ・共有用のメタ情報) ---
env.LP_PUBLIC = 'true';
const lpSrc = await (await get('/?src=note')).text();
ok(lpSrc.includes('href="/subscribe?src=note"') && lpSrc.includes('href="/sample?src=note"'), 'LPは、流入元(src)を、申込ボタンと見本のリンクに引き継ぐ');
const lpPlain = await (await get('/')).text();
ok(lpPlain.includes('href="/subscribe"') && !lpPlain.includes('?src='), 'srcがなければ、リンクにsrcは付かない');
const lpBad = await (await get('/?src=%3Cscript%3Ealert(1)%3C%2Fscript%3E')).text();
ok(!lpBad.includes('<script>alert') && !lpBad.includes('?src='), '不正なsrc(記号を含む)は、無視される');
ok(lpPlain.includes('property="og:title"') && lpPlain.includes('name="description"') && !lpPlain.includes('noindex'), 'LPに共有用のメタ情報があり、検索の対象になる');
const sm = await get('/sample?src=threads');
const smHtml = await sm.text();
ok(sm.status === 200 && smHtml.includes('{{月}}') && smHtml.includes('data-copy="#tpl"') && smHtml.includes('href="/subscribe?src=threads"'), '見本ページ: ひな形の中身・コピーボタン・申込への導線(src引き継ぎ)がある');
ok(smHtml.includes('児童・保護者の個人情報'), '見本ページにも、個人情報の注意がある');
env.LEGAL_PUBLIC = 'true';
const lpLegal = await (await get('/')).text();
ok(lpLegal.includes('お問い合わせ') && lpLegal.includes('/legal/terms'), '法務が公開できる状態なら、LPのフッターに、お問い合わせへのリンクも出る');
delete env.LEGAL_PUBLIC;
delete env.LP_PUBLIC;
ok((await get('/sample')).status === 404, 'LPが非公開のあいだは、見本ページも404');
await get('/subscribe?src=note');
ok(new URLSearchParams(lastCheckoutBody).get('metadata[src]') === 'note' && new URLSearchParams(lastCheckoutBody).get('subscription_data[metadata][src]') === 'note', '流入元(src)を、Stripeの決済と契約のメタデータに記録する');
await get('/subscribe');
ok(!new URLSearchParams(lastCheckoutBody).has('metadata[src]'), 'srcがなければ、メタデータは付けない');
await get('/subscribe?src=BAD%20VALUE!');
ok(!new URLSearchParams(lastCheckoutBody).has('metadata[src]'), '不正なsrcは、Stripeに送らない');
await get('/subscribe?src=Note');
ok(new URLSearchParams(lastCheckoutBody).get('metadata[src]') === 'note', 'srcは小文字にそろえる');

// --- 審査指摘の反映(見本ページの運営者表示・条件の明記・流入元のポリシー記載) ---
env.LP_PUBLIC = 'true';
const smNoLegal = await (await get('/sample')).text();
ok(smNoLegal.includes('運営:株式会社Social Quality') && smNoLegal.includes('返金はありません') && smNoLegal.includes('毎月の末日') && smNoLegal.includes('日割り'), '見本ページに、運営者名と、料金・解約・返金の条件が書かれている');
env.LEGAL_PUBLIC = 'true';
const smLegal = await (await get('/sample')).text();
ok(smLegal.includes('/legal/tokushoho') && smLegal.includes('お問い合わせ'), '法務が公開できる状態なら、見本ページにも法務リンクとお問い合わせが出る');
delete env.LEGAL_PUBLIC;
const lpRefund = await (await get('/')).text();
ok(lpRefund.includes('お支払い済みの料金の返金はありません') && lpRefund.includes('ご契約のメールアドレスなどは除きます'), 'LPに、返金なしと、「送られない」の範囲の限定が書かれている');
delete env.LP_PUBLIC;
ok(privacyPage(COMPANY).includes('流入元の目印'), 'プライバシーポリシーに、流入元の目印の取得が書かれている');

// --- メールのログインが未設定のあいだの復旧(問い合わせ経由・入り直しのリンク) ---
const envOff = { ...env, RESEND_API_KEY: undefined, MAIL_FROM: undefined };
const getOff = (path, cookie) => worker.fetch(new Request(`https://x.test${path}`, { headers: cookie ? { cookie } : {} }), envOff);
const postOff = (path, fields) => worker.fetch(new Request(`https://x.test${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }), envOff);

const loginOff = await getOff('/login');
const loginOffHtml = await loginOff.text();
ok(loginOff.status === 200 && !loginOffHtml.includes('name="email"') && loginOffHtml.includes('お問い合わせフォーム') && loginOffHtml.includes('二重のご請求'), 'メール未設定のあいだ、/login はフォームを出さず、問い合わせの案内と二重請求の注意を出す');
const before = sentMails.length;
await postOff('/login', { email: 'teacher@example.com' });
ok(sentMails.length === before, 'メール未設定のあいだは、確認コードを送ろうとしない');
const inactiveOff = await (await getOff('/m')).text();
ok(inactiveOff.includes('お問い合わせフォーム') && !inactiveOff.includes('メールでログインする'), '会員でないときの画面も、問い合わせの案内に切り替わる');
const lpOff = await (await worker.fetch(new Request('https://x.test/'), { ...envOff, LP_PUBLIC: 'true' })).text();
ok(lpOff.includes('入り直しのためのリンクをお送りします') && !lpOff.includes('6桁の確認コードでログインできます'), 'LPのよくある質問が、メール未設定の実態に合っている');
ok(termsPage(COMPANY, false).includes('入り直しのためのリンク') && !termsPage(COMPANY, false).includes('確認コードで、利用者を確認します') && !privacyPage(COMPANY, false).includes('Resend') && privacyPage(COMPANY, false).includes('入り直しのためのリンク'), '規約・プライバシーポリシーも、メール未設定の実態に合っている(Resendへの委託は書かない)');
ok(privacyPage(COMPANY, true).includes('Resend') && termsPage(COMPANY, true).includes('確認コードで、利用者を確認します'), 'メール設定後は、確認コードの記載に戻る');

// 入り直しのリンク(運営が発行)
const rToken = 'ab'.repeat(24);
const rHash = hashToken(rToken);
const issue = (id, customer, exp, used = 0) => env.DB.prepare('INSERT INTO recovery_links (id, customer_id, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, customer, exp, used, Math.floor(Date.now() / 1000)).run();
await issue(rHash, 'cus_3', Math.floor(Date.now() / 1000) + 3600);
const recGet = await get(`/recover/${rToken}`);
ok(recGet.status === 200 && (await recGet.text()).includes('このブラウザで入り直す'), '入り直しのリンクを開くと、確認のボタンが出る(開いただけでは使われない)');
ok((await get(`/recover/${rToken}`)).status === 200, '開くだけなら、何度でも開ける');
const recPost = await post(`/recover/${rToken}`, {});
const recCookie = cookieOf(recPost);
ok(recPost.status === 303 && recPost.headers.get('location') === '/m' && recCookie.startsWith('sakumon_session='), 'ボタンを押すと、会員証が渡され、会員ページへ進む');
ok((await get('/m', recCookie)).status === 200, '入り直したブラウザで、会員ページが見える');
ok((await post(`/recover/${rToken}`, {})).status === 403, '1回使ったリンクは、もう使えない');
await issue(hashToken('cd'.repeat(24)), 'cus_3', Math.floor(Date.now() / 1000) - 10);
ok((await post(`/recover/${'cd'.repeat(24)}`, {})).status === 403, '期限切れのリンクは使えない');
ok((await post(`/recover/${'ef'.repeat(24)}`, {})).status === 403, '発行されていないリンクは使えない');
await issue(hashToken('12'.repeat(24)), 'cus_1', Math.floor(Date.now() / 1000) + 3600);
ok((await post(`/recover/${'12'.repeat(24)}`, {})).status === 403, '解約済みの会員のリンクは使えない');
const crossRec = await worker.fetch(new Request(`https://x.test/recover/${'34'.repeat(24)}`, { method: 'POST', headers: { origin: 'https://evil.test' } }), env);
ok(crossRec.status === 404, '他のサイトからの送信は受け付けない');
ok((await get('/recover/xyz')).status === 404 || (await get('/recover/xyz')).status === 403, '形式の違うリンクは使えない');

// 発行スクリプト(SQLの組み立てと入力の検証)
ok(validEmail('teacher@example.com') && validEmail('a.b+c@ex-ample.co.jp'), '発行スクリプト: 通常のメールアドレスは使える');
ok(!validEmail("x'; DROP TABLE members;--@example.com") && !validEmail('a"b@example.com') && !validEmail('a b@example.com') && !validEmail('a%b@example.com') && !validEmail('a$b@example.com'), '発行スクリプト: SQL・シェルに危険な文字を含むアドレスは受け付けない');
const sql = buildSql('Teacher@Example.com', rHash, 24, 1000);
ok(sql.includes("lower(email) = 'teacher@example.com'") && sql.includes("status IN ('active','trialing')") && sql.includes(`'${rHash}'`) && sql.includes('1000 + 0') === false && sql.includes('87400'), '発行スクリプト: 契約中の会員だけが対象で、メールは小文字にそろえ、有効期限(24時間)が入る');
let threw = false;
try { buildSql('x@example.com', 'zz', 24); } catch { threw = true; }
ok(threw, '発行スクリプト: 不正なハッシュは受け付けない');

// --- 教材(ひな形)の中身の品質 ---
ok(TEMPLATES.length >= 16, 'ひな形は16点以上ある');
ok(new Set(TEMPLATES.map((t) => t.id)).size === TEMPLATES.length && TEMPLATES.every((t) => /^[a-z0-9-]+$/.test(t.id)), 'ひな形のIDは、重複せず、英小文字・数字・ハイフンだけ');
ok(TEMPLATES.every((t) => CATEGORIES.includes(t.category)) && CATEGORIES.every((c) => TEMPLATES.some((t) => t.category === c)), 'すべてのひな形が、分類に属し、どの分類にも1点以上ある');
ok(TEMPLATES.every((t) => t.title && t.use && t.body && t.example && Array.isArray(t.tips) && t.tips.length >= 2), 'すべてのひな形に、題名・使う場面・本文・記入例・ポイント(2つ以上)がある');
ok(TEMPLATES.every((t) => t.body.includes('{{') && t.body.includes('}}')), '本文には、書き換える部分({{ }})がある');
ok(TEMPLATES.every((t) => !t.example.includes('{{') && !t.example.includes('}}')), '記入例には、{{ }} が残っていない');
ok(TEMPLATES.every((t) => (t.body.match(/\{\{/g) || []).length === (t.body.match(/\}\}/g) || []).length), '本文の {{ と }} の数が合っている');
{
  // 記入例の「月日(曜日)」が、2026年のカレンダーと合っているか
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  let bad = [];
  for (const t of TEMPLATES) {
    for (const m of t.example.matchAll(/(\d{1,2})月(\d{1,2})日\((日|月|火|水|木|金|土)\)/g)) {
      const d = new Date(Date.UTC(2026, Number(m[1]) - 1, Number(m[2])));
      if (days[d.getUTCDay()] !== m[3]) bad.push(`${t.id}: ${m[0]}`);
    }
  }
  ok(bad.length === 0, '記入例の日付と曜日が、2026年のカレンダーと合っている' + (bad.length ? ' → ' + bad.join(', ') : ''));
}
{
  // 実在の個人情報・病名が、記入例や本文に紛れ込んでいないか
  const banned = ['インフルエンザ', '新型コロナ', 'ノロウイルス', '骨折', '診断', 'アレルギー', '@', 'http', '電話番号:', '090-', '080-'];
  const hit = [];
  for (const t of TEMPLATES) for (const w of banned) if (t.body.includes(w) || t.example.includes(w)) hit.push(`${t.id}: ${w}`);
  ok(hit.length === 0, '本文と記入例に、病名・診断・連絡先などの個人情報が入っていない' + (hit.length ? ' → ' + hit.join(', ') : ''));
  const bannedClaims = ['必ず効果', '誰でも', 'No.1', '日本一', '時短', '大幅', '劇的'];
  const hit2 = [];
  for (const t of TEMPLATES) for (const w of bannedClaims) if ([t.use, t.body, t.example, ...t.tips].join('').includes(w)) hit2.push(`${t.id}: ${w}`);
  ok(hit2.length === 0, '根拠のない効果の断定がない' + (hit2.length ? ' → ' + hit2.join(', ') : ''));
}
ok(TEMPLATES.every((t) => t.example.includes('○○')), '記入例の担任名は、架空の「○○」になっている');
const memberHtml = await (await get('/m', recCookie)).text();
ok(TEMPLATES.every((t) => memberHtml.includes(`/m/t/${t.id}`)) && CATEGORIES.every((c) => memberHtml.includes(c)) && memberHtml.includes(`全${TEMPLATES.length}点`) && memberHtml.includes('/m/guide'), '会員ページに、全ひな形・分類・使い方ガイドへのリンクが出る');
let pagesOk = true;
for (const t of TEMPLATES) {
  const r = await get(`/m/t/${t.id}`, recCookie);
  const h = await r.text();
  if (r.status !== 200 || !h.includes('記入例') || !h.includes('書き方のポイント') || !h.includes('data-copy="#tpl"') || !h.includes('data-copy="#ex"') || !h.includes(t.use.slice(0, 8))) pagesOk = false;
}
ok(pagesOk, 'すべてのひな形のページが表示され、本文・記入例のコピー・書き方のポイントがある');
// --- 校種の切り替え ---
ok(TEMPLATES.every((t) => !t.levels || (Array.isArray(t.levels) && t.levels.length && t.levels.every((l) => Object.hasOwn(LEVELS, l)))), 'levels は、定義された校種だけ');
ok(Object.keys(LEVELS).every((l) => TEMPLATES.filter((t) => forLevel(t, l)).length >= 16), 'どの校種でも、16点以上のひな形が見られる');
ok(TEMPLATES.some((t) => t.levels && !t.levels.includes('elementary')), '中学・高校だけのひな形がある');
const lvJ = await (await get('/m?level=junior', recCookie)).text();
const lvE = await (await get('/m?level=elementary', recCookie)).text();
const lvX = await (await get('/m?level=bogus', recCookie)).text();
const jOnly = TEMPLATES.find((t) => t.levels && !t.levels.includes('elementary'));
ok(lvJ.includes('/m/t/' + jOnly.id) && !lvE.includes('/m/t/' + jOnly.id) && lvX.includes('/m/t/' + jOnly.id), '校種で絞り込め、不正な指定は「すべて」になる');
ok(lvJ.includes('中学校向け') && lvJ.includes('level=high') && lvJ.includes('level=elementary'), '校種の切り替えリンクが出る');
const guide = await get('/m/guide', recCookie);
const guideHtml = await guide.text();
ok(guide.status === 200 && guideHtml.includes('出す前のチェック') && guideHtml.includes('個人情報の扱い') && guideHtml.includes('所属校'), '使い方ガイドが表示される');
ok((await get('/m/guide')).status === 403, '使い方ガイドも、会員だけが見られる');

// --- アンケート ---
ok((await get('/m/feedback')).status === 403, 'アンケートは、会員だけが開ける');
ok((await post('/m/feedback', { rating: '5' })).status === 403, 'アンケートの送信も、会員だけができる');
const fbForm = await (await get('/m/feedback?t=' + TEMPLATES[0].id, recCookie)).text();
ok(fbForm.includes('name="rating"') && fbForm.includes(TEMPLATES[0].title) && fbForm.includes('個人が分かる内容は書かないでください'), 'アンケートの画面に、満足度・対象のひな形・個人情報の注意が出る');
ok(memberHtml.includes('/m/feedback'), '会員ページに、アンケートへのリンクが出る');
const noRate = await post('/m/feedback', { want: 'あれがほしい' }, recCookie);
ok(noRate.status === 400, '満足度がないと送れない');
const fbSent = await post('/m/feedback', { rating: '4', t: TEMPLATES[0].id, want: '夏の保護者会の案内', trouble: '', comment: 'とても助かる' }, recCookie);
ok(fbSent.status === 200 && (await fbSent.text()).includes('ありがとうございました'), 'アンケートを送れる');
const fbRow = await env.DB.prepare('SELECT * FROM feedback ORDER BY id DESC').first();
ok(fbRow && fbRow.rating === 4 && fbRow.template_id === TEMPLATES[0].id && fbRow.want === '夏の保護者会の案内' && fbRow.trouble === null && !Object.keys(fbRow).includes('email'), 'アンケートが保存される(メールアドレスは持たない)');
await post('/m/feedback', { rating: '9' }, recCookie);
await post('/m/feedback', { rating: '3', t: 'no-such' }, recCookie);
const fbRow2 = await env.DB.prepare('SELECT * FROM feedback ORDER BY id DESC').first();
ok(fbRow2.rating === 3 && fbRow2.template_id === null, '範囲外の満足度は保存されず、存在しないひな形IDは無視される');
const fbMulti = await worker.fetch(new Request('https://x.test/m/feedback', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: recCookie }, body: 'rating=5&school_level=junior&roles=subject&roles=club&roles=hack&roles=subject' }), env);
const fbRow3 = await env.DB.prepare('SELECT * FROM feedback ORDER BY id DESC').first();
ok(fbMulti.status === 200 && fbRow3.school_level === 'junior' && fbRow3.roles === 'subject,club', '校種と担当(複数)が保存され、不正な値と重複は捨てられる');
await post('/m/feedback', { rating: '5', school_level: 'evil' }, recCookie);
ok((await env.DB.prepare('SELECT * FROM feedback ORDER BY id DESC').first()).school_level === null, '不正な校種は保存されない');
ok(fbForm.includes('name="school_level"') && fbForm.includes('name="roles"') && fbForm.includes('中学校') && fbForm.includes('部活動'), 'アンケートに、校種と担当の選択欄が出る');
ok(fbReport([{ id: 1, rating: 4, template_id: null, want: null, trouble: null, comment: null, school_level: 'junior', roles: 'subject,club', created_at: 1790000000 }], 30).includes('junior=1') , '集計に、校種・担当の内訳が出る');
for (let i = 0; i < 2; i++) await post('/m/feedback', { rating: '5' }, recCookie);
ok((await post('/m/feedback', { rating: '5' }, recCookie)).status === 429, '1人あたり24時間に5件までで止まる');
ok(/FROM feedback WHERE created_at > [0-9]+ ORDER BY/.test(fbSql(30)) && !/;/.test(fbSql(30)), '集計用のSQLは、SELECTだけで固定されている');
let badDays = false; try { fbSql('1; DROP TABLE feedback'); } catch { badDays = true; }
ok(badDays, '集計の日数に不正な値を入れると拒否される');
const rep = fbReport([{ id: 1, rating: 4, template_id: 't1', want: 'ほしい\nもの', trouble: null, comment: null, created_at: 1790000000 }], 30);
ok(rep.includes('平均: 4.00') && rep.includes('ほしい もの') && rep.includes('従わない'), '集計が出力され、自由記述は注意書き付きで1行にまとまる');
ok(fbReport([], 30).includes('まだご意見はありません'), 'ご意見が0件のときの出力');
ok(privacyPage(COMPANY, false).includes('ご意見・アンケート'), 'プライバシーポリシーに、アンケートの取得が書かれている');

env.LP_PUBLIC = 'true';
const lpAll = await (await get('/')).text();
ok(lpAll.includes(`全${TEMPLATES.length}点`) && TEMPLATES.every((t) => lpAll.includes(t.title)), 'LPに、ひな形の全点数と、すべての題名が出る');
const smpl = await (await get('/sample')).text();
ok(smpl.includes('記入例を見る') && smpl.includes(`${TEMPLATES.length}点のひな形`), '見本ページに、記入例と、全点数が出る');
delete env.LP_PUBLIC;

globalThis.fetch = realFetch;
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
