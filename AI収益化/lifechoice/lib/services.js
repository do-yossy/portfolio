/**
 * LIFE CHOICE ── 6機能の定義（単一の情報源）
 *
 * ヘッダー・ボトムナビ・トップ画面・おすすめが、すべてここを参照する。
 * 機能を増減するときはこのファイルだけ直せばよい。
 *
 * @file lib/services.js
 */

/**
 * @typedef {Object} ServiceDef
 * @property {string} id        data-service 属性の値。tokens.css のアクセント色と対応
 * @property {string} name      表示名
 * @property {string} tagline   1行説明
 * @property {string} icon      絵文字
 * @property {string} path      app/ からの相対パス
 * @property {'buy'|'now'|'discover'} group  トップ画面のグループ
 * @property {boolean} inNav    ボトムナビに出すか（4つまで）
 * @property {boolean} hasDemoData  架空データを含むか（DEMOバナーを出す）
 */

/** @type {ServiceDef[]} */
export const SERVICES = [
  {
    id: 'buy-check',
    name: '買う前チェック',
    tagline: '本当に買うべきか確認',
    icon: '🧮',
    path: 'buy-check.html',
    group: 'buy',
    inNav: true,
    hasDemoData: false
  },
  {
    id: 'unnecessary-buy',
    name: '買わなくていい物',
    tagline: '買うより借りた方がいい？',
    icon: '📡',
    path: 'unnecessary-buy.html',
    group: 'buy',
    inNav: false,
    hasDemoData: false
  },
  {
    id: 'now-what',
    name: 'いまから何する？',
    tagline: '今から行ける場所を探す',
    icon: '⏰',
    path: 'now-what.html',
    group: 'now',
    inNav: true,
    hasDemoData: false
  },
  {
    id: 'today-deals',
    name: '今日だけ安い',
    tagline: '今日だけのお得を探す',
    icon: '🏷️',
    path: 'today-deals.html',
    group: 'now',
    inNav: true,
    hasDemoData: true      // 掲載15件は全て架空
  },
  {
    id: 'solo-map',
    name: 'ソロマップ',
    tagline: '一人で行ける場所',
    icon: '🚶',
    path: 'solo-map.html',
    group: 'discover',
    inNav: false,
    hasDemoData: false
  },
  {
    id: 'free-items',
    name: '無料品レーダー',
    tagline: '無料でもらえる物',
    icon: '🆓',
    path: 'free-items.html',
    group: 'discover',
    inNav: false,
    hasDemoData: true      // 掲載14件は全て架空
  }
];

export const GROUPS = [
  { id: 'buy',      label: '買い物' },
  { id: 'now',      label: '今すぐ' },
  { id: 'discover', label: '発見' }
];

export const getService = id => SERVICES.find(s => s.id === id);
export const servicesInGroup = group => SERVICES.filter(s => s.group === group);

/** ボトムナビの項目（4つ＋ホーム） */
export const navItems = () => [
  { id: 'home', name: 'ホーム', icon: '🏠', path: '../index.html' },
  ...SERVICES.filter(s => s.inNav)
];
