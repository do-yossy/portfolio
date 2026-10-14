'use strict';
// 対応SNSの一覧
const threads = require('./threads');
const x = require('./x');
const instagram = require('./instagram');
const tiktok = require('./tiktok');
const facebook = require('./facebook');
const youtube = require('./youtube');

const PLATFORMS = { threads, x, instagram, tiktok, facebook, youtube };
const list = () => Object.values(PLATFORMS);
const get = (id) => PLATFORMS[id] || null;

module.exports = { PLATFORMS, list, get };
