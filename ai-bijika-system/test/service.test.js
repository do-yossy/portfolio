'use strict';
// 月額SNS自動投稿サービスのロジックのテスト（課金・暗号化・SNS連携・予約実行・上限）
// 実行: npm test （node --experimental-sqlite test/service.test.js）
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-test-'));
process.env.SNS_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
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
  try { box.decrypt(enc.replace(/.$/, 'A'), k); } catch { threw = true; }
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
  await billing.handleEvent({ id: 'evt_d', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', current_period_end: periodEnd, cancel_at_period_end: false, metadata: {}, items: { data: [] } } } });
  ok(!store.Subscriptions.isActive(userA), '契約が終了すると利用できなくなる');
  const portal = await billing.createPortalSession('cus_1');
  ok(portal === 'https://portal.stripe.test/p', 'カード変更用のポータルURLを取得できる');
  // 決済ページから戻った直後の同期（Webhookの到着前でも、2本目の契約を作らせないため）
  ok(!(await billing.syncCheckoutSession(userSync, 'cs_open')) && !store.Subscriptions.isActive(userSync), '決済が完了していないセッションでは契約中にならない');
  ok(!(await billing.syncCheckoutSession(userA, 'cs_done')) && !store.Subscriptions.isActive(userA === userSync ? '' : userSync), '他のユーザーのセッションは反映しない');
  ok(!(await billing.syncCheckoutSession(userSync, '../etc')), '不正なセッションIDは拒否する');
  ok((await billing.syncCheckoutSession(userSync, 'cs_done')) && store.Subscriptions.isActive(userSync) && store.Subscriptions.get(userSync).stripe_subscription_id === 'sub_sync', '本人の完了したセッションは、Webhookより先に契約中にできる');

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
  ok(th.ok && th.url.startsWith('https://threads.net/oauth/authorize?') && th.url.includes('threads_content_publish'), 'Threadsの認可URLを作れる');
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
  const p4 = mk(xAcc.id, 'Xへの投稿');
  await new Promise((r) => setTimeout(r, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(p4).status === 'posted' && store.ScheduledPosts.get(p4).external_id === 'tweet_1', 'Xへ投稿して投稿IDを記録する');
  ok(xTokenCalls >= 2, '期限が近いトークンは先に更新する');
  const tweetCall = mockSns.calls.find((c) => c.path === '/2/tweets');
  ok(tweetCall.headers.Authorization === 'Bearer x_access_2', '更新後のアクセストークンで投稿する');
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
  store.ScheduledPosts.failStuck(new Date(Date.now() + 1000).toISOString());
  ok(store.ScheduledPosts.get(p8).status === 'failed' && /再起動/.test(store.ScheduledPosts.get(p8).last_error), '起動時に処理中のまま残った予約は二重投稿を避けて失敗扱いにする');

  mockSns.restore();
  console.log('対応SNS');
  ok(registry.list().map((p) => p.id).join() === 'threads,x,instagram,tiktok', 'Threads・X・Instagram・TikTok に対応している');

  process.exit(summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
