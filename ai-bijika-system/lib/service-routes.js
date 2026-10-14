'use strict';
// 月額SNS自動投稿サービスのHTTPルート。server.js から `await handle(ctx)` で呼ばれ、処理したら true を返す。
const fs = require('fs');
const path = require('path');
const { Users } = require('../db');
const auth = require('./auth');
const csrf = require('./csrf');
const md = require('./md');
const billing = require('./billing');
const core = require('./service-core');
const ui = require('./service-ui');
const scheduler = require('./sns/scheduler');
const { Subscriptions, SnsAccounts, ScheduledPosts } = require('./service-store');
const { createLimiter } = require('./ratelimit');

const loginLimiter = createLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
const signupLimiter = createLimiter({ max: 10, windowMs: 60 * 60 * 1000 });

const LEGAL_DIR = path.join(__dirname, '..', 'legal');
const LEGAL_DOCS = {
  terms: ['利用規約', 'サービス利用規約_案.md'],
  tokushoho: ['特定商取引法に基づく表記', 'サービス特定商取引法表記_案.md'],
  privacy: ['プライバシーポリシー', 'サービスプライバシーポリシー_案.md'],
};

const FLASH = {
  scheduled: ['ok', '投稿を予約しました。'],
  now: ['ok', '投稿の準備ができました。まもなく投稿されます。'],
  cancelled: ['ok', '予約を取り消しました。'],
  connected: ['ok', 'SNSを連携しました。'],
  disconnected: ['ok', '連携を解除しました。'],
  sub_canceled: ['ok', '解約の手続きをしました。契約期間の終わりまでご利用いただけます。'],
  sub_resumed: ['ok', '解約を取り消しました。引き続きご利用いただけます。'],
  csrf: ['error', '操作の有効期限が切れました。もう一度お試しください。'],
  failed: ['error', '処理に失敗しました。時間をおいてもう一度お試しください。'],
};

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function redirect(res, location, headers, status = 302) {
  res.writeHead(status, { Location: location, 'Cache-Control': 'no-store', ...(headers || {}) });
  res.end();
}
function readRaw(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readForm(req) {
  const raw = await readRaw(req, 200_000).catch(() => '');
  const out = {};
  for (const [k, v] of new URLSearchParams(raw)) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}
const clientIp = (req) => String(req.headers['fly-client-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

async function handle(ctx) {
  const { req, res, url, method, pathname, user } = ctx;

  // ── Stripe Webhook（署名検証。認証不要）──
  if (pathname === '/api/stripe/webhook' && method === 'POST') {
    const c = billing.config();
    if (!c.webhookSecret) { sendJson(res, 503, { error: 'not configured' }); return true; }
    let raw;
    try { raw = await readRaw(req); } catch { sendJson(res, 413, { error: 'too large' }); return true; }
    if (!billing.verifyWebhook(raw, req.headers['stripe-signature'], c.webhookSecret)) {
      sendJson(res, 400, { error: 'invalid signature' });
      return true;
    }
    let event;
    try { event = JSON.parse(raw); } catch { sendJson(res, 400, { error: 'invalid json' }); return true; }
    try {
      await billing.handleEvent(event);
      sendJson(res, 200, { received: true });
    } catch (e) {
      console.error('[stripe webhook]', event.type, e.message);
      sendJson(res, 500, { error: 'handler failed' }); // Stripe が再送する
    }
    return true;
  }

  if (!pathname.startsWith('/service')) return false;
  const billingReady = billing.isConfigured();

  // ── 公開ページ ──
  if (pathname === '/service' && method === 'GET') { sendHtml(res, 200, ui.landingPage({ user, billingReady })); return true; }

  const legalMatch = pathname.match(/^\/service\/legal\/(terms|tokushoho|privacy)$/);
  if (legalMatch && method === 'GET') {
    const [title, file] = LEGAL_DOCS[legalMatch[1]];
    let html = '<p>準備中です。</p>';
    try { html = md.render(fs.readFileSync(path.join(LEGAL_DIR, file), 'utf8')); } catch { /* 準備中 */ }
    sendHtml(res, 200, ui.legalPage(title, html, user));
    return true;
  }

  if (pathname === '/service/signup' && method === 'GET') {
    if (user) redirect(res, '/service/app'); else sendHtml(res, 200, ui.authPage('signup'));
    return true;
  }
  if (pathname === '/service/signup' && method === 'POST') {
    const ip = clientIp(req);
    if (!signupLimiter.allow(ip)) { sendHtml(res, 429, ui.authPage('signup', '試行回数が多すぎます。しばらくしてからお試しください。')); return true; }
    signupLimiter.fail(ip);
    const { email, password } = await readForm(req);
    const e = String(email || '').trim().toLowerCase();
    if (!validEmail(e) || !password || String(password).length < 8) { sendHtml(res, 400, ui.authPage('signup', '正しいメールアドレスと、8文字以上のパスワードを入力してください。')); return true; }
    if (Users.findByEmail(e)) { sendHtml(res, 400, ui.authPage('signup', 'このメールアドレスは既に登録されています。ログインしてください。')); return true; }
    const { hash, salt } = auth.hashPassword(String(password));
    const id = Users.create({ email: e, passwordHash: hash, passwordSalt: salt });
    const token = auth.createSession(id);
    redirect(res, billingReady ? '/service/checkout' : '/service', { 'Set-Cookie': auth.sessionCookie(token) });
    return true;
  }
  if (pathname === '/service/login' && method === 'GET') { sendHtml(res, 200, ui.authPage('login')); return true; }
  if (pathname === '/service/login' && method === 'POST') {
    const { email, password } = await readForm(req);
    const e = String(email || '').trim().toLowerCase();
    const key = `${clientIp(req)}|${e}`;
    if (!loginLimiter.allow(key)) { sendHtml(res, 429, ui.authPage('login', '試行回数が多すぎます。15分ほど待ってからお試しください。')); return true; }
    const u = e ? Users.findByEmail(e) : null;
    if (!u || !auth.verifyPassword(String(password || ''), u.password_hash, u.password_salt)) {
      loginLimiter.fail(key);
      sendHtml(res, 401, ui.authPage('login', 'メールアドレスまたはパスワードが違います。'));
      return true;
    }
    loginLimiter.reset(key);
    const token = auth.createSession(u.id);
    redirect(res, '/service/app', { 'Set-Cookie': auth.sessionCookie(token) });
    return true;
  }
  if (pathname === '/service/logout') {
    auth.destroySession(auth.parseCookies(req).get('session'));
    redirect(res, '/service', { 'Set-Cookie': auth.clearCookie() });
    return true;
  }

  // ── ここから先はログイン必須 ──
  if (!user) { redirect(res, '/service/login'); return true; }
  const sessionToken = auth.parseCookies(req).get('session');
  const token = csrf.tokenFor(sessionToken);
  const flashOf = (key) => (FLASH[key] ? { type: FLASH[key][0], text: FLASH[key][1] } : null);
  const dashboard = (status, flash) => {
    sendHtml(res, status, ui.dashboardPage({
      user, sub: Subscriptions.get(user.id), accounts: SnsAccounts.listForUser(user.id),
      posts: ScheduledPosts.listForUser(user.id), csrf: token, flash,
      snsReady: core.snsEnabled(), portalReady: billingReady,
    }));
  };
  const needCsrf = async () => {
    const body = await readForm(req);
    if (!csrf.verify(sessionToken, body.csrf)) { dashboard(403, flashOf('csrf')); return null; }
    return body;
  };

  if (pathname === '/service/api/status' && method === 'GET') { sendJson(res, 200, { active: Subscriptions.isActive(user.id) }); return true; }

  // 申込みの最終確認 → Stripe Checkout
  if (pathname === '/service/checkout' && method === 'GET') {
    if (!billingReady) { redirect(res, '/service'); return true; }
    if (Subscriptions.isActive(user.id)) { redirect(res, '/service/app'); return true; }
    sendHtml(res, 200, ui.checkoutPage({ user, csrf: token }));
    return true;
  }
  if (pathname === '/service/checkout' && method === 'POST') {
    if (!billingReady) { redirect(res, '/service'); return true; }
    const body = await readForm(req);
    if (!csrf.verify(sessionToken, body.csrf)) { sendHtml(res, 403, ui.checkoutPage({ user, csrf: token, error: '操作の有効期限が切れました。もう一度お試しください。' })); return true; }
    if (body.agree !== '1') { sendHtml(res, 400, ui.checkoutPage({ user, csrf: token, error: '内容への同意にチェックを入れてください。' })); return true; }
    if (Subscriptions.isActive(user.id)) { redirect(res, '/service/app'); return true; }
    try {
      const cur = Subscriptions.get(user.id);
      Subscriptions.upsert(user.id, { agreed_at: new Date().toISOString(), agreed_version: core.TERMS_VERSION });
      const checkoutUrl = await billing.createCheckoutSession({ userId: user.id, email: user.email, customerId: cur && cur.stripe_customer_id });
      redirect(res, checkoutUrl, {}, 303);
    } catch (e) {
      console.error('[checkout]', e.message);
      sendHtml(res, 502, ui.checkoutPage({ user, csrf: token, error: '決済ページの準備に失敗しました。時間をおいてもう一度お試しください。' }));
    }
    return true;
  }
  if (pathname === '/service/checkout/success' && method === 'GET') { sendHtml(res, 200, ui.checkoutResultPage({ user, kind: 'success' })); return true; }
  if (pathname === '/service/checkout/cancel' && method === 'GET') { sendHtml(res, 200, ui.checkoutResultPage({ user, kind: 'cancel' })); return true; }

  // マイページ
  if (pathname === '/service/app' && method === 'GET') { dashboard(200, flashOf(url.searchParams.get('f'))); return true; }

  if (pathname === '/service/app/post' && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    const now = body.mode === 'now';
    const at = now ? new Date(Date.now() + 1000).toISOString() : core.jstLocalToIso(body.at);
    const r = core.createPosts({ userId: user.id, accountIds: body.account, text: body.text, scheduledAtIso: at });
    if (!r.ok) { dashboard(400, { type: 'error', text: r.error }); return true; }
    if (now) setTimeout(() => scheduler.tick().catch(() => {}), 1500);
    redirect(res, `/service/app?f=${now ? 'now' : 'scheduled'}`);
    return true;
  }
  const cancelMatch = pathname.match(/^\/service\/app\/post\/([a-f0-9]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    ScheduledPosts.cancel(cancelMatch[1], user.id);
    redirect(res, '/service/app?f=cancelled');
    return true;
  }
  const discMatch = pathname.match(/^\/service\/app\/account\/([a-f0-9]+)\/disconnect$/);
  if (discMatch && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    SnsAccounts.remove(discMatch[1], user.id);
    redirect(res, '/service/app?f=disconnected');
    return true;
  }

  // SNS連携（OAuth）
  const connectMatch = pathname.match(/^\/service\/connect\/(threads|x)$/);
  if (connectMatch && method === 'GET') {
    if (!Subscriptions.isActive(user.id)) { dashboard(403, { type: 'error', text: 'ご契約が有効でないため、連携できません。' }); return true; }
    const r = core.startConnect({ userId: user.id, platform: connectMatch[1] });
    if (!r.ok) { dashboard(400, { type: 'error', text: r.error }); return true; }
    redirect(res, r.url);
    return true;
  }
  const cbMatch = pathname.match(/^\/service\/oauth\/callback\/(threads|x)$/);
  if (cbMatch && method === 'GET') {
    if (url.searchParams.get('error')) { dashboard(400, { type: 'error', text: 'SNS側で連携が許可されませんでした。' }); return true; }
    const r = await core.finishConnect({ userId: user.id, platform: cbMatch[1], code: url.searchParams.get('code'), state: url.searchParams.get('state') });
    if (!r.ok) { dashboard(400, { type: 'error', text: r.error }); return true; }
    redirect(res, '/service/app?f=connected');
    return true;
  }

  // 解約・解約の取り消し・支払い方法の変更
  if ((pathname === '/service/billing/cancel' || pathname === '/service/billing/resume') && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    try {
      await billing.setCancelAtPeriodEnd(user.id, pathname.endsWith('/cancel'));
      redirect(res, `/service/app?f=${pathname.endsWith('/cancel') ? 'sub_canceled' : 'sub_resumed'}`);
    } catch (e) {
      console.error('[billing]', e.message);
      dashboard(502, flashOf('failed'));
    }
    return true;
  }
  if (pathname === '/service/billing/portal' && method === 'GET') {
    const sub = Subscriptions.get(user.id);
    if (!billingReady || !sub || !sub.stripe_customer_id) { redirect(res, '/service/app'); return true; }
    try { redirect(res, await billing.createPortalSession(sub.stripe_customer_id)); }
    catch (e) { console.error('[portal]', e.message); dashboard(502, flashOf('failed')); }
    return true;
  }

  return false;
}

module.exports = { handle, LEGAL_DOCS };
