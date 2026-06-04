'use strict';

/**
 * Minimal SMTP mailer using Node.js built-in net/tls modules.
 * No npm packages required.
 *
 * Env vars:
 *   SMTP_HOST     - SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT     - 465 (SSL) or 587 (STARTTLS), default 587
 *   SMTP_USER     - SMTP login username / email address
 *   SMTP_PASS     - SMTP login password or app password
 *   FROM_EMAIL    - Sender address (defaults to SMTP_USER)
 *   ADMIN_EMAIL   - Admin/recruiter notification address
 */

const net  = require('net');
const tls  = require('tls');

function encodeBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function buildMime(from, to, subject, text, html) {
  const boundary = `boundary_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encodeBase64(subject)}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodeBase64(text),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodeBase64(html),
    ``,
    `--${boundary}--`,
  ];
  return lines.join('\r\n');
}

function smtpSend(host, port, useSSL, user, pass, from, to, rawMessage) {
  return new Promise((resolve, reject) => {
    const dotStuffed = rawMessage.split('\r\n')
      .map(l => (l === '.' ? '..' : l))
      .join('\r\n') + '\r\n.';

    let socket;
    let buf = '';
    // States: banner → ehlo → [starttls → starttls_ok → ehlo2 →] auth → user → pass → mailfrom → rcpt → data → body → quit → done
    const STATES = useSSL
      ? ['banner', 'ehlo', 'auth', 'user', 'pass', 'mailfrom', 'rcpt', 'data', 'body', 'quit', 'done']
      : ['banner', 'ehlo', 'starttls', 'starttls_ok', 'ehlo2', 'auth', 'user', 'pass', 'mailfrom', 'rcpt', 'data', 'body', 'quit', 'done'];
    let si = 0;

    function send(line) { socket.write(line + '\r\n'); }

    function advance() {
      si++;
      const state = STATES[si];
      switch (state) {
        case 'ehlo':
        case 'ehlo2':    send('EHLO localhost'); break;
        case 'starttls': send('STARTTLS'); break;
        case 'starttls_ok': {
          // upgrade to TLS
          si++; // skip ehlo2; next advance() will land on auth
          const plain = socket;
          plain.removeAllListeners('data');
          socket = tls.connect({ socket: plain, host, rejectUnauthorized: false }, () => {
            socket.on('data', onData);
            socket.on('error', reject);
            socket.setTimeout(20000, () => { socket.destroy(); reject(new Error('SMTP timeout')); });
            send('EHLO localhost');
          });
          return;
        }
        case 'auth':     send('AUTH LOGIN'); break;
        case 'user':     send(encodeBase64(user)); break;
        case 'pass':     send(encodeBase64(pass)); break;
        case 'mailfrom': send(`MAIL FROM:<${from}>`); break;
        case 'rcpt':     send(`RCPT TO:<${to}>`); break;
        case 'data':     send('DATA'); break;
        case 'body':     send(dotStuffed + '\r\n'); break;
        case 'quit':     send('QUIT'); break;
        case 'done':     socket.destroy(); resolve({ ok: true }); break;
      }
    }

    function onData(data) {
      buf += data.toString();
      const lines = buf.split('\r\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!/^\d{3}[ -]/.test(line)) continue;
        const code = parseInt(line.slice(0, 3), 10);
        if (code >= 400) { socket.destroy(); reject(new Error(`SMTP error: ${line}`)); return; }
        if (line[3] === '-') continue; // multi-line, wait for last
        advance();
      }
    }

    if (useSSL) {
      socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {});
    } else {
      socket = net.connect({ host, port }, () => {});
    }
    socket.on('data', onData);
    socket.on('error', reject);
    socket.setTimeout(20000, () => { socket.destroy(); reject(new Error('SMTP timeout')); });
  });
}

async function sendMail({ to, subject, text, html }) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.FROM_EMAIL || user;

  if (!host || !user || !pass) {
    console.warn('[mailer] SMTP not configured — skipping email to', to);
    return { skipped: true };
  }

  const useSSL = port === 465;
  const mime   = buildMime(from, to, subject, text, html || `<pre>${text}</pre>`);

  try {
    await smtpSend(host, port, useSSL, user, pass, from, to, mime);
    return { ok: true };
  } catch (e) {
    console.error('[mailer] send failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Template emails ──────────────────────────────────────────

async function sendApplicationThanks(applicant, jobTitle) {
  const siteName = process.env.SITE_NAME || '採用サイト';
  return sendMail({
    to:      applicant.email,
    subject: `【${siteName}】ご応募ありがとうございます`,
    text:
`${applicant.name} 様

この度は「${jobTitle}」へのご応募ありがとうございます。

内容を確認の上、担当者よりご連絡させていただきます。
今しばらくお待ちください。

─────────────────────
${siteName}
${process.env.SITE_URL || ''}
`,
    html:
`<p>${applicant.name} 様</p>
<p>この度は「<strong>${jobTitle}</strong>」へのご応募ありがとうございます。</p>
<p>内容を確認の上、担当者よりご連絡させていただきます。<br>今しばらくお待ちください。</p>
<hr>
<small>${siteName} | ${process.env.SITE_URL || ''}</small>`,
  });
}

async function sendNewApplicantAlert(applicant, jobTitle) {
  // Googleしごと検索からの応募は専用アドレスにも通知
  const isGoogle = (applicant.media || applicant.source_media || '').includes('google')
                || (applicant.sourceMedia || '').includes('google')
                || (applicant.media === 'google');
  const googleAlertEmail = process.env.GOOGLE_JOBS_ALERT_EMAIL || process.env.ADMIN_EMAIL;
  const adminEmail       = process.env.ADMIN_EMAIL;

  // 送信先リスト（重複除去）
  const targets = [...new Set([
    adminEmail,
    isGoogle ? googleAlertEmail : null,
  ].filter(Boolean))];
  if (!targets.length) return { skipped: true };

  const siteName    = process.env.SITE_NAME || '採用サイト';
  const mediaLabel  = applicant.media === 'google' ? 'Googleしごと検索'
                    : applicant.media === 'indeed'    ? 'Indeed'
                    : applicant.media === 'kyujinbox' ? '求人ボックス'
                    : applicant.media === 'stanby'    ? 'スタンバイ'
                    : applicant.media === 'engage'    ? 'engage'
                    : (applicant.source_media || applicant.sourceMedia || 'direct');
  const subjectPrefix = isGoogle ? '【Googleしごと検索 新規応募】' : '【新規応募】';
  const adminUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/admin/calls`;

  const results = await Promise.allSettled(targets.map(to => sendMail({
    to,
    subject: `${subjectPrefix}${applicant.name}｜${jobTitle}`,
    text:
`${isGoogle ? '★ Googleしごと検索から新規応募がありました。\n\n' : '新規応募がありました。\n\n'}氏名:     ${applicant.name}
電話:     ${applicant.phone}
メール:   ${applicant.email}
応募求人: ${jobTitle}
媒体:     ${mediaLabel}
重複:     ${applicant.is_duplicate || applicant.isDuplicate ? 'あり' : 'なし'}

管理画面: ${adminUrl}
`,
    html:
`<h3>${isGoogle ? '★ Googleしごと検索 新規応募' : '新規応募'}</h3>
${isGoogle ? '<p style="background:#e8f5e9;padding:10px;border-radius:6px;color:#2e7d32">Googleしごと検索経由の応募です。</p>' : ''}
<table cellpadding="6" style="border-collapse:collapse">
  <tr><td><b>氏名</b></td><td>${applicant.name}</td></tr>
  <tr><td><b>電話</b></td><td>${applicant.phone}</td></tr>
  <tr><td><b>メール</b></td><td>${applicant.email}</td></tr>
  <tr><td><b>応募求人</b></td><td>${jobTitle}</td></tr>
  <tr><td><b>媒体</b></td><td>${mediaLabel}</td></tr>
  <tr><td><b>重複</b></td><td>${applicant.is_duplicate || applicant.isDuplicate ? '⚠️ あり' : 'なし'}</td></tr>
</table>
<p><a href="${adminUrl}">架電リストで確認する</a></p>`,
  })));
  return results[0].value || results[0].reason;
}

module.exports = { sendMail, sendApplicationThanks, sendNewApplicantAlert };
