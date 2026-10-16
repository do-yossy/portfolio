'use strict';
// YouTube の連携を消すときの、Google へのトークンの取り消しと、トークンの定期確認（1日1回）と、再連携が必要なまま28日たった連携の自動削除のテスト。
// 取り消し：POST https://oauth2.googleapis.com/revoke（token=…）を、DBの行を消す前に送る。失敗しても行は消す。
// 呼ぶ場所：マイページの解除・契約の終了（billing.endAccess）・テスト利用の取り消し（billing.revokeTest）・自動削除（scheduler）
// 実行: node --experimental-sqlite test/youtube-revoke.test.js （Google はモック）
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-ytrevoke-'));
process.env.SNS_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
process.env.SNS_APPROVED = 'threads,youtube';
process.env.THREADS_APP_ID = 'th_id';
process.env.THREADS_APP_SECRET = 'th_secret';
process.env.GOOGLE_CLIENT_ID = 'g_id';
process.env.GOOGLE_CLIENT_SECRET = 'g_secret';
process.env.ADMIN_PASSWORD = 'adminpw';

const { ok, summary, installHttpsMock } = require('./helpers');
const { Users, db } = require('../db');
const store = require('../lib/service-store');
const box = require('../lib/crypto-box');
const billing = require('../lib/billing');
const auth = require('../lib/auth');
const youtube = require('../lib/sns/youtube');
const disconnect = require('../lib/sns/disconnect');
const scheduler = require('../lib/sns/scheduler');
const metaDeletion = require('../lib/meta-deletion');
const ui = require('../lib/service-ui');

const k = box.keyFromEnv();
const DAY = 24 * 3600 * 1000;
function mkUser(email) {
  const id = Users.create({ email, passwordHash: 'h', passwordSalt: 's' });
  store.Subscriptions.upsert(id, { status: 'active' });
  return id;
}
function mkAcc(userId, platform, externalUserId, { access = `at_${externalUserId}`, refresh = `rt_${externalUserId}`, expiresAt } = {}) {
  return store.SnsAccounts.upsert({
    userId, platform, externalUserId, handle: externalUserId, accessTokenEnc: box.encrypt(access, k),
    refreshTokenEnc: refresh ? box.encrypt(refresh, k) : '', expiresAt: expiresAt || new Date(Date.now() + 3600 * 1000).toISOString(),
  });
}
function mkPosted(userId, accountId, tag) {
  const posted = store.ScheduledPosts.create({ userId, accountId, text: `済み${tag}`, scheduledAt: new Date(Date.now() - 3600000).toISOString() });
  store.ScheduledPosts.markPosted(posted, `vid_${tag}`);
  const pending = store.ScheduledPosts.create({ userId, accountId, text: `予約${tag}`, scheduledAt: new Date(Date.now() + DAY).toISOString() });
  return { posted, pending };
}
// Google の取り消しの受け口のモック。status で応答を変える。throwError なら通信エラー
function googleMock({ status = 200, throwError = false } = {}) {
  return installHttpsMock(async (c) => {
    if (c.host === 'oauth2.googleapis.com' && c.path === '/revoke') {
      if (throwError) throw new Error('ECONNRESET');
      return status === 200 ? { status: 200, text: '' } : { status, json: { error: 'invalid_token', error_description: 'Token expired or revoked' } };
    }
    return null;
  });
}
const revokeCalls = (mock) => mock.calls.filter((c) => c.host === 'oauth2.googleapis.com' && c.path === '/revoke');
const tokenOf = (c) => new URLSearchParams(c.body).get('token');
// SnsAccounts.remove が呼ばれた時点で、取り消しがもう送られていたかを記録する
function watchRemove(mock) {
  const seen = [];
  const orig = store.SnsAccounts.remove;
  store.SnsAccounts.remove = function (id, userId) { seen.push({ id, revokedBefore: revokeCalls(mock).length }); return orig.call(this, id, userId); };
  return { seen, restore() { store.SnsAccounts.remove = orig; } };
}

(async () => {
  console.log('youtube.revoke（公式：POST https://oauth2.googleapis.com/revoke、token=…）');
  let mock = googleMock();
  ok((await youtube.revoke({ token: 'rt_abc/+=' })) === true, '200 なら取り消しできたとして true を返す');
  let c = revokeCalls(mock)[0];
  mock.restore();
  ok(c && c.method === 'POST' && /application\/x-www-form-urlencoded/.test(c.headers['Content-Type']) && tokenOf(c) === 'rt_abc/+=', 'token=… を、フォームの形式で POST する（記号もそのまま届く）');
  mock = googleMock({ status: 400 });
  let err = null; try { await youtube.revoke({ token: 'bad' }); } catch (e) { err = e; }
  mock.restore();
  ok(err && /YouTube/.test(err.message), '400（取り消せない）なら例外にする');
  err = null; try { await youtube.revoke({ token: '' }); } catch (e) { err = e; }
  ok(err, 'トークンが空なら、送らずに例外にする');

  console.log('連携を消す（lib/sns/disconnect.js）');
  const u1 = mkUser('u1@example.com');
  let yt = mkAcc(u1, 'youtube', 'UC_one');
  let posts = mkPosted(u1, yt, 'one');
  mock = googleMock();
  let w = watchRemove(mock);
  let res = await disconnect.removeAccount(store.SnsAccounts.get(yt));
  w.restore();
  c = revokeCalls(mock);
  mock.restore();
  ok(res.revoked === true && c.length === 1 && tokenOf(c[0]) === 'rt_UC_one', 'YouTube は、更新用のトークンで Google に取り消しを送る');
  ok(w.seen.length === 1 && w.seen[0].revokedBefore === 1, '取り消しは、DBの行を消す前に送る');
  ok(!store.SnsAccounts.get(yt) && store.ScheduledPosts.get(posts.posted).external_id === '' && store.ScheduledPosts.get(posts.pending).status === 'cancelled', '取り消しのあと、行・投稿ID・未投稿の予約を、マイページの解除と同じように消す');

  for (const [name, opt] of [['400（取り消せない）', { status: 400 }], ['通信エラー', { throwError: true }]]) {
    yt = mkAcc(u1, 'youtube', 'UC_fail');
    mock = googleMock(opt);
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
    res = await disconnect.removeAccount(store.SnsAccounts.get(yt));
    console.warn = origWarn;
    mock.restore();
    ok(res.revoked === false && !store.SnsAccounts.get(yt) && warns.some((x) => x.includes('[youtube revoke]')), `取り消しが${name}で失敗しても、行は消し、運営者のログに残す`);
    ok(!warns.some((x) => x.includes('rt_UC_fail') || x.includes('at_UC_fail')), `${name}のログに、トークンを出さない`);
  }

  yt = mkAcc(u1, 'youtube', 'UC_norefresh', { refresh: '' });
  mock = googleMock();
  res = await disconnect.removeAccount(store.SnsAccounts.get(yt));
  c = revokeCalls(mock);
  mock.restore();
  ok(res.revoked === true && c.length === 1 && tokenOf(c[0]) === 'at_UC_norefresh' && !store.SnsAccounts.get(yt), '更新用のトークンが無ければ、アクセストークンで取り消す');

  const th = mkAcc(u1, 'threads', 'th_one');
  mock = googleMock();
  res = await disconnect.removeAccount(store.SnsAccounts.get(th));
  mock.restore();
  ok(res.skipped === true && mock.calls.length === 0 && !store.SnsAccounts.get(th), 'YouTube 以外のSNSは、取り消しを送らずに行を消す（今回は YouTube だけ）');

  console.log('マイページの解除（HTTP）');
  const server = require('../server');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.SERVICE_BASE_URL = base;
  const send = (method, p, { body, headers = {}, cookie } = {}) => new Promise((resolve, reject) => {
    const r = http.request(`${base}${p}`, { method, headers: { ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers } }, (resp) => {
      const ch = []; resp.on('data', (x) => ch.push(x));
      resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, text: Buffer.concat(ch).toString('utf8') }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
  const u2 = mkUser('u2@example.com');
  const uOther = mkUser('other@example.com');
  const cookie2 = `session=${auth.createSession(u2)}`;
  const csrf2 = (await send('GET', '/service/app', { cookie: cookie2 })).text.match(/name="csrf" value="([a-f0-9]+)"/)[1];
  const ytU2 = mkAcc(u2, 'youtube', 'UC_two');
  const ytOther = mkAcc(uOther, 'youtube', 'UC_other');
  const form = { cookie: cookie2, body: `csrf=${csrf2}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
  mock = googleMock();
  w = watchRemove(mock);
  let r = await send('POST', `/service/app/account/${ytOther}/disconnect`, form);
  ok(r.status === 302 && store.SnsAccounts.get(ytOther) && revokeCalls(mock).length === 0, '他人の連携のIDでは、何も消さず、取り消しも送らない');
  r = await send('POST', `/service/app/account/${ytU2}/disconnect`, form);
  w.restore();
  c = revokeCalls(mock);
  mock.restore();
  ok(r.status === 302 && r.headers.location === '/service/app?f=disconnected' && !store.SnsAccounts.get(ytU2), 'マイページの「解除」で、YouTube の連携を消す');
  ok(c.length === 1 && tokenOf(c[0]) === 'rt_UC_two' && w.seen.length === 1 && w.seen[0].revokedBefore === 1, 'マイページの「解除」では、行を消す前に Google へ取り消しを送る');

  console.log('契約の終了・テスト利用の取り消し（billing）');
  const u3 = mkUser('u3@example.com');
  const yt3 = mkAcc(u3, 'youtube', 'UC_three');
  const th3 = mkAcc(u3, 'threads', 'th_three');
  mock = googleMock({ status: 400 });
  w = watchRemove(mock);
  const ended = billing.endAccess(u3);
  ok(!store.SnsAccounts.get(yt3) && !store.SnsAccounts.get(th3), '契約の終了では、取り消しの結果を待たずに、その場で全部の連携を消す（取り消しに失敗しても消す）');
  const endResults = await ended;
  w.restore();
  c = revokeCalls(mock);
  mock.restore();
  ok(c.length === 1 && tokenOf(c[0]) === 'rt_UC_three' && w.seen.find((x) => x.id === yt3).revokedBefore === 1, '契約の終了では、YouTube の行を消す前に取り消しを送る（YouTube の分だけ）');
  ok(endResults.length === 2 && endResults.some((x) => x.revoked === false) && endResults.some((x) => x.skipped), '戻り値の Promise は、失敗しても reject しない');

  const u4 = mkUser('u4@example.com');
  ok(billing.grantTest(u4).ok, '（前提）テスト利用を付与する');
  const yt4 = mkAcc(u4, 'youtube', 'UC_four');
  mock = googleMock();
  ok(billing.revokeTest(u4).ok && !store.SnsAccounts.get(yt4), 'テスト利用の取り消しで、YouTube の連携を消す');
  await new Promise((rs) => setImmediate(rs));
  c = revokeCalls(mock);
  mock.restore();
  ok(c.length === 1 && tokenOf(c[0]) === 'rt_UC_four', 'テスト利用の取り消しでも、Google へ取り消しを送る');

  console.log('再連携が必要になった日時（reauth_at）');
  const u5 = mkUser('u5@example.com');
  const yt5 = mkAcc(u5, 'youtube', 'UC_five');
  ok(store.SnsAccounts.get(yt5).reauth_at === '', '有効な連携には、日時が無い');
  store.SnsAccounts.setStatus(yt5, 'reauth_required');
  const first = store.SnsAccounts.get(yt5).reauth_at;
  ok(first !== '' && store.SnsAccounts.get(yt5).status === 'reauth_required', '「再連携が必要」にすると、その日時を記録する');
  db.prepare('UPDATE sns_accounts SET reauth_at=? WHERE id=?').run(new Date(Date.now() - 10 * DAY).toISOString(), yt5);
  const tenDaysAgo = store.SnsAccounts.get(yt5).reauth_at;
  store.SnsAccounts.setStatus(yt5, 'reauth_required');
  ok(store.SnsAccounts.get(yt5).reauth_at === tenDaysAgo, 'もう一度「再連携が必要」になっても、最初の日時を変えない（削除までの日数の数え始めを延ばさない）');
  store.SnsAccounts.updateTokens(yt5, { accessTokenEnc: box.encrypt('new', k), refreshTokenEnc: box.encrypt('rt_new', k), expiresAt: new Date(Date.now() + 3600000).toISOString() });
  ok(store.SnsAccounts.get(yt5).status === 'active' && store.SnsAccounts.get(yt5).reauth_at === '', 'トークンを更新できて有効に戻ったら、日時を消す');
  store.SnsAccounts.setStatus(yt5, 'reauth_required');
  mkAcc(u5, 'youtube', 'UC_five');
  ok(store.SnsAccounts.get(yt5).status === 'active' && store.SnsAccounts.get(yt5).reauth_at === '', '再連携しても、日時を消す');

  // Google の側で取り消された連携：投稿の前のトークンの更新が invalid_grant になり、「再連携が必要」になる
  const u6 = mkUser('u6@example.com');
  const yt6 = mkAcc(u6, 'youtube', 'UC_six', { expiresAt: new Date(Date.now() - 60000).toISOString() });
  const p6 = store.ScheduledPosts.create({ userId: u6, accountId: yt6, text: 'x', scheduledAt: new Date().toISOString() });
  mock = installHttpsMock(async (x) => (x.host === 'oauth2.googleapis.com' && x.path === '/token' ? { status: 400, json: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } : null));
  await scheduler.processOne(store.ScheduledPosts.get(p6));
  mock.restore();
  ok(store.SnsAccounts.get(yt6).status === 'reauth_required' && store.SnsAccounts.get(yt6).reauth_at !== '', 'Google の側で取り消された（invalid_grant）YouTube の連携は「再連携が必要」になり、その日時を記録する');
  const dash = ui.dashboardPage({ user: { id: u6, email: 'u6' }, sub: store.Subscriptions.get(u6), accounts: store.SnsAccounts.listForUser(u6), posts: [], csrf: 'c', snsReady: true });
  ok(dash.includes('再連携が必要') && dash.includes('再連携しないまま28日たつと、この連携の情報を削除します') && !dash.includes('30日たつと'), 'マイページで、再連携しないまま28日たつと削除することを知らせる（実装の日数と同じ）');

  console.log('再連携が必要なまま28日たった YouTube の連携の自動削除（scheduler。冪等）');
  const u7 = mkUser('u7@example.com');
  const setReauth = (id, daysAgo) => { store.SnsAccounts.setStatus(id, 'reauth_required'); db.prepare('UPDATE sns_accounts SET reauth_at=? WHERE id=?').run(new Date(Date.now() - daysAgo * DAY).toISOString(), id); };
  const ytOld = mkAcc(u7, 'youtube', 'UC_old');
  const ytRecent = mkAcc(u7, 'youtube', 'UC_recent');
  const ytActive = mkAcc(u7, 'youtube', 'UC_active');
  const thOld = mkAcc(u7, 'threads', 'th_old');
  const pOld = mkPosted(u7, ytOld, 'old');
  setReauth(ytOld, 31);
  setReauth(ytRecent, 27);
  setReauth(thOld, 31);
  ok(scheduler.YOUTUBE_REAUTH_DELETE_DAYS === 28 && scheduler.YOUTUBE_TOKEN_CHECK_HOURS === 24, '日数は28日、確かめる間隔は24時間（気づくまでの最長約25時間と、消すまでの最長1時間を足しても、取り消しから30日以内に収まる）');
  mock = googleMock({ status: 400 });
  w = watchRemove(mock);
  let n = await scheduler.purgeRevokedYoutube();
  w.restore();
  c = revokeCalls(mock);
  mock.restore();
  ok(n === 1 && !store.SnsAccounts.get(ytOld), '「再連携が必要」になってから28日を過ぎた YouTube の連携を消す');
  ok(store.SnsAccounts.get(ytRecent) && store.SnsAccounts.get(ytActive) && store.SnsAccounts.get(thOld), '28日たっていないもの・有効なもの・YouTube 以外のSNSは消さない');
  ok(c.length === 1 && tokenOf(c[0]) === 'rt_UC_old' && w.seen.length === 1 && w.seen[0].revokedBefore === 1, '消す前に Google へ取り消しを送る（失敗しても消す）');
  ok(store.ScheduledPosts.get(pOld.posted).external_id === '' && store.ScheduledPosts.get(pOld.pending).status === 'cancelled', 'マイページの解除と同じように、投稿IDを消し、未投稿の予約を取り消す');
  const notices = metaDeletion.Notices.listForUser(u7);
  ok(notices.length === 1 && notices[0].platform === 'youtube' && notices[0].kind === 'expired', 'その利用者のマイページに知らせる');
  const dash7 = ui.dashboardPage({ user: { id: u7, email: 'u7' }, sub: store.Subscriptions.get(u7), accounts: store.SnsAccounts.listForUser(u7), posts: [], csrf: 'c', snsReady: true, removalNotices: notices });
  ok(dash7.includes('YouTube（ショート）の連携が「再連携が必要」のまま28日たったため'), '知らせの文に、削除した理由を書く（実装の日数と同じ）');
  mock = googleMock();
  n = await scheduler.purgeRevokedYoutube();
  ok(n === 0 && revokeCalls(mock).length === 0 && metaDeletion.Notices.listForUser(u7).length === 1, 'もう一度実行しても、何も消さず、取り消しも知らせも重ねない（冪等）');
  n = await scheduler.purgeRevokedYoutube(Date.now() + 2 * DAY);
  c = revokeCalls(mock);
  mock.restore();
  ok(n === 1 && !store.SnsAccounts.get(ytRecent) && store.SnsAccounts.get(ytActive) && c.length === 1, '日がたって28日を過ぎれば、残りも消す');

  console.log('削除の途中で再連携された連携は消さない（purgeRevokedYoutube は、消す直前に行を読み直す）');
  const u8a = mkUser('u8a@example.com');
  const u8b = mkUser('u8b@example.com');
  const ytRa = mkAcc(u8a, 'youtube', 'UC_ra');
  const ytRb = mkAcc(u8b, 'youtube', 'UC_rb');
  setReauth(ytRa, 32); // 古い順に処理するため、こちらが先
  setReauth(ytRb, 31);
  let reconnected = false;
  mock = installHttpsMock(async (x) => {
    if (x.host === 'oauth2.googleapis.com' && x.path === '/revoke') {
      if (tokenOf(x) === 'rt_UC_ra') {
        // 1件目の取り消しの応答を待っている間に、2人目が再連携する（有効に戻る）
        await new Promise((rs) => setTimeout(rs, 30));
        mkAcc(u8b, 'youtube', 'UC_rb', { access: 'at_rb_new', refresh: 'rt_rb_new' });
        reconnected = true;
      }
      return { status: 200, text: '' };
    }
    return null;
  });
  n = await scheduler.purgeRevokedYoutube();
  const raceTokens = revokeCalls(mock).map(tokenOf);
  mock.restore();
  ok(reconnected && n === 1 && !store.SnsAccounts.get(ytRa), '（前提）1件目は消し、その取り消しを待つ間に2人目が再連携した');
  const rb = store.SnsAccounts.get(ytRb);
  ok(rb && rb.status === 'active' && rb.reauth_at === '' && box.decrypt(rb.refresh_token_enc, k) === 'rt_rb_new', '前の件の取り消しを待つ間に再連携された連携は、消さない');
  ok(raceTokens.length === 1 && raceTokens[0] === 'rt_UC_ra', '再連携された連携の取り消しは、古いトークンでも新しいトークンでも送らない');
  ok(metaDeletion.Notices.listForUser(u8b).length === 0 && metaDeletion.Notices.listForUser(u8a).length === 1, '再連携した利用者には、削除の知らせを出さない');
  const u8c = mkUser('u8c@example.com');
  const ytRc = mkAcc(u8c, 'youtube', 'UC_rc');
  setReauth(ytRc, 31);
  const listed = store.SnsAccounts.listReauthBefore('youtube', new Date(Date.now() - 28 * DAY).toISOString());
  store.SnsAccounts.remove(ytRc, u8c); // 一覧を取った後に、利用者が解除した
  const origList = store.SnsAccounts.listReauthBefore;
  store.SnsAccounts.listReauthBefore = () => listed;
  mock = googleMock();
  n = await scheduler.purgeRevokedYoutube();
  store.SnsAccounts.listReauthBefore = origList;
  ok(n === 0 && revokeCalls(mock).length === 0 && metaDeletion.Notices.listForUser(u8c).length === 0, '一覧を取った後に解除された連携は、取り消しも知らせも出さない');
  mock.restore();

  console.log('YouTube のトークンの定期確認（scheduler.checkYoutubeTokens。連携ごとに1日1回）');
  const H = 3600 * 1000;
  const REVOKED = { status: 400, json: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } };
  const okToken = (rt) => ({ status: 200, json: { access_token: `new_at_${rt}`, expires_in: 3599, token_type: 'Bearer' } });
  // Google のトークンの受け口のモック。behavior(更新用のトークン) が応答を返す。'throw' なら通信エラー
  const tokenMock = (behavior) => installHttpsMock(async (x) => {
    if (x.host === 'oauth2.googleapis.com' && x.path === '/token') {
      const b = behavior(new URLSearchParams(x.body).get('refresh_token'));
      if (b === 'throw') throw new Error('ECONNRESET');
      return b;
    }
    if (x.host === 'oauth2.googleapis.com' && x.path === '/revoke') return { status: 200, text: '' };
    return null;
  });
  const tokenCalls = (m, rt) => m.calls.filter((x) => x.host === 'oauth2.googleapis.com' && x.path === '/token' && (rt === undefined || new URLSearchParams(x.body).get('refresh_token') === rt));
  const setChecked = (id, hoursAgo) => db.prepare('UPDATE sns_accounts SET token_checked_at=? WHERE id=?').run(new Date(Date.now() - hoursAgo * H).toISOString(), id);
  const u9 = mkUser('u9@example.com');
  const ytRev = mkAcc(u9, 'youtube', 'UC_rev'); // Google の側で取り消された。予約は無い
  ok(store.SnsAccounts.get(ytRev).token_checked_at !== '', '連携したときに、トークンが有効だと確かめた日時を記録する');
  const ytValid = mkAcc(u9, 'youtube', 'UC_valid');
  const ytFresh = mkAcc(u9, 'youtube', 'UC_fresh');
  const ytTemp = mkAcc(u9, 'youtube', 'UC_temp');
  const ytFive = mkAcc(u9, 'youtube', 'UC_5xx');
  const ytCfg = mkAcc(u9, 'youtube', 'UC_cfg');
  const ytNoRt = mkAcc(u9, 'youtube', 'UC_nort', { refresh: '' });
  const thU9 = mkAcc(u9, 'threads', 'th_u9');
  for (const id of [ytRev, ytValid, ytTemp, ytFive, ytCfg, ytNoRt, thU9]) setChecked(id, 25);
  setChecked(ytFresh, 23);
  const before9 = Object.fromEntries([ytValid, ytTemp, ytFive, ytCfg].map((id) => [id, store.SnsAccounts.get(id).token_checked_at]));
  const behavior9 = (rt) => ({
    rt_UC_rev: REVOKED,
    rt_UC_temp: 'throw',
    rt_UC_5xx: { status: 503, json: { error: 'backend_error' } },
    rt_UC_cfg: { status: 401, json: { error: 'invalid_client', error_description: 'Unauthorized' } },
  }[rt] || okToken(rt));
  mock = tokenMock(behavior9);
  const errs = [];
  const origErr = console.error;
  const origWarn2 = console.warn;
  console.error = (...a) => { errs.push(a.map(String).join(' ')); };
  console.warn = (...a) => { errs.push(a.map(String).join(' ')); };
  let res9 = await scheduler.checkYoutubeTokens();
  console.error = origErr;
  console.warn = origWarn2;
  const calls9 = mock.calls.slice();
  mock.restore();
  const rev = store.SnsAccounts.get(ytRev);
  ok(rev.status === 'reauth_required' && rev.reauth_at !== '', '予約が無くても、Google の側で取り消された（invalid_grant）連携を、定期の確認で見つけて「再連携が必要」にする（そこから28日で削除する）');
  const val = store.SnsAccounts.get(ytValid);
  ok(val.status === 'active' && val.reauth_at === '' && box.decrypt(val.access_token_enc, k) === 'new_at_rt_UC_valid' && box.decrypt(val.refresh_token_enc, k) === 'rt_UC_valid' && val.token_checked_at > before9[ytValid], '有効なトークンでは状態を変えず、更新したトークンと、確かめた日時を保存する');
  ok(tokenCalls({ calls: calls9 }, 'rt_UC_fresh').length === 0, '24時間以内に確かめた連携は、確かめない（1日1回）');
  ok([ytTemp, ytFive].every((id) => store.SnsAccounts.get(id).status === 'active' && store.SnsAccounts.get(id).token_checked_at === before9[id]), '一時的なエラー（通信エラー・5xx）では、何もしない（確かめた日時も変えないため、次の1時間ごとの処理で確かめ直す）');
  ok(store.SnsAccounts.get(ytCfg).status === 'active' && store.SnsAccounts.get(ytCfg).token_checked_at === before9[ytCfg], '本サービスの設定の誤り（invalid_client）では、「再連携が必要」にしない');
  ok(store.SnsAccounts.get(ytNoRt).status === 'reauth_required' && tokenCalls({ calls: calls9 }, '').length === 0, '更新用のトークンが無い連携は、更新できないため、送らずに「再連携が必要」にする');
  ok(store.SnsAccounts.get(thU9).status === 'active' && !calls9.some((x) => x.host !== 'oauth2.googleapis.com'), 'YouTube 以外のSNSは対象にしない');
  ok(!calls9.some((x) => x.path === '/revoke') && store.SnsAccounts.get(ytRev), '確かめるときは、取り消しも削除もしない（削除は28日たってから）');
  ok(res9.reauth === 2 && res9.refreshed >= 1, '戻り値に、更新できた件数と「再連携が必要」にした件数を返す');
  ok(!errs.some((x) => /rt_UC_|at_UC_|new_at_/.test(x)), 'ログに、トークンを出さない');
  const dash9 = ui.dashboardPage({ user: { id: u9, email: 'u9' }, sub: store.Subscriptions.get(u9), accounts: store.SnsAccounts.listForUser(u9), posts: [], csrf: 'c', snsReady: true });
  ok(dash9.includes('再連携が必要') && dash9.includes('再連携しないまま28日たつと'), '定期の確認で見つけた連携も、マイページで「再連携が必要」と、削除までの日数を知らせる');
  mock = tokenMock(behavior9);
  console.error = () => {};
  res9 = await scheduler.checkYoutubeTokens();
  console.error = origErr;
  mock.restore();
  ok(tokenCalls(mock, 'rt_UC_valid').length === 0 && tokenCalls(mock, 'rt_UC_temp').length === 1 && tokenCalls(mock, 'rt_UC_rev').length === 0, '次の処理では、確かめられた連携は確かめず、一時的なエラーだった連携だけ確かめ直す（「再連携が必要」の連携は対象外）');

  // 確かめている間に、利用者が再連携した（新しいトークンになった）場合は、古いトークンの結果で「再連携が必要」にしない
  const ytRace = mkAcc(u9, 'youtube', 'UC_race');
  setChecked(ytRace, 25);
  mock = tokenMock((rt) => {
    if (rt === 'rt_UC_race') return new Promise((rs) => setTimeout(() => { mkAcc(u9, 'youtube', 'UC_race', { refresh: 'rt_race_new' }); rs(REVOKED); }, 30));
    return okToken(rt);
  });
  console.error = () => {};
  await scheduler.checkYoutubeTokens();
  console.error = origErr;
  mock.restore();
  const race = store.SnsAccounts.get(ytRace);
  ok(race.status === 'active' && box.decrypt(race.refresh_token_enc, k) === 'rt_race_new', '確かめている間に再連携された連携は、古いトークンの結果で「再連携が必要」にせず、新しいトークンを上書きしない');

  const savedGoogle = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  setChecked(ytValid, 25);
  mock = tokenMock(okToken);
  res9 = await scheduler.checkYoutubeTokens();
  mock.restore();
  process.env.GOOGLE_CLIENT_ID = savedGoogle;
  ok(res9.checked === 0 && mock.calls.length === 0, 'YouTube のキーが未設定なら、確かめない（設定の誤りで、全員を「再連携が必要」にしないため）');

  const delPage = ui.dataDeletionPage({ user: null });
  ok(delPage.includes('1日1回') && delPage.includes('そのまま28日たつと') && !delPage.includes('検知するまでは残ります') && !delPage.includes('30日たつと'), 'データ削除の手順のページに、1日1回確かめることと、実装と同じ日数（28日）を書く');

  console.log('取り消しから削除までの日数（最も遅い場合でも30日以内）');
  const u10 = mkUser('u10@example.com');
  const ytW = mkAcc(u10, 'youtube', 'UC_worst');
  // 最後に確かめた時刻。その直後に Google の側で取り消されたとする（気づくのが最も遅くなる場合）
  const lastCheck = Date.now() - 25 * H;
  db.prepare('UPDATE sns_accounts SET token_checked_at=? WHERE id=?').run(new Date(lastCheck).toISOString(), ytW);
  mock = tokenMock((rt) => (rt === 'rt_UC_worst' ? REVOKED : okToken(rt)));
  console.warn = () => {};
  let detectH = 0;
  // 1時間ごとの処理を、最後に確かめた時刻から1時間ずつ進めて呼ぶ
  for (let h = 1; h <= 26 && !detectH; h++) {
    await scheduler.checkYoutubeTokens(lastCheck + h * H);
    if (store.SnsAccounts.get(ytW).status === 'reauth_required') detectH = h;
  }
  ok(detectH === 25, '気づくのは、最後に確かめてから24時間たった後の、最初の1時間ごとの処理（最も遅くて約25時間）');
  const detectedAt = Date.parse(store.SnsAccounts.get(ytW).reauth_at);
  let purgeH = -1;
  for (let h = 0; h <= 30 * 24 && purgeH < 0; h++) {
    await scheduler.purgeRevokedYoutube(detectedAt + h * H);
    if (!store.SnsAccounts.get(ytW)) purgeH = h;
  }
  console.warn = origWarn2;
  mock.restore();
  ok(purgeH === 28 * 24 + 1, '気づいてから28日たった後の、最初の1時間ごとの処理で消す');
  const totalMs = detectedAt + purgeH * H - lastCheck;
  ok(totalMs < 30 * DAY && totalMs > 29 * DAY, `取り消しから削除まで、最も遅い場合でも30日以内に収まる（約${(totalMs / DAY).toFixed(2)}日）`);

  server.close();
  process.exit(summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
