'use strict';
// AI自動運用：決めた時刻（1日に最大3回）に「AIが投稿文と、必要なら画像・動画を作る → 下書きに入れる／そのまま予約する」。
// 動画は生成に数分かかるため、生成のジョブが終わった時点で投稿を作る（pollJobs）。
// 投稿するのは、利用者が設定したルールの範囲だけ。TikTokは投稿ごとに本人の確認が必要なため、自動運用の対象にしない。
const ai = require('./ai');
const core = require('./service-core');
const registry = require('./sns');
const { AutoRules, AiJobs, SnsAccounts, Subscriptions, ScheduledPosts } = require('./service-store');

const MEDIA = ['none', 'image', 'video'];
const MAX_HOURS = 3;
const jstHour = (nowMs) => new Date(nowMs + 9 * 3600 * 1000).getUTCHours();

// ルールの時刻の一覧（昇順・重複なし）。古いルールは hour_jst だけを持つ
function hoursOf(rule) {
  const list = String(rule.hours || '').split(',').map((h) => parseInt(h, 10)).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  const hs = list.length ? list : [rule.hour_jst];
  return [...new Set(hs)].sort((a, b) => a - b);
}
function mediaOf(rule) { return MEDIA.includes(rule.media) ? rule.media : (rule.with_image ? 'image' : 'none'); }
function optionsOf(rule) { try { return JSON.parse(rule.options || '{}') || {}; } catch { return {}; } }
// 今の回（その日の、いまの時刻までで最後の実行時刻）。key は「YYYY-MM-DD#HH」で、文字列の大小が時間の前後と一致する
function currentSlot(rule, nowMs) {
  const h = hoursOf(rule).filter((x) => x <= jstHour(nowMs)).pop();
  if (h === undefined) return null;
  const day = ai.day(nowMs);
  return { key: `${day}#${String(h).padStart(2, '0')}`, day, hour: h };
}
// テーマは1行に1つ。回ごとに順番に使う
function themeFor(rule, slot) {
  const themes = String(rule.theme || '').split('\n').map((t) => t.trim()).filter(Boolean);
  if (themes.length <= 1) return themes[0] || '';
  const dayNo = Math.floor(Date.parse(`${slot.day}T00:00:00Z`) / 86400000);
  const idx = (dayNo * hoursOf(rule).length + hoursOf(rule).indexOf(slot.hour)) % themes.length;
  return themes[(idx + themes.length) % themes.length];
}

// ルールの検証。エラーなら日本語の文、問題なければ null
function validateRule({ userId, accountId, theme, media, hours, mode, options = {}, withImage, hourJst }) {
  const m = media || (withImage ? 'image' : 'none');
  const hs = (hours && hours.length ? hours : (hourJst !== undefined ? [hourJst] : [])).filter((h) => h !== undefined && h !== null && h !== '');
  const a = SnsAccounts.getForUser(accountId, userId);
  if (!a) return '投稿先のSNSが見つかりません。';
  const ad = registry.get(a.platform);
  if (!ad) return '未対応のSNSです。';
  if (a.platform === 'tiktok') return 'TikTokは、投稿ごとにご本人が内容と公開範囲を確認する必要があるため、自動運用の対象にできません。「投稿を作る」画面でAIを使って作り、確認してから投稿してください。';
  if (!MEDIA.includes(m)) return '作るもの（文章だけ／画像も作る／動画も作る）が正しくありません。';
  if (a.platform === 'instagram' && m === 'none') return 'Instagramは画像または動画が必要です。「画像も作る」か「動画も作る」を選んでください。';
  if (a.platform === 'youtube' && m !== 'video') return 'YouTubeは動画が必要です。「動画も作る」を選んでください。';
  if (a.platform === 'youtube') {
    if (!['public', 'unlisted', 'private'].includes(options.privacy)) return 'YouTubeの公開設定を選んでください。';
    if (typeof options.made_for_kids !== 'boolean') return 'YouTubeの「子ども向けかどうか」を選んでください。';
  }
  const themes = String(theme || '').split('\n').map((t) => t.trim()).filter(Boolean);
  if (!themes.length || [...String(theme)].length > 2000 || themes.some((t) => [...t].length > 500)) return 'テーマを入力してください（1行に1つ、各500文字・合計2,000文字まで）。';
  if (!hs.length || hs.length > MAX_HOURS || hs.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) return `投稿する時刻（0〜23時）を1〜${MAX_HOURS}つ選んでください。`;
  if (!['draft', 'auto'].includes(mode)) return '運用の方法が正しくありません。';
  const av = ai.available();
  if (!av.text) return '文章の生成は、現在ご利用いただけません。';
  if (m === 'image' && !av.image) return '画像の生成は、現在ご利用いただけません。';
  if (m === 'video' && !av.video) return '動画の生成は、現在ご利用いただけません。';
  if (AutoRules.count(userId) >= AutoRules.MAX) return `自動運用のルールは${AutoRules.MAX}件までです。`;
  return null;
}

// SNSごとの投稿の設定（YouTubeは公開設定と子ども向けの申告）
function postOptions(platform, options) {
  if (platform === 'youtube') return { privacy: options.privacy, made_for_kids: options.made_for_kids === true };
  return {};
}

async function runRule(rule, nowMs, slot = currentSlot(rule, nowMs) || { day: ai.day(nowMs), hour: hoursOf(rule)[0] }) {
  if (!Subscriptions.isActive(rule.user_id)) throw new Error('ご契約が有効ではありません。');
  const acc = SnsAccounts.getForUser(rule.account_id, rule.user_id);
  if (!acc || acc.status !== 'active') throw new Error('SNSの連携をやり直してください。');
  const media = mediaOf(rule);
  const draft = rule.mode !== 'auto';
  // 生成の前に、予約・下書きの上限に空きがあるかを確かめる（生成したのに保存できず、AIの回数と費用だけが消えるのを防ぐ）
  const cap = core.capacityError({ userId: rule.user_id, platform: acc.platform, atIso: new Date(nowMs + 2 * 60 * 1000).toISOString(), draft });
  if (cap) throw new Error(cap);
  // 画像・動画の残り回数も、文章を作る前に確かめる（文章の分だけ回数と費用を使って失敗しないように）
  if (!ai.canUse(rule.user_id, 'text', nowMs)) throw new Error('AIの文章の生成回数の上限に達しているか、現在ご利用いただけません。');
  if (media !== 'none' && !ai.canUse(rule.user_id, media, nowMs)) throw new Error(`AIの${media === 'video' ? '動画' : '画像'}の生成回数の上限に達しているか、現在ご利用いただけません。`);
  const theme = themeFor(rule, slot);
  const text = await ai.generateText({ userId: rule.user_id, theme, tone: rule.tone, platform: acc.platform, avoid: ScheduledPosts.recentTextsForRule(rule.id, 5), nowMs });
  const visual = `${theme}。投稿の内容：${text.replace(/\s+/g, ' ').slice(0, 300)}`;
  if (media === 'video') {
    // 動画は数分かかる。完成したら pollJobs が投稿を作る
    const op = await ai.startVideo({ userId: rule.user_id, prompt: `${visual}（SNSの縦長の短い動画。文字やロゴは入れない）`, nowMs });
    AiJobs.create({ userId: rule.user_id, kind: 'video', prompt: theme.slice(0, 1000), operation: op, payload: { ruleId: rule.id, accountId: acc.id, text, draft, options: postOptions(acc.platform, optionsOf(rule)) } });
    return { pending: true };
  }
  let mediaIds = [];
  if (media === 'image') {
    const m = await ai.generateImage({ userId: rule.user_id, prompt: `${visual}（SNS投稿用の画像。文字やロゴは入れない）`, nowMs });
    mediaIds = [m.id];
  }
  const r = core.createPost({
    userId: rule.user_id, category: mediaIds.length ? 'image' : 'text', mediaIds, ruleId: rule.id,
    targets: [{ accountId: acc.id, caption: text, options: postOptions(acc.platform, optionsOf(rule)) }],
    scheduledAtIso: draft ? null : new Date(nowMs + 2 * 60 * 1000).toISOString(), draft, nowMs,
  });
  if (!r.ok) throw new Error(r.error);
  return r;
}

// ルールの作成。その日の実行時刻をすでに過ぎている回は実行せず、次の時刻から実行する（作った直後に投稿されないように）
function createRule(args, nowMs = Date.now()) {
  const hours = [...new Set((args.hours && args.hours.length ? args.hours : [args.hourJst]).map(Number))].sort((a, b) => a - b);
  const media = args.media || (args.withImage ? 'image' : 'none');
  const id = AutoRules.create({ ...args, media, hours });
  const slot = currentSlot({ hours: hours.join(','), hour_jst: hours[0] }, nowMs);
  if (slot) AutoRules.claim(id, slot.key);
  return id;
}

// 前回の回の印。旧形式（「YYYY-MM-DD」だけ）は、その日の回をすべて実行済みとして扱う（デプロイした日に二重に実行しないように）
function lastKey(rule) {
  const v = String(rule.last_day || '');
  return v && !v.includes('#') ? `${v}#99` : v;
}

let running = false;
// 実行時刻を過ぎて、まだ実行していない回を実行する。戻り値は実行した件数
async function tick(nowMs = Date.now()) {
  if (running) return 0;
  running = true;
  let n = 0;
  try {
    for (const rule of AutoRules.enabled()) {
      const slot = currentSlot(rule, nowMs);
      if (!slot || lastKey(rule) >= slot.key) continue;
      if (!AutoRules.claim(rule.id, slot.key)) continue; // 先に実行済み
      try { await runRule(rule, nowMs, slot); n++; } catch (e) { AutoRules.setError(rule.id, e.message); }
    }
    await pollJobs(nowMs);
  } finally { running = false; }
  return n;
}

// 自動運用の動画が完成したら、投稿（下書き／予約）を作る
function finishRulePost(job, mediaId, nowMs) {
  let p = null;
  try { p = JSON.parse(job.payload || ''); } catch { p = null; }
  if (!p || !p.ruleId) return;
  // 生成中にルールが停止・削除・変更された場合は、投稿を作らない（動画は使われないファイルとして、通常どおり自動で削除される）
  const rule = AutoRules.get(p.ruleId, job.user_id);
  if (!rule || !rule.enabled || rule.account_id !== p.accountId || (rule.mode !== 'auto') !== !!p.draft) return;
  const r = core.createPost({
    userId: job.user_id, category: 'video', mediaIds: [mediaId], ruleId: p.ruleId,
    targets: [{ accountId: p.accountId, caption: p.text, options: p.options || {} }],
    scheduledAtIso: p.draft ? null : new Date(nowMs + 2 * 60 * 1000).toISOString(), draft: !!p.draft, nowMs,
  });
  if (!r.ok) AutoRules.setError(p.ruleId, `動画はできましたが、投稿を作れませんでした：${r.error}`);
}
function ruleErrorFromJob(job, msg) {
  try { const p = JSON.parse(job.payload || ''); if (p && p.ruleId) AutoRules.setError(p.ruleId, msg); } catch { /* 画面から作った動画 */ }
}

// 動画の生成ジョブの確認（完了したらメディアとして保存し、自動運用のものは投稿を作る）。30分で打ち切る
async function pollJobs(nowMs = Date.now()) {
  for (const job of AiJobs.listRunning()) {
    if (Date.now() - Date.parse(job.created_at) > 30 * 60 * 1000) {
      AiJobs.finish(job.id, { error: '動画の生成が時間内に終わりませんでした。' });
      ruleErrorFromJob(job, '動画の生成が時間内に終わりませんでした。');
      continue;
    }
    try {
      const r = await ai.pollVideo({ userId: job.user_id, operation: job.operation });
      if (r.done) {
        AiJobs.finish(job.id, { mediaId: r.media.id });
        finishRulePost(job, r.media.id, nowMs);
      }
    } catch (e) {
      if (e && e.transient) continue; // 一時的なエラーは、次の確認でやり直す（30分で打ち切り）
      AiJobs.finish(job.id, { error: e.message });
      ruleErrorFromJob(job, e.message);
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

module.exports = { validateRule, createRule, runRule, tick, pollJobs, start, stop, hoursOf, mediaOf, themeFor, currentSlot, MAX_HOURS };
