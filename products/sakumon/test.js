// 依存ゼロのスモークテスト(sales-platform/test.js と同じ ok(cond, name) 形式)。
// D1 は node:sqlite で代用し、本物の schema.sql と SQL を通す。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { legalOpen } from './src/worker.js';
import { COMPANY, legalMissing } from './src/company.js';
import { tokushohoPage, termsPage, privacyPage } from './src/legal.js';
import { landing } from './src/pages.js';

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

// Stripe API の擬似応答(申込完了画面が Checkout Session を取りにいく)
const realFetch = globalThis.fetch;
globalThis.fetch = async function (u) {
  const m = String(u).match(/checkout\/sessions\/(cs_\w+)/);
  if (m) {
    return new Response(JSON.stringify({ id: m[1], status: 'complete', customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid', customer_details: { email: 'a@example.com' } }), { status: 200 });
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
ok(legalMissing(COMPANY).length > 0 && legalMissing(COMPANY).includes('retentionPeriod'), '会社情報が未記入のうちは、必須項目が不足と判定される');
ok(!legalMissing(COMPANY).includes('refundPolicy') && !legalMissing(COMPANY).includes('enactedDate'), '返金の方針と制定日は、記入済み');
ok(!legalMissing(COMPANY).includes('phone') && !legalMissing(COMPANY).includes('jurisdiction'), '電話番号の表示と管轄裁判所は、記入済み');
ok(legalMissing(FULL).length === 0, '全項目を埋めれば不足なし');
for (const p of ['/legal/tokushoho', '/legal/terms', '/legal/privacy']) {
  env.LEGAL_PUBLIC = undefined;
  ok((await get(p)).status === 404, p + ': スイッチ未設定なら404');
  env.LEGAL_PUBLIC = 'true';
  ok((await get(p)).status === 404, p + ': スイッチが"true"でも、空欄があれば404(公開されない)');
}
delete env.LEGAL_PUBLIC;
ok(!legalOpen({ LEGAL_PUBLIC: 'false' }, FULL), 'スイッチが"false"なら、全項目が埋まっていても公開されない');
ok(legalOpen({ LEGAL_PUBLIC: 'true' }, FULL), 'スイッチが"true"で全項目が埋まれば公開される');
ok(!legalOpen({ LEGAL_PUBLIC: 'true' }, COMPANY), 'スイッチが"true"でも、空欄があれば公開されない');
const tk = tokushohoPage(FULL), tkBlank = tokushohoPage(COMPANY);
ok(tk.includes('安藤 嘉啓') && tk.includes('大阪府大阪市浪速区') && tk.includes('月額980円(税込)') && tk.includes('テスト返金方針') && !tk.includes('【未記入'), '特商法の表記に、記入済みの内容が出る');
ok(privacyPage(COMPANY).includes('【未記入:保管期間】') && tkBlank.includes('請求があれば遅滞なく開示します') && tkBlank.includes('返金しません'), '空欄は【未記入】と目立つ表示になり、記入済みの内容は出る(確認用)');
ok(termsPage(FULL).includes('大阪地方裁判所') && termsPage(FULL).includes('2026年10月1日') && !termsPage(FULL).includes('【未記入'), '規約に、管轄と制定日が出る');
ok(privacyPage(FULL).includes('解約から5年') && privacyPage(FULL).includes('Stripe') && privacyPage(FULL).includes('Resend'), 'プライバシーポリシーに、保管期間と委託先が出る');
ok(!landing(false).includes('/legal/terms') && landing(true).includes('/legal/terms'), 'LPの法務リンクは、公開できるときだけ出る');
env.LP_PUBLIC = 'true';
ok(!(await (await get('/')).text()).includes('/legal/'), '法務が未公開のうちは、LPに法務リンクが出ない');
delete env.LP_PUBLIC;

globalThis.fetch = realFetch;
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
