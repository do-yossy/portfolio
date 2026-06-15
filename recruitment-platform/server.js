'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');

// .envファイルを読み込む（dotenvなし）
// process.cwd()/.env を優先（別ディレクトリから起動する場合）、なければ __dirname/.env
(function loadEnv() {
  const envFile = fs.existsSync(path.join(process.cwd(), '.env'))
    ? path.join(process.cwd(), '.env')
    : path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { Jobs, Applicants, Applications, Logs, Analytics, Ops, MediaPosts } = require('./db-factory');
const { COMPANIES: OPS_COMPANIES, MEDIA: OPS_MEDIA, CALL_STATUSES } = require('./db');
const { normalizePhone, normalizeEmail, isNameSimilar } = require('./normalize');
const { notify } = require('./lib/notify');
const { requireAuth, login, destroySession, sessionCookie, parseCookies } = require('./lib/auth');
const { sendApplicationThanks, sendNewApplicantAlert } = require('./lib/mailer');
const { buildXlsx, parseXlsx, parseXlsxSheets } = require('./lib/xlsx');
const { smartImport } = require('./lib/smart-import');
const gsheets = require('./lib/gsheets');
const { pushToSheets, pullFromSheets, initRecruitmentSheets } = require('./lib/sheets-sync');
const T = require('./templates');
const { privacyPolicyPage } = T;

const PORT     = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');
// playwright が import できる Python を自動検出して使う。
// Windows で複数 Python（Microsoft Store 版など）が混在していても、
// 実際に playwright が入っている実行ファイルを選ぶ。
// PYTHON_PATH(.env) を指定すれば最優先で使用。
const PYTHON_CMD = (function detectPython() {
  const { spawnSync } = require('child_process');
  const candidates = [];
  if ((process.env.PYTHON_PATH || '').trim()) candidates.push(process.env.PYTHON_PATH.trim());
  if ((process.env.PYTHON_CMD  || '').trim()) candidates.push(process.env.PYTHON_CMD.trim());
  if (process.platform === 'win32') {
    candidates.push('python', 'py');
    const la = process.env.LOCALAPPDATA || '';
    if (la) candidates.push(path.join(la, 'Python', 'bin', 'python.exe'));
  } else {
    candidates.push('python3', 'python');
  }
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['-c', 'import playwright'], { timeout: 10000, windowsHide: true });
      if (r.status === 0) { console.log(`[python] playwright検出: ${c}`); return c; }
    } catch (_) {}
  }
  const fallback = candidates[0] || (process.platform === 'win32' ? 'python' : 'python3');
  console.log(`[python] playwright入りPythonが見つからず。フォールバック: ${fallback}`);
  return fallback;
})();

// アセットのバージョン（admin.js / styles.css の更新時刻から算出）。
// HTML 内の <script>/<link> に ?v=... として付与し、デプロイ後に
// ブラウザが古いキャッシュを使い続ける問題を防ぐ。
function computeAssetVersion() {
  try {
    const a = fs.statSync(path.join(PUBLIC_DIR, 'admin.js')).mtimeMs;
    const c = fs.statSync(path.join(PUBLIC_DIR, 'styles.css')).mtimeMs;
    return String(Math.floor(Math.max(a, c)));
  } catch { return String(Date.now()); }
}
process.env.ASSET_VERSION = computeAssetVersion();

// ── Utilities ──────────────────────────────────────────────

function send(res, status, body, ct = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': ct });
  res.end(body);
}
function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), 'application/json');
}
function sendError(res, status, msg) {
  sendJSON(res, status, { error: msg });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseJSON(req) {
  const buf = await readBody(req);
  try { return JSON.parse(buf.toString()); } catch { return {}; }
}

// Simple multipart parser (extract first file's text content)
function parseMultipart(buf, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  let pos = 0;
  const parts = [];
  while (pos < buf.length) {
    const start = buf.indexOf(boundaryBuf, pos);
    if (start === -1) break;
    pos = start + boundaryBuf.length;
    if (buf[pos] === 0x2D && buf[pos+1] === 0x2D) break; // --
    pos += 2; // skip \r\n
    // Find header end
    const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;
    const header = buf.slice(pos, headerEnd).toString();
    pos = headerEnd + 4;
    const nextBoundary = buf.indexOf(boundaryBuf, pos);
    const content = nextBoundary !== -1 ? buf.slice(pos, nextBoundary - 2) : buf.slice(pos);
    parts.push({ header, content });
    pos = nextBoundary !== -1 ? nextBoundary : buf.length;
  }
  return parts;
}

// Parse CSV text into array of objects（RFC-4180準拠: 引用フィールド内の改行・カンマ・""エスケープに対応）
function parseCSV(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records = [];
  let field = '';
  let row = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // エスケープされた引用符
        else inQ = false;
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); records.push(row); field = ''; row = []; }
      else field += ch;
    }
  }
  // 末尾フィールド/行
  if (field.length || row.length) { row.push(field); records.push(row); }

  // 空行（全フィールド空）を除去
  const cleaned = records.filter(r => r.some(c => c.trim() !== ''));
  if (cleaned.length < 2) return [];

  const headers = cleaned[0].map(h => h.trim().replace(/^"(.*)"$/, '$1').trim());
  return cleaned.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] != null ? r[i].trim() : ''); });
    return obj;
  });
}

// Map CSV columns to applicant fields (flexible column names)
function mapCSVRow(row) {
  const col = (keys) => {
    for (const k of keys) {
      const v = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()];
      if (v && v.trim()) return v.trim();
    }
    // 完全一致しない場合、列名にキーを含む列を探す（例: 「架電回数カデンカイスウ」「年齢ネンレイ」等のふりがな付きヘッダ）
    for (const k of keys) {
      if (!/[ぁ-んァ-ヶ一-龯]/.test(k)) continue; // 日本語キーのみ部分一致対象
      for (const rk of Object.keys(row)) {
        if (rk.includes(k) && row[rk] && String(row[rk]).trim()) return String(row[rk]).trim();
      }
    }
    return '';
  };

  // 名前から括弧内のふりがなを除去: "中谷 吏温（なかたに りおん）" → "中谷 吏温"
  const rawName = col(['氏名','name','名前','お名前','姓名']);
  const cleanName = rawName.replace(/[（(][^）)]*[）)]/g, '').trim();

  // 電話番号を正規化: "80 1469 8497" → "080-1469-8497"
  // Indeed形式の '+81 90...' も処理
  let rawPhone = col(['電話番号','phone','tel','電話','携帯']);
  rawPhone = rawPhone.replace(/^'+/, '').replace(/[\s\-ー−]/g, '');
  if (rawPhone.startsWith('+81')) rawPhone = '0' + rawPhone.slice(3);
  else if (rawPhone.startsWith('810')) rawPhone = '0' + rawPhone.slice(3);
  if (rawPhone && /^[789]/.test(rawPhone)) rawPhone = '0' + rawPhone;
  const phone = rawPhone.replace(/^(\d{2,3})(\d{4})(\d{4})$/, '$1-$2-$3');

  // 応募日: "3月1日" / "2026-06-02" / "2026/06/02" / Excelシリアル値(45991.6 等)
  let appliedAt = col(['応募日','applied_at','応募日時','日付']);
  const m = appliedAt.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (/^\d{5}(\.\d+)?$/.test(appliedAt)) {
    // Excelシリアル日付（1899-12-30 起点）→ YYYY-MM-DD
    const serial = parseFloat(appliedAt);
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400) * 1000);
    appliedAt = dt.toISOString().slice(0, 10);
  } else if (m) {
    const year = new Date().getFullYear();
    appliedAt = `${year}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  } else {
    // 2026/06/02 → 2026-06-02
    appliedAt = appliedAt.replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, (_, y, mo, d) =>
      `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`);
  }

  // 住所: Indeed形式の '応募者の居住地' にも対応
  const address = col(['住所','address','addr','対応','応募者の居住地','居住地']);

  // 媒体: '応募経路'(Indeed) も参照
  const sourceMedia = col(['媒体','source_media','応募媒体','media','応募経路']) || 'CSV取込';

  // ステータス: Indeed '書類審査済み'/'選考待ち'・求人ボックス '未対応' → すべて '新規' に正規化
  // 自社スプレッドシート出力の '対応状況' 列も読み取る（架電結果の反映用）
  const rawStatus = col(['対応状況','ステータス','選考ステータス','status']);
  const NEW_ALIASES = ['書類審査済み', '選考待ち', '未対応', '新規', '応募', '未着手'];
  const VALID_CALL = ['新規', '架電済(不通)', '対応中', '対応終了', '断られた', '辞退', '重複'];
  const status = NEW_ALIASES.includes(rawStatus) ? '新規'
    : (VALID_CALL.includes(rawStatus) ? rawStatus : '新規');

  return {
    name:        cleanName,
    phone,
    email:       col(['メール','email','mail','メールアドレス']),
    age:         col(['年齢','age']),
    address,
    sourceMedia,
    appliedAt,
    status,
    notes:       col(['メモ','notes','備考','対応メモ']),
    // 追加フィールド（求人ボックス・Indeed 両対応）
    gender:      col(['性別','gender']),
    birthDate:   col(['生年月日','birth_date','birthdate']),
    currentJob:  col(['現在の職業','current_job','現職','職業']),
    jobTitle:    col(['求人タイトル','job_title','職種名','求人名']),
    experience:  col(['関連のある経験','experience','経験','職歴']),
    education:   col(['学歴','education']),
    workLocation:col(['勤務地','work_location','勤務先エリア']),
  };
}

// 運用管理用CSVマッパー（会社・媒体を指定、Indeed/engage分割氏名にも対応）
function mapOpsCSVRow(row, company, media) {
  const base = mapCSVRow(row);
  const col = (keys) => {
    for (const k of keys) {
      const v = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()];
      if (v && v.trim()) return v.trim();
    }
    for (const k of keys) {
      if (!/[ぁ-んァ-ヶ一-龯]/.test(k)) continue;
      for (const rk of Object.keys(row)) {
        if (rk.includes(k) && row[rk] && String(row[rk]).trim()) return String(row[rk]).trim();
      }
    }
    return '';
  };

  // ── engage / Indeed形式: 氏名（姓）＋氏名（名）結合（姓・名列があれば常に上書き）──
  const sei = col(['氏名（姓）','姓','sei']);
  const mei = col(['氏名（名）','名','mei']);
  if (sei || mei) {
    base.name = `${sei} ${mei}`.trim().replace(/[（(][^）)]*[）)]/g, '').trim();
  }
  if (!base.name) base.name = col(['氏名','名前']).replace(/[（(][^）)]*[）)]/g, '').trim();

  // ── engage形式: ふりがな（姓カナ＋名カナ結合）──
  if (!base.furigana) {
    const kSei = col(['氏名フリガナ（姓）','氏名カナ（姓）','姓カナ','フリガナ（姓）']);
    const kMei = col(['氏名フリガナ（名）','氏名カナ（名）','名カナ','フリガナ（名）']);
    if (kSei || kMei) base.furigana = `${kSei} ${kMei}`.trim();
  }
  if (!base.furigana) base.furigana = col(['氏名フリガナ','フリガナ','ふりがな','よみがな','カナ氏名']);
  // ── 求人ボックス形式: 氏名の括弧内ふりがな "松平 吉弘（まつだいら よしひろ）" ──
  if (!base.furigana) {
    const rawNm = col(['氏名','名前','お名前']);
    const fm = rawNm.match(/[（(]([^）)]*)[）)]/);
    if (fm && /[ぁ-んァ-ヶ]/.test(fm[1])) base.furigana = fm[1].trim();
  }

  // ── 居住地: engage形式は都道府県＋市区町村 ──
  if (!base.address) {
    const pref = col(['都道府県']);
    const city = col(['市区町村']);
    if (pref) base.address = city ? `${pref}${city}` : pref;
  }
  if (!base.address) base.address = col(['応募者の居住地','居住地','以降の住所']);

  // ── 学歴: 最終学歴 - 学校区分 ＋ 学校名 ──
  if (!base.education) {
    const gakkou = col(['最終学歴 - 学校区分','学校区分']);
    const name   = col(['最終学歴 - 学校名','学校名']);
    const gakka  = col(['最終学歴 - 学部/学科']);
    const parts  = [gakkou, name, gakka].filter(Boolean);
    if (parts.length) base.education = parts.join(' ');
  }

  // ── 求人タイトル: engageは「応募求人 - 職種名」（スペース付きハイフン形式）を優先 ──
  const engageTitle = col(['応募求人 - 職種名','応募求人-職種名','応募求人名']);
  if (media === 'engage' && engageTitle) {
    base.jobTitle = engageTitle;
  } else if (!base.jobTitle) {
    base.jobTitle = engageTitle || col(['求人タイトル','応募職種','応募求人名']);
  }

  // ── 求人ボックス形式: 生年月日 "1994年03月05日 (32歳)" から年齢を抽出 ──
  if (!base.age) {
    const bd = col(['生年月日','birth_date','birthdate']);
    const am = bd.match(/[（(]\s*(\d{1,3})\s*歳/);
    if (am) base.age = am[1];
  }
  // 生年月日から括弧内の年齢表記を除去して保存（"1994年03月05日 (32歳)" → "1994年03月05日"）
  if (base.birthDate) base.birthDate = base.birthDate.replace(/[（(][^）)]*[）)]/g, '').trim();

  // ── 経験: 直近年収・転職回数・経験年数を組み合わせてノート風に ──
  if (!base.experience) {
    const income   = col(['直近の年収','年収']);
    const tenJob   = col(['転職経験']);
    const expYears = col(['経験年数']);
    const parts    = [];
    if (income)   parts.push(`年収: ${income}`);
    if (tenJob)   parts.push(`転職: ${tenJob}`);
    if (expYears) parts.push(`経験年数: ${expYears}`);
    if (parts.length) base.experience = parts.join(' / ');
  }

  // ── 職歴詳細をnotesへ追記（engage: 職歴N / 求人ボックス: 勤務先_N）──
  const workHistoryParts = [];
  // engage形式: 職歴1〜3
  for (let i = 1; i <= 3; i++) {
    const co2 = col([`職歴${i} - 企業名`]);
    const from = col([`職歴${i} - 入社年月`]);
    const to   = col([`職歴${i} - 退社年月`]);
    const desc = col([`職歴${i} - 経験されたお仕事やスキル`]);
    if (co2) {
      const period = [from, to].filter(Boolean).join('〜');
      workHistoryParts.push(`【職歴${i}】${co2}${period ? ` (${period})` : ''}${desc ? '\n' + desc.replace(/<br>/g, '\n').slice(0, 200) : ''}`);
    }
  }
  // 求人ボックス形式: 勤務先_1〜30 / 役職・業務内容など_N
  if (workHistoryParts.length === 0) {
    for (let i = 1; i <= 30; i++) {
      const place = col([`勤務先_${i}`]);
      const role  = col([`役職・業務内容など_${i}`]);
      if (place) {
        workHistoryParts.push(`【勤務先${i}】${place}${role ? '\n' + role.replace(/<br>/g, '\n').slice(0, 200) : ''}`);
      }
    }
  }
  // 既存メモ（備考・PR / 選考コメント等）を保持しつつ職歴を追記
  const extraNote = col(['選考コメント']);
  const noteSegments = [];
  if (base.notes) noteSegments.push(base.notes);
  if (extraNote && extraNote !== base.notes) noteSegments.push(`【選考コメント】${extraNote}`);
  if (workHistoryParts.length) noteSegments.push(workHistoryParts.join('\n\n'));
  if (noteSegments.length) base.notes = noteSegments.join('\n\n');

  // ── 架電回数（engageシートに既存値がある場合）──
  let cc = col(['架電回数','call_count']);
  cc = /^\d+$/.test(cc) ? parseInt(cc) : 0;

  // sourceMediaが未取得('CSV取込'デフォルト)の場合はmedia名を使用
  const sourceMedia = (base.sourceMedia && base.sourceMedia !== 'CSV取込') ? base.sourceMedia : media;

  return { ...base, company, media, sourceMedia, callCount: cc, status: base.status || '新規' };
}

// 会社ID → 正式社名（スクリプトの COMPANY_NAME 用）
function companyFullName(id) {
  const c = OPS_COMPANIES.find(x => x.id === id);
  return c ? c.name : (process.env.COMPANY_NAME || '株式会社Social Quality');
}

// 新規応募者タブ統計
async function opsNewStats() {
  const { db } = require('./db');
  // 日付はJST（UTC+9）基準。UTC基準だと日本の0:00〜8:59に前日扱いになる
  const JST = 9 * 60 * 60 * 1000;
  const today = new Date(Date.now() + JST).toISOString().slice(0, 10);
  const monday = (() => { const d = new Date(Date.now() + JST); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  // 「本日の新規応募」は applied_at（応募日）基準でカウント。
  // バックログ取込は applied_at が過去日付になるため自動的に除外される。
  const todayNew = db.prepare(`SELECT COUNT(*) c FROM applicants WHERE is_archived = 0 AND applied_at >= ?`).get(today).c;
  const weekNew = db.prepare(`SELECT COUNT(*) c FROM applicants WHERE is_archived = 0 AND applied_at >= ?`).get(monday).c;
  const activeTotal = db.prepare(`SELECT COUNT(*) c FROM applicants WHERE is_archived = 0 AND status IN ('新規','架電済(不通)','対応中')`).get().c;
  return { todayNew, weekNew, activeTotal };
}

// SSE helpers
function sseInit(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });
}
function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Location normalizer: strip 丁目/番地/号 and beyond ──
function normLocation(loc) {
  return (loc || '')
    .replace(/[0-9０-９]+丁目.*$/, '')
    .replace(/[0-9０-９]+番地.*$/, '')
    .replace(/[0-9０-９]+-[0-9０-９].*$/, '')
    .trim();
}

// ── Salary parser: extract min/max numbers and type for media XML ──
function parseSalaryNums(salary) {
  const s = (salary || '').replace(/,/g, '').replace(/，/g, '');
  let type = 'monthly';
  if (/時給|時間/.test(s)) type = 'hourly';
  if (/日給|日当/.test(s)) type = 'daily';
  if (/年収|年俸/.test(s)) type = 'yearly';
  const toNum = str => {
    const m = str.match(/([\d.]+)万/);
    if (m) return Math.round(parseFloat(m[1]) * 10000);
    const n = str.match(/[\d]+/);
    return n ? parseInt(n[0], 10) : null;
  };
  const range = s.match(/([\d.]+万?[\d]*)\D*[〜～〜~]\D*([\d.]+万?[\d]*)/);
  if (range) {
    const min = toNum(range[1]); const max = toNum(range[2]);
    if (min && max) return { min, max, type };
  }
  const single = toNum(s);
  return single ? { min: single, type } : { type };
}

// Kyujinbox salary-type label
function kyujinboxSalaryType(type) {
  return { hourly: '時給', daily: '日給', yearly: '年収' }[type] || '月給';
}

// XML generator
function generateKyujinboxXML(jobs) {
  const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
  const company = process.env.COMPANY_NAME || '採用企業';
  const today   = new Date().toISOString().slice(0, 10);

  const items = jobs.map(j => {
    const sal    = parseSalaryNums(j.salary);
    const salType = kyujinboxSalaryType(sal.type);
    const loc    = normLocation(j.location);
    const catch_ = j.catchcopy || JSON.parse(j.tags || '[]').slice(0, 2).join('・') || j.employment_type;
    const pubDate = (j.published_at || j.created_at || today).slice(0, 10);
    const endDate = j.expires_at ? j.expires_at.slice(0, 10) : '';
    return `  <job>
    <job-id><![CDATA[${j.id}]]></job-id>
    <job-title><![CDATA[${j.title}]]></job-title>
    <job-catch><![CDATA[${catch_}]]></job-catch>
    <job-url>${siteUrl}/jobs/${j.id}</job-url>
    <company-name><![CDATA[${company}]]></company-name>
    <job-category><![CDATA[${j.job_type}]]></job-category>
    <job-type><![CDATA[${j.employment_type}]]></job-type>
    <salary-type>${salType}</salary-type>
    <salary-lower>${sal.min || ''}</salary-lower>
    <salary-upper>${sal.max || ''}</salary-upper>
    <job-address><![CDATA[${loc}]]></job-address>
    <job-description><![CDATA[${j.description}]]></job-description>
    <pub-date>${pubDate}</pub-date>
    <end-date>${endDate}</end-date>
  </job>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<jobs>
${items}
</jobs>`;
}

function generateStanbyXML(jobs) {
  const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
  const company = process.env.COMPANY_NAME || '採用企業';

  const items = jobs.map(j => {
    const sal    = parseSalaryNums(j.salary);
    const salTypeMap = { hourly: 'hourly', daily: 'daily', yearly: 'yearly', monthly: 'monthly' };
    const loc    = normLocation(j.location);
    const pref   = loc.match(/^(東京都|大阪府|神奈川県|愛知県|福岡県|北海道|[^\s]{2,4}[都道府県])/)?.[1] || loc;
    const catch_ = j.catchcopy || '';
    const desc   = j.description.slice(0, 500);
    const updated = (j.updated_at || j.created_at || new Date().toISOString()).slice(0, 10);
    return `  <item>
    <title><![CDATA[${j.title}]]></title>
    <url>${siteUrl}/jobs/${j.id}</url>
    <company><![CDATA[${company}]]></company>
    <catch><![CDATA[${catch_}]]></catch>
    <salary><![CDATA[${j.salary}]]></salary>
    <salary-min>${sal.min || ''}</salary-min>
    <salary-max>${sal.max || ''}</salary-max>
    <salary-type>${salTypeMap[sal.type] || 'monthly'}</salary-type>
    <prefecture><![CDATA[${pref}]]></prefecture>
    <location><![CDATA[${loc}]]></location>
    <job_type><![CDATA[${j.employment_type}]]></job_type>
    <occupation><![CDATA[${j.job_type}]]></occupation>
    <description><![CDATA[${desc}]]></description>
    <updated>${updated}</updated>
  </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
${items}
</items>`;
}

// CSV export
function generateCSV(applicants, includeCompany = false) {
  const headers = includeCompany
    ? ['会社','氏名','電話番号','メールアドレス','年齢','住所','応募媒体','応募日時','ステータス','応募求人','重複フラグ']
    : ['氏名','電話番号','メールアドレス','年齢','住所','応募媒体','応募日時','ステータス','応募求人','重複フラグ'];
  const COMPANY_LABELS = { sq: '株式会社Social Quality', lt: '株式会社Life Tailor' };
  const rows = applicants
    .filter(a => !a.is_duplicate)
    .map(a => {
      const base = [
        a.name, a.phone, a.email, a.age||'', a.address||'',
        a.source_media, (a.applied_at||'').slice(0,16).replace('T',' '),
        a.status, a.job_titles||'', a.is_duplicate ? '重複' : ''
      ];
      const row = includeCompany ? [COMPANY_LABELS[a.company] || a.company || '', ...base] : base;
      return row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
  return [headers.join(','), ...rows].join('\n');
}

// ── VPN ──────────────────────────────────────────────────────

function findVpncmd() {
  const candidates = [
    process.env.VPNCMD_PATH,
    'C:\\Program Files\\SoftEther VPN Client\\vpncmd.exe',
    'C:\\Program Files (x86)\\SoftEther VPN Client\\vpncmd.exe',
    'vpncmd',
  ].filter(Boolean);
  for (const p of candidates) {
    if (p === 'vpncmd' || fs.existsSync(p)) return p;
  }
  return null;
}

// vpncmd出力から接続状態を判定（出力はUTF-8で読む）
function isVpnConnectedFromOutput(out) {
  if (!out) return false;
  // 英語版: "Connected"
  if (/\bConnected\b/i.test(out)) return true;
  // 日本語版: 各種表現に対応
  if (out.includes('接続完了')) return true;
  if (out.includes('接続中')) return true;
  if (out.includes('接続済み')) return true;
  if (out.includes('接続済')) return true;
  return false;
}

// アカウント名リストを出力から抽出（出力はUTF-8で読む）
function parseAccountNames(out) {
  const names = [];
  for (const line of out.split(/\r?\n/)) {
    // 日本語版: "接続設定名 | VPN Gate Connection ..."
    if (line.includes('接続設定名')) {
      const idx = line.indexOf('|');
      if (idx >= 0) {
        const name = line.slice(idx + 1).trim();
        if (name) names.push(name);
      }
      continue;
    }
    // 英語版: "Account Name | NAME"
    const mEn = line.match(/Account Name\s*\|\s*(.+)/i);
    if (mEn && mEn[1].trim()) names.push(mEn[1].trim());
  }
  // フォールバック: | の後にスペース含むASCII文字列（VPN Gate Connection など）
  if (names.length === 0) {
    for (const line of out.split(/\r?\n/)) {
      const idx = line.indexOf('|');
      if (idx < 0) continue;
      const val = line.slice(idx + 1).trim();
      if (/^[A-Za-z][A-Za-z0-9 _\-\.]{2,}$/.test(val)) names.push(val);
    }
  }
  return [...new Set(names)];
}

// vpncmdでアカウント一覧を取得
// vpncmd.exe の出力はUTF-8（toString('binary')だと制御文字が混入して照合失敗する）
function vpncmdAccountList(vpncmdPath) {
  return new Promise(resolve => {
    const proc = spawn(vpncmdPath, ['localhost', '/CLIENT', '/CMD', 'AccountList'], { shell: false });
    const chunks = [];
    proc.stdout.on('data', d => chunks.push(d));
    proc.stderr.on('data', d => chunks.push(d));
    proc.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
    proc.on('error', () => resolve(''));
    setTimeout(() => { try { proc.kill(); } catch {} resolve(''); }, 8000);
  });
}

// VPN check: vpncmd優先（IP不問）→ IP範囲フォールバック
let vpnCache = { connected: false, ts: 0 };
async function checkVPN() {
  // VPN_BYPASS=true で常にOK（テスト・デバッグ用）
  if (process.env.VPN_BYPASS === 'true') return true;
  if (Date.now() - vpnCache.ts < 30000) return vpnCache.connected;

  const vpncmdPath = findVpncmd();
  if (vpncmdPath) {
    // SoftEther の接続状態をアカウントリストで確認（IPアドレス不問）
    const out = await vpncmdAccountList(vpncmdPath);
    // "Connected" はSoftEtherの英語ステータス文字列
    // "接続完了" は日本語表示時
    if (isVpnConnectedFromOutput(out)) {
      vpnCache = { connected: true, ts: Date.now() };
      return true;
    }
    // vpncmdが未接続でも、SoftEther以外のVPNクライアントで接続している
    // 可能性があるため、VPN_IP_RANGES設定時はIP範囲チェックにフォールバック
  }

  const vpnRanges = (process.env.VPN_IP_RANGES || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!vpnRanges.length) {
    // IP範囲未設定: vpncmdで未接続判定済みならそれを尊重、
    // vpncmd未インストールなら開発環境とみなし常にOK
    const connected = !vpncmdPath;
    vpnCache = { connected, ts: Date.now() };
    return connected;
  }
  try {
    const externalIp = await new Promise((resolve, reject) => {
      const opts = url.parse('http://api.ipify.org');
      const req2 = http.get(opts, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(d.trim()));
      });
      req2.setTimeout(5000, () => { req2.destroy(); reject(new Error('timeout')); });
      req2.on('error', reject);
    });
    const connected = vpnRanges.some(range =>
      externalIp.startsWith(range.split('/')[0].split('.').slice(0, 3).join('.'))
    );
    vpnCache = { connected, ts: Date.now() };
    return connected;
  } catch {
    vpnCache = { connected: false, ts: Date.now() };
    return false;
  }
}

// SoftEther VPN 接続（アカウント名自動検出）
async function vpnConnect() {
  const vpncmdPath = findVpncmd();
  if (!vpncmdPath) {
    return { ok: false, error: 'vpncmd.exe が見つかりません。VPNCMD_PATH を .env に設定してください。' };
  }

  const out = await vpncmdAccountList(vpncmdPath);

  // すでに接続中なら即成功
  if (isVpnConnectedFromOutput(out)) {
    vpnCache = { connected: true, ts: Date.now() };
    return { ok: true, message: 'すでにVPN接続中です' };
  }

  // アカウント名を取得（環境変数優先 → 自動検出）
  const names = parseAccountNames(out);
  const targetName = process.env.VPNCMD_ACCOUNT || names[0];
  if (!targetName) {
    return { ok: false, error: `接続先アカウントが見つかりません。\nvpncmd出力（先頭）:\n${out.slice(0, 500)}` };
  }

  // vpncmd.exe を直接実行してAccountConnect
  return await new Promise(resolve => {
    const proc = spawn(vpncmdPath, ['localhost', '/CLIENT', '/CMD', 'AccountConnect', targetName], { shell: false });
    const chunks = [];
    proc.stdout.on('data', d => chunks.push(d));
    proc.stderr.on('data', d => chunks.push(d));
    proc.on('close', code => {
      const res2 = Buffer.concat(chunks).toString('utf8');
      vpnCache = { connected: false, ts: 0 };
      if (code === 0 || /command completed/i.test(res2) || res2.includes('コマンドは正常に終了')) {
        resolve({ ok: true, message: `${targetName} への接続を開始しました（数秒後に確認）` });
      } else {
        resolve({ ok: false, error: `接続失敗: ${res2.slice(0, 300)}` });
      }
    });
    proc.on('error', err => resolve({ ok: false, error: err.message }));
  });
}

// Duplicate check
async function checkDuplicate(data) {
  const nPhone = normalizePhone(data.phone);
  const nEmail  = normalizeEmail(data.email);
  return await Applicants.findDuplicate(nPhone, nEmail);
}

// ── Claude API ──────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');
  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });
  return new Promise((resolve, reject) => {
    const req2 = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try {
          const obj = JSON.parse(d);
          if (obj.error) reject(new Error(obj.error.message || 'API error'));
          else resolve(obj.content[0].text);
        } catch { reject(new Error('Invalid response: ' + d.slice(0, 200))); }
      });
    });
    req2.setTimeout(30000, () => { req2.destroy(); reject(new Error('タイムアウト（30秒）')); });
    req2.on('error', reject);
    req2.write(body);
    req2.end();
  });
}

// ── Dashboard stats helpers ─────────────────────────────────

async function computeDashboardStats(company = null) {
  const allJobs = await Jobs.findAll({ company });
  const today   = new Date().toISOString().slice(0, 10);

  const parseMedia = j => JSON.parse(j.target_media || '[]');
  const isKyujinbox = j => { const m = parseMedia(j); return m.includes('求人ボックス') || m.includes('kyujinbox'); };
  const isStanby    = j => { const m = parseMedia(j); return m.includes('スタンバイ') || m.includes('stanby'); };

  // Published count per media (active)
  const kyujinboxJobs  = allJobs.filter(j => j.is_published && isKyujinbox(j)).length;
  const stanbyJobs     = allJobs.filter(j => j.is_published && isStanby(j)).length;
  const publishedTotal = allJobs.filter(j => j.is_published).length;

  // Today's published count per media (for daily task tracker)
  const todayKyujinbox = allJobs.filter(j => {
    if (!j.is_published || !isKyujinbox(j)) return false;
    const pub = (j.published_at || j.updated_at || '').slice(0, 10);
    return pub === today;
  }).length;
  const todayStanby = allJobs.filter(j => {
    if (!j.is_published || !isStanby(j)) return false;
    const pub = (j.published_at || j.updated_at || '').slice(0, 10);
    return pub === today;
  }).length;

  // Indeed repost: published Indeed jobs older than 3 days
  const indeedThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const indeedRepostCount = allJobs.filter(j => {
    if (!j.is_published || !parseMedia(j).includes('Indeed')) return false;
    const posted = j.published_at || j.created_at;
    return !posted || posted < indeedThreshold;
  }).length;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const recentLogs = await Logs.findAll(200);
  const weeklyPosts = recentLogs.filter(l =>
    l.action === 'kyujinbox_post' && l.status === 'success' && (l.created_at || '').slice(0, 10) >= weekAgo
  ).length;

  // Media breakdown from applicants
  const allApplicants = await Applicants.findAll({ company });
  const mediaMap = {};
  for (const a of allApplicants) {
    const m = a.source_media || 'その他';
    mediaMap[m] = (mediaMap[m] || 0) + 1;
  }
  const mediaBreakdown = Object.entries(mediaMap)
    .sort((a, b) => b[1] - a[1])
    .map(([media, count]) => ({ media, count }));

  return {
    banRisk: { kyujinbox: kyujinboxJobs || publishedTotal, stanby: stanbyJobs, weeklyPosts },
    mediaBreakdown,
    todayKyujinbox,
    todayStanby,
    indeedRepostCount,
  };
}

// ── Polling sessions (kyujinbox / stanby long-running jobs) ──
// Replaces SSE which drops through Cloudflare after ~75 s
const postSessions = new Map();
function createSession() {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const session = { logs: [], done: false, success: false, createdAt: Date.now() };
  postSessions.set(id, session);
  // Auto-cleanup after 15 min
  setTimeout(() => postSessions.delete(id), 15 * 60 * 1000);
  return { id, session };
}

// ── Router ─────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const method = req.method;
  let pathname = '/';
  let query = {};
  try {
  const parsed = url.parse(req.url, true);
  query = parsed.query;
  try { pathname = decodeURIComponent(parsed.pathname); }
  catch { pathname = parsed.pathname || '/'; }  // 不正な%エンコードでも落とさない

  // ── Static files ──
  if (pathname.startsWith('/images/') && method === 'GET') {
    const fp = path.join(PUBLIC_DIR, path.normalize(pathname));
    if (!fp.startsWith(path.join(PUBLIC_DIR, 'images'))) { send(res, 404, 'Not Found'); return; }
    try {
      const content = fs.readFileSync(fp);
      const ext = path.extname(fp).toLowerCase();
      const types = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
      res.end(content);
    } catch { send(res, 404, 'Not Found'); }
    return;
  }
  if (pathname === '/styles.css' || pathname === '/admin.js') {
    const fp = path.join(PUBLIC_DIR, pathname);
    try {
      const content = fs.readFileSync(fp);
      const ct = pathname.endsWith('.css') ? 'text/css' : 'application/javascript';
      // 毎回サーバーに確認させ、古いJS/CSSをキャッシュから使い続けないようにする
      res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-cache, must-revalidate' });
      res.end(content);
    } catch { send(res, 404, 'Not Found'); }
    return;
  }

  // ── Root redirect ──
  if (pathname === '/') { res.writeHead(302, { Location: '/jobs?co=sq' }); res.end(); return; }

  // ── Admin login ──
  if (pathname === '/admin/login' && method === 'GET') {
    send(res, 200, T.loginPage());
    return;
  }
  if (pathname === '/admin/login' && method === 'POST') {
    const body = await readBody(req);
    const params = new URLSearchParams(body.toString());
    const token = login(params.get('username') || '', params.get('password') || '');
    if (token) {
      res.writeHead(302, { 'Set-Cookie': sessionCookie(token), Location: '/admin' });
      res.end();
    } else {
      send(res, 401, T.loginPage('ユーザー名またはパスワードが正しくありません'));
    }
    return;
  }
  if (pathname === '/admin/logout') {
    const cookies = parseCookies(req);
    destroySession(cookies.get('admin_session') || '');
    res.writeHead(302, { 'Set-Cookie': sessionCookie('', true), Location: '/admin/login' });
    res.end();
    return;
  }

  // ── Public: Privacy Policy ──
  if (pathname === '/privacy' && method === 'GET') {
    send(res, 200, privacyPolicyPage());
    return;
  }

  // ── Public: Jobs list ──
  if (pathname === '/jobs' && method === 'GET') {
    const search = query.q || '';
    let jobs = await Jobs.findAll(true);
    if (search) {
      const s = search.toLowerCase();
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(s) ||
        j.location.toLowerCase().includes(s) ||
        j.job_type.toLowerCase().includes(s) ||
        (j.tags || '').toLowerCase().includes(s)
      );
    }
    send(res, 200, T.jobsListPage(jobs, search));
    return;
  }

  // ── Public: Job detail ──
  const jobDetailMatch = pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobDetailMatch && method === 'GET') {
    const job = await Jobs.findById(jobDetailMatch[1]);
    if (!job || !job.is_published) { send(res, 404, '<h1>求人が見つかりません</h1>'); return; }
    send(res, 200, T.jobDetailPage(job));
    return;
  }

  // ── Preview: 採用トップページ（イーストアジア風） ──
  if (pathname === '/preview/top' && method === 'GET') {
    const jobs = (await Jobs.findAll()).filter(j => j.is_published);
    send(res, 200, T.topPageV2(jobs));
    return;
  }

  // ── Preview: 新デザイン求人一覧（未公開求人も「未公開」バッジ付きで表示） ──
  // 掲載先「自社サイト」の求人のみ表示（求人ボックス等の媒体用求人は出さない）
  if (pathname === '/preview/jobs' && method === 'GET') {
    let jobs = (await Jobs.findAll()).filter(j => (j.target_media || '').includes('自社サイト'));
    // 職種タブからの絞り込み（?type=IT / 製造 / 送迎 / 配送）: job_type の先頭一致で判定
    const type = (query.type || '').trim();
    if (type) {
      jobs = jobs.filter(j => (j.job_type || '').startsWith(type));
    }
    const search = (query.q || '').trim();
    if (search) {
      const s = search.toLowerCase();
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(s) ||
        j.location.toLowerCase().includes(s) ||
        j.job_type.toLowerCase().includes(s) ||
        (j.tags || '').toLowerCase().includes(s)
      );
    }
    send(res, 200, T.jobsListPageV2(jobs, search || type));
    return;
  }

  // ── Preview: 新デザイン求人詳細（承認後 /jobs/:id へ切り替え予定） ──
  const previewJobMatch = pathname.match(/^\/preview\/jobs\/([^/]+)$/);
  if (previewJobMatch && method === 'GET') {
    const job = await Jobs.findById(previewJobMatch[1]);
    // プレビューは未公開求人も表示可能（デザイン確認用）
    if (!job) { send(res, 404, '<h1>求人が見つかりません</h1>'); return; }
    send(res, 200, T.jobDetailPageV2(job));
    return;
  }

  // ── API: Apply ──
  if (pathname === '/api/apply' && method === 'POST') {
    const body = await parseJSON(req);
    if (!body.name || !body.phone || !body.email) {
      sendError(res, 400, '氏名・電話・メールは必須です'); return;
    }
    const applicant = await Applicants.create({
      ...body,
      status: '新規',
      sourceMedia: body.sourceMedia || 'direct',
      media: body.media || 'google',
    });
    let jobTitle = body.jobTitle || '';
    if (body.jobId) {
      const job = await Jobs.findById(body.jobId);
      jobTitle = job ? job.title : jobTitle;
      await Applications.create({
        applicantId: applicant.id,
        jobId: body.jobId,
        jobTitle,
        sourceMedia: 'direct'
      });
    }
    // Fire-and-forget email notifications (don't block response)
    sendApplicationThanks(applicant, jobTitle).catch(() => {});
    sendNewApplicantAlert({ ...applicant, sourceMedia: applicant.source_media, media: applicant.media }, jobTitle).catch(() => {});
    sendJSON(res, 201, { ok: true, id: applicant.id });
    return;
  }

  // ── SEO: sitemap.xml ──
  if (pathname === '/sitemap.xml' && method === 'GET') {
    const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
    const jobs = await Jobs.findAll(true);
    const today = new Date().toISOString().slice(0, 10);
    const jobUrls = jobs.map(j => `  <url>
    <loc>${siteUrl}/jobs/${j.id}</loc>
    <lastmod>${(j.updated_at || j.created_at || today).slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/jobs</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${jobUrls}
</urlset>`;
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(xml);
    return;
  }

  // ── SEO: robots.txt ──
  if (pathname === '/robots.txt' && method === 'GET') {
    const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`User-agent: *\nAllow: /jobs\nAllow: /jobs/\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
    return;
  }

  // ── API: AI Rewrite ──
  if (pathname === '/api/ai/rewrite' && method === 'POST') {
    const body = await parseJSON(req);
    const { title, location, salary, jobType, employmentType, existingDescription } = body;
    if (!title) { sendError(res, 400, 'タイトルは必須です'); return; }

    const system = `あなたは採用広告のコピーライターです。求職者の心に響く求人原稿を日本語で作成します。
以下の構成で書いてください：
◆仕事内容（主な業務を3〜5点の箇条書き）
◆職場環境（雰囲気・設備・特徴）
◆こんな方歓迎（求める人物像・スキル）

読みやすく具体的に、求職者が応募したくなる文章を300〜500文字で書いてください。`;

    const userMsg = `【職種】${jobType || 'その他'} / 【雇用形態】${employmentType || '正社員'}\n【タイトル】${title}\n【勤務地】${location || ''}\n【給与】${salary || ''}${existingDescription ? `\n【既存原稿（参考）】\n${existingDescription}` : ''}`;

    try {
      const text = await callClaude(system, userMsg);
      sendJSON(res, 200, { ok: true, text });
    } catch (e) {
      sendError(res, 500, `AI生成に失敗しました: ${e.message}`);
    }
    return;
  }

  // ── API: AI Bulk Job Generate (SSE) ──
  if (pathname === '/api/generate/bulk' && method === 'GET') {
    sseInit(res);

    if (!process.env.ANTHROPIC_API_KEY) {
      sseSend(res, { message: 'ANTHROPIC_API_KEY が設定されていません', type: 'error', done: true, success: false });
      res.end(); return;
    }

    const types      = (query.types     || '').split(',').map(s => s.trim()).filter(Boolean);
    const locations  = (query.locations || '').split(',').map(s => s.trim()).filter(Boolean);
    const empType    = query.employmentType || '正社員';
    const mediaList  = (query.media || '').split(',').map(s => s.trim()).filter(Boolean);

    if (!types.length || !locations.length) {
      sseSend(res, { message: '職種と勤務地を1つ以上選択してください', type: 'error', done: true, success: false });
      res.end(); return;
    }

    const salaryMap = {
      '看護師・准看護師':              '月給28万円〜40万円',
      '介護士・ケアワーカー':          '月給22万円〜30万円',
      '調理師・キッチンスタッフ':      '月給22万円〜30万円',
      '事務・受付スタッフ':            '月給20万円〜27万円',
      '営業（個人向け）':              '月給25万円〜45万円（インセンティブあり）',
      '営業（法人向け）':              '月給28万円〜50万円（インセンティブあり）',
      'Webエンジニア（フロントエンド）': '月給30万円〜55万円',
      'Webエンジニア（バックエンド）':  '月給35万円〜60万円',
      '保育士・幼稚園教諭':            '月給22万円〜28万円',
      'ドライバー・配送':              '月収41万円〜71万円',
      '軽貨物ドライバー':              '月収41万円〜71万円',
      '軽配送ドライバー':              '月収41万円〜71万円',
    };

    const system = `あなたは採用広告のコピーライターです。指定された職種・勤務地・雇用形態の求人情報をJSON形式で生成してください。
必ず以下のJSON形式のみを返してください（マークダウン・コードブロック不要）：
{"title":"求人タイトル","catchcopy":"キャッチコピー","description":"仕事内容","rewarding":"やりがい","worktimeHoliday":"勤務時間・休日","transportation":"アクセス","tags":["タグ1","タグ2","タグ3","タグ4"]}

title: 「具体的な職種名 勤務地エリア名」の形式。例「介護士（正社員）東京・新宿」
catchcopy: 求職者の目を引く短いコピー20〜35文字。例「未経験OK！研修充実で安心スタート」
description: 以下の構成で400〜600文字：
◆仕事内容（主な業務を3〜5点の箇条書き）
◆職場環境（雰囲気・設備・福利厚生）
◆こんな方歓迎（求める人物像・必要スキル・歓迎条件）
rewarding: 仕事のやりがい・魅力を120文字以内で。例「お客様の笑顔が直接見られる仕事です。未経験でも研修で確実にスキルアップできます。」
worktimeHoliday: 勤務時間と休日を120文字以内で。例「9:00〜18:00（実働8時間）週休2日制（土日祝）年間休日120日以上」
transportation: 最寄り駅からのアクセスと交通手段を100文字以内で。例「JR○○駅より徒歩5分。車通勤OK（駐車場完備）」
tags: Googleしごと検索・求人媒体で求職者が検索するキーワードを4〜5個。`;

    const combos = [];
    for (const t of types) for (const l of locations) combos.push({ t, l });
    const total = combos.length;

    sseSend(res, { message: `✨ ${total}件の求人原稿を生成します...`, type: 'info', total });

    let successCount = 0;
    let aborted = false;
    req.on('close', () => { aborted = true; });

    (async () => {
      for (let i = 0; i < combos.length; i++) {
        if (aborted) break;
        const { t, l } = combos[i];
        const salary   = salaryMap[t] || '月給22万円〜35万円';
        const shortLoc = l.replace('東京都', '東京・').replace('大阪府大阪市', '大阪・').replace(/区$/, '').replace(/市$/, '');

        sseSend(res, { message: `[${i+1}/${total}] ${t} × ${shortLoc} を生成中...`, type: 'info', current: i + 1, total });

        try {
          const userMsg = `職種: ${t}\n勤務地: ${l}\n雇用形態: ${empType}\n給与: ${salary}`;
          const raw  = await callClaude(system, userMsg);
          const json = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim());

          const assignedMedia = mediaList.length > 0 ? [mediaList[i % mediaList.length]] : [];
          await Jobs.create({
            title:           json.title          || `${t} ${shortLoc}`,
            catchcopy:       json.catchcopy       || '',
            location:        normLocation(l),
            salary,
            jobType:         t,
            employmentType:  empType,
            description:     json.description    || '',
            rewarding:       json.rewarding       || '',
            worktimeHoliday: json.worktimeHoliday || '',
            transportation:  json.transportation  || '',
            tags:            json.tags            || [],
            targetMedia:     assignedMedia,
            isPublished:     false,
          });
          successCount++;
          sseSend(res, { message: `✅ 保存: ${json.title}`, type: 'success', current: i + 1, total });
        } catch (e) {
          sseSend(res, { message: `⚠️ ${t}×${shortLoc} 失敗: ${e.message}`, type: 'warn', current: i + 1, total });
        }
      }

      await Logs.create('bulk_generate', 'success', `AI一括生成: ${successCount}/${total}件`);
      notify(`AI一括生成完了: ${successCount}件の求人を下書き保存しました`).catch(() => {});
      sseSend(res, {
        message: `✅ 完了！ ${successCount}件の求人を下書き保存しました。求人管理から確認・公開してください。`,
        type: 'success', done: true, success: true, count: successCount,
      });
      res.end();
    })().catch(e => {
      sseSend(res, { message: `❌ エラー: ${e.message}`, type: 'error', done: true, success: false });
      res.end();
    });
    return;
  }

  // ── Auth guard: all /admin routes except /admin/login ──
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!requireAuth(req, res)) return;
  }

  // Company context: ?co=sq|bg|pe|lt（デフォルト sq）
  const co = ['sq', 'bg', 'pe', 'lt'].includes(query.co) ? query.co : 'sq';

  // ── Admin: Dashboard ──
  if (pathname === '/admin' && method === 'GET') {
    res.writeHead(302, { Location: '/admin/ops?tab=posts' });
    res.end();
    return;
  }

  // ── Admin: Jobs page ──
  if (pathname === '/admin/jobs' && method === 'GET') {
    send(res, 200, T.adminJobsPage(await Jobs.findAll({ company: co }), co));
    return;
  }

  // ── Admin: Applicants page ──
  if (pathname === '/admin/applicants' && method === 'GET') {
    const filter = query.status || 'all';
    const applicants = await Applicants.findAll({ status: filter, search: query.search, company: co });
    send(res, 200, T.adminApplicantsPage(applicants, filter, co));
    return;
  }

  // ── Admin: Logs page ──
  if (pathname === '/admin/logs' && method === 'GET') {
    send(res, 200, T.adminLogsPage(await Logs.findAll(), co));
    return;
  }

  // ── Admin: 運用管理ページ（3タブ）──
  if (pathname === '/admin/ops' && method === 'GET') {
    const tab = query.tab || 'posts';
    const data = { tab, co };
    if (tab === 'posts') {
      data.posts = await MediaPosts.findAll({});
      data.postsCross = await MediaPosts.crossTab();
      data.siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
      try { data.indeedRepostCount = (await computeDashboardStats(co)).indeedRepostCount || 0; } catch { data.indeedRepostCount = 0; }
    } else if (tab === 'new') {
      data.applicantsCross = await Ops.crossTab({ todayOnly: true });
      data.todayTargets = await Ops.todayCallTargets();
      data.stats = await opsNewStats();
    } else if (tab === 'past') {
      // 絞り込みはクライアント側で即時に行うため、ここでは全件を渡す。
      // URLパラメータはプルダウンの初期選択（ディープリンク）に使う。
      const filter = {
        company: query.company || 'all', media: query.media || 'all',
        status: query.status || 'all', month: query.month || 'all',
      };
      data.filter = filter;
      data.months = await Ops.appliedMonths();
      // 過去応募タブは「過去応募（アーカイブ済み）」のみ表示。
      // 架電リスト（アクティブ）と重複して表示しないようにする。
      data.pastApplicants = await Ops.listCalls({ archived: true });
    }
    send(res, 200, T.opsPage(data));
    return;
  }

  // ── Admin: 架電リストページ ──
  if (pathname === '/admin/calls' && method === 'GET') {
    const callCo = Array.isArray(query.co) ? query.co[0] : (query.co || co);
    const callMedia = Array.isArray(query.media) ? query.media[0] : (query.media || 'indeed');
    const callStatus = Array.isArray(query.status) ? query.status[0] : (query.status || 'all');
    const callSearch = query.search || '';
    const applicants = await Ops.listCalls({
      company: callCo !== 'all' ? callCo : undefined,
      media: callMedia,
      status: callStatus !== 'all' ? callStatus : undefined,
      search: callSearch || undefined,
      archived: false, // 架電リスト（本日分）はアーカイブ済み（過去応募者）を除外
      // 重複（再応募で対応中・終了に一致）も架電リストに表示する。
      // 重複バッジから過去応募時の情報を確認できるようにするため除外しない。
      excludeDuplicate: false,
    });
    send(res, 200, T.callsPage({ co: callCo, media: callMedia, applicants, statusFilter: callStatus, search: callSearch }));
    return;
  }

  // ── Admin: Analytics page ──
  if (pathname === '/admin/analytics' && method === 'GET') {
    const data = {
      daily:   await Analytics.dailyApplications(30),
      media:   await Analytics.mediaBreakdown(),
      status:  await Analytics.statusDistribution(),
      topJobs: await Analytics.topJobs(10),
      weekly:  await Analytics.weeklySummary(),
      co,
    };
    send(res, 200, T.adminAnalyticsPage(data));
    return;
  }

  // ── API: Analytics JSON ──
  if (pathname === '/api/analytics' && method === 'GET') {
    sendJSON(res, 200, {
      daily:   await Analytics.dailyApplications(30),
      media:   await Analytics.mediaBreakdown(),
      status:  await Analytics.statusDistribution(),
      topJobs: await Analytics.topJobs(10),
      weekly:  await Analytics.weeklySummary()
    });
    return;
  }

  // ══════════════════════════════════════════════════════════
  // 運用管理 API
  // ══════════════════════════════════════════════════════════

  // ── 掲載日報 CRUD ──
  if (pathname === '/api/ops/posts' && method === 'GET') {
    sendJSON(res, 200, await MediaPosts.findAll({ company: query.company, media: query.media, status: query.status }));
    return;
  }
  if (pathname === '/api/ops/posts' && method === 'POST') {
    const body = await parseJSON(req);
    if (!body.job_title && !body.jobTitle) { sendError(res, 400, '求人タイトルは必須です'); return; }
    sendJSON(res, 201, await MediaPosts.create(body));
    return;
  }
  const postMatch = pathname.match(/^\/api\/ops\/posts\/([^/]+)$/);
  if (postMatch) {
    const id = postMatch[1];
    if (method === 'PUT') {
      const body = await parseJSON(req);
      sendJSON(res, 200, await MediaPosts.update(id, body));
      return;
    }
    if (method === 'DELETE') {
      await MediaPosts.remove(id);
      sendJSON(res, 200, { ok: true });
      return;
    }
  }

  // ── 架電ステータス更新 ──
  const callMatch = pathname.match(/^\/api\/ops\/calls\/([^/]+)$/);
  if (callMatch && method === 'PUT') {
    const body = await parseJSON(req);
    const updated = await Ops.updateCall(callMatch[1], {
      callCount: body.call_count !== undefined ? body.call_count : body.callCount,
      status:    body.status,
      notes:     body.notes,
    });
    sendJSON(res, 200, updated || { ok: true });
    return;
  }

  // ── 会社変更（DB更新 + スプレッドシート該当タブ再同期）──
  const moveMatch = pathname.match(/^\/api\/ops\/calls\/([^/]+)\/move-company$/);
  if (moveMatch && method === 'POST') {
    const id = moveMatch[1];
    const body = await parseJSON(req);
    const newCompany = body.company;
    if (!OPS_COMPANIES.find(c => c.id === newCompany)) {
      sendJSON(res, 400, { error: '不明な会社ID' }); return;
    }
    const cur = Applicants.findById(id);
    if (!cur) { sendJSON(res, 404, { error: '該当者なし' }); return; }
    const oldCompany = cur.company;
    const { db } = require('./db');
    db.prepare('UPDATE applicants SET company=?, updated_at=? WHERE id=?').run(newCompany, new Date().toISOString(), id);
    // 変更前後の会社タブだけ再同期
    const affected = OPS_COMPANIES.filter(c => c.id === oldCompany || c.id === newCompany);
    if (gsheets.isConfigured() && affected.length) {
      try {
        const { pushToSheets } = require('./lib/sheets-sync');
        await pushToSheets({ gsheets, Ops, Logs, companies: affected, statuses: CALL_STATUSES, mediaList: OPS_MEDIA });
      } catch (e) { /* sync失敗は無視してDB更新は確定 */ }
    }
    sendJSON(res, 200, { ok: true, from: oldCompany, to: newCompany });
    return;
  }

  // ── 重複元・再応募元の情報取得 ──
  const dupInfoMatch = pathname.match(/^\/api\/ops\/calls\/([^/]+)\/(dup-info|returning-info)$/);
  if (dupInfoMatch && method === 'GET') {
    const id = dupInfoMatch[1];
    const type = dupInfoMatch[2];
    const cur = Applicants.findById(id);
    if (!cur) { sendJSON(res, 404, { error: '該当者なし' }); return; }
    const refId = type === 'dup-info' ? cur.duplicate_of_id : cur.returning_from_id;
    if (!refId) { sendJSON(res, 200, { ref: null }); return; }
    const ref = Applicants.findById(refId);
    if (!ref) { sendJSON(res, 200, { ref: null }); return; }
    const companyLabel = id => { const c = OPS_COMPANIES.find(x => x.id === id); return c ? (c.label || c.short || id) : (id || ''); };
    const mediaLabel = id => { const m = OPS_MEDIA.find(x => x.id === id); return m ? m.name : (id || '不明'); };
    sendJSON(res, 200, { ref: {
      id: ref.id,
      name: ref.name,
      phone: ref.phone,
      email: ref.email,
      appliedAt: (ref.applied_at || '').slice(0, 10),
      company: companyLabel(ref.company),
      media: mediaLabel(ref.media),
      jobTitle: ref.job_title || '',
      status: ref.status,
      callCount: ref.call_count || 0,
      notes: ref.notes || '',
    }});
    return;
  }

  if (pathname === '/api/ops/stats' && method === 'GET') {
    sendJSON(res, 200, await opsNewStats());
    return;
  }

  // ── スマート一括取込（全会社・全媒体混在Excel）──
  //   シート名→媒体、シート内の会社見出し行→会社 を自動判定して取り込む。
  if (pathname === '/api/ops/calls/smart-import' && method === 'POST') {
    const ct = req.headers['content-type'] || '';
    const buf = await readBody(req);
    let fileBuf = null, defaultCompany = co, splitByCallCount = false, countAsNew = false, fillMissing = false;
    if (ct.includes('multipart/form-data')) {
      const boundaryMatch = ct.match(/boundary=(.+)$/);
      const parts = parseMultipart(buf, boundaryMatch[1].trim());
      for (const p of parts) {
        if (/name="company"/.test(p.header)) defaultCompany = p.content.toString('utf8').trim();
        else if (/name="split"/.test(p.header)) splitByCallCount = p.content.toString('utf8').trim() === '1';
        else if (/name="countnew"/.test(p.header)) countAsNew = p.content.toString('utf8').trim() === '1';
        else if (/name="fillmissing"/.test(p.header)) fillMissing = p.content.toString('utf8').trim() === '1';
        else if (/filename=/.test(p.header)) fileBuf = p.content;
      }
    } else {
      fileBuf = buf;
      defaultCompany = query.company || co;
      splitByCallCount = query.split === '1';
      countAsNew = query.countnew === '1';
      fillMissing = query.fillmissing === '1';
    }
    const isXlsx = fileBuf && fileBuf.length > 4 &&
      fileBuf[0] === 0x50 && fileBuf[1] === 0x4B && fileBuf[2] === 0x03 && fileBuf[3] === 0x04;
    if (!isXlsx) {
      sendJSON(res, 400, { ok: false, error: 'スマート取込はExcel(.xlsx)ファイルのみ対応しています' });
      return;
    }
    try {
      const sheets = parseXlsxSheets(fileBuf);
      const r = await smartImport({
        sheets,
        deps: { mapOpsCSVRow, normalizePhone, normalizeEmail, Applicants, Ops, Logs },
        defaultCompany,
        splitByCallCount,
        countAsNew,
        fillMissing,
      });
      sendJSON(res, 200, { ok: true, ...r });
    } catch (e) {
      await Logs.create('ops_smart_import', 'error', String(e.message || e));
      sendJSON(res, 500, { ok: false, error: String(e.message || e) });
    }
    return;
  }

  // ── CSVインポート（会社・媒体指定）──
  if (pathname === '/api/ops/calls/import' && method === 'POST') {
    function decodeCsvBuffer(rawBuf) {
      if (rawBuf[0] === 0xEF && rawBuf[1] === 0xBB && rawBuf[2] === 0xBF) return rawBuf.slice(3).toString('utf8');
      try { return new TextDecoder('utf-8', { fatal: true }).decode(rawBuf); }
      catch (e) { try { return new TextDecoder('shift_jis').decode(rawBuf); } catch (e2) {} return rawBuf.toString('utf8'); }
    }
    const ct = req.headers['content-type'] || '';
    const buf = await readBody(req);
    let fileBuf = null, importCompany = co, importMedia = 'indeed', importMode = 'insert', importCountNew = false;
    if (ct.includes('multipart/form-data')) {
      const boundaryMatch = ct.match(/boundary=(.+)$/);
      const parts = parseMultipart(buf, boundaryMatch[1].trim());
      for (const p of parts) {
        if (/name="company"/.test(p.header)) importCompany = p.content.toString('utf8').trim();
        else if (/name="media"/.test(p.header)) importMedia = p.content.toString('utf8').trim();
        else if (/name="mode"/.test(p.header)) importMode = p.content.toString('utf8').trim();
        else if (/name="countnew"/.test(p.header)) importCountNew = p.content.toString('utf8').trim() === '1';
        else if (/filename=/.test(p.header)) fileBuf = p.content;
      }
    } else {
      fileBuf = buf;
      importCompany = query.company || co;
      importMedia = query.media || 'indeed';
      importMode = query.mode || 'insert';
      importCountNew = query.countnew === '1';
    }

    // Excel(.xlsx) は ZIP署名(PK\x03\x04)で判定。それ以外は CSV として解析。
    let rows;
    const isXlsx = fileBuf && fileBuf.length > 4 &&
      fileBuf[0] === 0x50 && fileBuf[1] === 0x4B && fileBuf[2] === 0x03 && fileBuf[3] === 0x04;
    if (isXlsx) {
      try { rows = parseXlsx(fileBuf); }
      catch (e) {
        sendJSON(res, 400, { ok: false, error: 'Excelファイルの読み込みに失敗しました: ' + e.message });
        return;
      }
    } else {
      rows = parseCSV(decodeCsvBuffer(fileBuf || Buffer.alloc(0)));
    }

    // ── 架電結果の反映モード: 既存応募者の対応状況・架電回数・メモを更新（新規追加しない）──
    if (importMode === 'update') {
      let updated = 0, notFound = 0, skipped = 0;
      const notFoundNames = [];
      for (const row of rows) {
        const mapped = mapOpsCSVRow(row, importCompany, importMedia);
        if (!mapped.name || (!mapped.phone && !mapped.email)) { skipped++; continue; }
        const nPhone = normalizePhone(mapped.phone);
        const nEmail = normalizeEmail(mapped.email);
        const existing = await Applicants.findByContact(nPhone, nEmail, importCompany);
        if (!existing) { notFound++; if (notFoundNames.length < 5) notFoundNames.push(mapped.name); continue; }
        await Ops.updateCall(existing.id, {
          callCount: mapped.callCount,
          status:    mapped.status,
          notes:     mapped.notes || undefined,
        });
        updated++;
      }
      await Logs.create('ops_csv_update', 'success', `${importCompany}/${importMedia}: ${updated}件更新・${notFound}件該当なし`);
      sendJSON(res, 200, { ok: true, mode: 'update', updated, notFound, skipped, notFoundNames, rows: rows.length });
      return;
    }

    // ── 新規取込モード（デフォルト）──
    // importCountNew=true: 本日(JST)の新着として計上（applied_at=今日・架電リストへ）。
    //   既存（重複）が見つかった場合は重複登録せず本日の新着へ昇格する。
    let imported = 0, duplicates = 0, skipped = 0;
    const skipReasons = [];
    const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const row of rows) {
      const mapped = mapOpsCSVRow(row, importCompany, importMedia);
      if (!mapped.name || (!mapped.phone && !mapped.email)) { skipped++; skipReasons.push('名前/連絡先なし'); continue; }
      const nPhone = normalizePhone(mapped.phone);
      const nEmail = normalizeEmail(mapped.email);
      const dupId = await Applicants.findDuplicate(nPhone, nEmail);
      if (dupId) {
        // 重複は昇格せず、架電リストに「重複」バッジ付きで表示する（アーカイブしない）
        await Applicants.create({ ...mapped, isImported: importCountNew ? 0 : 1, appliedAt: importCountNew ? todayJST : undefined, allowEmptyDate: !importCountNew, isArchived: 0, isDuplicate: 1, duplicateOfId: dupId, status: '重複' });
        duplicates++;
      } else if (importCountNew) {
        await Applicants.create({ ...mapped, isImported: 0, appliedAt: todayJST, isArchived: 0 });
        imported++;
      } else {
        await Applicants.create({ ...mapped, isImported: 1 });
        imported++;
      }
    }
    await Logs.create('ops_csv_import', 'success', `${importCompany}/${importMedia}: ${imported}件取込・${duplicates}件重複${importCountNew ? '（本日の新着として計上）' : ''}`);
    sendJSON(res, 200, { ok: true, imported, duplicates, skipped, skipReasons: skipReasons.slice(0, 5), rows: rows.length });
    return;
  }

  // ── スプレッドシート出力（会社=タブ・媒体=セクション）──
  // フィルタ（company / media / status / month）に合わせて抽出。
  // フィルタ無し＝全社フルブック（架電リストの出力）、フィルタ有り＝絞り込み（過去応募者の出力）。
  if (pathname === '/api/ops/calls/export' && method === 'GET') {
    const fCompany = (query.company && query.company !== 'all') ? query.company
                   : (query.co && query.co !== 'all') ? query.co : null;
    const fMedia   = (query.media && query.media !== 'all') ? query.media : null;
    const fStatus  = (query.status && query.status !== 'all') ? query.status : null;
    const fMonth   = (query.month && query.month !== 'all') ? query.month : null;
    // active=1: 架電対象（新規/架電済(不通)/対応中）のみ＝朝の架電リスト。対応終了などは除外。
    const activeOnly = query.active === '1' || query.active === 'true';

    let all = await Ops.listCalls({ company: fCompany, media: fMedia, status: fStatus, month: fMonth });
    if (activeOnly) {
      const ACTIVE = ['新規', '架電済(不通)', '対応中'];
      all = all.filter(a => ACTIVE.includes(a.status) && !a.is_duplicate);
    }
    const mediaLabel = id => { const m = OPS_MEDIA.find(x => x.id === id); return m ? m.name : (id || '不明'); };

    const HEADERS = ['媒体', '名前', '電話番号', 'メールアドレス', '性別', '生年月日', '年齢', '居住地', '現在の職業', '求人タイトル', '経験', '学歴', '勤務地', '応募日', '架電回数', '対応状況', '最終架電日', '重複', 'メモ'];
    // O列=架電回数（index14）, P列=対応状況（index15） のドロップダウン
    const CALL_VALIDATIONS = [
      { sqref: 'O2:O10000', list: ['1','2','3','4','5','6','7','8','9','10'] },
      { sqref: 'P2:P10000', list: ['新規','架電済(不通)','対応中','対応終了','断られた','辞退','重複'] },
    ];
    const rowFor = a => [
      mediaLabel(a.media), a.name || '', a.phone || '', a.email || '',
      a.gender || '', a.birth_date || '', a.age || '', a.address || '',
      a.current_job || '', a.job_title || '', a.experience || '', a.education || '', a.work_location || '',
      (a.applied_at || '').slice(0, 10),
      a.call_count || 0, a.status || '', (a.last_called_at || '').slice(0, 10),
      a.is_duplicate ? '重複' : '', (a.notes || '').replace(/[\r\n]+/g, ' '),
    ];

    // 出力対象の会社・媒体（フィルタで絞られていればその分のみ）
    const companies = fCompany ? OPS_COMPANIES.filter(c => c.id === fCompany) : OPS_COMPANIES;
    const mediaList = fMedia   ? OPS_MEDIA.filter(m => m.id === fMedia)       : OPS_MEDIA;

    const sheets = companies.map(co => {
      const coApps = all.filter(a => a.company === co.id);
      const rows = [];
      rows.push(HEADERS.map(h => ({ v: h, style: 'header' })));
      if (!coApps.length) {
        rows.push(['該当する応募者がいません', '', '', '', '', '', '', '', '', '', '', '']);
      } else {
        for (const m of mediaList) {
          const grp = coApps.filter(a => a.media === m.id);
          if (!grp.length) continue;
          rows.push([{ v: `▼ ${m.name}（${grp.length}件）`, style: 'section' },
            ...Array(HEADERS.length - 1).fill({ v: '', style: 'section' })]);
          grp.forEach(a => rows.push(rowFor(a)));
        }
        // 媒体未設定（媒体フィルタが無いときのみ表示）
        if (!fMedia) {
          const noMedia = coApps.filter(a => !OPS_MEDIA.some(m => m.id === a.media));
          if (noMedia.length) {
            rows.push([{ v: `▼ その他・媒体未設定（${noMedia.length}件）`, style: 'section' },
              ...Array(HEADERS.length - 1).fill({ v: '', style: 'section' })]);
            noMedia.forEach(a => rows.push(rowFor(a)));
          }
        }
      }
      return { name: co.short || co.id, rows, validations: CALL_VALIDATIONS };
    });

    const buf = buildXlsx(sheets.length ? sheets : [{ name: 'data', rows: [HEADERS.map(h => ({ v: h, style: 'header' }))], validations: CALL_VALIDATIONS }]);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const parts = [activeOnly ? '架電対象' : null, fCompany, fMedia, fStatus, fMonth].filter(Boolean).join('_');
    const fname = `applicants_${stamp}${parts ? '_' + parts : ''}.xlsx`;
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fname)}"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // 共有スプレッドシート（Google Sheets）連携
  //   push : DB → スプレッドシート（会社ごとタブ・新規分のみ追記）
  //   pull : スプレッドシート → DB（対応状況・架電回数・メモを更新）
  // ══════════════════════════════════════════════════════════════

  // 設定状況（UIの表示制御用）
  if (pathname === '/api/ops/sheets/status' && method === 'GET') {
    sendJSON(res, 200, {
      ok: true,
      configured: gsheets.isConfigured(),
      url: gsheets.isConfigured() ? gsheets.sheetUrl() : null,
      pastConfigured: gsheets.isPastConfigured(),
      pastUrl: gsheets.isPastConfigured() ? gsheets.pastSheetUrl() : null,
    });
    return;
  }

  // DB → スプレッドシートへ反映（重複を除いた応募者を、未登録分だけ各社タブに追記）
  if (pathname === '/api/ops/sheets/push' && method === 'POST') {
    if (!gsheets.isConfigured()) {
      sendJSON(res, 400, { ok: false, error: 'Googleスプレッドシート連携が未設定です（GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEET_ID）' });
      return;
    }
    try {
      const r = await pushToSheets({ gsheets, Ops, Logs, companies: OPS_COMPANIES, statuses: CALL_STATUSES, mediaList: OPS_MEDIA });
      sendJSON(res, 200, { ok: true, ...r, url: gsheets.sheetUrl() });
    } catch (e) {
      await Logs.create('sheets_push', 'error', String(e.message || e));
      sendJSON(res, 500, { ok: false, error: String(e.message || e) });
    }
    return;
  }

  // 過去応募者（アーカイブ済み）を「別スプレッドシート」へ出力
  //   GOOGLE_PAST_SHEET_ID で指定した、架電用とは別のスプレッドシートに書き出す
  if (pathname === '/api/ops/sheets/push-past' && method === 'POST') {
    if (!gsheets.isPastConfigured()) {
      sendJSON(res, 400, { ok: false, error: '過去応募者用スプレッドシートが未設定です（GOOGLE_PAST_SHEET_ID）' });
      return;
    }
    try {
      const pastId = process.env.GOOGLE_PAST_SHEET_ID;
      const r = await gsheets.withSheetId(pastId, () =>
        pushToSheets({ gsheets, Ops, Logs, companies: OPS_COMPANIES, statuses: CALL_STATUSES, mediaList: OPS_MEDIA, archived: true })
      );
      sendJSON(res, 200, { ok: true, ...r, url: gsheets.pastSheetUrl() });
    } catch (e) {
      await Logs.create('sheets_push', 'error', '過去応募者出力: ' + String(e.message || e));
      sendJSON(res, 500, { ok: false, error: String(e.message || e) });
    }
    return;
  }

  // スプレッドシート → DB に取込（IDで突合し対応状況・架電回数・メモを更新）
  if (pathname === '/api/ops/sheets/pull' && method === 'POST') {
    if (!gsheets.isConfigured()) {
      sendJSON(res, 400, { ok: false, error: 'Googleスプレッドシート連携が未設定です（GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEET_ID）' });
      return;
    }
    try {
      const r = await pullFromSheets({ gsheets, Ops, Applicants, Logs });
      sendJSON(res, 200, { ok: true, ...r, url: gsheets.sheetUrl() });
    } catch (e) {
      await Logs.create('sheets_pull', 'error', String(e.message || e));
      sendJSON(res, 500, { ok: false, error: String(e.message || e) });
    }
    return;
  }

  // 推薦管理・案件精査シートを初期化（タブがなければ作成し、ヘッダ＋書式を設定）
  if (pathname === '/api/ops/sheets/init-recruitment' && method === 'POST') {
    if (!gsheets.isConfigured()) {
      sendJSON(res, 400, { ok: false, error: 'Googleスプレッドシート連携が未設定です（GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEET_ID）' });
      return;
    }
    try {
      const r = await initRecruitmentSheets({ gsheets, Logs });
      sendJSON(res, 200, { ok: true, ...r, url: gsheets.sheetUrl() });
    } catch (e) {
      await Logs.create('sheets_init_recruitment', 'error', String(e.message || e));
      sendJSON(res, 500, { ok: false, error: String(e.message || e) });
    }
    return;
  }

  // ── 重複チェック（全データ横断・電話番号 or メールが一致したら重複）──
  // 表記揺れは normalized_phone / normalized_email で吸収済み。
  // 会社・媒体を問わず、どちらか一方でも一致すれば後から応募した方を「重複」にする。
  if (pathname === '/api/ops/check-dup' && method === 'POST') {
    const all = await Ops.listCalls({}); // 全件
    // 応募日時の昇順（早い方を「元データ」、後から来た方を重複に）
    all.sort((a, b) => String(a.applied_at || a.created_at || '').localeCompare(String(b.applied_at || b.created_at || '')));

    const phoneMap = new Map(); // normalized_phone -> 元データ id
    const emailMap = new Map(); // normalized_email -> 元データ id
    let flagged = 0;
    const results = []; // 新規に重複フラグを立てた一覧（UI表示用）

    for (const a of all) {
      const p = a.normalized_phone || '';
      const e = a.normalized_email || '';
      // 電話 or メールのどちらかが既出なら重複
      let originalId = null;
      if (p && phoneMap.has(p)) originalId = phoneMap.get(p);
      if (!originalId && e && emailMap.has(e)) originalId = emailMap.get(e);

      if (originalId) {
        if (!a.is_duplicate) {
          await Ops.markDuplicate(a.id, originalId);
          flagged++;
          // 結果一覧用に重複者と参照元の情報を収集
          const orig = Applicants.findById(originalId);
          if (orig) results.push({ dup: a, orig });
        }
        // この応募者の連絡先も元データに紐付けて登録（連鎖一致に対応）
        if (p && !phoneMap.has(p)) phoneMap.set(p, originalId);
        if (e && !emailMap.has(e)) emailMap.set(e, originalId);
      } else {
        if (p) phoneMap.set(p, a.id);
        if (e) emailMap.set(e, a.id);
      }
    }
    const companyLabel = id => { const c = OPS_COMPANIES.find(x => x.id === id); return c ? (c.label || c.short || id) : (id || ''); };
    const mediaLabel   = id => { const m = OPS_MEDIA.find(x => x.id === id);    return m ? m.name : (id || '不明'); };
    const fmt = a => ({
      id: a.id, name: a.name, phone: a.phone, email: a.email,
      company: companyLabel(a.company), media: mediaLabel(a.media),
      appliedAt: (a.applied_at || '').slice(0, 10),
      status: a.status, callCount: a.call_count || 0, notes: a.notes || '',
    });
    sendJSON(res, 200, {
      ok: true, flagged,
      results: results.map(({ dup, orig }) => ({ dup: fmt(dup), orig: fmt(orig) })),
    });
    return;
  }

  // ── 重複応募者を削除 ──
  if (pathname === '/api/ops/archive-dups' && method === 'POST') {
    const body = await parseJSON(req);
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length) { sendJSON(res, 400, { ok: false, error: 'ids required' }); return; }
    let archived = 0;
    for (const id of ids) {
      const r = db.prepare(`DELETE FROM applicants WHERE id=?`).run(id);
      if (r.changes) archived++;
    }
    sendJSON(res, 200, { ok: true, archived });
    return;
  }

  // ── API: Jobs CRUD ──
  if (pathname === '/api/jobs' && method === 'GET') {
    const company = query.company || null;
    sendJSON(res, 200, await Jobs.findAll({ company }));
    return;
  }
  if (pathname === '/api/jobs' && method === 'POST') {
    const body = await parseJSON(req);
    if (!body.title) { sendError(res, 400, 'タイトルは必須です'); return; }
    if (body.location) body.location = normLocation(body.location);
    if (!body.company) body.company = co;
    sendJSON(res, 201, await Jobs.create(body));
    return;
  }
  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const id = jobMatch[1];
    if (method === 'GET') {
      const j = await Jobs.findById(id);
      if (!j) { sendError(res, 404, '求人が見つかりません'); return; }
      sendJSON(res, 200, j);
      return;
    }
    if (method === 'PUT') {
      const body = await parseJSON(req);
      if (body.location) body.location = normLocation(body.location);
      const j = await Jobs.update(id, body);
      sendJSON(res, 200, j);
      return;
    }
    if (method === 'DELETE') {
      await Jobs.delete(id);
      sendJSON(res, 200, { ok: true });
      return;
    }
  }

  // ── API: Applicants ──
  if (pathname === '/api/applicants' && method === 'GET') {
    const company = query.company || null;
    sendJSON(res, 200, await Applicants.findAll({ company }));
    return;
  }
  const appMatch = pathname.match(/^\/api\/applicants\/([^/]+)$/);
  if (appMatch) {
    const id = appMatch[1];
    if (method === 'PUT') {
      const body = await parseJSON(req);
      sendJSON(res, 200, await Applicants.update(id, body));
      return;
    }
    if (method === 'GET') {
      const a = await Applicants.findById(id);
      if (!a) { sendError(res, 404, '応募者が見つかりません'); return; }
      sendJSON(res, 200, a);
      return;
    }
  }

  // ── API: XML Feed ──
  if (pathname === '/api/feed/kyujinbox' && method === 'GET') {
    const jobs = await Jobs.findAll(true);
    const xml = generateKyujinboxXML(jobs);
    await Logs.create('xml_generate', 'success', `求人ボックスXML生成: ${jobs.length}件`);
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="kyujinbox-feed.xml"' });
    res.end(xml);
    return;
  }
  if (pathname === '/api/feed/stanby' && method === 'GET') {
    const jobs = await Jobs.findAll({ onlyPublished: true, company: query.company || null });
    const xml = generateStanbyXML(jobs);
    await Logs.create('xml_generate', 'success', `スタンバイXML生成${query.company ? '(' + query.company + ')' : ''}: ${jobs.length}件`);
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="stanby-feed.xml"' });
    res.end(xml);
    return;
  }

  // ── API: CSV Import ──
  if (pathname === '/api/import/csv' && method === 'POST') {
    const buf = await readBody(req);
    const ct = req.headers['content-type'] || '';
    // Shift-JIS / UTF-8 自動検出デコード
    function decodeCsvBuffer(rawBuf) {
      // UTF-8 BOM チェック
      if (rawBuf[0] === 0xEF && rawBuf[1] === 0xBB && rawBuf[2] === 0xBF) {
        return rawBuf.slice(3).toString('utf8');
      }
      // まず UTF-8 として厳密にデコードを試す（Indeed/求人ボックスCSVはUTF-8）
      // UTF-8として妥当ならそのまま採用。不正なら Shift-JIS にフォールバック。
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(rawBuf);
      } catch (e) {
        try {
          return new TextDecoder('shift_jis').decode(rawBuf);
        } catch (e2) {}
        return rawBuf.toString('utf8');
      }
    }

    let csvText = '';
    if (ct.includes('multipart/form-data')) {
      const boundaryMatch = ct.match(/boundary=([^;]+)/);
      if (!boundaryMatch) { sendError(res, 400, 'boundary not found'); return; }
      const parts = parseMultipart(buf, boundaryMatch[1].trim());
      const filePart = parts.find(p => p.header.includes('filename'));
      if (!filePart) { sendError(res, 400, 'ファイルが見つかりません'); return; }
      csvText = decodeCsvBuffer(filePart.content);
    } else {
      csvText = decodeCsvBuffer(buf);
    }

    const rows = parseCSV(csvText);
    let imported = 0, duplicates = 0, skipped = 0;
    const skipReasons = [];
    for (const row of rows) {
      const mapped = mapCSVRow(row);
      if (!mapped.name || (!mapped.phone && !mapped.email)) {
        skipped++;
        if (skipReasons.length < 3) skipReasons.push(`name="${mapped.name}" phone="${mapped.phone}" email="${mapped.email}"`);
        continue;
      }
      const dupId = await checkDuplicate(mapped);
      await Applicants.create({ ...mapped, status: mapped.status || '新規' });
      if (dupId) duplicates++; else imported++;
    }
    await Logs.create('csv_import', 'success', `CSV取込: ${imported}件新規, ${duplicates}件重複, ${skipped}件スキップ`);
    sendJSON(res, 200, { ok: true, imported, duplicates, skipped, skipReasons, total: imported + duplicates, rows: rows.length });
    return;
  }

  // ── API: CSV Export ──
  if (pathname === '/api/export/csv' && method === 'GET') {
    // 注: 現行ハンドラでは query = parsed.query。parsedUrl は存在しないので使わない。
    const type  = query.type   || query.filter  || 'all';
    const month = query.month  || '';
    // 新リスト出力ボタンは co=、既存ボタンは company= を送る。'all' は全社合算。
    const coParam = query.co || query.company || '';
    let applicants = await Applicants.findAll();
    // 右上の exportCSV ボタン（type なし）→ アーカイブ除外
    // ①②③の exportList ボタン（type あり）→ アーカイブ含む
    const hasType = !!query.type;
    if (!hasType) {
      applicants = applicants.filter(a => !a.is_archived);
    }
    if (coParam && coParam !== 'all') {
      applicants = applicants.filter(a => (a.company || '') === coParam);
    }
    let filtered, label;
    if (type === 'new') {
      filtered = applicants.filter(a => ['新規', '未対応'].includes(a.status));
      label = '新規リスト';
    } else if (type === 'monthly') {
      filtered = month ? applicants.filter(a => (a.applied_at || '').startsWith(month)) : applicants;
      label = month ? `全応募者_${month}` : '全応募者';
    } else if (type === 'ng') {
      filtered = applicants.filter(a => {
        const isNG = ['NG', '見送り', '不採用'].includes(a.status);
        const inMonth = month ? (a.applied_at || '').startsWith(month) : true;
        return isNG && inMonth;
      });
      label = month ? `NGリスト_${month}` : 'NGリスト';
    } else {
      filtered = applicants;
      label = (coParam && coParam !== 'all') ? coParam : 'all';
    }
    // 単一会社に絞った場合は会社列不要。全社/リスト出力では会社列を含める。
    const includeCompany = !(coParam && coParam !== 'all');
    const csv = generateCSV(filtered, includeCompany);
    const filename = `${label}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    });
    res.end('﻿' + csv); // BOM for Excel
    return;
  }

  // ── API: VPN Status ──
  if (pathname === '/api/vpn/status' && method === 'GET') {
    const connected = await checkVPN();
    sendJSON(res, 200, { connected, ts: Date.now() });
    return;
  }

  // ── API: VPN Debug (raw vpncmd output) ──
  if (pathname === '/api/vpn/debug' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    const vpncmdPath = findVpncmd();
    if (!vpncmdPath) {
      sendJSON(res, 200, { vpncmdPath: null, error: 'vpncmd.exe が見つかりません', searchedPaths: [
        process.env.VPNCMD_PATH,
        'C:\\Program Files\\SoftEther VPN Client\\vpncmd.exe',
        'C:\\Program Files (x86)\\SoftEther VPN Client\\vpncmd.exe',
      ]});
      return;
    }
    const raw = await vpncmdAccountList(vpncmdPath);
    sendJSON(res, 200, { vpncmdPath, raw, lines: raw.split(/\r?\n/) });
    return;
  }

  // ── API: VPN Connect (SoftEther) ──
  if (pathname === '/api/vpn/connect' && method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const result = await vpnConnect();
    sendJSON(res, 200, result);
    return;
  }

  // ── API: Indeed Scrape (SSE) ──
  if (pathname === '/api/scrape/indeed' && method === 'GET') {
    sseInit(res);
    const logId = await Logs.create('indeed_scrape', 'running', '開始');

    sseSend(res, { message: 'VPN接続を確認しています...', type: 'info' });
    const vpnOk = await checkVPN();
    if (!vpnOk) {
      sseSend(res, { message: '❌ VPN未接続です。処理を中止します。', type: 'error', done: true, success: false });
      await Logs.create('indeed_scrape', 'error', 'VPN未接続');
      res.end();
      return;
    }

    const scriptPath = path.join(SCRIPTS_DIR, 'indeed_scraper.py');
    if (!fs.existsSync(scriptPath)) {
      sseSend(res, { message: '⚠️ スクレイパースクリプトが見つかりません（scripts/indeed_scraper.py）', type: 'warn' });
      sseSend(res, { message: 'デモモード: サンプルデータを取込します...', type: 'info' });
      // Demo: create sample applicants
      const samples = [
        { name: '田中 花子', phone: '090-1234-5678', email: 'hanako@example.com', sourceMedia: 'Indeed', appliedAt: new Date().toISOString() },
        { name: '佐藤 次郎', phone: '080-8765-4321', email: 'jiro@example.com', sourceMedia: 'Indeed', appliedAt: new Date().toISOString() },
        { name: '鈴木 三郎', phone: '070-1111-2222', email: 'saburo@example.com', sourceMedia: 'Indeed', appliedAt: new Date().toISOString() },
      ];
      let count = 0;
      for (const s of samples) {
        const dup = await checkDuplicate(s);
        await Applicants.create({ ...s, status: '新規' });
        count++;
        sseSend(res, { message: `✅ 取得: ${s.name}（${s.phone}）`, type: 'success' });
        await new Promise(r => setTimeout(r, 300));
      }
      await Logs.create('indeed_scrape', 'success', `Indeed取込完了（デモ）: ${count}件`);
      sseSend(res, { message: `✅ 完了: ${count}件取得しました（デモモード）`, type: 'success', done: true, success: true });
      res.end();
      return;
    }

    // Run real Python script
    sseSend(res, { message: '🔑 Indeedにログイン中...', type: 'info' });
    const env = { ...process.env };
    const proc = spawn(PYTHON_CMD, [scriptPath], { env });
    let count = 0;

    const indeedKeepalive = setInterval(() => {
      if (!res.writableEnded) res.write(': keepalive\n\n');
    }, 15000);

    proc.stdout.on('data', async data => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'progress') {
            sseSend(res, { message: obj.message, type: obj.level || 'info' });
          } else if (obj.type === 'applicant') {
            const dup = await checkDuplicate(obj.data);
            await Applicants.create({ ...obj.data, sourceMedia: 'Indeed', status: '新規' });
            count++;
            sseSend(res, { message: `✅ 取得: ${obj.data.name}（${obj.data.phone}）`, type: 'success' });
          }
        } catch {
          sseSend(res, { message: line, type: 'info' });
        }
      }
    });

    proc.stderr.on('data', data => {
      sseSend(res, { message: `⚠️ ${data.toString().trim()}`, type: 'warn' });
    });

    proc.on('close', async code => {
      clearInterval(indeedKeepalive);
      const ok = code === 0;
      const msg = ok ? `✅ Indeed取込完了: ${count}件取得` : `❌ Indeed取込失敗（コード: ${code}）`;
      await Logs.create('indeed_scrape', ok ? 'success' : 'error', msg);
      notify(msg, { emoji: ok ? ':white_check_mark:' : ':x:' }).catch(() => {});
      sseSend(res, {
        message: ok ? `✅ 完了: ${count}件取得しました` : `❌ スクレイピングが失敗しました（終了コード: ${code}）`,
        type: ok ? 'success' : 'error',
        done: true,
        success: ok
      });
      res.end();
    });

    req.on('close', () => { clearInterval(indeedKeepalive); try { proc.kill(); } catch {} });
    return;
  }

  // ── API: Kyujinbox Post (Polling: POST to start, GET poll) ──
  // Replaced SSE which drops through Cloudflare Tunnel at ~75 s
  if (pathname === '/api/post/kyujinbox' && method === 'POST') {
    const vpnOk = await checkVPN();
    if (!vpnOk) {
      await Logs.create('kyujinbox_post', 'error', 'VPN未接続');
      return sendJSON(res, 400, { error: '❌ VPN未接続です。処理を中止します。' });
    }

    const startBody   = await parseJSON(req);
    const batchSize   = Math.min(parseInt(startBody.limit || '25', 10), 25);
    const kbCompany   = startBody.company || null;
    const forceRepost = startBody.forceRepost === true || startBody.forceRepost === 'true';
    const allJobs     = await Jobs.findAll({ onlyPublished: true, company: kbCompany });
    let kbJobs = allJobs.filter(j => {
      const m = JSON.parse(j.target_media || '[]');
      return m.includes('求人ボックス') || m.includes('kyujinbox');
    });
    if (kbJobs.length === 0) kbJobs = allJobs;

    // Skip already-posted jobs unless forceRepost is set
    const alreadyPosted = kbJobs.filter(j => j.kyujinbox_posted_at);
    if (!forceRepost) {
      kbJobs = kbJobs.filter(j => !j.kyujinbox_posted_at);
    }

    if (kbJobs.length === 0) {
      const msg = alreadyPosted.length > 0
        ? `⚠️ 未投稿の求人がありません（${alreadyPosted.length}件は投稿済み）。再投稿するには「強制再投稿」ボタンを使ってください。`
        : '⚠️ 公開中の求人がありません';
      return sendJSON(res, 400, { error: msg, allPosted: alreadyPosted.length > 0 });
    }

    const { id, session } = createSession();
    const pushLog = (message, type = 'info') => {
      session.logs.push({ message: String(message ?? ''), type });
    };

    if (alreadyPosted.length > 0 && !forceRepost) {
      pushLog(`ℹ️ 投稿済みをスキップ: ${alreadyPosted.length}件（未投稿 ${kbJobs.length}件を投稿します）`, 'info');
    }

    sendJSON(res, 200, { ok: true, sessionId: id });

    // Run Python poster asynchronously (response already sent)
    (async () => {
      const scriptPath = path.join(SCRIPTS_DIR, 'kyujinbox_poster.py');
      if (!fs.existsSync(scriptPath)) {
        pushLog('⚠️ 投稿スクリプトが見つかりません（scripts/kyujinbox_poster.py）', 'warn');
        pushLog('デモモード: 投稿シミュレーションを実行します...', 'info');
        const target = kbJobs[0];
        pushLog('🔑 求人ボックスにログイン中...', 'info');
        await new Promise(r => setTimeout(r, 800));
        pushLog(`📝 「${target.title}」を投稿中...`, 'info');
        await new Promise(r => setTimeout(r, 1200));
        pushLog(`✅ 「${target.title}」を投稿しました`, 'success');
        await Logs.create('kyujinbox_post', 'success', `求人ボックス投稿（デモ）: ${target.title}`);
        pushLog('✅ 完了: 1件投稿しました（デモモード）', 'success');
        session.done = true; session.success = true;
        return;
      }

      pushLog(`📋 求人ボックス向け求人 ${Math.min(batchSize, kbJobs.length)}件を投稿します...`, 'info');
      // Build a map of id→job for posted-at tracking
      const jobIdMap = Object.fromEntries(kbJobs.map(j => [j.id, j]));
      const jobsJson = JSON.stringify(kbJobs.slice(0, batchSize));
      const proc = spawn(PYTHON_CMD, [scriptPath], {
        env: { ...process.env, KYUJINBOX_BATCH_SIZE: String(batchSize) }
      });
      proc.stdin.write(jobsJson);
      proc.stdin.end();

      proc.stdout.on('data', data => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            // Track successfully posted jobs
            if (obj.type === 'posted' && obj.jobId && jobIdMap[obj.jobId]) {
              const ts = new Date().toISOString();
              Jobs.update(obj.jobId, { kyujinbox_posted_at: ts });
              pushLog(`📌 投稿済みとしてマーク: ${jobIdMap[obj.jobId].title}`, 'info');
            } else {
              pushLog(obj.message, obj.level || 'info');
            }
          } catch {
            pushLog(line, 'info');
          }
        }
      });

      proc.stderr.on('data', data => {
        const txt = data.toString().trim();
        if (txt) pushLog(`⚠️ ${txt}`, 'warn');
      });

      proc.on('error', err => {
        pushLog(`❌ プロセス起動失敗: ${err.message}`, 'error');
        session.done = true; session.success = false;
      });

      proc.on('close', async code => {
        const ok = code === 0;
        const msg = ok ? '✅ 求人ボックス投稿完了' : `❌ 求人ボックス投稿失敗(exit ${code})`;
        await Logs.create('kyujinbox_post', ok ? 'success' : 'error', msg);
        notify(msg, { emoji: ok ? ':rocket:' : ':x:' }).catch(() => {});
        pushLog(
          ok ? '✅ 求人ボックスへの投稿が完了しました' : `❌ 投稿が失敗しました（コード: ${code}）`,
          ok ? 'success' : 'error'
        );
        session.done = true; session.success = ok;
      });
    })().catch(err => {
      pushLog(`❌ 内部エラー: ${err.message}`, 'error');
      session.done = true; session.success = false;
    });
    return;
  }

  // ── API: Kyujinbox Post Poll ──
  if (pathname === '/api/post/kyujinbox/poll' && method === 'GET') {
    const sid = query.id;
    const from = parseInt(query.from || '0', 10);
    const session = postSessions.get(sid);
    if (!session) return sendJSON(res, 404, { error: 'session not found' });
    return sendJSON(res, 200, {
      logs: session.logs.slice(from),
      total: session.logs.length,
      done: session.done,
      success: session.success,
    });
  }

  // ── API: Kyujinbox reset posted status ──
  if (pathname === '/api/post/kyujinbox/reset' && method === 'POST') {
    const body    = await parseJSON(req);
    const company = body.company || null;
    const allJobs = await Jobs.findAll({ company });
    const posted  = allJobs.filter(j => j.kyujinbox_posted_at);
    for (const j of posted) {
      Jobs.update(j.id, { kyujinbox_posted_at: null });
    }
    return sendJSON(res, 200, { ok: true, reset: posted.length });
  }

  // Googleしごと検索 7日経過求人を手動除外
  if (pathname === '/api/google/expire' && method === 'POST') {
    const body = await parseJSON(req);
    const days = parseInt(body.days, 10) || 7;
    const count = Jobs.expireGoogleJobs(days);
    if (count > 0) {
      Logs.create('google_expire', 'success', `手動実行: Googleしごと検索から除外 ${count}件（掲載${days}日経過）`);
    }
    return sendJSON(res, 200, { ok: true, expired: count, days });
  }

  // ── スタンバイ投稿（ポーリング方式・ボタン1回で16件）──
  if (pathname === '/api/post/stanby' && method === 'POST') {
    const vpnOk = await checkVPN();
    if (!vpnOk) {
      await Logs.create('stanby_post', 'error', 'VPN未接続');
      return sendJSON(res, 400, { error: '❌ VPN未接続です。処理を中止します。' });
    }

    const startBody = await parseJSON(req);
    const batchSize = Math.min(parseInt(startBody.limit || '16', 10), 16);
    const sbCompany = startBody.company || null;
    const allJobs   = await Jobs.findAll({ onlyPublished: true, company: sbCompany });
    let sbJobs = allJobs.filter(j => {
      const m = JSON.parse(j.target_media || '[]');
      return m.includes('スタンバイ') || m.includes('stanby');
    });
    if (sbJobs.length === 0) sbJobs = allJobs;

    if (sbJobs.length === 0) {
      return sendJSON(res, 400, { error: '⚠️ 公開中の求人がありません' });
    }

    const { id, session } = createSession();
    const pushLog = (message, type = 'info') => {
      session.logs.push({ message: String(message ?? ''), type });
    };

    sendJSON(res, 200, { ok: true, sessionId: id });

    (async () => {
      const scriptPath = path.join(SCRIPTS_DIR, 'stanby_poster.py');
      if (!fs.existsSync(scriptPath)) {
        pushLog('⚠️ 投稿スクリプトが見つかりません（scripts/stanby_poster.py）', 'warn');
        pushLog('デモモード: 投稿シミュレーションを実行します...', 'info');
        const target = sbJobs[0];
        pushLog('🔑 スタンバイにログイン中...', 'info');
        await new Promise(r => setTimeout(r, 800));
        pushLog(`📝 「${target.title}」を投稿中...`, 'info');
        await new Promise(r => setTimeout(r, 1200));
        pushLog(`✅ 「${target.title}」を投稿しました`, 'success');
        await Logs.create('stanby_post', 'success', `スタンバイ投稿（デモ）: ${target.title}`);
        pushLog('✅ 完了: 1件投稿しました（デモモード）', 'success');
        session.done = true; session.success = true;
        return;
      }

      pushLog(`📋 スタンバイ向け求人 ${Math.min(batchSize, sbJobs.length)}件を投稿します...`, 'info');
      const jobsJson = JSON.stringify(sbJobs.slice(0, batchSize));
      const proc = spawn(PYTHON_CMD, [scriptPath], {
        env: { ...process.env, STANBY_BATCH_SIZE: String(batchSize) }
      });
      proc.stdin.write(jobsJson);
      proc.stdin.end();

      proc.stdout.on('data', data => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try { const obj = JSON.parse(line); pushLog(obj.message, obj.level || 'info'); }
          catch { pushLog(line, 'info'); }
        }
      });

      proc.stderr.on('data', data => {
        const txt = data.toString().trim();
        if (txt) pushLog(`⚠️ ${txt}`, 'warn');
      });

      proc.on('error', err => {
        pushLog(`❌ プロセス起動失敗: ${err.message}`, 'error');
        session.done = true; session.success = false;
      });

      proc.on('close', async code => {
        const ok = code === 0;
        const msg = ok ? '✅ スタンバイ投稿完了' : `❌ スタンバイ投稿失敗(exit ${code})`;
        await Logs.create('stanby_post', ok ? 'success' : 'error', msg);
        notify(msg, { emoji: ok ? ':rocket:' : ':x:' }).catch(() => {});
        pushLog(ok ? '✅ スタンバイへの投稿が完了しました' : `❌ 投稿が失敗しました（コード: ${code}）`, ok ? 'success' : 'error');
        session.done = true; session.success = ok;
      });
    })().catch(err => {
      pushLog(`❌ 内部エラー: ${err.message}`, 'error');
      session.done = true; session.success = false;
    });
    return;
  }

  // ── スタンバイ投稿ポーリング ──
  if (pathname === '/api/post/stanby/poll' && method === 'GET') {
    const sid = query.id;
    const from = parseInt(query.from || '0', 10);
    const session = postSessions.get(sid);
    if (!session) return sendJSON(res, 404, { error: 'session not found' });
    return sendJSON(res, 200, {
      logs: session.logs.slice(from),
      total: session.logs.length,
      done: session.done,
      success: session.success,
    });
  }

  if (pathname === '/api/post/indeed' && method === 'GET') {
    sseInit(res);

    sseSend(res, { message: 'VPN接続を確認しています...', type: 'info' });
    const vpnOk = await checkVPN();
    if (!vpnOk) {
      sseSend(res, { message: '❌ VPN未接続です。処理を中止します。', type: 'error', done: true, success: false });
      await Logs.create('indeed_post', 'error', 'VPN未接続');
      res.end();
      return;
    }

    const indeedJobs = await Jobs.findAll(true);
    if (indeedJobs.length === 0) {
      sseSend(res, { message: '⚠️ 公開中の求人がありません', type: 'warn', done: true, success: false });
      res.end();
      return;
    }

    const indeedScriptPath = path.join(SCRIPTS_DIR, 'indeed_poster.py');
    if (!fs.existsSync(indeedScriptPath)) {
      sseSend(res, { message: '⚠️ 掲載スクリプトが見つかりません（scripts/indeed_poster.py）', type: 'warn' });
      sseSend(res, { message: 'デモモード: 掲載シミュレーションを実行します...', type: 'info' });
      const target = indeedJobs[0];
      sseSend(res, { message: '🔑 Indeed 掲載管理画面にログイン中...', type: 'info' });
      await new Promise(r => setTimeout(r, 800));
      sseSend(res, { message: `📝 「${target.title}」を掲載中...`, type: 'info' });
      await new Promise(r => setTimeout(r, 1200));
      sseSend(res, { message: `✅ 「${target.title}」を掲載しました`, type: 'success' });
      await Logs.create('indeed_post', 'success', `Indeed掲載（デモ）: ${target.title}`);
      sseSend(res, { message: '✅ 完了: 1件掲載しました（デモモード）', type: 'success', done: true, success: true });
      res.end();
      return;
    }

    const indeedJobsJson = JSON.stringify(indeedJobs.slice(0, 2)); // max 2 per day
    const indeedProc = spawn(PYTHON_CMD, [indeedScriptPath], {
      env: { ...process.env },
      stdin: 'pipe'
    });
    indeedProc.stdin.write(indeedJobsJson);
    indeedProc.stdin.end();

    indeedProc.stdout.on('data', data => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          sseSend(res, { message: obj.message, type: obj.level || 'info' });
        } catch {
          sseSend(res, { message: line, type: 'info' });
        }
      }
    });

    indeedProc.stderr.on('data', data => {
      sseSend(res, { message: `⚠️ ${data.toString().trim()}`, type: 'warn' });
    });

    indeedProc.on('close', async code => {
      const ok = code === 0;
      const msg = ok ? '✅ Indeed掲載完了' : `❌ Indeed掲載失敗(exit ${code})`;
      await Logs.create('indeed_post', ok ? 'success' : 'error', msg);
      notify(msg, { emoji: ok ? ':rocket:' : ':x:' }).catch(() => {});
      sseSend(res, {
        message: ok ? '✅ Indeed への掲載が完了しました' : `❌ 掲載が失敗しました（コード: ${code}）`,
        type: ok ? 'success' : 'error',
        done: true,
        success: ok
      });
      res.end();
    });

    req.on('close', () => { try { indeedProc.kill(); } catch {} });
    return;
  }

  // ── 求人ローテーション（手動実行）──
  if (pathname === '/api/admin/rotate-jobs' && method === 'POST') {
    const scriptPath = path.join(SCRIPTS_DIR, 'rotate-jobs.js');
    if (!fs.existsSync(scriptPath)) {
      sendJSON(res, 400, { error: 'rotate-jobs.js が見つかりません' });
      return;
    }
    const rbody = await parseJSON(req);
    const rCompany = rbody.company || 'sq';
    const proc = spawn(process.execPath, ['--experimental-sqlite', scriptPath, '--company', rCompany], {
      env: { ...process.env, COMPANY_ID: rCompany, COMPANY_NAME: companyFullName(rCompany) },
      cwd: path.join(__dirname),
    });
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { out += d.toString(); });
    proc.on('close', async code => {
      const ok = code === 0;
      await Logs.create('rotate_jobs', ok ? 'success' : 'error', out.slice(-500));
      sendJSON(res, ok ? 200 : 500, { ok, output: out });
    });
    return;
  }

  // ── AI求人生成（手動実行）──
  if (pathname === '/api/admin/generate-jobs-ai' && method === 'POST') {
    const scriptPath = path.join(SCRIPTS_DIR, 'generate-jobs-ai.js');
    if (!fs.existsSync(scriptPath)) {
      sendJSON(res, 400, { error: 'generate-jobs-ai.js が見つかりません' });
      return;
    }
    const body = await parseJSON(req);
    const target = body.target || 'all'; // 'kyujinbox' | 'stanby' | 'all'
    const count  = parseInt(body.count || '0', 10);
    const aiCompany = body.company || 'sq';
    const extraArgs = ['--company', aiCompany];
    if (target !== 'all') extraArgs.push('--target', target);
    if (count > 0) extraArgs.push('--count', String(count));

    const proc = spawn(process.execPath, ['--experimental-sqlite', scriptPath, ...extraArgs], {
      env: { ...process.env, COMPANY_ID: aiCompany, COMPANY_NAME: companyFullName(aiCompany) },
      cwd: path.join(__dirname),
    });
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { out += d.toString(); });
    proc.on('close', async code => {
      const ok = code === 0;
      await Logs.create('ai_generate', ok ? 'success' : 'error', out.slice(-800));
      sendJSON(res, ok ? 200 : 500, { ok, output: out });
    });
    return;
  }

  // ── 404 ──
  if (pathname.startsWith('/api/')) {
    sendError(res, 404, 'Not Found');
  } else {
    send(res, 404, `<html><body style="font-family:sans-serif;text-align:center;padding:80px">
      <h2 style="font-size:40px;color:#94a3b8">404</h2>
      <p>ページが見つかりません</p>
      <a href="/">トップへ戻る</a>
    </body></html>`);
  }
  } catch (err) {
    // 1件のリクエストエラーでサーバー全体を落とさない
    console.error(`[handler error] ${method} ${pathname}:`, err);
    try {
      if (!res.headersSent) {
        if (pathname.startsWith('/api/')) sendError(res, 500, 'サーバー内部エラー');
        else send(res, 500, '<html><body style="font-family:sans-serif;text-align:center;padding:80px"><h2>500</h2><p>サーバー内部エラー</p></body></html>');
      } else {
        res.end();
      }
    } catch (_) { /* ignore */ }
  }
});

// プロセスレベルの安全網: 予期せぬ例外でサーバーが落ちないようにする
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

server.listen(PORT, () => {
  console.log(`\n🚀 採用プラットフォーム起動中`);
  console.log(`   管理画面: http://localhost:${PORT}/admin`);
  console.log(`   求人サイト: http://localhost:${PORT}/jobs\n`);

  // Auto-expire jobs on startup
  try {
    const n = Jobs.expireOld();
    if (n > 0) {
      Logs.create('auto_expire', 'success', `起動時に期限切れ求人を自動非公開: ${n}件`);
      console.log(`[auto-expire] ${n}件の求人を非公開にしました`);
    }
  } catch (e) { console.error('[auto-expire] startup error:', e.message); }

  // Google Jobs 7日経過除外（起動時）
  try {
    const ng = Jobs.expireGoogleJobs(7);
    if (ng > 0) {
      Logs.create('google_expire', 'success', `起動時にGoogleしごと検索から除外: ${ng}件（掲載7日経過）`);
      console.log(`[google-expire] ${ng}件をGoogleしごと検索から除外しました`);
    }
  } catch (e) { console.error('[google-expire] startup error:', e.message); }

  // Hourly auto-expire
  setInterval(() => {
    try {
      const n = Jobs.expireOld();
      if (n > 0) {
        Logs.create('auto_expire', 'success', `定期チェック: 期限切れ求人を自動非公開 ${n}件`);
        console.log(`[auto-expire] ${n}件の求人を非公開にしました`);
      }
    } catch (e) { console.error('[auto-expire] interval error:', e.message); }

    // Google Jobs 7日経過除外（毎時）
    try {
      const ng = Jobs.expireGoogleJobs(7);
      if (ng > 0) {
        Logs.create('google_expire', 'success', `定期チェック: Googleしごと検索から除外 ${ng}件（掲載7日経過）`);
        console.log(`[google-expire] ${ng}件をGoogleしごと検索から除外しました`);
      }
    } catch (e) { console.error('[google-expire] interval error:', e.message); }
  }, 60 * 60 * 1000);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ポート ${PORT} は使用中です。PORT環境変数で変更してください。`);
    process.exit(1);
  }
  throw err;
});
