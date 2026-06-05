'use strict';
/**
 * Google スプレッドシート連携（サービスアカウント方式）。
 * シートを SA（例: calllist@list-498317.iam.gserviceaccount.com）に「編集者」で共有し、
 * Sheets API で読み書きする。ネットワークのある環境（デプロイ先）で動作。
 *
 * 必要な環境変数:
 *   SHEET_ID                      … 対象スプレッドシートのID
 *   GOOGLE_SERVICE_ACCOUNT_JSON   … サービスアカウント鍵JSON（fly secrets で設定。.env/Git に貼らない）
 */
const { google } = require('googleapis');

const SHEET_ID = process.env.SHEET_ID || '';

function client() {
  let creds;
  try { creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}'); }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON のJSONが不正です'); }
  if (!creds.client_email || !creds.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON が未設定です');
  const auth = new google.auth.JWT(
    creds.client_email, null, creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return google.sheets({ version: 'v4', auth });
}

async function getRows(range) {
  const r = await client().spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return r.data.values || [];
}
async function updateRange(range, values) {
  await client().spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range, valueInputOption: 'RAW', requestBody: { values }
  });
}
async function appendRows(range, values) {
  await client().spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range, valueInputOption: 'RAW', requestBody: { values }
  });
}

module.exports = { getRows, updateRange, appendRows, SHEET_ID };
