'use strict';
// HTTP経由の通しテスト：LP表示 → アカウント作成 → 最終確認 → Checkout → Webhook → マイページ → SNS連携 → 予約 → 解約
// 実行: node --experimental-sqlite test/e2e.test.js （StripeとSNSはモック）
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-e2e-'));
process.env.SNS_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e';
process.env.STRIPE_PRICE_ID = 'price_e2e';
process.env.THREADS_APP_ID = 'th_id';
process.env.THREADS_APP_SECRET = 'th_secret';
process.env.ADMIN_PASSWORD = 'adminpw';

const { ok, summary, installHttpsMock } = require('./helpers');
const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
let userIdForSub = '';
let cancelFlag = false;
let subStatus = 'active';
const subObj = () => ({ id: 'sub_e2e', customer: 'cus_e2e', status: subStatus, current_period_end: periodEnd, cancel_at_period_end: cancelFlag, metadata: { user_id: userIdForSub }, items: { data: [{ price: { id: 'price_e2e' } }] } });

const mock = installHttpsMock(async (c) => {
  if (c.host === 'api.stripe.com') {
    if (c.path === '/v1/checkout/sessions') { userIdForSub = (c.body.match(/client_reference_id=([a-f0-9]+)/) || [])[1]; return { status: 200, json: { id: 'cs_e2e', url: 'https://checkout.stripe.test/cs_e2e' } }; }
    if (c.method === 'GET' && c.path === '/v1/subscriptions/sub_e2e') return { status: 200, json: subObj() };
    if (c.method === 'POST' && c.path === '/v1/subscriptions/sub_e2e') { cancelFlag = /cancel_at_period_end=true/.test(c.body); return { status: 200, json: subObj() }; }
    if (c.path === '/v1/billing_portal/sessions') return { status: 200, json: { url: 'https://portal.stripe.test/e2e' } };
  }
  if (c.host === 'open.tiktokapis.com' && c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { creator_nickname: 'e2e_tt', privacy_level_options: ['SELF_ONLY'], comment_disabled: false }, error: { code: 'ok' } } };
  if (c.host === 'graph.threads.net') {
    if (c.path === '/oauth/access_token') return { status: 200, json: { access_token: 'th_short', user_id: 4242 } };
    if (c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: 'th_long', expires_in: 5184000 } };
    if (c.path.startsWith('/v1.0/me?')) return { status: 200, json: { id: '4242', username: 'e2e_user' } };
    if (c.path === '/v1.0/4242/threads') return { status: 200, json: { id: 'cont_1' } };
    if (c.path === '/v1.0/4242/threads_publish') return { status: 200, json: { id: 'post_e2e' } };
  }
  return null;
});

// サーバーへのHTTPは本物（ローカルのhttp）。外部へのhttpsだけをモックしている
const server = require('../server');
const scheduler = require('../lib/sns/scheduler');
const store = require('../lib/service-store');

let base = '';
let cookie = '';
function req(method, p, { body, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw !== undefined ? raw : (body ? new URLSearchParams(body).toString() : '');
    const r = http.request(`${base}${p}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      const ch = [];
      res.on('data', (c) => ch.push(c));
      res.on('end', () => {
        const sc = res.headers['set-cookie'];
        if (sc) cookie = sc.map((s) => s.split(';')[0]).join('; ');
        resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(ch).toString('utf8') });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const FUTURE = new Date(Date.now() + 9 * 3600 * 1000 + 7 * 86400 * 1000).toISOString().slice(0, 16); // 7日後（日本時間）
const csrfOf = (html) => (html.match(/name="csrf" value="([a-f0-9]+)"/) || [])[1];
function webhook(event, secret = 'whsec_e2e') {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return req('POST', '/api/stripe/webhook', { raw, headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` } });
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  process.env.SERVICE_BASE_URL = base; // 設定がそろった状態（上の環境変数は読み込み後に参照されるため、ここで設定）

  console.log('販売開始前（SERVICE_OPEN 未設定）');
  let r = await req('GET', '/service');
  ok(r.status === 200 && r.text.includes('ただいま準備中'), '運営者が販売開始を明示するまでは「準備中」と表示する');
  r = await req('POST', '/service/signup', { body: { email: 'early@example.com', password: 'password123' } });
  ok(r.status === 302 && r.headers.location === '/service', '販売開始前は、アカウントを作っても申込み画面へは進まない');
  r = await req('GET', '/service/checkout');
  ok(r.status === 302 && r.headers.location === '/service', '販売開始前は、申込み画面を開けない');
  cookie = '';
  process.env.SERVICE_OPEN = 'true';
  process.env.SERVICE_CONTACT_EMAIL = 'support@example.com';

  console.log('販売ページ');
  r = await req('GET', '/service');
  ok(r.status === 200 && r.text.includes('月額') && r.text.includes('1,000円') && r.text.includes('税込'), 'LPに月額1,000円（税込）を表示する');
  ok(r.text.includes('返金') && r.text.includes('解約') && r.text.includes('自動更新'), 'LPに返金・解約・自動更新の条件を表示する');
  ok(r.text.includes('/service/legal/terms') && r.text.includes('/service/legal/tokushoho'), 'LPから規約・特商法表記へリンクする');
  ok(r.text.includes('現在の対応SNSは、Threadsです') && !r.text.includes('YouTube：') && !r.text.includes('TikTok：'), 'LPには、設定済みのSNSだけを対応SNSとして表示する');
  ok(!r.text.includes('AIで投稿づくり') && !/ClaudeやChatGPT/.test(r.text), 'AIが未設定ならAIの機能を表示せず、動作を確認していないアプリ名を出さない');
  r = await req('GET', '/service/legal/tokushoho');
  ok(r.status === 200 && r.text.includes('月額1,000円（税込）') && r.text.includes('<table>'), '特商法表記を表示できる');
  ok(r.text.includes('support@example.com') && !r.text.includes('【メールアドレス】') && r.text.includes('電話番号'), '特商法表記の連絡先に設定したメールアドレスを表示し、電話番号の開示請求について記載する');
  r = await req('GET', '/service/legal/terms');
  ok(r.status === 200 && r.text.includes('第5条（解約）') && r.text.includes('第7条（AIによる生成）'), '利用規約を表示できる');
  ok(!r.text.includes('草案') && !r.text.includes('（案）'), '販売開始後は、草案である旨の表示を外す');
  ok(/<ol><li>[^]*?<ul><li>投稿の作成/.test(r.text) && !r.text.includes('<p>- 投稿の作成'), '規約の入れ子の箇条書きを、崩さずに表示する');

  console.log('未ログイン');
  r = await req('GET', '/service/app');
  ok(r.status === 302 && r.headers.location === '/service/login', 'マイページは未ログインならログイン画面へ');
  r = await req('POST', '/service/checkout', { body: { agree: '1' } });
  ok(r.status === 302 && r.headers.location === '/service/login', '未ログインでは申込みできない');
  r = await webhook({ id: 'evt_x', type: 'x' }, 'wrong_secret');
  ok(r.status === 400, '署名が違うWebhookは拒否する');
  r = await req('POST', '/api/stripe/webhook', { raw: '{}', headers: { 'Content-Type': 'application/json' } });
  ok(r.status === 400, '署名なしのWebhookは拒否する');

  console.log('アカウント作成と申込み');
  r = await req('POST', '/service/signup', { body: { email: 'bad', password: 'short' } });
  ok(r.status === 400, '不正な入力ではアカウントを作れない');
  r = await req('POST', '/service/signup', { body: { email: 'e2e@example.com', password: 'password123' } });
  ok(r.status === 302 && r.headers.location === '/service/checkout' && cookie.includes('session='), 'アカウントを作成し、最終確認画面へ進む');
  r = await req('POST', '/service/signup', { body: { email: 'e2e@example.com', password: 'password123' } });
  ok(r.status === 400 && r.text.includes('既に登録'), '同じメールアドレスでは二重に登録できない');
  r = await req('GET', '/service/checkout');
  ok(r.text.includes('提供の時期') && r.text.includes('お支払いが確認できない間は'), '最終確認画面に提供の時期と、お支払いが確認できない場合の扱いを表示する');
  ok(r.status === 200 && r.text.includes('月額 1,000円（税込）') && r.text.includes('自動更新') && r.text.includes('解約') && r.text.includes('返金'), '最終確認画面に金額・自動更新・解約・返金を表示する');
  const csrf = csrfOf(r.text);
  ok(!!csrf, '最終確認画面にCSRFトークンがある');
  r = await req('POST', '/service/checkout', { body: { csrf: 'wrong', agree: '1' } });
  ok(r.status === 403, 'CSRFトークンが違うと申込みできない');
  r = await req('POST', '/service/checkout', { body: { csrf } });
  ok(r.status === 400 && r.text.includes('同意'), '同意のチェックがないと申込みできない');
  r = await req('POST', '/service/checkout', { body: { csrf, agree: '1' } });
  ok(r.status === 303 && r.headers.location === 'https://checkout.stripe.test/cs_e2e', '同意するとStripeの決済ページへ移動する');
  ok(!!userIdForSub, 'StripeにユーザーIDを渡している');
  const afterAgree = store.Subscriptions.get(userIdForSub);
  ok(afterAgree.agreed_at && afterAgree.agreed_version, '同意した日時と規約の版を記録する');
  ok(!store.Subscriptions.isActive(userIdForSub), '決済が完了するまでは契約中にならない');
  r = await req('GET', '/service/api/status');
  ok(JSON.parse(r.text).active === false, '決済前の状態確認はfalse');
  r = await req('GET', '/service/checkout/success?session_id=cs_e2e');
  ok(r.status === 200 && r.text.includes('確認しています'), '戻り先ページは決済の反映を待つ表示');

  console.log('決済完了（Webhook）');
  r = await webhook({ id: 'evt_e2e_1', type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: userIdForSub, customer: 'cus_e2e', subscription: 'sub_e2e' } } });
  ok(r.status === 200, 'Webhookを受け付ける');
  r = await req('GET', '/service/api/status');
  ok(JSON.parse(r.text).active === true, 'Webhookのあと、契約中になる');
  r = await req('GET', '/service/app');
  ok(r.status === 200 && r.text.includes('契約中') && r.text.includes('次回の更新日') && r.text.includes('解約する'), 'マイページに契約状態・次回更新日・解約ボタンを表示する');
  const appCsrf = csrfOf(r.text);

  console.log('SNS連携と予約');
  r = await req('GET', '/service/connect/threads');
  ok(r.status === 302 && r.headers.location.startsWith('https://threads.net/oauth/authorize'), 'Threadsの認可画面へ移動する');
  const st = new URL(r.headers.location).searchParams.get('state');
  r = await req('GET', `/service/oauth/callback/threads?code=abc&state=${st}`);
  ok(r.status === 302 && r.headers.location === '/service/app?f=connected', '連携を完了する');
  r = await req('GET', '/service/app?f=connected');
  ok(r.text.includes('@e2e_user') && r.text.includes('SNSを連携しました'), 'マイページに連携済みのアカウントを表示する');
  const accId = (r.text.match(/name="account" value="([a-f0-9]+)"/) || [])[1];
  ok(!!accId, '予約フォームに投稿先が出る');
  r = await req('POST', '/service/app/post', { body: { csrf: 'bad', text: 'x', account: accId, at: FUTURE, mode: 'schedule' } });
  ok(r.status === 403, '予約もCSRFトークンが必要');
  r = await req('POST', '/service/app/post', { body: { csrf: appCsrf, text: '予約テスト', account: accId, at: '2020-01-01T10:00', mode: 'schedule' } });
  ok(r.status === 400 && r.text.includes('過去'), '過去の日時では予約できない');
  r = await req('POST', '/service/app/post', { body: { csrf: appCsrf, text: '予約テスト', account: accId, at: FUTURE, mode: 'schedule' } });
  ok(r.status === 302 && r.headers.location === '/service/app?f=scheduled', '予約できる');
  r = await req('GET', '/service/app');
  ok(r.text.includes('予約テスト') && r.text.includes('予約中'), '予約が一覧に出る');
  const postId = (r.text.match(/\/service\/app\/post\/([a-f0-9]+)\/cancel/) || [])[1];
  r = await req('POST', '/service/app/post', { body: { csrf: appCsrf, text: '今すぐテスト', account: accId, mode: 'now' } });
  ok(r.status === 302 && r.headers.location === '/service/app?f=now', '今すぐ投稿を予約できる');
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  const posted = store.ScheduledPosts.listForUser(userIdForSub).find((p) => p.text === '今すぐテスト');
  ok(posted && posted.status === 'posted' && posted.external_id === 'post_e2e', '実行時刻が来た投稿がThreadsへ投稿される');
  // 画像の添付（アップロード → 予約 → 投稿）
  const rawUpload = (buf, headers) => new Promise((resolve, reject) => {
    const q = http.request(`${base}/service/app/media`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length, ...headers } }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(ch).toString('utf8') }));
    });
    q.on('error', reject); q.write(buf); q.end();
  });
  const jpegBuf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1500, 5)]);
  r = await rawUpload(jpegBuf, { 'X-CSRF': 'bad' });
  ok(r.status === 403, 'アップロードもCSRFトークンが必要');
  r = await rawUpload(Buffer.from('not an image at all, just text'), { 'X-CSRF': appCsrf });
  ok(r.status === 400 && JSON.parse(r.text).error.includes('対応していない'), '画像・動画以外はアップロードできない');
  r = await rawUpload(jpegBuf, { 'X-CSRF': appCsrf });
  const up = JSON.parse(r.text);
  ok(r.status === 200 && up.kind === 'image' && up.id, '画像をアップロードできる');
  const mediaRow = store.MediaAssets.get(up.id);
  const savedCookie2 = cookie;
  cookie = '';
  r = await req('GET', `/media/${mediaRow.token}.${mediaRow.ext}`);
  ok(r.status === 200 && r.headers['content-type'] === 'image/jpeg', '公開URLは、ログインなしでも（SNS側が）取得できる');
  r = await req('GET', `/media/${'0'.repeat(48)}.jpg`);
  ok(r.status === 404, '推測したURLでは取得できない');
  cookie = savedCookie2;
  r = await req('POST', '/service/app/post', { body: { csrf: appCsrf, text: '画像つき', account: accId, at: FUTURE, mode: 'schedule', media_id: up.id } });
  ok(r.status === 302 && r.headers.location === '/service/app?f=scheduled', '画像つきで予約できる');
  r = await req('POST', '/service/app/post', { body: { csrf: appCsrf, text: '他人の画像', account: accId, at: FUTURE, mode: 'schedule', media_id: 'deadbeefdeadbeefdead' } });
  ok(r.status === 400, '存在しない（または他人の）画像は使えない');

  console.log('APIキーとREST API');
  const api = (method, p2, key, json, buf) => new Promise((resolve, reject) => {
    const data = buf || (json !== undefined ? Buffer.from(JSON.stringify(json)) : null);
    const q = http.request(`${base}${p2}`, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(data ? { 'Content-Length': data.length, 'Content-Type': json !== undefined ? 'application/json' : 'application/octet-stream' } : {}) } }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch { /* */ } resolve({ status: res.statusCode, json: j, text: t }); });
    });
    q.on('error', reject); if (data) q.write(data); q.end();
  });
  r = await req('POST', '/service/app/apikey', { body: { csrf: 'bad', label: 'x' } });
  ok(r.status === 403, 'APIキーの発行もCSRFトークンが必要');
  r = await req('POST', '/service/app/apikey', { body: { csrf: appCsrf, label: 'テスト用' } });
  const apiKey = (r.text.match(/sqk_[0-9a-f]{48}/) || [])[0];
  ok(r.status === 200 && !!apiKey, 'APIキーを発行でき、その場で1度だけ表示される');
  r = await req('GET', '/service/app');
  ok(!r.text.includes(apiKey) && r.text.includes('sqk_'), '次回以降はキーの全体を表示しない（先頭だけ）');
  ok(!JSON.stringify(store.ApiKeys.listForUser(userIdForSub)).includes(apiKey), 'キーの平文を保存しない');
  r = await api('GET', '/api/v1/accounts', '');
  ok(r.status === 401, 'キーなしは401');
  r = await api('GET', '/api/v1/accounts', 'sqk_' + '0'.repeat(48));
  ok(r.status === 401, '違うキーは401');
  r = await api('GET', '/api/v1/accounts', apiKey);
  ok(r.status === 200 && r.json.accounts.length === 1 && r.json.accounts[0].id === accId && !('access_token_enc' in r.json.accounts[0]), 'SNS一覧を取得できる（トークンは含まない）');
  r = await api('POST', '/api/v1/media', apiKey, undefined, jpegBuf);
  ok(r.status === 201 && r.json.kind === 'image', 'APIから画像をアップロードできる');
  const apiMedia = r.json.id;
  r = await api('POST', '/api/v1/posts', apiKey, { category: 'tree', text: 'API1', tree: [{ text: 'API2' }], account_ids: [accId], draft: true });
  ok(r.status === 201 && r.json.posts[0].status === 'draft' && r.json.posts[0].category === 'tree', 'ツリーを下書きとして作れる');
  const draftId = r.json.posts[0].id;
  r = await api('GET', '/api/v1/posts?status=draft', apiKey);
  ok(r.json.posts.length === 1 && r.json.posts[0].id === draftId, '下書きの一覧を取得できる');
  r = await api('POST', `/api/v1/posts/${draftId}/publish`, apiKey, { scheduled_at: new Date(Date.now() + 86400000).toISOString() });
  ok(r.status === 200 && r.json.status === 'pending', '下書きを予約にできる');
  r = await api('DELETE', `/api/v1/posts/${draftId}`, apiKey);
  ok(r.status === 200 && r.json.status === 'cancelled', '予約を取り消せる');
  r = await api('POST', '/api/v1/posts', apiKey, { category: 'image', text: 'API画像', media_ids: [apiMedia], account_ids: [accId], scheduled_at: new Date(Date.now() + 86400000).toISOString() });
  ok(r.status === 201 && r.json.posts[0].media_ids[0] === apiMedia, '画像つきの投稿を予約できる');
  r = await api('POST', '/api/v1/posts', apiKey, { category: 'text', text: 'x', account_ids: ['deadbeef'], now: true });
  ok(r.status === 400, '他人の（存在しない）SNSには投稿できない');
  r = await api('POST', '/api/v1/posts', apiKey, { category: 'text', text: '', account_ids: [accId], now: true });
  ok(r.status === 400, '空の投稿は拒否する');
  console.log('AI（画面・API）');
  r = await api('POST', '/api/v1/ai/text', apiKey, { theme: 'x' });
  ok(r.status === 400 && /現在ご利用いただけません/.test(r.json.error), 'AIが未設定なら、生成機能は使えない');
  r = await api('POST', '/api/v1/auto-rules', apiKey, { account_id: accId, theme: 'x', hour_jst: 9, mode: 'auto' });
  ok(r.status === 400 && /confirm_auto/.test(r.json.error), '完全自動は確認の指定がないと作れない');
  r = await api('GET', '/api/v1/auto-rules', apiKey);
  ok(r.status === 200 && Array.isArray(r.json.rules), '自動運用ルールの一覧を取得できる');
  r = await req('POST', '/service/app/ai/text', { raw: JSON.stringify({ theme: 'x' }), headers: { 'X-CSRF': 'bad', 'Content-Type': 'application/json' } });
  ok(r.status === 403, '画面からのAI生成もCSRFトークンが必要');
  console.log('MCP');
  const rpc = (key, body) => api('POST', '/mcp', key, body);
  r = await rpc('', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  ok(r.status === 401, 'MCPもAPIキーが必要');
  r = await rpc(apiKey, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  ok(r.json.result.serverInfo.name === 'sns-scheduler', 'MCPの初期化に応答する');
  r = await rpc(apiKey, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  ok(r.json.result.tools.map((t) => t.name).join() === 'list_accounts,get_account_info,create_post,list_posts,publish_draft,delete_post,create_upload_url,import_media_from_url,ai_generate_text,ai_generate_image,ai_start_video,ai_video_status', 'MCPのツール一覧を返す');
  r = await rpc(apiKey, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_post', arguments: { category: 'text', text: 'MCP下書き', account_ids: [accId], draft: true } } });
  const mcpOut = JSON.parse(r.json.result.content[0].text);
  ok(!r.json.result.isError && mcpOut.posts[0].status === 'draft', 'MCPから下書きを作れる');
  r = await rpc(apiKey, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'create_post', arguments: { category: 'text', text: '', account_ids: [accId], now: true } } });
  ok(r.json.result.isError === true, 'MCPでも検証エラーを返す');
  r = await rpc(apiKey, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'delete_post', arguments: { id: mcpOut.posts[0].id } } });
  ok(!r.json.result.isError, 'MCPから取り消せる');
  r = await rpc(apiKey, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_account_info', arguments: {} } });
  const info = JSON.parse(r.json.result.content[0].text);
  ok(info.subscription.status === 'active' && info.limits.x_per_month === 30 && typeof info.usage.pending === 'number', 'MCPで契約・上限・利用状況を確認できる');

  console.log('アップロード用の一時URL');
  r = await rpc(apiKey, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'create_upload_url', arguments: {} } });
  const upInfo = JSON.parse(r.json.result.content[0].text);
  const upPath = new URL(upInfo.upload_url).pathname;
  ok(/^\/api\/v1\/uploads\/squ_[0-9a-f]{48}$/.test(upPath) && upInfo.method === 'PUT', 'MCPからアップロード用URLを発行できる');
  r = await api('PUT', upPath, '', undefined, jpegBuf);
  ok(r.status === 201 && r.json.kind === 'image', '一時URLへ、APIキーなしでアップロードできる');
  r = await api('PUT', upPath, '', undefined, jpegBuf);
  ok(r.status === 404, '一時URLは1回しか使えない');
  r = await api('PUT', `/api/v1/uploads/squ_${'0'.repeat(48)}`, '', undefined, jpegBuf);
  ok(r.status === 404, '発行していない一時URLは使えない');
  r = await api('POST', '/api/v1/media/import', apiKey, { url: 'https://127.0.0.1/a.jpg' });
  ok(r.status === 400, 'URLの取り込みで、ローカルのアドレスは拒否する');
  r = await api('POST', '/api/v1/media/import', apiKey, { url: 'http://example.com/a.jpg' });
  ok(r.status === 400 && /https/.test(r.json.error), 'URLの取り込みは https だけ');

  console.log('MCPのOAuth接続（APIキーなし）');
  r = await api('GET', '/.well-known/oauth-protected-resource', '');
  ok(r.status === 200 && r.json.resource === `${base}/mcp` && r.json.authorization_servers[0] === base, '保護リソースのメタデータを返す');
  r = await api('GET', '/.well-known/oauth-authorization-server', '');
  ok(r.json.code_challenge_methods_supported.includes('S256') && r.json.registration_endpoint === `${base}/oauth/register`, '認可サーバーのメタデータを返す');
  const mcpNoAuth = await new Promise((resolve) => { const q = http.request(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => resolve(res)); }); q.end('{}'); });
  ok(mcpNoAuth.statusCode === 401 && /resource_metadata=/.test(mcpNoAuth.headers['www-authenticate'] || ''), '未認証の /mcp は、認可の手がかりを付けて401を返す');
  r = await api('POST', '/oauth/register', '', { client_name: 'Claude', redirect_uris: ['http://evil.example/cb'] });
  ok(r.status === 400, 'https でない戻り先は登録できない');
  const cbUri = 'https://claude.example/api/mcp/auth_callback';
  r = await api('POST', '/oauth/register', '', { client_name: 'Claude', redirect_uris: [cbUri] });
  ok(r.status === 201 && /^mcpc_/.test(r.json.client_id), 'クライアントを動的に登録できる');
  const clientId = r.json.client_id;
  const verifier = crypto.randomBytes(40).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const authQs = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: cbUri, code_challenge: challenge, code_challenge_method: 'S256', state: 'st123', scope: 'posts' }).toString();
  const savedCookie3 = cookie; cookie = '';
  r = await req('GET', `/oauth/authorize?${authQs}`);
  ok(r.status === 302 && r.headers.location.startsWith('/service/login?next='), '未ログインならログイン画面へ（戻り先つき）');
  r = await req('GET', r.headers.location);
  ok(r.text.includes('name="next"'), 'ログイン画面に戻り先を引き継ぐ');
  cookie = savedCookie3;
  r = await req('GET', `/oauth/authorize?${authQs.replace(cbUri.replace(/[:/]/g, (c) => encodeURIComponent(c)), encodeURIComponent('https://other.example/cb'))}`);
  ok(r.status === 400, '登録していない戻り先は拒否する');
  r = await req('GET', `/oauth/authorize?${authQs}`);
  ok(r.status === 200 && r.text.includes('「Claude」からの接続を許可しますか') && r.headers['x-frame-options'] === 'DENY', '同意画面を表示する（埋め込み不可）');
  const consentCsrf = csrfOf(r.text);
  const form = Object.fromEntries(new URLSearchParams(authQs));
  r = await req('POST', '/oauth/authorize', { body: { ...form, csrf: 'bad', decision: 'allow' } });
  ok(r.status === 403, '同意もCSRFトークンが必要');
  r = await req('POST', '/oauth/authorize', { body: { ...form, csrf: consentCsrf, decision: 'allow' } });
  const cbUrl = new URL(r.headers.location);
  ok(r.status === 302 && cbUrl.origin + cbUrl.pathname === cbUri && cbUrl.searchParams.get('state') === 'st123' && cbUrl.searchParams.get('code'), '許可すると、認可コードを付けて戻る');
  const tokenReq = (body) => new Promise((resolve) => { const d = new URLSearchParams(body).toString(); const q = http.request(`${base}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) } }, (res) => { const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(ch).toString()) })); }); q.end(d); });
  r = await tokenReq({ grant_type: 'authorization_code', code: cbUrl.searchParams.get('code'), client_id: clientId, redirect_uri: cbUri, code_verifier: verifier });
  ok(r.status === 200 && /^sqa_/.test(r.json.access_token) && /^sqr_/.test(r.json.refresh_token), 'PKCEを確認してトークンを発行する');
  let tok = r.json;
  r = await tokenReq({ grant_type: 'authorization_code', code: cbUrl.searchParams.get('code'), client_id: clientId, redirect_uri: cbUri, code_verifier: verifier });
  ok(r.status === 400, '認可コードは1回しか使えない');
  r = await rpc(tok.access_token, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'list_accounts', arguments: {} } });
  ok(JSON.parse(r.json.result.content[0].text).accounts[0].id === accId, 'OAuthのトークンでMCPを使える');
  r = await tokenReq({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: clientId });
  ok(r.status === 200 && r.json.access_token !== tok.access_token, 'リフレッシュトークンで更新できる');
  const oldRefresh = tok.refresh_token; tok = r.json;
  r = await tokenReq({ grant_type: 'refresh_token', refresh_token: oldRefresh, client_id: clientId });
  ok(r.status === 400, '使ったリフレッシュトークンは再利用できない');
  r = await rpc(tok.access_token, { jsonrpc: '2.0', id: 10, method: 'tools/list' });
  ok(r.status === 401, '使用済みのリフレッシュトークンが再利用されたら、その接続をまとめて無効にする（漏えい対策）');
  // もう一度接続する（認可 → トークン）
  const authorizeAgain = async () => {
    const v2 = crypto.randomBytes(40).toString('base64url');
    const q2 = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: cbUri, code_challenge: crypto.createHash('sha256').update(v2).digest('base64url'), code_challenge_method: 'S256', state: 's2' }).toString();
    const pg = await req('GET', `/oauth/authorize?${q2}`);
    const rr = await req('POST', '/oauth/authorize', { body: { ...Object.fromEntries(new URLSearchParams(q2)), csrf: csrfOf(pg.text), decision: 'allow' } });
    return { code: new URL(rr.headers.location).searchParams.get('code'), verifier: v2 };
  };
  let ag = await authorizeAgain();
  r = await tokenReq({ grant_type: 'authorization_code', code: ag.code, client_id: clientId, redirect_uri: cbUri, code_verifier: ag.verifier });
  tok = r.json;
  r = await req('GET', '/service/app');
  ok(r.text.includes('Claude') && r.text.includes(`/service/app/connection/${clientId}/revoke`), 'マイページに接続中のアプリを表示する');
  ag = await authorizeAgain(); // まだ使っていない認可コードを持った状態で解除する
  r = await req('POST', `/service/app/connection/${clientId}/revoke`, { body: { csrf: appCsrf } });
  r = await rpc(tok.access_token, { jsonrpc: '2.0', id: 11, method: 'tools/list' });
  ok(r.status === 401, '接続を解除すると、そのトークンは使えない');
  r = await tokenReq({ grant_type: 'authorization_code', code: ag.code, client_id: clientId, redirect_uri: cbUri, code_verifier: ag.verifier });
  ok(r.status === 400, '解除すると、まだ使っていない認可コードも使えなくなる');
  r = await req('GET', `/oauth/authorize?${authQs.replace('response_type=code', 'response_type=token')}`);
  ok(r.status === 400 && !r.headers.location, '同意の前のエラーでは、登録された戻り先へ移動しない（オープンリダイレクト対策）');
  r = await req('GET', `/oauth/authorize?${authQs.replace(/code_challenge_method=S256/, 'code_challenge_method=plain')}`);
  ok(r.status === 400 && !r.headers.location, 'PKCEの不備も、その場で表示する');

  console.log('回数制限と認証の順序');
  for (let i = 0; i < 25; i++) await rpc(`sqa_${crypto.randomBytes(32).toString('hex')}`, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  r = await rpc(apiKey, { jsonrpc: '2.0', id: 12, method: 'tools/list' });
  ok(r.status === 200, '同じIPから不正なトークンが続いても、正しいキーの利用者は締め出されない');
  r = await rpc(`sqa_${crypto.randomBytes(32).toString('hex')}`, { jsonrpc: '2.0', id: 13, method: 'tools/list' });
  ok(r.status === 429, '不正なトークンが続くIPは、一時的に制限する');
  r = await rpc(tok.access_token, { jsonrpc: '2.0', id: 14, method: 'tools/list' });
  ok(r.status === 401, '発行したことがある（期限切れ・解除済みの）トークンは、制限に数えずに401を返す');
  r = await req('GET', '/service/docs/skill.md');
  ok(r.status === 200 && r.text.startsWith('---\nname: sns-scheduler') && r.text.includes('draft'), 'Agent Skill（SKILL.md）を配布できる');
  r = await req('GET', '/service/docs/api');
  ok(r.status === 200 && r.text.includes('/mcp') && r.text.includes('skill.md'), 'APIの説明にMCPとSkillの使い方を載せる');
  console.log('投稿を作る画面とカレンダー');
  r = await req('GET', '/service/app/compose');
  ok(r.status === 200 && r.text.includes('ツリー（連投）') && r.text.includes('SNSごとに本文を変える') && r.text.includes('下書きに保存'), '投稿を作る画面を表示する');
  const sessPost = (body, csrfTok) => req('POST', '/service/app/posts', { raw: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-CSRF': csrfTok } });
  r = await sessPost({ category: 'text', text: 'x', account_ids: [accId], draft: true }, 'bad');
  ok(r.status === 403, '画面からの投稿作成もCSRFトークンが必要');
  r = await sessPost({ category: 'tree', text: '画面ツリー1', tree: [{ text: '画面ツリー2' }], account_ids: [accId], captions: { [accId]: '画面ツリー1（Threads用）' }, draft: true }, appCsrf);
  const sp = JSON.parse(r.text);
  ok(r.status === 201 && sp.posts[0].status === 'draft' && sp.posts[0].text === '画面ツリー1（Threads用）' && sp.posts[0].tree.length === 1, '画面から、SNSごとの本文でツリーを下書きにできる');
  r = await req('GET', '/service/app/calendar');
  ok(r.status === 200 && r.text.includes('画面ツリー1（Threads用）') && r.text.includes('ツリー2件'), 'カレンダー画面に下書きが出る');
  r = await req('POST', `/service/app/post/${sp.posts[0].id}/publish`, { body: { csrf: appCsrf, mode: 'schedule', at: '2020-01-01T10:00' } });
  ok(r.status === 400 && r.text.includes('過去'), '下書きを過去の日時では予約できない');
  r = await req('POST', `/service/app/post/${sp.posts[0].id}/publish`, { body: { csrf: appCsrf, mode: 'schedule', at: FUTURE } });
  ok(r.status === 302 && r.headers.location === '/service/app/calendar?f=scheduled', '下書きを予約にできる');
  const fm = FUTURE.slice(0, 7);
  r = await req('GET', `/service/app/calendar?m=${fm}`);
  ok(r.text.includes('画面ツリー1') && r.text.includes('予約中'), '予約がカレンダーの日付に出る');
  r = await req('POST', `/service/app/post/${sp.posts[0].id}/cancel`, { body: { csrf: appCsrf, back: 'calendar' } });
  ok(r.headers.location === '/service/app/calendar?f=cancelled', 'カレンダーから取り消せる');
  const keyId = store.ApiKeys.listForUser(userIdForSub)[0].id;
  r = await req('POST', `/service/app/apikey/${keyId}/revoke`, { body: { csrf: appCsrf } });
  r = await api('GET', '/api/v1/accounts', apiKey);
  ok(r.status === 401, '無効にしたキーは使えない');
  r = await req('GET', '/service/app');
  ok(r.text.includes('添付あり') && !r.text.includes('id="tiktokBox"'), '履歴に添付ありと表示する（未連携のTikTokの設定欄は出ない）');
  // TikTokの投稿設定（公開範囲の選択肢をTikTokから取得して画面に反映する）
  const box = require('../lib/crypto-box');
  const ttId = store.SnsAccounts.upsert({ userId: userIdForSub, platform: 'tiktok', externalUserId: 'tt1', handle: 'e2e_tt', accessTokenEnc: box.encrypt('t', box.keyFromEnv()), refreshTokenEnc: box.encrypt('r', box.keyFromEnv()), expiresAt: new Date(Date.now() + 86400000).toISOString() });
  r = await req('GET', `/service/app/tiktok/creator-info?account=${ttId}`);
  const ci = JSON.parse(r.text);
  ok(r.status === 200 && ci.privacyLevelOptions.join() === 'SELF_ONLY' && ci.nickname === 'e2e_tt', 'TikTokの投稿設定（公開範囲の選択肢）を、TikTokから取得して返す');
  r = await req('GET', `/service/app/tiktok/creator-info?account=${accId}`);
  ok(r.status === 404, 'TikTok以外のアカウントでは取得できない');
  r = await req('GET', '/service/app');
  ok(r.text.includes('id="tiktokBox"') && r.text.includes('第三者の商品・ブランドの宣伝'), 'TikTokを連携すると、投稿フォームにTikTokの設定欄（公開範囲・コメント等・商用の開示）が出る');
  // TikTokの設定（商用コンテンツの開示・公開範囲）が、フォームから予約に保存される
  const mp4Buf = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(2000, 4)]);
  const upv = JSON.parse((await rawUpload(mp4Buf, { 'X-CSRF': appCsrf })).text);
  r = await req('POST', '/service/app/post', { body: { csrf: appCsrf, text: 'TikTok宣伝', account: ttId, at: FUTURE, mode: 'schedule', media_id: upv.id, tiktok_privacy: 'SELF_ONLY', tiktok_comment: '1', tiktok_commercial_own: '1' } });
  ok(r.status === 302, 'TikTokの設定つきで予約できる');
  const ttPostRow = store.ScheduledPosts.listForUser(userIdForSub).find((p) => p.text === 'TikTok宣伝');
  const ttOpt = JSON.parse(ttPostRow.options);
  ok(ttOpt.privacy_level === 'SELF_ONLY' && ttOpt.commercial_own === true && ttOpt.commercial_paid === false && ttOpt.disable_comment === false && ttOpt.disable_duet === true, 'フォームの公開範囲・商用コンテンツの開示・コメント許可が、予約に保存される');
  r = await req('POST', '/service/app/post', { body: { csrf: appCsrf, text: '提携で自分のみ', account: ttId, at: FUTURE, mode: 'schedule', media_id: upv.id, tiktok_privacy: 'SELF_ONLY', tiktok_commercial_paid: '1' } });
  ok(r.status === 400 && r.text.includes('自分のみ'), '提携（有償）の宣伝は、公開範囲を「自分のみ」にできない');
  store.SnsAccounts.remove(ttId, userIdForSub);
  r = await req('POST', `/service/app/post/${postId}/cancel`, { body: { csrf: appCsrf } });
  ok(r.status === 302 && r.headers.location === '/service/app?f=cancelled', '未投稿の予約を取り消せる');

  console.log('他のユーザーからの保護');
  const savedCookie = cookie;
  cookie = '';
  r = await req('POST', '/service/signup', { body: { email: 'other@example.com', password: 'password123' } });
  r = await req('GET', '/service/checkout');
  const otherCsrf = csrfOf(r.text);
  r = await req('POST', '/service/app/post', { body: { csrf: otherCsrf, text: '不正', account: accId, at: FUTURE, mode: 'schedule' } });
  ok(r.status === 400, '契約していない他のユーザーは、他人のSNSアカウントに予約できない');
  r = await req('POST', `/service/app/account/${accId}/disconnect`, { body: { csrf: otherCsrf } });
  ok(store.SnsAccounts.get(accId) !== null, '他のユーザーは他人の連携を解除できない');
  r = await req('GET', '/service/connect/threads');
  ok(r.status === 403, '契約していないと連携できない');
  cookie = savedCookie;

  console.log('解約');
  r = await req('POST', '/service/billing/cancel', { body: { csrf: 'bad' } });
  ok(r.status === 403, '解約もCSRFトークンが必要');
  r = await req('POST', '/service/billing/cancel', { body: { csrf: appCsrf } });
  ok(r.status === 302 && r.headers.location === '/service/app?f=sub_canceled', '解約の手続きができる');
  r = await req('GET', '/service/app');
  ok(r.text.includes('解約手続き済み') && r.text.includes('以降は更新されません') && r.text.includes('解約を取り消す'), '解約後は、利用できる期限と取り消しボタンを表示する');
  ok(store.Subscriptions.isActive(userIdForSub), '解約の手続き後も、期間末までは利用できる');
  r = await req('POST', '/service/billing/resume', { body: { csrf: appCsrf } });
  ok(r.headers.location === '/service/app?f=sub_resumed', '解約を取り消せる');
  // 支払いの確認が必要な状態の人が、2本目の契約を作れない（二重課金の防止）
  const checkoutCallsBefore = mock.calls.filter((c) => c.path === '/v1/checkout/sessions').length;
  await webhook({ id: 'evt_e2e_pd', type: 'customer.subscription.updated', created: Math.floor(Date.now() / 1000) + 5, data: { object: { ...subObj(), status: 'past_due' } } });
  ok(!store.Subscriptions.isActive(userIdForSub), 'past_due では利用できない');
  r = await req('GET', '/service/checkout');
  ok(r.status === 302 && r.headers.location === '/service/app', '契約が残っている人は、申込み画面を開いても、マイページへ戻される');
  r = await req('POST', '/service/checkout', { body: { csrf: appCsrf, agree: '1' } });
  ok(r.status === 302 && r.headers.location === '/service/app' && mock.calls.filter((c) => c.path === '/v1/checkout/sessions').length === checkoutCallsBefore, '直接POSTしても、2本目のStripe契約は作られない');
  await webhook({ id: 'evt_e2e_ok', type: 'customer.subscription.updated', created: Math.floor(Date.now() / 1000) + 10, data: { object: { ...subObj(), status: 'active' } } });
  ok(store.Subscriptions.isActive(userIdForSub), '支払いが回復すると、再び利用できる');
  await req('POST', '/service/billing/cancel', { body: { csrf: appCsrf } });
  r = await webhook({ id: 'evt_e2e_2', type: 'customer.subscription.deleted', data: { object: { ...subObj(), status: 'canceled' } } });
  subStatus = 'canceled';
  ok(r.status === 200 && !store.Subscriptions.isActive(userIdForSub), '契約が終了すると利用できなくなる');
  r = await req('GET', '/service/app');
  ok(r.text.includes('ご契約が有効ではありません') && r.text.includes('再度申し込む'), '終了後は、再度申し込む案内を表示する');
  r = await req('GET', '/service/billing/portal');
  ok(r.status === 302 && r.headers.location === 'https://portal.stripe.test/e2e', '支払い方法の変更画面（Stripe）へ移動できる');

  console.log('ログイン');
  cookie = '';
  r = await req('POST', '/service/login', { body: { email: 'e2e@example.com', password: 'wrong' } });
  ok(r.status === 401, '間違ったパスワードではログインできない');
  r = await req('POST', '/service/login', { body: { email: 'e2e@example.com', password: 'password123' } });
  ok(r.status === 302 && r.headers.location === '/service/app', '正しいパスワードでログインできる');
  for (let i = 0; i < 9; i++) await req('POST', '/service/login', { body: { email: 'lock@example.com', password: 'x' } });
  r = await req('POST', '/service/login', { body: { email: 'lock@example.com', password: 'x' } });
  ok(r.status === 429, '失敗が続くとログインを一時的に制限する');

  console.log('運営者画面');
  cookie = '';
  r = await req('GET', '/admin/service');
  ok(r.status === 302, '運営者画面はパスワードが必要');
  r = await req('POST', '/admin/login', { body: { password: 'adminpw' } });
  r = await req('GET', '/admin/service');
  ok(r.status === 200 && r.text.includes('e2e@example.com') && r.text.includes('契約者一覧'), '運営者は契約状況を確認できる');
  ok(r.text.includes('設定の確認') && r.text.includes('SNS_TOKEN_KEY') && !r.text.includes(process.env.SNS_TOKEN_KEY) && !r.text.includes('sk_test_x'), '設定の確認は、値を出さずに設定の有無だけを示す');

  console.log('テスト利用（運営者が付与・決済なし）');
  const adminCookie = cookie;
  cookie = '';
  r = await req('POST', '/service/signup', { body: { email: 'tester@example.com', password: 'testerpass1' } });
  const testerCookie = cookie;
  r = await req('GET', '/service/app');
  ok(!r.text.includes('テスト利用中') && r.text.includes('ご契約が有効ではありません'), '付与する前は使えない');
  cookie = adminCookie;
  r = await req('POST', '/admin/service/test-grant', { body: { email: 'nobody@example.com' } });
  ok(r.status === 400 && r.text.includes('見つかりません'), '存在しないアカウントには付与できない');
  const paidId = require('../db').Users.create({ email: 'paid@example.com', passwordHash: 'h', passwordSalt: 's' });
  store.Subscriptions.upsert(paidId, { stripe_subscription_id: 'sub_paid', status: 'active' });
  r = await req('POST', '/admin/service/test-grant', { body: { email: 'paid@example.com' } });
  ok(r.status === 400 && r.text.includes('Stripeの契約') && store.Subscriptions.get(paidId).status === 'active', 'Stripeで契約中のアカウントには付与しない');
  r = await req('POST', '/admin/service/test-grant', { body: { email: 'Tester@Example.com' } });
  ok(r.status === 200 && r.text.includes('テスト利用を付与しました'), 'テスト利用を付与できる（メールアドレスの大文字小文字は区別しない）');
  const testerId = store.Subscriptions.all().find((x) => x.email === 'tester@example.com').user_id;
  ok(store.Subscriptions.isActive(testerId), 'テスト利用は、契約中と同じく全機能を使える');
  cookie = testerCookie;
  r = await req('GET', '/service/app');
  ok(r.text.includes('テスト利用中') && r.text.includes('料金はかかりません') && !r.text.includes('解約する'), 'マイページにテスト利用中と表示し、解約ボタンは出さない');
  r = await req('GET', '/service/app/compose');
  ok(r.status === 200, 'テスト利用で投稿を作る画面を使える');
  r = await req('POST', '/service/app/apikey', { body: { csrf: csrfOf((await req('GET', '/service/app')).text), label: 't' } });
  const testerKey = (r.text.match(/sqk_[0-9a-f]{48}/) || [])[0];
  ok(!!testerKey, 'テスト利用でAPIキーを発行できる');
  cookie = adminCookie;
  r = await req('POST', '/admin/service/test-revoke', { body: { email: 'tester@example.com' } });
  ok(r.status === 200 && r.text.includes('取り消しました') && !store.Subscriptions.isActive(testerId), 'テスト利用を取り消せる');
  r = await api('GET', '/api/v1/accounts', testerKey);
  ok(r.status === 401, '取り消すと、APIキーも無効になる');
  r = await req('POST', '/admin/service/test-revoke', { body: { email: 'paid@example.com' } });
  ok(r.status === 400 && store.Subscriptions.get(paidId).status === 'active', 'テスト利用でないアカウントは取り消さない（Stripeの契約に影響しない）');
  cookie = '';
  r = await req('POST', '/admin/service/test-grant', { body: { email: 'tester@example.com' } });
  ok(r.status === 302 && !store.Subscriptions.isActive(testerId), '運営者でなければ付与できない');

  console.log('既存のアプリへの影響');
  cookie = '';
  r = await req('GET', '/');
  ok(r.status === 200, '既存のトップページは変わらず表示される');
  r = await req('GET', '/login');
  ok(r.status === 200, '既存のログイン画面は変わらず表示される');

  server.close();
  mock.restore();
  process.exit(summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
