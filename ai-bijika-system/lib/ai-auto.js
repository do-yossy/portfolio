'use strict';
// AI自動運用：毎日、決めた時刻に「AIが投稿文（と画像）を作る → 下書きに入れる／そのまま予約する」。
// 動画生成のジョブの確認もここで行う。投稿するのは、利用者が設定したルールの範囲だけ。
const ai = require('./ai');
const core = require('./service-core');
const scheduler = require('./sns/scheduler');
const registry = require('./sns');
const { AutoRules, AiJobs, SnsAccounts, Subscriptions } = require('./service-store');

const jstHour = (nowMs) => new Date(nowMs + 9 * 3600 * 1000).getUTCHours();

// ルールの検証。エラーなら日本語の文、問題なければ null
function validateRule({ userId, accountId, theme, withImage, hourJst, mode }) {
  const a = SnsAccounts.getForUser(accountId, userId);
  if (!a) return '投稿先のSNSが見つかりません。';
  const ad = registry.get(a.platform);
  if (!ad) return '未対応のSNSです。';
  if (['tiktok', 'youtube'].includes(a.platform)) return `${ad.label}は投稿ごとに公開範囲などの確認が必要なため、自動運用の対象にできません。`;
  if (a.platform === 'instagram' && !withImage) return 'Instagramは画像が必要です。「画像も作る」を選んでください。';
  if (!String(theme || '').trim() || [...String(theme)].length > 500) return 'テーマを500文字以内で入力してください。';
  if (!Number.isInteger(hourJst) || hourJst < 0 || hourJst > 23) return '投稿する時刻（0〜23時）が正しくありません。';
  if (!['draft', 'auto'].includes(mode)) return '運用の方法が正しくありません。';
  if (withImage && !ai.available().image) return '画像の生成は、現在ご利用いただけません。';
  if (!ai.available().text) return '文章の生成は、現在ご利用いただけません。';
  if (AutoRules.count(userId) >= AutoRules.MAX) return `自動運用のルールは${AutoRules.MAX}件までです。`;
  return null;
}

async function runRule(rule, nowMs) {
  if (!Subscriptions.isActive(rule.user_id)) throw new Error('ご契約が有効ではありません。');
  const acc = SnsAccounts.getForUser(rule.account_id, rule.user_id);
  if (!acc || acc.status !== 'active') throw new Error('SNSの連携をやり直してください。');
  // 生成の前に、予約・下書きの上限に空きがあるかを確かめる（生成したのに保存できず、AIの回数と費用だけが消えるのを防ぐ）
  const cap = core.capacityError({ userId: rule.user_id, platform: acc.platform, atIso: new Date(nowMs + 2 * 60 * 1000).toISOString(), draft: rule.mode !== 'auto' });
  if (cap) throw new Error(cap);
  const text = await ai.generateText({ userId: rule.user_id, theme: rule.theme, tone: rule.tone, platform: acc.platform, nowMs });
  let mediaIds = [];
  if (rule.with_image) {
    const m = await ai.generateImage({ userId: rule.user_id, prompt: `${rule.theme}（SNS投稿用のイメージ。文字は入れない）`, nowMs });
    mediaIds = [m.id];
  }
  const draft = rule.mode !== 'auto';
  const at = new Date(nowMs + 2 * 60 * 1000).toISOString();
  const r = core.createPost({
    userId: rule.user_id, category: mediaIds.length ? 'image' : 'text', mediaIds,
    targets: [{ accountId: acc.id, caption: text, options: {} }], scheduledAtIso: draft ? null : at, draft, nowMs,
  });
  if (!r.ok) throw new Error(r.error);
  return r;
}

// ルールの作成。その日の実行時刻を過ぎてから作った場合は、翌日から実行する（作った直後に投稿されないように）
function createRule(args, nowMs = Date.now()) {
  const id = AutoRules.create(args);
  if (args.hourJst <= jstHour(nowMs)) AutoRules.claim(id, ai.day(nowMs));
  return id;
}

let running = false;
// 今日の実行時刻を過ぎた未実行のルールを実行する。戻り値は実行した件数
async function tick(nowMs = Date.now()) {
  if (running) return 0;
  running = true;
  let n = 0;
  try {
    const day = ai.day(nowMs);
    for (const rule of AutoRules.due(day)) {
      if (rule.hour_jst > jstHour(nowMs)) continue;
      if (!AutoRules.claim(rule.id, day)) continue; // 先に実行済み
      try { await runRule(rule, nowMs); n++; } catch (e) { AutoRules.setError(rule.id, e.message); }
    }
    await pollJobs();
  } finally { running = false; }
  return n;
}

// 動画の生成ジョブの確認（完了したらメディアとして保存する）。30分で打ち切る
async function pollJobs() {
  for (const job of AiJobs.listRunning()) {
    if (Date.now() - Date.parse(job.created_at) > 30 * 60 * 1000) { AiJobs.finish(job.id, { error: '動画の生成が時間内に終わりませんでした。' }); continue; }
    try {
      const r = await ai.pollVideo({ userId: job.user_id, operation: job.operation });
      if (r.done) AiJobs.finish(job.id, { mediaId: r.media.id });
    } catch (e) {
      if (e && e.transient) continue; // 一時的なエラーは、次の確認でやり直す（30分で打ち切り）
      AiJobs.finish(job.id, { error: e.message });
    }
  }
}

let timer = null;
function start(intervalMs = 60000) {
  if (timer) return;
  timer = setInterval(() => { tick().catch((e) => console.error('[ai-auto]', e)); }, intervalMs);
  if (timer.unref) timer.unref();
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { validateRule, createRule, runRule, tick, pollJobs, start, stop };
