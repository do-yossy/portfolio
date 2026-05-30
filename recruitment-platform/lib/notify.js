'use strict';

const { sendMail } = require('./mailer');

const FROM  = process.env.FROM_EMAIL || process.env.SMTP_USER || '';
const ADMIN = process.env.ADMIN_EMAIL || '';

/**
 * Send an operational notification to the admin email.
 * Called after automated tasks: scraping, posting, CSV import, XML generation.
 */
async function notify(message, _opts = {}) {
  if (!ADMIN || !FROM) {
    console.log('[notify] ADMIN_EMAIL or FROM_EMAIL not set — skipping email:', message);
    return [{ skipped: true }];
  }

  const subject = message.length > 60 ? message.slice(0, 57) + '...' : message;
  const html = `<pre style="font-family:monospace;white-space:pre-wrap">${escapeHtml(message)}</pre>`;

  try {
    await sendMail({ from: FROM, to: ADMIN, subject, text: message, html });
    return [{ ok: true }];
  } catch (e) {
    console.error('[notify] email failed:', e.message);
    return [{ ok: false, error: e.message }];
  }
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

module.exports = { notify };
