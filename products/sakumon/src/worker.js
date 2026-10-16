import { verifySignature, createCheckoutSession, getCheckoutSession, createPortalSession } from './stripe.js';
import {
  upsertMember, insertMemberIfAbsent, setStatus, recordEvent, forgetEvent, isActive,
  newToken, claimCheckout, createSession, findBySession,
} from './db.js';
import { TEMPLATES, findTemplate } from './content.js';
import { html, landing, successPage, claimedPage, pendingPage, memberPage, templatePage, inactivePage, notFound } from './pages.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

const COOKIE = 'sakumon_session';

function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// URL に秘密を載せず、購入したブラウザだけが持つ Cookie で本人を確認する
const sessionCookie = (token) => `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`;
const currentMember = (request, env) => findBySession(env.DB, readCookie(request, COOKIE));

const redirect = (url) => Response.redirect(url, 303);

// Stripe イベント → 契約状態。到着順が前後しても upsert で収束させる
export async function handleEvent(db, ev) {
  const o = ev.data?.object || {};
  switch (ev.type) {
    case 'checkout.session.completed':
      if (o.mode === 'subscription' && o.customer) {
        await upsertMember(db, {
          customer: o.customer,
          subscription: o.subscription,
          email: o.customer_details?.email,
          status: o.payment_status === 'paid' ? 'active' : 'incomplete',
        });
      }
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await upsertMember(db, {
        customer: o.customer,
        subscription: o.id,
        status: ev.type === 'customer.subscription.deleted' ? 'canceled' : o.status,
      });
      break;
    case 'invoice.paid':
      if (o.customer) await setStatus(db, o.customer, 'active', 'canceled');
      break;
    case 'invoice.payment_failed':
      if (o.customer) await setStatus(db, o.customer, 'past_due', 'canceled');
      break;
  }
}

async function webhook(request, env) {
  const body = await request.text();
  const ok = await verifySignature(body, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'bad signature' }, 400);
  let ev;
  try {
    ev = JSON.parse(body);
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  if (!ev.id) return json({ error: 'no id' }, 400);
  if (!(await recordEvent(env.DB, ev.id))) return json({ received: true, duplicate: true });
  try {
    await handleEvent(env.DB, ev);
  } catch {
    await forgetEvent(env.DB, ev.id); // 失敗は Stripe に再送してもらう
    return json({ error: 'handler failed' }, 500);
  }
  return json({ received: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/stripe/webhook' && method === 'POST') return webhook(request, env);
    if (pathname === '/' && method === 'GET') return html(landing());

    if (pathname === '/subscribe' && method === 'GET') {
      const s = await createCheckoutSession(env, url.origin);
      return redirect(s.url);
    }

    // 申込完了。会員証(Cookie)を渡せるのは、1回の申込につき最初の1回だけ
    if (pathname === '/success' && method === 'GET') {
      const id = url.searchParams.get('session_id');
      if (!id) return notFound();
      const s = await getCheckoutSession(env, id);
      if (s.status !== 'complete' || !s.customer) return html(pendingPage());
      const m = await insertMemberIfAbsent(env.DB, {
        customer: s.customer,
        subscription: s.subscription,
        email: s.customer_details?.email,
        status: s.payment_status === 'paid' ? 'active' : 'incomplete',
      });
      if (await claimCheckout(env.DB, s.id)) {
        const token = newToken();
        await createSession(env.DB, m.customer_id, token);
        return html(successPage(), 200, { 'Set-Cookie': sessionCookie(token) });
      }
      // 2回目以降: すでにこのブラウザが会員証を持っていれば、そのまま案内する。持っていなければ渡さない
      const me = await currentMember(request, env);
      return me && me.customer_id === m.customer_id ? html(successPage()) : html(claimedPage(), 403);
    }

    if (pathname === '/m' || pathname.startsWith('/m/')) {
      if (method !== 'GET') return notFound();
      const member = await currentMember(request, env);
      if (!member) return html(inactivePage(), 403);
      if (!isActive(member)) return html(inactivePage(), 403);
      if (pathname === '/m') return html(memberPage(TEMPLATES));
      if (pathname === '/m/portal') {
        const p = await createPortalSession(env, member.customer_id, `${url.origin}/m`);
        return redirect(p.url);
      }
      const t = pathname.match(/^\/m\/t\/([\w-]+)$/);
      const tpl = t && findTemplate(t[1]);
      return tpl ? html(templatePage(tpl)) : notFound();
    }

    return notFound();
  },
};
