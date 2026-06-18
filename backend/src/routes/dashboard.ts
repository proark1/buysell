import type { FastifyInstance } from 'fastify';

const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Buysell Control Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#0b1120;--bg-2:#0f172a;--panel:#111a2e;--panel-2:#16213b;
      --border:rgba(148,163,184,.14);--border-strong:rgba(148,163,184,.28);
      --text:#e8eefc;--muted:#94a3b8;--faint:#64748b;
      --brand:#6366f1;--brand-2:#8b5cf6;--accent:#22d3ee;
      --green:#34d399;--amber:#fbbf24;--red:#f87171;--blue:#60a5fa;--slate:#94a3b8;--teal:#2dd4bf;
      --shadow:0 18px 40px -20px rgba(0,0,0,.65);
    }
    *{box-sizing:border-box}
    html,body{height:100%}
    body{margin:0;font-family:'Inter',system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:var(--text);
      background:radial-gradient(1200px 700px at 80% -10%,rgba(99,102,241,.16),transparent 60%),
                 radial-gradient(900px 600px at -10% 10%,rgba(34,211,238,.10),transparent 55%),
                 var(--bg);
      -webkit-font-smoothing:antialiased;font-size:14px;line-height:1.5}
    a{color:var(--blue);text-decoration:none}
    a:hover{text-decoration:underline}
    .layout{display:grid;grid-template-columns:248px 1fr;min-height:100vh}
    /* Sidebar */
    aside{position:sticky;top:0;height:100vh;border-right:1px solid var(--border);
      background:linear-gradient(180deg,rgba(17,26,46,.95),rgba(11,17,32,.95));backdrop-filter:blur(8px);
      display:flex;flex-direction:column;padding:20px 16px;gap:6px}
    .brand{display:flex;align-items:center;gap:12px;padding:6px 8px 18px}
    .logo{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-weight:800;font-size:18px;
      color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 8px 20px -6px rgba(99,102,241,.7)}
    .brand b{font-size:16px;letter-spacing:.2px}.brand span{display:block;color:var(--muted);font-size:11px;font-weight:500}
    nav{display:flex;flex-direction:column;gap:4px;margin-top:4px}
    .nav-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;color:var(--muted);
      cursor:pointer;font-weight:500;border:1px solid transparent;transition:.15s}
    .nav-item:hover{background:rgba(148,163,184,.07);color:var(--text)}
    .nav-item.active{background:linear-gradient(135deg,rgba(99,102,241,.22),rgba(139,92,246,.14));
      color:#fff;border-color:var(--border-strong)}
    .nav-item .ic{width:18px;text-align:center;opacity:.95}
    .side-foot{margin-top:auto;padding:12px 10px 4px;border-top:1px solid var(--border);color:var(--faint);font-size:11px}
    /* Main */
    main{padding:0 0 60px}
    .topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:16px;
      padding:16px 28px;border-bottom:1px solid var(--border);
      background:linear-gradient(180deg,rgba(11,17,32,.92),rgba(11,17,32,.72));backdrop-filter:blur(10px)}
    .topbar h1{margin:0;font-size:18px;font-weight:700}
    .topbar .sub{color:var(--muted);font-size:12px}
    .spacer{flex:1}
    .pill{display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:999px;
      border:1px solid var(--border-strong);background:rgba(17,26,46,.6);font-size:12px;font-weight:600;color:var(--muted)}
    .mobile-nav{display:none;margin-top:10px}
    .dot{width:9px;height:9px;border-radius:50%;background:var(--faint);box-shadow:0 0 0 0 rgba(52,211,153,.5)}
    .dot.on{background:var(--green);animation:pulse 2s infinite}
    .dot.off{background:var(--red)}
    @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.45)}70%{box-shadow:0 0 0 7px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
    .btn{display:inline-flex;align-items:center;gap:8px;cursor:pointer;border-radius:10px;
      border:1px solid var(--border-strong);padding:9px 14px;font-weight:600;font-size:13px;color:var(--text);
      background:rgba(148,163,184,.06);transition:.15s;font-family:inherit}
    .btn:hover{background:rgba(148,163,184,.13);transform:translateY(-1px)}
    .btn:active{transform:translateY(0)}
    .btn.primary{background:linear-gradient(135deg,var(--brand),var(--brand-2));border-color:transparent;
      box-shadow:0 10px 24px -10px rgba(99,102,241,.8);color:#fff}
    .btn.primary:hover{filter:brightness(1.08)}
    .btn:disabled{cursor:not-allowed;opacity:.5;transform:none;filter:none}
    .btn:disabled:hover{background:rgba(148,163,184,.06);transform:none;filter:none}
    .btn.danger{background:linear-gradient(135deg,#ef4444,#db2777);border-color:transparent;color:#fff}
    .btn.ghost{background:transparent}
    .btn.sm{padding:6px 10px;font-size:12px}
    .content{padding:26px 28px;display:grid;gap:22px;max-width:1280px}
    .view{display:none;gap:22px}
    .view.active{display:grid}
    /* Stat cards */
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px}
    .stat{position:relative;overflow:hidden;background:linear-gradient(180deg,var(--panel),var(--bg-2));
      border:1px solid var(--border);border-radius:16px;padding:18px;box-shadow:var(--shadow)}
    .stat::after{content:'';position:absolute;inset:0;background:radial-gradient(120px 60px at 100% 0,var(--gl,rgba(99,102,241,.18)),transparent 70%);pointer-events:none}
    .stat .ic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-size:19px;
      background:var(--gl,rgba(99,102,241,.16));border:1px solid var(--border)}
    .stat .label{color:var(--muted);font-size:12px;font-weight:600;margin-top:14px;text-transform:uppercase;letter-spacing:.5px}
    .stat .count{font-size:32px;font-weight:800;margin-top:2px;letter-spacing:-.5px}
    .pipeline{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px}
    .stage{border:1px solid var(--border);background:rgba(2,6,23,.28);border-radius:12px;padding:12px;min-height:86px;display:grid;align-content:space-between}
    .stage-value{font-size:26px;font-weight:800;line-height:1}
    .stage-label{font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-top:8px}
    .stage-note{font-size:11px;color:var(--faint);margin-top:4px}
    .rank-list{display:grid;gap:9px}
    .rank-row{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:10px;align-items:center;border-bottom:1px solid var(--border);padding:8px 0}
    .rank-row:last-child{border-bottom:none}
    .rank-score{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;font-weight:800;background:rgba(52,211,153,.18);color:var(--green);border:1px solid rgba(52,211,153,.28)}
    .rank-title{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rank-meta{color:var(--muted);font-size:12px;margin-top:2px}
    .pipeline-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    /* Panels */
    .panel{background:linear-gradient(180deg,var(--panel),var(--bg-2));border:1px solid var(--border);
      border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
    .panel-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border)}
    .panel-head h2{margin:0;font-size:15px;font-weight:700}
    .panel-head .hint{color:var(--muted);font-size:12px;font-weight:500}
    .list-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}
    .panel-body{padding:16px 18px}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:22px}
    @media(max-width:960px){
      .grid-2{grid-template-columns:1fr}.layout{grid-template-columns:1fr}aside{display:none}
      .topbar{flex-wrap:wrap;padding:16px;gap:10px}.topbar>div:first-child{width:100%}.topbar .spacer{display:none}
      .mobile-nav{display:block}.content{padding:18px 16px}.pill{flex:1;justify-content:center}.topbar .btn{flex:1;justify-content:center}
    }
    /* Tables */
    .table-wrap{overflow:auto;border-radius:12px;border:1px solid var(--border)}
    table{width:100%;border-collapse:collapse;font-size:13px;min-width:560px}
    thead th{position:sticky;top:0;text-align:left;padding:11px 14px;color:var(--muted);font-weight:600;
      font-size:11px;text-transform:uppercase;letter-spacing:.6px;background:var(--panel-2);border-bottom:1px solid var(--border)}
    tbody td{padding:11px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
    tbody tr:last-child td{border-bottom:none}
    tbody tr{transition:.12s}
    tbody tr:hover{background:rgba(99,102,241,.06)}
    tr.clickable{cursor:pointer}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--muted)}
    .truncate{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .empty{padding:34px;text-align:center;color:var(--faint);font-size:13px}
    .badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:11px;
      font-weight:700;letter-spacing:.3px;border:1px solid transparent}
    .badge::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
    /* Forms */
    .field{display:flex;flex-direction:column;gap:6px}
    .field label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    input,select,textarea{border-radius:10px;border:1px solid var(--border-strong);padding:10px 12px;background:rgba(2,6,23,.55);
      color:var(--text);font-family:inherit;font-size:13px;outline:none;transition:.15s;width:100%}
    textarea{min-height:112px;resize:vertical}
    input:focus,select:focus,textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(99,102,241,.18)}
    input::placeholder{color:var(--faint)}
    .form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;align-items:end}
    .form-grid.compact{grid-template-columns:repeat(auto-fit,minmax(132px,1fr))}
    .subsection-title{margin:16px 0 10px;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.55px}
    .advanced{margin-top:14px;border:1px solid var(--border);border-radius:12px;background:rgba(2,6,23,.22);padding:0 14px 14px}
    .advanced summary{cursor:pointer;list-style:none;margin:0 -14px;padding:12px 14px;color:var(--text);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid transparent}
    .advanced summary::-webkit-details-marker{display:none}
    .advanced summary::after{content:'+';float:right;color:var(--muted);font-size:15px;line-height:1}
    .advanced[open] summary{border-bottom-color:var(--border)}
    .advanced[open] summary::after{content:'-'}
    .settings-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:12px}
    .actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
    .inline{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .check{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}
    .check input{width:auto}
    .selected-tag{font-size:12px;color:var(--muted)}
    .selected-tag b{color:var(--accent)}
    .score{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:10px;font-weight:800;color:#06111f;background:var(--green)}
    .score.mid{background:var(--amber)}.score.low{background:var(--red);color:#fff}
    .result-list{display:grid;gap:12px}
    .result-card{border:1px solid var(--border);border-radius:14px;background:rgba(2,6,23,.28);padding:14px;display:grid;gap:10px}
    .result-card.rejected{border-color:rgba(248,113,113,.32);background:rgba(127,29,29,.08)}
    .result-card.review{border-color:rgba(251,191,36,.36);background:rgba(120,53,15,.10)}
    .result-card.error{border-color:rgba(248,113,113,.44);background:rgba(127,29,29,.12)}
    .result-head{display:flex;gap:12px;align-items:flex-start}
    .result-main{min-width:0;flex:1}.result-title{font-weight:700}.result-meta{color:var(--muted);font-size:12px;margin-top:3px}
    .chips{display:flex;gap:6px;flex-wrap:wrap}.chip{font-size:11px;font-weight:700;border-radius:999px;padding:3px 8px;border:1px solid var(--border-strong);color:var(--muted)}
    .section-label{display:flex;align-items:center;gap:8px;color:var(--text);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin:2px 0}
    .section-label span{color:var(--muted);font-weight:700;text-transform:none;letter-spacing:0}
    .mini-summary{display:flex;gap:8px;flex-wrap:wrap;align-items:center;color:var(--muted);font-size:12px;padding:8px 0}
    .placeholder-check{width:20px;flex:0 0 20px}
    .comparison-box{border:1px solid var(--border);border-radius:10px;background:rgba(15,23,42,.48);padding:10px;display:grid;gap:7px}
    .comparison-box.locked{border-color:rgba(248,113,113,.28);background:rgba(127,29,29,.1)}
    .comparison-box.review{border-color:rgba(251,191,36,.35);background:rgba(120,53,15,.11)}
    .comparison-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;color:var(--text)}
    .comparison-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px}
    .metric{border:1px solid var(--border);border-radius:8px;padding:7px 8px;background:rgba(2,6,23,.35)}
    .metric .mk{color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:.4px}.metric .mv{font-size:13px;font-weight:800;margin-top:1px}
    .card-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .compact-products{display:grid;gap:8px}
    .compact-product{border:1px solid var(--border);border-radius:10px;background:rgba(2,6,23,.26);overflow:hidden}
    .compact-product[open]{border-color:var(--border-strong);background:rgba(15,23,42,.55)}
    .compact-product summary{cursor:pointer;list-style:none;display:grid;grid-template-columns:44px minmax(260px,1fr) 100px 86px 116px 140px;gap:10px;align-items:center;padding:8px 10px}
    .compact-product summary::-webkit-details-marker{display:none}
    .compact-title{min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .compact-cell{color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .compact-detail{border-top:1px solid var(--border);padding:10px;display:grid;gap:8px}
    .list-controls{display:grid;grid-template-columns:minmax(220px,1fr) 150px 120px auto;gap:10px;align-items:end;margin-bottom:12px}
    .pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:12px;color:var(--muted);font-size:12px}
    .pager .btn{min-width:34px;justify-content:center}
    @media(max-width:920px){.compact-product summary{grid-template-columns:40px minmax(160px,1fr) 82px 80px}.compact-hide-sm{display:none}}
    @media(max-width:760px){.list-controls{grid-template-columns:1fr 1fr}.pager{justify-content:flex-start;flex-wrap:wrap}}
    /* KV settings */
    .kv{display:grid;grid-template-columns:1fr auto;gap:10px 16px}
    .kv .k{color:var(--muted)}.kv .v{font-weight:600;text-align:right}
    /* Toasts */
    .toasts{position:fixed;right:20px;bottom:20px;display:flex;flex-direction:column;gap:10px;z-index:100;max-width:380px}
    .toast{display:flex;gap:11px;align-items:flex-start;padding:13px 15px;border-radius:12px;
      background:rgba(17,26,46,.97);border:1px solid var(--border-strong);box-shadow:var(--shadow);
      animation:slidein .25s ease;font-size:13px}
    .toast .tc{width:8px;align-self:stretch;border-radius:6px;flex:0 0 4px;background:var(--brand)}
    .toast.ok .tc{background:var(--green)}.toast.err .tc{background:var(--red)}.toast.warn .tc{background:var(--amber)}
    .toast .body{flex:1;min-width:0}.toast .t{font-weight:700;margin-bottom:2px}
    .toast pre{margin:6px 0 0;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto;
      color:var(--muted);font-size:11px;background:rgba(2,6,23,.6);padding:8px;border-radius:8px}
    @keyframes slidein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .banner{display:none;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;
      background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.35);color:#fecaca;font-size:13px;font-weight:500}
    .banner.show{display:flex}
    code{background:rgba(2,6,23,.6);padding:2px 6px;border-radius:6px;font-size:12px;color:var(--accent)}
    /* Credentials */
    .cred-group+.cred-group{margin-top:20px;padding-top:18px;border-top:1px solid var(--border)}
    .cred-group-title{font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}
    .cred-row{display:grid;grid-template-columns:1.1fr 1.3fr auto;gap:16px;align-items:center;padding:14px 0;border-bottom:1px solid var(--border)}
    .cred-row:last-child{border-bottom:none}
    .cred-label{font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .cred-actions{display:flex;gap:8px}
    @media(max-width:760px){.cred-row{grid-template-columns:1fr;gap:10px}}
  </style>
</head>
<body>
<div class="layout">
  <aside>
    <div class="brand">
      <div class="logo">B</div>
      <div><b>Buysell</b><span>Control Center</span></div>
    </div>
    <nav id="nav">
      <div class="nav-item active" data-view="overview"><span class="ic">▦</span> Overview</div>
      <div class="nav-item" data-view="actions"><span class="ic">⚡</span> Actions</div>
      <div class="nav-item" data-view="automation"><span class="ic">◉</span> Automation</div>
      <div class="nav-item" data-view="catalog"><span class="ic">◳</span> Listings &amp; Orders</div>
      <div class="nav-item" data-view="discovery"><span class="ic">⌕</span> Discovery</div>
      <div class="nav-item" data-view="ebayDiscovery"><span class="ic">⇄</span> eBay Discovery</div>
      <div class="nav-item" data-view="keys"><span class="ic">🔑</span> API Keys</div>
      <div class="nav-item" data-view="settings"><span class="ic">⚙</span> Settings</div>
    </nav>
    <div class="side-foot">
      API: <a href="/health">/health</a> · <a href="/api/dashboard">/api/dashboard</a><br>
      <span id="footVer">v0.1.0</span>
    </div>
  </aside>

  <main>
    <div class="topbar">
      <div>
        <h1 id="viewTitle">Overview</h1>
        <div class="sub" id="viewSub">Live snapshot of your arbitrage pipeline</div>
        <select id="mobileNav" class="mobile-nav" aria-label="View">
          <option value="overview">Overview</option>
          <option value="actions">Actions</option>
          <option value="automation">Automation</option>
          <option value="catalog">Listings &amp; Orders</option>
          <option value="discovery">Discovery</option>
          <option value="ebayDiscovery">eBay Discovery</option>
          <option value="keys">API Keys</option>
          <option value="settings">Settings</option>
        </select>
      </div>
      <div class="spacer"></div>
      <div class="pill"><span class="dot" id="dbDot"></span><span id="dbLabel">Checking DB…</span></div>
      <div class="pill" id="updatedPill">Updated —</div>
      <button class="btn primary" onclick="load()"><span>↻</span> Refresh</button>
    </div>

    <div class="content">
      <div class="banner" id="offline"><span>⚠</span><span id="offlineMsg">Backend data unavailable.</span></div>

      <!-- OVERVIEW -->
      <section class="view active" id="view-overview">
        <div class="stats" id="stats"></div>
        <div class="panel">
          <div class="panel-head"><h2>Opportunity Pipeline</h2><span class="hint">eBay demand to Amazon source comparison</span><span class="spacer"></span><button class="btn sm" onclick="navigate('ebayDiscovery')">Open Discovery</button></div>
          <div class="panel-body">
            <div class="pipeline" id="pipelineFunnel"></div>
            <div class="pipeline-actions" id="pipelineActions"></div>
          </div>
        </div>
        <div class="grid-2">
          <div class="panel">
            <div class="panel-head"><h2>Top Opportunities</h2><span class="hint">Highest score candidates</span></div>
            <div class="panel-body"><div id="topOpportunities" class="rank-list"></div></div>
          </div>
          <div class="panel">
            <div class="panel-head"><h2>Learning &amp; Reliability</h2><span class="hint">Feedback, locks, evidence, and realized P/L</span></div>
            <div class="panel-body">
              <div class="pipeline" id="learningMetrics"></div>
              <div class="subsection-title">Scheduler Locks</div>
              <div id="schedulerLocks" class="rank-list"></div>
            </div>
          </div>
        </div>
        <div class="grid-2">
          <div class="panel">
            <div class="panel-head"><h2>Priority Actions</h2><span class="hint">Top pending items</span></div>
            <div class="panel-body"><div class="table-wrap"><div id="ovActions"></div></div></div>
          </div>
          <div class="panel">
            <div class="panel-head"><h2>Recent Listings</h2><span class="hint">Latest eBay listings</span></div>
            <div class="panel-body"><div class="table-wrap"><div id="ovListings"></div></div></div>
          </div>
        </div>
      </section>

      <!-- ACTIONS -->
      <section class="view" id="view-actions">
        <div class="panel">
          <div class="panel-head"><h2>Amazon Price Protection</h2><span class="hint">Pause listings when Amazon cost rises</span></div>
          <div class="panel-body">
            <div class="inline">
              <button class="btn danger" onclick="runMonitor()"><span>🛡</span> Run Price Check Now</button>
              <span class="hint">Scans active listings against current Amazon pricing.</span>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Review Queue</h2><span class="hint">Click a row to select, then act</span></div>
          <div class="panel-body">
            <div class="inline" style="margin-bottom:14px">
              <input id="actionId" placeholder="Action ID (or click a row)" style="max-width:320px">
              <button class="btn" onclick="approveAction()">✓ Approve</button>
              <button class="btn primary" onclick="executeAction()">▶ Execute</button>
              <button class="btn" onclick="completeSelectedAction()">✓ Complete</button>
              <button class="btn ghost" onclick="rejectAction()">✕ Reject</button>
              <span class="selected-tag" id="selTag"></span>
            </div>
            <div class="inline" style="margin-bottom:14px">
              <button class="btn" onclick="queueAutomation('VERIFY')">Queue Verify</button>
              <button class="btn" onclick="queueAutomation('DRAFT')">Queue Draft</button>
              <button class="btn" onclick="queueAutomation('ASSISTED')">Queue Assisted</button>
              <button class="btn danger" onclick="queueAutomation('AUTOPILOT')">Queue Autopilot</button>
            </div>
            <div class="table-wrap"><div id="actionsTable"></div></div>
          </div>
        </div>
      </section>

      <!-- AUTOMATION -->
      <section class="view" id="view-automation">
        <div class="panel">
          <div class="panel-head"><h2>Automation Runs</h2><span class="hint">Browser and computer-use operator history</span></div>
          <div class="panel-body"><div class="table-wrap"><div id="automationRunsTable"></div></div></div>
        </div>
      </section>

      <!-- CATALOG -->
      <section class="view" id="view-catalog">
        <div class="panel">
          <div class="panel-head"><h2>eBay Listings</h2></div>
          <div class="panel-body"><div class="table-wrap"><div id="listingsTable"></div></div></div>
        </div>
        <div class="grid-2">
          <div class="panel">
            <div class="panel-head"><h2>Manual eBay Order</h2><span class="hint">Create a BUY action</span></div>
            <div class="panel-body">
              <div class="form-grid">
                <div class="field"><label>eBay Order ID</label><input id="orderEbayOrderId" placeholder="ORDER-1"></div>
                <div class="field"><label>eBay Item ID</label><input id="orderEbayItemId" placeholder="EBAY-ITEM-1"></div>
                <div class="field"><label>Buyer Name</label><input id="orderBuyerName" placeholder="Buyer"></div>
                <div class="field"><label>Sale Price</label><input id="orderSalePrice" type="number" step="0.01" placeholder="54.99"></div>
              </div>
              <div class="actions-row"><button class="btn primary" onclick="createOrder()">Create BUY action</button></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><h2>Record Amazon Purchase</h2></div>
            <div class="panel-body">
              <div class="form-grid">
                <div class="field"><label>Internal Order ID</label><input id="purchaseOrderId" placeholder="order_id"></div>
                <div class="field"><label>ASIN</label><input id="purchaseAsin" placeholder="B000000000"></div>
                <div class="field"><label>Amazon Order ID</label><input id="purchaseAmazonOrderId" placeholder="AMZ-1"></div>
                <div class="field"><label>Purchase Price</label><input id="purchasePrice" type="number" step="0.01" placeholder="31.50"></div>
              </div>
              <div class="actions-row"><button class="btn primary" onclick="recordPurchase()">Record purchase</button></div>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Orders</h2></div>
          <div class="panel-body"><div class="table-wrap"><div id="ordersTable"></div></div></div>
        </div>
      </section>

      <!-- DISCOVERY -->
      <section class="view" id="view-discovery">
        <div class="panel">
          <div class="panel-head"><h2>Amazon Scout</h2><span class="hint">Find promising Amazon products before spending eBay checks</span><span class="spacer"></span><span class="hint" id="keepaTokenHint">Keepa tokens —</span></div>
          <div class="panel-body">
            <div class="settings-strip">
              <div class="field"><label>Market</label><select id="amazonScoutMarket"></select></div>
              <div class="field"><label>eBay Preset</label><select id="amazonScoutEbayPreset"></select></div>
            </div>
            <div class="subsection-title">Amazon search</div>
            <div class="form-grid">
              <div class="field"><label>Scout Profile</label><select id="amazonScoutProfile"></select></div>
              <div class="field"><label>Category</label><select id="amazonScoutCategory"></select></div>
              <div class="field" style="grid-column:span 2"><label>Optional Amazon Keywords</label><input id="amazonScoutQuery" placeholder="thermal label printer"></div>
              <div class="field"><label>Amazon Products To Check</label><input id="amazonScoutLimit" type="number" min="1" max="100" value="40"></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="amazonScoutSafeMode" type="checkbox" checked> Safe mode</label></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="amazonScoutAuto" type="checkbox"> Auto compare top candidates</label></div>
            </div>
            <details class="advanced">
              <summary>Advanced filters</summary>
              <div class="subsection-title">Amazon score filters</div>
              <div class="form-grid compact">
                <div class="field"><label>Min Amazon Score</label><input id="amazonScoutMinScore" type="number" min="0" max="100" value="62"></div>
                <div class="field"><label>Max Amazon Cost</label><input id="amazonScoutMaxCost" type="number" min="1" step="1" value="150"></div>
                <div class="field"><label>Min Price Drop %</label><input id="amazonScoutMinDrop" type="number" min="0" max="100" step="1" value="5"></div>
              </div>
              <div class="subsection-title">eBay comparison gates</div>
              <div class="form-grid compact">
                <div class="field"><label>Max eBay Comparisons</label><input id="amazonScoutCompareLimit" type="number" min="1" max="50" value="12"></div>
                <div class="field"><label>eBay Results Per Product</label><input id="amazonScoutEbayResults" type="number" min="1" max="50" value="10"></div>
                <div class="field"><label>Min Profit</label><input id="amazonScoutMinProfit" type="number" min="0" step="1" value="10"></div>
                <div class="field"><label>Min ROI %</label><input id="amazonScoutMinRoi" type="number" min="0" max="500" step="1" value="20"></div>
                <div class="field"><label>Min Match %</label><input id="amazonScoutMinMatch" type="number" min="0" max="100" step="1" value="60"></div>
                <div class="field"><label>Min Compare Score</label><input id="amazonScoutMinCompareScore" type="number" min="0" max="100" step="1" value="55"></div>
                <div class="field"><label>Buying Format</label><select id="amazonScoutBuyingFormat"><option value="BIN" selected>Buy It Now</option></select></div>
                <div class="field"><label>Condition</label><select id="amazonScoutCondition"><option value="NEW" selected>New</option></select></div>
                <div class="field"><label>eBay Location</label><select id="amazonScoutLocation"><option value="Domestic">Domestic</option><option value="Regional">Regional</option><option value="Worldwide">Worldwide</option><option value="ANY">Any</option></select></div>
                <div class="field"><label>Postal Code</label><input id="amazonScoutPostalCode" placeholder="10115"></div>
                <div class="field"><label>&nbsp;</label><label class="check"><input id="amazonScoutSoldOnly" type="checkbox" checked> Sold</label></div>
                <div class="field"><label>&nbsp;</label><label class="check"><input id="amazonScoutCompletedOnly" type="checkbox" checked> Completed</label></div>
              </div>
            </details>
            <div class="actions-row">
              <button class="btn primary" id="amazonScoutRunBtn" onclick="runAmazonScout()">Find Amazon Candidates</button>
              <button class="btn" id="amazonScoutSelectBtn" onclick="selectHighAmazonScores()">Select High Score</button>
              <button class="btn primary" id="amazonScoutCompareBtn" onclick="compareSelectedAmazon()">Compare Selected With eBay</button>
              <span class="hint" id="amazonScoutHint"></span>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Amazon Candidates</h2><span class="hint" id="amazonScoutSummary">Run Amazon Scout to build a shortlist.</span></div>
          <div class="panel-body"><div id="amazonScoutResults" class="result-list"><div class="empty">No Amazon scout results yet.</div></div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Recent Amazon Scout Runs</h2></div>
          <div class="panel-body"><div class="table-wrap"><div id="amazonScoutRunsTable"></div></div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Guided Discovery</h2><span class="hint">Rank safe, explainable product opportunities</span></div>
          <div class="panel-body">
            <div class="form-grid">
              <div class="field"><label>Profile</label><select id="scanProfile"></select></div>
              <div class="field" style="grid-column:span 2"><label>Optional Keywords</label><input id="searchQuery" placeholder="wireless barcode scanner"></div>
              <div class="field"><label>Limit</label><input id="searchLimit" type="number" min="1" max="25" value="8"></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="scanSafeMode" type="checkbox" checked> Safe mode</label></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="searchPersist" type="checkbox" checked> Save accepted</label></div>
            </div>
            <details class="advanced">
              <summary>Advanced filters</summary>
              <div class="form-grid compact">
                <div class="field"><label>Min Score</label><input id="scanMinScore" type="number" min="0" max="100" value="65"></div>
                <div class="field"><label>Max Amazon Cost</label><input id="scanMaxCost" type="number" min="1" step="1" value="150"></div>
              </div>
            </details>
            <div class="actions-row"><button class="btn primary" onclick="searchOpportunities()">⌕ Find Opportunities</button><span class="hint" id="scanHint"></span></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Ranked Results</h2><span class="hint" id="scanSummary">Run a scan to see scored opportunities.</span></div>
          <div class="panel-body"><div id="scanResults" class="result-list"><div class="empty">No scan results yet.</div></div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Recent Scans</h2></div>
          <div class="panel-body"><div class="table-wrap"><div id="scanRunsTable"></div></div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Product Candidates</h2></div>
          <div class="panel-body"><div class="table-wrap"><div id="productsTable"></div></div></div>
        </div>
      </section>

      <!-- EBAY DISCOVERY -->
      <section class="view" id="view-ebayDiscovery">
        <div class="panel">
          <div class="panel-head"><h2>eBay Discovery</h2><span class="hint">Find sold eBay products first, then check Amazon source prices</span></div>
          <div class="panel-body">
            <div class="settings-strip">
              <div class="field"><label>Market</label><select id="ebayDiscoveryMarket"></select></div>
              <div class="field"><label>Profile</label><select id="ebayDiscoveryProfile"></select></div>
            </div>
            <div class="subsection-title">Sold product search</div>
            <div class="form-grid">
              <div class="field"><label>Category</label><select id="ebayDiscoveryCategory"></select></div>
              <div class="field" style="grid-column:span 2"><label>Optional eBay Keywords</label><input id="ebayDiscoveryQuery" placeholder="wireless barcode scanner"></div>
              <div class="field"><label>Sold Products To Check</label><input id="ebayDiscoveryLimit" type="number" min="1" max="100" value="25"></div>
              <div class="field"><label>Query Breadth</label><select id="ebayDiscoveryQueryBreadth"><option value="BALANCED" selected>Balanced</option><option value="WIDE">Wide</option><option value="FOCUSED">Focused</option></select></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoverySoldOnly" type="checkbox" checked> Sold</label></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoveryCompletedOnly" type="checkbox" checked> Completed</label></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoverySafeMode" type="checkbox" checked> Safe mode</label></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoverySkipExisting" type="checkbox" checked> Skip known products</label></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoveryAuto" type="checkbox"> Auto compare top candidates</label></div>
            </div>
            <details class="advanced">
              <summary>Advanced filters</summary>
              <div class="subsection-title">eBay filters</div>
              <div class="form-grid compact">
                <div class="field"><label>eBay Category ID</label><input id="ebayDiscoveryCategoryId" placeholder="optional"></div>
                <div class="field"><label>Min eBay Score</label><input id="ebayDiscoveryMinScore" type="number" min="0" max="100" value="50"></div>
                <div class="field"><label>Min Sold Price</label><input id="ebayDiscoveryMinSold" type="number" min="0" step="1" value="25"></div>
                <div class="field"><label>Max Sold Price</label><input id="ebayDiscoveryMaxSold" type="number" min="0" step="1" value="250"></div>
                <div class="field"><label>Buying Format</label><select id="ebayDiscoveryBuyingFormat"><option value="BIN" selected>Buy It Now</option></select></div>
                <div class="field"><label>Condition</label><select id="ebayDiscoveryCondition"><option value="NEW" selected>New</option></select></div>
                <div class="field"><label>Location</label><select id="ebayDiscoveryLocation"><option value="Domestic">Domestic</option><option value="Regional">Regional</option><option value="Worldwide">Worldwide</option><option value="ANY">Any</option></select></div>
                <div class="field"><label>Postal Code</label><input id="ebayDiscoveryPostalCode" placeholder="10115"></div>
              </div>
              <div class="subsection-title">Amazon comparison gates</div>
              <div class="form-grid compact">
                <div class="field"><label>Max Amazon Comparisons</label><input id="ebayDiscoveryCompareLimit" type="number" min="1" max="50" value="10"></div>
                <div class="field"><label>Amazon Matches Per Product</label><input id="ebayDiscoveryAmazonMatches" type="number" min="1" max="10" value="3"></div>
                <div class="field"><label>Min Profit</label><input id="ebayDiscoveryMinProfit" type="number" min="0" step="1" value="10"></div>
                <div class="field"><label>Min ROI %</label><input id="ebayDiscoveryMinRoi" type="number" min="0" max="500" step="1" value="25"></div>
                <div class="field"><label>Min Match %</label><input id="ebayDiscoveryMinMatch" type="number" min="0" max="100" step="1" value="75"></div>
                <div class="field"><label>Min Compare Score</label><input id="ebayDiscoveryMinCompareScore" type="number" min="0" max="100" step="1" value="65"></div>
              </div>
              <div class="subsection-title">Automatic discovery</div>
              <div class="form-grid compact">
                <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayAutoRunEnabled" type="checkbox"> Run every interval</label></div>
                <div class="field"><label>Interval Minutes</label><input id="ebayAutoRunInterval" type="number" min="1" max="1440" value="1"></div>
                <div class="field"><label>Products Per Run</label><input id="ebayAutoRunLimit" type="number" min="1" max="25" value="5"></div>
                <div class="field"><label>&nbsp;</label><button class="btn" onclick="saveEbayAutoRun()">Save / Change Job</button></div>
                <div class="field"><label>&nbsp;</label><button class="btn" onclick="runEbayAutoNow()">Run Auto Now</button></div>
                <div class="field"><label>&nbsp;</label><button class="btn" onclick="stopEbayAutoRun()">Stop Job</button></div>
                <div class="field"><label>&nbsp;</label><button class="btn danger" onclick="deleteEbayAutoRun()">Delete Job</button></div>
              </div>
              <div class="subsection-title">Automatic Amazon comparison</div>
              <div class="form-grid compact">
                <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayAmazonCompareEnabled" type="checkbox"> Compare every interval</label></div>
                <div class="field"><label>Interval Minutes</label><input id="ebayAmazonCompareInterval" type="number" min="1" max="1440" value="1"></div>
                <div class="field"><label>Products Per Run</label><input id="ebayAmazonCompareLimit" type="number" min="1" max="25" value="1"></div>
                <div class="field"><label>&nbsp;</label><button class="btn" onclick="saveEbayAmazonCompareAutoRun()">Save / Change Job</button></div>
                <div class="field"><label>&nbsp;</label><button class="btn" onclick="runEbayAmazonCompareNow()">Run Compare Now</button></div>
                <div class="field"><label>&nbsp;</label><button class="btn" onclick="stopEbayAmazonCompareAutoRun()">Stop Job</button></div>
                <div class="field"><label>&nbsp;</label><button class="btn danger" onclick="deleteEbayAmazonCompareAutoRun()">Delete Job</button></div>
              </div>
            </details>
            <div class="actions-row">
              <button class="btn primary" id="ebayDiscoveryRunBtn" onclick="runEbayDiscovery()">Find eBay Sold Products</button>
              <button class="btn" id="ebayDiscoverySelectBtn" onclick="selectHighEbayScores()">Select High Score</button>
              <button class="btn primary" id="ebayDiscoveryCompareBtn" onclick="compareSelectedEbay()">Compare Selected With Amazon</button>
              <span class="hint" id="ebayDiscoveryHint"></span>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>eBay Sold Candidates</h2><span class="hint" id="ebayDiscoverySummary">Run eBay Discovery to build a shortlist.</span></div>
          <div class="panel-body"><div id="ebayDiscoveryResults" class="result-list"><div class="empty">No eBay discovery results yet.</div></div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>All eBay Product Lines</h2><span class="hint" id="ebayCompactSummary">Compact one-line view across recent discovery products.</span><span class="list-actions"><button class="btn sm" onclick="setListRowsExpanded('ebayCompactProducts',true)">Expand all</button><button class="btn sm" onclick="setListRowsExpanded('ebayCompactProducts',false)">Collapse all</button></span></div>
          <div class="panel-body">
            <div class="list-controls">
              <div class="field"><label>Search</label><input id="ebayCompactSearch" placeholder="title, family, category, source" oninput="updateEbayCompactFilters()"></div>
              <div class="field"><label>Status</label><select id="ebayCompactStatus" onchange="updateEbayCompactFilters()"><option value="ALL">All</option><option value="NOT_COMPARED">Queued</option><option value="OPPORTUNITY">Opportunity</option><option value="MANUAL_REVIEW">Manual review</option><option value="REJECTED">Rejected</option><option value="ERROR">Error</option></select></div>
              <div class="field"><label>Min Score</label><input id="ebayCompactMinScore" type="number" min="0" max="100" step="1" placeholder="0" oninput="updateEbayCompactFilters()"></div>
              <div class="field"><label>&nbsp;</label><button class="btn" onclick="clearEbayCompactFilters()">Clear</button></div>
            </div>
            <div id="ebayCompactProducts" class="compact-products"><div class="empty">No product lines yet.</div></div>
            <div id="ebayCompactPager" class="pager"></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Amazon Comparison Queue</h2><span class="hint" id="ebayAmazonComparisonSummary">Highest eBay score is compared first.</span><span class="list-actions"><button class="btn sm" onclick="setListRowsExpanded('ebayAmazonComparisonRows',true)">Expand all</button><button class="btn sm" onclick="setListRowsExpanded('ebayAmazonComparisonRows',false)">Collapse all</button></span></div>
          <div class="panel-body">
            <div class="list-controls">
              <div class="field"><label>Search</label><input id="ebayCompareSearch" placeholder="title, item, Amazon match" oninput="updateEbayCompareFilters()"></div>
              <div class="field"><label>Status</label><select id="ebayCompareStatus" onchange="updateEbayCompareFilters()"><option value="ALL">All</option><option value="QUEUED">Queued</option><option value="OPPORTUNITY">Opportunity</option><option value="MANUAL_REVIEW">Manual review</option><option value="REJECTED">Rejected</option><option value="ERROR">Error</option></select></div>
              <div class="field"><label>Min Score</label><input id="ebayCompareMinScore" type="number" min="0" max="100" step="1" placeholder="0" oninput="updateEbayCompareFilters()"></div>
              <div class="field"><label>&nbsp;</label><button class="btn" onclick="clearEbayCompareFilters()">Clear</button></div>
            </div>
            <div id="ebayCompareTimerInfo" class="mini-summary"></div>
            <div id="ebayAmazonComparisonRows" class="compact-products"><div class="empty">No comparison rows yet.</div></div>
            <div id="ebayComparePager" class="pager"></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Recent eBay Discovery Runs</h2></div>
          <div class="panel-body"><div class="table-wrap"><div id="ebayDiscoveryRunsTable"></div></div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Recent Amazon Comparison Jobs</h2><span class="hint">Timer and manual eBay-to-Amazon comparison runs.</span></div>
          <div class="panel-body"><div class="table-wrap"><div id="ebayAmazonComparisonRunsTable"></div></div></div>
        </div>
      </section>

      <!-- API KEYS -->
      <section class="view" id="view-keys">
        <div class="banner" id="keysLocked" style="display:none;background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.35);color:#fde68a">
          <span>🔒</span><span>These routes are protected. Configure <b>LOCAL_AGENT_SHARED_SECRET</b> on the backend, then save the same value under Settings → Local Agent Connection in this browser.</span>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>API Keys &amp; Credentials</h2><span class="hint">Values are encrypted (AES-256-GCM) and saved in Postgres; they override environment variables.</span></div>
          <div class="panel-body"><div id="credsContainer"><div class="empty">Loading…</div></div></div>
        </div>
      </section>

      <!-- SETTINGS -->
      <section class="view" id="view-settings">
        <div class="grid-2">
          <div class="panel">
            <div class="panel-head"><h2>Price-Check Interval</h2></div>
            <div class="panel-body">
              <div class="field"><label>Interval (minutes)</label>
                <div class="inline"><input id="interval" type="number" min="1" placeholder="30" style="max-width:160px">
                <button class="btn primary" onclick="saveInterval()">Save</button></div>
              </div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><h2>Local Agent Connection</h2><span class="hint">Stored in this browser only</span></div>
            <div class="panel-body">
              <div class="field"><label>Shared Secret</label>
                <div class="inline"><input id="agentSecret" type="password" placeholder="LOCAL_AGENT_SHARED_SECRET" style="max-width:280px">
                <button class="btn" onclick="saveSecret()">Save</button><button class="btn ghost" onclick="clearSecret()">Clear</button></div>
              </div>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Discovery Safety</h2><span class="hint">Default guardrails for new scans</span></div>
          <div class="panel-body">
            <div class="form-grid">
              <div class="field"><label>Safe Mode</label><label class="check"><input id="settingsSafeMode" type="checkbox"> Keep risky products out</label></div>
              <div class="field"><label>Minimum Score</label><input id="settingsMinScore" type="number" min="0" max="100"></div>
              <div class="field"><label>Max Amazon Cost</label><input id="settingsMaxCost" type="number" min="1" step="1"></div>
              <div class="field"><label>Allowed Categories</label><textarea id="settingsAllowedCategories" placeholder="One per line"></textarea></div>
              <div class="field"><label>Blocked Categories</label><textarea id="settingsBlockedCategories" placeholder="One per line"></textarea></div>
              <div class="field"><label>Blocked Keywords</label><textarea id="settingsBlockedKeywords" placeholder="One per line"></textarea></div>
            </div>
            <div class="actions-row"><button class="btn primary" onclick="saveSafety()">Save Safety Rules</button></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Active Rule Config</h2><span class="hint">Profit thresholds and safety gates</span></div>
          <div class="panel-body"><div class="kv" id="settingsKv"></div></div>
        </div>
      </section>
    </div>
  </main>
</div>
<div class="toasts" id="toasts"></div>

<script>
var state={data:null,profiles:[],amazonProfiles:[],amazonMarkets:[],ebayPresets:[],amazonScoutRunId:null,amazonScoutCandidates:[],amazonScoutReview:[],amazonScoutRejected:[],selectedAmazon:{},ebayDiscoveryProfiles:[],ebayDiscoveryMarkets:[],ebayDiscoveryRunId:null,ebayDiscoveryCandidates:[],ebayDiscoveryReview:[],ebayDiscoveryRejected:[],selectedEbay:{},keepaToken:null,ebayCompactPage:1,ebayComparePage:1,expandedLists:{}};
var pageSize=20;
var META={
  overview:['Overview','Live snapshot of your arbitrage pipeline'],
  actions:['Actions','Approve, execute, and protect your listings'],
  automation:['Automation','Track AI browser runs, evidence, and confirmation states'],
  catalog:['Listings & Orders','Manage marketplace inventory and fulfillment'],
  discovery:['Discovery','Scout Amazon first, then compare selected products with eBay'],
  ebayDiscovery:['eBay Discovery','Start from sold eBay products, then compare with Amazon'],
  keys:['API Keys & Credentials','Encrypted at rest, stored in your database'],
  settings:['Settings','Thresholds, intervals, and connections']
};
var BADGE={
  PENDING:'amber',APPROVED:'blue',COMPLETED:'green',REJECTED:'slate',CANCELLED:'red',ERROR:'red',
  ACTIVE:'green',PAUSED:'amber',DRAFT:'slate',ENDED:'slate',
  NEW:'blue',VALIDATING:'amber',READY_FOR_PURCHASE:'blue',MANUAL_REVIEW:'amber',PURCHASED:'green',SHIPPED:'teal',
  VERIFY:'amber',LIST:'blue',REPRICE:'teal',PAUSE:'amber',BUY:'green',REVIEW:'slate',
  DRAFT:'blue',ASSISTED:'amber',AUTOPILOT:'red',
  NEEDS_HUMAN_CONFIRMATION:'amber',FAILED:'red',REVIEW_REQUIRED:'amber',SKIPPED:'slate',
  PASS:'green',WARN:'amber',REJECT:'red',RUNNING:'blue',NOT_COMPARED:'slate',COMPARING:'blue',OPPORTUNITY:'green'
  ,NO_EBAY_RESULTS:'red',NO_FIXED_PRICE_EBAY_RESULTS:'red',NO_PRICED_EBAY_RESULTS:'red',NO_AMAZON_RESULTS:'red',NO_PRICED_AMAZON_RESULTS:'red',SKIPPED_EBAY_SOURCE_FORMAT:'red',SKIPPED_EBAY_SOURCE_DATA:'red'
};
var COLORS={green:'#34d399',amber:'#fbbf24',red:'#f87171',blue:'#60a5fa',slate:'#94a3b8',teal:'#2dd4bf'};

  function authHeaders(){var s=localStorage.getItem('localAgentSecret');return s?{'x-local-agent-secret':s}:{}}
  function apiFetch(url,options){options=options||{};var h=Object.assign({},options.headers||{},authHeaders());return fetch(url,Object.assign({},options,{headers:h}))}
  function responseJson(r){return r.json().catch(function(){return{error:'HTTP '+r.status}}).then(function(j){if(!r.ok){var m=j.error||('HTTP '+r.status);if(j.details)m+='\\n'+(typeof j.details==='string'?j.details:JSON.stringify(j.details));var err=new Error(m);err.status=r.status;err.payload=j;throw err}return j})}
  function apiJson(url,options){return apiFetch(url,options).then(responseJson)}
  function jpost(url,body){var h=Object.assign({'content-type':'application/json'},authHeaders());return fetch(url,{method:'POST',headers:h,body:JSON.stringify(body)}).then(responseJson)}
  function confirmAction(title,detail){return window.confirm(title+(detail?'\\n\\n'+detail:''))}
  function applyListRowsExpanded(id){
    var el=document.getElementById(id);
    if(!el||!state.expandedLists)return;
    var expanded=state.expandedLists[id];
    if(expanded===undefined)return;
    el.querySelectorAll('details').forEach(function(row){row.open=!!expanded});
  }
  function setListRowsExpanded(id,expanded){
    state.expandedLists[id]=!!expanded;
    applyListRowsExpanded(id);
  }

function toast(title,msg,kind){
  var box=document.getElementById('toasts');
  var el=document.createElement('div');el.className='toast '+(kind||'');
  var pre=msg?('<pre>'+esc(typeof msg==='string'?msg:JSON.stringify(msg,null,2))+'</pre>'):'';
  el.innerHTML='<div class="tc"></div><div class="body"><div class="t">'+esc(title)+'</div>'+pre+'</div>';
  box.appendChild(el);setTimeout(function(){el.style.transition='.3s';el.style.opacity='0';el.style.transform='translateY(6px)';setTimeout(function(){el.remove()},300)},kind==='err'?7000:4200);
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function shortId(v){if(!v)return '—';v=String(v);return v.length>12?'<span class="mono">'+esc(v.slice(0,8))+'…</span>':'<span class="mono">'+esc(v)+'</span>'}
function money(v){if(v===null||v===undefined||v==='')return '—';var n=Number(v);return isNaN(n)?esc(v):'$'+n.toFixed(2)}
function when(v){if(!v)return '—';var d=new Date(v);return isNaN(d.getTime())?esc(v):d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function badge(v){if(!v)return '—';var c=COLORS[BADGE[v]]||'#94a3b8';return '<span class="badge" style="color:'+c+';background:'+c+'1f;border-color:'+c+'40">'+esc(v)+'</span>'}
function txt(v){return (v===null||v===undefined||v==='')?'<span style="color:var(--faint)">—</span>':esc(v)}
function actionMode(a){
  var p=a&&a.payloadJson&&typeof a.payloadJson==='object'?a.payloadJson:{};
  if(p.automationMode)return p.automationMode;
  if(a&&a.type==='VERIFY')return 'VERIFY';
  if(a&&a.type==='BUY')return 'ASSISTED';
  return 'DRAFT';
}
function latestEventText(run){
  var events=(run&&run.events)||[];
  if(!events.length)return '—';
  return events[0].eventType+': '+events[0].message;
}
function marketMoney(v,market){if(v===null||v===undefined||v==='')return '—';var n=Number(v);var symbol=(market&&market.currencySymbol)||'$';return isNaN(n)?esc(v):esc(symbol)+n.toFixed(2)}
function lines(v){return String(v||'').split(/\\n|,/).map(function(s){return s.trim()}).filter(Boolean)}
function lineText(v){return Array.isArray(v)?v.join('\\n'):''}

function table(rows,cols,opts){
  opts=opts||{};
  if(!rows||!rows.length)return '<div class="empty">No records yet.</div>';
  var head='<thead><tr>'+cols.map(function(c){return '<th>'+esc(c.label)+'</th>'}).join('')+'</tr></thead>';
  var body='<tbody>'+rows.map(function(r){
    var cls=opts.selectKey?' class="clickable" data-select="'+esc(r[opts.selectKey])+'"':'';
    return '<tr'+cls+'>'+cols.map(function(c){
      var raw=r[c.key];var v=c.fmt?c.fmt(raw,r):txt(raw);
      var td=c.cls?(' class="'+c.cls+'"'):'';
      return '<td'+td+'>'+v+'</td>';
    }).join('')+'</tr>';
  }).join('')+'</tbody>';
  return '<table>'+head+body+'</table>';
}

function renderProfiles(){
  var sel=document.getElementById('scanProfile');
  if(!sel||!state.profiles.length)return;
  var current=sel.value||'starter-safe';
  sel.innerHTML=state.profiles.map(function(p){return '<option value="'+esc(p.key)+'">'+esc(p.label)+'</option>'}).join('');
  sel.value=state.profiles.some(function(p){return p.key===current})?current:'starter-safe';
  var profile=state.profiles.find(function(p){return p.key===sel.value});
  if(profile)document.getElementById('scanHint').textContent=profile.description;
}
function loadProfiles(){
  fetch('/opportunities/profiles').then(function(r){return r.json()}).then(function(j){state.profiles=j.profiles||[];renderProfiles()}).catch(function(){});
}
function currentAmazonProfile(){
  var key=document.getElementById('amazonScoutProfile').value||'starter-safe';
  return state.amazonProfiles.find(function(p){return p.key===key})||state.amazonProfiles[0];
}
function renderAmazonProfiles(){
  var profileSel=document.getElementById('amazonScoutProfile');
  var categorySel=document.getElementById('amazonScoutCategory');
  if(!profileSel||!categorySel||!state.amazonProfiles.length)return;
  var current=profileSel.value||'starter-safe';
  profileSel.innerHTML=state.amazonProfiles.map(function(p){return '<option value="'+esc(p.key)+'">'+esc(p.label)+'</option>'}).join('');
  profileSel.value=state.amazonProfiles.some(function(p){return p.key===current})?current:state.amazonProfiles[0].key;
  var profile=currentAmazonProfile();
  var categoryCurrent=categorySel.value||(profile.categories[0]&&profile.categories[0].key);
  categorySel.innerHTML=(profile.categories||[]).map(function(c){return '<option value="'+esc(c.key)+'">'+esc(c.label)+'</option>'}).join('');
  categorySel.value=(profile.categories||[]).some(function(c){return c.key===categoryCurrent})?categoryCurrent:((profile.categories[0]&&profile.categories[0].key)||'custom');
  document.getElementById('amazonScoutLimit').value=profile.defaultLimit||40;
  document.getElementById('amazonScoutMinScore').value=profile.minimumAmazonScore||62;
  document.getElementById('amazonScoutMaxCost').value=profile.maxAmazonCostUsd||150;
  document.getElementById('amazonScoutMinDrop').value=profile.minPriceDropPercent||0;
  document.getElementById('amazonScoutCompareLimit').value=profile.compareLimit||12;
  var category=(profile.categories||[]).find(function(c){return c.key===categorySel.value});
  document.getElementById('amazonScoutHint').textContent=category?category.description:profile.description;
}
function currentAmazonMarket(){
  var sel=document.getElementById('amazonScoutMarket');
  var key=(sel&&sel.value)||'de';
  return state.amazonMarkets.find(function(m){return m.key===key})||state.amazonMarkets[0]||{key:'de',label:'Germany',currencySymbol:'€',ebayDomain:'ebay.de',defaultPostalCode:'10115'};
}
function renderAmazonMarkets(){
  var sel=document.getElementById('amazonScoutMarket');
  if(!sel||!state.amazonMarkets.length)return;
  var current=sel.value||'de';
  sel.innerHTML=state.amazonMarkets.map(function(m){return '<option value="'+esc(m.key)+'">'+esc(m.label)+' · '+esc(m.currency)+' · '+esc(m.ebayDomain)+'</option>'}).join('');
  sel.value=state.amazonMarkets.some(function(m){return m.key===current})?current:state.amazonMarkets[0].key;
  var market=currentAmazonMarket();
  var postal=document.getElementById('amazonScoutPostalCode');
  if(postal&&!postal.value&&market.defaultPostalCode)postal.value=market.defaultPostalCode;
}
function renderEbayPresets(){
  var sel=document.getElementById('amazonScoutEbayPreset');
  if(!sel||!state.ebayPresets.length)return;
  var current=sel.value||'balanced';
  sel.innerHTML=state.ebayPresets.map(function(p){return '<option value="'+esc(p.key)+'">'+esc(p.label)+'</option>'}).join('');
  sel.value=state.ebayPresets.some(function(p){return p.key===current})?current:state.ebayPresets[0].key;
  applyEbayPreset(false);
}
function applyEbayPreset(overwrite){
  var key=(document.getElementById('amazonScoutEbayPreset')||{}).value||'balanced';
  var preset=state.ebayPresets.find(function(p){return p.key===key});
  if(!preset)return;
  function set(id,value){var el=document.getElementById(id);if(el&&(overwrite||!el.dataset.touched)){el.value=value}}
  set('amazonScoutEbayResults',preset.ebayResultLimit);
  set('amazonScoutMinProfit',preset.minimumProfit);
  set('amazonScoutMinRoi',preset.minimumRoiPercent);
  set('amazonScoutMinMatch',Math.round(Number(preset.minimumMatchConfidence||0)*100));
  set('amazonScoutMinCompareScore',preset.minimumOpportunityScore);
  set('amazonScoutBuyingFormat',preset.buyingFormat);
  set('amazonScoutCondition',preset.itemCondition);
  set('amazonScoutLocation',preset.preferredLocation);
  var sold=document.getElementById('amazonScoutSoldOnly');if(sold&&(overwrite||!sold.dataset.touched))sold.checked=!!preset.soldOnly;
  var completed=document.getElementById('amazonScoutCompletedOnly');if(completed&&(overwrite||!completed.dataset.touched))completed.checked=!!preset.completedOnly;
  var hint=document.getElementById('amazonScoutHint');
  if(hint)hint.textContent=preset.description;
}
function amazonComparisonPayload(){
  return {
    presetKey:document.getElementById('amazonScoutEbayPreset').value||'balanced',
    minProfit:Number(document.getElementById('amazonScoutMinProfit').value||0),
    minRoiPercent:Number(document.getElementById('amazonScoutMinRoi').value||0),
    minMatchConfidencePercent:Number(document.getElementById('amazonScoutMinMatch').value||0),
    minOpportunityScore:Number(document.getElementById('amazonScoutMinCompareScore').value||0),
    ebayResultLimit:Number(document.getElementById('amazonScoutEbayResults').value||10),
    soldOnly:document.getElementById('amazonScoutSoldOnly').checked,
    completedOnly:document.getElementById('amazonScoutCompletedOnly').checked,
    buyingFormat:document.getElementById('amazonScoutBuyingFormat').value||'BIN',
    itemCondition:document.getElementById('amazonScoutCondition').value||'NEW',
    preferredLocation:document.getElementById('amazonScoutLocation').value||'ANY',
    postalCode:document.getElementById('amazonScoutPostalCode').value.trim()||undefined
  };
}
function loadAmazonProfiles(){
  fetch('/amazon-discovery/profiles').then(function(r){return r.json()}).then(function(j){
    state.amazonProfiles=j.profiles||[];
    state.amazonMarkets=j.markets||[];
    state.ebayPresets=j.ebayComparisonPresets||[];
    renderAmazonProfiles();
    renderAmazonMarkets();
    renderEbayPresets();
  }).catch(function(){});
}
function currentEbayDiscoveryProfile(){
  var key=document.getElementById('ebayDiscoveryProfile').value||'starter-safe';
  return state.ebayDiscoveryProfiles.find(function(p){return p.key===key})||state.ebayDiscoveryProfiles[0];
}
function renderEbayDiscoveryProfiles(){
  var profileSel=document.getElementById('ebayDiscoveryProfile');
  var categorySel=document.getElementById('ebayDiscoveryCategory');
  if(!profileSel||!categorySel||!state.ebayDiscoveryProfiles.length)return;
  var current=profileSel.value||'starter-safe';
  profileSel.innerHTML=state.ebayDiscoveryProfiles.map(function(p){return '<option value="'+esc(p.key)+'">'+esc(p.label)+'</option>'}).join('');
  profileSel.value=state.ebayDiscoveryProfiles.some(function(p){return p.key===current})?current:state.ebayDiscoveryProfiles[0].key;
  var profile=currentEbayDiscoveryProfile();
  var categoryCurrent=categorySel.value||(profile.categories[0]&&profile.categories[0].key);
  categorySel.innerHTML=(profile.categories||[]).map(function(c){return '<option value="'+esc(c.key)+'">'+esc(c.label)+'</option>'}).join('');
  categorySel.value=(profile.categories||[]).some(function(c){return c.key===categoryCurrent})?categoryCurrent:((profile.categories[0]&&profile.categories[0].key)||'custom');
  document.getElementById('ebayDiscoveryLimit').value=profile.defaultLimit||25;
  document.getElementById('ebayDiscoveryMinScore').value=profile.minEbayScore||50;
  document.getElementById('ebayDiscoveryMinSold').value=profile.minSoldPrice||25;
  document.getElementById('ebayDiscoveryMaxSold').value=profile.maxSoldPrice||250;
  document.getElementById('ebayDiscoveryCompareLimit').value=profile.compareLimit||10;
  var category=(profile.categories||[]).find(function(c){return c.key===categorySel.value});
  document.getElementById('ebayDiscoveryCategoryId').value=(category&&category.categoryId)||'';
  document.getElementById('ebayDiscoveryHint').textContent=category?category.description:profile.description;
}
function currentEbayDiscoveryMarket(){
  var sel=document.getElementById('ebayDiscoveryMarket');
  var key=(sel&&sel.value)||'de';
  return state.ebayDiscoveryMarkets.find(function(m){return m.key===key})||state.ebayDiscoveryMarkets[0]||{key:'de',label:'Germany',currencySymbol:'€',ebayDomain:'ebay.de',defaultPostalCode:'10115'};
}
function renderEbayDiscoveryMarkets(){
  var sel=document.getElementById('ebayDiscoveryMarket');
  if(!sel||!state.ebayDiscoveryMarkets.length)return;
  var current=sel.value||'de';
  sel.innerHTML=state.ebayDiscoveryMarkets.map(function(m){return '<option value="'+esc(m.key)+'">'+esc(m.label)+' · '+esc(m.currency)+' · '+esc(m.ebayDomain)+'</option>'}).join('');
  sel.value=state.ebayDiscoveryMarkets.some(function(m){return m.key===current})?current:state.ebayDiscoveryMarkets[0].key;
  var market=currentEbayDiscoveryMarket();
  var postal=document.getElementById('ebayDiscoveryPostalCode');
  if(postal&&!postal.value&&market.defaultPostalCode)postal.value=market.defaultPostalCode;
}
function ebayDiscoveryComparisonPayload(){
  return {
    minProfit:Number(document.getElementById('ebayDiscoveryMinProfit').value||0),
    minRoiPercent:Number(document.getElementById('ebayDiscoveryMinRoi').value||0),
    minMatchConfidencePercent:Number(document.getElementById('ebayDiscoveryMinMatch').value||0),
    minOpportunityScore:Number(document.getElementById('ebayDiscoveryMinCompareScore').value||0)
  };
}
function loadEbayDiscoveryProfiles(){
  fetch('/ebay-discovery/profiles').then(function(r){return r.json()}).then(function(j){
    state.ebayDiscoveryProfiles=j.profiles||[];
    state.ebayDiscoveryMarkets=j.markets||[];
    renderEbayDiscoveryProfiles();
    renderEbayDiscoveryMarkets();
  }).catch(function(){});
}
function scoreClass(score){return score>=75?'score':score>=60?'score mid':'score low'}
function renderKeepaTokenStatus(status){
  var el=document.getElementById('keepaTokenHint');
  if(!el)return;
  if(!status||status.tokensLeft===undefined||status.tokensLeft===null){
    el.textContent='Keepa tokens unavailable';
    return;
  }
  state.keepaToken=status;
  var refill=status.retryAfterSeconds||((status.refillInMs||status.refillIn)?Math.ceil((status.refillInMs||status.refillIn)/1000):0);
  var parts=['Keepa tokens '+status.tokensLeft];
  if(status.refillRate!==undefined&&status.refillRate!==null)parts.push('+'+status.refillRate+'/min');
  if(refill>0)parts.push('next in '+refill+'s');
  el.textContent=parts.join(' · ');
}
  function loadKeepaTokenStatus(){
    return apiJson('/amazon-discovery/token-status').then(function(j){renderKeepaTokenStatus(j)}).catch(function(e){
      var el=document.getElementById('keepaTokenHint');
      if(el)el.textContent=(e&&e.error)?e.error:'Keepa tokens unavailable';
    });
}
function renderKeepaTokenFromPayload(payload){
  if(!payload)return;
  if(payload.tokensLeft!==undefined||payload.refillInMs!==undefined||payload.refillRate!==undefined){
    renderKeepaTokenStatus({
      tokensLeft:payload.tokensLeft,
      refillInMs:payload.refillInMs,
      refillRate:payload.refillRate,
      retryAfterSeconds:payload.retryAfterSeconds
    });
  }
}
function renderScanResults(res){
  var summary=res.summary||{};
  document.getElementById('scanSummary').textContent='Scanned '+(summary.scanned||0)+' · accepted '+(summary.accepted||0)+' · rejected '+(summary.rejected||0)+' · saved '+(summary.persisted||0);
  var opportunities=res.opportunities||[];
  if(!opportunities.length){
    document.getElementById('scanResults').innerHTML='<div class="empty">No accepted opportunities. Try a different profile or lower the minimum score.</div>';
    return;
  }
  document.getElementById('scanResults').innerHTML=opportunities.map(function(o){
    var score=o.score?o.score.total:0;
    var reasons=(o.score&&o.score.reasons?o.score.reasons:[]).slice(0,3).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
    var risks=(o.safety&&o.safety.riskFlags?o.safety.riskFlags:[]).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
    var priceDrop=o.amazon.priceDropPercent?(' · Amazon down '+Number(o.amazon.priceDropPercent).toFixed(1)+'%'):'';
    return '<div class="result-card"><div class="result-head"><div class="'+scoreClass(score)+'">'+score+'</div><div class="result-main">'+
      '<div class="result-title">'+esc(o.ebay.title)+'</div>'+
      '<div class="result-meta">eBay '+money(o.ebay.soldPrice)+' · Amazon '+money(o.amazon.buyBoxPrice||o.amazon.currentPrice)+' · Profit '+money(o.profit.expectedProfit)+' · ROI '+Number(o.profit.roiPercent||0).toFixed(1)+'%'+priceDrop+'</div>'+
      '</div>'+badge(o.decision.decision)+'</div>'+
      '<div class="chips">'+(reasons||'<span class="chip">No positive signals yet</span>')+'</div>'+
      (risks?'<div class="chips">'+risks+'</div>':'')+
      '<div class="result-meta">ASIN <span class="mono">'+esc(o.amazon.asin)+'</span> · Match '+Number((o.amazon.matchConfidence||0)*100).toFixed(0)+'%</div></div>';
  }).join('');
}
function unique(items){var seen={};return items.filter(function(item){item=String(item||'').trim();if(!item||seen[item])return false;seen[item]=true;return true})}
function addStrings(out,values){if(Array.isArray(values))values.forEach(function(v){if(v!==undefined&&v!==null)out.push(String(v))})}
function amazonCandidateScoreData(c){return c.scoreBreakdown||c.score||{}}
function amazonCandidateScore(c){var scoreData=amazonCandidateScoreData(c);var value=c.amazonScore;if(value===undefined||value===null)value=scoreData.total;return Number(value||0)}
function amazonCandidateAsin(c){return c.asin||(c.amazon&&c.amazon.asin)||''}
function amazonCandidateTitle(c){return c.title||(c.amazon&&c.amazon.title)||'Amazon product'}
function amazonCandidatePrice(c){return c.buyBoxPrice||c.currentPrice||(c.amazon&&(c.amazon.buyBoxPrice||c.amazon.currentPrice))}
function amazonCandidateAvg90(c){return c.avg90Price||(c.amazon&&c.amazon.avg90Price)}
function amazonCandidateRank(c){return c.salesRank||(c.amazon&&c.amazon.salesRank)}
function amazonCandidateDrop(c){return c.priceDropPercent||(c.amazon&&c.amazon.priceDropPercent)}
function amazonCandidateUrl(c){return c.amazonUrl||(c.amazon&&c.amazon.url)}
function amazonSafetyStatus(c){return c.safetyStatus||(c.safety&&c.safety.status)}
function amazonCandidateStatus(c){return c.comparisonStatus||amazonSafetyStatus(c)||'PASS'}
function amazonComparison(c){
  var scoreData=amazonCandidateScoreData(c);
  var comparison=scoreData&&scoreData.ebayComparison;
  return comparison&&typeof comparison==='object'?comparison:null;
}
function amazonCandidateMarket(c){
  var comparison=amazonComparison(c);
  return (comparison&&comparison.market)||currentAmazonMarket();
}
function amazonRiskFlags(c){var out=[];addStrings(out,c.riskFlags);if(c.safety)addStrings(out,c.safety.riskFlags);return unique(out)}
function amazonPositiveReasons(c){var scoreData=amazonCandidateScoreData(c);var out=[];addStrings(out,scoreData.reasons);return unique(out)}
function amazonCandidateReasons(c){
  var scoreData=amazonCandidateScoreData(c);
  var comparison=amazonComparison(c);
  var out=[];
  if(comparison&&(c.comparisonStatus==='REJECTED'||c.comparisonStatus==='ERROR'||c.comparisonStatus==='MANUAL_REVIEW'||comparison.status==='REJECTED'||comparison.status==='MANUAL_REVIEW'||comparison.status==='NO_EBAY_RESULTS'||comparison.status==='NO_FIXED_PRICE_EBAY_RESULTS'||comparison.status==='NO_PRICED_EBAY_RESULTS'||comparison.status==='ERROR'))addStrings(out,comparison.reasons);
  addStrings(out,scoreData.rejectionReasons);
  addStrings(out,c.rejectionReasons);
  if(c.safety)addStrings(out,c.safety.reasons);
  if(!out.length&&(c.comparisonStatus==='REJECTED'||amazonSafetyStatus(c)==='REJECT'))addStrings(out,amazonRiskFlags(c));
  if(!out.length&&c.comparisonStatus==='REJECTED'&&amazonSafetyStatus(c)!=='REJECT')out.push('Rejected by an earlier eBay comparison. Run a fresh comparison to capture exact eBay pricing reasons.');
  if(!out.length&&(c.comparisonStatus==='REJECTED'||amazonSafetyStatus(c)==='REJECT'))out.push('Below Amazon Scout filters');
  return unique(out);
}
function isManualReviewAmazonCandidate(c){var comparison=amazonComparison(c);return c.comparisonStatus==='MANUAL_REVIEW'||(comparison&&comparison.status==='MANUAL_REVIEW')}
function isRejectedAmazonCandidate(c){
  if(isManualReviewAmazonCandidate(c))return false;
  return c.comparisonStatus==='REJECTED'||c.comparisonStatus==='ERROR'||amazonSafetyStatus(c)==='REJECT'||(!c.id&&amazonCandidateReasons(c).length>0);
}
function isSelectableAmazonCandidate(c){
  var status=amazonCandidateStatus(c);
  return !!c.id&&!isRejectedAmazonCandidate(c)&&!isManualReviewAmazonCandidate(c)&&status!=='OPPORTUNITY'&&status!=='COMPARING';
}
function updateAmazonScoutActions(){
  var selectBtn=document.getElementById('amazonScoutSelectBtn');
  var compareBtn=document.getElementById('amazonScoutCompareBtn');
  var selectable=state.amazonScoutCandidates.filter(isSelectableAmazonCandidate);
  if(selectBtn)selectBtn.disabled=!selectable.length;
  if(compareBtn)compareBtn.disabled=!selectedAmazonIds().length;
}
function renderRejectionBreakdown(rejected){
  if(!rejected.length)return '';
  var counts={};
  rejected.forEach(function(c){
    var reasons=amazonCandidateReasons(c);
    if(!reasons.length)reasons=['Below Amazon Scout filters'];
    reasons.forEach(function(reason){counts[reason]=(counts[reason]||0)+1});
  });
  var rows=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]||a.localeCompare(b)}).slice(0,6);
  return '<div class="mini-summary"><span>Top rejection reasons</span>'+rows.map(function(reason){return '<span class="chip">'+esc(reason)+' · '+counts[reason]+'</span>'}).join('')+'</div>';
}
function pct(v){return v===undefined||v===null?'—':Number(v).toFixed(0)+'%'}
function metric(label,value){return '<div class="metric"><div class="mk">'+esc(label)+'</div><div class="mv">'+esc(value)+'</div></div>'}
function renderEbayComparison(c,rejected,review){
  var comparison=amazonComparison(c);
  if(!comparison)return '';
  var best=comparison.best||{};
  var market=comparison.market||amazonCandidateMarket(c);
  var settings=comparison.settings||{};
  var reasons=unique(comparison.reasons||[]).slice(0,4).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var title=best.title?'<div class="result-meta">Best eBay: '+(best.url?'<a href="'+esc(best.url)+'" target="_blank" rel="noreferrer">'+esc(best.title)+'</a>':esc(best.title))+'</div>':'';
  var metrics=[
    metric('eBay results',String(comparison.ebayResultCount||0)),
    metric('Priced',String(comparison.pricedResultCount||0)),
    metric('Best sold',marketMoney(best.soldPrice,market)),
    metric('Profit',marketMoney(best.expectedProfit,market)),
    metric('ROI',best.roiPercent===undefined?'—':Number(best.roiPercent).toFixed(1)+'%'),
    metric('Match',pct(best.matchConfidence!==undefined?Number(best.matchConfidence)*100:undefined))
  ].join('');
  var lock=review?'<span class="chip">Needs human review</span>':rejected?'<span class="chip">Locked after eBay comparison</span>':'<span class="chip">'+esc(comparison.status||'Compared')+'</span>';
  var context=[
    (market&&market.label)?market.label:null,
    (market&&market.ebayDomain)?market.ebayDomain:null,
    settings.minimumMatchConfidence!==undefined?'min match '+pct(Number(settings.minimumMatchConfidence)*100):null,
    settings.minimumProfit!==undefined?'min profit '+marketMoney(settings.minimumProfit,market):null,
    settings.minimumRoiPercent!==undefined?'min ROI '+Number(settings.minimumRoiPercent).toFixed(0)+'%':null
  ].filter(Boolean).join(' · ');
  return '<div class="comparison-box '+(review?'review':(rejected?'locked':''))+'"><div class="comparison-title">eBay comparison '+lock+'</div>'+
    (context?'<div class="result-meta">Compared using: '+esc(context)+'</div>':'')+
    '<div class="result-meta">Search: <span class="mono">'+esc(comparison.query||'—')+'</span></div>'+title+
    '<div class="comparison-grid">'+metrics+'</div>'+
    (reasons?'<div class="chips">'+reasons+'</div>':'')+'</div>';
}
function renderAmazonCandidateCard(c){
  var rejected=isRejectedAmazonCandidate(c);
  var review=isManualReviewAmazonCandidate(c);
  var selectable=isSelectableAmazonCandidate(c);
  var selected=selectable&&(!!state.selectedAmazon[c.id]||!!c.selected);
  if(selectable)state.selectedAmazon[c.id]=selected;
  var score=amazonCandidateScore(c);
  var positive=amazonPositiveReasons(c).slice(0,3).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var rejection=amazonCandidateReasons(c).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var risks=amazonRiskFlags(c).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var drop=amazonCandidateDrop(c);
  var dropText=drop?(' · Down '+Number(drop).toFixed(1)+'%'):'';
  var url=amazonCandidateUrl(c);
  var title=url?'<a href="'+esc(url)+'" target="_blank" rel="noreferrer">'+esc(amazonCandidateTitle(c))+'</a>':esc(amazonCandidateTitle(c));
  var check=selectable?'<label class="check"><input type="checkbox" data-amazon-id="'+esc(c.id)+'" '+(selected?'checked':'')+' onchange="toggleAmazonCandidate(this)"></label>':'<span class="placeholder-check"></span>';
  var comparison=amazonComparison(c);
  var rejectedLabel=review?'Needs manual review':comparison?'Rejected by eBay comparison':'Rejected because';
  var market=amazonCandidateMarket(c);
  var actions='<div class="card-actions">';
  if(c.id&&(rejected||review)&&c.productCandidateId)actions+='<button class="btn sm" onclick="navigate(\\'actions\\')">Open Review Queue</button>';
  else if(c.id&&(rejected||review||c.comparisonStatus==='ERROR'))actions+='<button class="btn primary sm" onclick="considerAmazonCandidate(\\''+esc(c.id)+'\\')">Review Anyway</button>';
  if(c.id&&(rejected||review||c.comparisonStatus==='ERROR')&&c.comparisonStatus!=='OPPORTUNITY')actions+='<button class="btn sm" onclick="recompareAmazonCandidate(\\''+esc(c.id)+'\\')">Recompare</button>';
  if(url)actions+='<a class="btn sm" href="'+esc(url)+'" target="_blank" rel="noreferrer">Open Amazon</a>';
  if(comparison&&comparison.best&&comparison.best.url)actions+='<a class="btn sm" href="'+esc(comparison.best.url)+'" target="_blank" rel="noreferrer">Open eBay</a>';
  actions+='</div>';
  return '<div class="result-card '+(review?'review':(rejected?'rejected':''))+'"><div class="result-head">'+check+'<div class="'+scoreClass(score)+'">'+score+'</div><div class="result-main">'+
    '<div class="result-title">'+title+'</div>'+
    '<div class="result-meta">ASIN <span class="mono">'+esc(amazonCandidateAsin(c))+'</span> · Amazon '+marketMoney(amazonCandidatePrice(c),market)+' · Avg90 '+marketMoney(amazonCandidateAvg90(c),market)+' · Rank '+txt(amazonCandidateRank(c))+dropText+'</div>'+
    '</div>'+badge(amazonCandidateStatus(c))+'</div>'+
    ((rejected||review)?'<div class="result-meta"><b>'+rejectedLabel+'</b></div><div class="chips">'+(rejection||'<span class="chip">Below Amazon Scout filters</span>')+'</div>':'<div class="chips">'+(positive||'<span class="chip">Accepted by Amazon Scout filters</span>')+'</div>')+
    renderEbayComparison(c,rejected,review)+
    (risks?'<div class="chips">'+risks+'</div>':'')+
    actions+'</div>';
}
function renderAmazonScoutReport(candidates,rejectedExtra,preserveSelection){
  var all=[];
  var seen={};
  function pushCandidate(c){
    if(!c)return;
    var key=c.id||amazonCandidateAsin(c)||JSON.stringify(c).slice(0,80);
    if(seen[key])return;
    seen[key]=true;
    all.push(c);
  }
  (candidates||[]).forEach(pushCandidate);
  (rejectedExtra||[]).forEach(pushCandidate);
  var previous=preserveSelection?Object.assign({},state.selectedAmazon):{};
  state.selectedAmazon={};
  state.amazonScoutReview=all.filter(isManualReviewAmazonCandidate);
  state.amazonScoutCandidates=all.filter(function(c){return !isRejectedAmazonCandidate(c)&&!isManualReviewAmazonCandidate(c)});
  state.amazonScoutRejected=all.filter(isRejectedAmazonCandidate);
  state.amazonScoutCandidates.forEach(function(c){if(c.id&&previous[c.id])state.selectedAmazon[c.id]=true;else if(c.id&&c.selected)state.selectedAmazon[c.id]=true});
  var acceptedHtml=state.amazonScoutCandidates.length?'<div class="section-label">Accepted candidates <span>'+state.amazonScoutCandidates.length+'</span></div>'+state.amazonScoutCandidates.map(renderAmazonCandidateCard).join(''):'';
  var reviewHtml=state.amazonScoutReview.length?'<div class="section-label">Needs review <span>'+state.amazonScoutReview.length+'</span></div>'+state.amazonScoutReview.map(renderAmazonCandidateCard).join(''):'';
  var rejectedHtml=state.amazonScoutRejected.length?'<div class="section-label">Rejected products <span>'+state.amazonScoutRejected.length+'</span></div>'+renderRejectionBreakdown(state.amazonScoutRejected)+state.amazonScoutRejected.map(renderAmazonCandidateCard).join(''):'';
  if(!acceptedHtml&&!reviewHtml&&!rejectedHtml)document.getElementById('amazonScoutResults').innerHTML='<div class="empty">No Amazon scout results yet.</div>';
  else document.getElementById('amazonScoutResults').innerHTML=acceptedHtml+reviewHtml+rejectedHtml;
  updateAmazonScoutActions();
}

function ebayCandidateScoreData(c){return c.scoreBreakdown||c.score||{}}
function ebayCandidateScore(c){var scoreData=ebayCandidateScoreData(c);var value=c.ebayScore;if(value===undefined||value===null)value=scoreData.total;return Number(value||0)}
function ebayCandidateTitle(c){return c.title||(c.ebay&&c.ebay.title)||'eBay product'}
function ebayCandidateItemId(c){return c.ebayItemId||(c.ebay&&c.ebay.itemId)||''}
function ebayCandidateUrl(c){return c.ebayUrl||(c.ebay&&c.ebay.url)}
function ebayCandidatePrice(c){return c.soldPrice||(c.ebay&&c.ebay.soldPrice)}
function ebayCandidateShipping(c){return c.shippingPrice||(c.ebay&&c.ebay.shippingPrice)}
function ebayCandidateCondition(c){return c.condition||(c.ebay&&c.ebay.condition)}
function ebayCandidateCategory(c){return c.category||(c.ebay&&c.ebay.category)}
function ebayCandidateFamily(c){
  var scoreData=ebayCandidateScoreData(c);
  var family=(scoreData&&scoreData.family)||{};
  return {
    key:c.productFamilyKey||family.key||'',
    sourceQuery:c.sourceQuery||family.sourceQuery||'',
    soldCount:c.familySoldCount||family.soldCount||1,
    minSoldPrice:c.familyMinSoldPrice||family.minSoldPrice,
    medianSoldPrice:c.familyMedianSoldPrice||family.medianSoldPrice,
    maxSoldPrice:c.familyMaxSoldPrice||family.maxSoldPrice,
    duplicateItemCount:family.duplicateItemCount||Math.max(0,Number(c.familySoldCount||1)-1)
  };
}
function ebaySafetyStatus(c){return c.safetyStatus||(c.safety&&c.safety.status)}
function ebayCandidateStatus(c){return c.comparisonStatus||ebaySafetyStatus(c)||'PASS'}
function ebayComparison(c){
  var scoreData=ebayCandidateScoreData(c);
  var comparison=scoreData&&scoreData.amazonComparison;
  return comparison&&typeof comparison==='object'?comparison:null;
}
function ebayCandidateMarket(c){
  var comparison=ebayComparison(c);
  return (comparison&&comparison.market)||currentEbayDiscoveryMarket();
}
function ebayRiskFlags(c){var out=[];addStrings(out,c.riskFlags);if(c.safety)addStrings(out,c.safety.riskFlags);return unique(out)}
function ebayPositiveReasons(c){var scoreData=ebayCandidateScoreData(c);var out=[];addStrings(out,scoreData.reasons);return unique(out)}
function ebayCandidateReasons(c){
  var scoreData=ebayCandidateScoreData(c);
  var comparison=ebayComparison(c);
  var out=[];
  if(comparison&&(c.comparisonStatus==='REJECTED'||c.comparisonStatus==='ERROR'||c.comparisonStatus==='MANUAL_REVIEW'||comparison.status==='REJECTED'||comparison.status==='MANUAL_REVIEW'||comparison.status==='SKIPPED_EBAY_SOURCE_FORMAT'||comparison.status==='SKIPPED_EBAY_SOURCE_DATA'||comparison.status==='NO_AMAZON_RESULTS'||comparison.status==='NO_PRICED_AMAZON_RESULTS'||comparison.status==='ERROR'))addStrings(out,comparison.reasons);
  addStrings(out,scoreData.rejectionReasons);
  addStrings(out,c.rejectionReasons);
  if(c.safety)addStrings(out,c.safety.reasons);
  if(!out.length&&(c.comparisonStatus==='REJECTED'||ebaySafetyStatus(c)==='REJECT'))addStrings(out,ebayRiskFlags(c));
  if(!out.length&&c.comparisonStatus==='REJECTED'&&ebaySafetyStatus(c)!=='REJECT')out.push('Rejected by an earlier Amazon comparison. Run a fresh comparison to capture exact Amazon pricing reasons.');
  if(!out.length&&(c.comparisonStatus==='REJECTED'||ebaySafetyStatus(c)==='REJECT'))out.push('Below eBay Discovery filters');
  return unique(out);
}
function isManualReviewEbayCandidate(c){var comparison=ebayComparison(c);return c.comparisonStatus==='MANUAL_REVIEW'||(comparison&&comparison.status==='MANUAL_REVIEW')}
function isRejectedEbayCandidate(c){
  if(isManualReviewEbayCandidate(c))return false;
  return c.comparisonStatus==='REJECTED'||c.comparisonStatus==='ERROR'||ebaySafetyStatus(c)==='REJECT'||(!c.id&&ebayCandidateReasons(c).length>0);
}
function isSelectableEbayCandidate(c){
  var status=ebayCandidateStatus(c);
  return !!c.id&&!isRejectedEbayCandidate(c)&&!isManualReviewEbayCandidate(c)&&status!=='OPPORTUNITY'&&status!=='COMPARING';
}
function selectedEbayIds(){
  return state.ebayDiscoveryCandidates.filter(function(c){return isSelectableEbayCandidate(c)&&state.selectedEbay[c.id]}).map(function(c){return c.id});
}
function updateEbayDiscoveryActions(){
  var selectBtn=document.getElementById('ebayDiscoverySelectBtn');
  var compareBtn=document.getElementById('ebayDiscoveryCompareBtn');
  var selectable=state.ebayDiscoveryCandidates.filter(isSelectableEbayCandidate);
  if(selectBtn)selectBtn.disabled=!selectable.length;
  if(compareBtn)compareBtn.disabled=!selectedEbayIds().length;
}
function renderEbayRejectionBreakdown(rejected){
  if(!rejected.length)return '';
  var counts={};
  rejected.forEach(function(c){
    var reasons=ebayCandidateReasons(c);
    if(!reasons.length)reasons=['Below eBay Discovery filters'];
    reasons.forEach(function(reason){counts[reason]=(counts[reason]||0)+1});
  });
  var rows=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]||a.localeCompare(b)}).slice(0,6);
  return '<div class="mini-summary"><span>Top rejection reasons</span>'+rows.map(function(reason){return '<span class="chip">'+esc(reason)+' · '+counts[reason]+'</span>'}).join('')+'</div>';
}
function renderAmazonComparisonForEbay(c,rejected,review){
  var comparison=ebayComparison(c);
  if(!comparison)return '';
  var best=comparison.best||{};
  var market=comparison.market||ebayCandidateMarket(c);
  var reasons=unique(comparison.reasons||[]).slice(0,4).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var title=best.title?'<div class="result-meta">Best Amazon: '+(best.url?'<a href="'+esc(best.url)+'" target="_blank" rel="noreferrer">'+esc(best.title)+'</a>':esc(best.title))+'</div>':'';
  var sourcePrice=best.buyBoxPrice!==undefined?best.buyBoxPrice:best.currentPrice;
  var metrics=[
    metric('Amazon matches',String(comparison.amazonResultCount||0)),
    metric('Priced',String(comparison.pricedResultCount||0)),
    metric('Amazon cost',marketMoney(sourcePrice,market)),
    metric('Profit',marketMoney(best.expectedProfit,market)),
    metric('ROI',best.roiPercent===undefined?'—':Number(best.roiPercent).toFixed(1)+'%'),
    metric('Match',pct(best.matchConfidence!==undefined?Number(best.matchConfidence)*100:undefined))
  ].join('');
  var lock=review?'<span class="chip">Needs human review</span>':rejected?'<span class="chip">Locked after Amazon comparison</span>':'<span class="chip">'+esc(comparison.status||'Compared')+'</span>';
  var context=[
    (market&&market.label)?market.label:null,
    (market&&market.amazonDomain)?market.amazonDomain:null,
    comparison.settings&&comparison.settings.amazonMatchLimit?'matches '+comparison.settings.amazonMatchLimit:null
  ].filter(Boolean).join(' · ');
  return '<div class="comparison-box '+(review?'review':(rejected?'locked':''))+'"><div class="comparison-title">Amazon comparison '+lock+'</div>'+
    (context?'<div class="result-meta">Compared using: '+esc(context)+'</div>':'')+
    '<div class="result-meta">Search: <span class="mono">'+esc(comparison.query||'—')+'</span></div>'+title+
    '<div class="comparison-grid">'+metrics+'</div>'+
    (reasons?'<div class="chips">'+reasons+'</div>':'')+'</div>';
}
function renderEbayCandidateCard(c){
  var rejected=isRejectedEbayCandidate(c);
  var review=isManualReviewEbayCandidate(c);
  var selectable=isSelectableEbayCandidate(c);
  var selected=selectable&&(!!state.selectedEbay[c.id]||!!c.selected);
  if(selectable)state.selectedEbay[c.id]=selected;
  var score=ebayCandidateScore(c);
  var positive=ebayPositiveReasons(c).slice(0,3).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var rejection=ebayCandidateReasons(c).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var risks=ebayRiskFlags(c).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var url=ebayCandidateUrl(c);
  var title=url?'<a href="'+esc(url)+'" target="_blank" rel="noreferrer">'+esc(ebayCandidateTitle(c))+'</a>':esc(ebayCandidateTitle(c));
  var check=selectable?'<label class="check"><input type="checkbox" data-ebay-id="'+esc(c.id)+'" '+(selected?'checked':'')+' onchange="toggleEbayCandidate(this)"></label>':'<span class="placeholder-check"></span>';
  var comparison=ebayComparison(c);
  var rejectedLabel=review?'Needs manual review':comparison?'Rejected by Amazon comparison':'Rejected because';
  var market=ebayCandidateMarket(c);
  var item=ebayCandidateItemId(c)?' · Item <span class="mono">'+esc(ebayCandidateItemId(c))+'</span>':'';
  var category=ebayCandidateCategory(c)?' · '+esc(ebayCandidateCategory(c)):'';
  var shipping=ebayCandidateShipping(c)?' · Shipping '+marketMoney(ebayCandidateShipping(c),market):'';
  var actions='<div class="card-actions">';
  if(c.id&&(rejected||review)&&c.productCandidateId)actions+='<button class="btn sm" onclick="navigate(\\'actions\\')">Open Review Queue</button>';
  else if(c.id&&(rejected||review||c.comparisonStatus==='ERROR'))actions+='<button class="btn primary sm" onclick="considerEbayCandidate(\\''+esc(c.id)+'\\')">Review Anyway</button>';
  if(c.id&&(rejected||review||c.comparisonStatus==='ERROR')&&c.comparisonStatus!=='OPPORTUNITY')actions+='<button class="btn sm" onclick="recompareEbayCandidate(\\''+esc(c.id)+'\\')">Recompare</button>';
  if(url)actions+='<a class="btn sm" href="'+esc(url)+'" target="_blank" rel="noreferrer">Open eBay</a>';
  if(comparison&&comparison.best&&comparison.best.url)actions+='<a class="btn sm" href="'+esc(comparison.best.url)+'" target="_blank" rel="noreferrer">Open Amazon</a>';
  actions+='</div>';
  return '<div class="result-card '+(review?'review':(rejected?'rejected':''))+'"><div class="result-head">'+check+'<div class="'+scoreClass(score)+'">'+score+'</div><div class="result-main">'+
    '<div class="result-title">'+title+'</div>'+
    '<div class="result-meta">eBay sold '+marketMoney(ebayCandidatePrice(c),market)+shipping+' · '+txt(ebayCandidateCondition(c))+category+item+'</div>'+
    '</div>'+badge(ebayCandidateStatus(c))+'</div>'+
    ((rejected||review)?'<div class="result-meta"><b>'+rejectedLabel+'</b></div><div class="chips">'+(rejection||'<span class="chip">Below eBay Discovery filters</span>')+'</div>':'<div class="chips">'+(positive||'<span class="chip">Accepted by eBay Discovery filters</span>')+'</div>')+
    renderAmazonComparisonForEbay(c,rejected,review)+
    (risks?'<div class="chips">'+risks+'</div>':'')+
    actions+'</div>';
}
function renderEbayDiscoveryReport(candidates,rejectedExtra,preserveSelection){
  var all=[];
  var seen={};
  function pushCandidate(c){
    if(!c)return;
    var key=c.id||ebayCandidateItemId(c)||ebayCandidateTitle(c)+'|'+ebayCandidatePrice(c);
    if(seen[key])return;
    seen[key]=true;
    all.push(c);
  }
  (candidates||[]).forEach(pushCandidate);
  (rejectedExtra||[]).forEach(pushCandidate);
  var previous=preserveSelection?Object.assign({},state.selectedEbay):{};
  state.selectedEbay={};
  state.ebayDiscoveryReview=all.filter(isManualReviewEbayCandidate);
  state.ebayDiscoveryCandidates=all.filter(function(c){return !isRejectedEbayCandidate(c)&&!isManualReviewEbayCandidate(c)});
  state.ebayDiscoveryRejected=all.filter(isRejectedEbayCandidate);
  state.ebayDiscoveryCandidates.forEach(function(c){if(c.id&&previous[c.id])state.selectedEbay[c.id]=true;else if(c.id&&c.selected)state.selectedEbay[c.id]=true});
  var acceptedHtml=state.ebayDiscoveryCandidates.length?'<div class="section-label">Accepted sold candidates <span>'+state.ebayDiscoveryCandidates.length+'</span></div>'+state.ebayDiscoveryCandidates.map(renderEbayCandidateCard).join(''):'';
  var reviewHtml=state.ebayDiscoveryReview.length?'<div class="section-label">Needs review <span>'+state.ebayDiscoveryReview.length+'</span></div>'+state.ebayDiscoveryReview.map(renderEbayCandidateCard).join(''):'';
  var rejectedHtml=state.ebayDiscoveryRejected.length?'<div class="section-label">Rejected products <span>'+state.ebayDiscoveryRejected.length+'</span></div>'+renderEbayRejectionBreakdown(state.ebayDiscoveryRejected)+state.ebayDiscoveryRejected.map(renderEbayCandidateCard).join(''):'';
  if(!acceptedHtml&&!reviewHtml&&!rejectedHtml)document.getElementById('ebayDiscoveryResults').innerHTML='<div class="empty">No eBay discovery results yet.</div>';
  else document.getElementById('ebayDiscoveryResults').innerHTML=acceptedHtml+reviewHtml+rejectedHtml;
  updateEbayDiscoveryActions();
}

function compactEbayLines(candidates){
  var byKey={};
  (candidates||[]).forEach(function(c){
    var family=ebayCandidateFamily(c);
    var key=family.key||ebayCandidateItemId(c)||ebayCandidateTitle(c)+'|'+ebayCandidatePrice(c);
    var existing=byKey[key];
    if(!existing||ebayCandidateScore(c)>ebayCandidateScore(existing)||new Date(c.createdAt||0)>new Date(existing.createdAt||0))byKey[key]=c;
  });
  return Object.keys(byKey).map(function(k){return byKey[k]}).sort(function(a,b){
    return ebayCandidateScore(b)-ebayCandidateScore(a)||new Date(b.createdAt||0)-new Date(a.createdAt||0);
  });
}
function inputValue(id){var el=document.getElementById(id);return el?String(el.value||'').trim():''}
function selectValue(id,fallback){var el=document.getElementById(id);return el?String(el.value||fallback):fallback}
function normalizedSearchText(value){return String(value||'').toLowerCase()}
function ebaySearchBlob(c){
  var family=ebayCandidateFamily(c);
  var comparison=ebayComparison(c);
  var best=(comparison&&comparison.best)||{};
  return [
    ebayCandidateTitle(c),
    ebayCandidateItemId(c),
    ebayCandidateCategory(c),
    family.key,
    family.sourceQuery,
    best.title,
    best.asin
  ].filter(Boolean).join(' ').toLowerCase();
}
function statusMatches(actual,filter){
  if(filter==='ALL')return true;
  if(filter==='QUEUED')return actual==='NOT_COMPARED'||actual==='ERROR';
  return actual===filter;
}
function filterEbayRows(rows,options){
  var text=normalizedSearchText(options.text);
  var minScore=Number(options.minScore||0);
  return rows.filter(function(c){
    if(options.status&&!statusMatches(ebayCandidateStatus(c),options.status))return false;
    if(minScore&&ebayCandidateScore(c)<minScore)return false;
    if(text&&ebaySearchBlob(c).indexOf(text)===-1)return false;
    return true;
  });
}
function clampPage(page,totalRows){
  var totalPages=Math.max(1,Math.ceil(totalRows/pageSize));
  return Math.max(1,Math.min(page,totalPages));
}
function renderPager(elId,page,totalRows,setterName){
  var el=document.getElementById(elId);
  if(!el)return;
  var totalPages=Math.max(1,Math.ceil(totalRows/pageSize));
  if(totalRows<=pageSize){el.innerHTML='';return}
  el.innerHTML=
    '<button class="btn sm" '+(page<=1?'disabled':'')+' onclick="'+setterName+'('+(page-1)+')">Prev</button>'+
    '<span>Page '+page+' of '+totalPages+' · '+totalRows+' rows</span>'+
    '<button class="btn sm" '+(page>=totalPages?'disabled':'')+' onclick="'+setterName+'('+(page+1)+')">Next</button>';
}
function currentAllEbayRows(){
  var d=state.data||{};
  return (d.allEbayDiscoveryCandidates&&d.allEbayDiscoveryCandidates.length)?d.allEbayDiscoveryCandidates:(d.ebayDiscoveryCandidates||[]);
}
function renderEbayCompactProducts(candidates){
  var el=document.getElementById('ebayCompactProducts');
  var summary=document.getElementById('ebayCompactSummary');
  if(!el)return;
  var allRows=compactEbayLines(candidates);
  var rows=filterEbayRows(allRows,{
    text:inputValue('ebayCompactSearch'),
    status:selectValue('ebayCompactStatus','ALL'),
    minScore:inputValue('ebayCompactMinScore')
  });
  state.ebayCompactPage=clampPage(state.ebayCompactPage,rows.length);
  var start=(state.ebayCompactPage-1)*pageSize;
  var pageRows=rows.slice(start,start+pageSize);
  if(summary)summary.textContent=rows.length+' of '+allRows.length+' product lines · 20 per page';
  if(!rows.length){
    el.innerHTML='<div class="empty">No product lines yet.</div>';
    renderPager('ebayCompactPager',state.ebayCompactPage,0,'setEbayCompactPage');
    return;
  }
  el.innerHTML=pageRows.map(function(c){
    var score=ebayCandidateScore(c);
    var family=ebayCandidateFamily(c);
    var market=ebayCandidateMarket(c);
    var url=ebayCandidateUrl(c);
    var title=url?'<a href="'+esc(url)+'" target="_blank" rel="noreferrer">'+esc(ebayCandidateTitle(c))+'</a>':esc(ebayCandidateTitle(c));
    var source=family.sourceQuery?'<span class="chip">'+esc(family.sourceQuery)+'</span>':'';
    var reasons=ebayCandidateReasons(c).slice(0,5).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
    var positive=ebayPositiveReasons(c).slice(0,4).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
    var priceRange=(family.minSoldPrice!==undefined&&family.maxSoldPrice!==undefined&&Number(family.minSoldPrice)!==Number(family.maxSoldPrice))
      ? marketMoney(family.minSoldPrice,market)+'-'+marketMoney(family.maxSoldPrice,market)
      : marketMoney(ebayCandidatePrice(c),market);
    var comparison=renderAmazonComparisonForEbay(c,isRejectedEbayCandidate(c),isManualReviewEbayCandidate(c));
    var actions='<div class="card-actions">';
    if(c.id&&(isRejectedEbayCandidate(c)||isManualReviewEbayCandidate(c))&&c.productCandidateId)actions+='<button class="btn sm" onclick="navigate(\\'actions\\')">Open Review Queue</button>';
    else if(c.id&&(isRejectedEbayCandidate(c)||isManualReviewEbayCandidate(c)||c.comparisonStatus==='ERROR'))actions+='<button class="btn primary sm" onclick="considerEbayCandidate(\\''+esc(c.id)+'\\')">Review Anyway</button>';
    if(c.id&&(isRejectedEbayCandidate(c)||isManualReviewEbayCandidate(c)||c.comparisonStatus==='ERROR')&&c.comparisonStatus!=='OPPORTUNITY')actions+='<button class="btn sm" onclick="recompareEbayCandidate(\\''+esc(c.id)+'\\')">Recompare</button>';
    if(url)actions+='<a class="btn sm" href="'+esc(url)+'" target="_blank" rel="noreferrer">Open eBay</a>';
    var comp=ebayComparison(c);
    if(comp&&comp.best&&comp.best.url)actions+='<a class="btn sm" href="'+esc(comp.best.url)+'" target="_blank" rel="noreferrer">Open Amazon</a>';
    actions+='</div>';
    return '<details class="compact-product"><summary>'+
      '<span class="'+scoreClass(score)+'">'+score+'</span>'+
      '<span class="compact-title">'+title+'</span>'+
      '<span class="compact-cell">'+priceRange+'</span>'+
      '<span class="compact-cell">Comps '+esc(family.soldCount||1)+'</span>'+
      '<span class="compact-cell compact-hide-sm">'+badge(ebayCandidateStatus(c))+'</span>'+
      '<span class="compact-cell compact-hide-sm">'+esc(ebayCandidateCategory(c)||'No category')+'</span>'+
      '</summary><div class="compact-detail">'+
      '<div class="result-meta">Family <span class="mono">'+esc(family.key||'unknown')+'</span> · Item <span class="mono">'+esc(ebayCandidateItemId(c)||'unknown')+'</span> · '+esc(ebayCandidateCondition(c)||'condition unknown')+'</div>'+
      '<div class="chips">'+(source||'')+(reasons||positive||'<span class="chip">No reasons captured yet</span>')+'</div>'+
      comparison+actions+
      '</div></details>';
  }).join('');
  applyListRowsExpanded('ebayCompactProducts');
  renderPager('ebayCompactPager',state.ebayCompactPage,rows.length,'setEbayCompactPage');
}
function comparisonSortWeight(c){
  var status=ebayCandidateStatus(c);
  if(status==='NOT_COMPARED'||status==='ERROR')return 0;
  if(status==='COMPARING')return 1;
  if(status==='MANUAL_REVIEW')return 2;
  if(status==='OPPORTUNITY')return 3;
  return 4;
}
function renderEbayCompareTimerInfo(rc){
  var el=document.getElementById('ebayCompareTimerInfo');
  if(!el)return;
  if(rc&&rc.ebayAmazonCompareAutoRunEnabled){
    el.innerHTML='<span>Amazon timer</span><span class="chip">On</span><span class="chip">Every '+esc(rc.ebayAmazonCompareAutoRunIntervalMinutes||1)+' min</span><span class="chip">'+esc(rc.ebayAmazonCompareAutoRunLimit||1)+' product/run</span><span>Highest score first</span>';
  }else{
    el.innerHTML='<span>Amazon timer</span><span class="chip">Off</span><span>Manual compare only</span>';
  }
}
function renderEbayAmazonComparisonRows(candidates){
  var el=document.getElementById('ebayAmazonComparisonRows');
  var summary=document.getElementById('ebayAmazonComparisonSummary');
  if(!el)return;
  var allRows=(candidates||[]).slice().sort(function(a,b){
    return comparisonSortWeight(a)-comparisonSortWeight(b)||ebayCandidateScore(b)-ebayCandidateScore(a)||new Date(b.updatedAt||0)-new Date(a.updatedAt||0);
  });
  var rows=filterEbayRows(allRows,{
    text:inputValue('ebayCompareSearch'),
    status:selectValue('ebayCompareStatus','ALL'),
    minScore:inputValue('ebayCompareMinScore')
  });
  state.ebayComparePage=clampPage(state.ebayComparePage,rows.length);
  var start=(state.ebayComparePage-1)*pageSize;
  var pageRows=rows.slice(start,start+pageSize);
  var pending=rows.filter(function(c){var s=ebayCandidateStatus(c);return s==='NOT_COMPARED'||s==='ERROR'}).length;
  var rc=(state.data&&state.data.ruleConfig)||{};
  renderEbayCompareTimerInfo(rc);
  var timer=rc.ebayAmazonCompareAutoRunEnabled?'timer on · '+(rc.ebayAmazonCompareAutoRunIntervalMinutes||1)+' min · '+(rc.ebayAmazonCompareAutoRunLimit||1)+'/run':'timer off';
  if(summary)summary.textContent=pending+' queued · '+rows.length+' of '+allRows.length+' rows · '+timer+' · highest score first';
  if(!rows.length){
    el.innerHTML='<div class="empty">No comparison rows yet.</div>';
    renderPager('ebayComparePager',state.ebayComparePage,0,'setEbayComparePage');
    return;
  }
  el.innerHTML=pageRows.map(function(c){
    var score=ebayCandidateScore(c);
    var market=ebayCandidateMarket(c);
    var comparison=ebayComparison(c);
    var best=(comparison&&comparison.best)||{};
    var sourcePrice=best.buyBoxPrice!==undefined?best.buyBoxPrice:best.currentPrice;
    var profit=best.expectedProfit!==undefined?marketMoney(best.expectedProfit,market):'Queued';
    var roi=best.roiPercent!==undefined?Number(best.roiPercent).toFixed(1)+'%':'—';
    var cost=sourcePrice!==undefined?marketMoney(sourcePrice,market):'—';
    var match=best.matchConfidence!==undefined?pct(Number(best.matchConfidence)*100):'—';
    var url=ebayCandidateUrl(c);
    var title=url?'<a href="'+esc(url)+'" target="_blank" rel="noreferrer">'+esc(ebayCandidateTitle(c))+'</a>':esc(ebayCandidateTitle(c));
    var reasons=ebayCandidateReasons(c).slice(0,5).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
    var actions='<div class="card-actions">';
    if(c.id&&(ebayCandidateStatus(c)==='NOT_COMPARED'||ebayCandidateStatus(c)==='ERROR'))actions+='<button class="btn sm" onclick="recompareEbayCandidate(\\''+esc(c.id)+'\\')">Compare Now</button>';
    if(c.id&&(isRejectedEbayCandidate(c)||isManualReviewEbayCandidate(c))&&c.productCandidateId)actions+='<button class="btn sm" onclick="navigate(\\'actions\\')">Open Review Queue</button>';
    else if(c.id&&(isRejectedEbayCandidate(c)||isManualReviewEbayCandidate(c)||c.comparisonStatus==='ERROR'))actions+='<button class="btn primary sm" onclick="considerEbayCandidate(\\''+esc(c.id)+'\\')">Review Anyway</button>';
    if(url)actions+='<a class="btn sm" href="'+esc(url)+'" target="_blank" rel="noreferrer">Open eBay</a>';
    if(best.url)actions+='<a class="btn sm" href="'+esc(best.url)+'" target="_blank" rel="noreferrer">Open Amazon</a>';
    actions+='</div>';
    return '<details class="compact-product"><summary>'+
      '<span class="'+scoreClass(score)+'">'+score+'</span>'+
      '<span class="compact-title">'+title+'</span>'+
      '<span class="compact-cell">'+badge(ebayCandidateStatus(c))+'</span>'+
      '<span class="compact-cell compact-hide-sm">Cost '+cost+'</span>'+
      '<span class="compact-cell compact-hide-sm">Profit '+profit+'</span>'+
      '<span class="compact-cell compact-hide-sm">ROI '+roi+' · Match '+match+'</span>'+
      '</summary><div class="compact-detail">'+
      '<div class="result-meta">eBay '+marketMoney(ebayCandidatePrice(c),market)+' · Updated '+when(c.updatedAt||c.createdAt)+' · Item <span class="mono">'+esc(ebayCandidateItemId(c)||'unknown')+'</span></div>'+
      renderAmazonComparisonForEbay(c,isRejectedEbayCandidate(c),isManualReviewEbayCandidate(c))+
      (reasons?'<div class="chips">'+reasons+'</div>':'')+
      actions+
      '</div></details>';
  }).join('');
  applyListRowsExpanded('ebayAmazonComparisonRows');
  renderPager('ebayComparePager',state.ebayComparePage,rows.length,'setEbayComparePage');
}
function setEbayCompactPage(page){
  state.ebayCompactPage=page;
  renderEbayCompactProducts(currentAllEbayRows());
}
function updateEbayCompactFilters(){
  state.ebayCompactPage=1;
  renderEbayCompactProducts(currentAllEbayRows());
}
function clearEbayCompactFilters(){
  var search=document.getElementById('ebayCompactSearch');
  var status=document.getElementById('ebayCompactStatus');
  var minScore=document.getElementById('ebayCompactMinScore');
  if(search)search.value='';
  if(status)status.value='ALL';
  if(minScore)minScore.value='';
  updateEbayCompactFilters();
}
function setEbayComparePage(page){
  state.ebayComparePage=page;
  renderEbayAmazonComparisonRows(currentAllEbayRows());
}
function updateEbayCompareFilters(){
  state.ebayComparePage=1;
  renderEbayAmazonComparisonRows(currentAllEbayRows());
}
function clearEbayCompareFilters(){
  var search=document.getElementById('ebayCompareSearch');
  var status=document.getElementById('ebayCompareStatus');
  var minScore=document.getElementById('ebayCompareMinScore');
  if(search)search.value='';
  if(status)status.value='ALL';
  if(minScore)minScore.value='';
  updateEbayCompareFilters();
}

function stage(label,value,note,color){
  var c=color||'var(--blue)';
  return '<div class="stage" style="border-color:'+c+'40"><div><div class="stage-value" style="color:'+c+'">'+esc(value===undefined||value===null?0:value)+'</div><div class="stage-label">'+esc(label)+'</div></div><div class="stage-note">'+esc(note||'')+'</div></div>';
}
function renderPipeline(){
  var p=(state.data&&state.data.pipeline)||{};
  var f=p.funnel||{};
  var o=p.observability||{};
  var funnel=[
    stage('Queued',f.ebayQueued,'sold eBay products waiting for Amazon comparison',COLORS.slate),
    stage('Comparing',f.ebayComparing,'active Amazon match jobs',COLORS.blue),
    stage('Opportunities',f.ebayOpportunities,'passed demand, match, and margin checks',COLORS.green),
    stage('Manual Review',f.ebayManualReview,'promising but needs human verification',COLORS.amber),
    stage('Verify Queue',f.verifyActions,'live price checks before listing',COLORS.amber),
    stage('Active Listings',f.activeListings,'currently live on eBay',COLORS.teal),
    stage('Source Rejects',f.ebaySourceRejected,'missing prices, auctions, or bad source rows',COLORS.red),
    stage('Match Rejects',f.ebayMatchingRejected,'identity or confidence did not clear automation',COLORS.red),
    stage('Rejected',f.ebayRejected,'all filtered-out products',COLORS.red),
    stage('Errors',f.ebayErrors,'retryable comparison failures',COLORS.red)
  ].join('');
  var funnelEl=document.getElementById('pipelineFunnel');
  if(funnelEl)funnelEl.innerHTML=funnel;
  var actionsEl=document.getElementById('pipelineActions');
  if(actionsEl)actionsEl.innerHTML=[
    '<button class="btn primary" onclick="runEbayAutoNow()">Run eBay Scan</button>',
    '<button class="btn primary" onclick="runEbayAmazonCompareNow()">Run Amazon Compare</button>',
    '<button class="btn" onclick="navigate(&quot;actions&quot;)">Review Actions</button>',
    '<span class="hint">Human confirmation '+esc(f.humanConfirmation||0)+' · automation issues '+esc(f.automationFailures||0)+'</span>'
  ].join('');

  var learningEl=document.getElementById('learningMetrics');
  if(learningEl)learningEl.innerHTML=[
    stage('Families',o.productFamilies,'canonical product groups learned',COLORS.blue),
    stage('Price Checks',o.priceObservations,'captured Amazon/eBay observations',COLORS.teal),
    stage('Inventory Watch',o.inventoryWatching,'source records tracked',COLORS.amber),
    stage('Realized P/L',money(o.realizedProfit||0),'from ledger entries',COLORS.green)
  ].join('');

  var locks=p.schedulerLocks||[];
  var locksEl=document.getElementById('schedulerLocks');
  if(locksEl)locksEl.innerHTML=locks.length?locks.map(function(lock){
    var live=new Date(lock.leasedUntil).getTime()>Date.now();
    return '<div class="rank-row"><div class="rank-score" style="color:'+(live?COLORS.green:COLORS.slate)+'">'+(live?'ON':'ID')+'</div><div><div class="rank-title">'+esc(lock.name)+'</div><div class="rank-meta">Owner '+esc(lock.owner||'—')+' · lease '+when(lock.leasedUntil)+'</div></div>'+badge(live?'RUNNING':'SKIPPED')+'</div>';
  }).join(''):'<div class="empty">No scheduler leases recorded yet.</div>';

  var top=p.topOpportunities||[];
  var topEl=document.getElementById('topOpportunities');
  if(topEl)topEl.innerHTML=top.length?top.map(function(item){
    var score=item.opportunityScore===null||item.opportunityScore===undefined?'—':item.opportunityScore;
    var match=(item.amazonMatches&&item.amazonMatches[0])||{};
    var profit=(item.profitSnapshots&&item.profitSnapshots[0])||{};
    var decision=(item.aiDecisions&&item.aiDecisions[0])||{};
    var meta=[
      'eBay '+money(item.ebaySoldPrice),
      'Amazon '+money(match.buyBoxPrice||match.currentPrice),
      'Profit '+money(profit.expectedProfit),
      'ROI '+(profit.roiPercent===undefined||profit.roiPercent===null?'—':Number(profit.roiPercent).toFixed(1)+'%')
    ].join(' · ');
    return '<div class="rank-row"><div class="rank-score">'+esc(score)+'</div><div><div class="rank-title" title="'+esc(item.ebayTitle||'')+'">'+esc(item.ebayTitle||'Untitled opportunity')+'</div><div class="rank-meta">'+esc(meta)+'</div></div>'+badge(decision.decision||item.safetyStatus||'PENDING')+'</div>';
  }).join(''):'<div class="empty">No scored opportunities yet. Start eBay Discovery to build the queue.</div>';
}

function render(){
  var d=state.data;if(!d)return;
  var icons={productCandidates:['🔎','rgba(99,102,241,.18)'],amazonMatches:['📦','rgba(34,211,238,.16)'],ebayListings:['🏷','rgba(52,211,153,.16)'],orders:['🧾','rgba(96,165,250,.16)'],actions:['⚡','rgba(251,191,36,.16)'],purchases:['💳','rgba(45,212,191,.16)'],discoveryScans:['⌕','rgba(45,212,191,.16)'],amazonScouts:['🧭','rgba(34,211,238,.16)'],ebayDiscoveries:['⇄','rgba(52,211,153,.16)'],ebayAmazonComparisons:['A>','rgba(34,211,238,.16)'],automationRuns:['◉','rgba(96,165,250,.16)'],automationNeedsConfirmation:['✓','rgba(251,191,36,.16)'],automationFailures:['!','rgba(248,113,113,.16)']};
  var labels={productCandidates:'Candidates',amazonMatches:'Amazon Matches',ebayListings:'Listings',orders:'Orders',actions:'Actions',purchases:'Purchases',discoveryScans:'Scans',amazonScouts:'Amazon Scouts',ebayDiscoveries:'eBay Discovery',ebayAmazonComparisons:'Amazon Compare Jobs',automationRuns:'Automation Runs',automationNeedsConfirmation:'Needs Confirm',automationFailures:'Automation Issues'};
  document.getElementById('stats').innerHTML=Object.keys(d.counts).map(function(k){
    var ic=icons[k]||['•','rgba(99,102,241,.18)'];
    return '<div class="stat" style="--gl:'+ic[1]+'"><div class="ic">'+ic[0]+'</div><div class="label">'+(labels[k]||k)+'</div><div class="count">'+d.counts[k]+'</div></div>';
  }).join('');
  renderPipeline();

  var actCols=[
    {key:'id',label:'ID',fmt:function(v){return shortId(v)}},
    {key:'type',label:'Type',fmt:badge},
    {key:'status',label:'Status',fmt:badge},
    {key:'payloadJson',label:'Mode',fmt:function(_v,r){return badge(actionMode(r))}},
    {key:'priority',label:'Pri'},
    {key:'reason',label:'Reason',cls:'truncate',fmt:function(v){return '<span class="truncate" title="'+esc(v||'')+'">'+txt(v)+'</span>'}},
    {key:'createdAt',label:'Created',fmt:when}
  ];
  document.getElementById('actionsTable').innerHTML=table(d.actions,actCols,{selectKey:'id'});
  document.getElementById('ovActions').innerHTML=table((d.actions||[]).slice(0,6),actCols,{selectKey:'id'});

  document.getElementById('automationRunsTable').innerHTML=table(d.automationRuns||[],[
    {key:'id',label:'Run',fmt:shortId},
    {key:'mode',label:'Mode',fmt:badge},
    {key:'status',label:'Status',fmt:badge},
    {key:'phase',label:'Phase',fmt:function(v){return '<span class="mono">'+esc(v||'—')+'</span>'}},
    {key:'riskScore',label:'Risk'},
    {key:'actionItem',label:'Action',fmt:function(v){return v?badge(v.type)+' '+shortId(v.id):'—'}},
    {key:'events',label:'Latest Event',cls:'truncate',fmt:function(_v,r){var e=latestEventText(r);return '<span class="truncate" title="'+esc(e)+'">'+esc(e)+'</span>'}},
    {key:'startedAt',label:'Started',fmt:when}
  ]);

  var listCols=[
    {key:'id',label:'ID',fmt:shortId},
    {key:'listingStatus',label:'Status',fmt:badge},
    {key:'listedPrice',label:'Price',fmt:money},
    {key:'title',label:'Title',fmt:function(v){return '<span class="truncate" title="'+esc(v||'')+'">'+txt(v)+'</span>'}},
    {key:'ebayItemId',label:'eBay Item',fmt:function(v){return v?'<span class="mono">'+esc(v)+'</span>':'—'}},
    {key:'updatedAt',label:'Updated',fmt:when}
  ];
  document.getElementById('listingsTable').innerHTML=table(d.ebayListings,listCols);
  document.getElementById('ovListings').innerHTML=table((d.ebayListings||[]).slice(0,6),listCols);

  document.getElementById('ordersTable').innerHTML=table(d.orders,[
    {key:'ebayOrderId',label:'eBay Order',fmt:function(v){return '<span class="mono">'+esc(v||'—')+'</span>'}},
    {key:'orderStatus',label:'Status',fmt:badge},
    {key:'salePrice',label:'Sale',fmt:money},
    {key:'buyerName',label:'Buyer'},
    {key:'amazonOrderStatus',label:'Amazon'},
    {key:'createdAt',label:'Created',fmt:when}
  ]);

  document.getElementById('productsTable').innerHTML=table(d.productCandidates,[
    {key:'opportunityScore',label:'Score',fmt:function(v){return v===null||v===undefined?'—':'<b>'+esc(v)+'</b>'}},
    {key:'ebayTitle',label:'Title',fmt:function(v){return '<span class="truncate" title="'+esc(v||'')+'">'+txt(v)+'</span>'}},
    {key:'ebaySoldPrice',label:'eBay Price',fmt:money},
    {key:'discoveryProfile',label:'Profile'},
    {key:'safetyStatus',label:'Safety',fmt:badge},
    {key:'ebayCondition',label:'Condition'},
    {key:'createdAt',label:'Found',fmt:when}
  ]);

  document.getElementById('scanRunsTable').innerHTML=table(d.discoveryScanRuns,[
    {key:'profileKey',label:'Profile'},
    {key:'status',label:'Status',fmt:badge},
    {key:'scannedCount',label:'Scanned'},
    {key:'acceptedCount',label:'Accepted'},
    {key:'rejectedCount',label:'Rejected'},
    {key:'startedAt',label:'Started',fmt:when}
  ]);
  document.getElementById('amazonScoutRunsTable').innerHTML=table(d.amazonDiscoveryRuns,[
    {key:'profileKey',label:'Profile'},
    {key:'categoryKey',label:'Category'},
    {key:'status',label:'Status',fmt:badge},
    {key:'scannedCount',label:'Scanned'},
    {key:'acceptedCount',label:'Accepted'},
    {key:'comparedCount',label:'Compared'},
    {key:'opportunityCount',label:'Opps'},
    {key:'error',label:'Error',fmt:function(v){return v?'<span class="truncate" title="'+esc(v)+'">'+esc(v)+'</span>':'—'}},
    {key:'startedAt',label:'Started',fmt:when}
  ]);
  if((d.amazonDiscoveryCandidates||[]).length&&!state.amazonScoutCandidates.length&&!state.amazonScoutRejected.length)renderAmazonScoutReport(d.amazonDiscoveryCandidates,[],false);
  document.getElementById('ebayDiscoveryRunsTable').innerHTML=table(d.ebayDiscoveryRuns,[
    {key:'profileKey',label:'Profile'},
    {key:'categoryKey',label:'Category'},
    {key:'status',label:'Status',fmt:badge},
    {key:'scannedCount',label:'Scanned'},
    {key:'acceptedCount',label:'Accepted'},
    {key:'comparedCount',label:'Compared'},
    {key:'opportunityCount',label:'Opps'},
    {key:'error',label:'Error',fmt:function(v){return v?'<span class="truncate" title="'+esc(v)+'">'+esc(v)+'</span>':'—'}},
    {key:'startedAt',label:'Started',fmt:when}
  ]);
  document.getElementById('ebayAmazonComparisonRunsTable').innerHTML=table(d.ebayAmazonComparisonRuns,[
    {key:'mode',label:'Mode',fmt:badge},
    {key:'status',label:'Status',fmt:badge},
    {key:'selectedCount',label:'Selected',fmt:function(v,r){
      var selected=Array.isArray(r.selectedCandidates)?r.selectedCandidates:[];
      var first=selected[0]&&selected[0].title?String(selected[0].title):'';
      return esc(v||0)+(first?' · <span class="truncate" title="'+esc(first)+'">'+esc(first)+'</span>':'');
    }},
    {key:'comparedCount',label:'Compared'},
    {key:'opportunityCount',label:'Opps'},
    {key:'manualReviewCount',label:'Review'},
    {key:'rejectedCount',label:'Rejected'},
    {key:'keepaTokensLeft',label:'Keepa',fmt:function(v,r){
      var parts=[];
      if(v!==null&&v!==undefined)parts.push('left '+esc(v));
      if(r.keepaRequestedTokens!==null&&r.keepaRequestedTokens!==undefined)parts.push('need '+esc(r.keepaRequestedTokens));
      if(r.keepaRetryAfterSeconds!==null&&r.keepaRetryAfterSeconds!==undefined)parts.push('retry '+esc(r.keepaRetryAfterSeconds)+'s');
      return parts.length?parts.join(' · '):'—';
    }},
    {key:'reason',label:'Reason',fmt:function(v,r){var msg=r.error||v;return msg?'<span class="truncate" title="'+esc(msg)+'">'+esc(msg)+'</span>':'—'}},
    {key:'startedAt',label:'Started',fmt:when}
  ]);
  if((d.ebayDiscoveryCandidates||[]).length&&!state.ebayDiscoveryCandidates.length&&!state.ebayDiscoveryRejected.length)renderEbayDiscoveryReport(d.ebayDiscoveryCandidates,[],false);
  renderEbayCompactProducts((d.allEbayDiscoveryCandidates&&d.allEbayDiscoveryCandidates.length)?d.allEbayDiscoveryCandidates:(d.ebayDiscoveryCandidates||[]));
  renderEbayAmazonComparisonRows((d.allEbayDiscoveryCandidates&&d.allEbayDiscoveryCandidates.length)?d.allEbayDiscoveryCandidates:(d.ebayDiscoveryCandidates||[]));

  var rc=d.ruleConfig||{};
  if(rc.amazonPriceCheckIntervalMinutes)document.getElementById('interval').value=rc.amazonPriceCheckIntervalMinutes;
  if(rc.ebayDiscoveryAutoRunEnabled!==undefined)document.getElementById('ebayAutoRunEnabled').checked=!!rc.ebayDiscoveryAutoRunEnabled;
  if(rc.ebayDiscoveryAutoRunIntervalMinutes)document.getElementById('ebayAutoRunInterval').value=rc.ebayDiscoveryAutoRunIntervalMinutes;
  if(rc.ebayDiscoveryAutoRunLimit)document.getElementById('ebayAutoRunLimit').value=rc.ebayDiscoveryAutoRunLimit;
  if(rc.ebayAmazonCompareAutoRunEnabled!==undefined)document.getElementById('ebayAmazonCompareEnabled').checked=!!rc.ebayAmazonCompareAutoRunEnabled;
  if(rc.ebayAmazonCompareAutoRunIntervalMinutes)document.getElementById('ebayAmazonCompareInterval').value=rc.ebayAmazonCompareAutoRunIntervalMinutes;
  if(rc.ebayAmazonCompareAutoRunLimit)document.getElementById('ebayAmazonCompareLimit').value=rc.ebayAmazonCompareAutoRunLimit;
  document.getElementById('settingsSafeMode').checked=!!rc.safeMode;
  if(rc.minimumOpportunityScore!==undefined)document.getElementById('settingsMinScore').value=rc.minimumOpportunityScore;
  if(rc.maxAmazonCostUsd!==undefined)document.getElementById('settingsMaxCost').value=rc.maxAmazonCostUsd;
  document.getElementById('settingsAllowedCategories').value=lineText(rc.allowedCategories);
  document.getElementById('settingsBlockedCategories').value=lineText(rc.blockedCategories);
  document.getElementById('settingsBlockedKeywords').value=lineText(rc.blockedKeywords);
  if(rc.minimumOpportunityScore!==undefined)document.getElementById('scanMinScore').value=rc.minimumOpportunityScore;
  if(rc.maxAmazonCostUsd!==undefined)document.getElementById('scanMaxCost').value=rc.maxAmazonCostUsd;
  document.getElementById('scanSafeMode').checked=!!rc.safeMode;
  if(rc.maxAmazonCostUsd!==undefined)document.getElementById('amazonScoutMaxCost').value=rc.maxAmazonCostUsd;
  document.getElementById('amazonScoutSafeMode').checked=!!rc.safeMode;
  if(rc.minimumOpportunityScore!==undefined)document.getElementById('ebayDiscoveryMinCompareScore').value=rc.minimumOpportunityScore;
  if(rc.thresholds&&rc.thresholds.minimumProfitUsd!==undefined)document.getElementById('ebayDiscoveryMinProfit').value=rc.thresholds.minimumProfitUsd;
  if(rc.thresholds&&rc.thresholds.minimumRoiPercent!==undefined)document.getElementById('ebayDiscoveryMinRoi').value=rc.thresholds.minimumRoiPercent;
  if(rc.thresholds&&rc.thresholds.minimumMatchConfidence!==undefined)document.getElementById('ebayDiscoveryMinMatch').value=Math.round(Number(rc.thresholds.minimumMatchConfidence||0)*100);
  document.getElementById('ebayDiscoverySafeMode').checked=!!rc.safeMode;
  var prettySet={minimumProfitUsd:'Min Profit (USD)',minimumRoiPercent:'Min ROI %',minimumMatchConfidence:'Min Match Confidence',minimumOpportunityScore:'Min Opportunity Score',safeMode:'Safe Mode',maxAmazonCostUsd:'Max Amazon Cost',estimatedSalesTaxRate:'Est. Sales Tax Rate',returnRiskBuffer:'Return Risk Buffer',priceChangeBuffer:'Price Change Buffer',maxDailyListings:'Max Daily Listings',maxDailyPurchaseAmountUsd:'Max Daily Spend (USD)',amazonPriceCheckIntervalMinutes:'Price-Check Interval (min)'};
  document.getElementById('settingsKv').innerHTML=Object.keys(prettySet).filter(function(k){return rc[k]!==undefined&&rc[k]!==null}).map(function(k){
    return '<div class="k">'+prettySet[k]+'</div><div class="v">'+esc(rc[k])+'</div>';
  }).join('')||'<div class="empty" style="grid-column:span 2">No active rule config.</div>';

  document.querySelectorAll('[data-select]').forEach(function(tr){tr.onclick=function(){selectAction(tr.getAttribute('data-select'))}});
  document.getElementById('updatedPill').textContent='Updated '+new Date().toLocaleTimeString();
}

function selectAction(id){document.getElementById('actionId').value=id;document.getElementById('selTag').innerHTML='Selected: <b>'+esc(id)+'</b>';navigate('actions')}

  function navigate(view){
    document.querySelectorAll('.nav-item').forEach(function(n){n.classList.toggle('active',n.getAttribute('data-view')===view)});
    document.querySelectorAll('.view').forEach(function(v){v.classList.toggle('active',v.id==='view-'+view)});
    var mobile=document.getElementById('mobileNav');if(mobile)mobile.value=view;
    document.getElementById('viewTitle').textContent=META[view][0];
    document.getElementById('viewSub').textContent=META[view][1];
    if(view==='keys')loadCredentials();
}

function credBadge(source){var m={database:'green',environment:'blue',unset:'slate'};var t={database:'Saved in DB',environment:'From env',unset:'Not set'};var c=COLORS[m[source]||'slate'];return '<span class="badge" style="color:'+c+';background:'+c+'1f;border-color:'+c+'40">'+t[source]+'</span>'}
function credField(c){
  var input;
  if(c.type==='toggle'){
    var on=c.preview==='true';
    input='<select id="cred_'+c.key+'"><option value="true"'+(on?' selected':'')+'>true</option><option value="false"'+(on?'':' selected')+'>false</option></select>';
  }else{
    var ph=c.type==='secret'?(c.preview?'Current: '+c.preview:'Enter '+c.label):(c.preview||'Enter '+c.label);
    var it=c.type==='secret'?'password':'text';
    input='<input id="cred_'+c.key+'" type="'+it+'" placeholder="'+esc(ph)+'">';
  }
  var help=c.help?'<div class="hint" style="margin-top:4px">'+esc(c.help)+'</div>':'';
  var clearBtn=c.source==='database'?'<button class="btn ghost sm" onclick="clearCred(\\''+c.key+'\\')">Clear</button>':'';
  return '<div class="cred-row"><div class="cred-meta"><div class="cred-label">'+esc(c.label)+' '+credBadge(c.source)+'</div>'+help+'</div>'+
    '<div class="cred-input">'+input+'</div><div class="cred-actions"><button class="btn primary sm" onclick="saveCred(\\''+c.key+'\\')">Save</button>'+clearBtn+'</div></div>';
}
function renderCredentials(list){
  var groups={},order=[];
  list.forEach(function(c){if(!groups[c.group]){groups[c.group]=[];order.push(c.group)}groups[c.group].push(c)});
  document.getElementById('credsContainer').innerHTML=order.map(function(g){
    return '<div class="cred-group"><div class="cred-group-title">'+esc(g)+'</div>'+groups[g].map(credField).join('')+'</div>';
  }).join('');
}
  function loadCredentials(){
    apiFetch('/api/credentials').then(function(r){
      if(r.status===401){document.getElementById('keysLocked').style.display='flex';document.getElementById('credsContainer').innerHTML='<div class="empty">Locked. Set the Local Agent Shared Secret in Settings, then reopen this tab.</div>';return null}
      if(r.status===503){document.getElementById('keysLocked').style.display='flex';document.getElementById('credsContainer').innerHTML='<div class="empty">Protected routes are not configured. Set LOCAL_AGENT_SHARED_SECRET on the backend first.</div>';return null}
      document.getElementById('keysLocked').style.display='none';return responseJson(r);
    }).then(function(j){if(j)renderCredentials(j.credentials)}).catch(function(e){document.getElementById('credsContainer').innerHTML='<div class="empty">Could not load credentials: '+esc(e.message)+'</div>'});
  }
  function putCred(key,value,okMsg){
    return apiFetch('/api/credentials/'+encodeURIComponent(key),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({value:value})}).then(function(r){
      if(r.status===401){document.getElementById('keysLocked').style.display='flex';throw new Error('Unauthorized — set the Local Agent Shared Secret in Settings')}
      if(r.status===503){document.getElementById('keysLocked').style.display='flex';throw new Error('Protected routes are not configured — set LOCAL_AGENT_SHARED_SECRET on the backend first')}
      return responseJson(r);
    }).then(function(){toast(okMsg,key,'ok');loadCredentials()}).catch(function(e){toast('Save failed',e.message,'err')});
  }
function saveCred(key){var el=document.getElementById('cred_'+key);putCred(key,el?el.value:'','Credential saved')}
function clearCred(key){putCred(key,'','Credential cleared')}

function setDb(connected,msg){
  var dot=document.getElementById('dbDot'),lbl=document.getElementById('dbLabel');
  dot.className='dot '+(connected?'on':'off');
  lbl.textContent=connected?'Postgres connected':'DB disconnected';
  if(!connected&&msg)lbl.title=msg;
}

function checkDb(){
  fetch('/api/health/db').then(function(r){return r.json()}).then(function(j){setDb(!!j.connected,j.error)}).catch(function(){setDb(false)});
}

  function load(){
    document.getElementById('agentSecret').value=localStorage.getItem('localAgentSecret')||'';
    checkDb();
    apiJson('/api/dashboard').then(function(data){
      state.data=data;document.getElementById('offline').classList.remove('show');render();
    }).catch(function(e){
      var authHint=e.status===401||e.status===503?' Set the Local Agent Shared Secret in Settings and ensure the backend has a configured shared secret.':' Check the database connection.';
      document.getElementById('offlineMsg').textContent='Could not load dashboard data: '+e.message+'.'+authHint;
      document.getElementById('offline').classList.add('show');
    });
  }

  function saveSecret(){localStorage.setItem('localAgentSecret',document.getElementById('agentSecret').value);toast('Secret saved','Stored in this browser.','ok')}
  function clearSecret(){localStorage.removeItem('localAgentSecret');document.getElementById('agentSecret').value='';toast('Secret cleared',null,'ok')}
  function saveInterval(){var v=Number(document.getElementById('interval').value);if(!v)return toast('Invalid interval',null,'warn');
    apiJson('/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({amazonPriceCheckIntervalMinutes:v})}).then(function(){toast('Interval saved',v+' minutes','ok');load()}).catch(function(e){toast('Save failed',e.message,'err')})}
function saveEbayAutoRun(){
  var interval=Number(document.getElementById('ebayAutoRunInterval').value||1);
  var limit=Number(document.getElementById('ebayAutoRunLimit').value||5);
  if(!interval||interval<1)return toast('Invalid interval','Use at least 1 minute.','warn');
  if(!limit||limit<1)return toast('Invalid product count','Use at least 1 product per run.','warn');
  var body={
    ebayDiscoveryAutoRunEnabled:document.getElementById('ebayAutoRunEnabled').checked,
    ebayDiscoveryAutoRunIntervalMinutes:interval,
    ebayDiscoveryAutoRunLimit:limit
  };
  apiJson('/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(){
    toast('eBay auto-run saved',(body.ebayDiscoveryAutoRunEnabled?'Enabled':'Disabled')+' · '+interval+' min · '+limit+' products · eBay only','ok');
    load();
  }).catch(function(e){toast('Save failed',e.message,'err')});
}
function stopEbayAutoRun(){
  if(!confirmAction('Stop eBay auto-run?','This disables future scheduled eBay discovery runs but keeps the current interval and product count.'))return;
  apiJson('/api/ebay-discovery/auto-run/stop',{method:'POST'}).then(function(res){
    toast('eBay auto-run stopped',res,'ok');
    load();
  }).catch(function(e){toast('Stop failed',e.message,'err')});
}
function deleteEbayAutoRun(){
  if(!confirmAction('Delete eBay auto-run job?','This disables the scheduled eBay job and resets its interval and product count to defaults. Product data and past completed runs are kept.'))return;
  apiJson('/api/ebay-discovery/auto-run/delete',{method:'POST'}).then(function(res){
    toast('eBay auto-run deleted',res,'ok');
    load();
  }).catch(function(e){toast('Delete failed',e.message,'err')});
}
function saveEbayAmazonCompareAutoRun(){
  var interval=Number(document.getElementById('ebayAmazonCompareInterval').value||1);
  var limit=Number(document.getElementById('ebayAmazonCompareLimit').value||1);
  if(!interval||interval<1)return toast('Invalid interval','Use at least 1 minute.','warn');
  if(!limit||limit<1)return toast('Invalid product count','Use at least 1 product per run.','warn');
  var body={
    ebayAmazonCompareAutoRunEnabled:document.getElementById('ebayAmazonCompareEnabled').checked,
    ebayAmazonCompareAutoRunIntervalMinutes:interval,
    ebayAmazonCompareAutoRunLimit:limit
  };
  apiJson('/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(){
    toast('Amazon comparison auto-run saved',(body.ebayAmazonCompareAutoRunEnabled?'Enabled':'Disabled')+' · '+interval+' min · '+limit+' product'+(limit===1?'':'s'),'ok');
    load();
  }).catch(function(e){toast('Save failed',e.message,'err')});
}
function stopEbayAmazonCompareAutoRun(){
  if(!confirmAction('Stop Amazon comparison auto-run?','This disables future scheduled Amazon comparisons but keeps the current interval and product count.'))return;
  apiJson('/api/ebay-discovery/amazon-compare-auto-run/stop',{method:'POST'}).then(function(res){
    toast('Amazon comparison auto-run stopped',res,'ok');
    load();
  }).catch(function(e){toast('Stop failed',e.message,'err')});
}
function deleteEbayAmazonCompareAutoRun(){
  if(!confirmAction('Delete Amazon comparison auto-run job?','This disables the scheduled Amazon comparison job and resets its interval and product count to defaults. Product data and past completed runs are kept.'))return;
  apiJson('/api/ebay-discovery/amazon-compare-auto-run/delete',{method:'POST'}).then(function(res){
    toast('Amazon comparison auto-run deleted',res,'ok');
    load();
  }).catch(function(e){toast('Delete failed',e.message,'err')});
}
function runEbayAutoNow(){
  toast('Running scheduled eBay discovery','Using auto-run settings');
  jpost('/api/ebay-discovery/auto-run/run',{}).then(function(res){
    toast('Scheduled eBay discovery complete',res,'ok');
    load();
  }).catch(function(e){toast('Scheduled run failed',e.message,'err')});
}
function runEbayAmazonCompareNow(){
  toast('Running Amazon comparison','Using the highest-score queued eBay products');
  jpost('/api/ebay-discovery/amazon-compare-auto-run/run',{}).then(function(res){
    toast('Amazon comparison run complete',res,'ok');
    loadKeepaTokenStatus();
    load();
  }).catch(function(e){toast('Comparison run failed',e.message,'err')});
}
function saveSafety(){
  var body={
    safeMode:document.getElementById('settingsSafeMode').checked,
    minimumOpportunityScore:Number(document.getElementById('settingsMinScore').value||65),
    maxAmazonCostUsd:Number(document.getElementById('settingsMaxCost').value||150),
    allowedCategories:lines(document.getElementById('settingsAllowedCategories').value),
    blockedCategories:lines(document.getElementById('settingsBlockedCategories').value),
    blockedKeywords:lines(document.getElementById('settingsBlockedKeywords').value)
  };
    apiJson('/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(){toast('Safety rules saved',null,'ok');load()}).catch(function(e){toast('Save failed',e.message,'err')});
  }
  function runMonitor(){if(!confirmAction('Run Amazon price check now?','This can pause internal listings and create PAUSE actions when source prices rise.'))return;toast('Running price check','Scanning active listings…');
    jpost('/api/monitor/amazon-prices/run',{}).then(function(res){toast('Price check complete',res,'ok');load()}).catch(function(e){toast('Price check failed',e.message,'err')})}
  function actId(){var id=document.getElementById('actionId').value.trim();if(!id)toast('No action selected','Click a row or paste an Action ID.','warn');return id}
  function updateAction(status){var id=actId();if(!id)return;if(!confirmAction(status.charAt(0)+status.slice(1).toLowerCase()+' this action?',id))return;apiFetch('/actions/'+encodeURIComponent(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:status,reviewedBy:'dashboard'})}).then(responseJson).then(function(){toast('Action '+status.toLowerCase(),id,'ok');load()}).catch(function(e){toast('Update failed',e.message,'err')})}
  function approveAction(){updateAction('APPROVED')}
  function rejectAction(){updateAction('REJECTED')}
  function completeSelectedAction(){updateAction('COMPLETED')}
  function executeAction(){var id=actId();if(!id)return;if(!confirmAction('Execute this approved action?',id))return;apiFetch('/actions/'+encodeURIComponent(id)+'/execute',{method:'POST'}).then(responseJson).then(function(res){toast('Action executed',res,'ok');load()}).catch(function(e){toast('Execute failed',e.message,'err')})}
  function queueAutomation(mode){
    var id=actId();if(!id)return;
    var detail=mode==='AUTOPILOT'?'Autopilot allows a configured local agent to complete the final marketplace action. Backend limits and agent config still apply.':id;
    if(!confirmAction('Queue '+mode+' automation?',detail))return;
    apiFetch('/actions/'+encodeURIComponent(id)+'/automation-mode',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({mode:mode,approve:true,reviewedBy:'dashboard'})}).then(responseJson).then(function(res){toast('Automation queued',{id:id,mode:mode,status:res.action&&res.action.status},'ok');load();navigate('automation')}).catch(function(e){toast('Queue failed',e.message,'err')})
  }
function toggleAmazonCandidate(el){
  state.selectedAmazon[el.getAttribute('data-amazon-id')]=el.checked;
  updateAmazonScoutActions();
}
function selectedAmazonIds(){
  return state.amazonScoutCandidates.filter(function(c){return isSelectableAmazonCandidate(c)&&state.selectedAmazon[c.id]}).map(function(c){return c.id});
}
function selectHighAmazonScores(){
  state.selectedAmazon={};
  var min=Number(document.getElementById('amazonScoutMinScore').value||62);
  state.amazonScoutCandidates.forEach(function(c){if(isSelectableAmazonCandidate(c)&&amazonCandidateScore(c)>=min)state.selectedAmazon[c.id]=true});
  renderAmazonScoutReport(state.amazonScoutCandidates.concat(state.amazonScoutRejected),[],true);
  var selected=selectedAmazonIds().length;
  if(!selected)return toast('No accepted Amazon candidates','All scanned products were rejected or below the selected score. Review the rejection reasons below.','warn');
  toast('Selected high-score candidates',selected+' products','ok');
}
function runAmazonScout(){
  var profile=document.getElementById('amazonScoutProfile').value||'starter-safe';
  var category=document.getElementById('amazonScoutCategory').value||'custom';
  var q=document.getElementById('amazonScoutQuery').value.trim();
  if(profile==='custom'&&!q)return toast('Enter keywords','Custom Amazon Scout needs keywords.','warn');
  var auto=document.getElementById('amazonScoutAuto').checked;
  var body={
    profileKey:profile,
    categoryKey:category,
    marketKey:document.getElementById('amazonScoutMarket').value||'de',
    query:q||undefined,
    limit:Number(document.getElementById('amazonScoutLimit').value||40),
    mode:auto?'AUTO':'MANUAL',
    autoCompare:auto,
    compareLimit:Number(document.getElementById('amazonScoutCompareLimit').value||12),
    ebayComparison:amazonComparisonPayload(),
    safeMode:document.getElementById('amazonScoutSafeMode').checked,
    minAmazonScore:Number(document.getElementById('amazonScoutMinScore').value||62),
    maxAmazonCostUsd:Number(document.getElementById('amazonScoutMaxCost').value||150),
    minPriceDropPercent:Number(document.getElementById('amazonScoutMinDrop').value||0)
  };
  toast('Running Amazon Scout',profile+' · '+category);
  jpost('/amazon-discovery/run',body).then(function(res){
    state.amazonScoutRunId=res.run&&res.run.id;
    state.selectedAmazon={};
    renderAmazonScoutReport((res.run&&res.run.candidates)||[],res.rejected||[],false);
    document.getElementById('amazonScoutSummary').textContent='Scanned '+(res.summary.scanned||0)+' · accepted '+(res.summary.accepted||0)+' · review '+(res.summary.manualReviews||0)+' · source rejected '+(res.summary.sourceRejected||0)+' · rejected '+(res.summary.rejected||0)+' · compared '+(res.summary.compared||0)+' · opportunities '+(res.summary.opportunities||0);
    toast('Amazon Scout complete',{summary:res.summary,rejectionBreakdown:res.rejectionBreakdown||[]},'ok');
    loadKeepaTokenStatus();
    load();
  }).catch(function(e){renderKeepaTokenFromPayload(e.payload);loadKeepaTokenStatus();toast('Amazon Scout failed',e.message,'err')});
}
function compareSelectedAmazon(){
  var ids=selectedAmazonIds();
  if(!ids.length)return toast('No accepted candidates selected','Only accepted Amazon candidates can be compared with eBay.','warn');
  toast('Comparing with eBay',ids.length+' selected products');
  jpost('/amazon-discovery/compare',{candidateIds:ids,limit:ids.length,marketKey:document.getElementById('amazonScoutMarket').value||'de',ebayComparison:amazonComparisonPayload()}).then(function(res){
    toast('eBay comparison complete',{compared:res.compared,opportunities:(res.opportunities||[]).length,manualReviews:(res.manualReviews||[]).length,rejected:(res.rejected||[]).length},'ok');
    state.amazonScoutCandidates=[];
    state.amazonScoutReview=[];
    state.amazonScoutRejected=[];
    state.selectedAmazon={};
    load();
  }).catch(function(e){toast('Comparison failed',e.message,'err')});
}
function recompareAmazonCandidate(id){
  toast('Recomparing with eBay','Using the current comparison filters');
  jpost('/amazon-discovery/compare',{candidateIds:[id],limit:1,force:true,marketKey:document.getElementById('amazonScoutMarket').value||'de',ebayComparison:amazonComparisonPayload()}).then(function(res){
    toast('Recompare complete',{compared:res.compared,opportunities:(res.opportunities||[]).length,manualReviews:(res.manualReviews||[]).length,rejected:(res.rejected||[]).length},'ok');
    state.amazonScoutCandidates=[];state.amazonScoutReview=[];state.amazonScoutRejected=[];state.selectedAmazon={};
    load();
  }).catch(function(e){toast('Recompare failed',e.message,'err')});
}
function considerAmazonCandidate(id){
  toast('Adding to review','Creating a manual review action');
  jpost('/amazon-discovery/consider',{candidateId:id,note:'Added from Discovery'},false).then(function(res){
    toast(res.alreadyConsidered?'Already in review':'Review item created',{productCandidateId:res.productCandidateId,amazonMatchId:res.amazonMatchId},'ok');
    state.amazonScoutCandidates=[];state.amazonScoutReview=[];state.amazonScoutRejected=[];state.selectedAmazon={};
    load();
  }).catch(function(e){toast('Review action failed',e.message,'err')});
}
function toggleEbayCandidate(el){
  state.selectedEbay[el.getAttribute('data-ebay-id')]=el.checked;
  updateEbayDiscoveryActions();
}
function selectHighEbayScores(){
  state.selectedEbay={};
  var min=Number(document.getElementById('ebayDiscoveryMinScore').value||50);
  state.ebayDiscoveryCandidates.forEach(function(c){if(isSelectableEbayCandidate(c)&&ebayCandidateScore(c)>=min)state.selectedEbay[c.id]=true});
  renderEbayDiscoveryReport(state.ebayDiscoveryCandidates.concat(state.ebayDiscoveryRejected),[],true);
  var selected=selectedEbayIds().length;
  if(!selected)return toast('No accepted eBay candidates','All scanned products were rejected or below the selected score. Review the rejection reasons below.','warn');
  toast('Selected high-score candidates',selected+' products','ok');
}
function runEbayDiscovery(){
  var profile=document.getElementById('ebayDiscoveryProfile').value||'starter-safe';
  var category=document.getElementById('ebayDiscoveryCategory').value||'custom';
  var q=document.getElementById('ebayDiscoveryQuery').value.trim();
  if(profile==='custom'&&!q)return toast('Enter keywords','Custom eBay Discovery needs keywords.','warn');
  var auto=document.getElementById('ebayDiscoveryAuto').checked;
  var body={
    profileKey:profile,
    categoryKey:category,
    marketKey:document.getElementById('ebayDiscoveryMarket').value||'de',
    query:q||undefined,
    categoryId:document.getElementById('ebayDiscoveryCategoryId').value.trim()||undefined,
    limit:Number(document.getElementById('ebayDiscoveryLimit').value||25),
    queryBreadth:document.getElementById('ebayDiscoveryQueryBreadth').value||'BALANCED',
    mode:auto?'AUTO':'MANUAL',
    autoCompare:auto,
    compareLimit:Number(document.getElementById('ebayDiscoveryCompareLimit').value||10),
    amazonMatchLimit:Number(document.getElementById('ebayDiscoveryAmazonMatches').value||3),
    comparison:ebayDiscoveryComparisonPayload(),
    safeMode:document.getElementById('ebayDiscoverySafeMode').checked,
    minEbayScore:Number(document.getElementById('ebayDiscoveryMinScore').value||50),
    minSoldPrice:Number(document.getElementById('ebayDiscoveryMinSold').value||0),
    maxSoldPrice:Number(document.getElementById('ebayDiscoveryMaxSold').value||250),
    soldOnly:document.getElementById('ebayDiscoverySoldOnly').checked,
    completedOnly:document.getElementById('ebayDiscoveryCompletedOnly').checked,
    buyingFormat:document.getElementById('ebayDiscoveryBuyingFormat').value||'BIN',
    itemCondition:document.getElementById('ebayDiscoveryCondition').value||'NEW',
    preferredLocation:document.getElementById('ebayDiscoveryLocation').value||'Domestic',
    postalCode:document.getElementById('ebayDiscoveryPostalCode').value.trim()||undefined,
    skipExistingProducts:document.getElementById('ebayDiscoverySkipExisting').checked
  };
  toast('Running eBay Discovery',profile+' · '+category);
  jpost('/ebay-discovery/run',body).then(function(res){
    state.ebayDiscoveryRunId=res.run&&res.run.id;
    state.selectedEbay={};
    renderEbayDiscoveryReport((res.run&&res.run.candidates)||[],res.rejected||[],false);
    document.getElementById('ebayDiscoverySummary').textContent='Scanned '+(res.summary.scanned||0)+' · accepted '+(res.summary.accepted||0)+' · review '+(res.summary.manualReviews||0)+' · source dropped '+(res.summary.sourceDropped||0)+' · auctions '+(res.summary.auctionDropped||0)+' · no price '+(res.summary.missingPriceDropped||0)+' · rejected '+(res.summary.rejected||0)+' · skipped known '+(res.summary.skippedExisting||0)+' · compared '+(res.summary.compared||0)+' · opportunities '+(res.summary.opportunities||0);
    renderEbayCompactProducts((res.run&&res.run.candidates)||[]);
    toast('eBay Discovery complete',{summary:res.summary,rejectionBreakdown:res.rejectionBreakdown||[]},'ok');
    loadKeepaTokenStatus();
    load();
  }).catch(function(e){renderKeepaTokenFromPayload(e.payload);loadKeepaTokenStatus();toast('eBay Discovery failed',e.message,'err')});
}
function compareSelectedEbay(){
  var ids=selectedEbayIds();
  if(!ids.length)return toast('No accepted candidates selected','Only accepted eBay candidates can be compared with Amazon.','warn');
  toast('Comparing with Amazon',ids.length+' selected products');
  jpost('/ebay-discovery/compare',{candidateIds:ids,limit:ids.length,marketKey:document.getElementById('ebayDiscoveryMarket').value||'de',amazonMatchLimit:Number(document.getElementById('ebayDiscoveryAmazonMatches').value||3),comparison:ebayDiscoveryComparisonPayload()}).then(function(res){
    toast('Amazon comparison complete',{compared:res.compared,opportunities:(res.opportunities||[]).length,manualReviews:(res.manualReviews||[]).length,rejected:(res.rejected||[]).length},'ok');
    state.ebayDiscoveryCandidates=[];
    state.ebayDiscoveryReview=[];
    state.ebayDiscoveryRejected=[];
    state.selectedEbay={};
    load();
  }).catch(function(e){toast('Comparison failed',e.message,'err')});
}
function recompareEbayCandidate(id){
  toast('Recomparing with Amazon','Using the current comparison gates');
  jpost('/ebay-discovery/compare',{candidateIds:[id],limit:1,force:true,marketKey:document.getElementById('ebayDiscoveryMarket').value||'de',amazonMatchLimit:Number(document.getElementById('ebayDiscoveryAmazonMatches').value||3),comparison:ebayDiscoveryComparisonPayload()}).then(function(res){
    toast('Recompare complete',{compared:res.compared,opportunities:(res.opportunities||[]).length,manualReviews:(res.manualReviews||[]).length,rejected:(res.rejected||[]).length},'ok');
    state.ebayDiscoveryCandidates=[];state.ebayDiscoveryReview=[];state.ebayDiscoveryRejected=[];state.selectedEbay={};
    load();
  }).catch(function(e){toast('Recompare failed',e.message,'err')});
}
function considerEbayCandidate(id){
  toast('Adding to review','Creating a manual review action');
  jpost('/ebay-discovery/consider',{candidateId:id,note:'Added from eBay Discovery'},false).then(function(res){
    toast(res.alreadyConsidered?'Already in review':'Review item created',{productCandidateId:res.productCandidateId,amazonMatchId:res.amazonMatchId},'ok');
    state.ebayDiscoveryCandidates=[];state.ebayDiscoveryReview=[];state.ebayDiscoveryRejected=[];state.selectedEbay={};
    load();
  }).catch(function(e){toast('Review action failed',e.message,'err')});
}
function searchOpportunities(){
  var q=document.getElementById('searchQuery').value.trim();
  var profile=document.getElementById('scanProfile').value||'starter-safe';
  if(profile==='custom'&&!q)return toast('Enter keywords','Custom scans need a keyword.','warn');
  var body={
    profileKey:profile,
    query:q||undefined,
    limit:Number(document.getElementById('searchLimit').value||8),
    persist:document.getElementById('searchPersist').checked,
    safeMode:document.getElementById('scanSafeMode').checked,
    minScore:Number(document.getElementById('scanMinScore').value||65),
    maxAmazonCostUsd:Number(document.getElementById('scanMaxCost').value||150)
  };
  toast('Scanning',profile+(q?' · '+q:''));
  jpost('/opportunities/scan',body).then(function(res){renderScanResults(res);toast('Scan complete',res.summary,'ok');load()}).catch(function(e){toast('Scan failed',e.message,'err')})
}
  function createOrder(){var orderId=document.getElementById('orderEbayOrderId').value;if(!confirmAction('Create BUY action from this eBay order?',orderId||'New manual order'))return;jpost('/orders/ebay/manual',{ebayOrderId:orderId,ebayItemId:document.getElementById('orderEbayItemId').value,buyerName:document.getElementById('orderBuyerName').value,buyerShippingAddress:{enteredInDashboard:true},salePrice:Number(document.getElementById('orderSalePrice').value)}).then(function(res){toast('Order created',res,'ok');load()}).catch(function(e){toast('Create failed',e.message,'err')})}
  function recordPurchase(){var orderId=document.getElementById('purchaseOrderId').value;if(!confirmAction('Record this Amazon purchase?',orderId||'Selected internal order'))return;apiFetch('/orders/'+encodeURIComponent(orderId)+'/amazon-purchase',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({asin:document.getElementById('purchaseAsin').value,amazonOrderId:document.getElementById('purchaseAmazonOrderId').value,purchasePrice:Number(document.getElementById('purchasePrice').value),status:'PURCHASED'})}).then(responseJson).then(function(res){toast('Purchase recorded',res,'ok');load()}).catch(function(e){toast('Record failed',e.message,'err')})}

  document.getElementById('nav').addEventListener('click',function(e){var item=e.target.closest('.nav-item');if(item)navigate(item.getAttribute('data-view'))});
  document.getElementById('mobileNav').addEventListener('change',function(e){navigate(e.target.value)});
document.getElementById('scanProfile').addEventListener('change',renderProfiles);
document.getElementById('amazonScoutProfile').addEventListener('change',renderAmazonProfiles);
document.getElementById('amazonScoutCategory').addEventListener('change',renderAmazonProfiles);
document.getElementById('ebayDiscoveryProfile').addEventListener('change',renderEbayDiscoveryProfiles);
document.getElementById('ebayDiscoveryCategory').addEventListener('change',renderEbayDiscoveryProfiles);
document.getElementById('amazonScoutMarket').addEventListener('change',function(){
  var market=currentAmazonMarket();
  var postal=document.getElementById('amazonScoutPostalCode');
  if(postal&&market.defaultPostalCode&&!postal.dataset.touched)postal.value=market.defaultPostalCode;
});
document.getElementById('ebayDiscoveryMarket').addEventListener('change',function(){
  var market=currentEbayDiscoveryMarket();
  var postal=document.getElementById('ebayDiscoveryPostalCode');
  if(postal&&market.defaultPostalCode&&!postal.dataset.touched)postal.value=market.defaultPostalCode;
});
document.getElementById('amazonScoutEbayPreset').addEventListener('change',function(){applyEbayPreset(true)});
['amazonScoutEbayResults','amazonScoutMinProfit','amazonScoutMinRoi','amazonScoutMinMatch','amazonScoutMinCompareScore','amazonScoutBuyingFormat','amazonScoutCondition','amazonScoutLocation','amazonScoutPostalCode','amazonScoutSoldOnly','amazonScoutCompletedOnly'].forEach(function(id){
  var el=document.getElementById(id);
  if(el)el.addEventListener('change',function(){el.dataset.touched='1'});
});
['ebayDiscoveryPostalCode','ebayDiscoveryMinProfit','ebayDiscoveryMinRoi','ebayDiscoveryMinMatch','ebayDiscoveryMinCompareScore','ebayDiscoveryBuyingFormat','ebayDiscoveryCondition','ebayDiscoveryLocation','ebayDiscoverySoldOnly','ebayDiscoveryCompletedOnly'].forEach(function(id){
  var el=document.getElementById(id);
  if(el)el.addEventListener('change',function(){el.dataset.touched='1'});
});
loadProfiles();
loadAmazonProfiles();
loadEbayDiscoveryProfiles();
loadKeepaTokenStatus();
updateAmazonScoutActions();
updateEbayDiscoveryActions();
load();
setInterval(checkDb,30000);
setInterval(loadKeepaTokenStatus,60000);
</script>
</body>
</html>`;

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => reply.type('text/html').send(dashboardHtml));
  app.get('/favicon.ico', async (_request, reply) => reply.status(204).send(null));
}
