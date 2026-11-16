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
import { buildSql as fbSql, report as fbReport } from './scripts/feedback-report.mjs';
import { testResultPage, parseInput, validateTest, jstMonth, reserveUse, usedThisMonth, testmakerOn, extractJson, MONTHLY_LIMIT } from './src/testmaker.js';

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
ok(tk.includes('安藤 嘉啓') && tk.includes('大阪府大阪市浪速区') && tk.includes('月額1,980円(税込)') && tk.includes('テスト返金方針') && !tk.includes('【未記入'), '特商法の表記に、記入済みの内容が出る');
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

// --- 請求の方式(7日間の無料体験のあと、月額1,980円。体験が終わった日から毎月同じ日に更新) ---
const sub = await get('/subscribe');
ok(sub.status === 303 && String(sub.headers.get('location')).startsWith('https://checkout.stripe.test/'), '申込ボタンはStripeの決済画面へ転送する');
const sent = new URLSearchParams(lastCheckoutBody);
ok(sent.get('subscription_data[trial_period_days]') === '7' && sent.get('payment_method_collection') === 'always' && !sent.has('subscription_data[billing_cycle_anchor]') && !sent.has('subscription_data[proration_behavior]'), 'Stripeに、7日間の無料体験を指定し、請求日の固定・日割りは送らない')
ok(sent.get('managed_payments[enabled]') === 'false' && sent.get('mode') === 'subscription' && sent.get('custom_text[submit][message]').includes('1,980円'), 'Managed Paymentsは使わず、決済画面に体験後の請求を表示する')
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
ok(smNoLegal.includes('運営:株式会社Social Quality') && smNoLegal.includes('返金はありません') && smNoLegal.includes('7日間の無料体験') && smNoLegal.includes('1,980円'), '見本ページに、運営者名と、料金・解約・返金の条件が書かれている');
env.LEGAL_PUBLIC = 'true';
const smLegal = await (await get('/sample')).text();
ok(smLegal.includes('/legal/tokushoho') && smLegal.includes('お問い合わせ'), '法務が公開できる状態なら、見本ページにも法務リンクとお問い合わせが出る');
delete env.LEGAL_PUBLIC;
const lpRefund = await (await get('/')).text();
ok(lpRefund.includes('お支払い済みの料金の返金はありません') && lpRefund.includes('ご契約のメールアドレスなどは除きます'), 'LPに、返金なしと、「送られない」の範囲の限定が書かれている');
ok(lpRefund.includes('連続7日以上') && lpRefund.includes('直近にお支払いいただいた1か月分の料金を返金します') && smNoLegal.includes('連続7日以上'), 'LPと見本ページに、「当社の責めで連続7日以上使えない場合は、その月の料金を返金」が書かれている');
ok(COMPANY.refundPolicy.includes('連続して7日以上') && COMPANY.refundPolicy.includes('直近にお支払いいただいた1か月分の料金を返金します') && tokushohoPage(COMPANY).includes('連続して7日以上') && termsPage(COMPANY).includes('連続して7日以上'), '特商法の表記と利用規約にも、同じ返金の条件が出る');
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

// ---------- A: 「テスト・評価」のひな形 ----------
{
  const tests = TEMPLATES.filter((t) => t.category === 'テスト・評価');
  ok(tests.length === 6, 'テスト・評価のひな形が6点ある');
  ok(forLevel(tests.find((t) => t.id === 'test-mondai-sho'), 'elementary') && !forLevel(tests.find((t) => t.id === 'test-mondai-sho'), 'junior'), '小学校の一体型は小学校だけ、中学・高校の型は小学校に出ない');
  ok(!forLevel(tests.find((t) => t.id === 'test-mondai-chuko'), 'elementary') && forLevel(tests.find((t) => t.id === 'test-mondai-chuko'), 'high'), '中学・高校の問題用紙の型は、小学校に出さない');
  const haiten = tests.find((t) => t.id === 'test-haiten');
  ok(haiten.body.includes('知識・技能') && haiten.body.includes('思考・判断・表現') && !/\|\s*(主体的|態度)/.test(haiten.body), '配点表の観点は、知識・技能と思考・判断・表現の2つだけ');
  ok(tests.every((t) => !/(教科書|問題集)の(本文|問題)をそのまま/.test(t.body)) && tests.some((t) => t.tips.join('').includes('そのまま写さない')), '教科書の問題を写さないことを案内している');
}

// ---------- B: テストのたたき台づくり(AI版・既定オフ) ----------
const tmCookie = recCookie;
const envOn = { ...env, TESTMAKER_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-ant-test-key' };
const postTm = (e, fields, headers = {}) => worker.fetch(new Request('https://x.test/m/test', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: tmCookie, ...headers }, body: new URLSearchParams(fields).toString() }), e);
const form = { level: 'junior', subject: '数学', grade: '2年', units: '一次関数\n図形の性質', total: '100', minutes: '50', count: '4', extra: '' };
{
  // 既定ではオフ: キーがあっても、スイッチが無ければ存在しない
  ok(!testmakerOn(env) && !testmakerOn({ ANTHROPIC_API_KEY: 'k' }) && !testmakerOn({ TESTMAKER_ENABLED: 'true' }) && testmakerOn(envOn), 'スイッチとキーの両方が揃うまでオフ');
  ok((await worker.fetch(new Request('https://x.test/m/test', { headers: { cookie: tmCookie } }), env)).status === 404, 'オフのあいだは /m/test が404');
  ok((await postTm(env, form)).status === 404, 'オフのあいだは POST も404');
  ok(!(await (await get('/m', tmCookie)).text()).includes('/m/test'), 'オフのあいだは会員ページにリンクが出ない');
  ok((await worker.fetch(new Request('https://x.test/m/test'), envOn)).status === 403, '会員証が無ければ入れない');

  // 入力の検査
  const g = (o) => (k) => o[k];
  ok(parseInput(g(form)).ok && parseInput(g(form)).value.units.length === 2 && parseInput(g(form)).value.total === 100, '正しい入力は通る');
  ok(!parseInput(g({ ...form, extra: '児童の答案を使って' })).ok && parseInput(g({ ...form, extra: '児童の答案を使って' })).error.includes('作成を止めました'), '「児童」「答案」などの語があれば作成を止める');
  ok(!parseInput(g({ ...form, units: '成績処理' })).ok && !parseInput(g({ ...form, subject: '生徒指導' })).ok, '単元・教科の欄でも、氏名・成績・生徒などの語を止める');
  ok(!parseInput(g({ ...form, level: 'x' })).ok && !parseInput(g({ ...form, units: '' })).ok && !parseInput(g({ ...form, total: '5' })).ok && !parseInput(g({ ...form, count: '99' })).ok, '校種・単元・満点・問題数の範囲を検査する');
  ok(parseInput(g({ ...form, units: 'a\nb\nc\nd\ne' })).value.units.length === 3, '単元は3つまで');
  ok(parseInput(g({ ...form, total: '', minutes: '', count: '' })).value.total === 100, '空欄は既定値(満点100)');

  // 月の境界(日本時間)
  ok(jstMonth(Date.parse('2026-10-31T14:59:00Z')) === '2026-10' && jstMonth(Date.parse('2026-10-31T15:00:00Z')) === '2026-11', '回数は、日本時間の毎月1日0時に切り替わる');

  // 回数の上限(原子的に数える)
  const rdb = makeDb();
  let granted = 0;
  for (let i = 0; i < MONTHLY_LIMIT + 3; i++) if (await reserveUse(rdb, 'cus_limit', '2026-11')) granted++;
  ok(granted === MONTHLY_LIMIT && (await usedThisMonth(rdb, 'cus_limit', '2026-11')) === MONTHLY_LIMIT, `月${MONTHLY_LIMIT}回までで、それ以上は数えない`);
  ok(await reserveUse(rdb, 'cus_limit', '2026-12') && await reserveUse(rdb, 'cus_other', '2026-11'), '翌月・別の会員には、別に数える');

  // 点検
  const q = (o) => ({ text: '問', answer: '答', aspect: '知識・技能', difficulty: 'ふつう', unit: '一次関数', points: 25, scoring: [{ point: 25, criterion: '正答' }], ...o });
  ok(validateTest({ questions: [q(), q(), q(), q()] }, 100).warnings.length === 0, '配点の合計が満点と合えば、警告なし');
  ok(validateTest({ questions: [q(), q()] }, 100).warnings.some((w) => w.includes('満点')), '配点の合計が満点と合わなければ、警告を出す');
  ok(validateTest({ questions: [q({ aspect: '態度' })] }, 25).warnings.some((w) => w.includes('観点')), '2つ以外の観点は、警告を出す');
  ok(validateTest({ questions: [q({ scoring: [{ point: 10, criterion: 'x' }] })] }, 25).warnings.some((w) => w.includes('採点基準')), '採点基準の点が配点と合わなければ、警告を出す');
  ok(validateTest({ questions: [q({ text: '' })] }, 25).error && validateTest(null, 100).error && extractJson('前置き {"a":1} 後') .a === 1 && extractJson('なし') === null, '壊れた結果は、エラーにする');

  // 作成→検算(API はモック)
  const calls = [];
  const gen = { title: '一次関数 テスト', questions: [1, 2, 3, 4].map((n) => ({ no: n, aspect: n < 4 ? '知識・技能' : '思考・判断・表現', difficulty: 'ふつう', unit: '一次関数', text: `問題文${n}`, answer: `答え${n}号`, points: 25, scoring: [{ point: 25, criterion: `基準${n}` }] })) };
  let mode = 'ok';
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.anthropic.com/')) return realFetch(url, init);
    const b = JSON.parse(init.body);
    calls.push({ url: String(url), headers: init.headers, body: b });
    const verify = b.system.includes('解く役');
    if (mode === 'down') return new Response('boom sk-ant-test-key', { status: 500 });
    if (mode === 'verify-down' && verify) return new Response('x', { status: 500 });
    if (mode === 'garbage' && !verify) return new Response(JSON.stringify({ content: [{ type: 'text', text: 'すみません、作れません' }], usage: {} }), { status: 200 });
    const text = verify ? JSON.stringify({ answers: [{ no: 1, answer: '答え1号' }, { no: 2, answer: '答え2号' }, { no: 3, answer: 'ちがう答え' }, { no: 4, answer: '答え4号' }] }) : JSON.stringify(gen);
    return new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 200 } }), { status: 200 });
  };

  const okRes = await postTm(envOn, form);
  const okHtml = await okRes.text();
  ok(okRes.status === 200 && okHtml.includes('たたき台') && okHtml.includes('配点表') && okHtml.includes('一次関数 テスト') && okHtml.includes('問題文1'), '作成できる(問題・模範解答・配点表が出る)');
  ok(calls.length === 2 && calls[0].url === 'https://api.anthropic.com/v1/messages' && calls[0].headers['x-api-key'] === 'sk-ant-test-key' && calls[0].body.model, '作成と検算で、APIを2回呼ぶ');
  ok(!calls[1].body.messages[0].content.includes('答え1号') && !calls[1].body.messages[0].content.includes('基準1') && calls[1].body.messages[0].content.includes('問題文1'), '検算には、模範解答と採点基準を渡さない');
  ok(okHtml.includes('⚠') && okHtml.includes('検算:食い違い') && okHtml.includes('ちがう答え') && okHtml.includes('検算:一致'), '食い違った問題に印が付く');
  ok(!okHtml.includes('sk-ant-test-key'), 'APIキーは画面に出ない');
  ok(okHtml.includes('1/15回') || okHtml.includes(`1/${MONTHLY_LIMIT}回`), '今月の回数が出る');
  const row = await env.DB.prepare('SELECT count, in_tokens, out_tokens FROM test_usage ORDER BY rowid DESC LIMIT 1').first();
  ok(row && row.count === 1 && row.in_tokens === 200 && row.out_tokens === 400, '回数(1回)とトークン数(2回ぶんの合計)が記録される');

  // 失敗時は回数を戻す
  const countNow = async () => (await env.DB.prepare('SELECT SUM(count) AS n FROM test_usage').first()).n;
  const n0 = await countNow();
  mode = 'down';
  const downRes = await postTm(envOn, form);
  const downHtml = await downRes.text();
  ok(downRes.status === 502 && downHtml.includes('回数には数えていません') && !downHtml.includes('sk-ant') && (await countNow()) === n0, 'APIが落ちたら502で、回数は戻り、キーや応答は画面に出ない');
  mode = 'garbage';
  ok((await postTm(envOn, form)).status === 502 && (await countNow()) === n0, '作成結果が壊れていたら502で、回数は戻る');
  mode = 'verify-down';
  const vdHtml = await (await postTm(envOn, form)).text();
  ok(vdHtml.includes('検算ができませんでした') && !vdHtml.includes('検算:一致') && (await countNow()) === n0 + 1, '検算だけが失敗したら、たたき台に「検算できなかった」と出て、回数は数える');
  mode = 'ok';

  // 入力エラー・他サイトからの送信
  calls.length = 0;
  const badRes = await postTm(envOn, { ...form, extra: '生徒の氏名を入れて' });
  ok(badRes.status === 400 && calls.length === 0 && (await countNow()) === n0 + 1, '止める語があれば、APIを呼ばず、回数も数えない');
  ok((await postTm(envOn, form, { origin: 'https://evil.test' })).status === 404 && calls.length === 0, '他のサイトからの送信は受けない');
  ok((await worker.fetch(new Request('https://x.test/m/test', { headers: { cookie: tmCookie } }), envOn)).status === 200, 'オンのときは、フォームが開く');
  ok((await (await worker.fetch(new Request('https://x.test/m', { headers: { cookie: tmCookie } }), envOn)).text()).includes('/m/test'), 'オンのときは会員ページにリンクが出る');
}

// ---------- 法務・ガイド:AI機能がオンのときだけ、AIに関する記載が出る / 返金の範囲と手順 ----------
{
  const tOff = termsPage(COMPANY, false);
  const tOn = termsPage(COMPANY, false, true);
  ok(!tOff.includes('外部のAIサービス') && tOn.includes('外部のAIサービス') && tOn.includes('15回') && tOn.includes('氏名・答案・成績'), '規約:AIに関する記載は、オンのときだけ出る(利用の条件・月15回・入力してはいけない情報)');
  ok(tOff.includes('「当社の責め」とは') && tOff.includes('不可抗力') && tOff.includes('返金を希望する方は') && tOff.includes('Stripe を通じて'), '規約:「当社の責め」の範囲と、返金の手順が、常に出る');
  const pOff = privacyPage(COMPANY, false);
  const pOn = privacyPage(COMPANY, false, true);
  ok(!pOff.includes('Anthropic') && pOn.includes('Anthropic, PBC') && pOn.includes('サーバーには保存しません') && pOn.includes('トークン数'), 'プライバシーポリシー:AIの委託先と、保存しない内容は、オンのときだけ出る');
  const envLegal = { ...env, LEGAL_PUBLIC: 'true' };
  const envLegalOn = { ...envOn, LEGAL_PUBLIC: 'true' };
  const lp = (e, path) => worker.fetch(new Request(`https://x.test${path}`, { headers: path.startsWith('/m') ? { cookie: tmCookie } : {} }), e).then((r) => r.text());
  ok(!(await lp(envLegal, '/legal/privacy')).includes('Anthropic') && (await lp(envLegalOn, '/legal/privacy')).includes('Anthropic, PBC'), '配信:キーが無いうちは、プライバシーポリシーにAIの記載が出ない(キーが登録されると出る)');
  ok(!(await lp(env, '/m/guide')).includes('外部のAIサービス') && (await lp(envOn, '/m/guide')).includes('外部のAIサービス'), '使い方ガイド:AIへの送信の注意は、オンのときだけ出る');
}


// ---- 11/20公開に向けた追加: 種類・直せる結果・Word出力・評価の記録・無料開通・学校PCの案内 ----
{
  const { buildTestDocx, crc32, zipStore } = await import('./src/docx.js');
  const { KINDS, buildGeneratePrompt, parseEditedTest, parseRating, saveRating, docxFileName } = await import('./src/testmaker.js');
  const { isActive } = await import('./src/db.js');
  const { buildGrantSql } = await import('./scripts/grant-member.mjs');

  // zip / docx
  ok(crc32(new TextEncoder().encode('123456789')) === 0xcbf43926, 'CRC32が標準の値と一致する');
  const sample = {
    title: '一次関数 小テスト', kind: '小テスト', levelLabel: '中学校', subject: '数学', grade: '2年', total: 100, minutes: 20,
    questions: [
      { no: 1, aspect: '知識・技能', difficulty: 'ふつう', unit: '一次関数', text: 'y=2x+1 の x=3 のときの y を求めなさい。', answer: '7', points: 50, scoring: [{ point: 50, criterion: '7と答えている' }] },
      { no: 2, aspect: '思考・判断・表現', difficulty: '難しい', unit: '一次関数', text: '傾きが3で点(1,2)を通る直線の式を<書きなさい>。&', answer: 'y=3x-1', points: 50, scoring: [] },
    ],
  };
  const bytes = buildTestDocx(sample);
  ok(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4, 'docx: zipの先頭が正しい');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  ok(dv.getUint32(eocd, true) === 0x06054b50 && dv.getUint16(eocd + 10, true) === 3, 'docx: ファイルが3つ入っている');
  // 中央ディレクトリを読んで、各ファイルの本体とCRCが一致するか確かめる
  let p = dv.getUint32(eocd + 16, true);
  const names = [];
  let crcOk = true;
  const dec = new TextDecoder();
  for (let i = 0; i < 3; i++) {
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
    names.push(dec.decode(bytes.subarray(p + 46, p + 46 + nl)));
    const lnl = dv.getUint16(off + 26, true);
    const data = bytes.subarray(off + 30 + lnl, off + 30 + lnl + size);
    if (crc32(data) !== crc) crcOk = false;
    if (names[i] === 'word/document.xml') {
      const x = dec.decode(data);
      ok(x.includes('問1(50点)') && x.includes('解答用紙') && x.includes('模範解答と採点基準(先生用)') && x.includes('配点表') && x.includes('&lt;書きなさい&gt;') && x.includes('&amp;'), 'docx: 4つの部分が入り、記号がエスケープされる');
      ok(x.includes('知識・技能:50点') && x.includes('思考・判断・表現:50点'), 'docx: 観点ごとの合計が入る');
    }
    p += 46 + nl;
  }
  ok(crcOk && names.join() === '[Content_Types].xml,_rels/.rels,word/document.xml', 'docx: 各ファイルのCRCと名前が正しい');
  ok(zipStore([{ name: 'a.txt', data: 'あ' }]).length > 0, 'zipStore:日本語の内容でも作れる');

  // 種類
  ok(KINDS.length === 5 && KINDS.includes('漢字テスト') && KINDS.includes('計算テスト') && KINDS.includes('宿題プリント'), '種類が5つある');
  const base = { level: 'elementary', subject: '算数', grade: '3年', units: 'わり算', total: '100', minutes: '20', count: '20' };
  const pk = parseInput((k) => ({ ...base, kind: '計算テスト' })[k]);
  ok(pk.ok && pk.value.kind === '計算テスト' && pk.value.count === 20, '種類を選べ、小問は20問まで');
  ok(parseInput((k) => ({ ...base })[k]).value.kind === '定期テスト', '種類の指定が無ければ定期テスト');
  ok(!parseInput((k) => ({ ...base, kind: 'あやしい' })[k]).ok, '知らない種類は止める');
  ok(!parseInput((k) => ({ ...base, count: '21' })[k]).ok, '小問21問は止める');
  ok(buildGeneratePrompt(pk.value).user.includes('計算問題') && buildGeneratePrompt(pk.value).maxTokens === 8000, '計算テストの指示と、長い出力の上限が入る');
  ok(buildGeneratePrompt({ ...pk.value, kind: '漢字テスト' }).user.includes('読みと書き') && buildGeneratePrompt({ ...pk.value, kind: '宿題プリント' }).user.includes('家庭で'), '漢字テスト・宿題プリントの指示が入る');

  // 直した内容の受け取り
  const fields = { kind: '小テスト', level: 'junior', subject: '数学', grade: '2年', total: '100', minutes: '20', n: '2', title: '一次関数/小テスト', q1_text: '問題1', q1_answer: '7', q1_points: '50', q1_scoring: '50点 7と答えている', q1_aspect: '知識・技能', q2_text: '問題2', q2_answer: 'x', q2_points: '50', q2_scoring: '30点 式\n20 答え', q2_aspect: 'でたらめ' };
  const pe = parseEditedTest((k) => fields[k]);
  ok(pe.ok && pe.value.questions.length === 2 && pe.value.questions[0].scoring[0].point === 50 && pe.value.questions[1].scoring.length === 2 && pe.value.questions[1].aspect === '', '直した内容を読み取れる(配点・採点基準・知らない観点)');
  ok(!parseEditedTest((k) => ({ ...fields, q2_text: '' })[k]).ok && !parseEditedTest((k) => ({ ...fields, q1_points: '1000' })[k]).ok && !parseEditedTest((k) => ({ ...fields, n: '21' })[k]).ok && !parseEditedTest((k) => ({ ...fields, kind: 'x' })[k]).ok, '空の問題文・範囲外の配点・21問・知らない種類は断る');
  ok(docxFileName('一次関数/小テスト:1') === '一次関数小テスト1.docx' && docxFileName('///') === 'テスト.docx', 'ファイル名から記号を除く');

  // 配信(オン/オフ・認証・Origin)
  const post = (path, e, f, headers = {}) => worker.fetch(new Request(`https://x.test${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: tmCookie, ...headers }, body: new URLSearchParams(f).toString() }), e);
  ok((await post('/m/test/docx', env, fields)).status === 404 && (await post('/m/test/rating', env, { kind: '小テスト', usable: 'yes', fix: 'le10' })).status === 404, 'オフのあいだは、Word出力も評価も404');
  const noCookie = await worker.fetch(new Request('https://x.test/m/test/docx', { method: 'POST', body: new URLSearchParams(fields) }), envOn);
  ok(noCookie.status === 403, '会員証が無ければ、Word出力できない');
  const dres = await post('/m/test/docx', envOn, fields);
  const dbytes = new Uint8Array(await dres.arrayBuffer());
  ok(dres.status === 200 && dres.headers.get('content-type').includes('wordprocessingml.document') && dres.headers.get('content-disposition').includes('filename*=UTF-8\'\'') && dbytes[0] === 0x50 && dres.headers.get('cache-control') === 'no-store', 'Word出力:docxが返る');
  ok((await post('/m/test/docx', envOn, fields, { origin: 'https://evil.test' })).status === 404, 'Word出力:別のオリジンは断る');
  ok((await worker.fetch(new Request('https://x.test/m/test/docx', { headers: { cookie: tmCookie } }), envOn)).status === 404, 'Word出力:GETは404');
  ok((await post('/m/test/docx', envOn, { ...fields, q1_text: '' })).status === 400, 'Word出力:不正な内容は400');

  // 評価
  ok(parseRating((k) => ({ kind: '小テスト', usable: 'yes', fix: 'le10' })[k])?.usable === 'yes' && !parseRating((k) => ({ kind: '小テスト', usable: 'x', fix: 'le10' })[k]) && !parseRating((k) => ({ kind: 'x', usable: 'yes', fix: 'le10' })[k]), '評価の入力を検査する');
  const rok = await post('/m/test/rating', envOn, { kind: '小テスト', usable: 'partial', fix: 'gt30' });
  ok(rok.status === 200, '評価を送れる');
  const row = await envOn.DB.prepare('SELECT kind, usable, fix_minutes FROM test_rating').first();
  ok(row && row.kind === '小テスト' && row.usable === 'partial' && row.fix_minutes === 'gt30', '評価は種類と2項目だけが保存される');
  ok((await post('/m/test/rating', envOn, { kind: '小テスト', usable: 'zzz', fix: 'le10' })).status === 400, '評価:不正な値は400');
  const rdb2 = makeDb();
  let saved = 0;
  for (let i = 0; i < 32; i++) if (await saveRating(rdb2, 'c1', { kind: '小テスト', usable: 'yes', fix: 'le10' }, 1000)) saved++;
  ok(saved === 30, '評価は1人あたり24時間に30件まで');

  // 結果画面
  const resPage = testResultPage({ title: 'T', questions: [{ no: 1, aspect: '知識・技能', difficulty: 'ふつう', unit: 'u', text: 't', answer: 'a', points: 100, scoring: [], check: 'match' }], warnings: [], verified: true, used: 1 }, { kind: '小テスト', level: 'junior', subject: '数学', grade: '2年', total: 100, minutes: 20 });
  ok(resPage.includes('action="/m/test/docx"') && resPage.includes('action="/m/test/rating"') && resPage.includes('情報セキュリティの方針に従ってください') && resPage.includes('name="q1_text"'), '結果画面:直せる欄・Word出力・評価・学校PCの注意がある');

  // 無料開通
  const gdb = makeDb();
  const sql = buildGrantSql('sensei@example.com', 3, 1000, 'abc');
  await gdb.prepare(sql).run();
  const gm = await gdb.prepare("SELECT * FROM members WHERE email = 'sensei@example.com'").first();
  ok(gm && gm.customer_id === 'manual_abc' && gm.status === 'trialing' && gm.subscription_id === `manual:${1000 + 90 * 86400}`, '無料開通:会員が作られ、終了日時が入る');
  ok(isActive(gm, 1000 + 90 * 86400 - 1) && !isActive(gm, 1000 + 90 * 86400), '無料開通:終了の時刻を過ぎると使えない');
  const before = (await gdb.prepare('SELECT COUNT(*) AS n FROM members').first()).n;
  await gdb.prepare(buildGrantSql('SENSEI@example.com', 3, 2000, 'def')).run();
  ok((await gdb.prepare('SELECT COUNT(*) AS n FROM members').first()).n === before, '無料開通:同じメールで有効な会員がいれば、増やさない');
  ok((() => { try { buildGrantSql("a'b@example.com"); return false; } catch { return true; } })() && (() => { try { buildGrantSql('a@example.com', 13); return false; } catch { return true; } })() && (() => { try { buildGrantSql('a@example.com', 0); return false; } catch { return true; } })(), '無料開通:メールの記号・月数の範囲を検査する');
  ok(isActive({ status: 'active', subscription_id: 'sub_123' }) && !isActive({ status: 'canceled', subscription_id: null }) && !isActive(null), '通常の契約の判定は変わらない');

  // 学校PCの案内
  ok((await (await worker.fetch(new Request('https://x.test/m/guide', { headers: { cookie: tmCookie } }), env)).text()).includes('情報セキュリティの方針に従ってください'), '使い方ガイドに、学校PCの案内がある');
  ok(landing(true, '', false).includes('情報セキュリティの方針に従ってください') && !/学校のパソコンで(も)?(使えます|使える)/.test(landing(true, '', false)), 'LPに、学校PCの案内がある(「使える」とは書かない)');
}

globalThis.fetch = realFetch;
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
