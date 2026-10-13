'use strict';
// 対応SNSの一覧。InstagramとTikTokは画像・動画が必須のため、このバージョンでは対象外。
const threads = require('./threads');
const x = require('./x');

const PLATFORMS = { threads, x };
const list = () => Object.values(PLATFORMS);
const get = (id) => PLATFORMS[id] || null;

module.exports = { PLATFORMS, list, get };
