import { verifySignature, createCheckoutSession, getCheckoutSession, createPortalSession } from './stripe.js';
import {
  upsertMember, insertMemberIfAbsent, setStatus, recordEvent, forgetEvent, isActive,
  newToken, claimCheckout, createSession, findBySession,
} from './db.js';
import { TEMPLATES, findTemplate } from './content.js';
import { html, landing, samplePage, SAMPLE_ID, comingSoonPage, successPage, claimedPage, pendingPage, memberPage, templatePage, inactivePage, notFound, loginPage, codePage } from './pages.js';
import { issueCode, verifyCode, sendCodeMail, normalizeEmail } from './login.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

import { COMPANY, legalMissing } from './company.js';
import { tokushohoPage, termsPage, privacyPage } from './legal.js';

const LEGAL_PAGES = { '/legal/tokushoho': tokushohoPage, '/legal/terms': termsPage, '/legal/privacy': privacyPage };
export const legalOpen = (env, company = COMPANY) => env.LEGAL_PUBLIC === 'true' && legalMissing(company).length === 0;

const COOKIE = 'sakumon_session';

// 流入元の目印(?src=note など)。英小文字・数字・_・- の30文字まで。それ以外は無視する
const srcOf = (url) => {
  const v = (url.searchParams.get('src') || '').toLowerCase();
  return /^[a-z0-9_-]{1,30}$/.test(v) ? v : '';
};

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
    // LPは、オーナーの承認と監査役のレビューが済むまで非公開。公開するときは wrangler.toml の LP_PUBLIC を "true" にする
    if (pathname === '/' && method === 'GET') return html(env.LP_PUBLIC === 'true' ? landing(legalOpen(env), srcOf(url)) : comingSoonPage());

    // ひな形の見本(申し込む前に見られる)。LPと同じく、LP_PUBLIC が "true" のときだけ出す
    if (pathname === '/sample' && method === 'GET') {
      return env.LP_PUBLIC === 'true' ? html(samplePage(findTemplate(SAMPLE_ID), srcOf(url), legalOpen(env))) : notFound();
    }

    // 法務ページ。LEGAL_PUBLIC が "true" で、会社情報の必須項目がすべて埋まっているときだけ公開する(空欄があれば404)
    const legalPage = LEGAL_PAGES[pathname];
    if (legalPage && method === 'GET') return legalOpen(env) ? html(legalPage(COMPANY)) : notFound();

    if (pathname === '/subscribe' && method === 'GET') {
      const s = await createCheckoutSession(env, url.origin, Date.now(), srcOf(url));
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

    // メールの確認コードでログイン(別の端末・Cookie消去後の入口)
    if (pathname === '/login' && method === 'GET') return html(loginPage());
    if ((pathname === '/login' || pathname === '/login/verify') && method === 'POST') {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return notFound();
      const form = await request.formData().catch(() => null);
      if (!form) return html(loginPage('入力内容を読み取れませんでした。もう一度お試しください。'), 400);
      const email = normalizeEmail(form.get('email'));

      if (pathname === '/login') {
        // 契約の有無にかかわらず同じ画面を返す(登録の有無を外から探られないため)
        try {
          const issued = await issueCode(env.DB, email);
          if (issued) await sendCodeMail(env, issued.email, issued.code);
        } catch (e) {
          console.error('login mail failed:', e && e.message);
        }
        return html(codePage(email));
      }

      const token = await verifyCode(env.DB, email, form.get('code'));
      if (!token) return html(codePage(email, '確認コードが正しくないか、期限が切れています。'), 400);
      return new Response(null, { status: 303, headers: { Location: '/m', 'Set-Cookie': sessionCookie(token), 'Cache-Control': 'no-store' } });
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
