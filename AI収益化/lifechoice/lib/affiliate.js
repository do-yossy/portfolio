/**
 * LIFE CHOICE ── 送客リンクの生成
 *
 * IDを1箇所入れるだけで全品目のリンクが有効になる。
 * IDが未設定なら空配列を返し、UI側は「準備中」を表示する。
 *
 * ⚠ Amazonアソシエイトは「リンクを貼るサイトのURL」を事前に
 *   アソシエイト・セントラルへ登録する必要がある。
 *   既存アカウントがあっても新しいサイトは追加登録と審査が必要。
 *   未登録サイトでの利用は規約違反になる。
 *
 * ⚠ APIキー等の秘密情報はここに書かない（厳守事項12）。
 *   アフィリエイトIDは公開リンクに含まれる性質のもので秘密情報ではないが、
 *   有料APIのシークレットを扱う場合はクライアントJSに置けない。
 *
 * @file lib/affiliate.js
 */

/** @type {{amazonTag:string, rakutenId:string, a8Rent:string, a8Used:string, asoview:string}} */
export const AFFILIATE_CONFIG = {
  amazonTag: '',   // 例 "yourname-22"
  rakutenId: '',   // 例 "1a2b3c4d.5e6f7g8h"
  a8Rent:    '',   // A8で提携済みのレンタル系プログラムの広告URL
  a8Used:    '',   // A8で提携済みの中古・買取系プログラムの広告URL
  asoview:   ''    // 予約商材（アソビュー・じゃらん等）の広告URL
};

export function configureAffiliate(patch) {
  Object.assign(AFFILIATE_CONFIG, patch);
}

export function isConfigured() {
  return Object.values(AFFILIATE_CONFIG).some(Boolean);
}

/** Amazon検索リンク */
export function amazonSearch(keyword) {
  if (!AFFILIATE_CONFIG.amazonTag) return '';
  return 'https://www.amazon.co.jp/s?k=' + encodeURIComponent(keyword) +
         '&tag=' + AFFILIATE_CONFIG.amazonTag;
}

/** 楽天検索リンク（pc= にエンコードしたURLを渡す形式） */
export function rakutenSearch(keyword) {
  if (!AFFILIATE_CONFIG.rakutenId) return '';
  const target = 'https://search.rakuten.co.jp/search/mall/' + encodeURIComponent(keyword) + '/';
  return 'https://hb.afl.rakuten.co.jp/hgc/' + AFFILIATE_CONFIG.rakutenId +
         '/?pc=' + encodeURIComponent(target);
}

/**
 * 判定結果に応じた送客先を返す。未設定のものは含めない。
 * @param {'buy'|'used'|'rent'|'stop'|'booking'} kind
 * @param {string} keyword
 * @returns {{label:string, url:string}[]}
 */
export function linksFor(kind, keyword) {
  const out = [];
  const push = (label, url) => { if (url) out.push({ label, url }); };

  if (kind === 'buy' || kind === 'stop') {
    push('Amazonで探す', amazonSearch(keyword));
    push('楽天で探す', rakutenSearch(keyword));
  }
  if (kind === 'used') {
    push('Amazonの中古を見る', amazonSearch(keyword + ' 中古'));
    push('楽天の中古を見る', rakutenSearch(keyword + ' 中古'));
    push('買取・中古専門店を見る', AFFILIATE_CONFIG.a8Used);
  }
  if (kind === 'rent') {
    push('レンタルできる店を探す', AFFILIATE_CONFIG.a8Rent);
    push('楽天でレンタルを探す', rakutenSearch(keyword + ' レンタル'));
  }
  if (kind === 'booking') {
    push('当日枠を確認する', AFFILIATE_CONFIG.asoview);
  }
  return out;
}

export const PENDING_NOTE =
  'アフィリエイトIDが未設定です。lib/affiliate.js の AFFILIATE_CONFIG に ' +
  'AmazonトラッキングID・楽天アフィリエイトID・A8の広告URLを入れると全品目で有効になります。';
