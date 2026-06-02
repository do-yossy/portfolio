'use strict';

const crypto = require('crypto');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '';

// Timing-safe string comparison to prevent timing attacks
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Compare anyway to keep constant time
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Session token store (in-memory; survives restart of single process)
const sessions = new Map(); // token → { expires }
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expires: Date.now() + SESSION_TTL_MS });
  // Clean up expired sessions periodically
  for (const [t, s] of sessions) {
    if (s.expires < Date.now()) sessions.delete(t);
  }
  return token;
}

function validateSession(token) {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  if (s.expires < Date.now()) { sessions.delete(token); return false; }
  return true;
}

function destroySession(token) {
  sessions.delete(token);
}

// Parse cookie header into a Map
function parseCookies(req) {
  const map = new Map();
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    map.set(part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim()));
  }
  return map;
}

// Returns true if the request is authenticated
function isAuthenticated(req) {
  if (!ADMIN_PASS) return true; // No password set → open in dev
  const cookies = parseCookies(req);
  return validateSession(cookies.get('admin_session'));
}

// Middleware: redirect to login if not authenticated
function requireAuth(req, res, loginPath = '/admin/login') {
  if (isAuthenticated(req)) return true;
  res.writeHead(302, { Location: loginPath });
  res.end();
  return false;
}

// Verify submitted credentials; returns session token or null
function login(user, pass) {
  if (!ADMIN_PASS) return createSession(); // dev mode
  const userOk = safeEqual(user, ADMIN_USER);
  const passOk = safeEqual(pass, ADMIN_PASS);
  if (userOk && passOk) return createSession();
  return null;
}

// Set-Cookie header value for session token
function sessionCookie(token, clear = false) {
  if (clear) {
    return `admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
  }
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `admin_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

module.exports = { isAuthenticated, requireAuth, login, destroySession, sessionCookie, parseCookies };
