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

// 社内向け：お問い合わせ内容の転送メール（LPフォーム→/api/contact 受信時）。
//   宛先は INQUIRY_TO_EMAIL（未設定なら sq-support@social-quality.com）。Resend 未設定なら {skipped:true}。
function sendInquiryAlert({ inquiry = {}, dealId = '' } = {}) {
  const to = process.env.INQUIRY_TO_EMAIL || 'sq-support@social-quality.com';
  const name = inquiry.お名前 || inquiry.会社名 || '（未入力）';
  const type = inquiry.依頼内容 || inquiry.type || '';
  const lines = Object.entries({
    お名前: inquiry.お名前, 会社名: inquiry.会社名, メール: inquiry.メール || inquiry.email,
    業種: inquiry.業種, 依頼内容: type, 目的: inquiry.目的,
    予算: inquiry.予算, 納期: inquiry.納期, 必要機能: inquiry.必要機能, 素材: inquiry.素材,
    参考サイト: inquiry.参考サイト, ご相談内容: inquiry.ご相談内容 || inquiry.message
  }).filter(([, v]) => v).map(([k, v]) => `【${k}】${v}`).join('\n');
  const text =
`ホームページのお問い合わせフォームより新規のお問い合わせが届きました。

${lines}

──────────────────────
管制塔で確認・返信：https://sq-sales-tanto20.fly.dev/admin${dealId ? `（案件ID: ${dealId}）` : ''}
──────────────────────`;
  return send({ to, subject: `【お問い合わせ】${type || 'ご相談'} ${name}`, text });
}

// 自分への売上アラート（Brain/Tips/note等でコンテンツが売れたとき）。
//   宛先は NOTIFY_EMAIL（無ければ MAIL_REPLY_TO）。Resend 未設定なら {skipped:true}。
function sendSaleAlert({ product = 'コンテンツ', amount = 0, platform = '', buyer = '', body = '' } = {}) {
  const to = process.env.NOTIFY_EMAIL || process.env.MAIL_REPLY_TO;
  if (!to) return Promise.resolve({ skipped: true, reason: 'NOTIFY_EMAIL/MAIL_REPLY_TO 未設定' });
  const yen = Number(amount || 0).toLocaleString();
  const text =
`🎉 コンテンツが売れました！

プラットフォーム：${platform || '—'}
商品：${product}
金額：¥${yen}
購入者：${buyer || '—'}

管制塔で確認：https://sq-sales-tanto20.fly.dev/admin
${body ? `\n──── 元メール抜粋 ────\n${String(body).slice(0, 800)}` : ''}`;
  return send({ to, subject: `🎉【売上】${platform || 'コンテンツ'} ¥${yen}：${product}`, text });
}

module.exports = { send, sendAck, sendInquiryAlert, sendSaleAlert };
