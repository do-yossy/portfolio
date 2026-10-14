'use strict';
// 月額SNS自動投稿サービスの業務ルール（画面・HTTPには依存しない）
const { Subscriptions, SnsAccounts, OAuthStates, ScheduledPosts } = require('./service-store');
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

// 予約を作る（選んだSNSアカウントごとに1件）
function createPosts({ userId, accountIds, text, scheduledAtIso, nowMs = Date.now() }) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: '投稿の本文を入力してください。' };
  const ids = [...new Set([].concat(accountIds || []).filter(Boolean))];
  if (!ids.length) return { ok: false, error: '投稿先のSNSを選んでください。' };
  if (!Subscriptions.isActive(userId)) return { ok: false, error: 'ご契約が有効でないため、予約できません。' };
  if (!scheduledAtIso) return { ok: false, error: '投稿日時の形式が正しくありません。' };
  const at = Date.parse(scheduledAtIso);
  if (at < nowMs - 60 * 1000) return { ok: false, error: '過去の日時は指定できません。' };
  if (at > nowMs + MAX_DAYS_AHEAD * 24 * 3600 * 1000) return { ok: false, error: `予約できるのは${MAX_DAYS_AHEAD}日先までです。` };
  const accounts = [];
  for (const id of ids) {
    const a = SnsAccounts.getForUser(id, userId);
    if (!a) return { ok: false, error: '投稿先のSNSが見つかりません。' };
    if (a.status !== 'active') return { ok: false, error: `${a.handle || a.platform}は連携のやり直しが必要です。` };
    const ad = registry.get(a.platform);
    if (!ad) return { ok: false, error: '未対応のSNSです。' };
    if (ad.textLength(body) > ad.maxLength) return { ok: false, error: `${ad.label}の文字数の上限（${ad.maxLength}${ad.id === 'x' ? '（日本語は1文字を2として計算）' : '文字'}）を超えています。` };
    accounts.push(a);
  }
  if (ScheduledPosts.countPending(userId) + accounts.length > LIMITS.maxPending) {
    return { ok: false, error: `未投稿の予約は${LIMITS.maxPending}件までです。` };
  }
  const [from, to] = jstDayBounds(scheduledAtIso);
  if (ScheduledPosts.countScheduledBetween(userId, from, to) + accounts.length > LIMITS.maxPerDay) {
    return { ok: false, error: `1日に予約できる投稿は${LIMITS.maxPerDay}件までです（日本時間で、その日の分）。` };
  }
  const created = accounts.map((a) => ScheduledPosts.create({ userId, accountId: a.id, text: body, scheduledAt: scheduledAtIso }));
  return { ok: true, ids: created };
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
  jstLocalToIso, jstDayBounds, formatJst, formatJstShort, createPosts, startConnect, finishConnect,
};
