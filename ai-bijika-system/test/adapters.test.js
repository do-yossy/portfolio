'use strict';
// SNSアダプタ単体のテスト（カルーセル・ツリー。外部通信はモック）
process.env.SNS_POLL_INTERVAL_MS = '1';
const { ok, summary, installHttpsMock } = require('./helpers');
const th = require('../lib/sns/threads');
const ig = require('../lib/sns/instagram');
const xa = require('../lib/sns/x');
const fb = require('../lib/sns/facebook');
const yt = require('../lib/sns/youtube');
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
    return { status: 200, json: {} };
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
    return { status: 200, json: {} };
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
  ok(r.externalId === 'yt_1' && meta.snippet.title === 'タイトル #Shorts' && meta.status.privacyStatus === 'unlisted', 'YouTubeへショート動画を投稿できる');
  ok(yt.validatePost({ post: { category: 'text', text: 'x', medias: [] } }), '動画なしは拒否する');
  summary();
})();
