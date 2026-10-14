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
const ai = require('./ai');
const aiAuto = require('./ai-auto');

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

  if (pathname === '/service/docs/skill.md' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(fs.readFileSync(path.join(__dirname, '..', 'skill', 'SKILL.md')));
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
  if (pathname === '/service/checkout' && method === 'GET') {
    if (!salesOpen) { redirect(res, '/service'); return true; }
    if (hasOpenSubscription()) { redirect(res, '/service/app'); return true; }
    sendHtml(res, 200, ui.checkoutPage({ user, trialDays: core.trialFor(user.id), csrf: token }));
    return true;
  }
  if (pathname === '/service/checkout' && method === 'POST') {
    if (!salesOpen) { redirect(res, '/service'); return true; }
    if (hasOpenSubscription()) { redirect(res, '/service/app'); return true; }
    const body = await readForm(req);
    if (!csrf.verify(sessionToken, body.csrf)) { sendHtml(res, 403, ui.checkoutPage({ user, trialDays: core.trialFor(user.id), csrf: token, error: '操作の有効期限が切れました。もう一度お試しください。' })); return true; }
    if (body.agree !== '1') { sendHtml(res, 400, ui.checkoutPage({ user, trialDays: core.trialFor(user.id), csrf: token, error: '内容への同意にチェックを入れてください。' })); return true; }
    try {
      const cur = Subscriptions.get(user.id);
      Subscriptions.upsert(user.id, { agreed_at: new Date().toISOString(), agreed_version: core.TERMS_VERSION });
      // 同意の記録（証拠）：その時点で示した法務文書の本文の控えと、最終確認画面の条件
      const docs = {};
      for (const f of core.LEGAL_FILES) { try { docs[f] = core.legalMarkdown(f); } catch { /* 文書が無い場合は控えなし */ } }
      consent.record({ userId: user.id, email: user.email, kind: 'checkout', termsVersion: core.TERMS_VERSION, docs, req,
        detail: { price: core.priceYen(), trialDays: core.trialFor(user.id), limits: { accounts: core.LIMITS.maxAccounts, pending: core.LIMITS.maxPending, perDay: core.LIMITS.maxPerDay, xPerMonth: core.LIMITS.xPerMonth } } });
      const checkoutUrl = await billing.createCheckoutSession({ userId: user.id, email: user.email, customerId: cur && cur.stripe_customer_id, trialDays: core.trialFor(user.id) });
      redirect(res, checkoutUrl, {}, 303);
    } catch (e) {
      console.error('[checkout]', e.message);
      sendHtml(res, 502, ui.checkoutPage({ user, trialDays: core.trialFor(user.id), csrf: token, error: '決済ページの準備に失敗しました。時間をおいてもう一度お試しください。' }));
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
    sendHtml(res, 200, ui.composePage({ user, accounts: SnsAccounts.listForUser(user.id), csrf: token, aiAvail: ai.available(), draft }));
    return true;
  }
  if (pathname === '/service/app/posts' && method === 'POST') {
    if (!csrf.verify(sessionToken, req.headers['x-csrf'])) { sendJson(res, 403, { error: '操作の有効期限が切れました。ページを再読み込みしてください。' }); return true; }
    let b = null;
    try { b = JSON.parse(await readRaw(req, 300_000)); } catch { b = null; }
    const r = apiV1.createFromBody(user.id, b, { via: 'screen' });
    // 下書きを開いて保存し直した場合は、元の下書きを削除する（同じ内容が二重に残らないように）
    if (r.status === 201 && b && b.replace_draft) {
      const old = ScheduledPosts.get(String(b.replace_draft));
      if (old && old.user_id === user.id && old.status === 'draft') ScheduledPosts.cancel(old.id, user.id);
    }
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
