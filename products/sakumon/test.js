// 依存ゼロのスモークテスト(sales-platform/test.js と同じ ok(cond, name) 形式)。
// D1 は node:sqlite で代用し、本物の schema.sql と SQL を通す。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from './src/worker.js';

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
const env = { DB: makeDb(), STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_ID: 'price_x' };

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

const get = (path) => worker.fetch(new Request(`https://x.test${path}`), env);
const row = () => env.DB.prepare('SELECT * FROM members WHERE customer_id = ?').bind('cus_1').first();

// --- 署名 ---
ok((await send({ id: 'e0', type: 'x' }, 't=1,v1=bad')) === 400, '不正な署名は400');
ok((await send({ id: 'e0', type: 'x' }, await sign('{"id":"e0","type":"x"}', 'wrong'))) === 400, '別の秘密鍵の署名は400');
ok((await send({ id: 'e0', type: 'x' }, await sign('{"id":"e0","type":"x"}', SECRET, 1000))) === 400, '古いタイムスタンプは400');
ok((await send({ id: 'e1', type: 'x' })) === 200, '正しい署名は200');

// --- 契約の開始 ---
ok((await send({ id: 'e2', type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid', customer_details: { email: 'a@example.com' } } } })) === 200, 'checkout完了');
let m = await row();
ok(m && m.status === 'active' && m.email === 'a@example.com', '契約中として記録');

// --- アクセス制御 ---
const page = await get(`/m/${m.token}`);
ok(page.status === 200 && (await page.text()).includes('学級通信'), '契約中は会員ページが見える');
ok((await get(`/m/${m.token}/t/gakkyu-tsushin`)).status === 200, '契約中は教材が見える');
ok((await get(`/m/${'0'.repeat(48)}`)).status === 403, '存在しないトークンは403');
ok((await get('/m/short')).status === 404, '形式の違うURLは404');

// --- 再送(冪等) ---
ok((await send({ id: 'e2', type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'cus_1', payment_status: 'unpaid' } } })) === 200, '同じイベントIDの再送は200');
ok((await row()).status === 'active', '再送で状態が変わらない');

// --- 支払い失敗・回復 ---
await send({ id: 'e3', type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } });
ok((await row()).status === 'past_due', '支払い失敗でpast_due');
ok((await get(`/m/${m.token}`)).status === 403, 'past_dueは教材が見えない');
await send({ id: 'e4', type: 'invoice.paid', data: { object: { customer: 'cus_1' } } });
ok((await row()).status === 'active', '支払い成功でactiveに戻る');

// --- 解約 ---
await send({ id: 'e5', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1' } } });
ok((await row()).status === 'canceled', '解約でcanceled');
ok((await get(`/m/${m.token}`)).status === 403, '解約後は教材が見えない');
await send({ id: 'e6', type: 'invoice.paid', data: { object: { customer: 'cus_1' } } });
ok((await row()).status === 'canceled', '解約後に遅れて届いたinvoice.paidで復活しない');

// --- イベントの到着順が前後しても作成される ---
await send({ id: 'e7', type: 'customer.subscription.created', data: { object: { id: 'sub_2', customer: 'cus_2', status: 'active' } } });
const m2 = await env.DB.prepare('SELECT * FROM members WHERE customer_id = ?').bind('cus_2').first();
ok(m2 && m2.status === 'active', 'subscription.createdが先に届いても契約者が作られる');

ok((await get('/')).status === 200, 'LPが表示される');
ok((await get('/nope')).status === 404, '未定義のパスは404');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
