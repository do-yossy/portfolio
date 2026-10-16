// 依存ゼロのスモークテスト。sales-platform/test.js と同じ形式(ok(cond, name))。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { verifyStripeSignature, hmacHex, applyEvent, isActive, eventToUpdate } from './src/stripe.js';
import { handle, signSession, readSession } from './src/worker.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : (fail++, console.log('FAIL:', name)); };

// node:sqlite を D1 互換(prepare().bind().run()/first())に包む
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const DB = { prepare: (sql) => ({ bind: (...a) => ({ run: async () => sqlite.prepare(sql).run(...a), first: async () => sqlite.prepare(sql).get(...a) ?? null }) }) };

const env = { DB, STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_SECRET_KEY: 'sk_test_x', SESSION_SECRET: 'sess_secret', PAYMENT_LINK_URL: 'https://buy.example/x' };
const sign = async (body, t = Math.floor(Date.now() / 1000), secret = env.STRIPE_WEBHOOK_SECRET) => `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
const webhook = async (event, header) => {
  const body = JSON.stringify(event);
  return handle(new Request('https://x.test/stripe/webhook', { method: 'POST', body, headers: { 'stripe-signature': header ?? (await sign(body)) } }), env);
};
const ev = (type, object, created) => ({ id: `evt_${type}_${created}`, type, created, data: { object } });

// 署名検証
const body = '{"a":1}';
ok(await verifyStripeSignature(body, await sign(body), env.STRIPE_WEBHOOK_SECRET), '正しい署名は通る');
ok(!(await verifyStripeSignature(body, await sign(body, undefined, 'whsec_other'), env.STRIPE_WEBHOOK_SECRET)), '別の秘密鍵の署名は拒否');
ok(!(await verifyStripeSignature(body + 'x', await sign(body), env.STRIPE_WEBHOOK_SECRET)), '改ざんされた本文は拒否');
ok(!(await verifyStripeSignature(body, await sign(body, 1000), env.STRIPE_WEBHOOK_SECRET)), '古いタイムスタンプは拒否');
ok(!(await verifyStripeSignature(body, '', env.STRIPE_WEBHOOK_SECRET)), 'ヘッダなしは拒否');

// Webhook 経由の状態遷移
ok((await webhook(ev('customer.subscription.created', { customer: 'cus_1', status: 'active' }, 100), 't=1,v1=bad')).status === 400, '不正署名のWebhookは400');
ok((await webhook(ev('customer.subscription.created', { customer: 'cus_1', status: 'active' }, 100))).status === 200, '契約作成を受理');
ok(await isActive(DB, 'cus_1'), '契約作成後は利用可');
await webhook(ev('checkout.session.completed', { customer: 'cus_1', customer_details: { email: 'a@example.com' } }, 101));
ok(sqlite.prepare('SELECT email FROM subscriptions WHERE customer_id=?').get('cus_1').email === 'a@example.com', 'メールを保存');
await webhook(ev('invoice.payment_failed', { customer: 'cus_1' }, 200));
ok(!(await isActive(DB, 'cus_1')), '支払い失敗で利用不可');
await webhook(ev('invoice.paid', { customer: 'cus_1' }, 300));
ok(await isActive(DB, 'cus_1'), '支払い成功で復帰');
await webhook(ev('invoice.payment_failed', { customer: 'cus_1' }, 250));
ok(await isActive(DB, 'cus_1'), '古いイベント(順序逆転)は状態を上書きしない');
await webhook(ev('customer.subscription.deleted', { customer: 'cus_1' }, 400));
ok(!(await isActive(DB, 'cus_1')), '解約で利用不可');
ok(eventToUpdate(ev('charge.succeeded', { customer: 'cus_1' }, 1)) === null, '対象外イベントは無視');

// セッションCookie
const cookieVal = await signSession(env.SESSION_SECRET, 'cus_2');
ok((await readSession(env.SESSION_SECRET, `sakumon_session=${cookieVal}`)) === 'cus_2', 'Cookieを検証できる');
ok((await readSession(env.SESSION_SECRET, `sakumon_session=${cookieVal}x`)) === null, '改ざんCookieは拒否');
ok((await readSession('other', `sakumon_session=${cookieVal}`)) === null, '別の鍵のCookieは拒否');
ok((await readSession(env.SESSION_SECRET, `sakumon_session=${cookieVal}`, Date.now() / 1000 + 40 * 86400)) === null, '期限切れCookieは拒否');

// アクセス制御
const get = (path, cookie) => handle(new Request(`https://x.test${path}`, { headers: cookie ? { cookie } : {} }), env);
ok((await get('/materials')).status === 401, 'Cookieなしは401');
await webhook(ev('customer.subscription.created', { customer: 'cus_2', status: 'active' }, 500));
const okRes = await get('/materials', `sakumon_session=${cookieVal}`);
ok(okRes.status === 200 && (await okRes.text()).includes('指導案'), '契約中は教材が見える');
await webhook(ev('customer.subscription.deleted', { customer: 'cus_2' }, 600));
ok((await get('/materials', `sakumon_session=${cookieVal}`)).status === 402, '解約後は教材が見えない');

// /welcome(Stripe API はモック)
const fakeFetch = (session) => async () => ({ ok: !!session, status: session ? 200 : 404, json: async () => session });
const welcome = (sid, f) => handle(new Request(`https://x.test/welcome?session_id=${sid}`), env, f);
const r1 = await welcome('cs_test_1', fakeFetch({ status: 'complete', customer: 'cus_3' }));
ok(r1.status === 303 && r1.headers.get('set-cookie').includes('HttpOnly'), '決済完了でCookie発行');
ok((await welcome('cs_test_1', fakeFetch({ status: 'open', customer: 'cus_3' }))).status === 402, '未完了の決済ではCookieを出さない');
ok((await welcome('bad id', fakeFetch(null))).status === 400, '不正なsession_idは拒否');
ok((await welcome('cs_test_1', fakeFetch(null))).status === 502, 'Stripe障害時は502');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
