'use strict';
// Meta（Threads・Instagram・Facebook）から届く、データ削除の求めと連携の取り消しの知らせのテスト。
// signed_request の検証、SNS側の利用者IDの保存と照合（全員分。17桁の大きなIDを含む）、削除の状況のページ、データ削除の手順のページ、
// 連携の解除・契約の終了での投稿ID・リンクの削除、マイページの知らせ、前の作りで保存したデータの手当て（起動時）
// 実行: node --experimental-sqlite test/meta.test.js （SNSはモック）
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-meta-'));
process.env.SNS_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
process.env.SNS_APPROVED = 'threads,instagram,facebook';
process.env.THREADS_APP_ID = 'th_id';
process.env.THREADS_APP_SECRET = 'th_secret';
process.env.INSTAGRAM_APP_ID = 'ig_id';
process.env.INSTAGRAM_APP_SECRET = 'ig_secret';
process.env.FACEBOOK_APP_ID = 'fb_id';
process.env.FACEBOOK_APP_SECRET = 'fb_secret';
process.env.ADMIN_PASSWORD = 'adminpw';

const { ok, summary, installHttpsMock } = require('./helpers');
const { Users, db } = require('../db');
const store = require('../lib/service-store');
const box = require('../lib/crypto-box');
const core = require('../lib/service-core');
const billing = require('../lib/billing');
const auth = require('../lib/auth');
const signed = require('../lib/meta-signed-request');
const metaDeletion = require('../lib/meta-deletion');
const registry = require('../lib/sns');

// テスト側で、公式の説明どおりに signed_request を作る（検証するモジュールの関数は使わない）
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function makeSigned(data, secret) {
  const payload = b64url(JSON.stringify(data));
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  return `${sig}.${payload}`;
}
const issued = () => Math.floor(Date.now() / 1000);
// 中身のJSONを文字列のまま渡して作る（JSONの数値を、JavaScriptの数に直さずに入れるため。大きなIDのテスト用）
function makeSignedRaw(jsonText, secret) {
  const payload = b64url(jsonText);
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  return `${sig}.${payload}`;
}
// 17桁の奇数のID。JSON の数値として JSON.parse すると丸められ、String() にすると BIG_ROUNDED（別のID）になる
const BIG = '25025320703795513';
const BIG_ROUNDED = '25025320703795510';
const BIG_IG = '17841405793187219';

const k = box.keyFromEnv();
const exp = new Date(Date.now() + 30 * 86400000).toISOString();
function mkUser(email) {
  const id = Users.create({ email, passwordHash: 'h', passwordSalt: 's' });
  store.Subscriptions.upsert(id, { status: 'active' });
  return id;
}
function mkAcc(userId, platform, externalUserId, extra = {}) {
  return store.SnsAccounts.upsert({ userId, platform, externalUserId, handle: `@${externalUserId}`, accessTokenEnc: box.encrypt('tok', k), expiresAt: exp, ...extra });
}
// 投稿済み（投稿IDとリンクあり）と、未投稿の予約を1件ずつ作る
function mkPosts(userId, accountId, tag) {
  const posted = store.ScheduledPosts.create({ userId, accountId, text: `済み${tag}`, scheduledAt: new Date(Date.now() - 3600000).toISOString() });
  store.ScheduledPosts.markPosted(posted, `ext_${tag}`);
  db.prepare('UPDATE scheduled_posts SET permalink=? WHERE id=?').run(`https://www.threads.com/@x/post/${tag}`, posted);
  const pending = store.ScheduledPosts.create({ userId, accountId, text: `予約${tag}`, scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  return { posted, pending };
}

(async () => {
  console.log('signed_request の検証');
  let v = signed.parse(makeSigned({ algorithm: 'HMAC-SHA256', user_id: '1001', issued_at: issued() }, 'th_secret'), 'th_secret');
  ok(v.ok && v.userId === '1001' && v.data.user_id === '1001', '正しい署名を受け付け、user_id を取り出す');
  v = signed.parse(makeSigned({ algorithm: 'HMAC-SHA256', user_id: 1002, issued_at: issued() }, 'th_secret'), 'th_secret');
  ok(v.ok && v.userId === '1002', 'user_id が数で届いても、文字列として扱う');
  ok(String(JSON.parse(BIG)) === BIG_ROUNDED, '（前提）17桁の奇数のIDは、JSON.parse で丸められる');
  v = signed.parse(makeSignedRaw(`{"algorithm":"HMAC-SHA256","user_id":${BIG},"issued_at":${issued()}}`, 'th_secret'), 'th_secret');
  ok(v.ok && v.userId === BIG, 'user_id が17桁の数（2^53 を超える）で届いても、丸めずに、届いた数字のまま取り出す');
  v = signed.parse(makeSignedRaw(`{"algorithm":"HMAC-SHA256","user_id":2.5025320703795513e16,"issued_at":${issued()}}`, 'th_secret'), 'th_secret');
  ok(!v.ok && v.error === 'unsafe user_id', '範囲外の数で、届いた数字を取り出せない形（指数の表記など）なら、丸めた値で照合せずに断る');
  v = signed.parse(makeSignedRaw(`{"algorithm":"HMAC-SHA256","user_id":${BIG},"note":{"user_id":${BIG_ROUNDED}}}`, 'th_secret'), 'th_secret');
  ok(!v.ok && v.error === 'unsafe user_id', '同じキーに、丸めると同じになる別の数字が並んでいて、どれか決められないときも断る');
  v = signed.parse(makeSigned({ algorithm: 'hmac-sha256', user_id: '1003' }, 'th_secret'), 'th_secret');
  ok(v.ok, 'algorithm の大文字・小文字の違いは問わない');
  v = signed.parse(makeSigned({ algorithm: 'HMAC-SHA256', user_id: '1001' }, 'other_secret'), 'th_secret');
  ok(!v.ok && v.error === 'bad signature', '別のシークレットで署名されたものは受け付けない（不正な署名）');
  const good = makeSigned({ algorithm: 'HMAC-SHA256', user_id: '1001' }, 'th_secret');
  const tampered = `${good.split('.')[0]}.${b64url(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '9999' }))}`;
  ok(!signed.parse(tampered, 'th_secret').ok, '中身を書き換えたもの（署名はそのまま）は受け付けない');
  ok(!signed.parse(`${good.split('.')[0].slice(0, 10)}.${good.split('.')[1]}`, 'th_secret').ok, '長さの違う署名は、例外にならずに断る');
  v = signed.parse(makeSigned({ algorithm: 'HMAC-SHA1', user_id: '1001' }, 'th_secret'), 'th_secret');
  ok(!v.ok && v.error === 'unsupported algorithm', 'algorithm が HMAC-SHA256 以外なら、署名が合っていても受け付けない');
  ok(!signed.parse(makeSigned({ user_id: '1001' }, 'th_secret'), 'th_secret').ok, 'algorithm が無いものは受け付けない');
  ok(!signed.parse(makeSigned({ algorithm: 'HMAC-SHA256' }, 'th_secret'), 'th_secret').ok, 'user_id が無いものは受け付けない');
  ok(!signed.parse(makeSigned({ algorithm: 'HMAC-SHA256', user_id: '' }, 'th_secret'), 'th_secret').ok, '空の user_id は受け付けない');
  ok(!signed.parse('abc', 'th_secret').ok && !signed.parse('a.b.c', 'th_secret').ok && !signed.parse('', 'th_secret').ok && !signed.parse(null, 'th_secret').ok, '形式の違うもの（「.」で2つに分かれない・空）は受け付けない');
  ok(!signed.parse(`${good.split('.')[0]}.not+base64/`, 'th_secret').ok, 'base64url でないものは受け付けない');
  ok(!signed.parse(good, '').ok, 'シークレットが未設定なら受け付けない');
  ok(signed.fromBody(`signed_request=${encodeURIComponent(good)}`, 'application/x-www-form-urlencoded') === good && signed.fromBody(JSON.stringify({ signed_request: good }), 'application/json') === good && signed.fromBody('{bad', 'application/json') === '', '本文（form と JSON）から signed_request を取り出す');
  ok(signed.secretFor('threads') === 'th_secret' && signed.secretFor('instagram') === 'ig_secret' && signed.secretFor('facebook') === 'fb_secret' && signed.secretFor('x') === '', 'SNSごとのシークレット（THREADS_・INSTAGRAM_・FACEBOOK_APP_SECRET）を使う');

  console.log('SNS側の利用者IDの保存（照合用）');
  let mock = installHttpsMock(async (c) => {
    if (c.host === 'graph.threads.net') {
      if (c.path === '/oauth/access_token') return { status: 200, json: { access_token: 'th_short', user_id: 5150 } };
      if (c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: 'th_long', expires_in: 5184000 } };
      if (c.path.startsWith('/v1.0/me?')) return { status: 200, json: { id: '5151', username: 'th_user' } };
    }
    if (c.host === 'api.instagram.com' && c.path === '/oauth/access_token') return { status: 200, json: { data: [{ access_token: 'ig_short', user_id: 7001, permissions: 'instagram_business_basic' }] } };
    if (c.host === 'graph.instagram.com') {
      if (c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: 'ig_long', expires_in: 5184000 } };
      if (c.path.startsWith('/v22.0/me?')) return { status: 200, json: { id: '7002', user_id: '7003', username: 'ig_user' } };
    }
    if (c.host === 'graph.facebook.com') {
      if (c.path.includes('/oauth/access_token')) return { status: 200, json: { access_token: 'fb_ut' } };
      if (c.path.includes('/me/permissions')) return { status: 200, json: { data: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'].map((p) => ({ permission: p, status: 'granted' })) } };
      if (c.path.includes('/me/accounts')) return { status: 200, json: { data: [{ id: 'page1', name: 'ページ1', access_token: 'pt1', tasks: ['CREATE_CONTENT'] }] } };
      if (c.path.startsWith('/v22.0/me?')) return { status: 200, json: { id: 'fbu9' } };
    }
    return null;
  });
  const t = await registry.get('threads').exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' });
  ok(t.externalUserId === '5151' && t.providerUserId === '5150', 'Threads：/me の id に加えて、トークンの応答の user_id も控える');
  const ig = await registry.get('instagram').exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' });
  const igMe = mock.calls.find((c) => c.host === 'graph.instagram.com' && c.path.startsWith('/v22.0/me?'));
  ok(ig.externalUserId === '7003' && ig.providerUserId === '7001' && ig.providerAltId === '7002' && new URL(`https://x${igMe.path}`).searchParams.get('fields').split(',').includes('id'), 'Instagram：トークンの応答の user_id と、/me の id・user_id を、すべて控える');
  const fb = await registry.get('facebook').exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' });
  ok(fb.externalUserId === 'page1' && fb.providerUserId === 'fbu9', 'Facebook：投稿先のページIDとは別に、連携した人のアプリスコープのユーザーID（/me の id）を控える');
  mock.restore();
  mock = installHttpsMock(async (c) => {
    if (c.path.includes('/oauth/access_token')) return { status: 200, json: { access_token: 'fb_ut' } };
    if (c.path.includes('/me/permissions')) return { status: 200, json: { data: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'].map((p) => ({ permission: p, status: 'granted' })) } };
    if (c.path.includes('/me/accounts')) return { status: 200, json: { data: [{ id: 'page1', name: 'ページ1', access_token: 'pt1', tasks: ['CREATE_CONTENT'] }] } };
    if (c.path.startsWith('/v22.0/me?')) return { status: 200, json: {} };
    return null;
  });
  let err = null; try { await registry.get('facebook').exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' }); } catch (e) { err = e; }
  mock.restore();
  ok(err && /ユーザーID/.test(err.message), 'FacebookのユーザーIDが取れなければ、削除の求めに応えられないため連携を止める');

  // トークンの応答・/me のIDが、17桁の数（JSONの数値）で届いた場合（http-client の r.text から、届いた数字のまま取り出す）
  mock = installHttpsMock(async (c) => {
    if (c.host === 'graph.threads.net') {
      if (c.path === '/oauth/access_token') return { status: 200, text: `{"access_token":"th_short","user_id":${BIG}}` };
      if (c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: 'th_long', expires_in: 5184000 } };
      if (c.path.startsWith('/v1.0/me?')) return { status: 200, text: `{"id":${BIG},"username":"big_user"}` };
    }
    if (c.host === 'api.instagram.com') return { status: 200, text: `{"data":[{"access_token":"ig_short","user_id":${BIG_IG},"permissions":"instagram_business_basic"}]}` };
    if (c.host === 'graph.instagram.com') {
      if (c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: 'ig_long', expires_in: 5184000 } };
      if (c.path.startsWith('/v22.0/me?')) return { status: 200, text: `{"id":${BIG},"user_id":"7203","username":"big_ig"}` };
    }
    if (c.host === 'graph.facebook.com') {
      if (c.path.includes('/oauth/access_token')) return { status: 200, json: { access_token: 'fb_ut' } };
      if (c.path.includes('/me/permissions')) return { status: 200, json: { data: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'].map((p) => ({ permission: p, status: 'granted' })) } };
      if (c.path.includes('/me/accounts')) return { status: 200, text: `{"data":[{"id":${BIG_IG},"name":"ページ","access_token":"pt1","tasks":["CREATE_CONTENT"]}]}` };
      if (c.path.startsWith('/v22.0/me?')) return { status: 200, text: `{"id":${BIG}}` };
    }
    return null;
  });
  const tBig = await registry.get('threads').exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' });
  ok(tBig.providerUserId === BIG && tBig.externalUserId === BIG, 'Threads：17桁のIDが数で届いても、丸めずに控える（トークンの応答の user_id・/me の id）');
  const igBig = await registry.get('instagram').exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' });
  ok(igBig.providerUserId === BIG_IG && igBig.providerAltId === BIG && igBig.externalUserId === '7203', 'Instagram：17桁のIDが数で届いても、丸めずに控える');
  const fbBig = await registry.get('facebook').exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' });
  ok(fbBig.providerUserId === BIG && fbBig.externalUserId === BIG_IG, 'Facebook：ユーザーID・ページIDが数で届いても、丸めずに控える');
  mock.restore();
  mock = installHttpsMock(async (c) => {
    if (c.host === 'graph.threads.net') {
      if (c.path === '/oauth/access_token') return { status: 200, text: '{"access_token":"th_short","user_id":2.5025320703795513e16}' };
      if (c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: 'th_long', expires_in: 5184000 } };
      if (c.path.startsWith('/v1.0/me?')) return { status: 200, json: { id: '5161', username: 'th_user' } };
    }
    if (c.host === 'api.instagram.com') return { status: 200, text: '{"data":[{"access_token":"ig_short","user_id":2.5025320703795513e16}]}' };
    if (c.host === 'graph.instagram.com') {
      if (c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: 'ig_long', expires_in: 5184000 } };
      if (c.path.startsWith('/v22.0/me?')) return { status: 200, json: { user_id: '7303', username: 'ig_user' } };
    }
    return null;
  });
  const tOdd = await registry.get('threads').exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' });
  ok(tOdd.externalUserId === '5161' && tOdd.providerUserId === '', 'Threads：範囲外の数で、届いた数字を取り出せなければ、丸めた値を控えずに空にする');
  err = null; try { await registry.get('instagram').exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' }); } catch (e) { err = e; }
  mock.restore();
  ok(err && /ユーザーID/.test(err.message), 'Instagram：照合用のID（トークンの応答の user_id・/me の id）が1つも取れなければ、連携を止める');

  // 連携の完了で、控えたIDを保存する（core.finishConnect）
  process.env.SERVICE_BASE_URL = 'https://example.test';
  const uConn = mkUser('conn@example.com');
  mock = installHttpsMock(async (c) => {
    if (c.host === 'api.instagram.com') return { status: 200, json: { data: [{ access_token: 'ig_short', user_id: 7101 }] } };
    if (c.host === 'graph.instagram.com' && c.path.startsWith('/access_token?')) return { status: 200, json: { access_token: 'ig_long', expires_in: 5184000 } };
    if (c.host === 'graph.instagram.com' && c.path.startsWith('/v22.0/me?')) return { status: 200, json: { id: '7102', user_id: '7103', username: 'conn_ig' } };
    return null;
  });
  const st = core.startConnect({ userId: uConn, platform: 'instagram' });
  const fin = await core.finishConnect({ userId: uConn, platform: 'instagram', code: 'c', state: new URL(st.url).searchParams.get('state') });
  mock.restore();
  const connRow = store.SnsAccounts.listForUser(uConn)[0];
  ok(fin.ok && connRow && connRow.external_user_id === '7103' && connRow.provider_user_id === '7101' && connRow.provider_alt_id === '7102', '連携の完了で、SNS側の利用者IDを、すべて保存する');
  mkAcc(uConn, 'instagram', '7103', { accessTokenEnc: box.encrypt('tok2', k) });
  const again = store.SnsAccounts.get(connRow.id);
  ok(again.provider_user_id === '7101' && again.provider_alt_id === '7102', 'IDを渡さずに保存し直しても、控えたIDは消えない');
  ok(store.SnsAccounts.findByProviderId('instagram', '').length === 0 && store.SnsAccounts.findByProviderId('threads', '7101').length === 0, '空のIDや、別のSNSでは見つからない');
  ok(['7101', '7102', '7103'].every((id) => store.SnsAccounts.findByProviderId('instagram', id).map((a) => a.id).join() === connRow.id), '保存した3つのIDのどれでも、同じ連携が見つかる');

  console.log('解除・契約の終了で、投稿済みの予約の投稿ID・リンクも消す');
  const uA = mkUser('a@example.com');
  const uOther = mkUser('other@example.com');
  const accA = mkAcc(uA, 'threads', 'thA');
  const accOther = mkAcc(uOther, 'threads', 'thO');
  const pA = mkPosts(uA, accA, 'a');
  const pO = mkPosts(uOther, accOther, 'o');
  store.SnsAccounts.remove(accA, uOther); // 他人の連携のIDでは、何も変わらない
  ok(store.SnsAccounts.get(accA) && store.ScheduledPosts.get(pA.posted).external_id === 'ext_a' && store.ScheduledPosts.get(pA.pending).status === 'pending', '他人の連携は、解除できず、その予約にも触れない');
  store.SnsAccounts.remove(accA, uA);
  let row = store.ScheduledPosts.get(pA.posted);
  ok(!store.SnsAccounts.get(accA) && row.external_id === '' && row.permalink === '' && row.status === 'posted' && row.text === '済みa', '解除すると、投稿済みの予約の投稿IDとリンクを消す（本文・状態は残す）');
  ok(store.ScheduledPosts.get(pA.pending).status === 'cancelled', '解除すると、未投稿の予約は取り消す');
  ok(store.ScheduledPosts.get(pO.posted).external_id === 'ext_o', 'ほかの利用者の投稿IDは消さない');
  const accEnd = mkAcc(uOther, 'facebook', 'pgEnd');
  const pEnd = mkPosts(uOther, accEnd, 'end');
  billing.endAccess(uOther);
  ok(!store.SnsAccounts.get(accEnd) && store.ScheduledPosts.get(pEnd.posted).external_id === '' && store.ScheduledPosts.get(pEnd.posted).permalink === '' && store.ScheduledPosts.get(pO.posted).external_id === '', '契約の終了（テスト利用の取り消しを含む）でも、投稿IDとリンクを消す');
  // 送っている間に連携が消えた場合、投稿の完了で投稿IDを書き戻さない
  const accRace = mkAcc(uA, 'threads', 'thRace');
  const pRace = store.ScheduledPosts.create({ userId: uA, accountId: accRace, text: 'race', scheduledAt: new Date().toISOString() });
  store.SnsAccounts.remove(accRace, uA);
  store.ScheduledPosts.markPosted(pRace, 'ext_race');
  ok(store.ScheduledPosts.get(pRace).external_id === '', '送っている間に連携が解除・削除されたら、投稿の完了のときに投稿IDを残さない');
  const accKeep = mkAcc(uA, 'threads', 'thKeep');
  const pKeep = store.ScheduledPosts.create({ userId: uA, accountId: accKeep, text: 'keep', scheduledAt: new Date().toISOString() });
  store.ScheduledPosts.markPosted(pKeep, 'ext_keep');
  ok(store.ScheduledPosts.get(pKeep).external_id === 'ext_keep', '連携が残っていれば、投稿IDを保存する');

  console.log('HTTP：Metaから届く求め（ログイン不要）');
  const server = require('../server');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.SERVICE_BASE_URL = base;
  const send = (method, p, { body, headers = {}, cookie } = {}) => new Promise((resolve, reject) => {
    const r = http.request(`${base}${p}`, { method, headers: { ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers } }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c));
      res.on('end', () => { const text = Buffer.concat(ch).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* HTML */ } resolve({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
  const postMeta = (platform, action, sr, json = false) => send('POST', `/service/meta/${platform}/${action}`, json
    ? { body: JSON.stringify({ signed_request: sr }), headers: { 'Content-Type': 'application/json' } }
    : { body: `signed_request=${encodeURIComponent(sr)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  // 同じThreadsアカウント（th100）を、2人の利用者が連携している
  const u1 = mkUser('u1@example.com');
  const u2 = mkUser('u2@example.com');
  const u3 = mkUser('u3@example.com');
  const th1 = mkAcc(u1, 'threads', 'th100');
  const th2 = mkAcc(u2, 'threads', 'th100');
  const thOther = mkAcc(u3, 'threads', 'th200');
  const p1 = mkPosts(u1, th1, 'p1');
  const p2 = mkPosts(u2, th2, 'p2');
  const p3 = mkPosts(u3, thOther, 'p3');
  db.prepare("INSERT INTO auto_rules (id, user_id, account_id, theme, mode, created_at) VALUES ('rule_th1', ?, ?, 'テーマ', 'draft', ?)").run(u1, th1, new Date().toISOString());

  let r = await postMeta('threads', 'data-deletion', makeSigned({ algorithm: 'HMAC-SHA256', user_id: 'th100', issued_at: issued() }, 'other'));
  ok(r.status === 400 && store.SnsAccounts.get(th1) && store.SnsAccounts.get(th2), '不正な署名の求めは 400 で断り、何も消さない');
  r = await postMeta('threads', 'data-deletion', makeSigned({ algorithm: 'HMAC-SHA1', user_id: 'th100', issued_at: issued() }, 'th_secret'));
  ok(r.status === 400 && store.SnsAccounts.get(th1), 'algorithm が違う求めは 400 で断り、何も消さない');
  r = await postMeta('threads', 'data-deletion', makeSigned({ algorithm: 'HMAC-SHA256', user_id: 'th100', issued_at: issued() }, 'ig_secret'));
  ok(r.status === 400 && store.SnsAccounts.get(th1), 'ほかのSNSのシークレットで署名された求めは断る（SNSごとのシークレットで確かめる）');
  r = await send('GET', '/service/meta/threads/data-deletion');
  ok(r.status === 405 && r.headers.allow === 'POST', '受け口を GET で開くと 405（POST だけ）');

  const delReq = makeSigned({ algorithm: 'HMAC-SHA256', user_id: 'th100', issued_at: issued() }, 'th_secret');
  r = await postMeta('threads', 'data-deletion', delReq);
  const code = r.json && r.json.confirmation_code;
  ok(r.status === 200 && /^[a-f0-9]{32}$/.test(code || '') && r.json.url === `${base}/service/meta/deletion?code=${code}`, '正しい求めには、ログインなしで、公式の形 {url, confirmation_code} を返す');
  ok(!store.SnsAccounts.get(th1) && !store.SnsAccounts.get(th2), '同じThreadsアカウントを連携している、全員分の連携を消す');
  ok([p1, p2].every((p) => store.ScheduledPosts.get(p.posted).external_id === '' && store.ScheduledPosts.get(p.posted).permalink === '' && store.ScheduledPosts.get(p.pending).status === 'cancelled'), '全員分の投稿済みの予約の投稿ID・リンクを消し、未投稿の予約を取り消す');
  ok(!db.prepare("SELECT 1 FROM auto_rules WHERE id='rule_th1'").get(), 'その連携の自動運用の設定も消す');
  ok(store.SnsAccounts.get(thOther) && store.ScheduledPosts.get(p3.posted).external_id === 'ext_p3', '別のThreadsアカウントの連携には触れない');
  const rec = db.prepare('SELECT * FROM meta_deletion_requests WHERE code=?').get(code);
  ok(rec && rec.platform === 'threads' && rec.kind === 'deletion' && rec.status === 'completed' && rec.removed === 2 && rec.received === 1, '求めを、確認コード・SNS・種類・状態・消した数とともに記録する');
  ok(Object.keys(rec).sort().join() === ['code', 'platform', 'kind', 'status', 'removed', 'received', 'created_at', 'updated_at'].sort().join(), '記録に残すのは、確認コード・SNS・種類・状態・消した数・受け取った回数・日時だけ（user_hash などの列は無い）');
  const delPayload = delReq.split('.')[1];
  const hashesOf = (x) => ['sha256', 'sha1', 'md5'].map((a) => crypto.createHash(a).update(x).digest('hex'));
  const leaks = ['th100', delPayload, ...hashesOf('th100'), ...hashesOf('threads:th100'), ...hashesOf(`threads|deletion|${delPayload}`)];
  const allRows = JSON.stringify(db.prepare('SELECT * FROM meta_deletion_requests').all());
  ok(!leaks.some((x) => allRows.includes(x)), '削除を求められたSNSの利用者IDも、signed_request の中身も、そのハッシュも、記録に残さない');

  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
  r = await postMeta('threads', 'data-deletion', delReq);
  console.warn = origWarn;
  const code2 = r.json && r.json.confirmation_code;
  ok(r.status === 200 && /^[a-f0-9]{32}$/.test(code2 || '') && code2 !== code, '同じ求めの2回目も壊れず、新しい確認コードを返す（同じ求めかどうかを見分ける値を残さないため）');
  ok(db.prepare('SELECT removed FROM meta_deletion_requests WHERE code=?').get(code2).removed === 0 && db.prepare('SELECT removed FROM meta_deletion_requests WHERE code=?').get(code).removed === 2, '2回目は消すものが無く、0件として記録する（1回目の記録は変えない）');
  ok(warns.length === 1 && warns[0].includes('threads') && warns[0].includes('deletion') && warns[0].includes(code2) && !warns[0].includes('th100'), '消した連携が0件なら、SNS・種類・確認コードだけを運営者のログに出す（IDは出さない）');
  r = await postMeta('threads', 'data-deletion', makeSigned({ algorithm: 'HMAC-SHA256', user_id: 'th100', issued_at: issued() + 5 }, 'th_secret'), true);
  ok(r.status === 200 && r.json.confirmation_code && r.json.confirmation_code !== code, '同じアカウントについての新しい求め（JSONの本文）にも、新しい確認コードを返す（消すものが無くても壊れない）');

  console.log('HTTP：削除の状況のページ（ログイン不要）');
  r = await send('GET', `/service/meta/deletion?code=${code}`);
  ok(r.status === 200 && r.text.includes('削除の状況') && r.text.includes('Threads') && r.text.includes('完了') && r.text.includes(code), '確認コードで、ログインせずに状況を開ける');
  ok(!r.text.includes('th100') && !r.text.includes('u1@example.com') && !r.text.includes('@th100'), '状況のページには、SNSのID・ユーザー名・メールアドレスを出さない');
  ok(r.text.includes('/contact') && r.text.includes('/service/legal/data-deletion') && r.text.includes('SNS上に公開された投稿そのものは'), '状況のページに、問い合わせ先・削除の手順・削除されないものを示す');
  ok(r.text.includes('削除し、未投稿の予約') && !r.text.includes('該当する連携は見つかりませんでした'), '連携を消した求めの状況のページは、削除したことを示す');
  r = await send('GET', `/service/meta/deletion?code=${code2}`);
  ok(r.status === 200 && r.text.includes('受け付けました。該当する連携は見つかりませんでした（すでに解除済みの場合を含みます）') && !r.text.includes('完了（削除しました）') && !r.text.includes('削除し、未投稿の予約'), '消した連携が0件の求めの状況のページは、「削除しました」と書かず、該当する連携が無かったことを示す');
  ok(!r.text.includes('0件') && !r.text.includes('th100'), '0件のときも、消した件数やSNSのIDは出さない');
  r = await send('GET', `/service/meta/deletion?code=${'0'.repeat(32)}`);
  ok(r.status === 404 && r.text.includes('見つかりませんでした'), '知らない確認コードは「見つからない」と示す');
  r = await send('GET', '/service/meta/deletion?code=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  ok(r.status === 404 && r.text.includes('&lt;script&gt;alert(1)') && !r.text.includes('<script>alert(1)'), '確認コードの入力は、そのまま画面に出さない（エスケープする）');
  r = await send('GET', '/service/meta/deletion');
  ok(r.status === 200 && r.text.includes('name="code"'), '確認コードなしで開くと、入力欄を出す');

  console.log('HTTP：Instagram・Facebook（保存したどのIDでも照合する）');
  const ig1 = mkAcc(u1, 'instagram', 'igPro1', { providerUserId: 'igTok1', providerAltId: 'igMe1' });
  const ig2 = mkAcc(u2, 'instagram', 'igPro2', { providerUserId: 'igTok2', providerAltId: 'igMe2' });
  const ig3 = mkAcc(u3, 'instagram', 'igPro3', { providerUserId: 'igTok3', providerAltId: 'igMe3' });
  r = await postMeta('instagram', 'data-deletion', makeSigned({ algorithm: 'HMAC-SHA256', user_id: 'igTok1', issued_at: issued() }, 'ig_secret'));
  ok(r.status === 200 && !store.SnsAccounts.get(ig1) && store.SnsAccounts.get(ig2), 'Instagram：トークンの応答の user_id で照合できる');
  r = await postMeta('instagram', 'data-deletion', makeSigned({ algorithm: 'HMAC-SHA256', user_id: 'igMe2', issued_at: issued() }, 'ig_secret'));
  ok(r.status === 200 && !store.SnsAccounts.get(ig2) && store.SnsAccounts.get(ig3), 'Instagram：/me の id で照合できる');
  r = await postMeta('instagram', 'deauthorize', makeSigned({ algorithm: 'HMAC-SHA256', user_id: 'igPro3', issued_at: issued() }, 'ig_secret'));
  ok(r.status === 200 && r.json.received === true && !store.SnsAccounts.get(ig3), 'Instagram：/me の user_id（投稿先のID）でも照合でき、取り消しの知らせでも連携を消す');

  const fbA = mkAcc(u3, 'facebook', 'pageA', { providerUserId: 'fbUser1' });
  const fbB = mkAcc(u3, 'facebook', 'pageB', { providerUserId: 'fbUser1' });
  const fbC = mkAcc(u2, 'facebook', 'pageA', { providerUserId: 'fbUser2' });
  const pFb = mkPosts(u3, fbA, 'fbA');
  delete process.env.FACEBOOK_APP_SECRET;
  r = await postMeta('facebook', 'deauthorize', makeSigned({ algorithm: 'HMAC-SHA256', user_id: 'fbUser1', issued_at: issued() }, 'fb_secret'));
  ok(r.status === 503 && store.SnsAccounts.get(fbA), 'シークレットが未設定のSNSでは受け付けない（503）');
  process.env.FACEBOOK_APP_SECRET = 'fb_secret';
  process.env.SERVICE_ONLY = 'true';
  r = await postMeta('facebook', 'deauthorize', makeSigned({ algorithm: 'HMAC-SHA256', user_id: 'fbUser1', issued_at: issued() }, 'fb_secret'));
  delete process.env.SERVICE_ONLY;
  ok(r.status === 200 && r.json.received === true, 'Facebookの取り消しの知らせを受け付ける（サービス専用のアプリ SERVICE_ONLY でも通る）');
  ok(!store.SnsAccounts.get(fbA) && !store.SnsAccounts.get(fbB) && store.SnsAccounts.get(fbC), 'その人のアプリスコープのユーザーIDで連携したページを全部消し、同じページを別の人のIDで連携したものは残す');
  ok(store.ScheduledPosts.get(pFb.posted).external_id === '' && store.ScheduledPosts.get(pFb.pending).status === 'cancelled', '取り消しの知らせでも、投稿IDを消し、未投稿の予約を取り消す');
  ok(db.prepare("SELECT COUNT(*) AS n FROM meta_deletion_requests WHERE platform='facebook' AND kind='deauthorize'").get().n === 1, '取り消しの知らせも記録する');

  console.log('HTTP：マイページの知らせ');
  const sess3 = auth.createSession(u3);
  const cookie3 = `session=${sess3}`;
  r = await send('GET', '/service/app', { cookie: cookie3 });
  ok(r.status === 200 && r.text.includes('Facebookページの側で、本サービスへの許可が取り消されたため') && r.text.includes('Instagramの側で、本サービスへの許可が取り消されたため'), 'SNS側の操作で連携を消したことを、その利用者のマイページで知らせる');
  const notices3 = metaDeletion.Notices.listForUser(u3);
  ok(notices3.length === 2, '同じ利用者・同じSNSの知らせは、1回の求めにつき1件にまとめる（ページ2つでも1件）');
  r = await send('GET', '/service/app', { cookie: `session=${auth.createSession(u1)}` });
  ok(r.text.includes('Threadsの側で、本サービスが受け取った情報の削除が求められたため') && !r.text.includes('Facebookページの側で'), '削除の求めの知らせを出し、ほかの利用者の知らせは出さない');
  const csrf3 = (r = await send('GET', '/service/app', { cookie: cookie3 })).text.match(/name="csrf" value="([a-f0-9]+)"/)[1];
  r = await send('POST', `/service/app/notice/${notices3[0].id}/dismiss`, { cookie: cookie3, body: `csrf=${csrf3}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  ok(r.status === 302 && metaDeletion.Notices.listForUser(u3).length === 1, '知らせは「閉じる」で消せる');
  ok(!metaDeletion.Notices.dismiss(notices3[1].id, u1), 'ほかの利用者の知らせは閉じられない');

  console.log('HTTP：マイページの解除でも、投稿IDとリンクを消す');
  const thU3 = mkAcc(u3, 'threads', 'thDisc');
  const pDisc = mkPosts(u3, thU3, 'disc');
  r = await send('POST', `/service/app/account/${thU3}/disconnect`, { cookie: cookie3, body: `csrf=${csrf3}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  ok(r.status === 302 && !store.SnsAccounts.get(thU3) && store.ScheduledPosts.get(pDisc.posted).external_id === '' && store.ScheduledPosts.get(pDisc.posted).permalink === '', 'マイページの「解除」で、投稿済みの予約の投稿IDとリンクを消す');

  console.log('HTTP：データ削除の手順のページ（ログイン不要）');
  process.env.SERVICE_CONTACT_EMAIL = 'support@example.com';
  r = await send('GET', '/service/legal/data-deletion');
  ok(r.status === 200 && r.text.includes('データ削除の手順') && r.text.includes('マイページ') && r.text.includes('解除'), 'ログインせずに開け、マイページでの解除を案内する');
  ok(r.text.includes('各SNSの設定画面から取り消す') && r.text.includes('Threads・Instagram・Facebook') && r.text.includes('TikTok・YouTube'), '各SNSの設定からの取り消しと、SNSごとの扱いを案内する');
  ok(r.text.includes('Metaから届く削除の求め') && r.text.includes('確認コード') && r.text.includes('/service/meta/deletion'), 'Metaから届く削除の求めと、確認コード・状況のページを案内する');
  ok(r.text.includes('href="/contact"') && r.text.includes('support@example.com'), 'お問い合わせ（/contact）と、運営者の連絡先（SERVICE_CONTACT_EMAIL）を案内する');
  ok(r.text.includes('/service/legal/privacy') && r.text.includes('SNS上に公開された投稿そのものは'), 'プライバシーポリシーへのリンクと、削除されないものを示す');
  delete process.env.SERVICE_CONTACT_EMAIL;
  r = await send('GET', '/service/legal/data-deletion');
  ok(r.status === 200 && r.text.includes('href="/contact"') && !r.text.includes('mailto:'), '連絡先のメールが未設定なら、お問い合わせフォームだけを案内する');
  r = await send('GET', '/service/legal/privacy');
  ok(r.text.includes('href="/service/legal/data-deletion"'), '法務文書のページから、データ削除の手順へリンクする');

  console.log('HTTP：17桁のIDで届いた求め（丸めた隣のIDの連携を消さない）');
  const uBig1 = mkUser('big1@example.com');
  const uBig2 = mkUser('big2@example.com');
  const thBig = mkAcc(uBig1, 'threads', 'thBigMe', { providerUserId: BIG });
  const thNeighbor = mkAcc(uBig2, 'threads', 'thNeighborMe', { providerUserId: BIG_ROUNDED });
  r = await postMeta('threads', 'data-deletion', makeSignedRaw(`{"algorithm":"HMAC-SHA256","user_id":2.5025320703795513e16,"issued_at":${issued()}}`, 'th_secret'));
  ok(r.status === 400 && store.SnsAccounts.get(thBig) && store.SnsAccounts.get(thNeighbor), '届いた数字を取り出せない範囲外のIDの求めは 400 で断り、どの連携も消さない');
  r = await postMeta('threads', 'data-deletion', makeSignedRaw(`{"algorithm":"HMAC-SHA256","user_id":${BIG},"issued_at":${issued()}}`, 'th_secret'));
  ok(r.status === 200 && !store.SnsAccounts.get(thBig) && store.SnsAccounts.get(thNeighbor), '17桁の奇数のIDが数で届いても、そのIDの連携だけを消し、丸めた値（隣のID）の別人の連携は消さない');
  r = await postMeta('instagram', 'deauthorize', makeSignedRaw(`{"algorithm":"HMAC-SHA256","user_id":${BIG_IG},"issued_at":${issued()}}`, 'ig_secret'));
  ok(r.status === 200, '照合する連携が無い17桁のIDでも壊れない');

  console.log('前の作りで保存したデータの手当て（起動時。冪等）');
  const uOld = mkUser('old@example.com');
  const fbOld = mkAcc(uOld, 'facebook', 'pageOld');
  const igOld = mkAcc(uOld, 'instagram', 'igOld');
  const igHalf = mkAcc(uOld, 'instagram', 'igHalf', { providerAltId: 'igHalfMe' });
  const fbNew = mkAcc(uOld, 'facebook', 'pageNew', { providerUserId: 'fbNewUser' });
  const thOld = mkAcc(uOld, 'threads', 'thOld');
  const pOld = mkPosts(uOld, thOld, 'old');
  // 前の作りの解除（投稿IDを消さなかった）で残った予約：連携の行だけが無い
  db.prepare('DELETE FROM sns_accounts WHERE id=?').run(thOld);
  const pKept = mkPosts(uOld, fbNew, 'kept');
  ok(store.ScheduledPosts.get(pOld.posted).external_id === 'ext_old', '（前提）連携の無い予約に、投稿IDとリンクが残っている');
  store.migrateLegacyRows();
  const st1 = (id) => store.SnsAccounts.get(id);
  ok(st1(fbOld).status === 'reauth_required' && st1(igOld).status === 'reauth_required', '照合用のIDが無い Facebook・Instagram の連携は「再連携が必要」にする');
  ok(st1(igHalf).status === 'active' && st1(fbNew).status === 'active', '照合用のIDがある連携には触れない');
  ok(st1(fbOld).reauth_at !== '' && st1(igOld).reauth_at !== '', '再連携が必要になった日時を記録する');
  ok(store.ScheduledPosts.get(pOld.posted).external_id === '' && store.ScheduledPosts.get(pOld.posted).permalink === '' && store.ScheduledPosts.get(pOld.posted).text === '済みold', '連携がもう無い予約に残っていた投稿IDとリンクを消す（本文は残す）');
  ok(store.ScheduledPosts.get(pKept.posted).external_id === 'ext_kept', '連携が残っている予約の投稿IDは消さない');
  const snap = JSON.stringify([st1(fbOld), st1(igOld), st1(igHalf), st1(fbNew), store.ScheduledPosts.get(pOld.posted), store.ScheduledPosts.get(pKept.posted)]);
  store.migrateLegacyRows();
  ok(JSON.stringify([st1(fbOld), st1(igOld), st1(igHalf), st1(fbNew), store.ScheduledPosts.get(pOld.posted), store.ScheduledPosts.get(pKept.posted)]) === snap, '2回目（次の起動）では何も変わらない（冪等）');
  mkAcc(uOld, 'facebook', 'pageOld', { providerUserId: 'fbOldUser' });
  ok(st1(fbOld).status === 'active' && st1(fbOld).provider_user_id === 'fbOldUser' && st1(fbOld).reauth_at === '', '再連携すると、照合用のIDが埋まり、有効に戻る');
  store.migrateLegacyRows();
  ok(st1(fbOld).status === 'active', '再連携した後の起動では、「再連携が必要」に戻さない');

  server.close();
  process.exit(summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
