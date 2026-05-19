<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Portfolio — Web制作・開発実績</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0a0f;
  --surface: #12121a;
  --surface2: #1a1a26;
  --border: rgba(255,255,255,0.07);
  --accent: #6366f1;
  --accent2: #a78bfa;
  --gold: #f0b429;
  --green: #34d399;
  --text: #e8eaf6;
  --text2: #8b8fa8;
  --text3: #4a4d6a;
  --ease: cubic-bezier(0.6,0.05,0.2,1);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: 'Syne', 'Noto Sans JP', sans-serif; background: var(--bg); color: var(--text); line-height: 1.7; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
body::before { content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 9999; opacity: 0.025; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
a { color: inherit; text-decoration: none; }
.container { width: min(92%, 1100px); margin: 0 auto; }

.hero { min-height: 100vh; display: flex; align-items: center; position: relative; overflow: hidden; padding: 120px 0 80px; }
.hero::before { content: ""; position: absolute; top: -200px; left: -200px; width: 600px; height: 600px; background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%); pointer-events: none; animation: orb1 8s ease-in-out infinite; }
.hero::after { content: ""; position: absolute; bottom: -150px; right: -100px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(167,139,250,0.1) 0%, transparent 70%); pointer-events: none; animation: orb2 10s ease-in-out infinite; }
@keyframes orb1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(60px,40px); } }
@keyframes orb2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-40px,-30px); } }
.hero-inner { position: relative; z-index: 1; }

.hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3); border-radius: 99px; font-size: 0.72rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--accent2); margin-bottom: 2rem; opacity: 0; animation: fadeUp 0.8s var(--ease) 0.2s forwards; }
.hero-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 2s ease infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

.hero h1 { font-size: clamp(2.8rem, 7vw, 5.5rem); font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; margin-bottom: 1.5rem; opacity: 0; animation: fadeUp 0.9s var(--ease) 0.4s forwards; }
.hero h1 .line1 { display: block; color: var(--text); }
.hero h1 .line2 { display: block; background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 50%, var(--gold) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }

.hero-sub { font-size: 1rem; color: var(--text2); max-width: 540px; margin-bottom: 2.5rem; font-weight: 400; line-height: 1.9; opacity: 0; animation: fadeUp 0.9s var(--ease) 0.6s forwards; }
.hero-tags { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 2.5rem; opacity: 0; animation: fadeUp 0.9s var(--ease) 0.7s forwards; }
.tag { padding: 5px 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 99px; font-size: 0.75rem; color: var(--text2); letter-spacing: 0.05em; }
.tag.ai { background: rgba(99,102,241,0.12); border-color: rgba(99,102,241,0.3); color: var(--accent2); }

.hero-cta { display: inline-flex; align-items: center; gap: 10px; padding: 14px 28px; background: var(--accent); color: white; border-radius: 8px; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.05em; transition: all 0.3s var(--ease); opacity: 0; animation: fadeUp 0.9s var(--ease) 0.8s forwards; }
.hero-cta:hover { background: #5254cc; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,0.4); }
.hero-cta svg { width: 16px; height: 16px; transition: transform 0.3s var(--ease); }
.hero-cta:hover svg { transform: translateX(4px); }

.hero-stats { display: flex; gap: 3rem; margin-top: 4rem; padding-top: 3rem; border-top: 1px solid var(--border); opacity: 0; animation: fadeUp 0.9s var(--ease) 1s forwards; }
.hero-stat-num { font-size: 2rem; font-weight: 800; letter-spacing: -0.04em; background: linear-gradient(135deg, var(--text), var(--text2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.hero-stat-label { font-size: 0.72rem; color: var(--text3); letter-spacing: 0.1em; text-transform: uppercase; margin-top: 3px; }

@keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }

.section { padding: clamp(5rem, 10vw, 8rem) 0; }
.section-eyebrow { font-size: 0.68rem; letter-spacing: 0.35em; text-transform: uppercase; color: var(--accent2); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.8rem; }
.section-eyebrow::before { content: ""; width: 24px; height: 1px; background: var(--accent2); }
.section-title { font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 800; letter-spacing: -0.03em; color: var(--text); line-height: 1.2; margin-bottom: 1rem; }
.section-sub { font-size: 0.92rem; color: var(--text2); max-width: 500px; line-height: 1.9; }

.reveal { opacity: 0; transform: translateY(32px); transition: opacity 0.8s var(--ease), transform 0.8s var(--ease); }
.reveal.visible { opacity: 1; transform: translateY(0); }

/* Works */
.works-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5px; background: var(--border); margin-top: 4rem; border: 1px solid var(--border); }
.span3 { grid-column: span 3; }
.span2 { grid-column: span 2; }

.work-card { background: var(--bg); padding: 2rem; position: relative; overflow: hidden; cursor: pointer; transition: background 0.4s var(--ease); }
.work-card:hover { background: var(--surface); }
.work-card::before { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(99,102,241,0.05), transparent); opacity: 0; transition: opacity 0.4s var(--ease); }
.work-card:hover::before { opacity: 1; }
.work-wide-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; }

.work-num { font-size: 0.62rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--text3); margin-bottom: 1.2rem; }
.work-preview { aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; margin-bottom: 1.5rem; border: 1px solid var(--border); position: relative; }
.work-wide .work-preview { margin-bottom: 0; aspect-ratio: 16/10; }
.work-preview-inner { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; transition: transform 0.6s var(--ease); }
.work-card:hover .work-preview-inner { transform: scale(1.05); }

.preview-cafe       { background: linear-gradient(135deg, #3d2817, #6b4423, #c9a961); }
.preview-law        { background: linear-gradient(135deg, #0d1b2e, #1e3050, #b8962e); }
.preview-app        { background: linear-gradient(135deg, #1a0a0f, #3d0a1f, #ff385c); }
.preview-ec         { background: linear-gradient(135deg, #1a1a1a, #3d2817, #c9a96e); }
.preview-reserve    { background: linear-gradient(135deg, #0f1117, #1a1d27, #4f8ef7); }
.preview-invoice    { background: linear-gradient(135deg, #16192c, #1a1d27, #2563eb); }
.preview-attendance { background: linear-gradient(135deg, #0f172a, #1e1b4b, #4f46e5); }
.preview-stock      { background: linear-gradient(135deg, #0c1a2e, #0e4166, #0ea5e9); }
.preview-proofreading { background: linear-gradient(135deg, #1c0a0a, #3d1515, #dc2626); }
.preview-excel      { background: linear-gradient(135deg, #0a1a0d, #1a3a1f, #217346); }
.preview-requirements { background: linear-gradient(135deg, #1a1714, #2d2a26, #3d35c8); }
.preview-line       { background: linear-gradient(135deg, #052a10, #0a4a20, #06c755); }
.preview-scraping   { background: linear-gradient(135deg, #0d1117, #1c2128, #58a6ff); }
.preview-care       { background: linear-gradient(135deg, #0e1a2e, #1a2e4a, #2563eb); }

.preview-label { position: absolute; bottom: 0; left: 0; right: 0; padding: 7px 12px; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); font-size: 0.62rem; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.7); text-align: center; }

.work-category { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 99px; font-size: 0.65rem; color: var(--text2); letter-spacing: 0.08em; margin-bottom: 0.7rem; }
.work-category.ai { background: rgba(99,102,241,0.12); border-color: rgba(99,102,241,0.3); color: var(--accent2); }
.work-title { font-size: 1.05rem; font-weight: 700; color: var(--text); margin-bottom: 0.5rem; letter-spacing: -0.01em; }
.work-desc { font-size: 0.78rem; color: var(--text2); line-height: 1.8; margin-bottom: 1rem; }
.work-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 1.2rem; }
.work-tag { padding: 2px 8px; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); border-radius: 4px; font-size: 0.63rem; color: var(--accent2); }
.work-footer { display: flex; align-items: center; justify-content: space-between; }
.work-price { font-size: 0.76rem; color: var(--text2); }
.work-price strong { color: var(--gold); font-size: 0.9rem; }
.work-link { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--accent2); font-weight: 600; letter-spacing: 0.05em; transition: gap 0.3s var(--ease); }
.work-card:hover .work-link { gap: 9px; }
.work-link svg { width: 12px; height: 12px; }

/* Skills */
.skills { background: var(--surface); }
.skills-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--border); margin-top: 3rem; border: 1px solid var(--border); }
.skill-card { background: var(--surface); padding: 1.8rem; transition: background 0.3s var(--ease); }
.skill-card:hover { background: var(--surface2); }
.skill-icon { width: 38px; height: 38px; border-radius: 9px; display: flex; align-items: center; justify-content: center; margin-bottom: 1rem; }
.skill-icon svg { width: 18px; height: 18px; }
.skill-name { font-size: 0.88rem; font-weight: 700; color: var(--text); margin-bottom: 0.5rem; }
.skill-desc { font-size: 0.75rem; color: var(--text2); line-height: 1.8; }
.skill-list { margin-top: 1rem; display: flex; flex-wrap: wrap; gap: 0.4rem; }
.skill-item { padding: 2px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; color: var(--text3); }

/* Flow */
.flow-section { padding: clamp(5rem,10vw,8rem) 0; }
.flow-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 0; margin-top: 3.5rem; position: relative; }
.flow-grid::before { content: ""; position: absolute; top: 28px; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, var(--border), var(--border), transparent); }
.flow-item { text-align: center; padding: 0 1rem; position: relative; }
.flow-dot { width: 56px; height: 56px; border-radius: 50%; background: var(--surface2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; position: relative; z-index: 1; transition: all 0.3s var(--ease); }
.flow-dot svg { width: 20px; height: 20px; color: var(--accent2); }
.flow-item:hover .flow-dot { background: var(--accent); border-color: var(--accent); }
.flow-item:hover .flow-dot svg { color: white; }
.flow-step { font-size: 0.62rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text3); margin-bottom: 0.4rem; }
.flow-name { font-size: 0.82rem; font-weight: 700; color: var(--text); margin-bottom: 0.4rem; }
.flow-detail { font-size: 0.72rem; color: var(--text2); line-height: 1.7; }

/* CTA */
.cta-section { padding: clamp(5rem,10vw,8rem) 0; background: var(--surface); position: relative; overflow: hidden; }
.cta-section::before { content: ""; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 800px; height: 400px; background: radial-gradient(ellipse, rgba(99,102,241,0.1) 0%, transparent 70%); pointer-events: none; }
.cta-inner { text-align: center; position: relative; z-index: 1; }
.cta-title { font-size: clamp(2rem,5vw,3.5rem); font-weight: 800; letter-spacing: -0.03em; margin-bottom: 1rem; }
.cta-title span { background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.cta-sub { font-size: 0.95rem; color: var(--text2); max-width: 480px; margin: 0 auto 2.5rem; line-height: 1.9; }
.cta-btns { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
.btn-cta-primary { padding: 14px 28px; background: var(--accent); color: white; border-radius: 8px; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.05em; transition: all 0.3s var(--ease); display: inline-flex; align-items: center; gap: 8px; }
.btn-cta-primary:hover { background: #5254cc; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,0.4); }
.btn-cta-ghost { padding: 14px 28px; background: transparent; color: var(--text2); border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.05em; transition: all 0.3s var(--ease); }
.btn-cta-ghost:hover { border-color: var(--accent2); color: var(--accent2); }

footer { background: var(--bg); border-top: 1px solid var(--border); padding: 2rem 0; text-align: center; font-size: 0.75rem; color: var(--text3); }

@media (max-width: 900px) {
  .works-grid { grid-template-columns: 1fr 1fr; }
  .span3 { grid-column: span 2; }
  .work-wide-inner { grid-template-columns: 1fr; }
  .skills-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 600px) {
  .works-grid, .skills-grid { grid-template-columns: 1fr; }
  .span3, .span2 { grid-column: span 1; }
  .flow-grid { grid-template-columns: 1fr 1fr; gap: 2rem; }
  .flow-grid::before { display: none; }
  .hero-stats { gap: 2rem; flex-wrap: wrap; }
}
</style>
</head>
<body>

<section class="hero">
  <div class="container hero-inner">
    <div class="hero-badge"><span class="hero-badge-dot"></span>Web制作・ツール・アプリ・AI開発</div>
    <h1><span class="line1">高品質・短納期・</span><span class="line2">修正無制限。</span></h1>
    <p class="hero-sub">LP制作からECサイト・業務効率化ツール・AI活用プロダクトまで。オンライン完結で全国どこからでもご依頼いただけます。</p>
    <div class="hero-tags">
      <span class="tag">LP制作</span><span class="tag">コーポレートサイト</span><span class="tag">ECサイト</span>
      <span class="tag">スマホアプリ</span><span class="tag">LINE構築</span><span class="tag">業務効率化</span>
      <span class="tag ai">🤖 AI活用ツール</span><span class="tag">修正回数無制限</span>
    </div>
    <a href="#works" class="hero-cta">制作実績を見る <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
    <div class="hero-stats">
      <div><div class="hero-stat-num">修正∞</div><div class="hero-stat-label">修正回数無制限</div></div>
      <div><div class="hero-stat-num">24h</div><div class="hero-stat-label">返信対応時間</div></div>
      <div><div class="hero-stat-num">100%</div><div class="hero-stat-label">オンライン完結</div></div>
      <div><div class="hero-stat-num">50k〜</div><div class="hero-stat-label">LP制作から対応</div></div>
    </div>
  </div>
</section>

<section class="section" id="works">
  <div class="container">
    <div class="reveal">
      <div class="section-eyebrow">Portfolio</div>
      <h2 class="section-title">制作実績</h2>
      <p class="section-sub">実際に制作したサンプルをご覧ください。ご要望に合わせてカスタマイズいたします。</p>
    </div>
    <div class="works-grid reveal">

      <!-- 01 -->
      <div class="work-card">
        <div class="work-num">01 — LP制作</div>
        <div class="work-preview"><div class="work-preview-inner preview-cafe">☕</div><div class="preview-label">Café Lumière — LP</div></div>
        <div class="work-category">ランディングページ</div>
        <div class="work-title">カフェ向けLP</div>
        <div class="work-desc">高級感あるデザインのカフェ向けLP。ヒーロー・メニュー・ギャラリー・問い合わせフォーム含む1ページ完結。</div>
        <div class="work-tags"><span class="work-tag">HTML/CSS</span><span class="work-tag">JavaScript</span><span class="work-tag">レスポンシブ</span></div>
        <div class="work-footer"><div class="work-price">参考価格 <strong>¥50,000〜</strong></div><div class="work-link">詳細 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
      </div>

      <!-- 02 -->
      <div class="work-card">
        <div class="work-num">02 — コーポレートサイト</div>
        <div class="work-preview"><div class="work-preview-inner preview-law">⚖️</div><div class="preview-label">鈴木・田中法律事務所</div></div>
        <div class="work-category">コーポレートサイト</div>
        <div class="work-title">法律事務所サイト</div>
        <div class="work-desc">信頼感・高級感のある士業向けサイト。業務案内・弁護士紹介・相談フォームを含む多ページ構成。</div>
        <div class="work-tags"><span class="work-tag">HTML/CSS</span><span class="work-tag">JavaScript</span><span class="work-tag">マルチページ</span></div>
        <div class="work-footer"><div class="work-price">参考価格 <strong>¥120,000〜</strong></div><div class="work-link">詳細 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
      </div>

      <!-- 03 -->
      <div class="work-card">
        <div class="work-num">03 — スマホアプリ</div>
        <div class="work-preview"><div class="work-preview-inner preview-app">📱</div><div class="preview-label">ShopApp — ECショッピングアプリ</div></div>
        <div class="work-category">スマホアプリ</div>
        <div class="work-title">ECショッピングアプリ</div>
        <div class="work-desc">iOS/Android対応のECアプリ。商品一覧・フラッシュセール・カート・お気に入り・決済画面まで実装。</div>
        <div class="work-tags"><span class="work-tag">React Native</span><span class="work-tag">iOS</span><span class="work-tag">Android</span></div>
        <div class="work-footer"><div class="work-price">参考価格 <strong>¥400,000〜</strong></div><div class="work-link">詳細 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
      </div>

      <!-- 04 EC wide -->
      <div class="work-card span3 work-wide">
        <div class="work-num">04 — ECサイト</div>
        <div class="work-wide-inner">
          <div class="work-preview"><div class="work-preview-inner preview-ec">🛍️</div><div class="preview-label">NOIR — プレミアムアパレルECサイト</div></div>
          <div>
            <div class="work-category">ECサイト</div>
            <div class="work-title">アパレルECサイト</div>
            <div class="work-desc">商品一覧・フィルター・カートサイドバー・ルックブックを備えたプレミアムECサイト。商品追加・削除・数量変更まで完全動作。</div>
            <div class="work-tags"><span class="work-tag">HTML/CSS</span><span class="work-tag">JavaScript</span><span class="work-tag">カート機能</span><span class="work-tag">フィルター</span><span class="work-tag">レスポンシブ</span></div>
            <div class="work-footer"><div class="work-price">参考価格 <strong>¥300,000〜</strong></div><div class="work-link">詳細を見る <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
          </div>
        </div>
      </div>

      <!-- 05 -->
      <div class="work-card">
        <div class="work-num">05 — システム開発</div>
        <div class="work-preview"><div class="work-preview-inner preview-reserve">📅</div><div class="preview-label">ReserveFlow — 予約管理</div></div>
        <div class="work-category">業務効率化ツール</div>
        <div class="work-title">予約管理システム</div>
        <div class="work-desc">ダッシュボード・予約一覧・カレンダー・統計機能を備えた業務用予約管理ツール。</div>
        <div class="work-tags"><span class="work-tag">JavaScript</span><span class="work-tag">ダッシュボード</span><span class="work-tag">カレンダー</span></div>
        <div class="work-footer"><div class="work-price">参考価格 <strong>¥200,000〜</strong></div><div class="work-link">詳細 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
      </div>

      <!-- 06 -->
      <div class="work-card">
        <div class="work-num">06 — ツール開発</div>
        <div class="work-preview"><div class="work-preview-inner preview-invoice">🧾</div><div class="preview-label">InvoiceFlow — 請求書発行</div></div>
        <div class="work-category">業務効率化ツール</div>
        <div class="work-title">請求書自動発行ツール</div>
        <div class="work-desc">リアルタイムプレビュー・消費税自動計算・PDF出力まで対応した請求書管理ツール。</div>
        <div class="work-tags"><span class="work-tag">JavaScript</span><span class="work-tag">PDF出力</span><span class="work-tag">自動計算</span></div>
        <div class="work-footer"><div class="work-price">参考価格 <strong>¥200,000〜</strong></div><div class="work-link">詳細 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
      </div>

      <!-- 07 -->
      <div class="work-card">
        <div class="work-num">07 — システム開発</div>
        <div class="work-preview"><div class="work-preview-inner preview-attendance">🕐</div><div class="preview-label">TimeFlow — 勤怠管理</div></div>
        <div class="work-category">業務効率化ツール</div>
        <div class="work-title">勤怠管理システム</div>
        <div class="work-desc">出退勤打刻・残業管理・休暇申請・CSV出力まで対応した法人向け勤怠管理システム。</div>
        <div class="work-tags"><span class="work-tag">JavaScript</span><span class="work-tag">打刻管理</span><span class="work-tag">CSV出力</span></div>
        <div class="work-footer"><div class="work-price">参考価格 <strong>¥300,000〜</strong></div><div class="work-link">詳細 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
      </div>

      <!-- 08 Stock wide -->
      <div class="work-card span3 work-wide">
        <div class="work-num">08 — システム開発</div>
        <div class="work-wide-inner">
          <div class="work-preview"><div class="work-preview-inner preview-stock">📦</div><div class="preview-label">StockFlow — 在庫管理システム</div></div>
          <div>
            <div class="work-category">業務効率化ツール</div>
            <div class="work-title">在庫管理システム</div>
            <div class="work-desc">商品一覧・在庫アラート・入出庫管理・カテゴリ別グラフ・CSV出力まで対応した法人向け在庫管理システム。在庫切れや不足をリアルタイムで通知します。</div>
            <div class="work-tags"><span class="work-tag">HTML/CSS</span><span class="work-tag">JavaScript</span><span class="work-tag">在庫アラート</span><span class="work-tag">CSV出力</span><span class="work-tag">グラフ</span></div>
            <div class="work-footer"><div class="work-price">参考価格 <strong>¥300,000〜</strong></div><div class="work-link">詳細を見る <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
          </div>
        </div>
      </div>

      <!-- 09 AI wide -->
      <div class="work-card span3 work-wide">
        <div class="work-num">09 — AI活用ツール</div>
        <div class="work-wide-inner">
          <div class="work-preview"><div class="work-preview-inner preview-proofreading">✍️</div><div class="preview-label">TextPro — AI文章添削ツール</div></div>
          <div>
            <div class="work-category ai">🤖 AI活用ツール</div>
            <div class="work-title">AI文章添削ツール</div>
            <div class="work-desc">Claude AIを活用した企業向け文章添削ツール。ビジネスメール・報告書・提案書など文書種別ごとに分析し、総合スコア・指摘事項・修正文章を自動生成します。</div>
            <div class="work-tags"><span class="work-tag">Claude API</span><span class="work-tag">AI統合</span><span class="work-tag">スコアリング</span><span class="work-tag">自動添削</span></div>
            <div class="work-footer"><div class="work-price">参考価格 <strong>¥500,000〜</strong></div><div class="work-link">詳細を見る <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
          </div>
        </div>
      </div>

      <!-- 10 -->
      <div class="work-card">
        <div class="work-num">10 — 業務自動化</div>
        <div class="work-preview"><div class="work-preview-inner preview-excel">📊</div><div class="preview-label">AutoExcel — 業務自動化ツール</div></div>
        <div class="work-category">業務効率化ツール</div>
        <div class="work-title">Excel業務自動化ツール</div>
        <div class="work-desc">マクロ登録・スプレッドシート編集・自動集計・PDF出力。売上集計・請求書・在庫アラートなど5種類のマクロを搭載。</div>
        <div class="work-tags"><span class="work-tag">JavaScript</span><span class="work-tag">マクロ実行</span><span class="work-tag">CSV/PDF出力</span></div>
        <div class="work-footer"><div class="work-price">参考価格 <strong>¥30,000〜</strong></div><div class="work-link">詳細 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
      </div>

      <!-- 11 -->
      <div class="work-card">
        <div class="work-num">11 — LINE構築</div>
        <div class="work-preview"><div class="work-preview-inner preview-line">💬</div><div class="preview-label">LINE公式アカウント構築ダッシュボード</div></div>
        <div class="work-category">LINE公式アカウント</div>
        <div class="work-title">LINE公式アカウント構築</div>
        <div class="work-desc">リッチメニュー・ステップ配信・自動応答・一斉配信・分析ダッシュボードまで備えたLINE公式アカウント構築デモ。美容院・飲食店向けに最適。</div>
        <div class="work-tags"><span class="work-tag">LINE API</span><span class="work-tag">チャットボット</span><span class="work-tag">ステップ配信</span></div>
        <div class="work-footer"><div class="work-price">参考価格 <strong>¥50,000〜</strong></div><div class="work-link">詳細 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
      </div>

      <!-- 12 -->
      <div class="work-card">
        <div class="work-num">12 — データ収集</div>
        <div class="work-preview"><div class="work-preview-inner preview-scraping">🔍</div><div class="preview-label">ScrapeBoard — データ収集・分析</div></div>
        <div class="work-category">業務効率化ツール</div>
        <div class="work-title">スクレイピング・データ収集</div>
        <div class="work-desc">競合価格監視・求人情報収集・レビュー収集をリアルタイムで行うダッシュボード。価格推移グラフ・アラート・CSV出力まで対応。</div>
        <div class="work-tags"><span class="work-tag">JavaScript</span><span class="work-tag">データ収集</span><span class="work-tag">価格監視</span><span class="work-tag">グラフ</span></div>
        <div class="work-footer"><div class="work-price">参考価格 <strong>¥30,000〜</strong></div><div class="work-link">詳細 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
      </div>

      <!-- 13 Care wide -->
      <div class="work-card span2 work-wide">
        <div class="work-num">13 — 業種特化システム</div>
        <div class="work-wide-inner">
          <div class="work-preview"><div class="work-preview-inner preview-care">🏥</div><div class="preview-label">CareFlow — 介護施設管理システム</div></div>
          <div>
            <div class="work-category">業種特化システム</div>
            <div class="work-title">介護施設管理システム</div>
            <div class="work-desc">入居者管理・バイタル記録・服薬チェック・介護記録・スケジュール管理・緊急連絡ボタンを備えた介護施設向け業務管理システム。</div>
            <div class="work-tags"><span class="work-tag">HTML/CSS</span><span class="work-tag">JavaScript</span><span class="work-tag">バイタル管理</span><span class="work-tag">服薬チェック</span><span class="work-tag">介護記録</span></div>
            <div class="work-footer"><div class="work-price">参考価格 <strong>¥500,000〜</strong></div><div class="work-link">詳細を見る <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
          </div>
        </div>
      </div>

      <!-- 14 Requirements wide -->
      <div class="work-card span3 work-wide">
        <div class="work-num">14 — 社内ツール開発</div>
        <div class="work-wide-inner">
          <div class="work-preview"><div class="work-preview-inner preview-requirements">📋</div><div class="preview-label">RequireFlow — 要件定義ツール</div></div>
          <div>
            <div class="work-category">社内業務ツール</div>
            <div class="work-title">要件定義管理ツール</div>
            <div class="work-desc">MoSCoW優先度・受入条件・ステータス管理・コメント機能を備えた社内向け要件定義ツール。機能要件・非機能要件を一元管理し、進捗率を自動計算します。</div>
            <div class="work-tags"><span class="work-tag">HTML/CSS</span><span class="work-tag">JavaScript</span><span class="work-tag">MoSCoW</span><span class="work-tag">受入条件</span><span class="work-tag">進捗管理</span></div>
            <div class="work-footer"><div class="work-price">参考価格 <strong>¥300,000〜</strong></div><div class="work-link">詳細を見る <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>
          </div>
        </div>
      </div>

    </div>
  </div>
</section>

<section class="skills section" id="skills">
  <div class="container">
    <div class="reveal">
      <div class="section-eyebrow">Skills</div>
      <h2 class="section-title">対応可能な制作</h2>
      <p class="section-sub">Web制作からAI活用ツールまで幅広く対応。ご要望に合わせて最適な提案をいたします。</p>
    </div>
    <div class="skills-grid reveal">
      <div class="skill-card">
        <div class="skill-icon" style="background:rgba(99,102,241,0.1)"><svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>
        <div class="skill-name">Web制作</div>
        <div class="skill-desc">LP・コーポレートサイト・ECサイトまで対応。</div>
        <div class="skill-list"><span class="skill-item">LP</span><span class="skill-item">コーポレートサイト</span><span class="skill-item">ECサイト</span><span class="skill-item">採用サイト</span></div>
      </div>
      <div class="skill-card">
        <div class="skill-icon" style="background:rgba(52,211,153,0.1)"><svg viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
        <div class="skill-name">システム開発</div>
        <div class="skill-desc">予約・勤怠・在庫・介護など業種特化システムを開発。</div>
        <div class="skill-list"><span class="skill-item">予約システム</span><span class="skill-item">勤怠管理</span><span class="skill-item">在庫管理</span><span class="skill-item">業種特化</span></div>
      </div>
      <div class="skill-card">
        <div class="skill-icon" style="background:rgba(255,56,92,0.1)"><svg viewBox="0 0 24 24" fill="none" stroke="#ff385c" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg></div>
        <div class="skill-name">アプリ・LINE開発</div>
        <div class="skill-desc">iOS/Androidアプリ・LINE公式アカウント構築まで対応。</div>
        <div class="skill-list"><span class="skill-item">iOS/Android</span><span class="skill-item">LINE公式</span><span class="skill-item">チャットボット</span><span class="skill-item">ステップ配信</span></div>
      </div>
      <div class="skill-card">
        <div class="skill-icon" style="background:rgba(99,102,241,0.15)"><svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg></div>
        <div class="skill-name">AI活用ツール</div>
        <div class="skill-desc">Claude APIを活用した添削・分析・自動化ツールなど企業向けAIプロダクトを開発。</div>
        <div class="skill-list"><span class="skill-item">Claude API</span><span class="skill-item">添削ツール</span><span class="skill-item">面接ツール</span><span class="skill-item">業務自動化</span></div>
      </div>
    </div>
  </div>
</section>

<section class="flow-section">
  <div class="container">
    <div class="reveal" style="text-align:center">
      <div class="section-eyebrow" style="justify-content:center"><span style="width:24px;height:1px;background:var(--accent2);display:inline-block"></span>Flow</div>
      <h2 class="section-title">ご依頼の流れ</h2>
    </div>
    <div class="flow-grid reveal">
      <div class="flow-item"><div class="flow-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><div class="flow-step">Step 01</div><div class="flow-name">お問い合わせ</div><div class="flow-detail">24時間以内に返信します。</div></div>
      <div class="flow-item"><div class="flow-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div><div class="flow-step">Step 02</div><div class="flow-name">ヒアリング</div><div class="flow-detail">要件・デザイン・納期・予算を確認。</div></div>
      <div class="flow-item"><div class="flow-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="flow-step">Step 03</div><div class="flow-name">お見積もり</div><div class="flow-detail">承認後に着手金をお支払い。</div></div>
      <div class="flow-item"><div class="flow-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div><div class="flow-step">Step 04</div><div class="flow-name">制作・修正</div><div class="flow-detail">修正は回数無制限で対応。</div></div>
      <div class="flow-item"><div class="flow-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="flow-step">Step 05</div><div class="flow-name">納品・完了</div><div class="flow-detail">残金のお支払いで完了。</div></div>
    </div>
  </div>
</section>

<section class="cta-section">
  <div class="container">
    <div class="cta-inner reveal">
      <h2 class="cta-title">まずは<span>無料相談</span>から。</h2>
      <p class="cta-sub">どんな小さなご相談でも歓迎いたします。ヒアリング・お見積もりは無料です。</p>
      <div class="cta-btns">
        <a href="#" class="btn-cta-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>無料相談を申し込む</a>
        <a href="#works" class="btn-cta-ghost">実績をもっと見る</a>
      </div>
    </div>
  </div>
</section>

<footer><div class="container"><p>© 2026 Web制作・開発ポートフォリオ — All Rights Reserved</p></div></footer>

<script>
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 100);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
</script>
</body>
</html>
