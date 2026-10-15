'use strict';
// MCPサーバー（Streamable HTTP の JSON 応答のみ）。AIアシスタントが、利用者のAPIキーで投稿を作れるようにする。
// 認証・上限・検証は REST API（/api/v1）と同じ。POST /mcp に JSON-RPC を送る。
const core = require('./service-core');
const scheduler = require('./sns/scheduler');
const { ApiKeys, SnsAccounts, ScheduledPosts } = require('./service-store');
const { postView, uploadUrlView, createFromBody } = require('./api-v1');
const fetchMedia = require('./fetch-media');
const ai = require('./ai');
const { AiJobs, UploadTickets } = require('./service-store');
const { createLimiter } = require('./ratelimit');
const oauth = require('./oauth');

const limiter = createLimiter({ max: 60, windowMs: 60 * 1000 });
const badLimiter = createLimiter({ max: 20, windowMs: 15 * 60 * 1000 });

const TOOLS = [
  { name: 'list_accounts', description: '連携済みのSNSアカウントの一覧（IDを投稿に使う）', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_account_info', description: 'ご契約の状態・上限・今月や今日の利用状況を確認する', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_post', description: '投稿を作る。category は text／image／video／tree。now=true で即時、scheduled_at（ISO 8601）で予約、draft=true で下書き。TikTokへは下書き（draft=true）にだけでき、投稿は利用者がサービスの画面で行う。画像・動画は先にAPIでアップロードしたmedia_idsを指定する。',
    inputSchema: { type: 'object', required: ['category', 'account_ids'], properties: {
      category: { type: 'string', enum: ['text', 'image', 'video', 'tree'] }, text: { type: 'string' },
      account_ids: { type: 'array', items: { type: 'string' } }, captions: { type: 'object', description: 'アカウントIDごとの本文（任意）' },
      media_ids: { type: 'array', items: { type: 'string' } }, tree: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, media_ids: { type: 'array', items: { type: 'string' } } } } },
      options: { type: 'object', description: 'アカウントIDごとの設定。TikTokは {"privacy_level": 利用者が選んだ公開範囲, "disable_comment", "disable_duet", "disable_stitch"（true で禁止）, "commercial_own", "commercial_paid", "auto_add_music"（写真の投稿に音楽を自動で付けるか。初期値は付けない）}（公開範囲は必ず利用者に選んでもらう）。YouTubeは {"privacy": "public"|"unlisted"|"private", "made_for_kids": true|false}（必須。必ず利用者に確認して指定する）。TikTokの公開範囲は、サービスがTikTokの投稿の監査（Audit）を通るまで SELF_ONLY だけ' },
      scheduled_at: { type: 'string' }, now: { type: 'boolean' }, draft: { type: 'boolean' } } } },
  { name: 'list_posts', description: '投稿の一覧（status で絞り込み：draft／pending／posted／failed／cancelled）', inputSchema: { type: 'object', properties: { status: { type: 'string' } } } },
  { name: 'publish_draft', description: '下書きを予約または即時投稿にする（TikTokの下書きは不可。利用者がサービスのカレンダーから「投稿を作る」画面で開き、設定を選び直して投稿する）', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, now: { type: 'boolean' }, scheduled_at: { type: 'string' } } } },
  { name: 'delete_post', description: '予約・下書きを取り消す', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'create_upload_url', description: '画像・動画をアップロードするための一時URLを発行する（15分・1回だけ）。ファイルをPUTすると id が返り、create_post の media_ids に使える', inputSchema: { type: 'object', properties: {} } },
  { name: 'import_media_from_url', description: 'URLから画像・動画を取り込む（チャットの添付ファイルのURL、Googleドライブの共有リンクなど）。戻り値のidを media_ids に使う', inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } } },
  { name: 'ai_generate_text', description: 'AIで投稿文を作る（作った文は create_post の text に使う）', inputSchema: { type: 'object', required: ['theme'], properties: { theme: { type: 'string' }, tone: { type: 'string' }, platform: { type: 'string' }, instruction: { type: 'string' } } } },
  { name: 'ai_generate_image', description: 'AIで画像（JPEG）を作る。戻り値のidを create_post の media_ids に使う', inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } } },
  { name: 'ai_start_video', description: 'AIで動画を作り始める（数分かかる）。job_id を ai_video_status で確認する', inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } } },
  { name: 'ai_video_status', description: '動画生成の状態を確認する。done になったら media_id を create_post に使う', inputSchema: { type: 'object', required: ['job_id'], properties: { job_id: { type: 'string' } } } },
];

function isoOrNull(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }

function accountInfo(userId) {
  const st = require('./service-store');
  const sub = st.Subscriptions.get(userId) || {};
  const nowIso = new Date().toISOString();
  const [mf, mt] = core.jstMonthBounds(nowIso);
  const day = ai.day();
  return {
    subscription: { status: sub.status || 'none', current_period_end: sub.current_period_end || '', cancel_at_period_end: !!sub.cancel_at_period_end },
    limits: { accounts: core.LIMITS.maxAccounts, pending: core.LIMITS.maxPending, per_day: core.LIMITS.maxPerDay, x_per_month: core.LIMITS.xPerMonth, ai_per_day: ai.limits() },
    usage: { accounts: st.SnsAccounts.countForUser(userId), pending: st.ScheduledPosts.countPending(userId), drafts: st.ScheduledPosts.countDrafts(userId),
      x_this_month: st.ScheduledPosts.countXUnits(userId, mf, mt), ai_today: { text: st.AiUsage.used(userId, day, 'text'), image: st.AiUsage.used(userId, day, 'image'), video: st.AiUsage.used(userId, day, 'video') } },
    ai_available: ai.available(),
  };
}

// 使えるツールだけを出す（AIの生成は、運営者が設定したものだけ）
function liveTools() {
  const av = ai.available();
  const need = { ai_generate_text: av.text, ai_generate_image: av.image, ai_start_video: av.video, ai_video_status: av.video };
  return TOOLS.filter((t) => need[t.name] === undefined || need[t.name]);
}

async function callTool(userId, name, a = {}) {
  switch (name) {
    case 'list_accounts':
      return { accounts: SnsAccounts.listForUser(userId).map((x) => ({ id: x.id, platform: x.platform, handle: x.handle, status: x.status })) };
    case 'get_account_info': return accountInfo(userId);
    case 'create_post': {
      // REST API と同じ処理（SNSごとの本文・設定、日時の検証）
      const r = createFromBody(userId, a);
      if (r.status !== 201) throw new Error(r.body.error);
      return r.body;
    }
    case 'list_posts': {
      let rows = ScheduledPosts.listForUser(userId, 100);
      if (a.status) rows = rows.filter((p) => p.status === a.status);
      return { posts: rows.map(postView) };
    }
    case 'publish_draft': {
      let at = null;
      if (a.now === true) at = new Date(Date.now() + 1000).toISOString();
      else if (a.scheduled_at !== undefined) { at = isoOrNull(a.scheduled_at); if (!at) throw new Error('scheduled_at はISO 8601形式で指定してください。'); }
      const r = core.promoteDraft({ userId, postId: String(a.id || ''), scheduledAtIso: at });
      if (!r.ok) throw new Error(r.error);
      if (a.now === true) setTimeout(() => scheduler.tick().catch(() => {}), 1500);
      return postView(ScheduledPosts.listForUser(userId, 1000).find((p) => p.id === a.id));
    }
    case 'delete_post':
      if (!ScheduledPosts.cancel(String(a.id || ''), userId)) throw new Error('取り消せるのは、予約中または下書きの投稿だけです。');
      return { id: a.id, status: 'cancelled' };
    case 'create_upload_url':
      if (!require('./service-store').Subscriptions.isActive(userId)) throw new Error('ご契約が有効ではありません。');
      return uploadUrlView(UploadTickets.create(userId));
    case 'import_media_from_url': {
      if (!require('./service-store').Subscriptions.isActive(userId)) throw new Error('ご契約が有効ではありません。');
      const m = await fetchMedia.importFromUrl({ userId, url: a.url });
      return { id: m.id, kind: m.kind, mime: m.mime, size: m.size };
    }
    case 'ai_generate_text': return { text: await ai.generateText({ userId, theme: a.theme, tone: a.tone, platform: a.platform, instruction: a.instruction }) };
    case 'ai_generate_image': { const m = await ai.generateImage({ userId, prompt: a.prompt }); return { id: m.id, kind: m.kind, size: m.size }; }
    case 'ai_start_video': {
      const op = await ai.startVideo({ userId, prompt: a.prompt });
      return { job_id: AiJobs.create({ userId, kind: 'video', prompt: String(a.prompt).slice(0, 1000), operation: op }), status: 'running' };
    }
    case 'ai_video_status': {
      const j = AiJobs.get(String(a.job_id || ''), userId);
      if (!j) throw new Error('ジョブが見つかりません。');
      return { job_id: j.id, status: j.status, media_id: j.media_id || undefined, error: j.error || undefined };
    }
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
  // APIキー（sqk_）または OAuth のアクセストークン（sqa_）
  const a = oauth.authenticateRequest(req, badLimiter, ApiKeys);
  if (a.status === 429) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', ...oauth.challengeHeader() });
    res.end(JSON.stringify({ error: 'too_many_requests', error_description: a.error }));
    return true;
  }
  if (!a.userId) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', ...oauth.challengeHeader() });
    res.end(JSON.stringify({ error: 'invalid_token', error_description: 'ログインして接続を許可するか、APIキーを指定してください。' }));
    return true;
  }
  const userId = a.userId;
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
    case 'tools/list': reply({ tools: liveTools() }); break;
    case 'tools/call': {
      const p = msg.params || {};
      if (!liveTools().some((t) => t.name === p.name)) { fail(-32602, `Unknown tool: ${p.name}`); break; }
      try {
        const out = await callTool(userId, p.name, p.arguments || {});
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
