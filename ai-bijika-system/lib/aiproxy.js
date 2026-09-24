'use strict';
// AIプロバイダへの中継（購入者自身のAPIキーを毎リクエスト受け取り、そのまま転送するだけ）。
// キーはメモリ上でも保持せず、ディスク・DB・ログのいずれにも書き込まない。
// 中継先は既知のAI providerのAPIエンドポイントのみに限定する（オープンプロキシ化を防ぐ）。
const https = require('https');

const PROVIDERS = {
  openai: {
    host: 'api.openai.com',
    path: '/v1/chat/completions',
    buildBody: (promptText) => JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: promptText }],
    }),
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
    extractText: (json) => json && json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content : JSON.stringify(json),
  },
  anthropic: {
    host: 'api.anthropic.com',
    path: '/v1/messages',
    buildBody: (promptText) => JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: promptText }],
    }),
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }),
    extractText: (json) => json && json.content && json.content[0] ? json.content[0].text : JSON.stringify(json),
  },
};

function runPrompt({ provider, apiKey, promptText }) {
  return new Promise((resolve, reject) => {
    const cfg = PROVIDERS[provider];
    if (!cfg) return reject(new Error('unsupported provider'));
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) return reject(new Error('invalid api key'));
    if (!promptText || typeof promptText !== 'string') return reject(new Error('invalid prompt'));

    const body = cfg.buildBody(promptText);
    const req = https.request({
      host: cfg.host,
      path: cfg.path,
      method: 'POST',
      headers: { ...cfg.headers(apiKey), 'Content-Length': Buffer.byteLength(body) },
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            return reject(new Error((json && json.error && json.error.message) || `provider error (${res.statusCode})`));
          }
          resolve(cfg.extractText(json));
        } catch (e) {
          reject(new Error('provider からの応答を解析できませんでした'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('provider timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { runPrompt, PROVIDERS };
