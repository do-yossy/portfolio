'use strict';
/**
 * メール送信（Resend HTTP API・SDKなし／claude.js と同じ raw https 方式）。
 * 設定（任意）: 未設定なら送信せず {skipped:true} を返す＝既存フローは壊さない。
 *   fly secrets set RESEND_API_KEY="re_..." \
 *                   MAIL_FROM="株式会社Social Quality <info@social-quality.com>" \
 *                   MAIL_REPLY_TO="social.recruiting.information@gmail.com"
 * ※ MAIL_FROM のドメインは Resend で認証(DNS)済みである必要があります。
 */
const https = require('https');

function send({ to, subject, text }) {
  return new Promise((resolve) => {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!key || !from || !to) return resolve({ skipped: true, reason: 'mail not configured' });
    const body = JSON.stringify({
      from, to: [to], subject, text,
      ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {})
    });
    const req = https.request({
      method: 'POST', hostname: 'api.resend.com', path: '/emails',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ ok: res.statusCode < 300, status: res.statusCode, body: d.slice(0, 200) }));
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(body); req.end();
  });
}

// 顧客への自動受付メール（安全なテンプレ。AIの見積りは含めない＝誤提示を防ぐ）
function sendAck({ to, inquiry = {} }) {
  const name = inquiry.お名前 || inquiry.会社名 || 'お客';
  const type = inquiry.依頼内容 || inquiry.type || '';
  const msg = inquiry.ご相談内容 || inquiry.message || '';
  const text =
`${name} 様

この度は株式会社Social Qualityへお問い合わせいただき、誠にありがとうございます。
下記の内容で承りました。担当より24時間以内にご連絡いたします。

▼お問い合わせ内容${type ? `\nご依頼内容：${type}` : ''}${msg ? `\nご相談内容：${msg}` : ''}

今しばらくお待ちくださいませ。

──────────────────────
株式会社Social Quality
大阪府大阪市浪速区大国2丁目5-11-9F
https://www.social-quality.com/
──────────────────────
※本メールは自動送信です。お心当たりがない場合は破棄してください。`;
  return send({ to, subject: '【株式会社Social Quality】お問い合わせありがとうございます', text });
}

module.exports = { send, sendAck };
