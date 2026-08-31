/**
 * LIFE CHOICE ── 共通Recommendation Engine
 *
 * 「今のこの人に、6つのうちどれを出すべきか」を1か所で決める。
 * トップページのおすすめ、Phase 9 の通知候補は、どちらもここを使う。
 *
 * 判定は全て決定的（同じ入力なら同じ出力）で、外部APIもAIも使わない。
 * 将来 AI API に置き換える場合も、この関数の入出力の形は変えない。
 *
 * @file lib/recommendation.js
 */
import { getService } from './services.js';
import { TRANSPORT_LABEL } from '../utils/format.js';

/**
 * @typedef {Object} Recommendation
 * @property {string}  serviceId
 * @property {string}  name
 * @property {string}  icon
 * @property {string}  href
 * @property {string}  reason     なぜこれを出すのか（利用者の条件で説明する）
 * @property {number}  score      0-100
 * @property {boolean} isDemo     サンプルデータに依存する提案か
 * @property {string}  [badge]
 */

/**
 * @param {Object} ctx
 * @param {Object}  ctx.pref          UserPreference
 * @param {boolean} ctx.hasPref       設定済みか
 * @param {number}  ctx.nowHour       0-23
 * @param {Object[]} ctx.history      閲覧履歴（新しい順）
 * @param {Object}  ctx.data          {stores, deals, freeItems, products}
 * @param {number}  [n]               返す件数
 * @returns {Recommendation[]}
 */
export function recommend(ctx, n = 3) {
  const { pref = {}, hasPref = false, nowHour = 12, history = [], data = {} } = ctx;
  const cands = [];
  const yen = v => Number(v || 0).toLocaleString('ja-JP');
  const lastService = history[0] ? history[0].service : null;
  const usedRecently = id => history.slice(0, 5).some(h => h.service === id);

  /* ── ③ いまから何する？ ── */
  {
    const open = (data.stores || []).filter(s =>
      s.openingTime !== null && s.closingTime !== null &&
      nowHour + 1 < (s.closingTime < s.openingTime ? s.closingTime + 24 : s.closingTime));
    // 夕方以降は「今から」の需要が最も高い
    const timeBonus = (nowHour >= 16 && nowHour <= 22) ? 35 : (nowHour >= 10 ? 12 : 0);
    if (open.length) {
      cands.push(make('now-what',
        hasPref
          ? `${TRANSPORT_LABEL[pref.transportation] || '徒歩'}圏・予算${yen(pref.budget)}円で、今から間に合う場所が${open.length}件あります`
          : `今の時間から間に合う場所が${open.length}件あります`,
        40 + timeBonus, false));
    }
  }

  /* ── ⑤ ソロマップ ── */
  if (pref.soloPreference >= 4) {
    cands.push(make('solo-map',
      pref.conversationPreference >= 4
        ? '「ひとり」「話しかけられたくない」の条件で絞り込めます'
        : 'ひとりで行きやすい場所だけを、点数順に並べます',
      45, false));
  }

  /* ── ② 買わなくていい物レーダー ── */
  if (lastService === 'buy-check') {
    cands.push(make('unnecessary-buy',
      '直前に買う前チェックを使ったので、ほかに借りたほうが安い物も見てみませんか', 55, false));
  } else {
    const rentables = (data.products || []).filter(p => p.rentalPrice).length;
    if (rentables) {
      cands.push(make('unnecessary-buy',
        `${rentables}品目を「買う」と「借りる」で比べて、損益分岐点を出します`, 32, false));
    }
  }

  /* ── ① 買う前チェック ── */
  {
    const real = (data.products || []).filter(p => p.source === '実測').length;
    cands.push(make('buy-check',
      lastService === 'unnecessary-buy'
        ? '気になった品目を1つ選んで、買う・中古・借りるを金額で判定します'
        : `${real}品目は実勢価格を確認済み。買う前に総額で比べられます`,
      lastService === 'unnecessary-buy' ? 52 : 30, false));
  }

  /* ── ④ 今日だけ安い（サンプルデータ）── */
  {
    const live = (data.deals || []).filter(d =>
      d.deadlineHour > nowHour && (!pref.budget || d.salePrice <= pref.budget));
    if (live.length) {
      const urgent = live.filter(d => d.deadlineHour - nowHour <= 3).length;
      cands.push(make('today-deals',
        hasPref
          ? `予算${yen(pref.budget)}円以内で、今日まだ間に合うものが${live.length}件（うち締切間近${urgent}件）`
          : `今日まだ間に合うものが${live.length}件あります`,
        // サンプルデータ由来の提案は、実データの提案より必ず下げる
        (urgent ? 38 : 26), true, urgent ? '締切間近' : undefined));
    }
  }

  /* ── ⑥ 無料品レーダー（サンプルデータ）── */
  {
    const today = (data.freeItems || []).filter(f => f.pickupEnd === 'today');
    if (today.length) {
      cands.push(make('free-items',
        `今日中に取りに行ける0円の物が${today.length}件あります`, 24, true));
    }
  }

  /* ── 関心のある分野があれば、統合検索を勧める ── */
  if ((pref.preferredCategories || []).length) {
    const sets = data.activitySets || [];
    const picked = sets.filter(s => pref.preferredCategories.includes(s.id));
    if (picked.length) {
      const names = picked.slice(0, 3).map(s => s.shortName || s.name).join('、');
      cands.push({
        serviceId: 'search', name: '何をすればいい？', icon: '🧭', href: 'app/search.html',
        reason: `関心のある「${names}」${picked.length > 3 ? 'ほか' : ''}について、` +
          '必要なものと費用をまとめて比べられます',
        score: 48, isDemo: false
      });
    }
  }

  // 直近で見た機能は下げる（同じものを出し続けない）
  cands.forEach(c => { if (usedRecently(c.serviceId)) c.score -= 20; });

  // 厳守事項11：④⑥のデータは現状すべてサンプルなので、
  // 実際に動く機能より上に出してはいけない。
  // 実データ由来の最低点より必ず下になるよう押し下げる。
  const realScores = cands.filter(c => !c.isDemo).map(c => c.score);
  if (realScores.length) {
    const floor = Math.min(...realScores);
    cands.forEach(c => { if (c.isDemo && c.score >= floor) c.score = floor - 1; });
  }

  // 設定が未入力なら、設定を促すことを最優先にする
  const out = cands.filter(Boolean).sort((a, b) => b.score - a.score).slice(0, n);
  if (!hasPref) {
    out.unshift({
      serviceId: 'settings', name: '条件を設定する', icon: '⚙️', href: 'app/settings.html',
      reason: 'エリア・予算・ひとりかどうかを1回入れておくと、4つの機能が同時に絞り込まれます',
      score: 100, isDemo: false, badge: 'おすすめ'
    });
    out.pop();
  }
  return out;
}

function make(serviceId, reason, score, isDemo, badge) {
  const s = getService(serviceId);
  if (!s) return null;
  return { serviceId, name: s.name, icon: s.icon, href: 'app/' + s.path, reason, score, isDemo, badge };
}

/**
 * Phase 9 の通知候補もここから作る。
 * 「通知に値するか」は、おすすめより高い基準（締切がある・数量が限られる）で判定する。
 *
 * @returns {import('../types/models.js').NotificationCandidate[]}
 */
export function notificationCandidates(ctx) {
  const { pref = {}, nowHour = 12, data = {} } = ctx;
  const out = [];

  (data.deals || []).forEach(d => {
    const hoursLeft = d.deadlineHour - nowHour;
    if (hoursLeft <= 0 || hoursLeft > 4) return;
    if (pref.budget && d.salePrice > pref.budget) return;
    out.push({
      type: 'deal',
      title: d.title,
      body: `あと${hoursLeft}時間で終了・${Math.round(d.discountRate * 100)}%OFF（残り${d.remainingCount}）`,
      score: Math.min(100, Math.round((5 - hoursLeft) * 15 + d.discountRate * 60)),
      url: 'app/today-deals.html',
      expiresAt: String(d.deadlineHour) + ':00',
      isDemo: !!d.isDemo,
      context: { dealId: d.id, matchedBudget: pref.budget || null }
    });
  });

  (data.freeItems || []).forEach(f => {
    if (f.pickupEnd !== 'today') return;
    out.push({
      type: 'free-item',
      title: f.title,
      body: `${f.distanceKm}km先で今日中に受け取り可能`,
      score: Math.round(Math.max(0, 60 - f.distanceKm * 12)),
      url: 'app/free-items.html',
      expiresAt: '23:59',
      isDemo: !!f.isDemo,
      context: { freeItemId: f.id }
    });
  });

  return out.sort((a, b) => b.score - a.score);
}
