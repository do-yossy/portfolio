'use strict';
// SNSアダプタ単体のテスト（カルーセル・ツリー。外部通信はモック）
process.env.SNS_POLL_INTERVAL_MS = '1';
const { ok, summary, installHttpsMock } = require('./helpers');
const th = require('../lib/sns/threads');
const ig = require('../lib/sns/instagram');

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
  summary();
})();
