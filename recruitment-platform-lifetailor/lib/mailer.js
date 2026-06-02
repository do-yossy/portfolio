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
    const dataLines = rawMessage.split('\r\n');

    // Encode message for DATA command (dot-stuffing)
    const body = dataLines
      .map(l => (l === '.' ? '..' : l))
      .join('\r\n') + '\r\n.';

    let socket;
    let buf = '';
    const cmd = [];
    let step = 0;

    function send(line) {
      socket.write(line + '\r\n');
    }

    function next(data) {
      buf += data.toString();
      const lines = buf.split('\r\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!/^\d{3}[ -]/.test(line)) continue;
        const code = parseInt(line.slice(0, 3), 10);
        if (code >= 400) { socket.destroy(); reject(new Error(`SMTP error: ${line}`)); return; }
        if (line[3] === '-') continue; // multi-line, wait for last

        switch (step++) {
          case 0: send(`EHLO localhost`); break;
          case 1: send(`AUTH LOGIN`); break;
          case 2: send(encodeBase64(user)); break;
          case 3: send(encodeBase64(pass)); break;
          case 4: send(`MAIL FROM:<${from}>`); break;
          case 5: send(`RCPT TO:<${to}>`); break;
          case 6: send(`DATA`); break;
          case 7: send(body + '\r\n'); break;
          case 8: send(`QUIT`); break;
          case 9: socket.destroy(); resolve({ ok: true }); break;
        }
      }
    }

    if (useSSL) {
      socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {});
    } else {
      socket = net.connect({ host, port }, () => {});
    }
    socket.on('data', next);
    socket.on('error', reject);
    socket.setTimeout(15000, () => { socket.destroy(); reject(new Error('SMTP timeout')); });
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
  const siteName = process.env.SITE_NAME || '株式会社Life Tailor 採用サイト';
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
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return { skipped: true };
  const siteName = process.env.SITE_NAME || '株式会社Life Tailor 採用サイト';
  return sendMail({
    to:      adminEmail,
    subject: `【新規応募】${applicant.name}｜${jobTitle}`,
    text:
`新規応募がありました。

氏名:     ${applicant.name}
電話:     ${applicant.phone}
メール:   ${applicant.email}
応募求人: ${jobTitle}
媒体:     ${applicant.source_media || applicant.sourceMedia || 'direct'}
重複:     ${applicant.is_duplicate || applicant.isDuplicate ? 'あり' : 'なし'}

管理画面: ${process.env.SITE_URL || 'http://localhost:3000'}/admin/applicants
`,
    html:
`<h3>新規応募</h3>
<table cellpadding="6" style="border-collapse:collapse">
  <tr><td><b>氏名</b></td><td>${applicant.name}</td></tr>
  <tr><td><b>電話</b></td><td>${applicant.phone}</td></tr>
  <tr><td><b>メール</b></td><td>${applicant.email}</td></tr>
  <tr><td><b>応募求人</b></td><td>${jobTitle}</td></tr>
  <tr><td><b>媒体</b></td><td>${applicant.source_media || applicant.sourceMedia || 'direct'}</td></tr>
  <tr><td><b>重複</b></td><td>${applicant.is_duplicate || applicant.isDuplicate ? '⚠️ あり' : 'なし'}</td></tr>
</table>
<p><a href="${process.env.SITE_URL || 'http://localhost:3000'}/admin/applicants">管理画面で確認する</a></p>`,
  });
}

module.exports = { sendMail, sendApplicationThanks, sendNewApplicantAlert };
