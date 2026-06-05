'use strict';
/**
 * Claude Messages API 連携（SDKなし・Node https）。
 * 案件(deal)から「提案文＋成果物」を生成する。
 * 必要な環境変数: ANTHROPIC_API_KEY（fly secrets set ANTHROPIC_API_KEY=...）
 * 任意: CLAUDE_MODEL（既定 claude-opus-4-8。コスト重視なら claude-haiku-4-5 等）
 */
const https = require('https');
const L = require('./logic');

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';

const SYSTEM =
'あなたはWeb制作・ライティング事業の営業担当です。クラウドソーシング案件に対し、応募用の「提案文」と添付用の「成果物」を作ります。\n' +
'自社：LP/コーポレート/EC/業務ツール/スマホアプリ/AI活用ツール/SEOライティングに対応。修正無制限・短納期・オンライン完結。実績ポートフォリオ: https://do-yossy.github.io/portfolio/\n' +
'\n' +
'案件に指定（納品方法・文字数・文体・指定キーワード・構成）があれば必ず従ってください。構成やKWが「別途共有」の場合は、応募文に「構成をいただければ即着手します」と添え、見本として代表的な構成で成果物を作ります。\n' +
'\n' +
'出力は次のJSONのみ（前後に文章やコードフェンスを付けない）：\n' +
'{"proposal": "応募文（です・ます調。冒頭で案件内容に触れ対応可能と明言。具体提案を2〜3点。料金/納期感。強み=修正無制限・短納期・オンライン完結。実績URLを含める）", ' +
'"deliverable_type": "記事|デモ|モックアップ|サンプル", ' +
'"deliverable": "添付用の成果物本文。ライティング案件なら『です・ます調のサンプル記事（見出し付き・800〜1200字・指定があれば文字数/文体/KWに準拠）』。Web/ツール/AI案件なら『最適なデモの紹介＋簡単な構成案/ワイヤー説明』。"}';

function generate(deal) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reject(new Error('ANTHROPIC_API_KEY が未設定です（fly secrets set で設定）'));

    const jobText = (deal.raw && deal.raw.trim())
      || `${deal.title}（種別:${deal.type} / 予算:${deal.amount}円 / 媒体:${deal.source}）`;

    const payload = JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `案件:\n${jobText}\n\n参考（最も近い自社デモURL）: ${L.demoUrl(deal.type)}` }]
    });

    const req = https.request({
      method: 'POST', hostname: 'api.anthropic.com', path: '/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-length': Buffer.byteLength(payload)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('Claude API ' + res.statusCode + ': ' + d.slice(0, 200)));
        try {
          const j = JSON.parse(d);
          const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
          const mm = text.match(/\{[\s\S]*\}/);
          const out = JSON.parse(mm[0]);
          out.demo_url = L.demoUrl(deal.type);
          resolve(out);
        } catch (e) { reject(new Error('応答の解析に失敗: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { generate, MODEL };
