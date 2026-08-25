/**
 * Phase 4 ページ検証
 * app/*.html と index.html の静的な健全性を確認する。
 * ・参照しているファイルが実在するか（リンク切れ検出）
 * ・importしているモジュール・関数が実在するか
 * ・HTMLの入れ子が閉じているか
 * ・スマホ対応（viewport）とPWA/OGPの有無
 *
 * 実行：node AI収益化/lifechoice/tests/pages-phase4.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0; const fails = [];
const ok = (n, v) => { if (v) pass++; else { fail++; fails.push(n); } };

const PAGES = [
  'index.html',
  'app/buy-check.html', 'app/unnecessary-buy.html', 'app/now-what.html',
  'app/today-deals.html', 'app/solo-map.html', 'app/free-items.html'
];

console.log('═══ Phase 4 ページ検証 ═══\n');

for (const rel of PAGES) {
  const file = path.join(ROOT, rel);
  ok(rel + ' が存在する', fs.existsSync(file));
  if (!fs.existsSync(file)) continue;
  const s = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  const name = rel.padEnd(26);

  // 参照ファイルの実在（リンク切れ検出）
  const refs = [...s.matchAll(/(?:href|src)="(\.\.?\/[^"#?]+)"/g)].map(m => m[1]);
  const importRefs = [...s.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
  const missing = [...new Set([...refs, ...importRefs])]
    .filter(r => r.startsWith('.'))
    .filter(r => !fs.existsSync(path.resolve(dir, r)));
  ok(name + ' 参照切れなし' + (missing.length ? ' → ' + missing.join(', ') : ''), missing.length === 0);

  // import している関数が実際にエクスポートされているか
  const imports = [...s.matchAll(/import\s+\{([^}]+)\}\s+from\s+'([^']+)'/g)];
  let badImport = [];
  for (const [, names, mod] of imports) {
    const modPath = path.resolve(dir, mod);
    if (!fs.existsSync(modPath)) continue;
    const src = fs.readFileSync(modPath, 'utf8');
    names.split(',').map(x => x.trim()).forEach(fn => {
      // $ など正規表現の特殊文字を含む名前があるためエスケープする
      const safe = fn.replace(/[.*+?^${}()|[\]\\]/g, m => '\\' + m);
      const re = new RegExp('export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+' + safe + '(?![A-Za-z0-9_])');
      if (!re.test(src) && !src.includes('export { ' + fn) && !src.includes(fn + ',')) {
        badImport.push(fn + '←' + mod);
      }
    });
  }
  ok(name + ' import先が実在' + (badImport.length ? ' → ' + badImport.join(', ') : ''), badImport.length === 0);

  // タグの対応
  const open = (s.match(/<div/g) || []).length, close = (s.match(/<\/div>/g) || []).length;
  ok(name + ' divの開閉が一致 (' + open + '/' + close + ')', open === close);

  // 必須メタ
  ok(name + ' viewport あり', s.includes('name="viewport"'));
  ok(name + ' OGP あり', s.includes('og:title'));
  ok(name + ' theme-color あり', s.includes('theme-color'));
  ok(name + ' 共通CSSを読む', s.includes('styles/tokens.css'));
  ok(name + ' モジュール読み込み', s.includes('type="module"'));

  // インラインデータが残っていないか（data層への移動が完了しているか）
  ok(name + ' データ直書きなし', !/var (ITEMS|DATA|DEALS|P)=\[/.test(s));
}

// 架空データを持つ機能は DEMO 表示が必須（厳守事項11）
console.log('');
['app/today-deals.html', 'app/free-items.html'].forEach(rel => {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  ok(rel + ' にDEMOバナー', s.includes('DemoBanner'));
  ok(rel + ' にカード単位のDEMO印', s.includes('isDemo'));
});
['app/buy-check.html', 'app/now-what.html', 'app/solo-map.html', 'app/unnecessary-buy.html'].forEach(rel => {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  ok(rel + ' は実データなのでDEMOバナーなし', !s.includes('DemoBanner'));
});

// 既存 demo/ が無傷か（厳守事項13）
const demoDir = path.join(ROOT, '..', 'demo');
ok('既存 demo/ が残っている', fs.existsSync(demoDir) && fs.readdirSync(demoDir).filter(f => f.endsWith('.html')).length === 7);

console.log('═'.repeat(46));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('  ✓ 全ページが正しく構成されています');
}
