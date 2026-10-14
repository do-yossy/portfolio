'use strict';
// AIによる投稿文・画像・動画の生成。外部のAIサービスの仕様・料金は運用前に必ず公式で確認すること。
//   文章：Anthropic Messages API（ANTHROPIC_API_KEY）
//   画像：OpenAI Images API（OPENAI_API_KEY。JPEGで受け取る＝Instagramにそのまま使える）
//   動画：Gemini API の Veo（GEMINI_API_KEY。生成に数分かかるため、非同期のジョブとして扱う）
const { Readable } = require('stream');
const { request, encodeForm } = require('./http-client');
const mediaLib = require('./media');
const { AiUsage, Subscriptions } = require('./service-store');

const env = () => process.env;
const TEXT_MODEL = () => env().AI_TEXT_MODEL || 'claude-haiku-5-5';
const IMAGE_MODEL = () => env().AI_IMAGE_MODEL || 'gpt-image-1';
const VIDEO_MODEL = () => env().AI_VIDEO_MODEL || 'veo-3.0-generate-001';
// 画像の品質（low／medium／high）。高いほど1枚の費用が上がる。既定は medium
const IMAGE_QUALITY = () => (['low', 'medium', 'high'].includes(env().AI_IMAGE_QUALITY) ? env().AI_IMAGE_QUALITY : 'medium');

// 生成回数の上限（利用者ごと。1日と1か月。日本時間）。費用を管理するための上限で、環境変数で変えられる。
// 動画は費用が高くなりやすいため、既定では無効（運営者が AI_DAILY_VIDEO を1以上にしたときだけ使える）
function limits() {
  const n = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : d);
  return { text: n(env().AI_DAILY_TEXT, 30), image: n(env().AI_DAILY_IMAGE, 5), video: n(env().AI_DAILY_VIDEO, 0) };
}
function monthlyLimits() {
  const n = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : d);
  return { text: n(env().AI_MONTHLY_TEXT, 300), image: n(env().AI_MONTHLY_IMAGE, 60), video: n(env().AI_MONTHLY_VIDEO, 10) };
}
const available = () => {
  const l = limits(); const m = monthlyLimits();
  return {
    text: !!env().ANTHROPIC_API_KEY && l.text > 0 && m.text > 0,
    image: !!env().OPENAI_API_KEY && l.image > 0 && m.image > 0,
    video: !!env().GEMINI_API_KEY && l.video > 0 && m.video > 0,
  };
};

class AiError extends Error {
  constructor(message, { transient = false } = {}) { super(message); this.transient = transient; }
}

const PLATFORM_HINT = {
  threads: 'Threads（500文字以内）', x: 'X（日本語140字程度。全角は2文字として数えるので短く）', instagram: 'Instagram（キャプション。改行とハッシュタグを使う）',
  tiktok: 'TikTok（動画のタイトル。短く）', facebook: 'Facebookページ', youtube: 'YouTubeショート（1行目がタイトル）',
};

function day(nowMs = Date.now()) { return new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10); } // 日本時間の日付

// 生成の前に上限を確認して1回分を使う（失敗したときは戻す）
// どの経路（画面・REST API・MCP・自動運用）から呼ばれても、ここで契約を確認する
function reserve(userId, kind, nowMs) {
  const lim = limits()[kind];
  if (!Subscriptions.isActive(userId)) throw new AiError('ご契約が有効でないため、生成できません。');
  if (!available()[kind]) throw new AiError('この生成機能は、現在ご利用いただけません。');
  const mlim = monthlyLimits()[kind];
  if (AiUsage.usedMonth(userId, day(nowMs), kind) >= mlim) throw new AiError(`今月の生成回数の上限（${mlim}回）に達しました。来月またお試しください。`);
  if (!AiUsage.tryUse(userId, day(nowMs), kind, lim)) throw new AiError(`本日の生成回数の上限（${lim}回）に達しました。明日またお試しください。`);
}
function refund(userId, kind, nowMs) { AiUsage.refund(userId, day(nowMs), kind); }

async function post(host, path, headers, body, timeoutMs = 120000) {
  let r;
  try { r = await request({ host, method: 'POST', path, headers, body, timeoutMs }); } catch (e) { throw new AiError(`AIサービスに接続できませんでした (${e.message})`); }
  if (r.status < 200 || r.status >= 300) {
    const m = r.json && r.json.error && (r.json.error.message || r.json.error.status);
    throw new AiError(`AIサービスがエラーを返しました (${r.status})${m ? `：${String(m).slice(0, 200)}` : ''}`);
  }
  return r.json;
}

// 投稿文の生成。platform ごとの文字数に合わせる。戻り値は本文（文字列）
async function generateText({ userId, theme, tone, platform, instruction, avoid = [], nowMs }) {
  const subject = String(theme || '').trim();
  if (!subject) throw new AiError('テーマを入力してください。');
  if ([...subject].length > 500 || [...String(instruction || '')].length > 500 || [...String(tone || '')].length > 100) throw new AiError('入力が長すぎます。');
  reserve(userId, 'text', nowMs);
  try {
    const system = 'あなたはSNS運用の担当者です。指定されたテーマで、そのまま投稿できる日本語の投稿文を1本だけ書きます。前置きや説明は書かず、投稿文だけを返します。'
      + '事実として確認できない数字・実績・お客様の声・効果の断定は書きません。誇大な表現や他者を中傷する表現は避けます。';
    const recent = (avoid || []).filter(Boolean).slice(0, 5).map((t) => `- ${String(t).replace(/\s+/g, ' ').slice(0, 200)}`).join('\n');
    const user = `テーマ：${subject}\n口調：${tone || 'やさしく丁寧'}\n投稿先：${PLATFORM_HINT[platform] || 'SNS'}${instruction ? `\n追加の指示：${instruction}` : ''}`
      + (recent ? `\n\n最近の投稿（これらと同じ内容・同じ書き出しにならないよう、切り口を変える）：\n${recent}` : '');
    const j = await post('api.anthropic.com', '/v1/messages',
      { 'x-api-key': env().ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      JSON.stringify({ model: TEXT_MODEL(), max_tokens: 4000, system, messages: [{ role: 'user', content: user }] }));
    // 途中で切れた文章は投稿に使わない（思考の分も max_tokens を使うモデルがあるため、余裕を持たせている）
    if (j.stop_reason === 'max_tokens') throw new AiError('文章が長くなりすぎました。テーマを短くして、もう一度お試しください。');
    const text = ((j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('') || '').trim();
    if (!text) throw new AiError('文章を生成できませんでした。');
    return text;
  } catch (e) { refund(userId, 'text', nowMs); throw e; }
}

// 生成したファイルを、アップロードと同じ検査を通して保存する
async function saveBuffer(userId, buf) {
  const r = await mediaLib.saveUpload({ userId, req: Readable.from([buf]), contentLength: buf.length });
  if (!r.ok) throw new AiError(r.error);
  require('./service-store').MediaAssets.markAiGenerated(r.media.id);
  return { ...r.media, ai_generated: 1 };
}

// 画像の生成（JPEG）。戻り値は保存したメディア
async function generateImage({ userId, prompt, nowMs }) {
  const p = String(prompt || '').trim();
  if (!p) throw new AiError('画像の内容を入力してください。');
  if ([...p].length > 1000) throw new AiError('入力が長すぎます。');
  reserve(userId, 'image', nowMs);
  try {
    const j = await post('api.openai.com', '/v1/images/generations',
      { Authorization: `Bearer ${env().OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      JSON.stringify({ model: IMAGE_MODEL(), prompt: p, size: '1024x1024', n: 1, output_format: 'jpeg', quality: IMAGE_QUALITY() }));
    const b64 = j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) throw new AiError('画像を生成できませんでした。');
    return await saveBuffer(userId, Buffer.from(b64, 'base64'));
  } catch (e) { refund(userId, 'image', nowMs); throw e; }
}

// 動画の生成の開始。戻り値は Google 側の処理名（あとで poll する）
async function startVideo({ userId, prompt, nowMs }) {
  const p = String(prompt || '').trim();
  if (!p) throw new AiError('動画の内容を入力してください。');
  if ([...p].length > 1000) throw new AiError('入力が長すぎます。');
  reserve(userId, 'video', nowMs);
  try {
    const j = await post('generativelanguage.googleapis.com', `/v1beta/models/${encodeURIComponent(VIDEO_MODEL())}:predictLongRunning`,
      { 'x-goog-api-key': env().GEMINI_API_KEY, 'Content-Type': 'application/json' },
      JSON.stringify({ instances: [{ prompt: p }], parameters: { aspectRatio: '9:16' } }));
    if (!j.name) throw new AiError('動画の生成を開始できませんでした。');
    return j.name;
  } catch (e) { refund(userId, 'video', nowMs); throw e; }
}

async function get(host, path, headers, timeoutMs = 60000) {
  let r;
  try { r = await request({ host, method: 'GET', path, headers, timeoutMs }); } catch (e) { throw new AiError(`AIサービスに接続できませんでした (${e.message})`, { transient: true }); }
  return r;
}

// 動画の生成の確認。{ done:false } / { done:true, media } / throw
async function pollVideo({ userId, operation }) {
  const key = env().GEMINI_API_KEY;
  if (!/^[A-Za-z0-9_\-/.]+$/.test(operation) || operation.includes('..') || operation.startsWith('/')) throw new AiError('処理名が正しくありません。');
  const r = await get('generativelanguage.googleapis.com', `/v1beta/${operation}`, { 'x-goog-api-key': key });
  if (r.status === 429 || r.status >= 500) throw new AiError(`動画の状態を確認できませんでした (${r.status})`, { transient: true });
  if (r.status < 200 || r.status >= 300 || !r.json) throw new AiError(`動画の状態を確認できませんでした (${r.status})`);
  if (!r.json.done) return { done: false };
  if (r.json.error) throw new AiError(`動画の生成に失敗しました：${String(r.json.error.message || '').slice(0, 200)}`);
  const uri = r.json.response && r.json.response.generateVideoResponse && r.json.response.generateVideoResponse.generatedSamples
    && r.json.response.generateVideoResponse.generatedSamples[0] && r.json.response.generateVideoResponse.generatedSamples[0].video.uri;
  if (!uri) throw new AiError('動画を取得できませんでした（安全上の理由で生成されなかった可能性があります）。');
  const u = new URL(uri);
  if (u.protocol !== 'https:' || u.hostname !== 'generativelanguage.googleapis.com') throw new AiError('動画の取得先が正しくありません。');
  // 動画のバイナリを取得（http-client はJSON/テキスト向けなので、ここだけ直接受け取る）
  const buf = await new Promise((resolve, reject) => {
    const rq = require('https').request({ host: u.host, method: 'GET', path: `${u.pathname}${u.search}`, headers: { 'x-goog-api-key': key } }, (res) => {
      if (res.statusCode !== 200) { if (res.resume) res.resume(); return reject(new AiError(`動画を取得できませんでした (${res.statusCode})`)); }
      const ch = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > mediaLib.LIMITS.videoBytes) { res.destroy(); reject(new AiError('生成された動画が大きすぎます。')); } else ch.push(c); });
      res.on('end', () => resolve(Buffer.concat(ch)));
      res.on('error', reject);
    });
    rq.on('error', (e) => reject(new AiError(`動画を取得できませんでした (${e.message})`)));
    rq.end();
  });
  return { done: true, media: await saveBuffer(userId, buf) };
}

// その利用者が、いまこの生成を使えるか（契約・設定・今日と今月の残り回数）。生成の前の確認に使う
function canUse(userId, kind, nowMs) {
  if (!Subscriptions.isActive(userId) || !available()[kind]) return false;
  const d = day(nowMs);
  return AiUsage.used(userId, d, kind) < limits()[kind] && AiUsage.usedMonth(userId, d, kind) < monthlyLimits()[kind];
}

module.exports = { canUse, available, limits, monthlyLimits, generateText, generateImage, startVideo, pollVideo, AiError, day };
