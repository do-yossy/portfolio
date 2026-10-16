'use strict';
// 連携を消す（マイページの解除・契約の終了・テスト利用の取り消し・YouTube の自動削除で使う）。
// YouTube は、DBの行（トークン）を消す前に、Google にトークンの取り消しを送る（YouTube API Services の Developer Policies III.D.2。
// 送り方は lib/sns/youtube.js の revoke）。取り消しに失敗しても、行は消す（失敗は運営者のログに残す）。
// ほかのSNSのトークンの取り消しは、今は行わない（行を消すだけ）。
// Metaから届く削除の求め・取り消しの知らせ（lib/meta-deletion.js）は Threads・Instagram・Facebook だけのため、SnsAccounts.remove を直接呼ぶ。
const { SnsAccounts } = require('../service-store');
const box = require('../crypto-box');
const youtube = require('./youtube');

// トークンの取り消しを送り始める。送るのは、この関数を呼んだその場（行を消す前）。
// 戻り値の Promise は reject しない：{ revoked: true }（取り消した）／{ revoked: false }（失敗・トークンなし）／{ skipped: true }（対象外のSNS）
function startRevoke(account) {
  if (!account || account.platform !== 'youtube') return Promise.resolve({ skipped: true });
  let token = '';
  try {
    const k = box.keyFromEnv();
    // 更新用のトークンがあればそれで、無ければアクセストークンで取り消す（公式：どちらでもよい）
    token = account.refresh_token_enc ? box.decrypt(account.refresh_token_enc, k) : box.decrypt(account.access_token_enc, k);
  } catch (e) {
    console.warn('[youtube revoke] トークンを読めませんでした', e && e.message);
    return Promise.resolve({ revoked: false });
  }
  if (!token) return Promise.resolve({ revoked: false });
  return youtube.revoke({ token }).then(
    () => ({ revoked: true }),
    (e) => { console.warn('[youtube revoke] Googleでの取り消しに失敗しました（連携の情報は削除しました）', e && e.message); return { revoked: false }; },
  );
}

// 取り消しを送ってから、連携を消す（行の削除・予約の取り消し・投稿IDとリンクの削除：SnsAccounts.remove）。
// 行の削除は、取り消しの結果を待たずに、この関数の中で済ませる（失敗しても消すため）。戻り値は取り消しの結果の Promise（reject しない）
function removeAccount(account) {
  const revoking = startRevoke(account);
  SnsAccounts.remove(account.id, account.user_id);
  return revoking;
}

module.exports = { startRevoke, removeAccount };
