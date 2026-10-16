'use strict';
// 月額SNS自動投稿サービスのロジックのテスト（課金・暗号化・SNS連携・予約実行・上限）
// 実行: npm test （node --experimental-sqlite test/service.test.js）
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-test-'));
process.env.SNS_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
// 各SNSの審査（SNS_APPROVED）を通った状態で試す（審査前の扱いは、後半で SNS_APPROVED を変えて確かめる）
process.env.SNS_APPROVED = 'threads,x,instagram,tiktok,facebook,youtube';
process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.STRIPE_PRICE_ID = 'price_test';
process.env.SERVICE_BASE_URL = 'https://example.test';
process.env.THREADS_APP_ID = 'th_id';
process.env.THREADS_APP_SECRET = 'th_secret';
process.env.X_CLIENT_ID = 'x_id';
process.env.X_CLIENT_SECRET = 'x_secret';

const { ok, summary, installHttpsMock } = require('./helpers');
const { Users } = require('../db');
const store = require('../lib/service-store');
const billing = require('../lib/billing');
const box = require('../lib/crypto-box');
const core = require('../lib/service-core');
const scheduler = require('../lib/sns/scheduler');
const registry = require('../lib/sns');
const { encodeForm } = require('../lib/http-client');

function mkUser(email) {
  return Users.create({ email, passwordHash: 'h', passwordSalt: 's' });
}
function sign(raw, secret, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

(async () => {
  console.log('暗号化');
  const k = box.keyFromEnv();
  const enc = box.encrypt('secret-token', k);
  ok(enc !== 'secret-token' && !enc.includes('secret-token'), '暗号文に平文が含まれない');
  ok(box.decrypt(enc, k) === 'secret-token', '復号できる');
  let threw = false;
  // 最後の1文字を、必ず別の文字に変える（元が 'A' だと改ざんにならないため）
  try { box.decrypt(enc.slice(0, -1) + (enc.slice(-1) === 'A' ? 'B' : 'A'), k); } catch { threw = true; }
  ok(threw, '改ざんされた暗号文は復号に失敗する');
  ok(box.keyFromEnv({ SNS_TOKEN_KEY: 'short' }) === null, '不正な鍵は無効');

  console.log('フォームエンコード');
  ok(encodeForm({ mode: 'subscription', line_items: [{ price: 'p', quantity: 1 }], metadata: { user_id: 'u1' } })
    === 'mode=subscription&line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Buser_id%5D=u1', 'Stripe形式のネストをエンコードできる');

  console.log('Webhook署名');
  const raw = JSON.stringify({ id: 'evt_1', type: 'x' });
  ok(billing.verifyWebhook(raw, sign(raw, 'whsec_test'), 'whsec_test'), '正しい署名を受け付ける');
  ok(!billing.verifyWebhook(raw, sign(raw, 'wrong'), 'whsec_test'), '誤った署名を拒否する');
  ok(!billing.verifyWebhook(raw + 'x', sign(raw, 'whsec_test'), 'whsec_test'), '本文が改ざんされていたら拒否する');
  ok(!billing.verifyWebhook(raw, sign(raw, 'whsec_test', Math.floor(Date.now() / 1000) - 3600), 'whsec_test'), '古い署名（再送攻撃）を拒否する');
  ok(!billing.verifyWebhook(raw, '', 'whsec_test'), '署名ヘッダーなしを拒否する');
  ok(billing.isConfigured(), '設定がそろっていれば課金が有効になる');
  ok(!billing.isConfigured({ STRIPE_SECRET_KEY: 'a' }), '設定が足りなければ課金は無効');

  console.log('課金（モックStripe）');
  const userA = mkUser('a@example.com');
  const userSync = mkUser('sync@example.com');
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  let subStatus = 'active';
  let cancelFlag = false;
  const mockStripe = installHttpsMock(async (c) => {
    if (c.host === 'api.stripe.com') {
      if (c.method === 'POST' && c.path === '/v1/checkout/sessions') return { status: 200, json: { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' } };
      if (c.method === 'GET' && c.path === '/v1/checkout/sessions/cs_done') return { status: 200, json: { id: 'cs_done', client_reference_id: userSync, status: 'complete', customer: 'cus_sync', subscription: 'sub_sync' } };
      if (c.method === 'GET' && c.path === '/v1/checkout/sessions/cs_open') return { status: 200, json: { id: 'cs_open', client_reference_id: userSync, status: 'open', customer: null, subscription: null } };
      if (c.method === 'GET' && c.path === '/v1/subscriptions/sub_sync') return { status: 200, json: { id: 'sub_sync', customer: 'cus_sync', status: 'active', current_period_end: periodEnd, cancel_at_period_end: false, metadata: { user_id: userSync }, items: { data: [{ price: { id: 'price_test' } }] } } };
      if (c.method === 'GET' && c.path === '/v1/subscriptions/sub_1') {
        return { status: 200, json: { id: 'sub_1', customer: 'cus_1', status: subStatus, current_period_end: periodEnd, cancel_at_period_end: cancelFlag, metadata: { user_id: userA }, items: { data: [{ price: { id: 'price_test' } }] } } };
      }
      if (c.method === 'POST' && c.path === '/v1/subscriptions/sub_1') {
        cancelFlag = /cancel_at_period_end=true/.test(c.body);
        return { status: 200, json: { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: periodEnd, cancel_at_period_end: cancelFlag, metadata: { user_id: userA }, items: { data: [{ price: { id: 'price_test' } }] } } };
      }
      if (c.method === 'POST' && c.path === '/v1/billing_portal/sessions') return { status: 200, json: { url: 'https://portal.stripe.test/p' } };
    }
    return null;
  });
  const url = await billing.createCheckoutSession({ userId: userA, email: 'a@example.com' });
  ok(url === 'https://checkout.stripe.test/cs_1', 'Checkout URLを取得できる');
  const body = mockStripe.calls[0].body;
  ok(/mode=subscription/.test(body) && /client_reference_id=/.test(body) && /price_test/.test(body), 'Checkoutにサブスクリプション・価格・ユーザーIDを渡す');
  ok(/customer_email=a%40example.com/.test(body), '初回はメールアドレスを事前入力する');
  ok(/payment_method_types%5B0%5D=card(&|$)/.test(body) && !/payment_method_types%5B1%5D/.test(body), 'お支払い方法はクレジットカードだけを指定する（特商法表記・利用規約・画面の記載と合わせる）');
  ok(mockStripe.calls[0].headers.Authorization === 'Bearer sk_test_x', 'APIキーをBearerで送る');

  ok(!store.Subscriptions.isActive(userA), '決済前は契約中ではない');
  await billing.handleEvent({ id: 'evt_a', type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: userA, customer: 'cus_1', subscription: 'sub_1' } } });
  ok(store.Subscriptions.isActive(userA), 'Checkout完了のWebhookで契約中になる');
  const s1 = store.Subscriptions.get(userA);
  ok(s1.stripe_customer_id === 'cus_1' && s1.stripe_subscription_id === 'sub_1' && s1.price_id === 'price_test', '顧客ID・契約ID・価格IDを保存する');
  ok(Math.abs(Date.parse(s1.current_period_end) - periodEnd * 1000) < 1000, '次回更新日を保存する');
  const callsBefore = mockStripe.calls.length;
  const dup = await billing.handleEvent({ id: 'evt_a', type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: userA, customer: 'cus_1', subscription: 'sub_1' } } });
  ok(dup.duplicate && mockStripe.calls.length === callsBefore, '同じイベントの再送は二重に処理しない');

  await billing.handleEvent({ id: 'evt_b', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'past_due', current_period_end: periodEnd, cancel_at_period_end: false, metadata: {}, items: { data: [] } } } });
  ok(!store.Subscriptions.isActive(userA) && store.Subscriptions.get(userA).status === 'past_due', '支払い失敗（past_due）では利用できなくなる');
  await billing.handleEvent({ id: 'evt_c', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: periodEnd, cancel_at_period_end: false, metadata: {}, items: { data: [] } } } });
  ok(store.Subscriptions.isActive(userA), '支払いが回復すると再び利用できる');

  const canceled = await billing.setCancelAtPeriodEnd(userA, true);
  ok(canceled.cancel_at_period_end === 1 && store.Subscriptions.isActive(userA), '解約手続きをしても期間末までは利用できる');
  const resumed = await billing.setCancelAtPeriodEnd(userA, false);
  ok(resumed.cancel_at_period_end === 0, '解約を取り消せる');
  const endAcc = store.SnsAccounts.upsert({ userId: userA, platform: 'threads', externalUserId: 'end1', handle: '@end', accessTokenEnc: box.encrypt('tok', k), expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const endPost = store.ScheduledPosts.create({ userId: userA, accountId: endAcc, text: 't', scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  await billing.handleEvent({ id: 'evt_d', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', current_period_end: periodEnd, cancel_at_period_end: false, metadata: {}, items: { data: [] } } } });
  ok(!store.Subscriptions.isActive(userA), '契約が終了すると利用できなくなる');
  ok(store.SnsAccounts.get(endAcc) === null && store.ScheduledPosts.get(endPost).status === 'cancelled', '契約が終了すると、保存しているSNSの連携情報（トークン）を削除し、未投稿の予約を取り消す');
  const portal = await billing.createPortalSession('cus_1');
  ok(portal === 'https://portal.stripe.test/p', 'カード変更用のポータルURLを取得できる');
  // 決済ページから戻った直後の同期（Webhookの到着前でも、2本目の契約を作らせないため）
  ok(!(await billing.syncCheckoutSession(userSync, 'cs_open')) && !store.Subscriptions.isActive(userSync), '決済が完了していないセッションでは契約中にならない');
  ok(!(await billing.syncCheckoutSession(userA, 'cs_done')) && !store.Subscriptions.isActive(userA === userSync ? '' : userSync), '他のユーザーのセッションは反映しない');
  ok(!(await billing.syncCheckoutSession(userSync, '../etc')), '不正なセッションIDは拒否する');
  ok((await billing.syncCheckoutSession(userSync, 'cs_done')) && store.Subscriptions.isActive(userSync) && store.Subscriptions.get(userSync).stripe_subscription_id === 'sub_sync', '本人の完了したセッションは、Webhookより先に契約中にできる');

  // 再契約したあとに届く、古い契約の「終了」イベントで、いまの契約を終了扱いにしない
  const keepAcc = store.SnsAccounts.upsert({ userId: userSync, platform: 'threads', externalUserId: 'keep1', handle: '@keep', accessTokenEnc: box.encrypt('tok', k), expiresAt: new Date(Date.now() + 86400000).toISOString() });
  await billing.handleEvent({ id: 'evt_old_deleted', type: 'customer.subscription.deleted', created: Math.floor(Date.now() / 1000) - 5, data: { object: { id: 'sub_old', customer: 'cus_sync', status: 'canceled', current_period_end: periodEnd, cancel_at_period_end: false, metadata: { user_id: userSync }, items: { data: [] } } } });
  ok(store.Subscriptions.isActive(userSync) && store.Subscriptions.get(userSync).stripe_subscription_id === 'sub_sync' && store.SnsAccounts.get(keepAcc) !== null, '再契約のあとに届いた古い契約の終了イベントでは、いまの契約も連携情報も変わらない');
  // 時刻の情報がないイベント（順序制御が働かない場合）でも、古い契約の終了では、いまの契約を変えない
  await billing.handleEvent({ id: 'evt_old_deleted2', type: 'customer.subscription.deleted', data: { object: { id: 'sub_old2', customer: 'cus_sync', status: 'canceled', current_period_end: periodEnd, cancel_at_period_end: false, metadata: { user_id: userSync }, items: { data: [] } } } });
  ok(store.Subscriptions.isActive(userSync) && store.SnsAccounts.get(keepAcc) !== null, '時刻のない古い契約の終了イベントでも、いまの契約と連携情報は変わらない（契約IDの照合）');
  // 順不同で届いた古いイベントで、新しい状態を上書きしない
  const T = Math.floor(Date.now() / 1000) + 1000;
  const subEv = (id, status, created) => ({ id, type: 'customer.subscription.updated', created, data: { object: { id: 'sub_1', customer: 'cus_1', status, current_period_end: periodEnd, cancel_at_period_end: false, metadata: {}, items: { data: [] } } } });
  await billing.handleEvent(subEv('evt_o2', 'canceled', T + 20));
  await billing.handleEvent(subEv('evt_o1', 'active', T + 10));
  ok(!store.Subscriptions.isActive(userA) && store.Subscriptions.get(userA).status === 'canceled', '後から届いた古いイベントで、解約済みが契約中に戻らない');
  await billing.handleEvent(subEv('evt_o3', 'active', T + 30));
  ok(store.Subscriptions.isActive(userA), 'より新しいイベントは反映される');

  mockStripe.restore();
  // 再契約（同じユーザーで再度 active）
  subStatus = 'active';

  console.log('SNS連携（モックThreads/X）');
  const userB = mkUser('b@example.com');
  store.Subscriptions.upsert(userB, { status: 'active', stripe_customer_id: 'cus_b', stripe_subscription_id: 'sub_b', current_period_end: new Date(Date.now() + 86400000).toISOString() });
  let threadsPublishFail = null; // null | {status, message}
  let threadsPermalinkFail = false; // true：投稿へのリンク（permalink）の取得だけを失敗させる
  let xTokenCalls = 0;
  const mockSns = installHttpsMock(async (c) => {
    if (c.host === 'graph.threads.net') {
      if (c.path === '/oauth/access_token') return { status: 200, json: { access_token: 'th_short', user_id: 777 } };
      if (c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: 'th_long', expires_in: 5184000 } };
      if (c.path.startsWith('/v1.0/me?')) return { status: 200, json: { id: '777', username: 'taro' } };
      if (c.path === '/v1.0/777/threads') {
        if (threadsPublishFail) return { status: threadsPublishFail.status, json: { error: { message: threadsPublishFail.message } } };
        return { status: 200, json: { id: 'container_1' } };
      }
      if (c.path === '/v1.0/777/threads_publish') return { status: 200, json: { id: 'thread_post_1' } };
      if (c.method === 'GET' && /^\/v1\.0\/container_\d+\?fields=status/.test(c.path)) return { status: 200, json: { status: 'FINISHED' } };
      if (c.method === 'GET' && c.path.startsWith('/v1.0/thread_post_1?')) {
        if (threadsPermalinkFail) return { status: 500, json: { error: { message: 'permalink down' } } };
        return { status: 200, json: { id: 'thread_post_1', permalink: 'https://www.threads.net/@taro/post/P1' } };
      }
      if (c.path.startsWith('/refresh_access_token?')) return { status: 200, json: { access_token: 'th_long_2', expires_in: 5184000 } };
    }
    if (c.host === 'api.x.com') {
      if (c.path === '/2/oauth2/token') {
        xTokenCalls++;
        if (/grant_type=refresh_token/.test(c.body)) return { status: 200, json: { access_token: 'x_access_2', refresh_token: 'x_refresh_2', expires_in: 7200 } };
        return { status: 200, json: { access_token: 'x_access_1', refresh_token: 'x_refresh_1', expires_in: 7200 } };
      }
      if (c.path === '/2/users/me') return { status: 200, json: { data: { id: '555', username: 'taro_x' } } };
      if (c.path === '/2/tweets') return { status: 201, json: { data: { id: 'tweet_1' } } };
    }
    return null;
  });

  const th = core.startConnect({ userId: userB, platform: 'threads' });
  ok(th.ok && th.url.startsWith('https://threads.com/oauth/authorize?') && th.url.includes('threads_content_publish') && th.url.includes('threads_manage_replies'), 'Threadsの認可URLを作れる');
  const thState = new URL(th.url).searchParams.get('state');
  const bad = await core.finishConnect({ userId: userB, platform: 'threads', code: 'c', state: 'wrong' });
  ok(!bad.ok, '不正なstateでは連携できない');
  const reuse = await core.finishConnect({ userId: userB, platform: 'threads', code: 'c', state: thState });
  ok(reuse.ok, 'Threadsの連携が完了する');
  const accs = store.SnsAccounts.listForUser(userB);
  ok(accs.length === 1 && accs[0].handle === '@taro' && accs[0].external_user_id === '777', '連携したアカウント情報を保存する');
  ok(!accs[0].access_token_enc.includes('th_long') && box.decrypt(accs[0].access_token_enc, k) === 'th_long', 'アクセストークンは暗号化して保存する');
  const replay = await core.finishConnect({ userId: userB, platform: 'threads', code: 'c', state: thState });
  ok(!replay.ok, 'stateは一度しか使えない');

  const xc = core.startConnect({ userId: userB, platform: 'x' });
  ok(xc.ok && /code_challenge_method=S256/.test(xc.url) && /offline.access/.test(xc.url), 'XのPKCE認可URLを作れる');
  const xState = new URL(xc.url).searchParams.get('state');
  const xr = await core.finishConnect({ userId: userB, platform: 'x', code: 'xc', state: xState });
  ok(xr.ok, 'Xの連携が完了する');
  const xBody = mockSns.calls.find((c) => c.path === '/2/oauth2/token').body;
  ok(/code_verifier=/.test(xBody), 'XのトークンAPIにPKCEのverifierを送る');
  ok(mockSns.calls.find((c) => c.path === '/2/oauth2/token').headers.Authorization.startsWith('Basic '), 'XのトークンAPIにクライアント認証を付ける');
  const allAcc = store.SnsAccounts.listForUser(userB);
  ok(allAcc.length === 2, 'ThreadsとXの2アカウントが連携済み');
  const thAcc = allAcc.find((a) => a.platform === 'threads');
  const xAcc = allAcc.find((a) => a.platform === 'x');

  console.log('予約の作成と上限');
  const soon = new Date(Date.now() + 5000).toISOString();
  ok(!core.createPosts({ userId: userB, accountIds: [thAcc.id], text: '   ', scheduledAtIso: soon }).ok, '空の本文は予約できない');
  ok(!core.createPosts({ userId: userB, accountIds: [], text: 'a', scheduledAtIso: soon }).ok, '投稿先なしは予約できない');
  ok(!core.createPosts({ userId: userB, accountIds: [thAcc.id], text: 'a', scheduledAtIso: new Date(Date.now() - 3600000).toISOString() }).ok, '過去の日時は予約できない');
  ok(!core.createPosts({ userId: userB, accountIds: [thAcc.id], text: 'a', scheduledAtIso: new Date(Date.now() + 91 * 86400000).toISOString() }).ok, '90日より先は予約できない');
  ok(!core.createPosts({ userId: userB, accountIds: [thAcc.id], text: 'あ'.repeat(501), scheduledAtIso: soon }).ok, 'Threadsは500文字を超えると予約できない');
  ok(core.createPosts({ userId: userB, accountIds: [xAcc.id], text: 'あ'.repeat(140), scheduledAtIso: soon }).ok, 'Xは日本語140文字（重み280）まで予約できる');
  ok(!core.createPosts({ userId: userB, accountIds: [xAcc.id], text: 'あ'.repeat(141), scheduledAtIso: soon }).ok, 'Xは日本語141文字（重み282）で予約できない');
  const other = mkUser('c@example.com');
  ok(!core.createPosts({ userId: other, accountIds: [thAcc.id], text: 'a', scheduledAtIso: soon }).ok, '契約していないユーザーは予約できない');
  store.Subscriptions.upsert(other, { status: 'active' });
  ok(!core.createPosts({ userId: other, accountIds: [thAcc.id], text: 'a', scheduledAtIso: soon }).ok, '他人のSNSアカウントには予約できない');
  ok(core.jstLocalToIso('2026-10-14T09:30') === '2026-10-14T00:30:00.000Z', '日本時間の入力をUTCに直せる');
  ok(core.jstLocalToIso('bad') === null, '不正な日時はnull');

  console.log('予約の実行（スケジューラ）');
  const mk = (accountId, text) => core.createPosts({ userId: userB, accountIds: [accountId], text, scheduledAtIso: new Date(Date.now() + 1000).toISOString() }).ids[0];
  const p1 = mk(thAcc.id, 'テスト投稿1');
  await new Promise((r) => setTimeout(r, 1200));
  ok((await scheduler.tick()) >= 1, '実行時刻が来た予約を処理する');
  const done1 = store.ScheduledPosts.get(p1);
  ok(done1.status === 'posted' && done1.external_id === 'thread_post_1', 'Threadsへ投稿して投稿IDを記録する');
  const pubCall = mockSns.calls.find((c) => c.path === '/v1.0/777/threads');
  ok(/media_type=TEXT/.test(pubCall.body) && /text=%E3%83%86%E3%82%B9%E3%83%88/.test(pubCall.body), '本文をThreadsのAPIに渡す');
  // 投稿へのリンク（permalink）：投稿済みにしたあとで取得して保存する。取れなくても投稿は成功のまま
  const pubIdx = mockSns.calls.findIndex((c) => c.path === '/v1.0/777/threads_publish');
  const plIdx = mockSns.calls.findIndex((c) => c.method === 'GET' && c.path.startsWith('/v1.0/thread_post_1?'));
  ok(done1.permalink === 'https://www.threads.net/@taro/post/P1' && plIdx > pubIdx && new URLSearchParams(mockSns.calls[plIdx].path.split('?')[1]).get('fields') === 'permalink', '投稿したあとで、投稿へのリンク（permalink）を GET /{media-id}?fields=permalink で取得して保存する');
  threadsPermalinkFail = true;
  const p1b = mk(thAcc.id, 'リンク取得の失敗');
  await new Promise((r) => setTimeout(r, 1200));
  await scheduler.tick();
  const done1b = store.ScheduledPosts.get(p1b);
  ok(done1b.status === 'posted' && done1b.external_id === 'thread_post_1' && done1b.permalink === '' && done1b.last_error === '' && done1b.attempts === 1, 'リンクの取得に失敗しても、投稿は成功のまま（リンクを出さないだけ。再試行もしない）');
  threadsPermalinkFail = false;
  {
    const thAdapter = registry.get('threads');
    const origPl = thAdapter.permalink;
    thAdapter.permalink = async () => { throw new Error('予期しない失敗'); };
    const p1c = mk(thAcc.id, 'リンク取得の例外');
    await new Promise((r) => setTimeout(r, 1200));
    const origErr = console.error; console.error = () => {};
    try { await scheduler.tick(); } finally { console.error = origErr; thAdapter.permalink = origPl; }
    const done1c = store.ScheduledPosts.get(p1c);
    ok(done1c.status === 'posted' && done1c.external_id === 'thread_post_1' && done1c.permalink === '' && done1c.last_error === '', 'リンクの取得で例外が起きても、投稿は失敗にしない');
  }
  {
    // リンクを保存するのは、投稿済みで、連携が残っているときだけ（取得の間に解除・削除の求めがあったら残さない）
    const tmp = store.SnsAccounts.upsert({ userId: userB, platform: 'threads', externalUserId: 'pl_tmp', handle: '@pl', accessTokenEnc: box.encrypt('t', k), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    const tmpId = typeof tmp === 'object' ? tmp.id : tmp;
    const pp = store.ScheduledPosts.create({ userId: userB, accountId: tmpId, text: 'リンクの保存', scheduledAt: new Date(Date.now() + 3600000).toISOString() });
    ok(!store.ScheduledPosts.setPermalink(pp, 'https://www.threads.net/@pl/post/X') && store.ScheduledPosts.get(pp).permalink === '', 'まだ投稿していない予約には、リンクを保存しない');
    store.ScheduledPosts.markPosted(pp, 'ext_pl');
    ok(store.ScheduledPosts.setPermalink(pp, 'https://www.threads.net/@pl/post/X') && store.ScheduledPosts.get(pp).permalink === 'https://www.threads.net/@pl/post/X', '投稿済みの予約に、リンクを保存できる');
    store.SnsAccounts.remove(tmpId, userB);
    ok(!store.ScheduledPosts.setPermalink(pp, 'https://www.threads.net/@pl/post/X') && store.ScheduledPosts.get(pp).permalink === '' && store.ScheduledPosts.get(pp).external_id === '', '連携を解除したあとは、リンクを保存しない（解除のときに、保存していたリンクも消える）');
  }

  // 失敗→再試行
  threadsPublishFail = { status: 500, message: 'server error' };
  const p2 = mk(thAcc.id, '再試行テスト');
  await new Promise((r) => setTimeout(r, 1200));
  await scheduler.tick();
  const r2 = store.ScheduledPosts.get(p2);
  ok(r2.status === 'pending' && r2.attempts === 1 && Date.parse(r2.scheduled_at) > Date.now() + 4 * 60 * 1000, '一時的なエラーは5分後に自動で再試行する');
  ok(/再試行/.test(r2.last_error), '再試行する旨を記録する');
  // 再試行を使い切る
  store.ScheduledPosts.reschedule(p2, new Date(Date.now() - 1000).toISOString(), 'x'); await scheduler.tick();
  store.ScheduledPosts.reschedule(p2, new Date(Date.now() - 1000).toISOString(), 'x'); await scheduler.tick();
  ok(store.ScheduledPosts.get(p2).status === 'failed', '再試行を使い切ると失敗になる');
  // 認証エラー
  threadsPublishFail = { status: 401, message: 'token expired' };
  const p3 = mk(thAcc.id, '認証エラー');
  await new Promise((r) => setTimeout(r, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(p3).status === 'failed' && store.SnsAccounts.get(thAcc.id).status === 'reauth_required', '認証エラーは再連携が必要な状態にして失敗にする');
  ok(!core.createPosts({ userId: userB, accountIds: [thAcc.id], text: 'a', scheduledAtIso: soon }).ok, '再連携が必要なアカウントには予約できない');
  threadsPublishFail = null;

  // X：期限切れ間近のトークンは更新してから投稿する
  const xRow = store.SnsAccounts.get(xAcc.id);
  store.SnsAccounts.updateTokens(xAcc.id, { accessTokenEnc: xRow.access_token_enc, refreshTokenEnc: xRow.refresh_token_enc, expiresAt: new Date(Date.now() + 60 * 1000).toISOString() });
  // 期限を近づけた後に送られた投稿だけを見る（前の節で「予約の作成と上限」が作ったXの予約は、時刻によっては、それより前の処理で更新前のトークンのまま送られる）
  const callsBeforeX = mockSns.calls.length;
  const p4 = mk(xAcc.id, 'Xへの投稿');
  await new Promise((r) => setTimeout(r, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(p4).status === 'posted' && store.ScheduledPosts.get(p4).external_id === 'tweet_1', 'Xへ投稿して投稿IDを記録する');
  ok(xTokenCalls >= 2, '期限が近いトークンは先に更新する');
  const tweetCalls = mockSns.calls.slice(callsBeforeX).filter((c) => c.path === '/2/tweets');
  ok(tweetCalls.length >= 1 && tweetCalls.every((c) => c.headers.Authorization === 'Bearer x_access_2'), '更新後のアクセストークンで投稿する');
  ok(box.decrypt(store.SnsAccounts.get(xAcc.id).refresh_token_enc, k) === 'x_refresh_2', '新しいリフレッシュトークンを暗号化して保存する');

  // 契約が切れたら投稿しない
  const p5 = mk(xAcc.id, '契約切れ');
  store.Subscriptions.upsert(userB, { status: 'canceled' });
  await new Promise((r) => setTimeout(r, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(p5).status === 'failed' && /契約/.test(store.ScheduledPosts.get(p5).last_error), '契約が終了していたら投稿しない');
  store.Subscriptions.upsert(userB, { status: 'active' });

  // 取り消し・連携解除
  const p6 = mk(xAcc.id, '取り消し');
  ok(store.ScheduledPosts.cancel(p6, userB) && store.ScheduledPosts.get(p6).status === 'cancelled', '未投稿の予約を取り消せる');
  ok(!store.ScheduledPosts.cancel(p6, other), '他人の予約は取り消せない');
  const p7 = mk(xAcc.id, '連携解除で取り消し');
  store.SnsAccounts.remove(xAcc.id, userB);
  ok(store.ScheduledPosts.get(p7).status === 'cancelled' && !store.SnsAccounts.get(xAcc.id), '連携を解除すると未投稿の予約も取り消す');

  // 二重実行防止
  const p8 = store.ScheduledPosts.create({ userId: userB, accountId: thAcc.id, text: 'claim', scheduledAt: new Date(Date.now() - 1000).toISOString() });
  const c1 = store.ScheduledPosts.claimDue(10, new Date().toISOString());
  const c2 = store.ScheduledPosts.claimDue(10, new Date().toISOString());
  ok(c1.some((p) => p.id === p8) && !c2.some((p) => p.id === p8), '同じ予約を二重に確保しない');
  const p9 = store.ScheduledPosts.create({ userId: userB, accountId: thAcc.id, text: 'claim2', scheduledAt: new Date(Date.now() - 1000).toISOString() });
  store.ScheduledPosts.claimDue(10, new Date().toISOString());
  store.ScheduledPosts.markStarted(p8); // p8 は送り始めていた、p9 はまだ送っていなかった（まとめて確保したうちの後ろ）
  store.ScheduledPosts.failStuck(new Date(Date.now() + 1000).toISOString());
  ok(store.ScheduledPosts.get(p8).status === 'failed' && /再起動/.test(store.ScheduledPosts.get(p8).last_error), '送り始めていたのに処理中のまま残った予約は、二重投稿を避けて失敗扱いにする');
  ok(store.ScheduledPosts.get(p9).status === 'pending' && store.ScheduledPosts.get(p9).attempts === 0, 'まだ送り始めていなかった予約は、失敗にせず予約に戻す（試行回数も戻す）');
  store.ScheduledPosts.cancel(p9, userB);
  // 列（started_at）を足す前の版で処理中だった予約は、新しい版で開いたときに「送り始めていた」扱いになり、もう一度送られない
  {
    const { execFileSync } = require('child_process');
    const migDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-mig-'));
    const { DatabaseSync } = require('node:sqlite');
    const old = new DatabaseSync(path.join(migDir, 'ai-bijika.db'));
    old.exec(`CREATE TABLE scheduled_posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, text TEXT NOT NULL, scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT DEFAULT '', external_id TEXT DEFAULT '', posted_at TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    const t = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    old.prepare("INSERT INTO scheduled_posts (id, user_id, account_id, text, scheduled_at, status, attempts, created_at, updated_at) VALUES ('old1','u','a','x',?, 'publishing', 1, ?, ?)").run(t, t, t);
    old.close();
    const out = execFileSync(process.execPath, ['--experimental-sqlite', '-e', `const s=require(${JSON.stringify(path.join(__dirname, '..', 'lib', 'service-store'))});s.ScheduledPosts.failStuck(new Date(Date.now()-5*60*1000).toISOString(), new Date(Date.now()+1000).toISOString());const r=s.ScheduledPosts.get('old1');process.stdout.write(JSON.stringify({status:r.status,started:r.started_at}));`],
      { env: { ...process.env, DATA_DIR: migDir }, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const mig = JSON.parse(out);
    ok(mig.status === 'failed' && mig.started !== '', '列を足す前の版で処理中だった予約は、送り始めていた扱いにして、もう一度送らない（失敗として確認をお願いする）');
  }
  // 起動時は、まだ送り始めていない予約を、経過時間に関係なくすぐ予約に戻す
  const p10 = store.ScheduledPosts.create({ userId: userB, accountId: thAcc.id, text: 'claim3', scheduledAt: new Date(Date.now() - 1000).toISOString() });
  store.ScheduledPosts.claimDue(10, new Date().toISOString());
  store.ScheduledPosts.failStuck(new Date(Date.now() - 5 * 60 * 1000).toISOString(), new Date(Date.now() + 1000).toISOString());
  ok(store.ScheduledPosts.get(p10).status === 'pending', '起動時は、まだ送り始めていない予約を、確保したばかりでもすぐ予約に戻す（遅れないように）');
  store.ScheduledPosts.cancel(p10, userB);
  // 複数の行の書き込みは、途中で失敗したら何も残さない
  let txErr = null; let txId = null;
  try { store.transaction(() => { txId = store.ScheduledPosts.create({ userId: userB, accountId: thAcc.id, text: 'tx', scheduledAt: new Date(Date.now() + 3600000).toISOString() }); throw new Error('途中で失敗'); }); } catch (e) { txErr = e; }
  ok(txErr && txId && store.ScheduledPosts.get(txId) === null, 'transaction は、途中で失敗したら書き込みを1件も残さない');
  // createPost：2つの投稿先のうち2件目の作成で失敗したら、1件目も残さない（下書きの置き換えで二重にならない）
  {
    const mkAcc = (ext) => { const r = store.SnsAccounts.upsert({ userId: userB, platform: 'threads', externalUserId: ext, handle: `@${ext}`, accessTokenEnc: box.encrypt('t', k), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }); return typeof r === 'object' ? r.id : r; };
    const thAcc1Id = mkAcc('tx1'); const thAcc2Id = mkAcc('tx2');
    const origCreate = store.ScheduledPosts.create;
    let calls = 0;
    store.ScheduledPosts.create = function (...a) { calls++; if (calls === 2) throw new Error('2件目で失敗'); return origCreate.apply(this, a); };
    const before = store.ScheduledPosts.listForUser(userB).length;
    let cpErr = null;
    try { core.createPost({ userId: userB, category: 'text', targets: [{ accountId: thAcc1Id, caption: 'tx-a' }, { accountId: thAcc2Id, caption: 'tx-b' }], mediaIds: [], tree: [], scheduledAtIso: new Date(Date.now() + 3600000).toISOString(), draft: false }); } catch (e) { cpErr = e; }
    store.ScheduledPosts.create = origCreate;
    ok(cpErr && calls === 2 && store.ScheduledPosts.listForUser(userB).length === before, '予約の作成（createPost）は、2件目の作成で失敗したら1件目も残さない（下書きの置き換えで二重にならない）');
    store.SnsAccounts.remove(thAcc1Id, userB); store.SnsAccounts.remove(thAcc2Id, userB);
  }

  // 長期トークンの定期延長：期限まで7日を切った Threads の連携を、投稿が無くても延長する
  const soonAcc = store.SnsAccounts.upsert({ userId: userA, platform: 'threads', externalUserId: 'soon1', handle: '@soon', accessTokenEnc: box.encrypt('old_long', k), expiresAt: new Date(Date.now() + 3 * 86400000).toISOString() });
  const refreshedN = await scheduler.refreshExpiring();
  const soonId = typeof soonAcc === 'object' ? soonAcc.id : soonAcc;
  const afterRefresh = store.SnsAccounts.get(soonId);
  ok(refreshedN >= 1 && box.decrypt(afterRefresh.access_token_enc, k) === 'th_long_2' && Date.parse(afterRefresh.expires_at) > Date.now() + 50 * 86400000, '期限が近い Threads の連携を、投稿が無くても定期的に延長する');
  mockSns.restore();

  console.log('審査済みのSNS（SNS_APPROVED）');
  {
    const ui = require('../lib/service-ui');
    const savedApproved = process.env.SNS_APPROVED;
    ok([...core.approvedSns({ SNS_APPROVED: ' Threads , instagram,, ' })].join() === 'threads,instagram', 'SNS_APPROVED は、カンマ区切りで読む（前後の空白・大文字小文字・空の項目は気にしない）');
    process.env.SNS_APPROVED = ''; // Threads・X のキーは設定済み。どちらも審査前
    const general = mkUser('approval-general@example.com');
    store.Subscriptions.upsert(general, { stripe_subscription_id: 'sub_approval', status: 'active' });
    const tester = mkUser('approval-tester@example.com');
    billing.grantTest(tester);
    const gSub = store.Subscriptions.get(general);
    const tSub = store.Subscriptions.get(tester);
    ok(core.liveSns().length === 0 && core.liveSns({ sub: gSub }).length === 0, '審査済みのSNSが無ければ、キーが設定済みでも、一般の利用者には使えるSNSとして出さない');
    ok(core.liveSns({ sub: tSub }).map((p) => p.id).join() === 'threads,x', 'テスト利用の利用者には、キーが設定済みなら、審査前のSNSも使えるSNSに含める（キーの無いSNSは含めない）');
    ok(core.connectMode('threads', gSub) === '' && core.connectMode('threads', tSub) === 'test' && core.connectMode('instagram', tSub) === '', '連携できるかの判定：審査前は、テスト利用の利用者だけ（キーの無いSNSは、テスト利用でも不可）');
    let h = ui.dashboardPage({ user: { id: general, email: 'g' }, sub: gSub, accounts: [], posts: [], csrf: 'c', snsReady: true });
    ok(!h.includes('href="/service/connect/threads"') && h.includes('Threads：準備中') && !h.includes('審査前（テスト利用のみ）'), '審査前のSNSは、一般の利用者のマイページでは「準備中」と表示し、連携ボタンを出さない');
    h = ui.dashboardPage({ user: { id: tester, email: 't' }, sub: tSub, accounts: [], posts: [], csrf: 'c', snsReady: true });
    ok(h.includes('href="/service/connect/threads"') && h.includes('審査前（テスト利用のみ）') && h.includes('Instagram：準備中') && !h.includes('href="/service/connect/instagram"'), 'テスト利用の利用者には、審査前のSNSの連携ボタンを「審査前（テスト利用のみ）」と添えて出す（キーの無いSNSは準備中のまま）');
    const thAccView = [{ id: 'a1', platform: 'threads', status: 'active', handle: 'x' }];
    ok(ui.composePage({ user: { email: 't' }, accounts: thAccView, csrf: 'c', sub: tSub }).includes('value="tree"') && !ui.composePage({ user: { email: 'g' }, accounts: thAccView, csrf: 'c', sub: gSub }).includes('value="tree"'), '「投稿を作る」画面のツリーは、テスト利用の利用者には審査前のThreadsでも出し、一般の利用者には出さない');
    ok(ui.landingPage({ user: null, billingReady: false }).includes('対応SNSは準備中です'), '審査済みのSNSが無ければ、販売ページの対応SNSは「準備中」');
    const gStart = core.startConnect({ userId: general, platform: 'threads' });
    ok(!gStart.ok && gStart.error.includes('準備中'), '審査前のSNSは、一般の利用者が連携を始めようとしても、サーバー側で断る');
    const tStart = core.startConnect({ userId: tester, platform: 'threads' });
    ok(tStart.ok && tStart.url.startsWith('https://threads.com/oauth/authorize?'), 'テスト利用の利用者は、審査前のSNSでも連携を始められる');
    const gState = store.OAuthStates.create({ userId: general, platform: 'threads', codeVerifier: '' });
    const gFinish = await core.finishConnect({ userId: general, platform: 'threads', code: 'c', state: gState });
    ok(!gFinish.ok && store.SnsAccounts.listForUser(general).length === 0, '連携の完了の時点でも、審査前のSNSを一般の利用者の連携として保存しない');
    billing.revokeTest(tester);
    const tFinish = await core.finishConnect({ userId: tester, platform: 'threads', code: 'c', state: new URL(tStart.url).searchParams.get('state') });
    ok(!tFinish.ok && store.SnsAccounts.listForUser(tester).length === 0, '連携を始めた後にテスト利用が取り消されたら、審査前のSNSの連携を完了しない');

    process.env.SNS_APPROVED = 'threads';
    const g2 = store.Subscriptions.get(general);
    h = ui.dashboardPage({ user: { id: general, email: 'g' }, sub: g2, accounts: [], posts: [], csrf: 'c', snsReady: true });
    ok(h.includes('href="/service/connect/threads"') && !h.includes('審査前（テスト利用のみ）') && h.includes('X：準備中'), '審査済み（SNS_APPROVED）のSNSは、一般の利用者にも連携ボタンを出す（審査前のXは準備中のまま）');
    ok(core.startConnect({ userId: general, platform: 'threads' }).ok && !core.startConnect({ userId: general, platform: 'x' }).ok, '一般の利用者は、審査済みのSNSだけ連携を始められる');
    ok(ui.landingPage({ user: null, billingReady: false }).includes('現在の対応SNSは、Threadsです'), '販売ページの対応SNSは、審査済みのSNSだけを書く');

    console.log('販売の開始と審査済みのSNS');
    const legalTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-legal-'));
    for (const f of core.LEGAL_FILES) {
      const t = fs.readFileSync(path.join(__dirname, '..', 'legal', f), 'utf8');
      fs.writeFileSync(path.join(legalTmp, f), t.replace(/【(?!メールアドレス】|代表者の氏名】|サービス名】)([^】]+)】/g, (m, x) => (x.trim() ? `（記入済み：${x}）` : m)));
    }
    Object.assign(process.env, { SERVICE_OPEN: 'true', SERVICE_CONTACT_EMAIL: 'support@example.com', SERVICE_REPRESENTATIVE: '代表 太郎', SERVICE_LEGAL_DIR: legalTmp });
    ok(core.legalPlaceholders().length === 0 && core.salesOpen(), '設定がそろい、審査済みのSNS（キーあり）があれば、販売を開始する');
    process.env.SNS_APPROVED = '';
    ok(!core.salesOpen(), '審査済みのSNSが無ければ、キーが設定済みでも、SERVICE_OPEN=true でも販売を開始しない');
    process.env.SNS_APPROVED = 'instagram';
    ok(!core.salesOpen(), '審査済みのSNSのキーが未設定なら、販売を開始しない');
    const chk = (env, name) => ui.settingsChecklist(env).find((row) => row[0] === name);
    const rowA = chk({ ...process.env, SNS_APPROVED: 'threads,instagram,thread' }, '審査済みのSNS（SNS_APPROVED）');
    ok(rowA && rowA[1] === true && rowA[2].includes('一般の利用者に出すSNS：Threads') && rowA[2].includes('キーが未設定のため出していないSNS：Instagram') && rowA[2].includes('知らない id（綴りを確かめる）：thread'), '運営者画面の設定の確認に、審査済みのSNSと、キーの無いもの・綴りの違うidを出す');
    ok(chk({ ...process.env, SNS_APPROVED: '' }, '審査済みのSNS（SNS_APPROVED）')[1] === false, '審査済みのSNSが無ければ、設定の確認で未設定と示す');

    console.log('法務文書の確定（LEGAL_FINAL）');
    process.env.SNS_APPROVED = ''; // 販売は開始していない状態（salesOpen() が偽）
    delete process.env.LEGAL_FINAL;
    const privacy = 'サービスプライバシーポリシー_案.md';
    let doc = core.legalMarkdown(privacy);
    ok(!core.salesOpen() && doc.includes('（案）') && doc.includes('※ これは運営者による草案です'), '販売の開始前で LEGAL_FINAL が無ければ、草案の表示（（案）と注意書き）を残す');
    process.env.LEGAL_FINAL = 'true';
    doc = core.legalMarkdown(privacy);
    ok(core.legalFinal() && !doc.includes('（案）') && !doc.includes('草案') && doc.includes('代表 太郎'), 'LEGAL_FINAL=true で【】が残っていなければ、販売の開始前でも、草案の表示を外す');
    ok(!core.legalMarkdown('サービス利用規約_案.md').includes('（案）'), 'LEGAL_FINAL=true なら、利用規約の（案）も外す');
    ok(chk(process.env, '法務文書の確定（LEGAL_FINAL=true）')[1] === true, '設定の確認に、法務文書が確定版になっていることを示す');
    delete process.env.SERVICE_LEGAL_DIR; // 【】が残っている、元の文書
    doc = core.legalMarkdown(privacy);
    ok(core.legalPlaceholders().length > 0 && !core.legalFinal() && doc.includes('（案）') && doc.includes('※ これは運営者による草案です'), 'LEGAL_FINAL=true でも、未記入の【】が残っていれば、草案の表示を外さない');
    const rowF = chk(process.env, '法務文書の確定（LEGAL_FINAL=true）');
    ok(rowF[1] === false && rowF[2].includes('草案の表示のままです'), '設定の確認で、LEGAL_FINAL を設定しても【】が残っていて外れていないことを示す');
    process.env.SERVICE_LEGAL_DIR = legalTmp; process.env.LEGAL_FINAL = 'yes';
    ok(core.legalMarkdown(privacy).includes('（案）'), 'LEGAL_FINAL は true のときだけ確定版にする');

    for (const key of ['SERVICE_OPEN', 'SERVICE_CONTACT_EMAIL', 'SERVICE_REPRESENTATIVE', 'SERVICE_LEGAL_DIR', 'LEGAL_FINAL']) delete process.env[key];
    process.env.SNS_APPROVED = savedApproved;
  }

  console.log('対応SNS');
  ok(registry.list().map((p) => p.id).join() === 'threads,x,instagram,tiktok,facebook,youtube', 'Threads・X・Instagram・TikTok・Facebook・YouTube に対応している');

  console.log('画面：Threadsの最近の投稿・Threadsで見る');
  {
    const ui = require('../lib/service-ui');
    const accounts = [{ id: 'aa01', platform: 'threads', status: 'active', handle: '@a' }, { id: 'aa02', platform: 'x', status: 'active', handle: '@b' }, { id: 'aa03', platform: 'threads', status: 'reauth_required', handle: '@c' }];
    const posts = [
      { id: 'pp1', status: 'posted', platform: 'threads', handle: '@a', text: '投稿済み', scheduled_at: new Date().toISOString(), permalink: 'https://www.threads.net/@a/post/1' },
      { id: 'pp2', status: 'posted', platform: 'threads', handle: '@a', text: 'リンクなし', scheduled_at: new Date().toISOString(), permalink: '' },
      { id: 'pp3', status: 'posted', platform: 'threads', handle: '@a', text: '危ないリンク', scheduled_at: new Date().toISOString(), permalink: 'javascript:alert(1)' },
      { id: 'pp4', status: 'failed', platform: 'threads', handle: '@a', text: '失敗', scheduled_at: new Date().toISOString(), permalink: 'https://www.threads.net/@a/post/4' },
    ];
    const dash = ui.dashboardPage({ user: { id: userB, email: 'b@example.com' }, sub: { status: 'active' }, accounts, posts, csrf: 'c', snsReady: true });
    ok(dash.includes('href="/service/app/threads/aa01/recent"') && !dash.includes('/service/app/threads/aa02/recent') && !dash.includes('/service/app/threads/aa03/recent'), '「最近の投稿」は、有効なThreadsの連携の行にだけ出す（X・再連携が必要な連携には出さない）');
    const notActive = ui.dashboardPage({ user: { id: userB, email: 'b@example.com' }, sub: { status: 'canceled' }, accounts, posts: [], csrf: 'c', snsReady: true });
    ok(!notActive.includes('/recent"'), '契約が有効でなければ「最近の投稿」を出さない');
    ok((dash.match(/Threadsで見る/g) || []).length === 1 && dash.includes('href="https://www.threads.net/@a/post/1"') && !dash.includes('javascript:alert') && !dash.includes('/post/4'), '「Threadsで見る」は、投稿済みで https のリンクがある予約にだけ出す');
    const cal = ui.calendarPage({ user: { email: 'b@example.com' }, month: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7), posts, drafts: [], csrf: 'c' });
    ok((cal.match(/Threadsで見る/g) || []).length === 1 && cal.includes('href="https://www.threads.net/@a/post/1"') && !cal.includes('javascript:alert'), 'カレンダーにも、同じ条件で「Threadsで見る」を出す');
    const rp = ui.threadsRecentPage({ user: { email: 'b@example.com' }, account: accounts[0], items: [{ id: '1', mediaType: 'IMAGE', mediaUrl: 'https://cdn.example.test/a.jpg', thumbnailUrl: '', permalink: 'https://www.threads.net/@a/post/9', text: '<b>本文</b>', timestamp: '2026-10-15T00:00:00+0000' }] });
    ok(rp.includes('<h1>Threadsの最近の投稿</h1>') && rp.includes('&lt;b&gt;本文&lt;/b&gt;') && rp.includes('src="https://cdn.example.test/a.jpg"') && rp.includes('2026年10月15日 09:00') && rp.includes('href="https://www.threads.net/@a/post/9"') && rp.includes('保存しません'), '最近の投稿の画面に、本文（エスケープ）・画像・投稿日時（日本時間）・Threadsで見る・保存しないことの説明を出す');
    const rpEmpty = ui.threadsRecentPage({ user: { email: 'b@example.com' }, account: accounts[0], items: [] });
    ok(rpEmpty.includes('Threadsの投稿はまだありません'), '投稿が無ければ、その旨を出す');
    const rp404 = ui.threadsRecentPage({ user: { email: 'b@example.com' }, account: null, error: 'この連携は見つかりませんでした。' });
    ok(rp404.includes('見つかりませんでした') && !rp404.includes('の最近の投稿</div>'), '連携が見つからないときは、一覧を出さない');
  }

  console.log('連携の件数の上限と再連携');
  {
    const savedMax = process.env.SERVICE_MAX_ACCOUNTS;
    process.env.SERVICE_MAX_ACCOUNTS = '3';
    const uL = mkUser('limit@example.com');
    store.Subscriptions.upsert(uL, { status: 'active' });
    const mkTh = (ext) => store.SnsAccounts.upsert({ userId: uL, platform: 'threads', externalUserId: ext, handle: `@${ext}`, accessTokenEnc: box.encrypt(`tok_${ext}`, k), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    const l1 = mkTh('L1');
    const l2 = mkTh('L2');
    mkTh('L3');
    // Threads の連携の完了のモック。/me の id（どのアカウントか）を meId で変える
    let meId = 'L2';
    const mockL = installHttpsMock(async (c) => {
      if (c.host !== 'graph.threads.net') return null;
      if (c.path === '/oauth/access_token') return { status: 200, json: { access_token: 'th_short_l', user_id: meId } };
      if (c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: `th_long_${meId}`, expires_in: 5184000 } };
      if (c.path.startsWith('/v1.0/me?')) return { status: 200, json: { id: meId, username: `user_${meId}` } };
      return null;
    });
    const stateOf = (r) => new URL(r.url).searchParams.get('state');
    let st = core.startConnect({ userId: uL, platform: 'threads' });
    ok(!st.ok && st.error === '連携できるSNSアカウントは3件までです。', '上限まで連携していて、再連携が必要な連携が無ければ、連携を始めさせない（新しい連携は上限で断る）');
    store.SnsAccounts.setStatus(l2, 'reauth_required');
    ok(core.startConnect({ userId: uL, platform: 'x' }).error === '連携できるSNSアカウントは3件までです。', '再連携が必要な連携が無いSNSは、上限で断る');
    st = core.startConnect({ userId: uL, platform: 'threads' });
    ok(st.ok, '上限まで連携していても、そのSNSに再連携が必要な連携があれば、再連携を始められる');
    let fin = await core.finishConnect({ userId: uL, platform: 'threads', code: 'c', state: stateOf(st) });
    const back = store.SnsAccounts.get(l2);
    ok(fin.ok && back.status === 'active' && back.reauth_at === '' && box.decrypt(back.access_token_enc, k) === 'th_long_L2' && store.SnsAccounts.countForUser(uL) === 3, '同じSNSアカウントの再連携なら、上限まで連携していても、再連携が必要な連携を有効に戻せる（件数は増えない）');
    store.SnsAccounts.setStatus(l2, 'reauth_required');
    st = core.startConnect({ userId: uL, platform: 'threads' });
    meId = 'L9'; // 再連携ではなく、別のアカウントを連携した
    fin = await core.finishConnect({ userId: uL, platform: 'threads', code: 'c', state: stateOf(st) });
    ok(st.ok && !fin.ok && fin.error === '連携できるSNSアカウントは3件までです。', '連携の完了で、新しい連携になる場合は、上限で断る');
    ok(store.SnsAccounts.countForUser(uL) === 3 && !store.SnsAccounts.findForUser(uL, 'threads', 'L9') && store.SnsAccounts.get(l2).status === 'reauth_required' && store.SnsAccounts.get(l1).status === 'active', '上限で断ったときは、新しい連携を保存せず、ほかの連携も変えない');
    store.SnsAccounts.remove(l1, uL);
    meId = 'L9';
    st = core.startConnect({ userId: uL, platform: 'threads' });
    fin = await core.finishConnect({ userId: uL, platform: 'threads', code: 'c', state: stateOf(st) });
    ok(fin.ok && store.SnsAccounts.findForUser(uL, 'threads', 'L9') && store.SnsAccounts.countForUser(uL) === 3, '上限より少なければ、新しい連携を保存する');
    mockL.restore();
    if (savedMax === undefined) delete process.env.SERVICE_MAX_ACCOUNTS; else process.env.SERVICE_MAX_ACCOUNTS = savedMax;
  }

  process.exit(summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
