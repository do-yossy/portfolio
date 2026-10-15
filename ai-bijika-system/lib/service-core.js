'use strict';
// 月額SNS自動投稿サービスの業務ルール（画面・HTTPには依存しない）
const { Subscriptions, SnsAccounts, OAuthStates, ScheduledPosts, MediaAssets } = require('./service-store');
const box = require('./crypto-box');
const registry = require('./sns');

const envInt = (k, d) => { const v = parseInt(process.env[k] || '', 10); return Number.isFinite(v) && v > 0 ? v : d; };
// 上限は環境変数で変えられる（費用・保存容量・各SNSの規約上の上限に合わせる）
const LIMITS = {
  get maxAccounts() { return envInt('SERVICE_MAX_ACCOUNTS', 10); },
  get maxPending() { return envInt('SERVICE_MAX_PENDING', 300); },
  get maxPerDay() { return envInt('SERVICE_MAX_PER_DAY', 50); },
  // XのAPIは投稿数に応じて費用がかかるため、Xへの投稿は1人あたり月の上限を設ける（ツリーは1件ずつ数える）
  get xPerMonth() { return envInt('X_MONTHLY_LIMIT', 30); },
  // YouTubeのアップロードは、サービス全体で1日100回まで（Google Cloud のプロジェクトごとの割り当て。太平洋時間の0時にリセット）。
  // 連携の確認などの余裕を残して、初期値は90件
  get youtubePerDay() { return envInt('YOUTUBE_DAILY_LIMIT', 90); },
  // 1人で全体の枠を使い切らないよう、利用者ごとの1日の上限も設ける
  get youtubePerUserDay() { return envInt('YOUTUBE_PER_USER_DAILY', 5); },
};
const MAX_DAYS_AHEAD = 90;
const JST_OFFSET_MS = 9 * 3600 * 1000;

// サービス名（画面・法務文書の【サービス名】に入る）。ミチシルベ本体とは別の商品として扱う
const serviceName = () => process.env.SERVICE_NAME || 'SNSまとめて予約';
const priceYen = () => Number(process.env.SERVICE_PRICE_JPY || 1000);
// 無料トライアルの日数（0なら無し）。初めて申し込む人だけが対象
const trialDays = () => { const v = parseInt(process.env.SERVICE_TRIAL_DAYS || '0', 10); return Number.isFinite(v) && v > 0 && v <= 30 ? v : 0; };
function trialFor(userId) {
  const d = trialDays();
  if (!d) return 0;
  const s = Subscriptions.get(userId);
  return s && s.stripe_subscription_id ? 0 : d; // 一度でも契約したことがあれば対象外
}
const TERMS_VERSION = '2026-10-14';

const contactEmail = () => {
  const e = String(process.env.SERVICE_CONTACT_EMAIL || '').trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e) ? e : '';
};
// 販売を開始してよいか。Stripe・連絡先・SNS連携の設定に加えて、運営者が SERVICE_OPEN=true で明示した場合だけ開く
// （Metaや Xの審査が終わる前に、連携できないまま契約する人が出ないようにするため）
// 法務文書（規約・特商法表記・プライバシーポリシー）の置き場所（テストでは差し替える）
const LEGAL_FILES = ['サービス利用規約_案.md', 'サービス特定商取引法表記_案.md', 'サービスプライバシーポリシー_案.md'];
const legalDir = () => process.env.SERVICE_LEGAL_DIR || require('path').join(__dirname, '..', 'legal');
// 法務文書に残っている、未記入の【】（環境変数で自動で埋まるものは、設定されていれば除く）
let legalCache = { at: 0, key: '', list: [] };
function legalPlaceholders(nowMs = Date.now()) {
  const key = `${legalDir()}|${contactEmail()}|${process.env.SERVICE_REPRESENTATIVE || ''}`;
  if (legalCache.key === key && nowMs - legalCache.at < 60 * 1000) return legalCache.list;
  const fs = require('fs'); const path = require('path');
  const found = new Set();
  for (const f of LEGAL_FILES) {
    let text = '';
    try { text = fs.readFileSync(path.join(legalDir(), f), 'utf8'); } catch { found.add(`（${f} が見つかりません）`); continue; }
    text = text.split('【サービス名】').join('');
    if (contactEmail()) text = text.split('【メールアドレス】').join('');
    if (String(process.env.SERVICE_REPRESENTATIVE || '').trim()) text = text.split('【代表者の氏名】').join('');
    // 注意書き（「【　】は、運営者しか確認できない項目です」）の中の【　】は数えない
    for (const m of text.matchAll(/【([^】]+)】/g)) if (m[1].trim()) found.add(`【${m[1]}】（${f}）`);
  }
  legalCache = { at: nowMs, key, list: [...found] };
  return legalCache.list;
}

// 利用者に示す法務文書の本文（Markdown）。サービス名・連絡先・代表者を埋め、販売開始後は草案の表示を外す
function legalMarkdown(file) {
  let text = require('fs').readFileSync(require('path').join(legalDir(), file), 'utf8');
  if (salesOpen()) text = text.replace(/^※ これは運営者による草案です.*$/m, '').replace(/（案）/g, '');
  text = text.split('【サービス名】').join(serviceName());
  if (contactEmail()) text = text.split('【メールアドレス】').join(contactEmail());
  const rep = String(process.env.SERVICE_REPRESENTATIVE || '').trim();
  if (rep) text = text.split('【代表者の氏名】').join(rep);
  return text;
}

// 販売を開始してよいか：運営者の明示（SERVICE_OPEN）、決済・連絡先・SNSの設定、法務文書の未記入の箇所がないこと
function salesOpen() {
  const billing = require('./billing');
  return process.env.SERVICE_OPEN === 'true' && billing.isConfigured() && !!contactEmail()
    && snsEnabled() && registry.list().some((p) => p.isConfigured()) && legalPlaceholders().length === 0;
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
// 日本時間の月の範囲
function jstMonthBounds(iso) {
  const d = new Date(Date.parse(iso) + JST_OFFSET_MS);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  const start = Date.UTC(y, m, 1) - JST_OFFSET_MS;
  const end = Date.UTC(y, m + 1, 1) - JST_OFFSET_MS;
  return [new Date(start).toISOString(), new Date(end).toISOString()];
}
function xQuotaError(userId, iso, adding) {
  if (!adding) return null;
  const [from, to] = jstMonthBounds(iso);
  if (ScheduledPosts.countXUnits(userId, from, to) + adding > LIMITS.xPerMonth) {
    return `Xへの投稿は、1か月に${LIMITS.xPerMonth}件までです（ツリーは1件ずつ数えます。日本時間で、その月の分）。`;
  }
  return null;
}

// YouTubeの予約が、その日（太平洋時間）の利用者ごとの上限と、サービス全体の上限を超えないか
function youtubeQuotaError(userId, iso, adding) {
  if (!adding) return null;
  const { from, to } = require('./pt-time').dayBounds(iso);
  if (ScheduledPosts.countPlatformBetween('youtube', from, to, userId) + adding > LIMITS.youtubePerUserDay) {
    return `YouTubeへの投稿は、1日に${LIMITS.youtubePerUserDay}件までです（YouTubeの1日は、日本時間の16時または17時に切り替わります）。別の日時を選んでください。`;
  }
  if (ScheduledPosts.countPlatformBetween('youtube', from, to) + adding > LIMITS.youtubePerDay) {
    return 'この日時のYouTubeへの予約は、サービス全体の1日の上限に達しています。別の日時を選んでください（YouTubeの1日は、日本時間の16時または17時に切り替わります）。';
  }
  return null;
}
// YouTubeの公開設定と「子ども向けかどうか」は、利用者が選ぶ決まり（YouTubeの必須の機能の要件）
function youtubeOptionsError(o) {
  const ad = registry.get('youtube');
  if (!o || !((ad && ad.PRIVACY) || []).includes(o.privacy) || typeof o.made_for_kids !== 'boolean') return 'YouTubeへは、公開設定（privacy）と「子ども向けかどうか」（made_for_kids）を指定してください。';
  return null;
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
// 投稿の検証に使うメディアの情報（画像は幅・高さ、動画は長さ）
const mediaOf = (m) => {
  const media = require('./media');
  const p = media.pathOf(m);
  return { id: m.id, kind: m.kind, mime: m.mime, size: m.size, aiGenerated: !!m.ai_generated, ...(m.kind === 'image' ? (media.imageSize(p) || {}) : { durationSec: media.mp4DurationSec(p) }) };
};

// 投稿を作る（選んだSNSアカウントごとに1件。まとめて group_id でひも付ける）。
//   category: text / image / video / tree
//   targets: [{ accountId, caption, options }]（SNSごとに本文・設定を変えられる）
//   mediaIds: image は複数、video は1つ。tree: [{ text, mediaIds }]（X・Threads のみ）
//   draft: true なら下書き（SNSへは送らない。日時は任意）
function createPost({ userId, category, targets, mediaIds, tree, scheduledAtIso, draft, ruleId = '', nowMs = Date.now() }) {
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
  // TikTokは、アカウントごとに公開範囲などを確かめる決まりのため、1回の投稿で1つのアカウントだけ
  if (resolved.filter((r) => r.a.platform === 'tiktok').length > 1) return { ok: false, error: 'TikTokは、1回に1つのアカウントだけ選んでください（アカウントごとに設定を確かめるため）。' };
  if (draft) {
    if (ScheduledPosts.countDrafts(userId) + resolved.length > MAX_DRAFTS) return { ok: false, error: `下書きは${MAX_DRAFTS}件までです。` };
  } else {
    if (ScheduledPosts.countPending(userId) + resolved.length > LIMITS.maxPending) return { ok: false, error: `未投稿の予約は${LIMITS.maxPending}件までです。` };
    const [from, to] = jstDayBounds(scheduledAtIso);
    if (ScheduledPosts.countScheduledBetween(userId, from, to) + resolved.length > LIMITS.maxPerDay) {
      return { ok: false, error: `1日に予約できる投稿は${LIMITS.maxPerDay}件までです（日本時間で、その日の分）。` };
    }
  }
  if (!draft) {
    const xUnits = resolved.filter((r) => r.a.platform === 'x').length * (1 + (category === 'tree' ? cards.length : 0));
    const qe = xQuotaError(userId, scheduledAtIso, xUnits);
    if (qe) return { ok: false, error: qe };
    const yts = resolved.filter((r) => r.a.platform === 'youtube');
    for (const r of yts) { const oe = youtubeOptionsError(r.options); if (oe) return { ok: false, error: oe }; }
    const ye = youtubeQuotaError(userId, scheduledAtIso, yts.length);
    if (ye) return { ok: false, error: ye };
  }
  const groupId = require('crypto').randomBytes(10).toString('hex');
  // 投稿先ごとの行は、全部作るか、何も作らないかにする（途中で失敗して一部だけ残らないように）
  const created = require('./service-store').transaction(() => resolved.map(({ a, caption, options }) => ScheduledPosts.create({
    userId, accountId: a.id, text: caption, scheduledAt: scheduledAtIso || new Date(nowMs).toISOString(),
    mediaIds: ids, options, category, tree: cards, groupId, status: draft ? 'draft' : 'pending', ruleId,
  })));
  return { ok: true, ids: created, groupId };
}

// 1件追加できるか（予約・下書きの上限）。できなければ日本語の理由、できれば null
function capacityError({ userId, platform, atIso, draft }) {
  if (draft) return ScheduledPosts.countDrafts(userId) + 1 > MAX_DRAFTS ? `下書きは${MAX_DRAFTS}件までです。` : null;
  if (ScheduledPosts.countPending(userId) + 1 > LIMITS.maxPending) return `未投稿の予約は${LIMITS.maxPending}件までです。`;
  const [from, to] = jstDayBounds(atIso);
  if (ScheduledPosts.countScheduledBetween(userId, from, to) + 1 > LIMITS.maxPerDay) return `1日に予約できる投稿は${LIMITS.maxPerDay}件までです（日本時間で、その日の分）。`;
  if (platform === 'x') return xQuotaError(userId, atIso, 1);
  if (platform === 'youtube') return youtubeQuotaError(userId, atIso, 1);
  return null;
}

// 下書きを予約（または即時投稿）にする。日時を過ぎていないか・上限を超えないかを、予約と同じ基準で確認する
function promoteDraft({ userId, postId, scheduledAtIso, via = 'api', nowMs = Date.now() }) {
  const p = ScheduledPosts.get(postId);
  if (!p || p.user_id !== userId || p.status !== 'draft') return { ok: false, error: '下書きが見つかりません。' };
  // TikTokは、本人が画面で内容と設定（公開範囲・コメント等・商用の開示・音楽使用の確認）を確かめて同意してから送る決まり（公式の共有のガイドライン）。
  // 下書きのまま予約・投稿にはせず、「投稿を作る」画面で開き、TikTokから取得した選択肢で設定を選び直してから送る
  // 予約の行の platform（列を足す前の古い行では空）に加えて、連携しているアカウントのSNSでも確かめる
  const acct = SnsAccounts.getForUser(p.account_id, userId);
  if (p.platform === 'tiktok' || (acct && acct.platform === 'tiktok')) {
    return { ok: false, error: via === 'screen'
      ? 'TikTokの下書きは、「投稿を作る」画面で開き、公開範囲などの設定を選び直してから投稿してください（カレンダーの「内容と設定を確かめて投稿する」から開けます）。'
      : 'TikTokの下書きは、API・AIアシスタントからは予約にできません。サービスの画面で内容と設定を確かめてから投稿してください。' };
  }
  if (!Subscriptions.isActive(userId)) return { ok: false, error: 'ご契約が有効でないため、予約できません。' };
  const at = scheduledAtIso ? Date.parse(scheduledAtIso) : Date.parse(p.scheduled_at || '');
  if (Number.isNaN(at)) return { ok: false, error: '投稿日時を指定してください。' };
  if (at < nowMs - 60 * 1000) return { ok: false, error: '過去の日時は指定できません。' };
  if (at > nowMs + MAX_DAYS_AHEAD * 24 * 3600 * 1000) return { ok: false, error: `予約できるのは${MAX_DAYS_AHEAD}日先までです。` };
  const iso = new Date(at).toISOString();
  const a = SnsAccounts.getForUser(p.account_id, userId);
  if (!a || a.status !== 'active') return { ok: false, error: '投稿先のSNSの連携をやり直してください。' };
  if (ScheduledPosts.countPending(userId) + 1 > LIMITS.maxPending) return { ok: false, error: `未投稿の予約は${LIMITS.maxPending}件までです。` };
  const [from, to] = jstDayBounds(iso);
  if (ScheduledPosts.countScheduledBetween(userId, from, to) + 1 > LIMITS.maxPerDay) return { ok: false, error: `1日に予約できる投稿は${LIMITS.maxPerDay}件までです（日本時間で、その日の分）。` };
  if (a.platform === 'x') {
    let n = 1; try { n += JSON.parse(p.tree || '[]').length; } catch { /* */ }
    const qe = xQuotaError(userId, iso, n);
    if (qe) return { ok: false, error: qe };
  }
  if (a.platform === 'youtube') {
    let o = {}; try { o = JSON.parse(p.options || '{}'); } catch { o = {}; }
    const oe = youtubeOptionsError(o);
    if (oe) return { ok: false, error: `${oe}「投稿を作る」画面で作り直して投稿してください。` };
    const ye = youtubeQuotaError(userId, iso, 1);
    if (ye) return { ok: false, error: ye };
  }
  if (!ScheduledPosts.promote(postId, userId, iso)) return { ok: false, error: '下書きが見つかりません。' };
  return { ok: true };
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
    return { accountId: id, platform: a && a.platform, caption: body, options: (a && options && options[a.platform]) || {} };
  });
  // かんたん投稿（この関数）では、公開設定と「子ども向けかどうか」を選べないため、YouTubeは受け付けない
  if (targets.some((t) => t.platform === 'youtube')) return { ok: false, error: 'YouTubeへは、公開設定と「子ども向けかどうか」を選ぶ必要があるため、「投稿を作る」画面から投稿してください。' };
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
  LIMITS, LEGAL_FILES, legalDir, legalPlaceholders, legalMarkdown, MAX_DAYS_AHEAD, TERMS_VERSION, serviceName, priceYen, trialDays, trialFor, snsEnabled, contactEmail, salesOpen, redirectUriFor,
  jstLocalToIso, jstDayBounds, jstMonthBounds, formatJst, formatJstShort, createPost, createPosts, promoteDraft, capacityError, CATEGORIES, MAX_DRAFTS, startConnect, finishConnect,
};
