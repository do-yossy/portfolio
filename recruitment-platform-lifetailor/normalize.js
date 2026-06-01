'use strict';

// 全角英数字・記号を半角に変換
function toHalfWidth(str) {
  if (!str) return '';
  return str
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .replace(/－/g, '-')
    .replace(/ー/g, '-')
    .replace(/～/g, '~');
}

// 電話番号の正規化
function normalizePhone(phone) {
  if (!phone) return '';
  let s = toHalfWidth(phone.toString().trim());
  s = s.replace(/[\s\-\(\)\.\+]/g, '');
  s = s.toLowerCase();
  // 先頭の+81を0に
  if (s.startsWith('81')) s = '0' + s.slice(2);
  return s;
}

// メールアドレスの正規化
function normalizeEmail(email) {
  if (!email) return '';
  return toHalfWidth(email.toString().trim()).toLowerCase();
}

// 名前の正規化（姓名の空白除去・全角化などは最小限）
function normalizeName(name) {
  if (!name) return '';
  return name.toString().trim().replace(/\s+/g, '');
}

// 名前の類似判定（部分一致）
function isNameSimilar(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

module.exports = { normalizePhone, normalizeEmail, normalizeName, isNameSimilar };
