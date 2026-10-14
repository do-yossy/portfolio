'use strict';
// MCPサーバー（Streamable HTTP の JSON 応答のみ）。AIアシスタントが、利用者のAPIキーで投稿を作れるようにする。
// 認証・上限・検証は REST API（/api/v1）と同じ。POST /mcp に JSON-RPC を送る。
const core = require('./service-core');
const scheduler = require('./sns/scheduler');
const { ApiKeys, SnsAccounts, ScheduledPosts } = require('./service-store');
const { postView } = require('./api-v1');
const { createLimiter } = require('./ratelimit');

const limiter = createLimiter({ max: 60, windowMs: 60 * 1000 });
const badLimiter = createLimiter({ max: 20, windowMs: 15 * 60 * 1000 });

const TOOLS = [
  { name: 'list_accounts', description: '連携済みのSNSアカウントの一覧（IDを投稿に使う）', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_post', description: '投稿を作る。category は text／image／video／tree。now=true で即時、scheduled_at（ISO 8601）で予約、draft=true で下書き。画像・動画は先にAPIでアップロードしたmedia_idsを指定する。',
    inputSchema: { type: 'object', required: ['category', 'account_ids'], properties: {
      category: { type: 'string', enum: ['text', 'image', 'video', 'tree'] }, text: { type: 'string' },
      account_ids: { type: 'array', items: { type: 'string' } }, captions: { type: 'object', description: 'アカウントIDごとの本文（任意）' },
      media_ids: { type: 'array', items: { type: 'string' } }, tree: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, media_ids: { type: 'array', items: { type: 'string' } } } } },
      scheduled_at: { type: 'string' }, now: { type: 'boolean' }, draft: { type: 'boolean' } } } },
  { name: 'list_posts', description: '投稿の一覧（status で絞り込み：draft／pending／posted／failed／cancelled）', inputSchema: { type: 'object', properties: { status: { type: 'string' } } } },
  { name: 'publish_draft', description: '下書きを予約または即時投稿にする', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, now: { type: 'boolean' }, scheduled_at: { type: 'string' } } } },
  { name: 'delete_post', description: '予約・下書きを取り消す', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
];

function isoOrNull(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }

function callTool(userId, name, a = {}) {
  switch (name) {
    case 'list_accounts':
      return { accounts: SnsAccounts.listForUser(userId).map((x) => ({ id: x.id, platform: x.platform, handle: x.handle, status: x.status })) };
    case 'create_post': {
      const ids = [].concat(a.account_ids || []).map(String);
      const caps = a.captions && typeof a.captions === 'object' ? a.captions : {};
      const targets = ids.map((accountId) => ({ accountId, caption: caps[accountId] !== undefined ? caps[accountId] : a.text, options: {} }));
      const tree = (Array.isArray(a.tree) ? a.tree : []).map((c) => ({ text: c && c.text, mediaIds: (c && c.media_ids) || [] }));
      let at = null;
      if (a.now === true) at = new Date(Date.now() + 1000).toISOString();
      else if (a.scheduled_at) { at = isoOrNull(a.scheduled_at); if (!at) throw new Error('scheduled_at はISO 8601形式で指定してください。'); }
      const r = core.createPost({ userId, category: String(a.category || 'text'), targets, mediaIds: a.media_ids || [], tree, scheduledAtIso: at, draft: a.draft === true });
      if (!r.ok) throw new Error(r.error);
      if (a.now === true && a.draft !== true) setTimeout(() => scheduler.tick().catch(() => {}), 1500);
      return { posts: r.ids.map((id) => postView(ScheduledPosts.listForUser(userId, 1000).find((p) => p.id === id))) };
    }
    case 'list_posts': {
      let rows = ScheduledPosts.listForUser(userId, 100);
      if (a.status) rows = rows.filter((p) => p.status === a.status);
      return { posts: rows.map(postView) };
    }
    case 'publish_draft': {
      const at = a.now === true ? new Date(Date.now() + 1000).toISOString() : (a.scheduled_at ? isoOrNull(a.scheduled_at) : null);
      const r = core.promoteDraft({ userId, postId: String(a.id || ''), scheduledAtIso: at });
      if (!r.ok) throw new Error(r.error);
      if (a.now === true) setTimeout(() => scheduler.tick().catch(() => {}), 1500);
      return postView(ScheduledPosts.listForUser(userId, 1000).find((p) => p.id === a.id));
    }
    case 'delete_post':
      if (!ScheduledPosts.cancel(String(a.id || ''), userId)) throw new Error('取り消せるのは、予約中または下書きの投稿だけです。');
      return { id: a.id, status: 'cancelled' };
    default:
      return undefined;
  }
}

function readBody(req, limit = 500_000) {
  return new Promise((resolve) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { resolve(null); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
}

async function handle({ req, res, method, pathname }) {
  if (pathname !== '/mcp') return false;
  if (method !== 'POST') { send(res, 405, { error: 'POST のみ対応しています。' }); return true; }
  const ip = String(req.headers['fly-client-ip'] || req.socket.remoteAddress || '');
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
  if (!badLimiter.allow(ip)) { send(res, 429, { error: 'too many requests' }); return true; }
  const userId = m ? ApiKeys.authenticate(m[1]) : null;
  if (!userId) { badLimiter.fail(ip); send(res, 401, { error: 'APIキーが正しくありません。' }); return true; }
  if (!limiter.allow(userId)) { send(res, 429, { error: 'リクエストが多すぎます。' }); return true; }
  limiter.fail(userId);
  const msg = await readBody(req);
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) { send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return true; }
  const reply = (result) => send(res, 200, { jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => send(res, 200, { jsonrpc: '2.0', id: msg.id, error: { code, message } });
  if (msg.id === undefined) { send(res, 202); return true; } // 通知には応答しない
  switch (msg.method) {
    case 'initialize':
      reply({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'sns-scheduler', version: '1.0.0' } });
      break;
    case 'ping': reply({}); break;
    case 'tools/list': reply({ tools: TOOLS }); break;
    case 'tools/call': {
      const p = msg.params || {};
      if (!TOOLS.some((t) => t.name === p.name)) { fail(-32602, `Unknown tool: ${p.name}`); break; }
      try {
        const out = callTool(userId, p.name, p.arguments || {});
        reply({ content: [{ type: 'text', text: JSON.stringify(out) }] });
      } catch (e) {
        reply({ isError: true, content: [{ type: 'text', text: e.message }] });
      }
      break;
    }
    default: fail(-32601, `Method not found: ${msg.method}`);
  }
  return true;
}

module.exports = { handle, TOOLS };
