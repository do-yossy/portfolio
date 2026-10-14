'use strict';
// SNSアダプタ単体のテスト（カルーセル・ツリー。外部通信はモック）
process.env.SNS_POLL_INTERVAL_MS = '1';
const { ok, summary, installHttpsMock } = require('./helpers');
const th = require('../lib/sns/threads');
const ig = require('../lib/sns/instagram');
const xa = require('../lib/sns/x');
const fb = require('../lib/sns/facebook');
const yt = require('../lib/sns/youtube');
const tk = require('../lib/sns/tiktok');
const fs = require('fs');
const os = require('os');
const path = require('path');

const img = (n) => ({ kind: 'image', mime: 'image/jpeg', url: `https://example.test/media/${n}.jpg` });
const vid = (n) => ({ kind: 'video', mime: 'video/mp4', url: `https://example.test/media/${n}.mp4` });

(async () => {
  console.log('Threads カルーセル');
  let n = 0;
  let mock = installHttpsMock(async (c) => {
    if (/\/threads$/.test(c.path)) return { status: 200, json: { id: `c${++n}` } };
    if (/threads_publish$/.test(c.path)) return { status: 200, json: { id: 'pub1' } };
    return { status: 200, json: { status: 'FINISHED' } };
  });
  let r = await th.publish({ accessToken: 't', externalUserId: 'u1', post: { category: 'image', text: 'hi', medias: [img(1), img(2), img(3)] } });
  mock.restore();
  const bodies = mock.calls.filter((c) => /\/threads$/.test(c.path)).map((c) => c.body);
  ok(r.externalId === 'pub1', 'カルーセルを投稿できる');
  ok(bodies.slice(0, 3).every((b) => /is_carousel_item=true/.test(b)) && /media_type=CAROUSEL/.test(bodies[3]) && /children=c1%2Cc2%2Cc3/.test(bodies[3]), '子コンテナ3件→親コンテナの順で作る');
  ok(th.validatePost({ post: { category: 'image', text: '', medias: Array.from({ length: 21 }, (_, i) => img(i)) } }), '21件は拒否する');

  console.log('Threads ツリー');
  n = 0; let pubN = 0;
  mock = installHttpsMock(async (c) => {
    if (/\/threads$/.test(c.path)) return { status: 200, json: { id: `c${++n}` } };
    if (/threads_publish$/.test(c.path)) return { status: 200, json: { id: `p${++pubN}` } };
    return { status: 200, json: { status: 'FINISHED' } };
  });
  r = await th.publish({ accessToken: 't', externalUserId: 'u1', post: { category: 'tree', text: '1', medias: [], tree: [{ text: '2', medias: [] }, { text: '3', medias: [img(9)] }] } });
  mock.restore();
  const cs = mock.calls.filter((c) => /\/threads$/.test(c.path)).map((c) => c.body);
  ok(r.externalId === 'p1', 'ツリーの1件目のIDを返す');
  ok(!/reply_to_id/.test(cs[0]) && /reply_to_id=p1/.test(cs[1]) && /reply_to_id=p2/.test(cs[2]), '2件目以降は直前の投稿への返信にする');

  console.log('Threads ツリーの途中失敗');
  n = 0; pubN = 0;
  mock = installHttpsMock(async (c) => {
    if (/\/threads$/.test(c.path)) { n++; return n === 2 ? { status: 503, json: { error: { message: 'down' } } } : { status: 200, json: { id: `c${n}` } }; }
    if (/threads_publish$/.test(c.path)) return { status: 200, json: { id: `p${++pubN}` } };
    return { status: 200, json: { status: 'FINISHED' } };
  });
  let err = null;
  try { await th.publish({ accessToken: 't', externalUserId: 'u1', post: { category: 'tree', text: '1', medias: [], tree: [{ text: '2', medias: [] }] } }); } catch (e) { err = e; }
  mock.restore();
  ok(err && err.retriable === false && /投稿済み/.test(err.message), '1件目が投稿済みなら再試行せず、利用者に確認を促す');

  console.log('Instagram カルーセル');
  n = 0;
  mock = installHttpsMock(async (c) => {
    if (/\/media$/.test(c.path)) return { status: 200, json: { id: `i${++n}` } };
    if (/media_publish$/.test(c.path)) return { status: 200, json: { id: 'igp' } };
    return { status: 200, json: { status_code: 'FINISHED' } };
  });
  r = await ig.publish({ accessToken: 't', externalUserId: 'g1', post: { category: 'image', text: 'cap', medias: [img(1), vid(2)] } });
  mock.restore();
  const ib = mock.calls.filter((c) => /\/media$/.test(c.path)).map((c) => c.body);
  ok(r.externalId === 'igp' && /is_carousel_item=true/.test(ib[0]) && /media_type=VIDEO/.test(ib[1]) && /media_type=CAROUSEL/.test(ib[2]) && /caption=cap/.test(ib[2]), 'Instagramのカルーセル（画像＋動画）を投稿できる');
  ok(ig.validatePost({ post: { category: 'image', text: '', medias: Array.from({ length: 11 }, (_, i) => img(i)) } }), '11件は拒否する');
  ok(ig.validatePost({ post: { category: 'tree', text: '', medias: [img(1)], tree: [{ text: 'x' }] } }), 'Instagramはツリー不可');
  ok(/縦横比/.test(ig.validatePost({ post: { category: 'image', text: '', medias: [{ ...img(1), width: 1080, height: 1440 }] } }) || '') && ig.validatePost({ post: { category: 'image', text: '', medias: [{ ...img(1), width: 1080, height: 1350 }] } }) === null, 'Instagramの画像は縦横比 4:5〜1.91:1 だけ（スマホの縦写真3:4は予約の時点で断る）');
  let pubTry = 0;
  mock = installHttpsMock(async (c) => {
    if (/\/media$/.test(c.path)) return { status: 200, json: { id: 'ix' } };
    if (/media_publish$/.test(c.path)) { pubTry++; return pubTry === 1 ? { status: 400, json: { error: { message: 'not ready', code: 9007, error_subcode: 2207027 } } } : { status: 200, json: { id: 'igok' } }; }
    return { status: 200, json: { status_code: 'FINISHED' } };
  });
  r = await ig.publish({ accessToken: 't', externalUserId: 'g1', post: { category: 'image', text: 'c', medias: [img(1)] } });
  mock.restore();
  ok(r.externalId === 'igok' && pubTry === 2, 'Instagramの「まだ公開の準備ができていない」は、同じ投稿のまま待って再試行する');
  console.log('Threads 公開の応答が失われた場合');
  mock = installHttpsMock(async (c) => {
    if (/\/threads$/.test(c.path)) return { status: 200, json: { id: 'cx' } };
    if (/threads_publish$/.test(c.path)) throw new Error('ECONNRESET');
    return { status: 200, json: { status: 'PUBLISHED' } };
  });
  r = await th.publish({ accessToken: 't', externalUserId: 'u1', post: { category: 'text', text: 'x', medias: [] } });
  mock.restore();
  ok(r.externalId === 'cx', '公開の応答が失われても、コンテナが PUBLISHED なら投稿済みとして記録する（利用者に確認をお願いしない）');
  let fin = 0;
  mock = installHttpsMock(async (c) => {
    if (/\/threads$/.test(c.path)) return { status: 200, json: { id: 'cy' } };
    if (/threads_publish$/.test(c.path)) throw new Error('ECONNRESET');
    fin++; return { status: 200, json: { status: 'FINISHED' } };
  });
  err = null; try { await th.publish({ accessToken: 't', externalUserId: 'u1', post: { category: 'text', text: 'x', medias: [] } }); } catch (e) { err = e; }
  mock.restore();
  ok(err && err.retriable === true, 'コンテナがまだ FINISHED（未公開）なら、安全に再試行できる');
  ok(th.textLength('あ😀') === 5 && th.textLength('abc') === 3, 'Threadsの文字数は、絵文字をUTF-8のバイト数で数える（公式の数え方）');
  ok(/\b300\b|5分/.test(th.validatePost({ post: { category: 'video', text: '', medias: [{ kind: 'video', durationSec: 301 }] } }) || ''), 'Threadsの動画は5分まで');

  console.log('X ツリー');
  let tn = 0;
  mock = installHttpsMock(async () => ({ status: 201, json: { data: { id: `t${++tn}` } } }));
  r = await xa.publish({ accessToken: 't', post: { category: 'tree', text: 'a', medias: [], tree: [{ text: 'b', medias: [] }, { text: 'c', medias: [] }] } });
  mock.restore();
  const xb = mock.calls.map((c) => JSON.parse(c.body));
  ok(r.externalId === 't1' && !xb[0].reply && xb[1].reply.in_reply_to_tweet_id === 't1' && xb[2].reply.in_reply_to_tweet_id === 't2', 'Xのツリーを返信の連鎖で投稿する');
  ok(xa.validatePost({ post: { category: 'tree', text: 'a', medias: [], tree: [{ text: '', medias: [] }] } }), 'ツリーの空の投稿は拒否する');
  console.log('Facebookページ');
  let fn = 0;
  mock = installHttpsMock(async (c) => {
    if (/\/photos$/.test(c.path)) return { status: 200, json: { id: `ph${++fn}` } };
    if (/\/feed$/.test(c.path)) return { status: 200, json: { id: 'pg_1' } };
    if (/\/videos$/.test(c.path)) return { status: 200, json: { id: 'vid_1' } };
    return { status: 404, json: { error: { message: 'x' } } };
  });
  r = await fb.publish({ accessToken: 't', externalUserId: 'pg', post: { category: 'image', text: 'hello', medias: [img(1), img(2)] } });
  const fbFeed = mock.calls.find((c) => /\/feed$/.test(c.path)).body;
  ok(r.externalId === 'pg_1' && /published=false/.test(mock.calls[0].body) && decodeURIComponent(fbFeed).includes('"media_fbid":"ph2"'), 'Facebookへ複数画像を投稿できる');
  r = await fb.publish({ accessToken: 't', externalUserId: 'pg', post: { category: 'video', text: 'v', medias: [vid(1)] } });
  ok(r.externalId === 'vid_1' && /file_url=/.test(mock.calls[mock.calls.length - 1].body), 'Facebookへ動画を投稿できる');
  mock.restore();
  ok(fb.validatePost({ post: { category: 'image', text: '', medias: [img(1), vid(2)] } }), '画像と動画の混在は拒否する');

  console.log('YouTube');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yt-')), 'a.mp4');
  fs.writeFileSync(tmp, Buffer.alloc(100, 1));
  mock = installHttpsMock(async (c) => {
    if (c.method === 'POST' && c.path.startsWith('/upload/youtube/v3/videos')) return { status: 200, json: {}, headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc' } };
    if (c.method === 'PUT') return { status: 200, json: { id: 'yt_1' } };
    return null;
  });
  r = await yt.publish({ accessToken: 't', post: { category: 'video', text: 'タイトル\n説明', medias: [{ kind: 'video', mime: 'video/mp4', size: 100, path: tmp, url: 'u' }], options: { privacy: 'unlisted' } } });
  mock.restore();
  const meta = JSON.parse(mock.calls[0].body);
  ok(r.externalId === 'yt_1' && meta.snippet.title === 'タイトル #Shorts' && meta.status.privacyStatus === 'unlisted' && meta.status.selfDeclaredMadeForKids === false, 'YouTubeへショート動画を投稿できる');
  mock = installHttpsMock(async (c) => {
    if (c.method === 'POST' && c.path.startsWith('/upload/youtube/v3/videos')) return { status: 200, json: {}, headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc' } };
    if (c.method === 'PUT') return { status: 200, json: { id: 'yt_2' } };
    return null;
  });
  await yt.publish({ accessToken: 't', post: { category: 'video', text: 'x', medias: [{ kind: 'video', mime: 'video/mp4', size: 100, path: tmp, url: 'u' }], options: { made_for_kids: true } } });
  mock.restore();
  const meta2 = JSON.parse(mock.calls[0].body);
  ok(meta2.status.privacyStatus === 'private' && meta2.status.selfDeclaredMadeForKids === true, 'YouTubeの公開設定を省略したら非公開にし、子ども向けの選択を申告する');
  ok(yt.validatePost({ post: { category: 'video', text: 'x', medias: [{ kind: 'video' }], options: { made_for_kids: 'yes' } } }), '子ども向けの設定は true/false だけ');
  ok(yt.validatePost({ post: { category: 'text', text: 'x', medias: [] } }), '動画なしは拒否する');
  console.log('X 画像・動画');
  const xdir = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));
  const xi = path.join(xdir, 'a.jpg'); fs.writeFileSync(xi, Buffer.alloc(50, 1));
  const xv = path.join(xdir, 'a.mp4'); fs.writeFileSync(xv, Buffer.alloc(9 * 1024 * 1024, 2));
  let stTries = 0;
  mock = installHttpsMock(async (c) => {
    if (c.path === '/2/media/upload') return { status: 200, json: { data: { id: 'img1' } } };
    if (c.path === '/2/media/upload/initialize') return { status: 200, json: { data: { id: 'vid1' } } };
    if (/\/append$/.test(c.path)) return { status: 200, json: {} };
    if (/\/finalize$/.test(c.path)) return { status: 200, json: { data: { id: 'vid1', processing_info: { state: 'pending', check_after_secs: 1 } } } };
    if (c.path.startsWith('/2/media/upload?command=STATUS')) { stTries++; return { status: 200, json: { data: { processing_info: { state: stTries > 1 ? 'succeeded' : 'in_progress' } } } }; }
    if (c.path === '/2/tweets') return { status: 201, json: { data: { id: 'tw1' } } };
    return null;
  });
  r = await xa.publish({ accessToken: 't', post: { category: 'image', text: '画像', medias: [{ kind: 'image', mime: 'image/jpeg', size: 50, path: xi }] } });
  let tw = JSON.parse(mock.calls.find((c) => c.path === '/2/tweets').body);
  ok(r.externalId === 'tw1' && tw.media.media_ids[0] === 'img1' && /multipart\/form-data/.test(mock.calls[0].headers['Content-Type']), 'Xへ画像つきで投稿できる');
  r = await xa.publish({ accessToken: 't', post: { category: 'video', text: '', medias: [{ kind: 'video', mime: 'video/mp4', size: 9 * 1024 * 1024, path: xv }] } });
  const appends = mock.calls.filter((c) => /\/append$/.test(c.path)).length;
  tw = JSON.parse(mock.calls.filter((c) => c.path === '/2/tweets').pop().body);
  ok(appends === 3 && tw.media.media_ids[0] === 'vid1' && stTries === 2, 'Xへ動画を分割アップロードし、処理完了を待ってから投稿する');
  mock.restore();

  console.log('TikTok 写真');
  mock = installHttpsMock(async (c) => {
    if (c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } };
    if (c.path === '/v2/post/publish/content/init/') return { status: 200, json: { data: { publish_id: 'pp1' }, error: { code: 'ok' } } };
    if (c.path === '/v2/post/publish/status/fetch/') return { status: 200, json: { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['tp1'] }, error: { code: 'ok' } } };
    return null;
  });
  r = await tk.publish({ accessToken: 't', post: { category: 'image', text: 'タイトル\n説明文', medias: [img(1), img(2)], options: { privacy_level: 'SELF_ONLY' } } });
  const tkb = JSON.parse(mock.calls.find((c) => c.path === '/v2/post/publish/content/init/').body);
  mock.restore();
  ok(r.externalId === 'tp1' && tkb.media_type === 'PHOTO' && tkb.source_info.photo_images.length === 2 && tkb.post_info.title === 'タイトル', 'TikTokへ写真を投稿できる（1行目がタイトル）');
  console.log('TikTok の拒否の理由とAI生成の表示');
  mock = installHttpsMock(async (c) => {
    if (c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } };
    if (c.path === '/v2/post/publish/content/init/') return { status: 403, json: { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'x' } } };
    return null;
  });
  err = null; try { await tk.publish({ accessToken: 't', post: { category: 'image', text: 'a', medias: [img(1)], options: { privacy_level: 'SELF_ONLY' } } }); } catch (e) { err = e; }
  mock.restore();
  ok(err && !err.authError && /非公開/.test(err.message), 'TikTokの「審査前は非公開アカウントだけ」の拒否は、連携のやり直しにせず、理由を日本語で示す');
  mock = installHttpsMock(async (c) => {
    if (c.path === '/v2/post/publish/creator_info/query/') return { status: 200, json: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } };
    if (c.path === '/v2/post/publish/content/init/') return { status: 200, json: { data: { publish_id: 'pa' }, error: { code: 'ok' } } };
    if (c.path === '/v2/post/publish/status/fetch/') return { status: 200, json: { data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok' } } };
    return null;
  });
  await tk.publish({ accessToken: 't', post: { category: 'image', text: 'a', medias: [{ ...img(1), aiGenerated: true }], options: { privacy_level: 'SELF_ONLY' } } });
  const aigcBody = JSON.parse(mock.calls.find((c) => c.path === '/v2/post/publish/content/init/').body);
  mock.restore();
  ok(aigcBody.is_aigc === true, 'AIで作った写真には、TikTokの「AI生成」の印（is_aigc）を付ける');

  console.log('Facebook の連携（権限・ページの選び方）とエラーの分け方');
  process.env.FACEBOOK_APP_ID = 'fa'; process.env.FACEBOOK_APP_SECRET = 'fs';
  const fbAuth = new URL(fb.authUrl({ state: 's', redirectUri: 'https://e.test/cb' }));
  ok(fbAuth.searchParams.get('auth_type') === 'rerequest' && fbAuth.searchParams.get('scope').split(',').includes('business_management'), 'Facebookの認可画面は、拒否された権限を求め直し、ビジネスのページも一覧に出す');
  const fbConnect = (perms, pages) => installHttpsMock(async (c) => {
    if (c.path.includes('/oauth/access_token')) return { status: 200, json: { access_token: 'ut' } };
    if (c.path.includes('/me/permissions')) return { status: 200, json: { data: perms } };
    if (c.path.includes('/me/accounts')) return { status: 200, json: { data: pages } };
    return null;
  });
  const allPerms = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'].map((p) => ({ permission: p, status: 'granted' }));
  mock = fbConnect([...allPerms.slice(0, 2), { permission: 'pages_read_engagement', status: 'declined' }], [{ id: 'p1', name: 'A', access_token: 'pt', tasks: ['CREATE_CONTENT'] }]);
  err = null; try { await fb.exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' }); } catch (e) { err = e; }
  mock.restore();
  ok(err && /許可/.test(err.message), '投稿に必要な権限が拒否されていたら、連携を止める');
  mock = fbConnect(allPerms, [{ id: 'p1', name: 'A', access_token: 'pt1', tasks: ['ANALYZE'] }, { id: 'p2', name: 'B', access_token: 'pt2', tasks: ['CREATE_CONTENT', 'MANAGE'] }]);
  r = await fb.exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' });
  const fbAccountsCall = mock.calls.find((c) => c.path.includes('/me/accounts'));
  mock.restore();
  ok(r.externalUserId === 'p2' && r.accessToken === 'pt2' && /tasks/.test(decodeURIComponent(fbAccountsCall.path)), '投稿できる（CREATE_CONTENT）ページだけを投稿先の候補にする');
  mock = fbConnect(allPerms, [{ id: 'p1', name: 'A', access_token: 'pt1', tasks: ['CREATE_CONTENT'] }, { id: 'p2', name: 'B', access_token: 'pt2', tasks: ['CREATE_CONTENT'] }]);
  err = null; try { await fb.exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' }); } catch (e) { err = e; }
  mock.restore();
  ok(err && /1つだけ/.test(err.message), '投稿できるページが2つ以上なら、意図しないページに投稿しないよう連携を止める');
  mock = fbConnect(allPerms, []);
  err = null; try { await fb.exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' }); } catch (e) { err = e; }
  mock.restore();
  ok(err && /ビジネスポートフォリオ/.test(err.message), 'ページが無いときは、ビジネス側の役割についても案内する');
  const fbFail = async (errBody) => {
    mock = installHttpsMock(async (c) => (/\/feed$/.test(c.path) ? { status: 400, json: { error: errBody } } : null));
    let e2 = null; try { await fb.publish({ accessToken: 't', externalUserId: 'pg', post: { category: 'text', text: 'a', medias: [] } }); } catch (e) { e2 = e; }
    mock.restore();
    return e2;
  };
  err = await fbFail({ message: 'limit', code: 4 });
  ok(err && err.retriable && !err.authError && !/投稿されたか/.test(err.message), 'Facebookの呼び出しの上限（コード4）は、投稿されていないので再試行する');
  err = await fbFail({ message: 'perm', code: 200 });
  ok(err && err.authError && /許可/.test(err.message), 'Facebookの権限エラー（200番台）は、連携のやり直しを促す');
  err = await fbFail({ message: 'role', code: 100, error_subcode: 492 });
  ok(err && err.authError, 'ページでの役割が無い（サブコード492）は、連携のやり直しを促す');
  err = await fbFail({ message: 'bad', code: 100 });
  ok(err && !err.authError && !err.retriable, 'そのほかの400は、通常の失敗にする');

  console.log('YouTube の制限とエラーの分け方');
  const ytVid = (extra = {}) => ({ kind: 'video', mime: 'video/mp4', size: 100, path: tmp, url: 'u', ...extra });
  const ytOk = (putJson = { id: 'y1' }) => installHttpsMock(async (c) => {
    if (c.method === 'POST' && c.path.startsWith('/upload/youtube/v3/videos')) return { status: 200, json: {}, headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc' } };
    if (c.method === 'PUT') return { status: 200, json: putJson };
    return null;
  });
  mock = ytOk();
  await yt.publish({ accessToken: 'tok', post: { category: 'video', text: '<お知らせ> A->B\n説明', medias: [ytVid({ aiGenerated: true })], options: { privacy: 'public', made_for_kids: false } } });
  const ytMeta = JSON.parse(mock.calls[0].body);
  const ytPut = mock.calls.find((c) => c.method === 'PUT');
  mock.restore();
  ok(!/[<>]/.test(ytMeta.snippet.title + ytMeta.snippet.description) && ytMeta.snippet.title.startsWith('＜お知らせ＞ A-＞B'), 'YouTubeのタイトル・説明の半角の < > は全角に置き換える');
  ok(ytPut.headers.Authorization === 'Bearer tok', '動画本体の送信にも、認可のヘッダーを付ける');
  ok(ytMeta.status.containsSyntheticMedia === true, 'AIで作った動画は、合成した内容として申告する');
  const longTitle = 'あ'.repeat(100);
  const td = yt.titleAndDescription(longTitle);
  ok([...td.title].length === 100 && !/#Shorts/.test(td.title), 'タイトルは100文字まで使え、収まらないときは #Shorts で削らない');
  ok(yt.validatePost({ post: { category: 'video', text: 'あ'.repeat(1700), medias: [{ kind: 'video' }] } }) && !yt.validatePost({ post: { category: 'video', text: 'あ'.repeat(1600), medias: [{ kind: 'video' }] } }), 'YouTubeの説明は5,000バイトまで（日本語はおよそ1,600文字）');
  ok(Buffer.byteLength(yt.titleAndDescription('あ'.repeat(1666)).description, 'utf8') <= 5000, '#Shorts を足しても5,000バイトを超えない');
  mock = ytOk({ id: 'y2', status: { uploadStatus: 'rejected', rejectionReason: 'duplicate' } });
  err = null; try { await yt.publish({ accessToken: 't', post: { category: 'video', text: 'x', medias: [ytVid()], options: { privacy: 'private', made_for_kids: false } } }); } catch (e) { err = e; }
  mock.restore();
  ok(err && /duplicate/.test(err.message) && !err.retriable, 'YouTubeが動画を拒否した（rejected）ときは、理由を示して失敗にする');
  const ytFail = async (reason) => {
    mock = installHttpsMock(async (c) => (c.method === 'POST' ? { status: 403, json: { error: { message: 'm', errors: [{ reason }] } } } : null));
    let e2 = null; try { await yt.publish({ accessToken: 't', post: { category: 'video', text: 'x', medias: [ytVid()], options: { privacy: 'private', made_for_kids: false } } }); } catch (e) { e2 = e; }
    mock.restore();
    return e2;
  };
  err = await ytFail('quotaExceeded');
  ok(err && err.quotaExhausted && err.retriable && !err.authError, 'YouTubeの割り当ての使い切り（quotaExceeded）は、再連携にせず翌日に回す');
  err = await ytFail('insufficientPermissions');
  ok(err && err.authError, '権限不足（insufficientPermissions）は、連携のやり直しを促す');
  err = await ytFail('forbidden');
  ok(err && !err.authError && !err.retriable, 'forbidden は、再連携にしない通常の失敗にする');
  process.env.GOOGLE_CLIENT_ID = 'gi'; process.env.GOOGLE_CLIENT_SECRET = 'gs';
  mock = installHttpsMock(async (c) => {
    if (c.path === '/token') return { status: 200, json: { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'https://www.googleapis.com/auth/youtube.readonly' } };
    if (c.path.startsWith('/youtube/v3/channels')) return { status: 200, json: { items: [{ id: 'ch', snippet: { title: 'T' } }] } };
    return null;
  });
  err = null; try { await yt.exchangeCode({ code: 'c', redirectUri: 'https://e.test/cb' }); } catch (e) { err = e; }
  mock.restore();
  ok(err && /アップロード/.test(err.message), '動画のアップロードの権限が許可されていなければ、連携を止める');

  console.log('太平洋時間の1日');
  const pt = require('../lib/pt-time');
  ok(pt.dayBounds('2026-10-14T06:59:00Z').day === '2026-10-13' && pt.dayBounds('2026-10-14T07:00:00Z').from === '2026-10-14T07:00:00.000Z', '夏時間：太平洋時間の0時（UTCの7時）で日付が変わる');
  ok(pt.dayBounds('2026-11-01T12:00:00Z').to === '2026-11-02T08:00:00.000Z' && pt.dayBounds('2026-12-01T12:00:00Z').from === '2026-12-01T08:00:00.000Z', '冬時間への切り替えの日と、冬時間の日の範囲');

  console.log('URLからの取り込みの安全対策');
  const fm = require('../lib/fetch-media');
  ok(['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.0.1', '172.20.0.1', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0'].every(fm.isPrivate), '社内・ローカルのアドレスを判定できる');
  ok(!fm.isPrivate('93.184.216.34') && !fm.isPrivate('2606:4700::1111'), '公開アドレスは許可する');
  ok(fm.normalizeUrl('https://drive.google.com/file/d/AbC_123/view?usp=sharing').href === 'https://drive.usercontent.google.com/download?id=AbC_123&export=download', 'Googleドライブの共有リンクを直接ダウンロードのURLに直す');
  summary();
})();
