const fs = require('fs');
const path = require('path');

const DIR = __dirname;

function mdToHtml(md) {
  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

    // Code blocks (before inline code)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
      `<pre><code>${code.trimEnd()}</code></pre>`)

    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')

    // Horizontal rule
    .replace(/^---+$/gm, '<hr>')

    // Headings
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')

    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')

    // Blockquote
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')

    // Tables
    .replace(/(\|.+\|\n)((?:\|[-:]+)+\|\n)((?:\|.+\|\n?)+)/g, (_, header, sep, body) => {
      const ths = header.trim().split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const trs = body.trim().split('\n').filter(Boolean).map(row => {
        const tds = row.split('|').filter(c => c.trim() !== undefined).slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    })

    // Unordered lists (process blocks)
    .replace(/(^[*\-] .+\n?)+/gm, block => {
      const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[*\-] /, '').trim()}</li>`).join('');
      return `<ul>${items}</ul>`;
    })

    // Ordered lists
    .replace(/(^\d+\. .+\n?)+/gm, block => {
      const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '').trim()}</li>`).join('');
      return `<ol>${items}</ol>`;
    })

    // Paragraphs (lines that aren't already wrapped in tags)
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|pre|table|blockquote|hr)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

const STYLE = `
  @page { margin: 18mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 32px 24px;
    line-height: 1.85;
    color: #1a1a1a;
    font-size: 11pt;
    background: #fff;
  }
  h1 {
    color: #fff;
    background: linear-gradient(135deg, #1e293b, #334155);
    padding: 20px 24px;
    border-radius: 10px;
    font-size: 18pt;
    margin: 0 -8px 32px;
    page-break-before: always;
    line-height: 1.4;
  }
  h1:first-of-type { page-break-before: avoid; }
  h2 {
    color: #1e293b;
    font-size: 14pt;
    border-left: 5px solid #6366f1;
    padding-left: 14px;
    margin: 36px 0 16px;
  }
  h3 {
    color: #334155;
    font-size: 12pt;
    margin: 24px 0 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
  }
  h4 {
    color: #475569;
    font-size: 11pt;
    margin: 16px 0 8px;
  }
  p { margin: 10px 0; }
  strong { color: #1e293b; }
  blockquote {
    background: #f0f4ff;
    border-left: 4px solid #6366f1;
    margin: 16px 0;
    padding: 14px 18px;
    border-radius: 0 8px 8px 0;
    font-size: 10.5pt;
    color: #334155;
  }
  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 16px 20px;
    border-radius: 8px;
    font-size: 9.5pt;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 14px 0;
    line-height: 1.6;
  }
  code {
    background: #e8edf4;
    color: #3730a3;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9.5pt;
    font-family: 'Consolas', 'Monaco', monospace;
  }
  pre code {
    background: none;
    color: inherit;
    padding: 0;
    font-size: inherit;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 16px 0;
    font-size: 10pt;
  }
  th {
    background: #1e293b;
    color: #fff;
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
  }
  td {
    border: 1px solid #e2e8f0;
    padding: 9px 12px;
  }
  tr:nth-child(even) td { background: #f8fafc; }
  ul, ol { padding-left: 24px; margin: 10px 0; }
  li { margin: 5px 0; }
  hr {
    border: none;
    border-top: 2px solid #e2e8f0;
    margin: 32px 0;
  }
  .badge {
    display: inline-block;
    background: #6366f1;
    color: #fff;
    padding: 4px 12px;
    border-radius: 99px;
    font-size: 9pt;
    font-weight: 700;
    margin-bottom: 20px;
  }
  @media print {
    body { padding: 0; font-size: 10.5pt; }
    h1 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    pre { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

const BUTTON_SCRIPT = `
<style>
  .print-btn {
    position: fixed; bottom: 24px; right: 24px;
    background: #6366f1; color: #fff;
    border: none; border-radius: 50px;
    padding: 12px 24px; font-size: 14px; font-weight: 700;
    cursor: pointer; box-shadow: 0 4px 20px rgba(99,102,241,0.4);
    transition: background 0.2s;
    z-index: 999;
  }
  .print-btn:hover { background: #4f46e5; }
  @media print { .print-btn { display: none; } }
</style>
<button class="print-btn" onclick="window.print()">🖨️ PDF保存 / 印刷</button>
`;

const mdFiles = [
  { file: '01_低単価_ChatGPTで諦めた自動化.md',   label: '無料コンテンツ①',  price: '無料' },
  { file: '02_中単価_完全手順マニュアル.md',       label: 'メインコンテンツ',  price: '29,800円' },
  { file: '03_高単価_顧客管理システム完成品.md',   label: '高単価コンテンツ',  price: '49,800円' },
  { file: '04_note無料記事_集客用.md',             label: '集客用note記事',   price: '無料' },
  { file: '05_販売ページ説明文.md',                label: '販売ページ説明文', price: '参考資料' },
  { file: '06_低単価A_Claudeテンプレート集.md',   label: '低単価コンテンツA', price: '1,980円' },
  { file: '07_低単価B_セットアップガイド.md',      label: '低単価コンテンツB', price: '1,980円' },
  { file: '08_低単価C_Flyioデプロイ手順書.md',    label: '低単価コンテンツC', price: '1,980円' },
];

let built = 0;
for (const { file, label, price } of mdFiles) {
  const mdPath = path.join(DIR, file);
  if (!fs.existsSync(mdPath)) { console.warn('SKIP:', file); continue; }
  const md = fs.readFileSync(mdPath, 'utf8');
  const body = mdToHtml(md);
  const htmlFile = file.replace('.md', '.html');
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${file.replace('.md','')}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="badge">${label}｜${price}</div>
${body}
${BUTTON_SCRIPT}
</body>
</html>`;
  fs.writeFileSync(path.join(DIR, htmlFile), html);
  console.log('✅ ', htmlFile);
  built++;
}

// Index page
const indexHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>コンテンツ一覧</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hiragino Sans','Meiryo',sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 40px 20px; }
  h1 { text-align: center; font-size: 24px; color: #fff; margin-bottom: 8px; }
  .sub { text-align: center; color: #64748b; margin-bottom: 40px; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; max-width: 1000px; margin: 0 auto; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px 24px; text-decoration: none; color: inherit; transition: all 0.15s; display: block; }
  .card:hover { border-color: #6366f1; transform: translateY(-2px); }
  .card-label { font-size: 11px; color: #6366f1; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  .card-title { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 8px; line-height: 1.4; }
  .card-price { font-size: 20px; font-weight: 700; color: #4ade80; }
  .card-price.free { color: #94a3b8; font-size: 14px; }
  .card-price.ref { color: #64748b; font-size: 13px; }
</style>
</head>
<body>
<h1>📄 コンテンツ一覧</h1>
<p class="sub">各カードをクリックするとHTMLで表示。ブラウザの印刷機能でPDF保存できます。</p>
<div class="grid">
${mdFiles.map(({ file, label, price }) => {
  const htmlFile = file.replace('.md', '.html');
  const title = file.replace(/^\d+_/, '').replace('.md', '').replace(/_/g, ' ');
  const priceClass = price === '無料' ? 'free' : price === '参考資料' ? 'ref' : '';
  return `  <a class="card" href="${htmlFile}">
    <div class="card-label">${label}</div>
    <div class="card-title">${title}</div>
    <div class="card-price ${priceClass}">${price}</div>
  </a>`;
}).join('\n')}
</div>
</body>
</html>`;

fs.writeFileSync(path.join(DIR, 'index.html'), indexHtml);
console.log('✅  index.html');
console.log(`\n完了: ${built}ファイル + index.html を生成しました`);
