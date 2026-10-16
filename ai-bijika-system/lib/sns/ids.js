'use strict';
// SNSのAPIや Meta の signed_request から届くIDを、桁を失わずに文字列にする。
// JSON の数値は、JavaScript では 2^53（約9×10^15）を超えると JSON.parse の時点で丸められる
// （例：25025320703795513 は 25025320703795512 になる）。Threads・Instagram のIDは16〜17桁あるため、数値で届くと別のIDになりうる。
// そこで、数値で届いたIDは、Number.isSafeInteger のときだけ String() にする。範囲外のときは、元のJSONの文字列から、
// そのキーの数字をそのまま取り出す。取り出せなければ ''（丸めた値は、保存にも照合にも使わない）。

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 元のJSONの文字列から、"<key>": <数字> の数字の並びを取り出す。
// 取り出した数字が、JSON.parse した値（丸めた値）と同じ数になるものだけを候補にし、候補が1種類のときだけ返す
// （同じキーが別の値で何度も出てくるなど、どれか決められないときは ''）
function rawDigits(rawText, key, parsed) {
  if (typeof rawText !== 'string' || !rawText) return '';
  const re = new RegExp(`"${escapeRe(key)}"\\s*:\\s*(\\d+)(?![\\d.eE])`, 'g');
  const found = new Set();
  for (const m of rawText.matchAll(re)) if (Number(m[1]) === parsed) found.add(m[1]);
  return found.size === 1 ? [...found][0] : '';
}

// value：JSON.parse した値。rawText：元のJSONの文字列。key：そのIDのキーの名前（例 'user_id'）
function idString(value, rawText, key) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isSafeInteger(value)) return String(value);
    return rawDigits(rawText, key, value);
  }
  return '';
}

module.exports = { idString };
