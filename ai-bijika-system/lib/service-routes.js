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
const { Subscriptions, SnsAccounts, ScheduledPosts, ApiKeys } = require('./service-store');
const { createLimiter } = require('./ratelimit');
const mediaLib = require('./media');
const registry = require('./sns');
const apiV1 = require('./api-v1');

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
  key_revoked: ['ok', 'APIキーを無効にしました。'],
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
// 偽装できる X-Forwarded-For は使わない（Fly.io が付ける Fly-Client-IP か、接続元のアドレス）
const clientIp = (req) => String(req.headers['fly-client-ip'] || req.socket.remoteAddress || '').trim();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

async function handle(ctx) {
  const { req, res, url, method, pathname, user } = ctx;

  if (await apiV1.handle(ctx)) return true;

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

  // ── 投稿に添付するメディアの公開URL（Instagram等が取得する。推測できないトークン付き）──
  const mediaMatch = pathname.match(/^\/media\/([a-f0-9]{48})\.(jpg|png|mp4|mov)$/);
  if (mediaMatch && (method === 'GET' || method === 'HEAD')) { mediaLib.serve(req, res, mediaMatch[1], mediaMatch[2]); return true; }

  if (!pathname.startsWith('/service')) return false;
  // 販売を開始してよい状態か（Stripeの設定、連絡先メール、SNS連携の設定、そして運営者が明示した販売開始の合図）
  const billingReady = billing.isConfigured();
  const salesOpen = core.salesOpen();
  const contactEmail = core.contactEmail();

  // ── 公開ページ ──
  if (pathname === '/service' && method === 'GET') { sendHtml(res, 200, ui.landingPage({ user, billingReady: salesOpen })); return true; }

  const legalMatch = pathname.match(/^\/service\/legal\/(terms|tokushoho|privacy)$/);
  if (legalMatch && method === 'GET') {
    const [title, file] = LEGAL_DOCS[legalMatch[1]];
    let html = '<p>準備中です。</p>';
    try {
      html = md.render(fs.readFileSync(path.join(LEGAL_DIR, file), 'utf8'));
      if (contactEmail) html = html.split('【メールアドレス】').join(contactEmail.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    } catch { /* 準備中 */ }
    sendHtml(res, 200, ui.legalPage(title, html, user));
    return true;
  }

  if (pathname === '/service/docs/api' && method === 'GET') { sendHtml(res, 200, ui.apiDocsPage(user, String(process.env.SERVICE_BASE_URL || '').replace(/\/+$/, ''))); return true; }

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
    redirect(res, salesOpen ? '/service/checkout' : '/service', { 'Set-Cookie': auth.sessionCookie(token) });
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
  const dashboard = (status, flash, newKey) => {
    sendHtml(res, status, ui.dashboardPage({
      user, sub: Subscriptions.get(user.id), accounts: SnsAccounts.listForUser(user.id), apiKeys: ApiKeys.listForUser(user.id), newKey: newKey || '',
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
  // 既に契約がある人（支払いの確認待ちを含む）には、2本目の契約を作らせない
  const hasOpenSubscription = () => {
    const cur = Subscriptions.get(user.id);
    return !!cur && !!cur.stripe_subscription_id && !['canceled', 'incomplete_expired'].includes(cur.status);
  };
  if (pathname === '/service/checkout' && method === 'GET') {
    if (!salesOpen) { redirect(res, '/service'); return true; }
    if (hasOpenSubscription()) { redirect(res, '/service/app'); return true; }
    sendHtml(res, 200, ui.checkoutPage({ user, csrf: token }));
    return true;
  }
  if (pathname === '/service/checkout' && method === 'POST') {
    if (!salesOpen) { redirect(res, '/service'); return true; }
    if (hasOpenSubscription()) { redirect(res, '/service/app'); return true; }
    const body = await readForm(req);
    if (!csrf.verify(sessionToken, body.csrf)) { sendHtml(res, 403, ui.checkoutPage({ user, csrf: token, error: '操作の有効期限が切れました。もう一度お試しください。' })); return true; }
    if (body.agree !== '1') { sendHtml(res, 400, ui.checkoutPage({ user, csrf: token, error: '内容への同意にチェックを入れてください。' })); return true; }
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
  if (pathname === '/service/checkout/success' && method === 'GET') {
    const sid = url.searchParams.get('session_id');
    if (sid && billingReady) { try { await billing.syncCheckoutSession(user.id, sid); } catch (e) { console.error('[checkout sync]', e.message); } }
    sendHtml(res, 200, ui.checkoutResultPage({ user, kind: 'success' }));
    return true;
  }
  if (pathname === '/service/checkout/cancel' && method === 'GET') { sendHtml(res, 200, ui.checkoutResultPage({ user, kind: 'cancel' })); return true; }

  // マイページ
  if (pathname === '/service/app' && method === 'GET') { dashboard(200, flashOf(url.searchParams.get('f'))); return true; }

  // TikTokの投稿設定（このアカウントで使える公開範囲など）をTikTokに問い合わせる
  if (pathname === '/service/app/tiktok/creator-info' && method === 'GET') {
    const acc = SnsAccounts.getForUser(url.searchParams.get('account') || '', user.id);
    if (!acc || acc.platform !== 'tiktok' || acc.status !== 'active' || !Subscriptions.isActive(user.id)) { sendJson(res, 404, { error: 'アカウントが見つかりません。' }); return true; }
    try {
      const adapter = registry.get('tiktok');
      const token = await scheduler.ensureAccessToken(acc, adapter);
      sendJson(res, 200, await adapter.creatorInfo({ accessToken: token }));
    } catch (e) {
      if (e && e.authError) SnsAccounts.setStatus(acc.id, 'reauth_required');
      sendJson(res, 502, { error: 'TikTokの投稿設定を取得できませんでした。時間をおいてもう一度お試しください。' });
    }
    return true;
  }

  // 画像・動画のアップロード（本文はファイルそのもの。CSRFトークンはヘッダーで受け取る）
  if (pathname === '/service/app/media' && method === 'POST') {
    if (!csrf.verify(sessionToken, req.headers['x-csrf'])) { sendJson(res, 403, { error: '操作の有効期限が切れました。ページを再読み込みしてください。' }); return true; }
    if (!Subscriptions.isActive(user.id)) { sendJson(res, 403, { error: 'ご契約が有効ではありません。' }); return true; }
    const r = await mediaLib.saveUpload({ userId: user.id, req, contentLength: parseInt(req.headers['content-length'] || '0', 10) });
    if (!r.ok) { sendJson(res, 400, { error: r.error }); return true; }
    sendJson(res, 200, { id: r.media.id, kind: r.media.kind, size: r.media.size, mime: r.media.mime });
    return true;
  }

  if (pathname === '/service/app/post' && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    const now = body.mode === 'now';
    const at = now ? new Date(Date.now() + 1000).toISOString() : core.jstLocalToIso(body.at);
    // TikTokの設定：公開範囲は必ず本人に選ばせる。コメント・デュエット・ステッチは、チェックを入れたときだけ許可
    const options = { tiktok: { privacy_level: body.tiktok_privacy || '', disable_comment: body.tiktok_comment !== '1', disable_duet: body.tiktok_duet !== '1', disable_stitch: body.tiktok_stitch !== '1', commercial_own: body.tiktok_commercial_own === '1', commercial_paid: body.tiktok_commercial_paid === '1' } };
    const r = core.createPosts({ userId: user.id, accountIds: body.account, text: body.text, scheduledAtIso: at, mediaId: body.media_id || '', options });
    if (!r.ok) { dashboard(400, { type: 'error', text: r.error }); return true; }
    if (now) setTimeout(() => scheduler.tick().catch(() => {}), 1500);
    redirect(res, `/service/app?f=${now ? 'now' : 'scheduled'}`);
    return true;
  }
  if (pathname === '/service/app/apikey' && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    if (!Subscriptions.isActive(user.id)) { dashboard(403, { type: 'error', text: 'ご契約が有効ではありません。' }); return true; }
    const k = ApiKeys.create(user.id, body.label);
    if (!k) { dashboard(400, { type: 'error', text: 'APIキーは5件までです。不要なキーを無効にしてください。' }); return true; }
    dashboard(200, { type: 'ok', text: 'APIキーを発行しました。' }, k.key);
    return true;
  }
  const keyRevoke = pathname.match(/^\/service\/app\/apikey\/([a-f0-9]+)\/revoke$/);
  if (keyRevoke && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    ApiKeys.revoke(keyRevoke[1], user.id);
    redirect(res, '/service/app?f=key_revoked');
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
  const connectMatch = pathname.match(/^\/service\/connect\/([a-z]+)$/);
  if (connectMatch && registry.get(connectMatch[1]) && method === 'GET') {
    if (!Subscriptions.isActive(user.id)) { dashboard(403, { type: 'error', text: 'ご契約が有効でないため、連携できません。' }); return true; }
    const r = core.startConnect({ userId: user.id, platform: connectMatch[1] });
    if (!r.ok) { dashboard(400, { type: 'error', text: r.error }); return true; }
    redirect(res, r.url);
    return true;
  }
  const cbMatch = pathname.match(/^\/service\/oauth\/callback\/([a-z]+)$/);
  if (cbMatch && registry.get(cbMatch[1]) && method === 'GET') {
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
