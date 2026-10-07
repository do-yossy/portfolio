'use strict';
// ポストメッシュ（https://post-mesh.com/）への中継。複数SNSへの投稿・予約配信をAPI経由で行う。
// SNSアカウントの連携（OAuth）自体はポストメッシュ側のダッシュボードで行う前提で、
// このアプリは「連携済みアカウント一覧の取得」「投稿の作成・予約」のみを中継する。
// APIキーは購入者がツール画面から都度送信する値をその場で中継するだけで、DB・ログには一切保存しない。
const https = require('https');

const HOST = 'post-mesh.com';
const BASE_PATH = '/api/v1';

function postmeshRequest({ apiKey, method, path, body }) {
  return new Promise((resolve, reject) => {
    if (!apiKey || typeof apiKey !== 'string') return reject(new Error('ポストメッシュのAPIキーが設定されていません'));
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({
      host: HOST,
      path: `${BASE_PATH}${path}`,
      method,
      headers,
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try {
          json = data ? JSON.parse(data) : {};
        } catch (e) {
          return reject(new Error('ポストメッシュからの応答を解析できませんでした'));
        }
        if (res.statusCode >= 400) {
          const msg = (json && json.error && json.error.message) || `ポストメッシュのエラー（${res.statusCode}）`;
          return reject(new Error(msg));
        }
        resolve(json);
      });
    });
    req.on('timeout', () => req.destroy(new Error('ポストメッシュへの接続がタイムアウトしました')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// 連携済みSNSアカウント一覧（連携作業自体はポストメッシュのダッシュボードで行う）
function listConnections({ apiKey }) {
  return postmeshRequest({ apiKey, method: 'GET', path: '/connections' }).then((json) => json.data || []);
}

// 直近の投稿一覧（ステータス確認用。インサイト集計はポストメッシュの上位プラン機能のため本アプリでは扱わない）
function listPosts({ apiKey, limit }) {
  const q = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return postmeshRequest({ apiKey, method: 'GET', path: `/posts${q}` }).then((json) => json.data || []);
}

// テキスト投稿の作成（即時 or 予約。画像・動画・ツリー投稿は本アプリでは扱わない）
function createTextPost({ apiKey, targets, scheduledAt, draft }) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return Promise.reject(new Error('投稿先のSNSアカウントを1つ以上選んでください'));
  }
  const body = { category: 'text', targets };
  if (scheduledAt) body.scheduled_at = scheduledAt;
  if (draft) body.draft = true;
  return postmeshRequest({ apiKey, method: 'POST', path: '/posts', body });
}

module.exports = { listConnections, listPosts, createTextPost };
