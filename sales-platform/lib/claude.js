'use strict';
/**
 * Claude Messages API 連携（SDKなし・Node https）。
 * 案件(deal)から「提案文＋成果物」を生成する。
 * 必要な環境変数: ANTHROPIC_API_KEY（fly secrets set ANTHROPIC_API_KEY=...）
 * 任意: CLAUDE_MODEL（既定 claude-opus-4-8。コスト重視なら claude-haiku-4-5 等）
 */
const https = require('https');
const L = require('../logic');

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

// ── 問い合わせへの一次返信ドラフト（担当者がレビューして送る用）──
const REPLY_SYSTEM =
'あなたは大阪のWeb制作会社「株式会社Social Quality」の営業担当です。ホームページの問い合わせフォームに届いた見込み客へ、丁寧で具体的な「一次返信メールの本文」を作成します。\n' +
'構成：①お礼 ②要件の理解を示す ③ざっくりの進め方 ④概算（提示があれば「目安」として柔らかく。確定金額ではない旨を必ず添える）⑤次の一歩（無料相談・ヒアリング）の提案 ⑥実績URL(https://www.social-quality.com/)。\n' +
'強み：LP¥50,000〜の低価格・修正無制限・24時間以内返信・オンライン完結・大阪。\n' +
'制約：金額の断定・確約はしない（「概算」「目安」と明記）。誇大表現や事実でない実績は書かない。署名は付けない（システム側で付与）。出力は返信本文のみ（前置き・コードフェンス不要、です・ます調）。';

function draftReply(inquiry = {}, quote = null) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reject(new Error('ANTHROPIC_API_KEY が未設定です'));
    const lines = Object.entries(inquiry)
      .filter(([k, v]) => v && typeof v === 'string' && k !== '_hp')
      .map(([k, v]) => `${k}: ${v}`).join('\n');
    const q = quote && quote.total ? `概算の目安: ¥${(quote.total).toLocaleString()}（税別）` : '概算: 要ヒアリング';
    const payload = JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system: [{ type: 'text', text: REPLY_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `問い合わせ内容:\n${lines}\n\n${q}\n\n上記への一次返信メール本文を作成してください。` }]
    });
    const req = https.request({
      method: 'POST', hostname: 'api.anthropic.com', path: '/v1/messages',
      headers: {
        'content-type': 'application/json', 'x-api-key': apiKey,
        'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(payload)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('Claude API ' + res.statusCode + ': ' + d.slice(0, 200)));
        try {
          const j = JSON.parse(d);
          const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
          resolve(text);
        } catch (e) { reject(new Error('応答の解析に失敗: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── 取引メッセージへの返信ドラフト（ランサーズ/ココナラ/CW/LP 全媒体対応）──
const SRC_LABEL = { lancers: 'ランサーズ', coconala: 'ココナラ', crowdworks: 'クラウドワークス', cw: 'クラウドワークス', cwtech: 'CWテック', lp: 'ホームページ(メール)' };

function replyToMessage(deal = {}, clientMessage = '') {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reject(new Error('ANTHROPIC_API_KEY が未設定です'));
    const src = deal.source || 'lancers';
    const isPlatform = ['lancers', 'coconala', 'crowdworks', 'cw'].includes(src);
    const sys =
      'あなたはWeb制作会社「株式会社Social Quality」の営業担当です。クライアントから届いたメッセージへの返信文を作成します。\n' +
      `媒体：${SRC_LABEL[src] || src}。` +
      (isPlatform
        ? 'プラットフォームのメッセージ欄に貼る前提（件名・宛名・署名は不要）。規約遵守のため、外部連絡先の交換や直接取引を促す内容は絶対に書かない。\n'
        : 'メール本文として使う前提（署名は不要・システム側で付与）。\n') +
      '構成：相手のメッセージに的確に回答→必要な確認事項→次の一歩の提案。確定金額の断定はしない（「概算」「目安」と明記）。です・ます調。出力は返信本文のみ（前置き・コードフェンス不要）。';
    const ctx = `案件：${deal.title || ''}（種別:${deal.type || ''} / 金額:${deal.amount || 0}円）\n` +
      (deal.notes ? `メモ：${String(deal.notes).slice(0, 400)}\n` : '') +
      (deal.raw ? `案件本文（抜粋）：${String(deal.raw).slice(0, 800)}\n` : '');
    const payload = JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `${ctx}\nクライアントからのメッセージ:\n${clientMessage}\n\n返信文を作成してください。` }]
    });
    const req = https.request({
      method: 'POST', hostname: 'api.anthropic.com', path: '/v1/messages',
      headers: {
        'content-type': 'application/json', 'x-api-key': apiKey,
        'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(payload)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('Claude API ' + res.statusCode + ': ' + d.slice(0, 200)));
        try {
          const j = JSON.parse(d);
          resolve((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim());
        } catch (e) { reject(new Error('応答の解析に失敗: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { generate, draftReply, replyToMessage, MODEL };
