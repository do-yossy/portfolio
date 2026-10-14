'use strict';
// AIによる文章・画像・動画の生成と、自動運用のテスト（外部のAIサービスはモック）
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-ai-'));
process.env.SNS_TOKEN_KEY = crypto.randomBytes(32).toString('hex');
process.env.SERVICE_BASE_URL = 'https://example.test';
process.env.ANTHROPIC_API_KEY = 'ak'; process.env.OPENAI_API_KEY = 'ok'; process.env.GEMINI_API_KEY = 'gk';
process.env.AI_DAILY_TEXT = '3'; process.env.AI_DAILY_IMAGE = '2'; process.env.AI_DAILY_VIDEO = '1';

const { ok, summary, installHttpsMock } = require('./helpers');
const { Users } = require('../db');
const store = require('../lib/service-store');
const ai = require('../lib/ai');
const auto = require('../lib/ai-auto');
const box = require('../lib/crypto-box');

const JPEG_B64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(800, 4)]).toString('base64');
const MP4_TEXT = '\u0000\u0000\u0000\u0018ftypmp42' + 'x'.repeat(500);
const mkUser = (e) => Users.create({ email: e, passwordHash: 'h', passwordSalt: 's' });

(async () => {
  const uid = mkUser('ai@example.com');
  store.Subscriptions.upsert(uid, { status: 'active' });
  let failText = false; let videoDone = false;
  const mock = installHttpsMock(async (c) => {
    if (c.host === 'api.anthropic.com') {
      if (failText) return { status: 500, json: { error: { message: 'boom' } } };
      return { status: 200, json: { content: [{ type: 'text', text: '  今日の一言です  ' }] } };
    }
    if (c.host === 'api.openai.com') return { status: 200, json: { data: [{ b64_json: JPEG_B64 }] } };
    if (c.host === 'generativelanguage.googleapis.com') {
      if (c.method === 'POST') return { status: 200, json: { name: 'models/veo/operations/op1' } };
      if (c.path.startsWith('/v1beta/models/veo/operations/op1')) return { status: 200, json: videoDone ? { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/f1:download?alt=media' } }] } } } : { done: false } };
      if (c.path.startsWith('/v1beta/files/f1')) return { status: 200, text: MP4_TEXT };
    }
    if (c.host === '93.184.216.34') {
      if (c.path === '/v.mp4') return { status: 200, text: MP4_TEXT };
      if (c.path === '/redir') return { status: 302, text: '', headers: { location: 'https://10.0.0.1/secret' } };
      if (c.path === '/hop') return { status: 301, text: '', headers: { location: '/v.mp4' } };
    }
    return null;
  });

  console.log('文章の生成');
  let t = await ai.generateText({ userId: uid, theme: '朝の習慣', platform: 'threads' });
  ok(t === '今日の一言です', '投稿文を生成できる（前後の空白は除く）');
  const body = JSON.parse(mock.calls.find((c) => c.host === 'api.anthropic.com').body);
  ok(/朝の習慣/.test(body.messages[0].content) && /確認できない数字/.test(body.system), 'テーマを渡し、捏造しないよう指示している');
  failText = true;
  let err = null; try { await ai.generateText({ userId: uid, theme: 'x' }); } catch (e) { err = e; }
  ok(err instanceof ai.AiError, 'AIサービスの失敗はエラーにする');
  failText = false;
  await ai.generateText({ userId: uid, theme: 'a' });
  await ai.generateText({ userId: uid, theme: 'b' });
  err = null; try { await ai.generateText({ userId: uid, theme: 'c' }); } catch (e) { err = e; }
  ok(err && /上限/.test(err.message), '失敗した分は数えず、1日の上限（3回）を超えると止まる');
  err = null; try { await ai.generateText({ userId: uid, theme: '' }); } catch (e) { err = e; }
  ok(err && /テーマ/.test(err.message), 'テーマが空なら生成しない');

  console.log('画像・動画の生成');
  const img = await ai.generateImage({ userId: uid, prompt: '海' });
  ok(img.kind === 'image' && img.mime === 'image/jpeg', '画像をJPEGで保存できる');
  const op = await ai.startVideo({ userId: uid, prompt: '波' });
  ok(op === 'models/veo/operations/op1', '動画の生成を始められる');
  err = null; try { await ai.startVideo({ userId: uid, prompt: 'もう1本' }); } catch (e) { err = e; }
  ok(err && /上限/.test(err.message), '動画は1日の上限を超えると止まる');
  let pr = await ai.pollVideo({ userId: uid, operation: op });
  ok(pr.done === false, '生成中は未完了を返す');
  videoDone = true;
  pr = await ai.pollVideo({ userId: uid, operation: op });
  ok(pr.done && pr.media.kind === 'video', '完了した動画を保存できる');
  err = null; try { await ai.pollVideo({ userId: uid, operation: '../../etc' }); } catch (e) { err = e; }
  ok(err, '不正な処理名は拒否する');

  console.log('URLからの取り込み');
  const fm = require('../lib/fetch-media');
  const im = await fm.importFromUrl({ userId: uid, url: 'https://93.184.216.34/v.mp4' });
  ok(im.kind === 'video', '公開URLから動画を取り込める');
  const im2 = await fm.importFromUrl({ userId: uid, url: 'https://93.184.216.34/hop' });
  ok(im2.kind === 'video', 'リダイレクト先から取り込める');
  err = null; try { await fm.importFromUrl({ userId: uid, url: 'https://93.184.216.34/redir' }); } catch (e) { err = e; }
  ok(err instanceof fm.FetchError, 'リダイレクトでローカルのアドレスに向けられても拒否する');

  console.log('自動運用');
  const k = box.keyFromEnv();
  const th = store.SnsAccounts.upsert({ userId: uid, platform: 'threads', externalUserId: 't1', handle: '@t', accessTokenEnc: box.encrypt('tok', k), expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const tt = store.SnsAccounts.upsert({ userId: uid, platform: 'tiktok', externalUserId: 'tk1', handle: 'tk', accessTokenEnc: box.encrypt('tok', k), expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const ig = store.SnsAccounts.upsert({ userId: uid, platform: 'instagram', externalUserId: 'i1', handle: '@i', accessTokenEnc: box.encrypt('tok', k), expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const rid = (id) => (typeof id === 'object' ? id.id : id);
  ok(auto.validateRule({ userId: uid, accountId: rid(tt), theme: 'x', hourJst: 9, mode: 'draft' }), 'TikTokは自動運用の対象外');
  ok(auto.validateRule({ userId: uid, accountId: rid(ig), theme: 'x', withImage: false, hourJst: 9, mode: 'draft' }), 'Instagramは画像が必要');
  ok(auto.validateRule({ userId: uid, accountId: rid(th), theme: 'x', hourJst: 30, mode: 'draft' }), '時刻が範囲外なら拒否');
  ok(auto.validateRule({ userId: uid, accountId: rid(th), theme: 'x', hourJst: 9, mode: 'weird' }), '運用の方法が不正なら拒否');
  ok(auto.validateRule({ userId: uid, accountId: rid(th), theme: 'x', hourJst: 9, mode: 'draft' }) === null, '正しいルールは通る');

  // 上限をリセットして実行する
  process.env.AI_DAILY_TEXT = '50'; process.env.AI_DAILY_IMAGE = '50';
  const draftRule = store.AutoRules.create({ userId: uid, accountId: rid(th), theme: '朝の習慣', hourJst: 0, mode: 'draft' });
  const n = await auto.tick(Date.now());
  ok(n === 1, '実行時刻を過ぎたルールを実行する');
  const drafts = store.ScheduledPosts.listForUser(uid).filter((p) => p.status === 'draft');
  ok(drafts.length === 1 && drafts[0].text === '今日の一言です', '「下書き」では、AIの文章が下書きに入る（人が確認してから投稿）');
  ok(await auto.tick(Date.now()) === 0, '同じ日に2回は実行しない');
  store.AutoRules.remove(draftRule, uid);

  const autoRule = store.AutoRules.create({ userId: uid, accountId: rid(ig), theme: '朝の習慣', withImage: true, hourJst: 0, mode: 'auto' });
  await auto.tick(Date.now() + 5);
  const pend = store.ScheduledPosts.listForUser(uid).filter((p) => p.status === 'pending');
  ok(pend.length === 1 && pend[0].category === 'image' && JSON.parse(pend[0].media_ids).length === 1, '「完全自動」では、AIの文章と画像が予約される');

  // 失敗しても止まらず、理由を記録する
  store.Subscriptions.upsert(uid, { status: 'canceled' });
  const bad = store.AutoRules.create({ userId: uid, accountId: rid(th), theme: 'x', hourJst: 0, mode: 'draft' });
  await auto.tick(Date.now() + 10);
  ok(/契約/.test(store.AutoRules.get(bad, uid).last_error), '契約が切れていたら実行せず、理由を記録する');

  console.log('Xの月の上限');
  const core = require('../lib/service-core');
  process.env.X_MONTHLY_LIMIT = '3';
  const u2 = mkUser('xq@example.com');
  store.Subscriptions.upsert(u2, { status: 'active' });
  const xa = store.SnsAccounts.upsert({ userId: u2, platform: 'x', externalUserId: 'x9', handle: '@x', accessTokenEnc: box.encrypt('tok', k), expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const at = new Date(Date.now() + 3600000).toISOString();
  let cr = core.createPost({ userId: u2, category: 'tree', targets: [{ accountId: rid(xa), caption: '1' }], tree: [{ text: '2' }], scheduledAtIso: at });
  ok(cr.ok, 'ツリー（2件）を予約できる');
  cr = core.createPost({ userId: u2, category: 'tree', targets: [{ accountId: rid(xa), caption: '1' }], tree: [{ text: '2' }], scheduledAtIso: at });
  ok(!cr.ok && /1か月に3件/.test(cr.error), 'ツリーを1件ずつ数えて、月の上限を超えると予約できない');
  cr = core.createPost({ userId: u2, category: 'text', targets: [{ accountId: rid(xa), caption: '3' }], scheduledAtIso: at });
  ok(cr.ok, '上限ちょうどまでは予約できる');
  cr = core.createPost({ userId: u2, category: 'text', targets: [{ accountId: rid(xa), caption: 'd' }], draft: true });
  ok(cr.ok, '下書きは上限に数えない');
  const pr2 = core.promoteDraft({ userId: u2, postId: cr.ids[0], scheduledAtIso: at });
  ok(!pr2.ok && /1か月/.test(pr2.error), '下書きを予約にするときも上限を確認する');
  store.SnsAccounts.remove(rid(xa), u2);
  const xa2 = store.SnsAccounts.upsert({ userId: u2, platform: 'x', externalUserId: 'x9', handle: '@x', accessTokenEnc: box.encrypt('tok', k), expiresAt: new Date(Date.now() + 86400000).toISOString() });
  cr = core.createPost({ userId: u2, category: 'text', targets: [{ accountId: rid(xa2), caption: 'again' }], scheduledAtIso: at });
  ok(cr.ok === false || store.ScheduledPosts.countXUnits(u2, ...core.jstMonthBounds(at)) <= 3, '連携をやり直しても、月の上限は数え直しにならない');
  summary();
  mock.restore();
})();
