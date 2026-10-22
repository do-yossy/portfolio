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
const { Subscriptions, SnsAccounts, ScheduledPosts, ApiKeys, AutoRules, AiJobs, MediaAssets } = require('./service-store');
const { createLimiter } = require('./ratelimit');
const mediaLib = require('./media');
const registry = require('./sns');
const apiV1 = require('./api-v1');
const mcp = require('./mcp');
const oauth = require('./oauth');
const consent = require('./consent');
const referral = require('./referral');
const ai = require('./ai');
const aiAuto = require('./ai-auto');
const metaSigned = require('./meta-signed-request');
const metaDeletion = require('./meta-deletion');
const snsDisconnect = require('./sns/disconnect');

const loginLimiter = createLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
const signupLimiter = createLimiter({ max: 10, windowMs: 60 * 60 * 1000 });

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
  auto_added: ['ok', '自動運用のルールを追加しました。'],
  auto_changed: ['ok', '自動運用のルールを更新しました。'],
  app_revoked: ['ok', 'アプリの接続を解除しました。'],
  key_revoked: ['ok', 'APIキーを無効にしました。'],
  disconnected: ['ok', '連携を解除しました。'],
  sub_canceled: ['ok', '解約の手続きをしました。契約期間の終わりまでご利用いただけます。'],
  sub_resumed: ['ok', '解約を取り消しました。引き続きご利用いただけます。'],
  plan_agency: ['ok', '30件プランに変更しました。日割りの差額は、次回の請求に含まれます。'],
  plan_agency_trial: ['ok', '30件プランに変更しました。無料期間中のため日割りはなく、最初の請求から30件プランの月額になります。'],
  plan_standard: ['ok', '通常プランに変更しました（無料期間中のため、最初の請求から通常の月額です）。'],
  plan_standard_scheduled: ['ok', '通常プランへの変更を予約しました。次回の更新日から通常プラン（連携は10件まで）になります。'],
  plan_released: ['ok', '通常プランへの変更の予約を取り消しました。引き続き30件プランです。'],
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
  if (await mcp.handle(ctx)) return true;
  if (await oauth.handle(ctx)) return true;

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
  if (pathname === '/service' && method === 'GET') { sendHtml(res, 200, ui.landingPage({ user, billingReady: salesOpen, trialDays: user ? core.trialFor(user.id) : core.trialDays() })); return true; }
  // 固定投稿などから来た人向けのLP
  if (pathname === '/service/lp' && method === 'GET') { sendHtml(res, 200, ui.lpPage({ user, billingReady: salesOpen, trialDays: user ? core.trialFor(user.id) : core.trialDays() })); return true; }

  const legalMatch = pathname.match(/^\/service\/legal\/(terms|tokushoho|privacy)$/);
  if (legalMatch && method === 'GET') {
    const [title, file] = LEGAL_DOCS[legalMatch[1]];
    let html = '<p>準備中です。</p>';
    try { html = md.render(core.legalMarkdown(file)); } catch { /* 準備中 */ }
    sendHtml(res, 200, ui.legalPage(title, html, user));
    return true;
  }

  // ── データ削除の手順（ログイン不要。各SNSのアプリの「ユーザーデータ削除の手順のURL」に登録できる）──
  if (pathname === '/service/legal/data-deletion' && method === 'GET') { sendHtml(res, 200, ui.dataDeletionPage({ user })); return true; }

  // ── Meta（Threads・Instagram・Facebook）から届く、データ削除の求めと連携の取り消しの知らせ（ログイン不要。signed_request の署名で確かめる）──
  // 各アプリの管理画面に登録するURL：/service/meta/<SNS>/data-deletion（データ削除）と /service/meta/<SNS>/deauthorize（取り消し）
  const metaMatch = pathname.match(/^\/service\/meta\/(threads|instagram|facebook)\/(data-deletion|deauthorize)$/);
  if (metaMatch) {
    if (method !== 'POST') { res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'method not allowed' })); return true; }
    const [, platform, action] = metaMatch;
    const secret = metaSigned.secretFor(platform);
    if (!secret) { sendJson(res, 503, { error: 'not configured' }); return true; }
    let raw;
    try { raw = await readRaw(req, 64 * 1024); } catch { sendJson(res, 413, { error: 'too large' }); return true; }
    const v = metaSigned.parse(metaSigned.fromBody(raw, req.headers['content-type']), secret);
    if (!v.ok) { console.warn('[meta]', platform, action, v.error); sendJson(res, 400, { error: 'invalid signed_request' }); return true; }
    let r;
    try {
      r = metaDeletion.handle({ platform, kind: action === 'data-deletion' ? 'deletion' : 'deauthorize', userId: v.userId });
    } catch (e) {
      console.error('[meta]', platform, action, e.message);
      sendJson(res, 500, { error: 'failed' });
      return true;
    }
    // 取り消しの知らせへの応答の形は、公式に定めが見当たらない（未確認）。受け取ったことだけを返す
    if (action === 'deauthorize') { sendJson(res, 200, { received: true }); return true; }
    // データ削除：公式の形 { url, confirmation_code }。url は、人が処理の状況を読めるページ（ログイン不要）
    const base = String(process.env.SERVICE_BASE_URL || '').replace(/\/+$/, '') || `https://${String(req.headers.host || '').replace(/[^A-Za-z0-9.:-]/g, '')}`;
    sendJson(res, 200, { url: `${base}/service/meta/deletion?code=${r.code}`, confirmation_code: r.code });
    return true;
  }
  // 削除の状況のページ（ログイン不要。確認コードで開く）
  if (pathname === '/service/meta/deletion' && method === 'GET') {
    const code = String(url.searchParams.get('code') || '').trim();
    const request = metaDeletion.getRequest(code);
    sendHtml(res, request || !code ? 200 : 404, ui.metaDeletionStatusPage({ request, code: code.slice(0, 64), user }));
    return true;
  }

  if (pathname === '/service/docs/skill.md' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(fs.readFileSync(path.join(__dirname, '..', 'skill', 'SKILL.md')));
    return true;
  }
  if (pathname === '/service/docs/api' && method === 'GET') { sendHtml(res, 200, ui.apiDocsPage(user, String(process.env.SERVICE_BASE_URL || '').replace(/\/+$/, ''))); return true; }

  if (pathname === '/service/signup' && method === 'GET') {
    // 紹介のURL（?ref=紹介コード）から来た人は、コードを登録の画面に引き継ぐ（形式が正しいものだけ。コードが有効かどうかは、ここでは示さない）
    const ref = referral.enabled() && referral.validCode(url.searchParams.get('ref')) ? url.searchParams.get('ref') : '';
    if (user) redirect(res, '/service/app'); else sendHtml(res, 200, ui.authPage('signup', '', '', ref));
    return true;
  }
  if (pathname === '/service/signup' && method === 'POST') {
    const ip = clientIp(req);
    if (!signupLimiter.allow(ip)) { sendHtml(res, 429, ui.authPage('signup', '試行回数が多すぎます。しばらくしてからお試しください。')); return true; }
    signupLimiter.fail(ip);
    const { email, password, ref: rawRef } = await readForm(req);
    const ref = referral.enabled() && referral.validCode(rawRef) ? rawRef : '';
    const e = String(email || '').trim().toLowerCase();
    if (!validEmail(e) || !password || String(password).length < 8) { sendHtml(res, 400, ui.authPage('signup', '正しいメールアドレスと、8文字以上のパスワードを入力してください。', '', ref)); return true; }
    if (Users.findByEmail(e)) { sendHtml(res, 400, ui.authPage('signup', 'このメールアドレスは既に登録されています。ログインしてください。', '', ref)); return true; }
    const { hash, salt } = auth.hashPassword(String(password));
    const id = Users.create({ email: e, passwordHash: hash, passwordSalt: salt });
    // 紹介されて登録した記録（users 表ではなく referrals 表）。失敗しても登録は止めない
    if (ref) { try { referral.recordSignup({ referredUserId: id, referredEmail: e, code: ref }); } catch (err) { console.error('[referral signup]', err.message); } }
    const token = auth.createSession(id);
    redirect(res, salesOpen ? '/service/checkout' : '/service', { 'Set-Cookie': auth.sessionCookie(token) });
    return true;
  }
  // ログイン後の戻り先（自サイト内の、決まったパスだけ）
  const safeNext = (n) => (typeof n === 'string' && /^\/(service|oauth)\//.test(n) && !n.startsWith('//') && !/[\r\n\\]/.test(n) ? n : '');
  if (pathname === '/service/login' && method === 'GET') {
    const next = safeNext(url.searchParams.get('next'));
    if (user && next) { redirect(res, next); return true; }
    sendHtml(res, 200, ui.authPage('login', '', next)); return true;
  }
  if (pathname === '/service/login' && method === 'POST') {
    const { email, password, next: rawNext } = await readForm(req);
    const next = safeNext(rawNext);
    const e = String(email || '').trim().toLowerCase();
    const key = `${clientIp(req)}|${e}`;
    if (!loginLimiter.allow(key)) { sendHtml(res, 429, ui.authPage('login', '試行回数が多すぎます。15分ほど待ってからお試しください。')); return true; }
    const u = e ? Users.findByEmail(e) : null;
    if (!u || !auth.verifyPassword(String(password || ''), u.password_hash, u.password_salt)) {
      loginLimiter.fail(key);
      sendHtml(res, 401, ui.authPage('login', 'メールアドレスまたはパスワードが違います。', next));
      return true;
    }
    loginLimiter.reset(key);
    const token = auth.createSession(u.id);
    redirect(res, next || '/service/app', { 'Set-Cookie': auth.sessionCookie(token) });
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
      user, sub: Subscriptions.get(user.id), accounts: SnsAccounts.listForUser(user.id), apiKeys: ApiKeys.listForUser(user.id), mcpConnections: oauth.listConnections(user.id), aiAvail: ai.available(), autoRules: AutoRules.listForUser(user.id), newKey: newKey || '',
      posts: ScheduledPosts.listForUser(user.id), csrf: token, flash,
      snsReady: core.snsEnabled(), portalReady: billingReady,
      removalNotices: metaDeletion.Notices.listForUser(user.id),
      referral: referral.infoFor(user.id), agencyOffered: core.agencyOffered(),
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
    return !!cur && !!cur.stripe_subscription_id && require('./service-store').OPEN_STRIPE_STATUSES.has(cur.status);
  };
  // 最終確認画面。plan は選んだプラン（30件プランは、STRIPE_PRICE_ID_AGENCY が設定されているときだけ選べる）
  const checkoutView = (status, plan, error) => {
    const agencyOk = core.agencyOffered();
    const p = plan === 'agency' && agencyOk ? 'agency' : 'standard';
    sendHtml(res, status, ui.checkoutPage({ user, trialDays: core.trialFor(user.id), referral: core.referralTrialFor(user.id) > 0, plan: p, agencyOffered: agencyOk, csrf: token, error }));
  };
  if (pathname === '/service/checkout' && method === 'GET') {
    if (!salesOpen) { redirect(res, '/service'); return true; }
    if (hasOpenSubscription()) { redirect(res, '/service/app'); return true; }
    const want = url.searchParams.get('plan') === 'agency' ? 'agency' : 'standard';
    checkoutView(want === 'agency' && !core.agencyOffered() ? 400 : 200, want, want === 'agency' && !core.agencyOffered() ? '30件プランは、現在お申込みいただけません。' : undefined);
    return true;
  }
  if (pathname === '/service/checkout' && method === 'POST') {
    if (!salesOpen) { redirect(res, '/service'); return true; }
    if (hasOpenSubscription()) { redirect(res, '/service/app'); return true; }
    const body = await readForm(req);
    const want = body.plan === 'agency' ? 'agency' : 'standard';
    // 使えないプランは、申込みも断る（画面に出していなくても、フォームを直接送られた場合に備えて、サーバー側で判定する）
    if (want === 'agency' && !core.agencyOffered()) { checkoutView(400, 'standard', '30件プランは、現在お申込みいただけません。'); return true; }
    if (!csrf.verify(sessionToken, body.csrf)) { checkoutView(403, want, '操作の有効期限が切れました。もう一度お試しください。'); return true; }
    if (body.agree !== '1') { checkoutView(400, want, '内容への同意にチェックを入れてください。'); return true; }
    try {
      const cur = Subscriptions.get(user.id);
      const trial = core.trialFor(user.id);
      Subscriptions.upsert(user.id, { agreed_at: new Date().toISOString(), agreed_version: core.TERMS_VERSION });
      // 同意の記録（証拠）：その時点で示した法務文書の本文の控えと、最終確認画面の条件（選んだプランの金額・連携の上限、紹介による無料期間か）
      const docs = {};
      for (const f of core.LEGAL_FILES) { try { docs[f] = core.legalMarkdown(f); } catch { /* 文書が無い場合は控えなし */ } }
      consent.record({ userId: user.id, email: user.email, kind: 'checkout', termsVersion: core.TERMS_VERSION, docs, req,
        detail: { plan: want, price: core.priceYen(want), trialDays: trial, referralTrial: core.referralTrialFor(user.id) > 0, limits: { accounts: core.maxAccountsFor(want), pending: core.LIMITS.maxPending, perDay: core.LIMITS.maxPerDay, xPerMonth: core.LIMITS.xPerMonth } } });
      const checkoutUrl = await billing.createCheckoutSession({ userId: user.id, email: user.email, customerId: cur && cur.stripe_customer_id, trialDays: trial, plan: want });
      redirect(res, checkoutUrl, {}, 303);
    } catch (e) {
      console.error('[checkout]', e.message);
      checkoutView(502, want, '決済ページの準備に失敗しました。時間をおいてもう一度お試しください。');
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

  // Threadsの最近の投稿（threads_basic の録画の要件）。連携した本人だけが、自分の連携の分だけを見られる。
  // 開くたびにThreadsから取得して画面に出すだけで、DBには保存しない（Cache-Control: no-store で、ブラウザにも残さない）
  const recentMatch = pathname.match(/^\/service\/app\/threads\/([a-f0-9]+)\/recent$/);
  if (recentMatch && method === 'GET') {
    const acc = SnsAccounts.getForUser(recentMatch[1], user.id);
    // 他人の連携・存在しない連携・Threads以外の連携は、あるかどうかも分からないよう、同じ 404 にする
    if (!acc || acc.platform !== 'threads') { sendHtml(res, 404, ui.threadsRecentPage({ user, account: null, error: 'この連携は見つかりませんでした。' })); return true; }
    if (!Subscriptions.isActive(user.id)) { redirect(res, '/service/app'); return true; }
    if (acc.status !== 'active') { sendHtml(res, 409, ui.threadsRecentPage({ user, account: acc, error: 'この連携は、再連携が必要です。マイページから連携をやり直してください。' })); return true; }
    try {
      const adapter = registry.get('threads');
      const accessToken = await scheduler.ensureAccessToken(acc, adapter);
      const items = await adapter.listRecent({ accessToken, externalUserId: acc.external_user_id, limit: 20 });
      sendHtml(res, 200, ui.threadsRecentPage({ user, account: acc, items }));
    } catch (e) {
      if (e && e.authError) SnsAccounts.setStatus(acc.id, 'reauth_required');
      console.error('[threads recent]', e && e.message);
      sendHtml(res, 502, ui.threadsRecentPage({ user, account: acc, error: e && e.authError ? 'Threadsの連携が無効になっていました。マイページから連携をやり直してください。' : 'Threadsから投稿を取得できませんでした。時間をおいてもう一度お試しください。' }));
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
  const aiMatch = pathname.match(/^\/service\/app\/ai\/(text|image|video)$/);
  if (aiMatch && method === 'POST') {
    if (!csrf.verify(sessionToken, req.headers['x-csrf'])) { sendJson(res, 403, { error: '操作の有効期限が切れました。ページを再読み込みしてください。' }); return true; }
    if (!Subscriptions.isActive(user.id)) { sendJson(res, 403, { error: 'ご契約が有効ではありません。' }); return true; }
    let b = {};
    try { b = JSON.parse(await readRaw(req, 20_000) || '{}'); } catch { sendJson(res, 400, { error: '入力が正しくありません。' }); return true; }
    try {
      if (aiMatch[1] === 'text') sendJson(res, 200, { text: await ai.generateText({ userId: user.id, theme: b.theme, platform: b.platform }) });
      else if (aiMatch[1] === 'image') { const m = await ai.generateImage({ userId: user.id, prompt: b.prompt }); sendJson(res, 200, { id: m.id, url: mediaLib.publicUrl(m) }); }
      else {
        if (!String(b.prompt || '').trim()) { sendJson(res, 400, { error: '動画の内容を入力してください。' }); return true; }
        const op = await ai.startVideo({ userId: user.id, prompt: `${String(b.prompt || '')}（SNSの縦長の短い動画。文字やロゴは入れない）` });
        sendJson(res, 202, { job_id: AiJobs.create({ userId: user.id, kind: 'video', prompt: String(b.prompt || '').slice(0, 1000), operation: op }) });
      }
    } catch (e) {
      if (e instanceof ai.AiError) sendJson(res, 400, { error: e.message }); else { console.error('[ai]', e.message); sendJson(res, 500, { error: '生成に失敗しました。時間をおいてもう一度お試しください。' }); }
    }
    return true;
  }
  // 動画の生成の状態（画面から数秒ごとに確認する。できあがったら、確認用のURLも返す）
  const jobMatch = pathname.match(/^\/service\/app\/ai\/jobs\/([a-f0-9]+)$/);
  if (jobMatch && method === 'GET') {
    const j = AiJobs.get(jobMatch[1], user.id);
    if (!j) { sendJson(res, 404, { error: '見つかりません。' }); return true; }
    const m = j.media_id ? require('./service-store').MediaAssets.getForUser(j.media_id, user.id) : null;
    sendJson(res, 200, { status: j.status, media_id: j.media_id || undefined, url: m ? mediaLib.publicUrl(m) : undefined, error: j.error || undefined });
    return true;
  }
  if (pathname === '/service/app/auto' && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    if (!Subscriptions.isActive(user.id)) { dashboard(403, { type: 'error', text: 'ご契約が有効ではありません。' }); return true; }
    const hours = [body.hour1, body.hour2, body.hour3].filter((h) => h !== undefined && h !== '').map((h) => parseInt(h, 10));
    const options = {};
    if (body.yt_privacy) options.privacy = String(body.yt_privacy);
    if (body.yt_kids === 'yes' || body.yt_kids === 'no') options.made_for_kids = body.yt_kids === 'yes';
    const args = apiV1.ruleArgs(user.id, { account_id: body.account_id, theme: body.theme, tone: body.tone, media: body.media, hours, mode: body.mode, options });
    if (args.mode === 'auto' && body.confirm_auto !== '1') { dashboard(400, { type: 'error', text: '「そのまま投稿する」を選ぶ場合は、確認のチェックが必要です。' }); return true; }
    const problem = aiAuto.validateRule(args);
    if (problem) { dashboard(400, { type: 'error', text: problem }); return true; }
    const ruleId = aiAuto.createRule(args);
    if (args.mode === 'auto') consent.record({ userId: user.id, email: user.email, kind: 'auto_full', termsVersion: core.TERMS_VERSION, req, detail: { ruleId, accountId: args.accountId, via: '画面' } });
    redirect(res, '/service/app?f=auto_added');
    return true;
  }
  const autoAct = pathname.match(/^\/service\/app\/auto\/([a-f0-9]+)\/(toggle|delete)$/);
  if (autoAct && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    const rule = AutoRules.get(autoAct[1], user.id);
    if (rule) { if (autoAct[2] === 'delete') AutoRules.remove(rule.id, user.id); else AutoRules.setEnabled(rule.id, user.id, !rule.enabled); }
    redirect(res, '/service/app?f=auto_changed');
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
  const appRevoke = pathname.match(/^\/service\/app\/connection\/(mcpc_[a-f0-9]+)\/revoke$/);
  if (appRevoke && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    oauth.revokeClient(user.id, appRevoke[1]);
    redirect(res, '/service/app?f=app_revoked');
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
    redirect(res, body.back === 'calendar' ? '/service/app/calendar?f=cancelled' : '/service/app?f=cancelled');
    return true;
  }

  // 投稿を作る（ツリー・複数画像・SNSごとの本文・下書き）とカレンダー
  if (pathname === '/service/app/compose' && method === 'GET') {
    if (!Subscriptions.isActive(user.id)) { redirect(res, '/service/app'); return true; }
    // 下書きを読み込んで開く（TikTokの下書きは、ここで設定を選び直してから投稿する）。TikTokの設定は読み込まない（選び直してもらう）
    let draft = null;
    const did = url.searchParams.get('draft');
    const dp = did ? ScheduledPosts.get(did) : null;
    if (dp && dp.user_id === user.id && dp.status === 'draft') {
      const mv = (mid) => { const m = MediaAssets.getForUser(mid, user.id); return m ? { id: m.id, kind: m.kind, url: mediaLib.publicUrl(m) } : null; };
      let mids = []; try { mids = JSON.parse(dp.media_ids || '[]'); } catch { mids = []; }
      let tree = []; try { tree = JSON.parse(dp.tree || '[]'); } catch { tree = []; }
      draft = { id: dp.id, accountId: dp.account_id, category: dp.category || 'text', text: dp.text || '', media: mids.map(mv).filter(Boolean), tree: tree.map((c) => ({ text: c.text || '', media: (c.mediaIds || []).map(mv).filter(Boolean) })) };
    }
    sendHtml(res, 200, ui.composePage({ user, accounts: SnsAccounts.listForUser(user.id), csrf: token, aiAvail: ai.available(), draft, sub: Subscriptions.get(user.id) }));
    return true;
  }
  if (pathname === '/service/app/posts' && method === 'POST') {
    if (!csrf.verify(sessionToken, req.headers['x-csrf'])) { sendJson(res, 403, { error: '操作の有効期限が切れました。ページを再読み込みしてください。' }); return true; }
    let b = null;
    try { b = JSON.parse(await readRaw(req, 300_000)); } catch { b = null; }
    // 下書きを開いて保存し直す場合：元の下書きがまだ本人の下書きのままかを、新しい投稿を作る前に確かめて取り消す。
    // すでに使われていれば断る（2つのタブで開いた・通信エラーの後にもう一度押した、などで二重に予約・投稿しないように）。
    // 新しい投稿を作れなかったときは、元の下書きを戻す
    let replaced = null;
    if (b && typeof b === 'object' && b.replace_draft) {
      const old = ScheduledPosts.get(String(b.replace_draft));
      if (!old || old.user_id !== user.id || old.status !== 'draft' || !ScheduledPosts.cancel(old.id, user.id)) {
        sendJson(res, 409, { error: 'この下書きは、すでに保存・投稿・削除されているため、保存し直せません。カレンダーでご確認ください。' });
        return true;
      }
      replaced = old.id;
    }
    let r = null;
    try { r = apiV1.createFromBody(user.id, b, { via: 'screen' }); } finally { if (replaced && (!r || r.status !== 201)) ScheduledPosts.restoreDraft(replaced, user.id); }
    sendJson(res, r.status, r.body);
    return true;
  }
  if (pathname === '/service/app/calendar' && method === 'GET') {
    const mq = url.searchParams.get('m');
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(mq || '') ? mq : new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
    const [from, to] = core.jstMonthBounds(`${month}-15T00:00:00+09:00`);
    sendHtml(res, 200, ui.calendarPage({ user, month, posts: ScheduledPosts.listBetween(user.id, from, to), drafts: ScheduledPosts.listDrafts(user.id), csrf: token, flash: flashOf(url.searchParams.get('f')) }));
    return true;
  }
  const publishMatch = pathname.match(/^\/service\/app\/post\/([a-f0-9]+)\/publish$/);
  if (publishMatch && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    const now = body.mode === 'now';
    const at = now ? new Date(Date.now() + 1000).toISOString() : core.jstLocalToIso(body.at);
    const r = at ? core.promoteDraft({ userId: user.id, postId: publishMatch[1], scheduledAtIso: at, via: 'screen' }) : { ok: false, error: '投稿日時の形式が正しくありません。' };
    if (!r.ok) {
      const [from, to] = core.jstMonthBounds(new Date().toISOString());
      sendHtml(res, 400, ui.calendarPage({ user, month: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7), posts: ScheduledPosts.listBetween(user.id, from, to), drafts: ScheduledPosts.listDrafts(user.id), csrf: token, flash: { type: 'error', text: r.error } }));
      return true;
    }
    if (now) setTimeout(() => scheduler.tick().catch(() => {}), 1500);
    redirect(res, `/service/app/calendar?f=${now ? 'now' : 'scheduled'}`);
    return true;
  }
  const discMatch = pathname.match(/^\/service\/app\/account\/([a-f0-9]+)\/disconnect$/);
  if (discMatch && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    // YouTube は、行を消す前に Google へトークンの取り消しを送る（失敗しても消す。結果は待たない：lib/sns/disconnect.js）
    const acc = SnsAccounts.getForUser(discMatch[1], user.id);
    if (acc) snsDisconnect.removeAccount(acc);
    redirect(res, '/service/app?f=disconnected');
    return true;
  }
  // SNS側の操作で連携を削除したことの知らせを閉じる
  const noticeMatch = pathname.match(/^\/service\/app\/notice\/([a-f0-9]+)\/dismiss$/);
  if (noticeMatch && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    metaDeletion.Notices.dismiss(noticeMatch[1], user.id);
    redirect(res, '/service/app');
    return true;
  }

  // SNS連携（OAuth）
  // 審査（SNS_APPROVED）の前のSNSは、テスト利用の利用者だけが連携を始められる。画面にボタンが無くても、URLを直接開いて始められないよう、ここでも判定する
  const connectMatch = pathname.match(/^\/service\/connect\/([a-z]+)$/);
  if (connectMatch && registry.get(connectMatch[1]) && method === 'GET') {
    if (!Subscriptions.isActive(user.id)) { dashboard(403, { type: 'error', text: 'ご契約が有効でないため、連携できません。' }); return true; }
    if (registry.get(connectMatch[1]).isConfigured() && !core.connectMode(connectMatch[1], Subscriptions.get(user.id))) {
      dashboard(403, { type: 'error', text: core.NOT_APPROVED_ERROR }); return true;
    }
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
  // プランの変更：通常→30件（すぐ切り替え）／30件→通常（次回の更新日から。連携が10件を超えていれば断る）／予約の取り消し（30件のまま）
  if (pathname === '/service/billing/plan' && method === 'POST') {
    const body = await needCsrf(); if (!body) return true;
    try {
      const r = await billing.changePlan(user.id, body.plan === 'agency' ? 'agency' : 'standard');
      if (!r.ok) { dashboard(400, { type: 'error', text: r.error }); return true; }
      const nowSub = Subscriptions.get(user.id);
      const f = r.released ? 'plan_released' : r.scheduled ? 'plan_standard_scheduled' : r.unchanged ? '' : (r.plan === 'agency' ? (nowSub && nowSub.status === 'trialing' ? 'plan_agency_trial' : 'plan_agency') : 'plan_standard');
      redirect(res, f ? `/service/app?f=${f}` : '/service/app');
    } catch (e) {
      console.error('[plan change]', e.message);
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
