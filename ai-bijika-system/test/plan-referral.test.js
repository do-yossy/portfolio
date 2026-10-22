'use strict';
// プラン（通常10件／30件）と、紹介（両者1か月無料）のテスト。Stripeは模擬の通信（実物のStripeには触れない）。
// 実行: node --experimental-sqlite test/plan-referral.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-plan-'));
process.env.SNS_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
process.env.SNS_APPROVED = 'threads';
process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_plan';
process.env.STRIPE_PRICE_ID = 'price_std';
process.env.SERVICE_BASE_URL = 'https://example.test';
process.env.THREADS_APP_ID = 'th_id';
process.env.THREADS_APP_SECRET = 'th_secret';
process.env.ADMIN_PASSWORD = 'adminpw';
for (const k of ['STRIPE_PRICE_ID_AGENCY', 'SERVICE_PRICE_JPY_AGENCY', 'SERVICE_MAX_ACCOUNTS', 'SERVICE_MAX_ACCOUNTS_AGENCY', 'SERVICE_TRIAL_DAYS', 'REFERRAL_MAX_REWARDS', 'REFERRAL_ENABLED']) delete process.env[k];
// 紹介機能は、REFERRAL_ENABLED=true と上限の設定がそろったときだけ働く。以下の紹介のテストは、働かせた状態で行う（止まっている場合のテストは最後）
process.env.REFERRAL_ENABLED = 'true'; process.env.REFERRAL_MAX_REWARDS = '5';

const { ok, summary, installHttpsMock } = require('./helpers');
const { Users } = require('../db');
const store = require('../lib/service-store');
const billing = require('../lib/billing');
const core = require('../lib/service-core');
const referral = require('../lib/referral');
const box = require('../lib/crypto-box');
const ui = require('../lib/service-ui');

const mkUser = (email) => Users.create({ email, passwordHash: 'h', passwordSalt: 's' });
const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
const form = (c) => Object.fromEntries(new URLSearchParams(c.body));

// ── 模擬のStripe（契約・schedule・残高）──
const S = {}; // 契約ID → 状態
let sched = null; // 作った subscription schedule の控え
let failBalance = false;
const calls = [];
const mkSub = (id) => {
  const s = S[id];
  return { id, customer: s.customer, status: s.status, current_period_end: periodEnd, cancel_at_period_end: !!s.cancel, schedule: s.schedule || null, metadata: { user_id: s.user },
    items: { data: [{ id: `si_${id}`, quantity: 1, price: { id: s.price, unit_amount: s.price === 'price_ag' ? 3300 : 1100, currency: 'jpy' } }] } };
};
const mock = installHttpsMock(async (c) => {
  if (c.host !== 'api.stripe.com') return null;
  calls.push(c);
  let m;
  if (c.method === 'POST' && c.path === '/v1/checkout/sessions') return { status: 200, json: { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' } };
  if ((m = c.path.match(/^\/v1\/subscriptions\/(sub_[a-z0-9_]+)$/))) {
    const s = S[m[1]];
    if (!s) return { status: 404, json: { error: { message: 'no such subscription' } } };
    if (c.method === 'POST') {
      const f = form(c);
      if (f['items[0][price]']) s.price = f['items[0][price]'];
      if (f.cancel_at_period_end) s.cancel = f.cancel_at_period_end === 'true';
    }
    return { status: 200, json: mkSub(m[1]) };
  }
  if (c.method === 'POST' && c.path === '/v1/subscription_schedules') {
    const id = form(c).from_subscription;
    S[id].schedule = 'sub_sched_1';
    sched = { id: 'sub_sched_1', sub: id };
    return { status: 200, json: { id: 'sub_sched_1', phases: [{ start_date: periodEnd - 30 * 86400, end_date: periodEnd, items: [{ price: S[id].price, quantity: 1 }] }] } };
  }
  if (c.method === 'POST' && c.path === '/v1/subscription_schedules/sub_sched_1') { sched.updated = form(c); return { status: 200, json: { id: 'sub_sched_1' } }; }
  if (c.method === 'POST' && c.path === '/v1/subscription_schedules/sub_sched_1/release') { S[sched.sub].schedule = null; return { status: 200, json: { id: 'sub_sched_1', status: 'released' } }; }
  if ((m = c.path.match(/^\/v1\/customers\/(cus_[a-z0-9_]+)\/balance_transactions$/)) && c.method === 'POST') {
    if (failBalance) return { status: 500, json: { error: { message: 'boom' } } };
    return { status: 200, json: { id: 'cbtxn_1', ...form(c) } };
  }
  return null;
});
const balanceCalls = () => calls.filter((c) => /balance_transactions/.test(c.path));
const ev = (id, type, object, created) => ({ id, type, created: created || Math.floor(Date.now() / 1000), data: { object } });
const subEvent = (id, subId, extra = {}) => ev(id, 'customer.subscription.updated', { ...mkSub(subId), ...extra });

// 契約中の利用者を作る
function mkMember(email, subId, { plan = 'standard', price = 'price_std', status = 'active', customer } = {}) {
  const u = mkUser(email);
  S[subId] = { user: u, customer: customer || `cus_${subId.slice(4)}`, status, price, cancel: false, schedule: null };
  store.Subscriptions.upsert(u, { stripe_customer_id: S[subId].customer, stripe_subscription_id: subId, status, plan, price_id: price, current_period_end: new Date(periodEnd * 1000).toISOString() });
  return u;
}
let acctSeq = 0;
const addAccounts = (u, n) => { for (let i = 0; i < n; i++) store.SnsAccounts.upsert({ userId: u, platform: 'threads', externalUserId: `${u}_${acctSeq++}`, handle: `@a${i}`, accessTokenEnc: box.encrypt('t', box.keyFromEnv()), expiresAt: new Date(Date.now() + 86400000).toISOString() }); };

(async () => {
  console.log('プランの定義と上限');
  ok(core.priceYen() === 1100 && core.priceYen('standard') === 1100 && core.priceYen('agency') === 3300, '通常は1,100円・30件プランは3,300円が既定');
  ok(core.LIMITS.maxAccounts === 10 && core.LIMITS.maxAccountsAgency === 30, '連携の上限の既定は、通常10件・30件プラン30件');
  ok(!core.agencyOffered() && !core.agencyOnLp(), 'STRIPE_PRICE_ID_AGENCY が未設定なら、30件プランは出さない');
  process.env.STRIPE_PRICE_ID_AGENCY = 'price_ag';
  ok(core.agencyOffered() && !core.agencyOnLp(), '価格IDだけ設定すると、申込み・マイページには出すが、販売ページ（LP）には SERVICE_PRICE_JPY_AGENCY を設定するまで出さない');
  process.env.SERVICE_PRICE_JPY_AGENCY = '3300';
  ok(core.agencyOnLp(), '価格IDと月額が設定されていれば、販売ページにも出す');
  ok(core.planFromPriceId('price_std') === 'standard' && core.planFromPriceId('price_ag') === 'agency' && core.planFromPriceId('price_other') === null && core.planFromPriceId('') === null, '価格IDからプランを判定する（知らない価格・空はnull）');
  const uStd = mkMember('std@example.com', 'sub_std');
  const uAg = mkMember('ag@example.com', 'sub_ag', { plan: 'agency', price: 'price_ag' });
  ok(core.accountLimitFor(uStd) === 10 && core.accountLimitFor(uAg) === 30 && core.accountLimitFor('nobody') === 10, '連携の上限は、利用者のプランで決まる（契約が無ければ通常）');
  process.env.SERVICE_MAX_ACCOUNTS = '2'; process.env.SERVICE_MAX_ACCOUNTS_AGENCY = '4';
  ok(core.accountLimitFor(uStd) === 2 && core.accountLimitFor(uAg) === 4, '上限は環境変数（SERVICE_MAX_ACCOUNTS・SERVICE_MAX_ACCOUNTS_AGENCY）で変えられる');
  addAccounts(uStd, 2); addAccounts(uAg, 3);
  ok(!core.startConnect({ userId: uStd, platform: 'threads' }).ok && core.startConnect({ userId: uStd, platform: 'threads' }).error === '連携できるSNSアカウントは2件までです。', '通常プランは、通常の上限で連携を断る');
  ok(core.startConnect({ userId: uAg, platform: 'threads' }).ok, '30件プランは、通常の上限を超えても連携を始められる（30件プランの上限の手前）');
  addAccounts(uAg, 1);
  ok(core.startConnect({ userId: uAg, platform: 'threads' }).error === '連携できるSNSアカウントは4件までです。', '30件プランは、30件プランの上限で断る');
  const mcp = require('../lib/mcp');
  const info = mcp.accountInfo(uAg);
  ok(info.limits.accounts === 4 && info.subscription.plan === 'agency', 'AIアシスタント（MCP）の利用状況に、プランごとの上限とプランを出す');
  delete process.env.SERVICE_MAX_ACCOUNTS; delete process.env.SERVICE_MAX_ACCOUNTS_AGENCY;

  console.log('Webhookからのプランの同期');
  const uSync = mkMember('sync@example.com', 'sub_sync', { price: 'price_std' });
  S.sub_sync.price = 'price_ag';
  await billing.handleEvent(subEvent('evt_sync1', 'sub_sync'));
  ok(store.Subscriptions.get(uSync).plan === 'agency' && store.Subscriptions.get(uSync).price_id === 'price_ag', 'subscription の価格IDが30件プランなら、plan=agency に同期する');
  S.sub_sync.price = 'price_std';
  await billing.handleEvent(subEvent('evt_sync2', 'sub_sync'));
  ok(store.Subscriptions.get(uSync).plan === 'standard', '価格IDが通常に変わったら plan=standard に同期する');
  S.sub_sync.price = 'price_ag';
  await billing.handleEvent(subEvent('evt_sync3', 'sub_sync'));
  await billing.handleEvent(ev('evt_sync4', 'customer.subscription.updated', { id: 'sub_sync', customer: 'cus_sync', status: 'active', current_period_end: periodEnd, cancel_at_period_end: false, metadata: {}, items: { data: [] } }));
  ok(store.Subscriptions.get(uSync).plan === 'agency', '価格が付いていない・知らない価格のイベントでは、プランを変えない');
  ok(store.Subscriptions.get(mkUser('fresh@example.com')) === null, '契約が無い利用者の行は作らない');

  console.log('申込み（Checkout）のプラン');
  await billing.createCheckoutSession({ userId: 'u_x', email: 'x@example.com', plan: 'agency' });
  let cs = decodeURIComponent(calls.filter((c) => c.path === '/v1/checkout/sessions').pop().body);
  ok(cs.includes('line_items[0][price]=price_ag'), '30件プランは、30件プランの価格IDで申し込む');
  await billing.createCheckoutSession({ userId: 'u_x', email: 'x@example.com' });
  cs = decodeURIComponent(calls.filter((c) => c.path === '/v1/checkout/sessions').pop().body);
  ok(cs.includes('line_items[0][price]=price_std'), '指定が無ければ通常の価格IDで申し込む');
  delete process.env.STRIPE_PRICE_ID_AGENCY;
  let threw = false;
  try { await billing.createCheckoutSession({ userId: 'u_x', email: 'x@example.com', plan: 'agency' }); } catch { threw = true; }
  ok(threw, '30件プランの価格IDが未設定なら、30件プランの申込みを作らない');
  process.env.STRIPE_PRICE_ID_AGENCY = 'price_ag';

  console.log('プランの変更：通常 → 30件');
  const uUp = mkMember('up@example.com', 'sub_up');
  const nBefore = calls.length;
  let r = await billing.changePlan(uUp, 'agency');
  const upCall = calls.slice(nBefore).find((c) => c.method === 'POST' && c.path === '/v1/subscriptions/sub_up');
  const upForm = upCall ? form(upCall) : {};
  ok(r.ok && upForm['items[0][id]'] === 'si_sub_up' && upForm['items[0][price]'] === 'price_ag' && upForm.proration_behavior === 'create_prorations', '契約の items の価格を30件プランに入れ替え、日割りは proration_behavior=create_prorations で呼ぶ');
  ok(store.Subscriptions.get(uUp).plan === 'agency' && core.accountLimitFor(uUp) === 30, 'すぐに30件プランになり、上限が30件になる');
  r = await billing.changePlan(uUp, 'agency');
  ok(r.ok && r.unchanged, '同じプランへの変更は何もしない');
  delete process.env.STRIPE_PRICE_ID_AGENCY;
  const uUp2 = mkMember('up2@example.com', 'sub_up2');
  r = await billing.changePlan(uUp2, 'agency');
  ok(!r.ok && store.Subscriptions.get(uUp2).plan === 'standard' && !calls.some((c) => c.path === '/v1/subscriptions/sub_up2' && c.method === 'POST'), '30件プランの価格IDが未設定なら、変更を断り、Stripeを更新しない');
  process.env.STRIPE_PRICE_ID_AGENCY = 'price_ag';
  S.sub_up2.status = 'past_due'; store.Subscriptions.upsert(uUp2, { status: 'past_due' });
  ok(!(await billing.changePlan(uUp2, 'agency')).ok, '支払いの確認が必要な契約は、プランを変えられない');
  const uTest = mkUser('test@example.com'); store.Subscriptions.upsert(uTest, { status: 'test' });
  ok(!(await billing.changePlan(uTest, 'agency')).ok, 'テスト利用（Stripeの契約が無い）は、プランを変えられない');

  console.log('プランの変更：30件 → 通常（次回の更新日から）');
  const uDown = mkMember('down@example.com', 'sub_down', { plan: 'agency', price: 'price_ag' });
  addAccounts(uDown, 11);
  const nb = calls.length;
  r = await billing.changePlan(uDown, 'standard');
  ok(!r.ok && r.error.includes('11件') && r.error.includes('解除してから') && calls.length === nb && store.Subscriptions.get(uDown).pending_plan === '', '連携が10件を超えていれば断り、解除してから変えるよう案内する（Stripeは呼ばない）');
  for (const a of store.SnsAccounts.listForUser(uDown).slice(0, 1)) store.SnsAccounts.remove(a.id, uDown);
  r = await billing.changePlan(uDown, 'standard');
  ok(r.ok && r.scheduled === 'standard', '10件以下なら、通常プランへの切り替えを予約できる');
  ok(sched && sched.updated && sched.updated['phases[0][items][0][price]'] === 'price_ag' && sched.updated['phases[0][end_date]'] === String(periodEnd) && sched.updated['phases[1][items][0][price]'] === 'price_std' && sched.updated.end_behavior === 'release' && sched.updated['phases[1][duration][interval]'] === 'month', 'subscription schedule で、今の期間の終わりまでは30件プランの価格、そのあとは通常の価格にする');
  ok(sched.updated['phases[0][metadata][user_id]'] === uDown && sched.updated['phases[1][metadata][user_id]'] === uDown, 'フェーズにも契約のメタデータ（user_id）を渡す（更新で消えないように）');
  let sd = store.Subscriptions.get(uDown);
  ok(sd.plan === 'agency' && sd.pending_plan === 'standard', '切り替えの日までは30件プランのまま、予約中（pending_plan）として記録する');
  ok(core.accountLimitFor(uDown) === 10, '予約中は、新しく連携できる数を通常の上限にする（切り替わる日に上限を超えないように）');
  const nc = calls.length;
  r = await billing.changePlan(uDown, 'standard');
  ok(r.ok && r.unchanged && calls.length === nc, '予約済みの変更をもう一度頼んでも、二重に予約しない');
  const dashPend = ui.dashboardPage({ user: { id: uDown, email: 'd' }, sub: store.Subscriptions.get(uDown), accounts: store.SnsAccounts.listForUser(uDown), posts: [], csrf: 'c', snsReady: true, agencyOffered: true });
  ok(dashPend.includes('次回の更新日から、通常プランに切り替わります') && dashPend.includes('切り替えの予約を取り消す'), 'マイページに、予約中の切り替えと、予約の取り消しを出す');
  // 切り替わった（Webhook）
  S.sub_down.price = 'price_std'; S.sub_down.schedule = null;
  await billing.handleEvent(subEvent('evt_down1', 'sub_down', { schedule: null }));
  sd = store.Subscriptions.get(uDown);
  ok(sd.plan === 'standard' && sd.pending_plan === '' && core.accountLimitFor(uDown) === 10, '更新日にStripeが切り替えると、Webhookで plan=standard になり、予約の記録が消える');
  // 予約の取り消し
  const uRel = mkMember('rel@example.com', 'sub_rel', { plan: 'agency', price: 'price_ag' });
  await billing.changePlan(uRel, 'standard');
  r = await billing.changePlan(uRel, 'agency');
  ok(r.ok && r.released && S.sub_rel.schedule === null && store.Subscriptions.get(uRel).pending_plan === '' && core.accountLimitFor(uRel) === 30, '予約を取り消すと、schedule を release して、30件プランのままにする');
  // 予約中に解約
  const uCan = mkMember('can@example.com', 'sub_can', { plan: 'agency', price: 'price_ag' });
  await billing.changePlan(uCan, 'standard');
  await billing.setCancelAtPeriodEnd(uCan, true);
  ok(S.sub_can.schedule === null && S.sub_can.cancel === true && store.Subscriptions.get(uCan).pending_plan === '', '切り替えを予約している間に解約するときは、先に予約を外してから解約を設定する');
  // 無料期間中
  const uTr = mkMember('trial@example.com', 'sub_tr', { plan: 'agency', price: 'price_ag', status: 'trialing' });
  const nt = calls.length;
  r = await billing.changePlan(uTr, 'standard');
  const trCall = calls.slice(nt).find((c) => c.method === 'POST' && c.path === '/v1/subscriptions/sub_tr');
  ok(r.ok && r.immediate && trCall && form(trCall).proration_behavior === 'none' && store.Subscriptions.get(uTr).plan === 'standard' && !calls.slice(nt).some((c) => c.path === '/v1/subscription_schedules'), '無料期間中は、請求がまだ無いため、すぐ通常に切り替える（最初の請求から通常の価格）');
  const uCancel2 = mkMember('cancel2@example.com', 'sub_cancel2');
  S.sub_cancel2.cancel = true; store.Subscriptions.upsert(uCancel2, { cancel_at_period_end: true });
  ok(!(await billing.changePlan(uCancel2, 'agency')).ok, '解約の手続き中は、プランを変えられない');

  console.log('画面：プラン');
  const lpOn = ui.lpPage({ user: null, billingReady: true });
  ok(lpOn.includes('プランは2つ。') && !lpOn.includes('プランは1つだけ。') && lpOn.includes('id="agency-plan"') && lpOn.includes('3,300円') && lpOn.includes('連携できるSNSアカウントは30件まで'), '30件プランが設定されていれば、販売ページに30件プランの段を出し、見出しを「プランは2つ。」にする');
  const cmpPart = lpOn.slice(lpOn.indexOf('料金の比べ方'), lpOn.indexOf('料金の比べ方') + 2500);
  ok(!lpOn.includes('料金の比べ方') || (!cmpPart.slice(0, cmpPart.indexOf('</table>')).includes('3,300円') && !cmpPart.slice(0, cmpPart.indexOf('</table>')).includes('30アカウント')), '比較（サービスA）は通常プランだけの比較のまま、30件プランを混ぜない');
  ok(lpOn.includes('href="/service/signup"') && !lpOn.includes('/service/checkout?plan=agency'), 'ログインしていない人には、30件プランの直接の申込みリンクは出さない');
  ok(ui.lpPage({ user: { email: 'a' }, billingReady: true }).includes('/service/checkout?plan=agency'), 'ログイン済みの人には、30件プランで申込みに進むリンクを出す');
  delete process.env.SERVICE_PRICE_JPY_AGENCY;
  let lpOff = ui.lpPage({ user: null, billingReady: true });
  ok(lpOff.includes('プランは1つだけ。') && !lpOff.includes('agency-plan'), 'SERVICE_PRICE_JPY_AGENCY が未設定なら、販売ページは今まで通り（プランはひとつだけ）');
  delete process.env.STRIPE_PRICE_ID_AGENCY;
  lpOff = ui.lpPage({ user: null, billingReady: true });
  ok(lpOff.includes('プランは1つだけ。') && !lpOff.includes('30件プラン') && lpOff.includes('連携できるアカウント（最大）'), 'STRIPE_PRICE_ID_AGENCY が未設定なら、30件プランを出さない');
  process.env.STRIPE_PRICE_ID_AGENCY = 'price_ag'; process.env.SERVICE_PRICE_JPY_AGENCY = '3300';

  let co = ui.checkoutPage({ user: { email: 'a' }, csrf: 'c', plan: 'agency', agencyOffered: true });
  ok(co.includes('月額 3,300円（税込）') && co.includes('連携できるSNSアカウントは30件まで') && co.includes('name="plan" value="agency"') && co.includes('30件プラン（SNS運用代行向け）・連携30件まで'), '最終確認画面に、選んだ30件プランの金額・連携の上限を出し、フォームに引き継ぐ');
  co = ui.checkoutPage({ user: { email: 'a' }, csrf: 'c', plan: 'agency', agencyOffered: false });
  ok(co.includes('月額 1,100円（税込）') && co.includes('name="plan" value="standard"') && !co.includes('30件プラン'), '30件プランが使えないときは、30件プランを選ばせず、通常プランの表示にする');
  co = ui.checkoutPage({ user: { email: 'a' }, csrf: 'c', plan: 'standard', agencyOffered: true, trialDays: 30, referral: true });
  ok(co.includes('紹介された人は30日間無料（条件あり）') && co.includes('お申込みの完了から30日間は無料') && co.includes('初回の月額 1,100円 を請求します') && co.includes('/service/checkout?plan=agency'), '紹介による無料期間は、30日・自動で課金が始まること・初回の金額を書き、30件プランへの切り替えのリンクも出す');
  const sub3 = { status: 'active', stripe_subscription_id: 'sub_x', plan: 'standard', pending_plan: '' };
  let dash = ui.dashboardPage({ user: { id: uStd, email: 'a' }, sub: sub3, accounts: [], posts: [], csrf: 'c', snsReady: true, agencyOffered: true });
  ok(dash.includes('/service/billing/plan') && dash.includes('name="plan" value="agency"') && dash.includes('30件プランに変更する') && dash.includes('差額は日割り') && dash.includes('次回の更新日からになります'), 'マイページ（通常プラン）に、30件プランへの変更（日割り・戻すときは次回の更新日から）を出す');
  dash = ui.dashboardPage({ user: { id: uStd, email: 'a' }, sub: sub3, accounts: [], posts: [], csrf: 'c', snsReady: true, agencyOffered: false });
  ok(!dash.includes('30件プランに変更する'), '30件プランが使えないときは、変更の案内を出さない');
  const subAg = { status: 'active', stripe_subscription_id: 'sub_x', plan: 'agency', pending_plan: '' };
  const accts11 = Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, platform: 'threads', status: 'active', handle: `h${i}` }));
  dash = ui.dashboardPage({ user: { id: uAg, email: 'a' }, sub: subAg, accounts: accts11, posts: [], csrf: 'c', snsReady: true, agencyOffered: true });
  ok(dash.includes('1件以上を解除してから変更してください') && !dash.includes('通常プランに変更する（次回の更新日から）'), '30件プランで連携が10件を超えていれば、解除してから変えるよう案内し、変更のボタンは出さない');
  dash = ui.dashboardPage({ user: { id: uAg, email: 'a' }, sub: subAg, accounts: accts11.slice(0, 5), posts: [], csrf: 'c', snsReady: true, agencyOffered: true });
  ok(dash.includes('通常プランに変更する（次回の更新日から）') && dash.includes('30件プラン（SNS運用代行向け）') && dash.includes('3,300円'), '10件以下なら、通常プランへの変更（次回の更新日から）のボタンを出し、いまのプランと金額を表示する');
  const chk = ui.settingsChecklist({ ...process.env }).find((row) => row[0].startsWith('30件プラン'));
  ok(chk && chk[1] === true && chk[2].includes('3,300円') && chk[2].includes('金額が、画面に表示する月額と同じか') && !chk[2].includes('price_ag'), '運営者画面の設定の確認に、30件プランの設定と、金額の一致の確認を出す（価格IDは出さない）');
  const chk2 = ui.settingsChecklist({ ...process.env, STRIPE_PRICE_ID_AGENCY: '' }).find((row) => row[0].startsWith('30件プラン'));
  ok(chk2 && chk2[1] === false && chk2[2].includes('申込みも断ります'), '未設定なら、画面に出さず申込みも断ることを示す');

  console.log('紹介：コードと登録の記録');
  const A = mkMember('referrer@example.com', 'sub_ref', { customer: 'cus_referrer' });
  const code = store.ReferralCodes.forUser(A);
  ok(/^[0-9a-f]{20}$/.test(code) && store.ReferralCodes.forUser(A) === code && !code.includes('referrer'), '紹介コードは推測しにくいランダム（20桁）で、利用者ごとに一定、メールアドレスを含まない');
  ok(store.ReferralCodes.findUserId(code) === A && store.ReferralCodes.findUserId('0'.repeat(20)) === null && store.ReferralCodes.findUserId("' OR 1=1") === null, 'コードから紹介した人を引ける（無効なコード・不正な形式はnull）');
  const B = mkUser('referred@example.com');
  ok(referral.recordSignup({ referredUserId: B, referredEmail: 'referred@example.com', code }), '紹介のURLから登録した記録を、referrals 表に残す');
  ok(store.Referrals.getByReferred(B).status === 'pending' && store.Referrals.getByReferred(B).referrer_user_id === A, '紹介した人・された人・状態（pending）を保存する');
  ok(referral.recordSignup({ referredUserId: B, referredEmail: 'referred@example.com', code }) === null, '同じ人は、2回は紹介されない');
  ok(referral.recordSignup({ referredUserId: mkUser('x1@example.com'), referredEmail: 'x1@example.com', code: '1'.repeat(20) }) === null, '存在しないコードは、記録しない');
  const selfU = mkUser('Self.Name+tag@gmail.com');
  const selfCode = store.ReferralCodes.forUser(A);
  referral.recordSignup({ referredUserId: A, referredEmail: 'x@example.com', code: selfCode });
  ok(store.Referrals.getByReferred(A) && store.Referrals.getByReferred(A).status === 'void' && store.Referrals.getByReferred(A).void_reason === 'self', '自分自身（同じ利用者）の紹介は無効');
  const G = mkMember('selfname@gmail.com', 'sub_g');
  const gCode = store.ReferralCodes.forUser(G);
  referral.recordSignup({ referredUserId: selfU, referredEmail: 'Self.Name+tag@gmail.com', code: gCode });
  ok(store.Referrals.getByReferred(selfU).status === 'void' && referral.emailKey('A.B+x@Gmail.com') === 'ab@gmail.com' && referral.emailKey('a@b.com') !== referral.emailKey('c@b.com'), '同じメールアドレス（大文字小文字・+タグ・Gmailのドットの違い）の紹介は無効');
  const stA = store.Referrals.statsFor(A);
  ok(stA.total === 2 && stA.pending === 1 && stA.void === 1, '紹介した人の画面用の件数を数えられる');

  console.log('紹介：無料期間');
  ok(core.referralTrialFor(B) === 30 && core.trialFor(B) === 30, '紹介された人は、初めての申込みで30日無料（Checkoutの trial_period_days=30）');
  process.env.SERVICE_TRIAL_DAYS = '7';
  ok(core.trialFor(B) === 30, 'SERVICE_TRIAL_DAYS があっても、長い方（30日）を使う');
  process.env.SERVICE_TRIAL_DAYS = '30';
  ok(core.trialFor(B) === 30, 'SERVICE_TRIAL_DAYS が30日でも30日');
  delete process.env.SERVICE_TRIAL_DAYS;
  ok(core.trialFor(mkUser('plain@example.com')) === 0, '紹介されていない人は、SERVICE_TRIAL_DAYS が無ければ無料期間なし');
  ok(core.trialFor(selfU) === 0, '無効な紹介（自分自身）では、無料期間は付かない');
  await billing.createCheckoutSession({ userId: B, email: 'referred@example.com', trialDays: core.trialFor(B) });
  cs = decodeURIComponent(calls.filter((c) => c.path === '/v1/checkout/sessions').pop().body);
  ok(cs.includes('subscription_data[trial_period_days]=30') && cs.includes('payment_method_collection=always'), 'Stripeに trial_period_days=30 と、支払い方法の登録の必須（payment_method_collection=always）を渡す');
  const prior = mkUser('prior@example.com');
  store.Subscriptions.upsert(prior, { stripe_subscription_id: 'sub_old', status: 'canceled' });
  store.Referrals.create({ referrerUserId: A, referredUserId: prior, code, status: 'pending' });
  ok(core.trialFor(prior) === 0, 'すでに契約したことがある人は、紹介されても無料期間の対象外');

  console.log('紹介：特典の付与（紹介された人の最初の有料の請求）');
  // B が契約（無料期間中）
  S.sub_b = { user: B, customer: 'cus_b', status: 'trialing', price: 'price_std', cancel: false, schedule: null };
  await billing.handleEvent(ev('evt_b_co', 'checkout.session.completed', { mode: 'subscription', client_reference_id: B, customer: 'cus_b', subscription: 'sub_b' }));
  const inv = (id, paid) => ev(id, 'invoice.paid', { id: `in_${id}`, subscription: 'sub_b', amount_paid: paid });
  await billing.handleEvent(inv('evt_inv0', 0));
  ok(balanceCalls().length === 0 && store.Referrals.getByReferred(B).status === 'pending', '無料期間中の請求（amount_paid が0）では、特典を付けない');
  S.sub_b.status = 'active';
  await billing.handleEvent(inv('evt_inv1', 1100));
  let bc = balanceCalls();
  ok(bc.length === 1 && bc[0].path === '/v1/customers/cus_referrer/balance_transactions' && form(bc[0]).amount === '-1100' && form(bc[0]).currency === 'jpy', '最初の有料の請求（amount_paid > 0）が払われたら、紹介した人の顧客の残高に、1か月分（-1,100円）のクレジットを付ける');
  ok(bc[0].headers['Idempotency-Key'] === `referral-reward-${store.Referrals.getByReferred(B).id}` && true, '二重付与を防ぐ Idempotency-Key を付ける');
  const rb = store.Referrals.getByReferred(B);
  ok(rb.status === 'rewarded' && rb.reward_granted_at && rb.reward_amount === 1100, '付与したことと金額を記録する（reward_granted_at）');
  await billing.handleEvent(inv('evt_inv1', 1100));
  await billing.handleEvent(inv('evt_inv2', 1100));
  ok(balanceCalls().length === 1, '同じWebhookの再送・次の月の請求では、二重に付与しない');
  ok(!JSON.stringify(store.Referrals.statsFor(A)).includes('example.com') && !JSON.stringify(referral.infoFor(A)).includes('referred'), '紹介した人の画面用の情報に、メールアドレスなどを含めない');
  // 紹介した人が30件プラン：その契約の価格の金額（3,300円）を付与
  const A2 = mkMember('referrer2@example.com', 'sub_ref2', { plan: 'agency', price: 'price_ag', customer: 'cus_referrer2' });
  const B2 = mkUser('referred2@example.com');
  referral.recordSignup({ referredUserId: B2, referredEmail: 'referred2@example.com', code: store.ReferralCodes.forUser(A2) });
  S.sub_b2 = { user: B2, customer: 'cus_b2', status: 'active', price: 'price_std', cancel: false, schedule: null };
  await billing.handleEvent(ev('evt_b2_co', 'checkout.session.completed', { mode: 'subscription', client_reference_id: B2, customer: 'cus_b2', subscription: 'sub_b2' }));
  await billing.handleEvent(ev('evt_b2_inv', 'invoice.paid', { id: 'in_b2', subscription: 'sub_b2', amount_paid: 1100 }));
  bc = balanceCalls();
  ok(bc.length === 2 && bc[1].path === '/v1/customers/cus_referrer2/balance_transactions' && form(bc[1]).amount === '-3300', '紹介した人が30件プランなら、その契約の1か月分（3,300円）を付ける');

  console.log('紹介：付けない場合');
  // 最初の請求の前に解約
  const A3 = mkMember('referrer3@example.com', 'sub_ref3', { customer: 'cus_referrer3' });
  const B3 = mkUser('referred3@example.com');
  referral.recordSignup({ referredUserId: B3, referredEmail: 'referred3@example.com', code: store.ReferralCodes.forUser(A3) });
  S.sub_b3 = { user: B3, customer: 'cus_b3', status: 'trialing', price: 'price_std', cancel: false, schedule: null };
  await billing.handleEvent(ev('evt_b3_co', 'checkout.session.completed', { mode: 'subscription', client_reference_id: B3, customer: 'cus_b3', subscription: 'sub_b3' }));
  S.sub_b3.status = 'canceled';
  await billing.handleEvent(subEvent('evt_b3_del', 'sub_b3'));
  ok(store.Referrals.getByReferred(B3).status === 'void' && store.Referrals.getByReferred(B3).void_reason === 'canceled', '紹介された人の契約が最初の請求の前に解約されたら、紹介を無効にする');
  const before = balanceCalls().length;
  await billing.handleEvent(ev('evt_b3_inv', 'invoice.paid', { id: 'in_b3', subscription: 'sub_b3', amount_paid: 1100 }));
  ok(balanceCalls().length === before, '解約されたあとに届いた請求では、特典を付けない');
  // 自分自身（無効）
  const before2 = balanceCalls().length;
  S.sub_g = S.sub_g || { user: G, customer: 'cus_g', status: 'active', price: 'price_std', cancel: false, schedule: null };
  store.Subscriptions.upsert(selfU, { stripe_customer_id: 'cus_self', stripe_subscription_id: 'sub_self', status: 'active' });
  S.sub_self = { user: selfU, customer: 'cus_self', status: 'active', price: 'price_std', cancel: false, schedule: null };
  await billing.handleEvent(ev('evt_self_inv', 'invoice.paid', { id: 'in_self', subscription: 'sub_self', amount_paid: 1100 }));
  ok(balanceCalls().length === before2, '自分自身の紹介（無効）には、特典を付けない');
  // 紹介した人が契約中でない
  const A4 = mkMember('referrer4@example.com', 'sub_ref4', { customer: 'cus_referrer4', status: 'canceled' });
  const B4 = mkUser('referred4@example.com');
  referral.recordSignup({ referredUserId: B4, referredEmail: 'referred4@example.com', code: store.ReferralCodes.forUser(A4) });
  S.sub_b4 = { user: B4, customer: 'cus_b4', status: 'active', price: 'price_std', cancel: false, schedule: null };
  await billing.handleEvent(ev('evt_b4_co', 'checkout.session.completed', { mode: 'subscription', client_reference_id: B4, customer: 'cus_b4', subscription: 'sub_b4' }));
  const before4 = balanceCalls().length;
  await billing.handleEvent(ev('evt_b4_inv', 'invoice.paid', { id: 'in_b4', subscription: 'sub_b4', amount_paid: 1100 }));
  const rb4 = store.Referrals.getByReferred(B4);
  ok(balanceCalls().length === before4 && rb4.status === 'held' && rb4.reward_granted_at === '', '紹介した人が契約中でない（解約済み）ときは、特典を付けずに保留として記録する');
  S.sub_ref4.status = 'active'; store.Subscriptions.upsert(A4, { status: 'active' });
  await billing.handleEvent(ev('evt_b4_inv2', 'invoice.paid', { id: 'in_b4b', subscription: 'sub_b4', amount_paid: 1100 }));
  ok(balanceCalls().length === before4 && store.Referrals.getByReferred(B4).status === 'held', '保留のものは、紹介した人が再契約しても自動では付けない（未実装）');
  // 上限
  process.env.REFERRAL_MAX_REWARDS = '2';
  ok(referral.maxRewards() === 2, '特典の上限は REFERRAL_MAX_REWARDS で変えられる');
  const A5 = mkMember('referrer5@example.com', 'sub_ref5', { customer: 'cus_referrer5' });
  const c5 = store.ReferralCodes.forUser(A5);
  let granted = 0;
  for (let i = 0; i < 3; i++) {
    const Bi = mkUser(`cap${i}@example.com`);
    referral.recordSignup({ referredUserId: Bi, referredEmail: `cap${i}@example.com`, code: c5 });
    S[`sub_cap${i}`] = { user: Bi, customer: `cus_cap${i}`, status: 'active', price: 'price_std', cancel: false, schedule: null };
    await billing.handleEvent(ev(`evt_cap${i}_co`, 'checkout.session.completed', { mode: 'subscription', client_reference_id: Bi, customer: `cus_cap${i}`, subscription: `sub_cap${i}` }));
    const n0 = balanceCalls().length;
    await billing.handleEvent(ev(`evt_cap${i}_inv`, 'invoice.paid', { id: `in_cap${i}`, subscription: `sub_cap${i}`, amount_paid: 1100 }));
    granted += balanceCalls().length - n0;
  }
  const st5 = store.Referrals.statsFor(A5);
  ok(granted === 2 && st5.rewarded === 2 && st5.capped === 1, '1人が受けられる特典は上限（2件）まで。超えた分は付けず、上限のため対象外として記録する');
  process.env.REFERRAL_MAX_REWARDS = '5'; // 以降の紹介のテストは、上限5件で行う
  // Stripeの失敗 → 再送で付く（二重にならない）
  const A6 = mkMember('referrer6@example.com', 'sub_ref6', { customer: 'cus_referrer6' });
  const B6 = mkUser('referred6@example.com');
  referral.recordSignup({ referredUserId: B6, referredEmail: 'referred6@example.com', code: store.ReferralCodes.forUser(A6) });
  S.sub_b6 = { user: B6, customer: 'cus_b6', status: 'active', price: 'price_std', cancel: false, schedule: null };
  await billing.handleEvent(ev('evt_b6_co', 'checkout.session.completed', { mode: 'subscription', client_reference_id: B6, customer: 'cus_b6', subscription: 'sub_b6' }));
  failBalance = true;
  let failed = false;
  try { await billing.handleEvent(ev('evt_b6_inv', 'invoice.paid', { id: 'in_b6', subscription: 'sub_b6', amount_paid: 1100 })); } catch { failed = true; }
  ok(failed && store.Referrals.getByReferred(B6).status === 'pending' && store.Referrals.getByReferred(B6).reward_granted_at === '' && !store.StripeEvents.seen('evt_b6_inv'), 'Stripeへの付与に失敗したら、印を戻し、イベントを処理済みにしない（Webhookが失敗を返し、Stripeが再送する）');
  failBalance = false;
  const n6 = balanceCalls().length;
  await billing.handleEvent(ev('evt_b6_inv', 'invoice.paid', { id: 'in_b6', subscription: 'sub_b6', amount_paid: 1100 }));
  ok(balanceCalls().length === n6 + 1 && store.Referrals.getByReferred(B6).status === 'rewarded', '再送されたWebhookで、1回だけ付与する');
  ok(balanceCalls().slice(-2).every((c) => c.headers['Idempotency-Key']), '付与の呼び出しには、いつも Idempotency-Key を付ける');
  // 同時に2回処理されても1回
  const A7 = mkMember('referrer7@example.com', 'sub_ref7', { customer: 'cus_referrer7' });
  const B7 = mkUser('referred7@example.com');
  referral.recordSignup({ referredUserId: B7, referredEmail: 'referred7@example.com', code: store.ReferralCodes.forUser(A7) });
  S.sub_b7 = { user: B7, customer: 'cus_b7', status: 'active', price: 'price_std', cancel: false, schedule: null };
  store.Subscriptions.upsert(B7, { stripe_customer_id: 'cus_b7', stripe_subscription_id: 'sub_b7', status: 'active' });
  const n7 = balanceCalls().length;
  await Promise.all([referral.onFirstPaidInvoice(B7), referral.onFirstPaidInvoice(B7)]);
  ok(balanceCalls().length === n7 + 1, '同時に2回処理されても、特典は1回だけ付ける（reward_granted_at を1文のUPDATEで確保）');

  console.log('紹介：画面と登録（HTTP）');
  const server = require('../server');
  await new Promise((rs) => server.listen(0, '127.0.0.1', rs));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.SERVICE_BASE_URL = base;
  let cookie = '';
  let fakeIp = ''; // 登録の回数制限（IPごと）を避けるため、ケースごとに送信元のIPを変える
  const req = (method, p, { body } = {}) => new Promise((resolve, reject) => {
    const data = body ? new URLSearchParams(body).toString() : '';
    const r2 = http.request(`${base}${p}`, { method, headers: { ...(fakeIp ? { 'fly-client-ip': fakeIp } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c));
      res.on('end', () => { const sc = res.headers['set-cookie']; if (sc) cookie = sc.map((x) => x.split(';')[0]).join('; '); resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(ch).toString('utf8') }); });
    });
    r2.on('error', reject); if (data) r2.write(data); r2.end();
  });
  // 販売を開始した状態にする（e2e と同じ：法務文書の【】を埋めた写し）
  const legalTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-legal2-'));
  for (const f of core.LEGAL_FILES) {
    const t = fs.readFileSync(path.join(__dirname, '..', 'legal', f), 'utf8');
    fs.writeFileSync(path.join(legalTmp, f), t.replace(/【(?!メールアドレス】|代表者の氏名】|サービス名】)([^】]+)】/g, (m, x) => (x.trim() ? `（記入済み：${x}）` : m)));
  }
  Object.assign(process.env, { SERVICE_OPEN: 'true', SERVICE_CONTACT_EMAIL: 'support@example.com', SERVICE_REPRESENTATIVE: '代表 太郎', SERVICE_LEGAL_DIR: legalTmp });
  ok(core.salesOpen(), '（準備）販売を開始した状態');

  let r2 = await req('GET', `/service/signup?ref=${code}`);
  ok(r2.status === 200 && r2.text.includes(`name="ref" value="${code}"`) && r2.text.includes('30日間無料'), '紹介のURL（?ref=）で開いた登録の画面は、コードを隠し項目で引き継ぎ、30日間無料であることを書く');
  r2 = await req('GET', '/service/signup?ref=<script>');
  ok(r2.status === 200 && !r2.text.includes('name="ref"') && !r2.text.includes('<script>alert'), '形式が正しくないコードは引き継がない');
  r2 = await req('POST', '/service/signup', { body: { email: 'bad', password: 'short', ref: code } });
  ok(r2.status === 400 && r2.text.includes(`name="ref" value="${code}"`), '登録に失敗して画面を出し直しても、コードを保持する');
  r2 = await req('POST', '/service/signup', { body: { email: 'viaref@example.com', password: 'password123', ref: code } });
  const viaRef = Users.findByEmail('viaref@example.com');
  ok(r2.status === 302 && r2.headers.location === '/service/checkout' && viaRef && store.Referrals.getByReferred(viaRef.id) && store.Referrals.getByReferred(viaRef.id).referrer_user_id === A, '紹介のURLから登録すると、referrals 表に記録する（users 表は変えない）');
  r2 = await req('GET', '/service/checkout');
  ok(r2.status === 200 && r2.text.includes('紹介された人は30日間無料（条件あり）') && r2.text.includes('お申込みの完了から30日間は無料') && r2.text.includes('自動で有料の契約に切り替わり'), '紹介された人の最終確認画面に、30日間無料と、自動で課金が始まることを書く');
  const csrfOf = (html) => (html.match(/name="csrf" value="([a-f0-9]+)"/) || [])[1];
  const csrf = csrfOf(r2.text);
  r2 = await req('POST', '/service/checkout', { body: { csrf, agree: '1', plan: 'agency' } });
  ok(r2.status === 303, '30件プランが使えるときは、30件プランで申し込める');
  cs = decodeURIComponent(calls.filter((c) => c.path === '/v1/checkout/sessions').pop().body);
  ok(cs.includes('line_items[0][price]=price_ag') && cs.includes('subscription_data[trial_period_days]=30'), '30件プランの価格で、紹介の30日無料つきのCheckoutを作る');
  const cl = require('../lib/consent').forUser(viaRef.id);
  const det = cl.length ? JSON.parse(cl[cl.length - 1].detail) : {};
  ok(det.plan === 'agency' && det.price === 3300 && det.limits.accounts === 30 && det.trialDays === 30 && det.referralTrial === true && cl[cl.length - 1].terms_version === core.TERMS_VERSION && !JSON.stringify(det).includes(code), '同意の記録に、選んだプラン・金額・連携の上限・紹介の無料期間を残す（紹介コードは残さない）');
  delete process.env.STRIPE_PRICE_ID_AGENCY;
  const nSess = calls.filter((c) => c.path === '/v1/checkout/sessions').length;
  r2 = await req('POST', '/service/checkout', { body: { csrf, agree: '1', plan: 'agency' } });
  ok(r2.status === 400 && r2.text.includes('30件プランは、現在お申込みいただけません') && calls.filter((c) => c.path === '/v1/checkout/sessions').length === nSess, '30件プランが未設定のときは、フォームを直接送られても申込みを断る');
  r2 = await req('GET', '/service/checkout?plan=agency');
  ok(r2.status === 400 && r2.text.includes('月額 1,100円') && !r2.text.includes('name="plan" value="agency"'), '30件プランが未設定のときは、30件プランの画面を出さない');
  process.env.STRIPE_PRICE_ID_AGENCY = 'price_ag';
  r2 = await req('GET', '/service/checkout?plan=agency');
  ok(r2.status === 200 && r2.text.includes('月額 3,300円（税込）') && r2.text.includes('連携できるSNSアカウントは30件まで'), '?plan=agency で、30件プランの最終確認画面を開ける');

  // マイページ：紹介のカード、プランの変更（HTTP）
  cookie = '';
  r2 = await req('POST', '/service/signup', { body: { email: 'member@example.com', password: 'password123' } });
  const M = Users.findByEmail('member@example.com').id;
  S.sub_m = { user: M, customer: 'cus_m', status: 'active', price: 'price_std', cancel: false, schedule: null };
  store.Subscriptions.upsert(M, { stripe_customer_id: 'cus_m', stripe_subscription_id: 'sub_m', status: 'active', plan: 'standard', current_period_end: new Date(periodEnd * 1000).toISOString() });
  r2 = await req('GET', '/service/app');
  const mCode = store.ReferralCodes.forUser(M);
  ok(r2.text.includes(`${base}/service/signup?ref=${mCode}`) && r2.text.includes('友だちを紹介する') && r2.text.includes('最初の有料の請求を支払ったあと') && r2.text.includes('特典には上限があります') && r2.text.includes('最大5件まで') && r2.text.includes('自動で課金が始まります'), 'マイページに、紹介のURLと、特典の条件（無料期間のあと自動で課金・最初に支払ったあとに付く・上限）を出す');
  const mCsrf = csrfOf(r2.text);
  r2 = await req('POST', '/service/billing/plan', { body: { csrf: 'bad', plan: 'agency' } });
  ok(r2.status === 403 && store.Subscriptions.get(M).plan === 'standard', 'プランの変更にもCSRFトークンが必要');
  r2 = await req('POST', '/service/billing/plan', { body: { csrf: mCsrf, plan: 'agency' } });
  ok(r2.status === 302 && r2.headers.location === '/service/app?f=plan_agency' && store.Subscriptions.get(M).plan === 'agency', 'マイページから30件プランに変更できる');
  r2 = await req('GET', '/service/app?f=plan_agency');
  ok(r2.text.includes('30件プランに変更しました') && r2.text.includes('連携できるSNSアカウントは30件まで'), '変更後のマイページに、30件プランと上限を出す');
  r2 = await req('POST', '/service/billing/plan', { body: { csrf: mCsrf, plan: 'standard' } });
  ok(r2.status === 302 && r2.headers.location === '/service/app?f=plan_standard_scheduled' && store.Subscriptions.get(M).pending_plan === 'standard', 'マイページから通常プランへの切り替えを予約できる');
  r2 = await req('GET', '/service/app');
  ok(r2.text.includes('次回の更新日から、通常プランに切り替わります'), '予約中の表示を出す');
  r2 = await req('GET', '/service/signup');
  ok(r2.status === 302, 'ログイン済みで登録の画面を開くと、マイページへ移動する');

  // マイページの紹介カード：見出し・条件・表示のルール・勧誘のルール・取り消し（働いているとき。ENABLED=true・上限5）
  r2 = await req('GET', '/service/app');
  const cardT = r2.text.slice(r2.text.indexOf('id="referral"'));
  ok(cardT.includes('紹介された人は30日間無料。紹介した人には、条件を満たすと1か月分の利用料金に相当するクレジットが付きます') && cardT.includes('条件あり：無料期間のあとは自動で課金が始まります／特典は、紹介された人が最初に支払ったあとに付きます／特典には上限があります'), '紹介カードに、見出しと、近接した「条件あり」を出す');
  ok(cardT.includes('「PR」「紹介特典あり」') && cardT.includes('「必ず稼げる」「ずっと無料で使える」') && cardT.includes('無差別なDM・メール・大量投稿') && cardT.includes('各SNSの規約を守って') && cardT.includes('直接紹介した人の分だけ') && cardT.includes('特典の取り消しや利用の停止'), '紹介カードに、紹介の表示（PR等）・誇大な説明と迷惑な勧誘の禁止・SNS規約・直接紹介の分だけ・取り消しと停止を出す');
  ok(cardT.includes('最大5件まで') && cardT.includes('（上限 5件）') && !/12\s*件/.test(cardT), '紹介カードに、設定した上限の数字を出す（仮の12件は出さない）');
  ok(!cardT.includes('無効・対象外'), '紹介した人の画面に、「無効・対象外 N人」を出さない（人数と特典を付けた件数だけ）');
  ok(!cardT.includes('最初の請求を待っている') && cardT.includes('特典を付けた'), '紹介した人の画面に出すのは、登録した人数と、特典を付けた件数だけ');
  const legalT = fs.readFileSync(path.join(__dirname, '..', 'legal', 'サービス利用規約_案.md'), 'utf8');
  const art = legalT.slice(legalT.indexOf('### 第4条の2'), legalT.indexOf('### 第5条'));
  ok(['直接紹介した人の分だけ', '「PR」「紹介特典あり」', '「必ず稼げる」「ずっと無料で使える」', '無差別なDM・メール・大量投稿', '各SNSの規約を守る', 'チャージバック', '不正な紹介であると運営者が確認したとき', '現金への交換、返金', '払い戻しもしません', '利用の停止'].every((t) => art.includes(t)) && !/12\s*件/.test(legalT), '規約の第4条の2に、特典の範囲・表示と勧誘のルール・取り消しの基準・クレジットの扱いがある（12件の記載はない）');
  const tokuT = fs.readFileSync(path.join(__dirname, '..', 'legal', 'サービス特定商取引法表記_案.md'), 'utf8');
  ok(tokuT.includes('紹介された人は30日間無料。紹介した人には、条件を満たすと1か月分の利用料金に相当するクレジットが付きます') && tokuT.includes('条件あり：無料期間のあとは自動で課金が始まります／特典は、紹介された人が最初に支払ったあとに付きます／特典には上限があります'), '特商法表記の紹介の表記が、画面と同じ言い方');
  ok(legalT.includes('紹介された人は30日間無料。紹介した人には、条件を満たすと1か月分の利用料金に相当するクレジットが付きます'), '規約の紹介の表記が、画面と同じ言い方');
  ok(referral.infoFor(M).max === 5 && referral.maxRewards() === 5, '働いているとき、画面用の値に設定値が入る');
  // 運営者画面の行
  const rowOn = ui.settingsChecklist({ ...process.env, REFERRAL_ENABLED: 'true', REFERRAL_MAX_REWARDS: '7' }).find((row) => row[0].includes('REFERRAL_ENABLED'));
  ok(rowOn && rowOn[1] === true && rowOn[2].startsWith('働いている') && rowOn[2].includes('最大7件'), '運営者画面の設定の確認：働いているときの行（上限を出す）');
  const rowNoFlag = ui.settingsChecklist({ ...process.env, REFERRAL_ENABLED: '', REFERRAL_MAX_REWARDS: '7' }).find((row) => row[0].includes('REFERRAL_ENABLED'));
  ok(rowNoFlag && rowNoFlag[1] === false && rowNoFlag[2].startsWith('止まっている') && rowNoFlag[2].includes('有効にしていない') && !rowNoFlag[2].includes('上限が未設定'), '運営者画面：REFERRAL_ENABLED が無いときは「止まっている（有効にしていない）」');
  const rowNoMax = ui.settingsChecklist({ ...process.env, REFERRAL_ENABLED: 'true', REFERRAL_MAX_REWARDS: '' }).find((row) => row[0].includes('REFERRAL_ENABLED'));
  ok(rowNoMax && rowNoMax[1] === false && rowNoMax[2].startsWith('止まっている') && rowNoMax[2].includes('上限が未設定') && !rowNoMax[2].includes('有効にしていない'), '運営者画面：上限が無いときは「止まっている（上限が未設定）」');
  const rowBoth = ui.settingsChecklist({ ...process.env, REFERRAL_ENABLED: '', REFERRAL_MAX_REWARDS: '' }).find((row) => row[0].includes('REFERRAL_ENABLED'));
  ok(rowBoth && rowBoth[2].includes('有効にしていない') && rowBoth[2].includes('上限が未設定'), '運営者画面：両方無いときは理由を2つとも出す');

  // 紹介機能が止まっているとき：未設定／ENABLED だけ／上限だけ／上限0／不正な値
  console.log('紹介：止まっているとき');
  const offCases = [
    ['未設定', {}],
    ['REFERRAL_ENABLED だけ', { REFERRAL_ENABLED: 'true' }],
    ['上限だけ', { REFERRAL_MAX_REWARDS: '5' }],
    ['ENABLED=true・上限0', { REFERRAL_ENABLED: 'true', REFERRAL_MAX_REWARDS: '0' }],
    ['ENABLED=true・上限が不正（abc）', { REFERRAL_ENABLED: 'true', REFERRAL_MAX_REWARDS: 'abc' }],
    ['ENABLED=true・上限が負', { REFERRAL_ENABLED: 'true', REFERRAL_MAX_REWARDS: '-3' }],
    ['ENABLED=true・上限が小数', { REFERRAL_ENABLED: 'true', REFERRAL_MAX_REWARDS: '2.5' }],
    ['ENABLED=false・上限5', { REFERRAL_ENABLED: 'false', REFERRAL_MAX_REWARDS: '5' }],
  ];
  const savedEnv = { e: process.env.REFERRAL_ENABLED, m: process.env.REFERRAL_MAX_REWARDS };
  const setRef = (o) => { delete process.env.REFERRAL_ENABLED; delete process.env.REFERRAL_MAX_REWARDS; Object.assign(process.env, o); };
  // 働いているあいだに、記録を1件作っておく（止まったあとの無料期間・特典の確認用）
  const Ap = mkMember('referrer-off@example.com', 'sub_refoff', { customer: 'cus_referreroff' });
  const codeOff = store.ReferralCodes.forUser(Ap);
  const Bp = mkUser('referred-off@example.com');
  referral.recordSignup({ referredUserId: Bp, referredEmail: 'referred-off@example.com', code: codeOff });
  S.sub_boff = { user: Bp, customer: 'cus_boff', status: 'active', price: 'price_std', cancel: false, schedule: null };
  await billing.handleEvent(ev('evt_boff_co', 'checkout.session.completed', { mode: 'subscription', client_reference_id: Bp, customer: 'cus_boff', subscription: 'sub_boff' }));
  const memberCookie = cookie;
  let caseNo = 0;
  for (const [label, envs] of offCases) {
    caseNo++; fakeIp = `10.9.0.${caseNo}`;
    setRef(envs);
    ok(referral.enabled() === false && referral.infoFor(M) === null, `止まっている（${label}）：紹介機能は働かない`);
    cookie = memberCookie;
    r2 = await req('GET', '/service/app');
    ok(r2.status === 200 && !r2.text.includes('友だちを紹介する') && !r2.text.includes('id="referral"') && !r2.text.includes('/service/signup?ref='), `止まっている（${label}）：マイページに紹介カードを出さない`);
    cookie = '';
    r2 = await req('GET', `/service/signup?ref=${codeOff}`);
    ok(r2.status === 200 && !r2.text.includes('name="ref"') && !r2.text.includes('30日間無料') && !r2.text.includes('紹介のURL') && !r2.text.includes('紹介された人'), `止まっている（${label}）：登録の画面に紹介の文言を出さず、コードも引き継がない`);
    const em = `off${caseNo}@example.com`;
    r2 = await req('POST', '/service/signup', { body: { email: em, password: 'password123', ref: codeOff } });
    const offU = Users.findByEmail(em).id;
    ok(r2.status === 302 && store.Referrals.getByReferred(offU) === null && core.trialFor(offU) === 0 && core.referralTrialFor(offU) === 0, `止まっている（${label}）：?ref= が付いていても、記録せず、無料期間も付けない`);
    r2 = await req('GET', '/service/checkout');
    ok(r2.status === 200 && !r2.text.includes('紹介された人') && !r2.text.includes('紹介のURL') && !r2.text.includes('紹介による') && !r2.text.includes('30日間は無料'), `止まっている（${label}）：最終確認画面に紹介の文言も無料期間も出さない`);
    const n = balanceCalls().length;
    store.Referrals.setStatus(store.Referrals.getByReferred(Bp).id, 'pending', '');
    await billing.handleEvent(ev(`evt_boff_inv${caseNo}`, 'invoice.paid', { id: `in_boff${caseNo}`, subscription: 'sub_boff', amount_paid: 1100 }));
    ok(balanceCalls().length === n && store.Referrals.getByReferred(Bp).status === 'pending' && store.Referrals.getByReferred(Bp).reward_granted_at === '', `止まっている（${label}）：invoice.paid でも特典を付けない`);
    ok(core.referralTrialFor(Bp) === 0, `止まっている（${label}）：記録が残っていても無料期間を付けない`);
  }
  fakeIp = '';
  // 再び働かせる（ENABLED=true・上限5）：従来どおり動く
  setRef({ REFERRAL_ENABLED: 'true', REFERRAL_MAX_REWARDS: '5' });
  ok(referral.enabled() === true && referral.maxRewards() === 5 && referral.disabledReason() === '', '働いているとき（ENABLED=true・上限5）：紹介機能が働く');
  cookie = memberCookie;
  r2 = await req('GET', '/service/app');
  ok(r2.text.includes('友だちを紹介する') && r2.text.includes('id="referral"'), '働いているとき：マイページに紹介カードを出す');
  cookie = '';
  r2 = await req('GET', `/service/signup?ref=${codeOff}`);
  ok(r2.text.includes(`name="ref" value="${codeOff}"`) && r2.text.includes('紹介された人は30日間無料'), '働いているとき：登録の画面に紹介の案内を出し、コードを引き継ぐ');
  const nOn = balanceCalls().length;
  await billing.handleEvent(ev('evt_boff_inv_on', 'invoice.paid', { id: 'in_boff_on', subscription: 'sub_boff', amount_paid: 1100 }));
  ok(balanceCalls().length === nOn + 1 && store.Referrals.getByReferred(Bp).status === 'rewarded', '働いているとき：invoice.paid で特典を付ける');
  process.env.REFERRAL_ENABLED = savedEnv.e; process.env.REFERRAL_MAX_REWARDS = savedEnv.m;

  // 無料期間中の通常→30件は、日割りが発生しない
  const subTr = { status: 'trialing', stripe_subscription_id: 'sub_x', plan: 'standard', pending_plan: '' };
  dash = ui.dashboardPage({ user: { id: uStd, email: 'a' }, sub: subTr, accounts: [], posts: [], csrf: 'c', snsReady: true, agencyOffered: true });
  ok(dash.includes('30件プランに変更する') && dash.includes('最初の請求から30件プランの月額になります') && !dash.includes('日割りで計算') && !dash.includes('日割りの差額'), '無料期間中の画面と確認ダイアログに、日割りではなく「最初の請求から30件プランの月額」と出す');
  cookie = '';
  r2 = await req('POST', '/service/signup', { body: { email: 'trialplan@example.com', password: 'password123' } });
  const T = Users.findByEmail('trialplan@example.com').id;
  S.sub_t = { user: T, customer: 'cus_t', status: 'trialing', price: 'price_std', cancel: false, schedule: null };
  store.Subscriptions.upsert(T, { stripe_customer_id: 'cus_t', stripe_subscription_id: 'sub_t', status: 'trialing', plan: 'standard', current_period_end: new Date(periodEnd * 1000).toISOString() });
  r2 = await req('GET', '/service/app');
  r2 = await req('POST', '/service/billing/plan', { body: { csrf: csrfOf(r2.text), plan: 'agency' } });
  ok(r2.status === 302 && r2.headers.location === '/service/app?f=plan_agency_trial', '無料期間中に30件へ変えると、無料期間用のメッセージに移動する');
  r2 = await req('GET', '/service/app?f=plan_agency_trial');
  ok(r2.text.includes('無料期間中のため日割りはなく、最初の請求から30件プランの月額になります') && !r2.text.includes('日割りの差額は、次回の請求に含まれます'), '無料期間中のメッセージに、日割りの差額と出さない');

  // 紹介コードから個人が分かる情報を返さない
  cookie = '';
  r2 = await req('GET', `/service/signup?ref=${code}`);
  ok(!r2.text.includes('referrer@example.com') && !r2.text.includes(A), '紹介のURLの登録画面に、紹介した人のメールアドレス・IDを出さない');
  r2 = await req('GET', `/service/signup?ref=${'f'.repeat(20)}`);
  ok(r2.status === 200 && r2.text.includes('name="ref"'), '存在しないコードでも同じ画面を返す（コードが有効かどうかを知らせない）');

  server.close();
  mock.restore();
  summary();
})().catch((e) => { console.error(e); process.exit(1); });
