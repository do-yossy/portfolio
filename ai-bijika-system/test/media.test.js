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
  ok(tt.validatePost({ text: 'a', options: { privacy_level: 'SELF_ONLY' } }) !== null, 'TikTokは動画または写真が必須');
  ok(tt.validatePost({ text: 'a', media: { kind: 'image', mime: 'image/jpeg' }, options: { privacy_level: 'SELF_ONLY' } }) === null, 'TikTokはJPEGの写真を投稿できる');
  ok(/JPEG/.test(tt.validatePost({ text: 'a', media: { kind: 'image', mime: 'image/png' }, options: { privacy_level: 'SELF_ONLY' } })), 'TikTokの写真はPNGを使えない');
  ok(/公開範囲/.test(tt.validatePost({ text: 'a', media: { kind: 'video', mime: 'video/mp4' }, options: {} })), 'TikTokは公開範囲を選ぶ必要がある');
  ok(tt.validatePost({ text: 'a', media: { kind: 'video', mime: 'video/mp4' }, options: { privacy_level: 'SELF_ONLY' } }) === null, 'TikTokは動画と公開範囲があれば投稿できる');
  ok(th.validatePost({ text: '', media: { kind: 'image' } }) === null && th.validatePost({ text: '' }) !== null, 'Threadsは本文がなくても画像・動画があればよい');
  ok(x.validatePost({ text: 'a', media: { kind: 'image', size: 1000 } }) === null, 'Xは画像を付けられる');
  ok(/5MB/.test(x.validatePost({ text: 'a', media: { kind: 'image', size: 6 * 1024 * 1024 } })), 'Xの画像は5MBまで');
  ok(/4枚/.test(x.validatePost({ post: { category: 'image', text: 'a', medias: [1, 2, 3, 4, 5].map(() => ({ kind: 'image', size: 1 })) } })), 'Xの画像は4枚まで');

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
      if (c.method === 'GET' && /fields=status_code/.test(c.path)) return { status: 200, json: { status_code: 'FINISHED' } };
      if (c.path === '/v22.0/ig1/media') return { status: 200, json: { id: 'ig_container' } };
      if (c.path === '/v22.0/ig1/media_publish') return { status: 200, json: { id: 'ig_media_1' } };
    }
    if (c.host === 'graph.threads.net') {
      if (c.path === '/v1.0/th1/threads') return { status: 200, json: { id: 'th_container' } };
      if (c.path === '/v1.0/th1/threads_publish') return { status: 200, json: { id: 'th_post_1' } };
      if (c.method === 'GET' && /^\/v1\.0\/th_container\?fields=status/.test(c.path)) return { status: 200, json: { status: 'FINISHED' } };
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
  const unaudited = core.createPosts({ userId: uid, accountIds: [ttAcc], text: '公開', scheduledAtIso: future(), mediaId: mp4.id, options: { tiktok: { privacy_level: 'PUBLIC_TO_EVERYONE' } } });
  ok(!unaudited.ok && /審査が終わるまで/.test(unaudited.error), 'TikTokの審査前は、公開範囲「自分のみ」以外は予約の時点で断る');
  process.env.TIKTOK_AUDITED = 'true'; // 審査済みのアプリでも、アカウントによっては許可されない公開範囲がある
  const pub = core.createPosts({ userId: uid, accountIds: [ttAcc], text: '公開', scheduledAtIso: future(), mediaId: mp4.id, options: { tiktok: { privacy_level: 'PUBLIC_TO_EVERYONE' } } });
  delete process.env.TIKTOK_AUDITED;
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

  console.log('審査指摘への対応（種類判定・容量・削除条件・エラー分類）');
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(100)]);
  const avif = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypavif'), Buffer.alloc(100)]);
  const qt = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypqt  '), Buffer.alloc(100)]);
  ok(media.sniff(heic) === null && media.sniff(avif) === null, 'HEIC・AVIFの画像を、動画として受け付けない');
  ok(media.sniff(qt).ext === 'mov' && media.sniff(MP4).ext === 'mp4', 'QuickTime(MOV)とMP4は受け付ける');
  const lim = media.LIMITS.userTotalBytes;
  media.LIMITS.userTotalBytes = store.MediaAssets.totalSize(uid) + 5000;
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3496, 2)]);
  const [c1, c2] = await Promise.all([upload(uid, big), upload(uid, big)]);
  ok([c1.ok, c2.ok].filter(Boolean).length === 1, '同時に2つアップロードしても、合計容量の上限を超えて保存しない');
  media.LIMITS.userTotalBytes = lim;
  const usedMedia = (await upload(uid, JPEG)).media;
  const usedPost = store.ScheduledPosts.create({ userId: uid, accountId: 'x', text: 't', scheduledAt: new Date(Date.now() + 86400000).toISOString(), mediaId: usedMedia.id });
  const later = Date.now() + 3 * 24 * 3600 * 1000;
  ok(!store.MediaAssets.deletable(later).some((m) => m.id === usedMedia.id), '予約に使用中のメディアは、削除の対象にしない');
  store.ScheduledPosts.markPosted(usedPost, 'p1');
  ok(store.MediaAssets.deletable(later).some((m) => m.id === usedMedia.id), '投稿が終わって2日たったメディアは、削除の対象になる');

  // エラーの分類
  const m5 = installHttpsMock(async (c) => {
    if (c.host === 'graph.instagram.com' && c.path === '/v22.0/ig1/media') return { status: 400, json: { error: { message: 'Invalid parameter', type: 'OAuthException', code: 100 } } };
    if (c.host === 'open.tiktokapis.com' && c.path === '/v2/oauth/token/') return { status: 200, json: { error: 'invalid_grant', error_description: 'Authorization code expired' } };
    if (c.host === 'open.tiktokapis.com' && c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { creator_nickname: 'テスト', privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], comment_disabled: true, max_video_post_duration_sec: 600 }, error: { code: 'ok' } } };
    return null;
  });
  const p100 = core.createPosts({ userId: uid, accountIds: [igAcc], text: 'x', scheduledAtIso: future(), mediaId: jpg.id });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(p100.ids[0]).status === 'failed' && store.SnsAccounts.get(igAcc).status === 'active', '認証と無関係なOAuthException（コード100）では、連携を無効にしない');
  let tokenErr = null;
  try { await tt.exchangeCode({ code: 'c', redirectUri: 'https://example.test/cb' }); } catch (e) { tokenErr = e; }
  ok(tokenErr && tokenErr.authError, 'TikTokの認可のエラー（文字列形式）を、成功として扱わない');
  const info = await tt.creatorInfo({ accessToken: 't' });
  ok(info.nickname === 'テスト' && info.privacyLevelOptions.length === 2 && info.commentDisabled === true && info.maxVideoPostDurationSec === 600, 'TikTokの投稿設定（公開範囲・コメント可否・最大秒数）を取得できる');
  ok(/自分のみ/.test(tt.validatePost({ text: 'a', media: { kind: 'video' }, options: { privacy_level: 'SELF_ONLY', commercial_paid: true } })), '提携（有償）の商用コンテンツは、公開範囲を「自分のみ」にできない');
  m5.restore();

  // MP4の長さの読み取り
  const box32 = (type, payload) => { const b = Buffer.alloc(8 + payload.length); b.writeUInt32BE(8 + payload.length, 0); b.write(type, 4, 'latin1'); payload.copy(b, 8); return b; };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(12000, 16); // version 0, timescale 1000, duration 12000 → 12秒
  const synth = Buffer.concat([box32('ftyp', Buffer.from('mp42\0\0\0\0mp42')), box32('mdat', Buffer.alloc(300, 1)), box32('moov', box32('mvhd', mvhd))]);
  const synthPath = path.join(process.env.DATA_DIR, 'synth.mp4'); fs.writeFileSync(synthPath, synth);
  ok(media.mp4DurationSec(synthPath) === 12, 'MP4の長さ（秒）を読み取れる（moovがmdatの後ろにあっても）');
  const box64 = (type, payload) => { const b = Buffer.alloc(16 + payload.length); b.writeUInt32BE(1, 0); b.write(type, 4, 'latin1'); b.writeBigUInt64BE(BigInt(16 + payload.length), 8); payload.copy(b, 16); return b; };
  fs.writeFileSync(synthPath, Buffer.concat([box32('ftyp', Buffer.from('mp42\0\0\0\0mp42')), box64('moov', box32('mvhd', mvhd))]));
  ok(media.mp4DurationSec(synthPath) === 12, '64bitのサイズ表記のMP4でも、長さを読み取れる');
  const mvhd1 = Buffer.alloc(120); mvhd1[0] = 1; mvhd1.writeUInt32BE(600, 20); mvhd1.writeBigUInt64BE(BigInt(6000), 24); // version 1
  fs.writeFileSync(synthPath, Buffer.concat([box32('ftyp', Buffer.from('mp42\0\0\0\0mp42')), box32('moov', box32('mvhd', mvhd1))]));
  ok(media.mp4DurationSec(synthPath) === 10, 'mvhdがversion 1（64bitの時間）でも、長さを読み取れる');
  fs.writeFileSync(synthPath, Buffer.concat([box32('ftyp', Buffer.from('mp42\0\0\0\0mp42')), Buffer.from([0, 0, 0, 4, 0x6d, 0x6f, 0x6f, 0x76])]));
  ok(media.mp4DurationSec(synthPath) === null, 'サイズが壊れたboxでも、止まらずにnullを返す');
  fs.writeFileSync(synthPath, Buffer.alloc(200, 3));
  ok(media.mp4DurationSec(synthPath) === null && media.mp4DurationSec('/nonexistent') === null, '読み取れないときはnull（検証しない）');
  const mockDur = installHttpsMock(async (c) => (c.path === '/v2/post/publish/creator_info/query/' ? { status: 200, json: { data: { privacy_level_options: ['SELF_ONLY'], max_video_post_duration_sec: 600 }, error: { code: 'ok' } } } : null));
  let durErr = null;
  try { await tt.publish({ accessToken: 't', text: 'a', media: { kind: 'video', mime: 'video/mp4', size: 10, path: synthPath, durationSec: 700 }, options: { privacy_level: 'SELF_ONLY' } }); } catch (e) { durErr = e; }
  ok(durErr && /長すぎます/.test(durErr.message), 'TikTokの最大秒数を超える動画は、投稿前に理由を示して失敗にする');
  mockDur.restore();

  // 公開の最終段階のエラーのうち、投稿されていないと確定するものは、そのまま扱う
  const mA = installHttpsMock(async (c) => {
    if (c.host === 'graph.instagram.com') {
      if (c.method === 'GET' && /fields=status_code/.test(c.path)) return { status: 200, json: { status_code: 'FINISHED' } };
      if (c.path === '/v22.0/ig1/media') return { status: 200, json: { id: 'cA' } };
      if (c.path === '/v22.0/ig1/media_publish') return { status: 400, json: { error: { message: 'Media ID is not available', code: 9007 } } };
    }
    return null;
  });
  const pRej = core.createPosts({ userId: uid, accountIds: [igAcc], text: 'x', scheduledAtIso: future(), mediaId: jpg.id });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(pRej.ids[0]).status === 'failed' && !/投稿されたか/.test(store.ScheduledPosts.get(pRej.ids[0]).last_error), '拒否（400）は、投稿されていないと確定するため、「投稿されたかご確認ください」とは表示しない');
  mA.restore();
  const mB = installHttpsMock(async (c) => {
    if (c.host === 'graph.instagram.com') {
      if (c.method === 'GET' && /fields=status_code/.test(c.path)) return { status: 200, json: { status_code: 'FINISHED' } };
      if (c.path === '/v22.0/ig1/media') return { status: 200, json: { id: 'cB' } };
      if (c.path === '/v22.0/ig1/media_publish') return { status: 429, json: { error: { message: 'rate limit' } } };
    }
    return null;
  });
  const pRate = core.createPosts({ userId: uid, accountIds: [igAcc], text: 'x', scheduledAtIso: future(), mediaId: jpg.id });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  ok(store.ScheduledPosts.get(pRate.ids[0]).status === 'pending', '429（制限）は、投稿されていないと確定するため、自動で再試行する');
  store.ScheduledPosts.cancel(pRate.ids[0], uid);
  mB.restore();
  store.SnsAccounts.setStatus(ttAcc, 'active');
  const mC = installHttpsMock(async (c) => {
    if (c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } };
    if (c.path === '/v2/post/publish/video/init/') return { status: 200, json: { data: { publish_id: 'pf', upload_url: 'https://upload.tiktok.test/u' }, error: { code: 'ok' } } };
    if (c.host === 'upload.tiktok.test') return { status: 201, json: {} };
    if (c.path === '/v2/post/publish/status/fetch/') return { status: 200, json: { data: { status: 'FAILED', fail_reason: 'file_format_check_failed' }, error: { code: 'ok' } } };
    return null;
  });
  const pFail = core.createPosts({ userId: uid, accountIds: [ttAcc], text: 'x', scheduledAtIso: future(), mediaId: mp4.id, options: { tiktok: { privacy_level: 'SELF_ONLY' } } });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  const failRow = store.ScheduledPosts.get(pFail.ids[0]);
  ok(failRow.status === 'failed' && /file_format_check_failed/.test(failRow.last_error) && !/投稿されたか/.test(failRow.last_error), 'TikTok側が「失敗」と通知した場合は、理由を示し、「投稿されたかご確認ください」とは表示しない');
  mC.restore();

  // 公開の最終段階のエラーは再試行しない（二重投稿の防止）
  const m6 = installHttpsMock(async (c) => {
    if (c.host === 'graph.instagram.com') {
      if (c.method === 'GET' && /fields=status_code/.test(c.path)) return { status: 200, json: { status_code: 'FINISHED' } };
      if (c.path === '/v22.0/ig1/media') return { status: 200, json: { id: 'c9' } };
      if (c.path === '/v22.0/ig1/media_publish') return { status: 500, json: { error: { message: 'Internal error' } } };
    }
    return null;
  });
  const pAmb = core.createPosts({ userId: uid, accountIds: [igAcc], text: 'x', scheduledAtIso: future(), mediaId: jpg.id });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  const amb = store.ScheduledPosts.get(pAmb.ids[0]);
  ok(amb.status === 'failed' && /投稿されたか/.test(amb.last_error) && m6.calls.filter((c) => c.path === '/v22.0/ig1/media').length === 1, '公開の最終段階のエラーは、再試行せず、投稿されたかの確認を促す（二重投稿の防止）');
  m6.restore();

  // TikTok：動画のアップロードまでの失敗は、まだ投稿されていないため、通常どおり再試行する
  store.SnsAccounts.setStatus(ttAcc, 'active');
  const mP = installHttpsMock(async (c) => {
    if (c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } };
    if (c.path === '/v2/post/publish/video/init/') return { status: 200, json: { data: { publish_id: 'pu', upload_url: 'https://upload.tiktok.test/u' }, error: { code: 'ok' } } };
    if (c.host === 'upload.tiktok.test') return { status: 503, json: {} };
    return null;
  });
  const pPut = core.createPosts({ userId: uid, accountIds: [ttAcc], text: 'x', scheduledAtIso: future(), mediaId: mp4.id, options: { tiktok: { privacy_level: 'SELF_ONLY' } } });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  const putRow = store.ScheduledPosts.get(pPut.ids[0]);
  ok(putRow.status === 'pending' && !/投稿されたか/.test(putRow.last_error), 'TikTokへの動画のアップロードに失敗しても、まだ投稿されていないため、自動で再試行する');
  store.ScheduledPosts.cancel(pPut.ids[0], uid);
  mP.restore();

  // TikTok：商用コンテンツの設定をAPIに渡す
  const m7 = installHttpsMock(async (c) => {
    if (c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'] }, error: { code: 'ok' } } };
    if (c.path === '/v2/post/publish/video/init/') return { status: 200, json: { data: { publish_id: 'p7', upload_url: 'https://upload.tiktok.test/u' }, error: { code: 'ok' } } };
    if (c.host === 'upload.tiktok.test') return { status: 201, json: {} };
    if (c.path === '/v2/post/publish/status/fetch/') return { status: 200, json: { data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok' } } };
    return null;
  });
  store.SnsAccounts.setStatus(ttAcc, 'active'); // 前のテストで再連携が必要な状態にしたため戻す
  process.env.TIKTOK_AUDITED = 'true';
  const pCom = core.createPosts({ userId: uid, accountIds: [ttAcc], text: '宣伝', scheduledAtIso: future(), mediaId: mp4.id, options: { tiktok: { privacy_level: 'PUBLIC_TO_EVERYONE', commercial_own: true, commercial_paid: false } } });
  await new Promise((rs) => setTimeout(rs, 1200));
  await scheduler.tick();
  delete process.env.TIKTOK_AUDITED;
  const initBody = JSON.parse(m7.calls.find((c) => c.path === '/v2/post/publish/video/init/').body);
  ok(store.ScheduledPosts.get(pCom.ids[0]).status === 'posted' && initBody.post_info.brand_organic_toggle === true && initBody.post_info.brand_content_toggle === false, 'TikTokに、商用コンテンツ（自分の宣伝）の設定を渡す');
  m7.restore();

  console.log('メディアの削除');
  const old = Date.now() + 3 * 24 * 3600 * 1000;
  const unref = await upload(uid, JPEG);
  ok(!media.cleanup() && fs.existsSync(media.pathOf(unref.media)), '作成直後のメディアは削除しない');
  ok(media.cleanup(old) >= 1 && !fs.existsSync(media.pathOf(unref.media)) && store.MediaAssets.get(unref.media.id) === null, 'どの予約にも使われないまま1日たったメディアは削除する');

  process.exit(summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
