'use strict';
// 月額SNS自動投稿サービスの業務ルール（画面・HTTPには依存しない）
const { Subscriptions, SnsAccounts, OAuthStates, ScheduledPosts, MediaAssets } = require('./service-store');
const box = require('./crypto-box');
const registry = require('./sns');

const LIMITS = { maxAccounts: 5, maxPending: 100, maxPerDay: 30 };
const MAX_DAYS_AHEAD = 90;
const JST_OFFSET_MS = 9 * 3600 * 1000;

const serviceName = () => process.env.SERVICE_NAME || 'ミチシルベ 自動投稿';
const priceYen = () => Number(process.env.SERVICE_PRICE_JPY || 1000);
const TERMS_VERSION = '2026-10-13';

const contactEmail = () => {
  const e = String(process.env.SERVICE_CONTACT_EMAIL || '').trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e) ? e : '';
};
// 販売を開始してよいか。Stripe・連絡先・SNS連携の設定に加えて、運営者が SERVICE_OPEN=true で明示した場合だけ開く
// （Metaや Xの審査が終わる前に、連携できないまま契約する人が出ないようにするため）
function salesOpen() {
  const billing = require('./billing');
  return process.env.SERVICE_OPEN === 'true' && billing.isConfigured() && !!contactEmail()
    && snsEnabled() && registry.list().some((p) => p.isConfigured());
}

function snsEnabled() {
  return !!box.keyFromEnv();
}
function redirectUriFor(platform) {
  const base = String(process.env.SERVICE_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/service/oauth/callback/${platform}`;
}

// 入力欄（datetime-local：日本時間）を ISO(UTC) に直す。不正なら null
function jstLocalToIso(s) {
  const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}:00+09:00`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
function jstDayBounds(iso) {
  const day = new Date(Date.parse(iso) + JST_OFFSET_MS).toISOString().slice(0, 10);
  const start = Date.parse(`${day}T00:00:00+09:00`);
  return [new Date(start).toISOString(), new Date(start + 24 * 3600 * 1000).toISOString()];
}
function formatJst(iso) {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + JST_OFFSET_MS);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function formatJstShort(iso) {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + JST_OFFSET_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const CATEGORIES = ['text', 'image', 'video', 'tree'];
const MAX_DRAFTS = 100;
const mediaOf = (m) => ({ id: m.id, kind: m.kind, mime: m.mime, size: m.size });

// 投稿を作る（選んだSNSアカウントごとに1件。まとめて group_id でひも付ける）。
//   category: text / image / video / tree
//   targets: [{ accountId, caption, options }]（SNSごとに本文・設定を変えられる）
//   mediaIds: image は複数、video は1つ。tree: [{ text, mediaIds }]（X・Threads のみ）
//   draft: true なら下書き（SNSへは送らない。日時は任意）
function createPost({ userId, category, targets, mediaIds, tree, scheduledAtIso, draft, nowMs = Date.now() }) {
  if (!CATEGORIES.includes(category)) return { ok: false, error: '投稿の種類が正しくありません。' };
  if (!Array.isArray(targets) || !targets.length) return { ok: false, error: '投稿先のSNSを選んでください。' };
  if (!Subscriptions.isActive(userId)) return { ok: false, error: 'ご契約が有効でないため、予約できません。' };
  let at = null;
  if (!draft || scheduledAtIso) {
    if (!scheduledAtIso) return { ok: false, error: '投稿日時の形式が正しくありません。' };
    at = Date.parse(scheduledAtIso);
    if (Number.isNaN(at)) return { ok: false, error: '投稿日時の形式が正しくありません。' };
    if (!draft && at < nowMs - 60 * 1000) return { ok: false, error: '過去の日時は指定できません。' };
    if (at > nowMs + MAX_DAYS_AHEAD * 24 * 3600 * 1000) return { ok: false, error: `予約できるのは${MAX_DAYS_AHEAD}日先までです。` };
  }
  const loadMedia = (id) => MediaAssets.getForUser(id, userId);
  const ids = [...new Set((mediaIds || []).filter(Boolean))];
  const medias = [];
  for (const id of ids) {
    const m = loadMedia(id);
    if (!m) return { ok: false, error: '添付したファイルが見つかりません。もう一度アップロードしてください。' };
    medias.push(m);
  }
  let cards = [];
  if (category === 'tree') {
    cards = (tree || []).map((c) => ({ text: String(c.text || '').trim(), mediaIds: [...new Set((c.mediaIds || []).filter(Boolean))] }));
    for (const c of cards) for (const id of c.mediaIds) if (!loadMedia(id)) return { ok: false, error: '添付したファイルが見つかりません。もう一度アップロードしてください。' };
  }
  if (medias.length || cards.some((c) => c.mediaIds.length)) {
    if (!String(process.env.SERVICE_BASE_URL || '').startsWith('http')) return { ok: false, error: '画像・動画の投稿は、現在ご利用いただけません。' };
  }
  if (category === 'text' && medias.length) return { ok: false, error: 'テキストの投稿には、画像・動画を添付できません。' };
  if (category === 'image' && (!medias.length || medias.some((m) => m.kind !== 'image'))) return { ok: false, error: '画像の投稿には、画像（JPEG・PNG）を1枚以上選んでください。' };
  if (category === 'video' && (medias.length !== 1 || medias[0].kind !== 'video')) return { ok: false, error: '動画の投稿には、動画を1つだけ選んでください。' };
  const resolved = [];
  for (const t of targets) {
    const a = SnsAccounts.getForUser(t.accountId, userId);
    if (!a) return { ok: false, error: '投稿先のSNSが見つかりません。' };
    if (a.status !== 'active') return { ok: false, error: `${a.handle || a.platform}は連携のやり直しが必要です。` };
    const ad = registry.get(a.platform);
    if (!ad) return { ok: false, error: '未対応のSNSです。' };
    const caption = String(t.caption || '').trim();
    const post = { category, text: caption, medias: medias.map(mediaOf), tree: cards.map((c) => ({ text: c.text, medias: c.mediaIds.map((id) => mediaOf(loadMedia(id))) })), options: t.options || {} };
    const problem = ad.validatePost({ post });
    if (problem) return { ok: false, error: problem };
    resolved.push({ a, caption, options: t.options || {} });
  }
  if (new Set(resolved.map((r) => r.a.id)).size !== resolved.length) return { ok: false, error: '同じSNSアカウントが、重複して選ばれています。' };
  if (draft) {
    if (ScheduledPosts.countDrafts(userId) + resolved.length > MAX_DRAFTS) return { ok: false, error: `下書きは${MAX_DRAFTS}件までです。` };
  } else {
    if (ScheduledPosts.countPending(userId) + resolved.length > LIMITS.maxPending) return { ok: false, error: `未投稿の予約は${LIMITS.maxPending}件までです。` };
    const [from, to] = jstDayBounds(scheduledAtIso);
    if (ScheduledPosts.countScheduledBetween(userId, from, to) + resolved.length > LIMITS.maxPerDay) {
      return { ok: false, error: `1日に予約できる投稿は${LIMITS.maxPerDay}件までです（日本時間で、その日の分）。` };
    }
  }
  const groupId = require('crypto').randomBytes(10).toString('hex');
  const created = resolved.map(({ a, caption, options }) => ScheduledPosts.create({
    userId, accountId: a.id, text: caption, scheduledAt: scheduledAtIso || new Date(nowMs).toISOString(),
    mediaIds: ids, options, category, tree: cards, groupId, status: draft ? 'draft' : 'pending',
  }));
  return { ok: true, ids: created, groupId };
}

// 従来の形（1つのメディア・同じ本文・SNSごとの設定）での予約。画面とテストが使う
function createPosts({ userId, accountIds, text, scheduledAtIso, mediaId, options, nowMs = Date.now() }) {
  const body = String(text || '').trim();
  if (!body && !mediaId) return { ok: false, error: '投稿の本文、または画像・動画を入力してください。' };
  const ids = [...new Set([].concat(accountIds || []).filter(Boolean))];
  if (!ids.length) return { ok: false, error: '投稿先のSNSを選んでください。' };
  let category = 'text';
  if (mediaId) {
    const m = MediaAssets.getForUser(mediaId, userId);
    if (!m) return { ok: false, error: '添付したファイルが見つかりません。もう一度アップロードしてください。' };
    category = m.kind === 'video' ? 'video' : 'image';
  }
  const targets = ids.map((id) => {
    const a = SnsAccounts.getForUser(id, userId);
    return { accountId: id, caption: body, options: (a && options && options[a.platform]) || {} };
  });
  return createPost({ userId, category, targets, mediaIds: mediaId ? [mediaId] : [], scheduledAtIso, nowMs });
}

// 連携の開始：認可画面のURLを返す
function startConnect({ userId, platform }) {
  const ad = registry.get(platform);
  if (!ad || !ad.isConfigured()) return { ok: false, error: 'このSNSの連携は、現在ご利用いただけません。' };
  if (!snsEnabled()) return { ok: false, error: 'SNS連携は現在ご利用いただけません。' };
  if (SnsAccounts.countForUser(userId) >= LIMITS.maxAccounts) return { ok: false, error: `連携できるSNSアカウントは${LIMITS.maxAccounts}件までです。` };
  const pkce = ad.usesPkce ? ad.newPkce() : null;
  const state = OAuthStates.create({ userId, platform, codeVerifier: pkce ? pkce.verifier : '' });
  const url = ad.authUrl({ state, redirectUri: redirectUriFor(platform), codeChallenge: pkce && pkce.challenge });
  return { ok: true, url };
}

// 連携の完了：認可コードをトークンに交換して暗号化して保存
async function finishConnect({ userId, platform, code, state }) {
  const ad = registry.get(platform);
  if (!ad) return { ok: false, error: '未対応のSNSです。' };
  const st = OAuthStates.consume(state, userId, platform);
  if (!st) return { ok: false, error: '連携の有効期限が切れたか、不正なリクエストです。もう一度やり直してください。' };
  if (!code) return { ok: false, error: 'SNS側で連携が許可されませんでした。' };
  if (SnsAccounts.countForUser(userId) >= LIMITS.maxAccounts) return { ok: false, error: `連携できるSNSアカウントは${LIMITS.maxAccounts}件までです。` };
  try {
    const k = box.keyFromEnv();
    const t = await ad.exchangeCode({ code, redirectUri: redirectUriFor(platform), codeVerifier: st.code_verifier });
    SnsAccounts.upsert({
      userId, platform, externalUserId: t.externalUserId, handle: t.handle,
      accessTokenEnc: box.encrypt(t.accessToken, k),
      refreshTokenEnc: t.refreshToken ? box.encrypt(t.refreshToken, k) : '',
      expiresAt: t.expiresAt,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `連携に失敗しました：${e.message}` };
  }
}

module.exports = {
  LIMITS, MAX_DAYS_AHEAD, TERMS_VERSION, serviceName, priceYen, snsEnabled, contactEmail, salesOpen, redirectUriFor,
  jstLocalToIso, jstDayBounds, formatJst, formatJstShort, createPost, createPosts, CATEGORIES, MAX_DRAFTS, startConnect, finishConnect,
};
