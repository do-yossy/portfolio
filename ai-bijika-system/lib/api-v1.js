'use strict';
// 利用者ごとのAPIキーで使える REST API（/api/v1）。画面と同じ検証（契約・上限・SNSごとの条件）を通る。
//   GET    /api/v1/accounts              連携済みのSNS
//   POST   /api/v1/media                 画像・動画のアップロード（本文にファイルをそのまま送る）
//   POST   /api/v1/posts                 投稿の作成（即時・予約・下書き）
//   GET    /api/v1/posts                 投稿の一覧（?status=draft|pending|posted|failed|cancelled）
//   GET    /api/v1/posts/{id}            投稿の確認
//   POST   /api/v1/posts/{id}/publish    下書きを予約・投稿にする
//   DELETE /api/v1/posts/{id}            予約・下書きの取り消し
const core = require('./service-core');
const scheduler = require('./sns/scheduler');
const mediaLib = require('./media');
const registry = require('./sns');
const ai = require('./ai');
const aiAuto = require('./ai-auto');
const { ApiKeys, SnsAccounts, ScheduledPosts, MediaAssets, Subscriptions, AiJobs, AutoRules } = require('./service-store');
const { createLimiter } = require('./ratelimit');

const keyLimiter = createLimiter({ max: 60, windowMs: 60 * 1000 });
const badKeyLimiter = createLimiter({ max: 20, windowMs: 15 * 60 * 1000 });

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readJson(req, limit = 500_000) {
  return new Promise((resolve) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { resolve(null); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

function postView(p) {
  let mediaIds = []; try { mediaIds = JSON.parse(p.media_ids || '[]'); } catch { mediaIds = []; }
  let tree = []; try { tree = JSON.parse(p.tree || '[]'); } catch { tree = []; }
  return {
    id: p.id, group_id: p.group_id || '', status: p.status, category: p.category || 'text',
    account: { id: p.account_id, platform: p.platform || '', handle: p.handle || '' },
    text: p.text, media_ids: mediaIds, tree, scheduled_at: p.scheduled_at, posted_at: p.posted_at || '',
    external_id: p.external_id || '', error: p.last_error || '',
  };
}

function ruleView(r) {
  return { id: r.id, account_id: r.account_id, theme: r.theme, tone: r.tone, with_image: !!r.with_image, hour_jst: r.hour_jst, mode: r.mode, enabled: !!r.enabled, last_run_day: r.last_day, last_error: r.last_error };
}

async function handle({ req, res, method, pathname, url }) {
  if (!pathname.startsWith('/api/v1/')) return false;
  const ip = String(req.headers['fly-client-ip'] || req.socket.remoteAddress || '');
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
  if (!badKeyLimiter.allow(ip)) { send(res, 429, { error: '試行回数が多すぎます。しばらくしてからお試しください。' }); return true; }
  const userId = m ? ApiKeys.authenticate(m[1]) : null;
  if (!userId) { badKeyLimiter.fail(ip); send(res, 401, { error: 'APIキーが正しくありません。Authorization: Bearer <APIキー> を指定してください。' }); return true; }
  if (!keyLimiter.allow(userId)) { send(res, 429, { error: 'リクエストが多すぎます。1分あたり60回までです。' }); return true; }
  keyLimiter.fail(userId);

  if (pathname === '/api/v1/accounts' && method === 'GET') {
    send(res, 200, { accounts: SnsAccounts.listForUser(userId).map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, status: a.status })) });
    return true;
  }

  if (pathname === '/api/v1/media' && method === 'POST') {
    if (!Subscriptions.isActive(userId)) { send(res, 403, { error: 'ご契約が有効ではありません。' }); return true; }
    const r = await mediaLib.saveUpload({ userId, req, contentLength: parseInt(req.headers['content-length'] || '0', 10) });
    if (!r.ok) { send(res, 400, { error: r.error }); return true; }
    send(res, 201, { id: r.media.id, kind: r.media.kind, mime: r.media.mime, size: r.media.size });
    return true;
  }

  if (pathname === '/api/v1/posts' && method === 'POST') {
    const b = await readJson(req);
    if (!b || typeof b !== 'object') { send(res, 400, { error: 'JSONの形式が正しくありません。' }); return true; }
    const ids = [].concat(b.account_ids || []).map(String);
    const captions = b.captions && typeof b.captions === 'object' ? b.captions : {};
    const targets = ids.map((accountId) => ({ accountId, caption: captions[accountId] !== undefined ? captions[accountId] : b.text, options: (b.options && b.options[accountId]) || {} }));
    const draft = b.draft === true;
    const immediate = b.now === true;
    let at = null;
    if (immediate) at = new Date(Date.now() + 1000).toISOString();
    else if (b.scheduled_at) { at = new Date(b.scheduled_at).toString() === 'Invalid Date' ? null : new Date(b.scheduled_at).toISOString(); if (!at) { send(res, 400, { error: 'scheduled_at はISO 8601形式で指定してください。' }); return true; } }
    const tree = (Array.isArray(b.tree) ? b.tree : []).map((c) => ({ text: c && c.text, mediaIds: (c && c.media_ids) || [] }));
    const r = core.createPost({ userId, category: String(b.category || (tree.length ? 'tree' : 'text')), targets, mediaIds: b.media_ids || [], tree, scheduledAtIso: at, draft });
    if (!r.ok) { send(res, 400, { error: r.error }); return true; }
    if (immediate && !draft) setTimeout(() => scheduler.tick().catch(() => {}), 1500);
    send(res, 201, { group_id: r.groupId, posts: r.ids.map((id) => ScheduledPosts.get(id)).map((p) => postView(p)) });
    return true;
  }

  if (pathname === '/api/v1/posts' && method === 'GET') {
    const status = url.searchParams.get('status');
    let rows = ScheduledPosts.listForUser(userId, 100);
    if (status) rows = rows.filter((p) => p.status === status);
    send(res, 200, { posts: rows.map(postView) });
    return true;
  }

  const one = pathname.match(/^\/api\/v1\/posts\/([a-f0-9]+)(\/publish)?$/);
  if (one) {
    const row = ScheduledPosts.listForUser(userId, 1000).find((p) => p.id === one[1]);
    if (!row) { send(res, 404, { error: '投稿が見つかりません。' }); return true; }
    if (!one[2] && method === 'GET') { send(res, 200, postView(row)); return true; }
    if (!one[2] && method === 'DELETE') {
      if (!ScheduledPosts.cancel(row.id, userId)) { send(res, 409, { error: '取り消せるのは、予約中または下書きの投稿だけです。' }); return true; }
      send(res, 200, { id: row.id, status: 'cancelled' });
      return true;
    }
    if (one[2] && method === 'POST') {
      const b = (await readJson(req)) || {};
      const r = core.promoteDraft({ userId, postId: row.id, scheduledAtIso: b.now === true ? new Date(Date.now() + 1000).toISOString() : (b.scheduled_at ? new Date(b.scheduled_at).toISOString() : null) });
      if (!r.ok) { send(res, 400, { error: r.error }); return true; }
      if (b.now === true) setTimeout(() => scheduler.tick().catch(() => {}), 1500);
      send(res, 200, postView(ScheduledPosts.listForUser(userId, 1000).find((p) => p.id === row.id)));
      return true;
    }
  }

  // ── AIによる生成 ──
  if (pathname.startsWith('/api/v1/ai/') || pathname === '/api/v1/auto-rules' || pathname.startsWith('/api/v1/auto-rules/')) {
    if (!Subscriptions.isActive(userId)) { send(res, 403, { error: 'ご契約が有効ではありません。' }); return true; }
    try {
      if (pathname === '/api/v1/ai/text' && method === 'POST') {
        const b = (await readJson(req)) || {};
        send(res, 200, { text: await ai.generateText({ userId, theme: b.theme, tone: b.tone, platform: b.platform, instruction: b.instruction }) });
        return true;
      }
      if (pathname === '/api/v1/ai/image' && method === 'POST') {
        const b = (await readJson(req)) || {};
        const m = await ai.generateImage({ userId, prompt: b.prompt });
        send(res, 201, { id: m.id, kind: m.kind, mime: m.mime, size: m.size });
        return true;
      }
      if (pathname === '/api/v1/ai/video' && method === 'POST') {
        const b = (await readJson(req)) || {};
        const op = await ai.startVideo({ userId, prompt: b.prompt });
        const id = AiJobs.create({ userId, kind: 'video', prompt: String(b.prompt).slice(0, 1000), operation: op });
        send(res, 202, { job_id: id, status: 'running' });
        return true;
      }
      const job = pathname.match(/^\/api\/v1\/ai\/jobs\/([a-f0-9]+)$/);
      if (job && method === 'GET') {
        const j = AiJobs.get(job[1], userId);
        if (!j) { send(res, 404, { error: 'ジョブが見つかりません。' }); return true; }
        send(res, 200, { job_id: j.id, status: j.status, media_id: j.media_id || undefined, error: j.error || undefined });
        return true;
      }
      if (pathname === '/api/v1/auto-rules' && method === 'GET') {
        send(res, 200, { rules: AutoRules.listForUser(userId).map(ruleView) });
        return true;
      }
      if (pathname === '/api/v1/auto-rules' && method === 'POST') {
        const b = (await readJson(req)) || {};
        const mode = b.mode === 'auto' ? 'auto' : 'draft';
        if (mode === 'auto' && b.confirm_auto !== true) { send(res, 400, { error: '完全自動(auto)は、AIが作った内容を確認せずに投稿します。内容を理解したうえで confirm_auto:true を指定してください。' }); return true; }
        const args = { userId, accountId: String(b.account_id || ''), theme: b.theme, withImage: b.with_image === true, hourJst: Number(b.hour_jst), mode };
        const problem = aiAuto.validateRule(args);
        if (problem) { send(res, 400, { error: problem }); return true; }
        const id = AutoRules.create({ ...args, tone: String(b.tone || '').slice(0, 100), theme: String(b.theme).trim() });
        send(res, 201, ruleView(AutoRules.get(id, userId)));
        return true;
      }
      const rule = pathname.match(/^\/api\/v1\/auto-rules\/([a-f0-9]+)$/);
      if (rule && method === 'DELETE') {
        if (!AutoRules.remove(rule[1], userId)) { send(res, 404, { error: 'ルールが見つかりません。' }); return true; }
        send(res, 200, { id: rule[1], deleted: true });
        return true;
      }
      if (rule && method === 'PATCH') {
        const b = (await readJson(req)) || {};
        if (!AutoRules.setEnabled(rule[1], userId, b.enabled === true)) { send(res, 404, { error: 'ルールが見つかりません。' }); return true; }
        send(res, 200, ruleView(AutoRules.get(rule[1], userId)));
        return true;
      }
    } catch (e) {
      if (e instanceof ai.AiError) { send(res, 400, { error: e.message }); return true; }
      throw e;
    }
  }

  send(res, 404, { error: 'そのAPIはありません。' });
  return true;
}

module.exports = { handle, postView };
