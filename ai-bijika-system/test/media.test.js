'use strict';
// 画像・動画の添付、Instagram・TikTokへの投稿、Threadsへの画像・動画の投稿のテスト（外部通信はモック）
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-media-'));
process.env.SNS_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
process.env.SERVICE_BASE_URL = 'https://example.test';
process.env.THREADS_APP_ID = 'th'; process.env.THREADS_APP_SECRET = 'ths';
process.env.INSTAGRAM_APP_ID = 'ig'; process.env.INSTAGRAM_APP_SECRET = 'igs';
process.env.TIKTOK_CLIENT_KEY = 'tt'; process.env.TIKTOK_CLIENT_SECRET = 'tts';
process.env.SNS_POLL_INTERVAL_MS = '1';

const { ok, summary, installHttpsMock } = require('./helpers');
const { Users } = require('../db');
const store = require('../lib/service-store');
const media = require('../lib/media');
const core = require('../lib/service-core');
const scheduler = require('../lib/sns/scheduler');
const registry = require('../lib/sns');
const box = require('../lib/crypto-box');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(3000, 3)]);
const mkUser = (e) => Users.create({ email: e, passwordHash: 'h', passwordSalt: 's' });
const upload = (userId, buf) => media.saveUpload({ userId, req: Readable.from([buf]), contentLength: buf.length });
const future = () => new Date(Date.now() + 1000).toISOString();

(async () => {
  console.log('メディアの保存');
  const uid = mkUser('m@example.com');
  store.Subscriptions.upsert(uid, { status: 'active' });
  let r = await upload(uid, JPEG);
  ok(r.ok && r.media.kind === 'image' && r.media.mime === 'image/jpeg' && fs.existsSync(media.pathOf(r.media)), 'JPEGを保存できる');
  const jpg = r.media;
  r = await upload(uid, PNG);
  ok(r.ok && r.media.mime === 'image/png', 'PNGを保存できる');
  const png = r.media;
  r = await upload(uid, MP4);
  ok(r.ok && r.media.kind === 'video' && r.media.ext === 'mp4', 'MP4を保存できる');
  const mp4 = r.media;
  r = await upload(uid, Buffer.from('<?php echo 1; ?>'.repeat(10)));
  ok(!r.ok && /対応していない/.test(r.error), '画像・動画以外のファイルは拒否する（中身で判定する）');
  r = await upload(uid, Buffer.alloc(0));
  ok(!r.ok, '空のファイルは拒否する');
  r = await media.saveUpload({ userId: uid, req: Readable.from([JPEG]), contentLength: 200 * 1024 * 1024 });
  ok(!r.ok && /大きすぎ/.test(r.error), '上限を超える申告サイズは拒否する');
  r = await media.saveUpload({ userId: uid, req: Readable.from([Buffer.alloc(5000, 9)]), contentLength: 100 });
  ok(!r.ok, '申告より大きい本文は拒否する');
  ok(fs.readdirSync(path.join(process.env.DATA_DIR, 'media')).filter((f) => f.endsWith('.part')).length === 0, '失敗したアップロードの一時ファイルを残さない');
  ok(/^https:\/\/example\.test\/media\/[a-f0-9]{48}\.jpg$/.test(media.publicUrl(jpg)), '公開URLは推測できない長いトークン付き');
  ok(!media.publicUrl(jpg).includes(uid), '公開URLにユーザーIDを含めない');

  console.log('メディアの配信');
  const mkRes = () => { const res = { headers: {}, chunks: [] , status: 0, writeHead(s, h) { this.status = s; this.headers = h || {}; }, end(b) { if (b) this.chunks.push(Buffer.from(b)); this.done = true; }, write(c) { this.chunks.push(Buffer.from(c)); }, on() { return this; }, once() { return this; }, emit() {}, removeListener() {} }; return res; };
  const serveTo = (token, ext, headers = {}, method = 'GET') => new Promise((resolve) => {
    const res = mkRes();
    const origPipe = require('stream').Readable.prototype.pipe;
    require('stream').Readable.prototype.pipe = function (dest) { this.on('data', (c) => dest.write(c)); this.on('end', () => { dest.done = true; resolve(dest); }); return dest; };
    media.serve({ headers, method }, res, token, ext);
    require('stream').Readable.prototype.pipe = origPipe;
    if (res.done) resolve(res);
  });
  const full = await serveTo(jpg.token, 'jpg');
  ok(full.status === 200 && Buffer.concat(full.chunks).equals(JPEG) && full.headers['Content-Type'] === 'image/jpeg', 'トークンのURLで、ファイルをそのまま配信する');
  const part = await serveTo(mp4.token, 'mp4', { range: 'bytes=0-9' });
  ok(part.status === 206 && Buffer.concat(part.chunks).length === 10 && /bytes 0-9\//.test(part.headers['Content-Range']), 'Rangeリクエストに対応する（動画の取得用）');
  const bad = await serveTo('0'.repeat(48), 'jpg');
  ok(bad.status === 404, '存在しないトークンは404');
  const wrongExt = await serveTo(jpg.token, 'png');
  ok(wrongExt.status === 404, '拡張子が違うURLは404');

  console.log('SNSごとの投稿条件');
  const ig = registry.get('instagram'); const tt = registry.get('tiktok'); const th = registry.get('threads'); const x = registry.get('x');
  ok(ig.validatePost({ text: 'a' }) && /画像または動画/.test(ig.validatePost({ text: 'a' })), 'Instagramはメディアが必須');
  ok(/JPEG/.test(ig.validatePost({ text: 'a', media: { kind: 'image', mime: 'image/png' } })), 'InstagramはPNGを使えない');
  ok(ig.validatePost({ text: 'a', media: { kind: 'image', mime: 'image/jpeg' } }) === null, 'InstagramはJPEGを投稿できる');
  ok(ig.validatePost({ text: 'あ'.repeat(2201), media: { kind: 'image', mime: 'image/jpeg' } }) !== null, 'Instagramのキャプションは2,200文字まで');
  ok(/動画/.test(tt.validatePost({ text: 'a', media: { kind: 'image', mime: 'image/jpeg' }, options: { privacy_level: 'SELF_ONLY' } })), 'TikTokは動画が必須');
  ok(/公開範囲/.test(tt.validatePost({ text: 'a', media: { kind: 'video', mime: 'video/mp4' }, options: {} })), 'TikTokは公開範囲を選ぶ必要がある');
  ok(tt.validatePost({ text: 'a', media: { kind: 'video', mime: 'video/mp4' }, options: { privacy_level: 'SELF_ONLY' } }) === null, 'TikTokは動画と公開範囲があれば投稿できる');
  ok(th.validatePost({ text: '', media: { kind: 'image' } }) === null && th.validatePost({ text: '' }) !== null, 'Threadsは本文がなくても画像・動画があればよい');
  ok(/テキストのみ/.test(x.validatePost({ text: 'a', media: { kind: 'image' } })), 'Xは画像・動画を付けられない');

  console.log('予約の作成（メディア・設定つき）');
  const enc = (v) => box.encrypt(v, box.keyFromEnv());
  const exp = new Date(Date.now() + 30 * 86400000).toISOString();
  const igAcc = store.SnsAccounts.upsert({ userId: uid, platform: 'instagram', externalUserId: 'ig1', handle: '@ig_user', accessTokenEnc: enc('igtok'), expiresAt: exp });
  const ttAcc = store.SnsAccounts.upsert({ userId: uid, platform: 'tiktok', externalUserId: 'tt1', handle: 'TT User', accessTokenEnc: enc('tttok'), refreshTokenEnc: enc('ttref'), expiresAt: exp });
  const thAcc = store.SnsAccounts.upsert({ userId: uid, platform: 'threads', externalUserId: 'th1', handle: '@th_user', accessTokenEnc: enc('thtok'), expiresAt: exp });
  ok(!core.createPosts({ userId: uid, accountIds: [igAcc], text: 'a', scheduledAtIso: future() }).ok, 'Instagramにメディアなしでは予約できない');
  ok(!core.createPosts({ userId: uid, accountIds: [igAcc], text: 'a', scheduledAtIso: future(), mediaId: png.id }).ok, 'InstagramにPNGでは予約できない');
  ok(!core.createPosts({ userId: uid, accountIds: [ttAcc], text: 'a', scheduledAtIso: future(), mediaId: mp4.id, options: { tiktok: {} } }).ok, 'TikTokは公開範囲なしでは予約できない');
  const other = mkUser('o@example.com'); store.Subscriptions.upsert(other, { status: 'active' });
  ok(!core.createPosts({ userId: other, accountIds: [igAcc], text: 'a', scheduledAtIso: future(), mediaId: jpg.id }).ok, '他のユーザーのメディアは使えない');
  const igPost = core.createPosts({ userId: uid, accountIds: [igAcc, thAcc], text: 'キャプション', scheduledAtIso: future(), mediaId: jpg.id });
  ok(igPost.ok && igPost.ids.length === 2, 'InstagramとThreadsに、同じ画像で予約できる');
  const ttPost = core.createPosts({ userId: uid, accountIds: [ttAcc], text: 'TikTokのタイトル', scheduledAtIso: future(), mediaId: mp4.id, options: { tiktok: { privacy_level: 'SELF_ONLY', disable_comment: true, disable_duet: true, disable_stitch: true } } });
  ok(ttPost.ok && JSON.parse(store.ScheduledPosts.get(ttPost.ids[0]).options).privacy_level === 'SELF_ONLY', 'TikTokの設定を予約に保存する');

  console.log('投稿の実行（モック）');
  const calls = [];
  const mock = installHttpsMock(async (c) => {
    calls.push(c);
    if (c.host === 'graph.instagram.com') {
      if (c.path === '/v22.0/ig1/media') return { status: 200, json: { id: 'ig_container' } };
      if (c.path === '/v22.0/ig1/media_publish') return { status: 200, json: { id: 'ig_media_1' } };
    }
    if (c.host === 'graph.threads.net') {
      if (c.path === '/v1.0/th1/threads') return { status: 200, json: { id: 'th_container' } };
      if (c.path === '/v1.0/th1/threads_publish') return { status: 200, json: { id: 'th_post_1' } };
    }
    if (c.host === 'open.tiktokapis.com') {
      if (c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } };
      if (c.path === '/v2/post/publish/video/init/') return { status: 200, json: { data: { publish_id: 'pub_1', upload_url: 'https://upload.tiktok.test/up/abc?x=1' }, error: { code: 'ok' } } };
      if (c.path === '/v2/post/publish/status/fetch/') return { status: 200, json: { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['tt_post_9'] }, error: { code: 'ok' } } };
    }
    if (c.host === 'upload.tiktok.test') return { status: 201, json: {} };
    return null;
  });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  const igRow = store.ScheduledPosts.get(igPost.ids[0]);
  ok(igRow.status === 'posted' && igRow.external_id === 'ig_media_1', 'Instagramへ画像を投稿できる');
  const igCreate = calls.find((c) => c.path === '/v22.0/ig1/media');
  ok(/image_url=https%3A%2F%2Fexample\.test%2Fmedia%2F/.test(igCreate.body) && /caption=/.test(igCreate.body), 'Instagramには、メディアの公開URLとキャプションを渡す');
  const thRow = store.ScheduledPosts.get(igPost.ids[1]);
  ok(thRow.status === 'posted' && /media_type=IMAGE/.test(calls.find((c) => c.path === '/v1.0/th1/threads').body), 'Threadsへ画像つきで投稿できる');
  const ttRow = store.ScheduledPosts.get(ttPost.ids[0]);
  ok(ttRow.status === 'posted' && ttRow.external_id === 'tt_post_9', 'TikTokへ動画を投稿できる');
  const init = JSON.parse(calls.find((c) => c.path === '/v2/post/publish/video/init/').body);
  ok(init.source_info.source === 'FILE_UPLOAD' && init.source_info.video_size === MP4.length && init.post_info.privacy_level === 'SELF_ONLY' && init.post_info.disable_comment === true, 'TikTokにファイルアップロード方式・公開範囲・コメント不許可を渡す');
  const put = calls.find((c) => c.host === 'upload.tiktok.test');
  ok(put.method === 'PUT' && put.headers['Content-Range'] === `bytes 0-${MP4.length - 1}/${MP4.length}` && put.body.length === MP4.length, 'TikTokへ動画のファイルをアップロードする');

  // 動画の処理待ち（Instagramリール）
  let polls = 0;
  mock.restore();
  const mock2 = installHttpsMock(async (c) => {
    if (c.host === 'graph.instagram.com') {
      if (c.path === '/v22.0/ig1/media') return { status: 200, json: { id: 'reel_c' } };
      if (c.path.startsWith('/v22.0/reel_c?')) { polls++; return { status: 200, json: { status_code: polls < 3 ? 'IN_PROGRESS' : 'FINISHED' } }; }
      if (c.path === '/v22.0/ig1/media_publish') return { status: 200, json: { id: 'reel_1' } };
    }
    return null;
  });
  const reel = core.createPosts({ userId: uid, accountIds: [igAcc], text: 'リール', scheduledAtIso: future(), mediaId: mp4.id });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(reel.ids[0]).status === 'posted' && polls === 3, 'Instagramのリールは、動画の処理が終わるまで待ってから公開する');
  ok(/media_type=REELS/.test(mock2.calls.find((c) => c.path === '/v22.0/ig1/media').body), '動画はリールとして投稿する');
  mock2.restore();

  // TikTokの公開範囲がアカウントで許可されていない場合（審査前）
  const mock3 = installHttpsMock(async (c) => {
    if (c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } };
    return null;
  });
  const pub = core.createPosts({ userId: uid, accountIds: [ttAcc], text: '公開', scheduledAtIso: future(), mediaId: mp4.id, options: { tiktok: { privacy_level: 'PUBLIC_TO_EVERYONE' } } });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  const pubRow = store.ScheduledPosts.get(pub.ids[0]);
  ok(pubRow.status === 'failed' && /公開範囲/.test(pubRow.last_error), 'アカウントで許可されていない公開範囲は、理由を示して失敗にする');
  mock3.restore();

  // 認証エラー（TikTok）
  const mock4 = installHttpsMock(async (c) => (c.path === '/v2/post/publish/creator_info/query/' ? { status: 401, json: { error: { code: 'access_token_invalid', message: 'token invalid' } } } : null));
  const authFail = core.createPosts({ userId: uid, accountIds: [ttAcc], text: 'x', scheduledAtIso: future(), mediaId: mp4.id, options: { tiktok: { privacy_level: 'SELF_ONLY' } } });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(authFail.ids[0]).status === 'failed' && store.SnsAccounts.get(ttAcc).status === 'reauth_required', 'TikTokのトークンが無効なときは、再連携が必要な状態にする');
  mock4.restore();

  // 添付ファイルが削除済みなら投稿しない
  const gone = await upload(uid, JPEG);
  const goneAcc = store.SnsAccounts.upsert({ userId: uid, platform: 'instagram', externalUserId: 'ig2', handle: '@ig2', accessTokenEnc: enc('t'), expiresAt: exp });
  const gp = core.createPosts({ userId: uid, accountIds: [goneAcc], text: 'g', scheduledAtIso: future(), mediaId: gone.media.id });
  media.remove(store.MediaAssets.get(gone.media.id) || gone.media);
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(gp.ids[0]).status === 'failed' && /削除/.test(store.ScheduledPosts.get(gp.ids[0]).last_error), '添付ファイルが削除されていたら投稿しない');

  console.log('連携');
  ok(core.startConnect({ userId: uid, platform: 'instagram' }).url.startsWith('https://www.instagram.com/oauth/authorize?') && core.startConnect({ userId: uid, platform: 'instagram' }).url.includes('instagram_business_content_publish'), 'Instagramの認可URLを作れる');
  ok(core.startConnect({ userId: uid, platform: 'tiktok' }).url.startsWith('https://www.tiktok.com/v2/auth/authorize/?') && core.startConnect({ userId: uid, platform: 'tiktok' }).url.includes('video.publish'), 'TikTokの認可URLを作れる');

  console.log('メディアの削除');
  const old = Date.now() + 3 * 24 * 3600 * 1000;
  const unref = await upload(uid, JPEG);
  ok(!media.cleanup() && fs.existsSync(media.pathOf(unref.media)), '作成直後のメディアは削除しない');
  ok(media.cleanup(old) >= 1 && !fs.existsSync(media.pathOf(unref.media)) && store.MediaAssets.get(unref.media.id) === null, 'どの予約にも使われないまま1日たったメディアは削除する');

  process.exit(summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
