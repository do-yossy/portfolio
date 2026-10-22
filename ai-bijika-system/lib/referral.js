'use strict';
// 利用者からの紹介（紹介された人は30日間無料、紹介した人には条件を満たすと1か月分のクレジット）。REFERRAL_ENABLED=true と上限の設定がそろったときだけ動く。
//   紹介された人：ref 付きのURLから登録 → 初めての申込みのとき30日無料（lib/service-core.js の trialFor）
//   紹介した人　：紹介された人が、無料期間のあとの最初の有料の請求（invoice.paid で amount_paid > 0）を払ったとき、1か月分のクレジットを付ける
// 紹介の記録は referrals 表（lib/service-store.js）。users 表は変えない。
const { Users } = require('../db');
const { Subscriptions, ReferralCodes, Referrals } = require('./service-store');

// 紹介機能は、オーナーが「有効にする」と明示するまで止めておく（既定は止まっている）。
//   働く条件：REFERRAL_ENABLED=true かつ REFERRAL_MAX_REWARDS が1以上の整数。どちらかが欠けている・0・不正な値のときは、機能全体が止まる
//   （紹介コードの発行・表示、登録画面の案内、紹介された人の30日無料、特典の付与のすべて）。仮の既定値は持たない
// 1人が受けられる特典の上限（件数）。オーナーが決める設定値。1以上の整数だけを有効とし、それ以外は null
function maxRewards(env = process.env) {
  const s = String(env.REFERRAL_MAX_REWARDS || '').trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const v = parseInt(s, 10);
  return v >= 1 ? v : null;
}
const maxRewardsSet = (env = process.env) => maxRewards(env) !== null;
const flagOn = (env = process.env) => String(env.REFERRAL_ENABLED || '').trim() === 'true';
function enabled(env = process.env) { return flagOn(env) && maxRewardsSet(env); }
// 止まっている理由（働いているときは空）。運営者画面の表示用
function disabledReason(env = process.env) {
  if (enabled(env)) return '';
  const r = [];
  if (!flagOn(env)) r.push('REFERRAL_ENABLED=true にしていない（有効にしていない）');
  if (!maxRewardsSet(env)) r.push('REFERRAL_MAX_REWARDS が未設定、または1以上の整数ではない（上限が未設定）');
  return r.join('／');
}

// 同じ人の別名のメールアドレスを同じものとして扱う（大文字小文字、+タグ、Gmailのドット）。自分自身の紹介を見分けるためだけに使う
function emailKey(email) {
  const [local = '', domain = ''] = String(email || '').trim().toLowerCase().split('@');
  let l = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') l = l.replace(/\./g, '');
  return `${l}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`;
}

const validCode = (c) => /^[0-9a-f]{20}$/.test(String(c || ''));

// 登録のときに、紹介を記録する。コードが無効・存在しなければ何もしない（コードの有効・無効は、登録する人にも知らせない）。
// 自分自身（同じ利用者、同じメールアドレス）の紹介は、無効（void）で記録する
function recordSignup({ referredUserId, referredEmail, code }) {
  if (!enabled()) return null; // 紹介機能が止まっているときは記録しない
  const referrerId = ReferralCodes.findUserId(code);
  if (!referrerId) return null;
  const referrer = Users.findById(referrerId);
  if (!referrer) return null;
  const self = referrerId === referredUserId || emailKey(referrer.email) === emailKey(referredEmail);
  return Referrals.create({ referrerUserId: referrerId, referredUserId, code, status: self ? 'void' : 'pending', voidReason: self ? 'self' : '' });
}

// 紹介された人の契約が、最初の有料の請求の前に終わった（解約・期限切れ）ら、特典は付けない
function onSubscriptionEnded(userId) {
  const r = Referrals.getByReferred(userId);
  if (r && r.status === 'pending') Referrals.setStatus(r.id, 'void', 'canceled');
}

// 紹介された人の、最初の有料の請求が払われたとき（lib/billing.js の invoice.paid から、amount_paid > 0 のときだけ呼ばれる）。
// 特典：紹介した人の「顧客の残高」に、契約の1か月分の金額のクレジットを付ける（次の請求から自動で差し引かれる）。
//   クーポン（100%オフ・1回）にしなかった理由：
//   (1) 契約の割引（discounts）は1つの契約に置き換わる形で付くため、前の特典がまだ使われていないうちに次の特典を付けると、上書きされて1か月分を失うおそれがある。
//       残高のクレジットは積み上がり、次の請求から順に使われる。
//   (2) 作成した取引（balance transaction）は取り消せない記録で、Idempotency-Key で同じ呼び出しを1回にできる（二重付与しにくい）。
//   (3) 契約の割引を使わないので、プラン変更で作る subscription schedule（割引を引き継がない項目がある）とも干渉しない。
//   難点：金額を自分で決める必要がある。紹介した人の契約の価格の unit_amount を Stripe から取得して使う（取得できなければ画面に表示する月額）。
// 二重付与しないしくみ：referrals.reward_granted_at を、1文のUPDATE（空で、上限未満のときだけ）で確保してから Stripe を呼ぶ。
//   Stripe の呼び出しに失敗したら印を戻して例外を投げる（Webhookが500になり、Stripeが再送する）。Idempotency-Key は referral の id。
// ※ balance_transactions の呼び出しは公式のAPIリファレンスに合わせたが、実物（テストモード）では未確認。
async function onFirstPaidInvoice(referredUserId) {
  if (!enabled()) return { skipped: true, disabled: true }; // 紹介機能が止まっているときは特典を付けない
  const ref = Referrals.getByReferred(referredUserId);
  if (!ref || ref.status !== 'pending') return { skipped: true };
  const referredSub = Subscriptions.get(referredUserId);
  if (!referredSub || ['canceled', 'incomplete_expired'].includes(referredSub.status)) { onSubscriptionEnded(referredUserId); return { skipped: true }; }
  const referrerId = ref.referrer_user_id;
  const rs = Subscriptions.get(referrerId);
  // 紹介した人が契約中でない（解約済み・支払いの確認が必要・テスト利用など）ときは、特典を付けずに保留にして記録する（再契約したときに付ける機能は無い）
  if (!rs || !rs.stripe_customer_id || !rs.stripe_subscription_id || !['active', 'trialing'].includes(rs.status)) {
    Referrals.setStatus(ref.id, 'held');
    return { held: true };
  }
  if (!Referrals.claimReward(ref.id, referrerId, maxRewards() || 0)) {
    // すでに付与済み（同じWebhookの再送・同時の処理）なら何もしない。付与済みでなければ、上限に達している
    if (Referrals.getByReferred(referredUserId).reward_granted_at === '') Referrals.setStatus(ref.id, 'capped');
    return { skipped: true };
  }
  const billing = require('./billing');
  const core = require('./service-core');
  try {
    let amount = core.priceYen(core.planOf(rs)); let currency = 'jpy';
    const sub = await billing.stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(rs.stripe_subscription_id)}`);
    const price = sub && sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price;
    if (price && Number.isInteger(price.unit_amount) && price.unit_amount > 0) { amount = price.unit_amount; currency = String(price.currency || 'jpy').toLowerCase(); }
    await billing.stripeRequest('POST', `/v1/customers/${encodeURIComponent(rs.stripe_customer_id)}/balance_transactions`, {
      amount: -amount, currency, description: '紹介特典（1か月分）', metadata: { referral_id: ref.id },
    }, { idempotencyKey: `referral-reward-${ref.id}` });
    Referrals.setRewardAmount(ref.id, amount);
    return { rewarded: true, amount };
  } catch (e) {
    Referrals.revertClaim(ref.id);
    throw e;
  }
}

// マイページに出す情報。紹介された人のメールアドレスなどは含めない（件数だけ）。紹介機能が止まっているときは null（コードも作らない）
function infoFor(userId) {
  if (!enabled()) return null;
  const base = String(process.env.SERVICE_BASE_URL || '').replace(/\/+$/, '');
  const code = ReferralCodes.forUser(userId);
  const stats = Referrals.statsFor(userId);
  return { code, url: `${base}/service/signup?ref=${code}`, stats, max: maxRewards() };
}

module.exports = { enabled, disabledReason, maxRewards, maxRewardsSet, emailKey, validCode, recordSignup, onSubscriptionEnded, onFirstPaidInvoice, infoFor };
