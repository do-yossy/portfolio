'use strict';
// 月額SNS自動投稿サービスの画面（既存の lib/ui.js のレイアウトとデザインを使う）
const { escapeHtml, icon, layout, crest } = require('./ui');
const core = require('./service-core');
const registry = require('./sns');

const yen = (n) => `${Number(n).toLocaleString('ja-JP')}円`;
const nameOf = () => escapeHtml(core.serviceName());

const EXTRA_CSS = `<style>
.svc h1{margin:6px 0 10px}
.svc .price-box{border:1px solid var(--gold);background:var(--gold-soft);border-radius:16px;padding:20px;text-align:center;margin:14px 0}
.svc .price-box b{font-size:34px;letter-spacing:.02em}
.svc .price-box small{display:block;color:var(--muted);margin-top:4px}
.svc .grid2{display:grid;gap:12px;grid-template-columns:1fr}
@media(min-width:600px){.svc .grid2{grid-template-columns:1fr 1fr}}
.svc ul.plain{margin:6px 0 0;padding-left:18px}
.svc table.t{width:100%;border-collapse:collapse;font-size:14px}
.svc table.t th,.svc table.t td{border-bottom:1px solid #e6dfd0;padding:8px 6px;text-align:left;vertical-align:top;word-break:break-word}
.svc .hist{overflow-x:auto}
.svc table.t th{white-space:nowrap}
.svc table.t.kv th{width:1%;padding-right:14px}
.svc .badge-ok{background:#DCEADF;color:#2F5D3A;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:700}
.svc .badge-warn{background:#F8E7C9;color:#7a5200;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:700}
.svc .badge-ng{background:#F3D8D4;color:#8a2c1f;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:700}
.svc .badge-off{background:#E7E5E0;color:#5b574d;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:700}
.svc .legal-links{font-size:13px;margin:10px 0}.svc .legal-links a{margin-right:14px}
.svc textarea{width:100%;min-height:120px;font:inherit;padding:10px;border:1px solid #d9d0bb;border-radius:12px;box-sizing:border-box}
.svc .acct-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee7d6}
.svc .check{display:flex;gap:8px;align-items:flex-start;margin:6px 0}
.svc form.inline{display:inline}
.svc .small{font-size:12.5px;color:var(--muted)}
.svc nav.svc-nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:14px}
.svc .legal-doc table{width:100%;border-collapse:collapse}.svc .legal-doc th,.svc .legal-doc td{border:1px solid #d9d0bb;padding:8px;vertical-align:top;font-size:14px}
</style>`;

function wrap(title, body) {
  return layout(title, `${EXTRA_CSS}<div class="svc">${body}</div>`);
}

function legalLinks() {
  return `<div class="legal-links"><a href="/service/legal/terms">利用規約</a><a href="/service/legal/tokushoho">特定商取引法に基づく表記</a><a href="/service/legal/privacy">プライバシーポリシー</a></div>`;
}

function topNav(user) {
  if (!user) return `<nav class="svc-nav"><a href="/service">サービス紹介</a><span><a href="/service/login">ログイン</a></span></nav>`;
  return `<nav class="svc-nav"><a href="/service/app">マイページ</a><span class="small">${escapeHtml(user.email)} ／ <a href="/service/logout">ログアウト</a></span></nav>`;
}

// ── 販売ページ ──
function landingPage({ user, billingReady }) {
  const price = yen(core.priceYen());
  const cta = billingReady
    ? `<a class="btn btn-primary btn-block" href="${user ? '/service/checkout' : '/service/signup'}">${user ? '申込みに進む' : '無料でアカウントを作って申し込む'}</a>
       <p class="small center" style="margin-top:8px">アカウント作成は無料です。お支払いは、次の確認画面で内容をご確認いただいたあとに始まります。</p>`
    : `<div class="notice"><div>ただいま準備中です。もうしばらくお待ちください。</div></div>`;
  return wrap('SNS自動投稿サービス', `
    ${topNav(user)}
    <header class="page-head"><div class="eyebrow">SNS Scheduler</div><h1>${nameOf()}</h1>
      <p class="lead">Threads・X・Instagram・TikTokへの投稿を、あらかじめ予約しておけるサービスです。書いた投稿や、用意した画像・動画を、決めた日時に自動で公開します。</p></header>
    <div class="price-box"><div>月額</div><b>${price}</b>（税込）<small>自動更新／いつでも解約できます（解約後も、契約期間の終わりまでご利用いただけます）</small></div>
    ${cta}
    <h2 style="margin-top:26px">できること</h2>
    <div class="grid2">
      <div class="card"><div class="card-title">投稿の予約</div>
        <p class="small">本文と日時を決めて予約します。日本時間で、最大90日先まで指定できます。</p></div>
      <div class="card"><div class="card-title">複数のSNSへ</div>
        <p class="small">Threads・X・Instagram・TikTokに対応しています。同じ内容を、選んだSNSへまとめて予約できます（SNSごとに、必要な画像・動画の条件があります）。</p></div>
      <div class="card"><div class="card-title">自分のアカウントで投稿</div>
        <p class="small">各SNSの公式の連携（OAuth）を使います。SNSのパスワードをお預かりすることはありません。連携は、いつでも解除できます。</p></div>
      <div class="card"><div class="card-title">失敗しても安心</div>
        <p class="small">一時的なエラーは自動で再試行します。投稿の結果は、マイページで確認できます。</p></div>
    </div>
    <h2 style="margin-top:26px">ご利用の前にご確認ください</h2>
    <div class="card"><ul class="plain small">
      <li>対応SNSは、Threads・X・Instagram・TikTokです。Xはテキストのみ、Instagramは画像（JPEG）またはリール動画が必須、TikTokは動画（MP4）が必須です。Threadsは画像・動画を付けられます。</li>
      <li>Instagramは、プロアカウント（ビジネス／クリエイター）が対象です。</li>
      <li>TikTokへの投稿は、TikTok側の仕様・審査状況により、公開範囲が制限される場合があります。</li>
      <li>アップロードできるファイルは、画像（JPEG・PNG）が8MBまで、動画（MP4）が100MBまでです。投稿が終わったファイルは、自動で削除します。</li>
      <li>投稿できるのは、ご自身で作成・予約した内容だけです。いいね・フォロー・コメントなどの自動操作は行いません。</li>
      <li>Xへの投稿は、X側のAPIの利用条件（投稿数の制限など）の影響を受ける場合があります。</li>
      <li>文字数の上限は、Threadsが500文字、Xが重み付きで280（日本語は1文字を2として計算）、Instagram・TikTokが2,200文字です。</li>
      <li>未投稿の予約は100件まで、1日の予約は30件まで、連携できるアカウントは5件までです。</li>
      <li>SNS側の仕様変更や障害、各SNSの規約による制限で、投稿できない場合があります。</li>
      <li>投稿の内容と、その結果（SNS側での表示・凍結等）の責任は、ご利用者にあります。</li>
      <li>お支払い後の返金は、法令上必要な場合を除き、いたしません。解約すると、次回の更新が止まります。</li>
    </ul></div>
    <h2 style="margin-top:26px">よくある質問</h2>
    <div class="card"><div class="card-title">解約するには？</div><p class="small">マイページの「解約する」ボタンから、いつでも手続きできます。解約後も、契約期間の終わりまでご利用いただけます。</p></div>
    <div class="card"><div class="card-title">お支払い方法は？</div><p class="small">クレジットカード等です。決済は、決済代行会社（Stripe）の画面で行い、当サービスにはカード番号を保存しません。</p></div>
    <div class="card"><div class="card-title">パスワードを忘れたら？</div><p class="small"><a href="/contact">お問い合わせ</a>からご連絡ください。</p></div>
    ${legalLinks()}
  `);
}

// ── ログイン・登録 ──
function authPage(kind, error) {
  const signup = kind === 'signup';
  return wrap(signup ? 'アカウント作成' : 'ログイン', `
    ${topNav(null)}
    <div class="auth"><div class="auth-head">${crest(58)}<h1>${signup ? 'アカウント作成' : 'ログイン'}</h1>
      <p class="lead">${signup ? 'メールアドレスとパスワードを登録します（無料）。' : 'ご契約のアカウントでログインしてください。'}</p></div>
      ${error ? `<div class="notice error" style="margin:0 0 14px"><div>${escapeHtml(error)}</div></div>` : ''}
      <div class="card"><form method="POST" action="/service/${signup ? 'signup' : 'login'}">
        <div class="field"><label class="lbl" for="email">メールアドレス</label><input id="email" type="email" name="email" required autofocus autocomplete="email"></div>
        <div class="field"><label class="lbl" for="password">パスワード${signup ? '（8文字以上）' : ''}</label>
          <input id="password" type="password" name="password" required minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}"></div>
        <button class="btn btn-primary btn-block" type="submit">${signup ? 'アカウントを作成' : 'ログイン'}</button>
      </form></div>
      <p class="muted center">${signup ? 'アカウントをお持ちの方は <a href="/service/login">ログイン</a>' : 'はじめての方は <a href="/service/signup">アカウント作成</a>'}</p>
    </div>
    ${legalLinks()}
  `);
}

// ── 申込みの最終確認 ──
function checkoutPage({ user, csrf, error }) {
  const price = yen(core.priceYen());
  return wrap('お申込みの最終確認', `
    ${topNav(user)}
    <header class="page-head"><div class="eyebrow">Confirm</div><h1>お申込みの最終確認</h1>
      <p class="lead">お支払いの前に、内容を必ずご確認ください。</p></header>
    ${error ? `<div class="notice error" style="margin:0 0 14px"><div>${escapeHtml(error)}</div></div>` : ''}
    <div class="card">
      <table class="t kv">
        <tr><th>サービス</th><td>${nameOf()}</td></tr>
        <tr><th>料金</th><td><b>月額 ${price}（税込）</b></td></tr>
        <tr><th>お支払い開始</th><td>「同意して支払いへ進む」を押したあとの決済ページで、お支払いが完了した時点で、契約が始まります。</td></tr>
        <tr><th>契約期間と更新</th><td>1か月ごとの自動更新です。解約しない限り、毎月、同じ日に ${price} が、お支払い方法に請求されます。</td></tr>
        <tr><th>解約の方法</th><td>ログイン後のマイページにある「解約する」ボタンから、いつでも手続きできます。解約すると、次回の更新が止まります。解約後も、すでにお支払いいただいた契約期間の終わりまでは、ご利用いただけます。</td></tr>
        <tr><th>返金</th><td>お支払い済みの料金は、法令上必要な場合を除き、返金いたしません（日割りでの返金もありません）。</td></tr>
        <tr><th>対応SNSと制限</th><td>Threads・X・Instagram・TikTok。未投稿の予約は100件まで、1日の予約は30件まで、連携は5アカウントまでです。画像は8MB、動画は100MBまでです。</td></tr>
        <tr><th>お支払い方法</th><td>クレジットカード等（決済代行：Stripe）。カード情報は当サービスには保存されません。</td></tr>
      </table>
    </div>
    ${legalLinks()}
    <form method="POST" action="/service/checkout" class="card">
      <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
      <label class="check"><input type="checkbox" name="agree" value="1" required>
        <span class="small"><a href="/service/legal/terms" target="_blank" rel="noopener">利用規約</a>と<a href="/service/legal/tokushoho" target="_blank" rel="noopener">特定商取引法に基づく表記</a>、<a href="/service/legal/privacy" target="_blank" rel="noopener">プライバシーポリシー</a>を読み、上記の内容（月額 ${price}・自動更新・返金なし）に同意します。</span></label>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:10px">同意して支払いへ進む（月額 ${price}）</button>
    </form>
  `);
}

function checkoutResultPage({ user, kind }) {
  if (kind === 'cancel') {
    return wrap('お申込みをキャンセルしました', `${topNav(user)}
      <div class="card"><h2>お支払いは完了していません</h2><p class="small">お申込みの途中でキャンセルされました。料金は請求されていません。</p>
      <a class="btn btn-primary btn-block" href="/service/checkout">申込みをやり直す</a></div>${legalLinks()}`);
  }
  return wrap('お手続き中', `${topNav(user)}
    <div class="card center"><h2 id="t">お支払いを確認しています…</h2>
      <p class="small" id="m">決済が完了すると、自動でご利用いただけるようになります。このまま少しお待ちください。</p>
      <a class="btn btn-primary btn-block hide" id="go" href="/service/app">マイページへ進む</a></div>
    <script>
    (function(){var n=0;function poll(){fetch('/service/api/status',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){
      if(j.active){document.getElementById('t').textContent='ご契約ありがとうございます';document.getElementById('m').textContent='ご利用の準備ができました。';document.getElementById('go').classList.remove('hide');return;}
      if(++n<40)setTimeout(poll,2000);else{document.getElementById('t').textContent='確認に時間がかかっています';document.getElementById('m').textContent='決済の反映に時間がかかっている可能性があります。しばらくしてから、マイページをご確認ください。お支払いが完了しているのにご利用いただけない場合は、お問い合わせください。';document.getElementById('go').classList.remove('hide');}
    }).catch(function(){if(++n<40)setTimeout(poll,3000)})}poll()})();
    </script>`);
}

const STATUS_LABEL = { active: ['契約中', 'badge-ok'], trialing: ['契約中（お試し）', 'badge-ok'], past_due: ['お支払いの確認が必要', 'badge-ng'], unpaid: ['お支払いの確認が必要', 'badge-ng'], canceled: ['解約済み', 'badge-off'], incomplete: ['お支払い手続き中', 'badge-warn'], incomplete_expired: ['未完了', 'badge-off'], none: ['未契約', 'badge-off'] };
const POST_STATUS = { pending: ['予約中', 'badge-warn'], publishing: ['投稿中', 'badge-warn'], posted: ['投稿済み', 'badge-ok'], failed: ['失敗', 'badge-ng'], cancelled: ['取り消し', 'badge-off'] };
const toLocalInput = (ms) => {
  const d = new Date(ms + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
};

// ── マイページ ──
function dashboardPage({ user, sub, accounts, posts, csrf, flash, snsReady, portalReady }) {
  const active = !!sub && ['active', 'trialing'].includes(sub.status);
  const [stLabel, stClass] = STATUS_LABEL[(sub && sub.status) || 'none'] || STATUS_LABEL.none;
  const accHtml = accounts.length ? accounts.map((a) => {
    const ad = registry.get(a.platform);
    const bad = a.status !== 'active';
    return `<div class="acct-row"><span><b>${escapeHtml(ad ? ad.label : a.platform)}</b> ${escapeHtml(a.handle || '')}
      ${bad ? '<span class="badge-ng">再連携が必要</span>' : ''}</span>
      <span>${bad ? `<a class="btn btn-sm" href="/service/connect/${escapeHtml(a.platform)}">再連携</a> ` : ''}
      <form class="inline" method="POST" action="/service/app/account/${escapeHtml(a.id)}/disconnect" onsubmit="return confirm('連携を解除します。未投稿の予約は取り消されます。よろしいですか？')">
        <input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-sm btn-ghost" type="submit">解除</button></form></span></div>`;
  }).join('') : '<p class="small">まだ連携しているSNSがありません。</p>';
  const connectBtns = registry.list().map((p) => p.isConfigured() && snsReady
    ? `<a class="btn btn-sm btn-primary" href="/service/connect/${p.id}">${escapeHtml(p.label)}を連携</a>`
    : `<span class="small">${escapeHtml(p.label)}：準備中</span>`).join(' ');
  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const defaultAt = toLocalInput(Date.now() + 60 * 60 * 1000);
  const hasTikTok = activeAccounts.some((a) => a.platform === 'tiktok');
  const tiktokAcc = activeAccounts.find((a) => a.platform === 'tiktok');
  const compose = active && activeAccounts.length ? `
    <form method="POST" action="/service/app/post" class="card" id="postForm">
      <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="media_id" id="media_id" value="">
      <div class="card-title">投稿を予約する</div>
      <div class="field"><label class="lbl" for="text">本文（キャプション）</label><textarea id="text" name="text" maxlength="2200" oninput="cnt()"></textarea>
        <div class="small" id="count">0文字</div></div>
      <div class="field"><label class="lbl" for="file">画像・動画（Instagram・TikTokでは必須）</label>
        <input id="file" type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime">
        <div class="small" id="fileStatus">JPEG・PNG（8MBまで）／MP4（100MBまで）</div></div>
      <div class="field"><span class="lbl">投稿先</span>
        ${activeAccounts.map((a) => `<label class="check"><input type="checkbox" name="account" value="${escapeHtml(a.id)}" data-platform="${escapeHtml(a.platform)}" ${activeAccounts.length === 1 ? 'checked' : ''}><span>${escapeHtml((registry.get(a.platform) || {}).label || a.platform)} ${escapeHtml(a.handle || '')}</span></label>`).join('')}</div>
      ${hasTikTok ? `<div class="field" id="tiktokBox" style="display:none;border:1px solid #d9d0bb;border-radius:12px;padding:10px">
        <span class="lbl">TikTokの設定（${escapeHtml(tiktokAcc.handle || 'TikTok')}へ投稿）</span>
        <label class="lbl" for="tiktok_privacy">公開範囲（必ず選んでください）</label>
        <select id="tiktok_privacy" name="tiktok_privacy"><option value="">選択してください</option>
          <option value="PUBLIC_TO_EVERYONE">全員に公開</option><option value="MUTUAL_FOLLOW_FRIENDS">相互フォローの友達</option>
          <option value="FOLLOWER_OF_CREATOR">フォロワー</option><option value="SELF_ONLY">自分のみ</option></select>
        <label class="check"><input type="checkbox" name="tiktok_comment" value="1"><span>コメントを許可する</span></label>
        <label class="check"><input type="checkbox" name="tiktok_duet" value="1"><span>デュエットを許可する</span></label>
        <label class="check"><input type="checkbox" name="tiktok_stitch" value="1"><span>ステッチを許可する</span></label>
        <p class="small">投稿することで、<a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">TikTokの音楽使用の確認</a>に同意したものとみなされます。アプリの審査が終わるまでは、公開範囲が「自分のみ」に限られる場合があります。</p></div>` : ''}
      <div class="field"><label class="lbl" for="at">投稿日時（日本時間）</label><input id="at" type="datetime-local" name="at" value="${defaultAt}" required></div>
      <div class="btn-row"><button class="btn btn-primary" type="submit" name="mode" value="schedule">予約する</button>
        <button class="btn btn-ghost" type="submit" name="mode" value="now" onclick="return confirm('今すぐ投稿します。よろしいですか？')">今すぐ投稿</button></div>
      <p class="small">文字数の上限：Threads 500／X 日本語140文字（重み280）／Instagram・TikTok 2,200。</p>
    </form>
    <script>
    function cnt(){var t=document.getElementById('text').value;document.getElementById('count').textContent=Array.from(t).length+'文字';}
    (function(){
      var f=document.getElementById('file'),st=document.getElementById('fileStatus'),mid=document.getElementById('media_id');
      var csrf=${JSON.stringify(csrf)};
      f.addEventListener('change',function(){
        mid.value='';var file=f.files[0];if(!file){st.textContent='';return;}
        st.textContent='アップロード中…（'+Math.round(file.size/1048576*10)/10+'MB）';
        fetch('/service/app/media',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-CSRF':csrf},body:file})
          .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
          .then(function(x){if(x.ok){mid.value=x.j.id;st.textContent='添付しました：'+(x.j.kind==='video'?'動画':'画像')+'（'+Math.round(x.j.size/1048576*10)/10+'MB）';}else{st.textContent=x.j.error||'アップロードに失敗しました。';f.value='';}})
          .catch(function(){st.textContent='アップロードに失敗しました。';f.value='';});
      });
      var box=document.getElementById('tiktokBox');
      function tt(){if(!box)return;var on=document.querySelector('input[name=account][data-platform=tiktok]:checked');box.style.display=on?'block':'none';}
      document.querySelectorAll('input[name=account]').forEach(function(c){c.addEventListener('change',tt)});tt();
    })();
    </script>` : '';
  const postRows = posts.length ? posts.map((p) => {
    const [l, c] = POST_STATUS[p.status] || [p.status, 'badge-off'];
    const ad = registry.get(p.platform);
    return `<tr><td style="white-space:nowrap">${escapeHtml(core.formatJstShort(p.scheduled_at))}</td><td style="white-space:nowrap">${escapeHtml(ad ? ad.label : '')}<br><span class="small">${escapeHtml(p.handle || '')}</span></td>
      <td>${p.media_id ? '<span class="badge-off">添付あり</span> ' : ''}${escapeHtml(p.text.length > 60 ? `${p.text.slice(0, 60)}…` : p.text)}${p.last_error ? `<br><span class="small">${escapeHtml(p.last_error)}</span>` : ''}</td>
      <td><span class="${c}">${l}</span>${p.status === 'pending' ? `<br><form class="inline" method="POST" action="/service/app/post/${escapeHtml(p.id)}/cancel"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-sm btn-ghost" type="submit">取り消し</button></form>` : ''}</td></tr>`;
  }).join('') : '<tr><td colspan="4" class="small">予約はまだありません。</td></tr>';
  const renewal = sub && sub.current_period_end ? core.formatJst(sub.current_period_end) : '';
  const billing = sub && sub.stripe_subscription_id ? `
    <div class="card"><div class="card-title">ご契約・お支払い</div>
      <p class="small">状態：<span class="${stClass}">${stLabel}</span>
      ${renewal ? `<br>${sub.cancel_at_period_end ? `解約手続き済み。<b>${escapeHtml(renewal)}</b> までご利用いただけます（以降は更新されません）。` : `次回の更新日：<b>${escapeHtml(renewal)}</b>（${yen(core.priceYen())}）`}` : ''}</p>
      <div class="btn-row">
        ${sub.status === 'canceled' ? '<a class="btn btn-primary" href="/service/checkout">再度申し込む</a>' : sub.cancel_at_period_end
          ? `<form class="inline" method="POST" action="/service/billing/resume"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-primary" type="submit">解約を取り消す</button></form>`
          : `<form class="inline" method="POST" action="/service/billing/cancel" onsubmit="return confirm('解約すると、次回の更新が止まります。契約期間の終わりまではご利用いただけます。解約しますか？')"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-ghost" type="submit">解約する</button></form>`}
        ${portalReady ? '<a class="btn btn-ghost" href="/service/billing/portal">支払い方法の変更・請求書</a>' : ''}
      </div></div>` : '';
  const notActive = !active ? `<div class="notice"><div>${!sub || sub.status === 'none' || sub.status === 'canceled' ? 'ご契約が有効ではありません。' : 'お支払いの確認が必要です。'}
      ${!sub || ['none', 'canceled', 'incomplete_expired'].includes(sub.status) ? '<a href="/service/checkout">お申込みはこちら</a>' : '<a href="/service/billing/portal">お支払い方法をご確認ください</a>'}</div></div>` : '';
  return wrap('マイページ', `
    ${topNav(user)}
    <header class="page-head"><div class="eyebrow">My Page</div><h1>マイページ</h1></header>
    ${flash ? `<div class="notice ${flash.type === 'error' ? 'error' : ''}" style="margin:0 0 14px"><div>${escapeHtml(flash.text)}</div></div>` : ''}
    ${notActive}
    ${billing}
    <div class="card"><div class="card-title">連携しているSNS</div>${accHtml}
      <div class="btn-row" style="margin-top:10px">${active ? connectBtns : '<span class="small">ご契約後に連携できます。</span>'}</div></div>
    ${compose}
    <div class="card"><div class="card-title">予約と投稿の履歴</div>
      <div class="hist"><table class="t"><tr><th>日時</th><th>SNS</th><th>本文</th><th>状態</th></tr>${postRows}</table></div></div>
    ${legalLinks()}
  `);
}

function legalPage(title, html, user) {
  return wrap(title, `${topNav(user)}<div class="legal-doc">${html}</div><p class="small"><a href="/service">サービス紹介に戻る</a></p>`);
}

function adminServicePage({ subs, stats, postStats }) {
  const rows = subs.map((s) => `<tr><td>${escapeHtml(s.email || '')}</td><td>${escapeHtml(s.status)}</td><td>${escapeHtml(s.current_period_end || '')}</td><td>${s.cancel_at_period_end ? '解約予定' : ''}</td><td>${escapeHtml(s.created_at)}</td></tr>`).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>月額サービス（運営）</title>
<style>body{font-family:sans-serif;max-width:920px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:14px}</style></head><body>
<h1>月額SNS自動投稿サービス（運営用）</h1><p><a href="/admin/inquiries">お問い合わせ</a> ／ <a href="/admin/licenses">ライセンス</a></p>
<h2>契約の状況</h2><p>${stats.map((r) => `${escapeHtml(r.status)}: ${r.n}件`).join(' ／ ') || '契約はまだありません'}</p>
<h2>予約の状況</h2><p>${postStats.map((r) => `${escapeHtml(r.status)}: ${r.n}件`).join(' ／ ') || '予約はまだありません'}</p>
<h2>契約者一覧</h2><table><tr><th>メール</th><th>状態</th><th>次回更新日(UTC)</th><th>解約</th><th>登録日</th></tr>${rows}</table>
<p>※ 請求・返金などの詳しい情報は、Stripeのダッシュボードで確認してください。</p></body></html>`;
}

module.exports = { landingPage, authPage, checkoutPage, checkoutResultPage, dashboardPage, legalPage, adminServicePage };
