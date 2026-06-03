'use strict';

// ─────────────────────────────────────────────────────────────
// 依存ライブラリなしの Google Sheets API v4 クライアント
//   サービスアカウントの JWT 認証（RS256）で access_token を取得し、
//   fetch で Sheets API を直接呼び出す。
//
// 必要な環境変数:
//   GOOGLE_SERVICE_ACCOUNT_JSON … サービスアカウント鍵(JSON)。以下のいずれか:
//        - JSON文字列そのまま
//        - base64エンコードしたJSON
//        - JSONファイルへのパス
//   GOOGLE_SHEET_ID            … 管理用スプレッドシートのID（URLの /d/〜/edit の間）
//
// サービスアカウントのメールアドレスに対象スプレッドシートを「編集者」で共有しておくこと。
// ─────────────────────────────────────────────────────────────

const crypto = require('crypto');
const fs = require('fs');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let _cachedCreds = null;     // { client_email, private_key }
let _cachedToken = null;     // { token, exp }

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// サービスアカウント鍵を env から解決（JSON文字列 / base64 / ファイルパス）
function loadCredentials() {
  if (_cachedCreds) return _cachedCreds;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON が未設定です');
  let text = raw.trim();
  let json;
  if (text.startsWith('{')) {
    json = JSON.parse(text);
  } else if (fs.existsSync(text)) {
    json = JSON.parse(fs.readFileSync(text, 'utf8'));
  } else {
    // base64 とみなす
    try { json = JSON.parse(Buffer.from(text, 'base64').toString('utf8')); }
    catch (e) { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON の形式が不正です（JSON/base64/パスのいずれか）'); }
  }
  if (!json.client_email || !json.private_key) {
    throw new Error('サービスアカウント鍵に client_email / private_key がありません');
  }
  _cachedCreds = { client_email: json.client_email, private_key: json.private_key };
  return _cachedCreds;
}

// JWT を生成して access_token を取得（5分マージンでキャッシュ）
async function getAccessToken() {
  if (_cachedToken && _cachedToken.exp - 300 > Math.floor(Date.now() / 1000)) {
    return _cachedToken.token;
  }
  const { client_email, private_key } = loadCredentials();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp };
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = b64url(signer.sign(private_key));
  const jwt = signingInput + '.' + signature;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error('アクセストークン取得に失敗: ' + (data.error_description || data.error || res.status));
  }
  _cachedToken = { token: data.access_token, exp };
  return data.access_token;
}

async function api(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const res = await fetch(SHEETS_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Sheets API エラー (${res.status}): ${data.error?.message || text || ''}`);
  }
  return data;
}

function sheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID が未設定です');
  return id;
}

function isConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SHEET_ID);
}

function sheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID || ''}/edit`;
}

// スプレッドシートのメタ（タブ一覧）を取得
async function getMeta() {
  return api(`/${sheetId()}?fields=sheets(properties(sheetId,title))`);
}

// 指定タイトルのタブが無ければ作成。{sheetId, title} を返す。
async function ensureTab(title) {
  const meta = await getMeta();
  const found = (meta.sheets || []).find(s => s.properties.title === title);
  if (found) return found.properties;
  const resp = await api(`/${sheetId()}:batchUpdate`, {
    method: 'POST',
    body: { requests: [{ addSheet: { properties: { title } } }] },
  });
  return resp.replies[0].addSheet.properties;
}

// A1表記の列文字（0→A）
function colLetter(n) {
  let s = ''; n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// タブ全体の値を読む（ヘッダ込みの2次元配列）
async function readValues(title) {
  const range = encodeURIComponent(`${title}!A1:Z100000`);
  const data = await api(`/${sheetId()}/values/${range}`);
  return data.values || [];
}

// タブ全体をクリアして values（2次元配列）を書き込む
async function writeValues(title, values) {
  const lastCol = colLetter(Math.max(0, (values[0]?.length || 1) - 1));
  const range = `${title}!A1:${lastCol}${Math.max(values.length, 1)}`;
  // 既存をクリアしてから上書き
  await api(`/${sheetId()}/values/${encodeURIComponent(`${title}!A1:Z100000`)}:clear`, { method: 'POST' });
  await api(`/${sheetId()}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: { range, majorDimension: 'ROWS', values },
  });
}

// 末尾に行を追記（appendはタブ内の表を自動検出して下に足す）
async function appendValues(title, values) {
  if (!values.length) return { updates: { updatedRows: 0 } };
  const range = `${title}!A1`;
  return api(`/${sheetId()}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: { range, majorDimension: 'ROWS', values },
  });
}

// 指定タブの列にプルダウン（データ入力規則）を設定。
//   validations: [{ colIndex, list, startRow=1 }]  startRowは0始まり(=ヘッダ除外で1)
async function setDropdowns(tabSheetId, validations, endRow = 5000) {
  const requests = validations.map(v => ({
    setDataValidation: {
      range: {
        sheetId: tabSheetId,
        startRowIndex: v.startRow != null ? v.startRow : 1,
        endRowIndex: endRow,
        startColumnIndex: v.colIndex,
        endColumnIndex: v.colIndex + 1,
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: v.list.map(s => ({ userEnteredValue: String(s) })),
        },
        showCustomUi: true,
        strict: false,
      },
    },
  }));
  if (!requests.length) return;
  await api(`/${sheetId()}:batchUpdate`, { method: 'POST', body: { requests } });
}

// ヘッダ行の書式（太字・背景色）を設定
async function styleHeader(tabSheetId, numCols) {
  await api(`/${sheetId()}:batchUpdate`, {
    method: 'POST',
    body: {
      requests: [{
        repeatCell: {
          range: { sheetId: tabSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.31, green: 0.275, blue: 0.898 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      }, {
        updateSheetProperties: {
          properties: { sheetId: tabSheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      }],
    },
  });
}

module.exports = {
  isConfigured, sheetUrl, getAccessToken,
  getMeta, ensureTab, readValues, writeValues, appendValues,
  setDropdowns, styleHeader, colLetter,
};
