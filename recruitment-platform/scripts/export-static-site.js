'use strict';
// 求人ページ＋求人ボックスXMLフィードを「静的ファイル」に書き出す（Cloudflare Pages 等へアップ用）。
// 応募者データ・管理画面は一切含まれない（求人だけの一時DBを作り、公開ページのみ保存する）。
//
// 使い方（recruitment-platform フォルダで）:
//   set SITE_URL=https://jobs.social-quality.com   （Windowsは set、Mac/Linuxは export）
//   node scripts/export-static-site.js [出力先=dist]
// → 出力フォルダを Cloudflare Pages にアップする。
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(APP, 'dist'));
const SITE_URL = (process.env.SITE_URL || 'https://jobs.social-quality.com').replace(/\/$/, '');
const PORT = parseInt(process.env.EXPORT_PORT || '3912', 10);
// 一時フォルダはOSのtempに毎回別名で作る（アプリフォルダの権限/ロックによるEPERMを回避）
const TMP = path.join(os.tmpdir(), 'rp-static-export-' + Date.now());

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
async function waitUp(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await get('/jobs'); if (r.status) return true; } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

(async () => {
  // 1) 求人だけの一時DBを作る（応募者等の個人情報を除外）
  const srcDb = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(APP, 'data', 'recruitment.db');
  if (!fs.existsSync(srcDb)) { console.error('元DBが見つかりません:', srcDb); process.exit(1); }
  fs.mkdirSync(TMP, { recursive: true });
  const tmpDb = path.join(TMP, 'recruitment.db');
  { const s = new DatabaseSync(srcDb); s.exec(`VACUUM INTO '${tmpDb.replace(/'/g, "''")}'`); try { s.close(); } catch {} }
  { const d = new DatabaseSync(tmpDb);
    for (const t of ['applicants', 'applications', 'logs', 'job_metrics', 'media_posts']) { try { d.prepare(`DELETE FROM ${t}`).run(); } catch {} }
    try { d.prepare('DELETE FROM jobs WHERE is_published != 1').run(); } catch {}
    d.exec('VACUUM;'); try { d.close(); } catch {} }

  // 2) その一時DBでローカルサーバーを起動（SITE_URL を反映）
  const jobIds = (() => { const d = new DatabaseSync(tmpDb); const r = d.prepare('SELECT id FROM jobs').all(); try { d.close(); } catch {} return r.map(x => x.id); })();
  const srv = spawn(process.execPath, ['server.js'], { cwd: APP, env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), SITE_URL } });
  srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {});
  if (!await waitUp()) { console.error('ローカルサーバーの起動に失敗しました'); srv.kill('SIGKILL'); process.exit(1); }

  // 3) 静的ファイルとして書き出し
  try { fs.rmSync(OUT, { recursive: true, force: true }); }
  catch (e) { console.error(`⚠️ 出力先(${OUT})を消せませんでした（開いているエクスプローラ/エディタを閉じてください）: ${e.code || e.message}`); }
  fs.mkdirSync(path.join(OUT, 'jobs'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'feed'), { recursive: true });

  const list = await get('/jobs');
  fs.writeFileSync(path.join(OUT, 'jobs', 'index.html'), list.body);
  fs.writeFileSync(path.join(OUT, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/jobs">');

  let n = 0;
  for (const id of jobIds) { const r = await get('/jobs/' + id); if (r.status === 200) { fs.writeFileSync(path.join(OUT, 'jobs', id + '.html'), r.body); n++; } }

  // フィード（全社＋会社別）
  const feeds = [['kyujinbox.xml', '/api/feed/kyujinbox']];
  for (const co of ['sq', 'bg', 'st']) feeds.push([`kyujinbox-${co}.xml`, `/api/feed/kyujinbox?company=${co}`]);
  for (const [fn, url] of feeds) { const r = await get(url); fs.writeFileSync(path.join(OUT, 'feed', fn), r.body); }

  try { const sm = await get('/sitemap.xml'); if (sm.status === 200) fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sm.body); } catch {}
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // 静的アセット（CSS/JS/画像）
  const pub = path.join(APP, 'public');
  for (const f of ['styles.css', 'admin.js']) { const p = path.join(pub, f); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT, f)); }
  const imgSrc = path.join(pub, 'images');
  if (fs.existsSync(imgSrc)) { const dst = path.join(OUT, 'images'); fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(imgSrc)) { try { fs.copyFileSync(path.join(imgSrc, f), path.join(dst, f)); } catch {} } }

  srv.kill('SIGKILL');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* 一時フォルダの後始末失敗は無視 */ }

  console.log(`\n✅ 静的サイトを書き出しました: ${OUT}`);
  console.log(`   求人ページ: ${n}件 ／ フィード: feed/kyujinbox.xml, feed/kyujinbox-sq.xml など`);
  console.log(`   このフォルダ(${path.basename(OUT)})を Cloudflare Pages にアップしてください。`);
  console.log(`   求人ボックスに登録するフィードURL例: ${SITE_URL}/feed/kyujinbox-sq.xml`);
  process.exit(0);
})().catch(e => { console.error('書き出し失敗:', e.message); process.exit(1); });
