'use strict';
// 太平洋時間（米国。夏時間あり）の日付。YouTube Data API の割り当ては、太平洋時間の0時にリセットされる（公式）
const TZ = 'America/Los_Angeles';

// その時刻の、太平洋時間とUTCの差（ミリ秒。夏時間は -7時間、冬時間は -8時間）
function offsetMs(ms) {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName').value;
    const m = String(name).match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60000;
  } catch { /* Intl が使えない環境 */ }
  return -8 * 3600 * 1000;
}

// 太平洋時間の、その日の0時（UTCのミリ秒）。夏時間の切り替えは午前2時なので、0時の1時間前後で差を取り直せば正しい
function midnightUtc(y, mo, d, hintMs) {
  const guess = Date.UTC(y, mo, d) - offsetMs(hintMs);
  return Date.UTC(y, mo, d) - offsetMs(guess);
}

// 時刻 iso を含む太平洋時間の1日の範囲 [開始, 終了)（ISO）と、日付の文字列
function dayBounds(iso) {
  const ms = Date.parse(iso);
  const local = new Date(ms + offsetMs(ms));
  const y = local.getUTCFullYear(); const mo = local.getUTCMonth(); const d = local.getUTCDate();
  const start = midnightUtc(y, mo, d, ms);
  const end = midnightUtc(y, mo, d + 1, start + 25 * 3600 * 1000);
  return { day: local.toISOString().slice(0, 10), from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

module.exports = { dayBounds, offsetMs };
