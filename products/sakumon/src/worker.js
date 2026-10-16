// サクモン: Cloudflare Workers 用エントリ。依存ゼロ。
import { verifyStripeSignature, applyEvent, isActive, hmacHex, safeEqual } from './stripe.js';
import { MATERIALS } from './content.js';

const COOKIE = 'sakumon_session';
const SESSION_DAYS = 30;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const page = (title, body, status = 200, headers = {}) =>
  new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } },
  );

export async function signSession(secret, customer, now = Date.now() / 1000) {
  const exp = Math.floor(now) + SESSION_DAYS * 86400;
  const payload = `${customer}.${exp}`;
  return `${payload}.${await hmacHex(secret, payload)}`;
}

export async function readSession(secret, cookieHeader, now = Date.now() / 1000) {
  const m = (cookieHeader || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [customer, exp, sig] = m[1].split('.');
  if (!customer || !exp || !sig || Number(exp) < now) return null;
  const expected = await hmacHex(secret, `${customer}.${exp}`);
  return safeEqual(expected, sig) ? customer : null;
}

async function stripeGet(env, path, fetchFn) {
  const res = await fetchFn(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  if (!res.ok) throw new Error(`stripe ${res.status}`);
  return res.json();
}

async function handleWebhook(request, env) {
  const raw = await request.text();
  const ok = await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response('invalid signature', { status: 400 });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  await applyEvent(env.DB, event);
  return new Response('ok');
}

async function handleWelcome(url, env, fetchFn) {
  const sid = url.searchParams.get('session_id');
  if (!sid || !/^cs_[A-Za-z0-9_]+$/.test(sid)) return page('サクモン', '<p>決済情報を確認できませんでした。</p>', 400);
  let session;
  try {
    session = await stripeGet(env, `checkout/sessions/${sid}`, fetchFn);
  } catch {
    return page('サクモン', '<p>決済情報を確認できませんでした。しばらくしてからもう一度お試しください。</p>', 502);
  }
  if (session.status !== 'complete' || !session.customer) return page('サクモン', '<p>決済が完了していません。</p>', 402);
  const cookie = `${COOKIE}=${await signSession(env.SESSION_SECRET, session.customer)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
  return new Response(null, { status: 303, headers: { location: '/materials', 'set-cookie': cookie } });
}

async function handleMaterials(request, env) {
  const customer = await readSession(env.SESSION_SECRET, request.headers.get('cookie'));
  if (!customer) return page('サクモン', `<p>ご利用にはお申し込みが必要です。</p><p><a href="${esc(env.PAYMENT_LINK_URL || '/')}">月額プランに申し込む</a></p>`, 401);
  if (!(await isActive(env.DB, customer))) {
    return page('サクモン', '<p>契約状況を確認中です。反映まで少し時間がかかることがあります。数分後に再読み込みしてください。解約済みの場合はご利用いただけません。</p>', 402);
  }
  const items = MATERIALS.map((m) => `<section><h2>${esc(m.title)}</h2><ul>${m.body.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>`).join('');
  return page('サクモン 教材', `<h1>サクモン 教材</h1>${items}<p><a href="/portal">解約・お支払い方法の変更</a></p>`);
}

async function handlePortal(request, env, fetchFn) {
  const customer = await readSession(env.SESSION_SECRET, request.headers.get('cookie'));
  if (!customer) return new Response(null, { status: 303, headers: { location: '/' } });
  const res = await fetchFn('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ customer, return_url: new URL('/materials', request.url).toString() }),
  });
  if (!res.ok) return page('サクモン', '<p>ポータルを開けませんでした。</p>', 502);
  const { url } = await res.json();
  return new Response(null, { status: 303, headers: { location: url } });
}

export async function handle(request, env, fetchFn = fetch) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  if (pathname === '/stripe/webhook' && method === 'POST') return handleWebhook(request, env);
  if (pathname === '/welcome' && method === 'GET') return handleWelcome(url, env, fetchFn);
  if (pathname === '/materials' && method === 'GET') return handleMaterials(request, env);
  if (pathname === '/portal' && method === 'GET') return handlePortal(request, env, fetchFn);
  if (pathname === '/' && method === 'GET') {
    return page('サクモン', `<h1>サクモン</h1><p>先生向けの教材テンプレート集です。月額980円(税込)。</p><p><a href="${esc(env.PAYMENT_LINK_URL || '#')}">月額プランに申し込む</a></p>`);
  }
  return new Response('not found', { status: 404 });
}

export default { fetch: (request, env) => handle(request, env) };
