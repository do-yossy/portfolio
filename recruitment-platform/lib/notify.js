'use strict';

const https = require('https');
const http  = require('http');
const url   = require('url');

async function postJSON(endpoint, body, headers = {}) {
  const parsed = url.parse(endpoint);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: parsed.hostname,
      path: parsed.path,
      port: parsed.port || (isHttps ? 443 : 80),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// Slack Incoming Webhook
async function slackNotify(message, { emoji = ':robot_face:', channel } = {}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { skipped: true };
  try {
    const payload = { text: message, username: 'SEO採用プラットフォーム', icon_emoji: emoji };
    if (channel) payload.channel = channel;
    const r = await postJSON(webhookUrl, payload);
    return { ok: r.status === 200, status: r.status };
  } catch (e) {
    console.error('[Slack] notify failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// Chatwork API
async function chatworkNotify(message) {
  const token  = process.env.CHATWORK_TOKEN;
  const roomId = process.env.CHATWORK_ROOM_ID;
  if (!token || !roomId) return { skipped: true };
  try {
    const body = `body=${encodeURIComponent(message)}`;
    const r = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.chatwork.com',
        path: `/v2/rooms/${roomId}/messages`,
        method: 'POST',
        headers: { 'X-ChatWorkToken': token, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    return { ok: r.status === 200, status: r.status };
  } catch (e) {
    console.error('[Chatwork] notify failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// Send to all configured channels
async function notify(message, opts = {}) {
  const results = await Promise.allSettled([
    slackNotify(message, opts),
    chatworkNotify(message)
  ]);
  return results.map(r => r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message });
}

module.exports = { notify, slackNotify, chatworkNotify };
