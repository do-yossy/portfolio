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
const DAILY_ENV = ['AI_DAILY_TEXT', 'AI_DAILY_IMAGE', 'AI_DAILY_VIDEO'];

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
      if (c.path.startsWith('/v1beta/models/veo/operations/flaky')) throw new Error('ECONNRESET');
      if (c.path.startsWith('/v1beta/models/veo/operations/op1')) return { status: 200, json: videoDone ? { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/f1:download?alt=media' } }] } } } : { done: false } };
      if (c.path.startsWith('/v1beta/files/f1')) return { status: 200, text: MP4_TEXT };
    }
    if (c.host === 'api.stripe.com' && c.path === '/v1/checkout/sessions') return { status: 200, json: { id: 'cs_t', url: 'https://checkout.stripe.test/t' } };
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

  console.log('契約がない人は生成できない（画面・API・MCP・自動運用の共通の入口）');
  const nosub = mkUser('nosub@example.com');
  const before = mock.calls.length;
  err = null; try { await ai.generateText({ userId: nosub, theme: 'x' }); } catch (e) { err = e; }
  ok(err && /契約/.test(err.message), '未契約では文章を生成できない');
  err = null; try { await ai.startVideo({ userId: nosub, prompt: 'x' }); } catch (e) { err = e; }
  ok(err && /契約/.test(err.message) && mock.calls.length === before, '未契約では動画も生成できず、外部のAIを呼ばない');
  store.Subscriptions.upsert(nosub, { status: 'canceled' });
  err = null; try { await ai.generateImage({ userId: nosub, prompt: 'x' }); } catch (e) { err = e; }
  ok(err && /契約/.test(err.message), '解約済みでも生成できない');

  console.log('既定の上限');
  const saved = DAILY_ENV.map((k) => process.env[k]);
  DAILY_ENV.forEach((k) => { delete process.env[k]; });
  const L = ai.limits();
  ok(L.text === 30 && L.image === 5 && L.video === 0 && ai.available().video === false, '動画は既定で無効（運営者が回数を設定したときだけ使える）');
  DAILY_ENV.forEach((k, i) => { process.env[k] = saved[i]; });

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
  err = null; try { await ai.pollVideo({ userId: uid, operation: 'models/veo/../x' }); } catch (e) { err = e; }
  ok(err, '途中に .. を含む処理名も拒否する');
  // 状態確認の一時的なエラーでは、ジョブを失敗にしない
  const auto0 = require('../lib/ai-auto');
  const jobId = store.AiJobs.create({ userId: uid, kind: 'video', prompt: 'p', operation: 'models/veo/operations/flaky' });
  await auto0.pollJobs();
  ok(store.AiJobs.get(jobId, uid).status === 'running', '状態確認が一時的に失敗しても（接続できない等）、ジョブは続ける');

  console.log('URLからの取り込み');
  const fm = require('../lib/fetch-media');
  // 取り込みの成功は test/fetch.test.js で、本物の https を使って確かめる。ここでは、リダイレクトでの拒否だけを確かめる
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
  const lateRule = auto.createRule({ userId: uid, accountId: rid(th), theme: '遅れて作ったルール', hourJst: 0, mode: 'auto' });
  ok(await auto.tick(Date.now() + 1) === 0 && store.AutoRules.get(lateRule, uid).last_day === `${ai.day()}#00`, 'その日の時刻を過ぎてから作ったルールは、翌日から実行する（作った直後に投稿しない）');
  store.AutoRules.remove(lateRule, uid);
  store.AutoRules.remove(draftRule, uid);

  const autoRule = store.AutoRules.create({ userId: uid, accountId: rid(ig), theme: '朝の習慣', withImage: true, hourJst: 0, mode: 'auto' });
  await auto.tick(Date.now() + 5);
  const pend = store.ScheduledPosts.listForUser(uid).filter((p) => p.status === 'pending');
  ok(pend.length === 1 && pend[0].category === 'image' && JSON.parse(pend[0].media_ids).length === 1, '「完全自動」では、AIの文章と画像が予約される');

  // 予約の上限に空きがなければ、生成する前に止める（AIの回数と費用を使わない）
  process.env.SERVICE_MAX_PENDING = '1';
  const capRule = store.AutoRules.create({ userId: uid, accountId: rid(th), theme: '上限', hourJst: 0, mode: 'auto' });
  const callsBefore = mock.calls.filter((c) => c.host === 'api.anthropic.com').length;
  await auto.tick(Date.now() + 7);
  ok(/未投稿の予約/.test(store.AutoRules.get(capRule, uid).last_error) && mock.calls.filter((c) => c.host === 'api.anthropic.com').length === callsBefore, '予約の上限に空きがなければ、AIを呼ぶ前に止める');
  delete process.env.SERVICE_MAX_PENDING;
  store.AutoRules.remove(capRule, uid);

  console.log('自動運用：1日に複数回・テーマの順番・最近の投稿と重ならない指示');
  {
    const hrs = auto.hoursOf({ hours: '21,9,9', hour_jst: 0 });
    ok(hrs.join() === '9,21', '時刻は昇順・重複なしで扱う');
    const nineJst = Date.parse(`${ai.day()}T09:30:00+09:00`);
    const slot9 = auto.currentSlot({ hours: '9,21' }, nineJst);
    ok(slot9 && slot9.key === `${ai.day(nineJst)}#09`, '9時半は9時の回');
    ok(auto.currentSlot({ hours: '9,21' }, Date.parse(`${ai.day()}T08:59:00+09:00`)) === null, '最初の時刻より前は実行しない');
    const rot = { theme: 'A\nB\nC', hours: '9,21', hour_jst: 9 };
    const t1 = auto.themeFor(rot, { day: '2026-10-14', hour: 9 });
    const t2 = auto.themeFor(rot, { day: '2026-10-14', hour: 21 });
    const t3 = auto.themeFor(rot, { day: '2026-10-15', hour: 9 });
    ok(new Set([t1, t2, t3]).size === 3, 'テーマは1行に1つ、回ごとに順番に使う');
    // 2回の時刻のルール：朝に1回、夜にもう1回だけ実行する
    process.env.AI_DAILY_TEXT = '50';
    const multi = auto.createRule({ userId: uid, accountId: rid(th), theme: '朝\n夜', hours: [9, 21], mode: 'draft' }, Date.parse(`${ai.day()}T08:00:00+09:00`));
    const callsAt = () => mock.calls.filter((c) => c.host === 'api.anthropic.com').length;
    let before = callsAt();
    const n9 = await auto.tick(Date.parse(`${ai.day()}T09:05:00+09:00`));
    const n9b = await auto.tick(Date.parse(`${ai.day()}T10:00:00+09:00`));
    const n21 = await auto.tick(Date.parse(`${ai.day()}T21:01:00+09:00`));
    ok(n9 >= 1 && n9b === 0 && n21 >= 1 && callsAt() - before === 2, '設定した2つの時刻に、1回ずつ実行する');
    const lastBody = JSON.parse(mock.calls.filter((c) => c.host === 'api.anthropic.com').pop().body);
    ok(/最近の投稿/.test(lastBody.messages[0].content), '2回目からは、最近の投稿と重ならないようAIに伝える');
    ok(store.ScheduledPosts.recentTextsForRule(multi).length === 2, '自動運用で作った投稿は、ルールとひも付けて記録する');
    store.AutoRules.remove(multi, uid);
  }

  console.log('自動運用：動画');
  {
    const yt = store.SnsAccounts.upsert({ userId: uid, platform: 'youtube', externalUserId: 'yt9', handle: 'ch', accessTokenEnc: box.encrypt('tok', k), expiresAt: new Date(Date.now() + 86400000).toISOString() });
    ok(/TikTok/.test(auto.validateRule({ userId: uid, accountId: rid(tt), theme: 'x', media: 'video', hours: [9], mode: 'draft' })), 'TikTokは自動運用の対象にしない（投稿ごとに本人の確認が必要）');
    process.env.AI_DAILY_VIDEO = '0';
    ok(/動画の生成/.test(auto.validateRule({ userId: uid, accountId: rid(yt), theme: 'x', media: 'video', hours: [9], mode: 'draft', options: { privacy: 'private', made_for_kids: false } })), '動画が無効なら、動画のルールは作れない');
    process.env.AI_DAILY_VIDEO = '5';
    ok(/公開設定/.test(auto.validateRule({ userId: uid, accountId: rid(yt), theme: 'x', media: 'video', hours: [9], mode: 'draft', options: {} })), 'YouTubeは公開設定を選ばないと作れない');
    ok(/動画が必要/.test(auto.validateRule({ userId: uid, accountId: rid(yt), theme: 'x', media: 'image', hours: [9], mode: 'draft', options: { privacy: 'private', made_for_kids: false } })), 'YouTubeは動画が必要');
    ok(auto.validateRule({ userId: uid, accountId: rid(yt), theme: 'x', media: 'video', hours: [9, 12, 15, 18], mode: 'draft', options: { privacy: 'private', made_for_kids: false } }), '時刻は3つまで');
    const vr = auto.createRule({ userId: uid, accountId: rid(yt), theme: '動画テーマ', media: 'video', hours: [0], mode: 'draft', options: { privacy: 'unlisted', made_for_kids: false } }, Date.parse(`${ai.day()}T00:00:00+09:00`) - 1000);
    videoDone = false;
    const draftsBefore = store.ScheduledPosts.listDrafts(uid).length;
    await auto.tick(Date.now() + 11);
    ok(store.ScheduledPosts.listDrafts(uid).length === draftsBefore, '動画の生成中は、まだ投稿を作らない');
    videoDone = true;
    await auto.pollJobs();
    const vd = store.ScheduledPosts.listDrafts(uid).find((p) => p.rule_id === vr);
    ok(vd && vd.category === 'video' && JSON.parse(vd.options).privacy === 'unlisted', '動画ができたら、ルールの設定（YouTubeの公開設定）で下書きを作る');
    store.AutoRules.remove(vr, uid);
    // 生成中にルールを停止・削除したら、動画ができても投稿を作らない
    const vr2 = auto.createRule({ userId: uid, accountId: rid(yt), theme: '止めるルール', media: 'video', hours: [0], mode: 'auto', options: { privacy: 'unlisted', made_for_kids: false } }, Date.parse(`${ai.day()}T00:00:00+09:00`) - 1000);
    videoDone = false;
    await auto.tick(Date.now() + 13);
    store.AutoRules.setEnabled(vr2, uid, false);
    const pendBefore = store.ScheduledPosts.listForUser(uid).filter((p) => p.rule_id === vr2).length;
    videoDone = true;
    await auto.pollJobs();
    ok(store.ScheduledPosts.listForUser(uid).filter((p) => p.rule_id === vr2).length === pendBefore, '動画の生成中にルールを停止したら、できあがっても投稿を作らない');
    store.AutoRules.remove(vr2, uid);
    // 旧形式（日付だけ）の実行記録は、その日の回をすべて実行済みとして扱う
    const legacy = auto.createRule({ userId: uid, accountId: rid(th), theme: '旧形式', hours: [0], mode: 'draft' }, Date.parse(`${ai.day()}T00:00:00+09:00`) - 1000);
    require('../db').db.prepare('UPDATE auto_rules SET last_day=? WHERE id=?').run(ai.day(), legacy);
    ok(await auto.tick(Date.now() + 17) === 0, '旧形式の実行記録（その日の日付）があれば、同じ日にもう一度は実行しない');
    store.AutoRules.remove(legacy, uid);
    process.env.AI_DAILY_VIDEO = '1';
  }

  console.log('月の上限');
  {
    const mu = mkUser('monthly@example.com');
    store.Subscriptions.upsert(mu, { status: 'active' });
    process.env.AI_MONTHLY_TEXT = '2'; process.env.AI_DAILY_TEXT = '50';
    await ai.generateText({ userId: mu, theme: 'a' });
    await ai.generateText({ userId: mu, theme: 'b' });
    let me = null; try { await ai.generateText({ userId: mu, theme: 'c' }); } catch (e) { me = e; }
    ok(me && /今月の生成回数の上限/.test(me.message), '1か月の上限を超えると止まる（費用の管理）');
    process.env.AI_MONTHLY_TEXT = '0';
    ok(ai.available().text === false, '月の上限を0にすると、その生成は使えなくなる');
    delete process.env.AI_MONTHLY_TEXT;
  }

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
  const xq = store.SnsAccounts.upsert({ userId: u2, platform: 'x', externalUserId: 'x10', handle: '@x2', accessTokenEnc: box.encrypt('tok', k), expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const u2Base = store.ScheduledPosts.countXUnits(u2, ...core.jstMonthBounds(at));
  const amb = store.ScheduledPosts.create({ userId: u2, accountId: rid(xq), text: 'a', scheduledAt: at, status: 'pending' });
  store.ScheduledPosts.markFailed(amb, 'X: 503（投稿されたかどうか、SNSでご確認ください）');
  const plain = store.ScheduledPosts.create({ userId: u2, accountId: rid(xq), text: 'b', scheduledAt: at, status: 'pending' });
  store.ScheduledPosts.markFailed(plain, 'Xは、本文が必要です。');
  ok(store.ScheduledPosts.countXUnits(u2, ...core.jstMonthBounds(at)) === u2Base + 1, '投稿されたか分からない「失敗」は月の上限に数え、確実に投稿されていない「失敗」は数えない');

  console.log('無料トライアル');
  process.env.STRIPE_SECRET_KEY = 'sk_test'; process.env.STRIPE_PRICE_ID = 'price_t'; process.env.SERVICE_BASE_URL = 'https://example.test';
  const billing = require('../lib/billing');
  process.env.SERVICE_TRIAL_DAYS = '';
  const fresh = mkUser('trial@example.com');
  ok(core.trialFor(fresh) === 0, 'トライアルの設定がなければ、無料期間はない');
  process.env.SERVICE_TRIAL_DAYS = '7';
  ok(core.trialFor(fresh) === 7, '初めての人は7日間の無料期間の対象');
  store.Subscriptions.upsert(fresh, { stripe_subscription_id: 'sub_old', status: 'canceled' });
  ok(core.trialFor(fresh) === 0, '一度でも契約したことがある人は対象外');
  await billing.createCheckoutSession({ userId: 'u_t', email: 't@example.com', trialDays: 7 });
  const cs = decodeURIComponent(mock.calls.filter((c) => c.path === '/v1/checkout/sessions').pop().body);
  ok(cs.includes('subscription_data[trial_period_days]=7') && cs.includes('payment_method_collection=always'), 'Stripeに無料期間と、支払い方法の登録の必須を指定する');
  await billing.createCheckoutSession({ userId: 'u_t2', email: 't2@example.com', trialDays: 0 });
  ok(!decodeURIComponent(mock.calls.filter((c) => c.path === '/v1/checkout/sessions').pop().body).includes('trial_period_days'), '無料期間がなければ指定しない');
  const ui = require('../lib/service-ui');
  const page = ui.checkoutPage({ user: { email: 'a@b' }, csrf: 'x', trialDays: 7 });
  ok(page.includes('お申込みの完了から7日間は無料') && page.includes('自動で有料の契約に切り替わり') && page.includes('終了日時より前に') && page.includes('提供の時期'), '最終確認画面に、無料期間・自動課金・解約の期限・提供の時期を表示する');
  process.env.SERVICE_TRIAL_DAYS = '';
  summary();
  mock.restore();
})();
