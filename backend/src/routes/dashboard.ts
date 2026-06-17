import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { getDashboardData } from '../repositories/dashboardRepository.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { runAmazonPriceMonitor } from '../services/amazonPriceMonitor.js';

const settingsSchema = z.object({
  minimumProfitUsd: z.number().positive().optional(),
  minimumRoiPercent: z.number().positive().optional(),
  minimumMatchConfidence: z.number().min(0).max(1).optional(),
  estimatedSalesTaxRate: z.number().min(0).max(1).optional(),
  returnRiskBuffer: z.number().min(0).optional(),
  priceChangeBuffer: z.number().min(0).optional(),
  maxDailyListings: z.number().int().positive().optional(),
  maxDailyPurchaseAmountUsd: z.number().positive().optional(),
  safeMode: z.boolean().optional(),
  maxAmazonCostUsd: z.number().positive().optional(),
  minimumOpportunityScore: z.number().int().min(0).max(100).optional(),
  blockedCategories: z.array(z.string()).optional(),
  blockedKeywords: z.array(z.string()).optional(),
  allowedCategories: z.array(z.string()).optional(),
  amazonPriceCheckIntervalMinutes: z.number().int().positive().optional()
});

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
    /* Panels */
    .panel{background:linear-gradient(180deg,var(--panel),var(--bg-2));border:1px solid var(--border);
      border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
    .panel-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border)}
    .panel-head h2{margin:0;font-size:15px;font-weight:700}
    .panel-head .hint{color:var(--muted);font-size:12px;font-weight:500}
    .panel-body{padding:16px 18px}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:22px}
    @media(max-width:960px){.grid-2{grid-template-columns:1fr}.layout{grid-template-columns:1fr}aside{display:none}}
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
    .result-head{display:flex;gap:12px;align-items:flex-start}
    .result-main{min-width:0;flex:1}.result-title{font-weight:700}.result-meta{color:var(--muted);font-size:12px;margin-top:3px}
    .chips{display:flex;gap:6px;flex-wrap:wrap}.chip{font-size:11px;font-weight:700;border-radius:999px;padding:3px 8px;border:1px solid var(--border-strong);color:var(--muted)}
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
      <div class="nav-item" data-view="catalog"><span class="ic">◳</span> Listings &amp; Orders</div>
      <div class="nav-item" data-view="discovery"><span class="ic">⌕</span> Discovery</div>
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
              <button class="btn ghost" onclick="rejectAction()">✕ Reject</button>
              <span class="selected-tag" id="selTag"></span>
            </div>
            <div class="table-wrap"><div id="actionsTable"></div></div>
          </div>
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
          <div class="panel-head"><h2>Amazon Scout</h2><span class="hint">Find promising Amazon products before spending eBay checks</span></div>
          <div class="panel-body">
            <div class="form-grid">
              <div class="field"><label>Scout Profile</label><select id="amazonScoutProfile"></select></div>
              <div class="field"><label>Category</label><select id="amazonScoutCategory"></select></div>
              <div class="field" style="grid-column:span 2"><label>Optional Amazon Keywords</label><input id="amazonScoutQuery" placeholder="thermal label printer"></div>
              <div class="field"><label>Max Products</label><input id="amazonScoutLimit" type="number" min="1" max="100" value="40"></div>
              <div class="field"><label>Min Amazon Score</label><input id="amazonScoutMinScore" type="number" min="0" max="100" value="62"></div>
              <div class="field"><label>Max Amazon Cost</label><input id="amazonScoutMaxCost" type="number" min="1" step="1" value="150"></div>
              <div class="field"><label>Min Price Drop %</label><input id="amazonScoutMinDrop" type="number" min="0" max="100" step="1" value="5"></div>
              <div class="field"><label>Compare Limit</label><input id="amazonScoutCompareLimit" type="number" min="1" max="50" value="12"></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="amazonScoutSafeMode" type="checkbox" checked> Safe mode</label></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="amazonScoutAuto" type="checkbox"> Auto compare top candidates</label></div>
            </div>
            <div class="actions-row">
              <button class="btn primary" onclick="runAmazonScout()">Find Amazon Candidates</button>
              <button class="btn" onclick="selectHighAmazonScores()">Select High Score</button>
              <button class="btn primary" onclick="compareSelectedAmazon()">Compare Selected With eBay</button>
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
              <div class="field"><label>Min Score</label><input id="scanMinScore" type="number" min="0" max="100" value="65"></div>
              <div class="field"><label>Max Amazon Cost</label><input id="scanMaxCost" type="number" min="1" step="1" value="150"></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="scanSafeMode" type="checkbox" checked> Safe mode</label></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input id="searchPersist" type="checkbox" checked> Save accepted</label></div>
            </div>
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

      <!-- API KEYS -->
      <section class="view" id="view-keys">
        <div class="banner" id="keysLocked" style="display:none;background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.35);color:#fde68a">
          <span>🔒</span><span>These routes are protected. Set the Local Agent Shared Secret under <b>Settings → Local Agent Connection</b> to save changes.</span>
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
var state={data:null,profiles:[],amazonProfiles:[],amazonScoutRunId:null,amazonScoutCandidates:[],selectedAmazon:{}};
var META={
  overview:['Overview','Live snapshot of your arbitrage pipeline'],
  actions:['Actions','Approve, execute, and protect your listings'],
  catalog:['Listings & Orders','Manage marketplace inventory and fulfillment'],
  discovery:['Discovery','Scout Amazon first, then compare selected products with eBay'],
  keys:['API Keys & Credentials','Encrypted at rest, stored in your database'],
  settings:['Settings','Thresholds, intervals, and connections']
};
var BADGE={
  PENDING:'amber',APPROVED:'blue',COMPLETED:'green',REJECTED:'slate',CANCELLED:'red',ERROR:'red',
  ACTIVE:'green',PAUSED:'amber',DRAFT:'slate',ENDED:'slate',
  NEW:'blue',VALIDATING:'amber',READY_FOR_PURCHASE:'blue',MANUAL_REVIEW:'amber',PURCHASED:'green',SHIPPED:'teal',
  LIST:'blue',REPRICE:'teal',PAUSE:'amber',BUY:'green',REVIEW:'slate',
  PASS:'green',WARN:'amber',REJECT:'red',RUNNING:'blue',NOT_COMPARED:'slate',COMPARING:'blue',OPPORTUNITY:'green'
};
var COLORS={green:'#34d399',amber:'#fbbf24',red:'#f87171',blue:'#60a5fa',slate:'#94a3b8',teal:'#2dd4bf'};

function authHeaders(){var s=localStorage.getItem('localAgentSecret');return s?{'x-local-agent-secret':s}:{}}
function apiFetch(url,options){options=options||{};var h=Object.assign({},options.headers||{},authHeaders());return fetch(url,Object.assign({},options,{headers:h}))}
function jpost(url,body,auth){var h={'content-type':'application/json'};if(auth)h=Object.assign(h,authHeaders());return fetch(url,{method:'POST',headers:h,body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return{error:'HTTP '+r.status}}).then(function(j){if(!r.ok){var m=j.error||('HTTP '+r.status);if(j.details)m+='\\n'+(typeof j.details==='string'?j.details:JSON.stringify(j.details));throw new Error(m)}return j})})}

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
function loadAmazonProfiles(){
  fetch('/amazon-discovery/profiles').then(function(r){return r.json()}).then(function(j){state.amazonProfiles=j.profiles||[];renderAmazonProfiles()}).catch(function(){});
}
function scoreClass(score){return score>=75?'score':score>=60?'score mid':'score low'}
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
function renderAmazonScoutCandidates(candidates){
  state.amazonScoutCandidates=candidates||[];
  if(!state.amazonScoutCandidates.length){
    document.getElementById('amazonScoutResults').innerHTML='<div class="empty">No Amazon candidates yet.</div>';
    return;
  }
  document.getElementById('amazonScoutResults').innerHTML=state.amazonScoutCandidates.map(function(c){
    var selected=!!state.selectedAmazon[c.id]||!!c.selected;
    var price=c.buyBoxPrice||c.currentPrice;
    var score=c.amazonScore!==undefined?c.amazonScore:(c.score&&c.score.total)||0;
    var scoreData=c.scoreBreakdown||c.score||{};
    var reasons=(scoreData.reasons||[]).slice(0,3).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
    var risks=(Array.isArray(c.riskFlags)?c.riskFlags:[]).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
    var drop=c.priceDropPercent?(' · Down '+Number(c.priceDropPercent).toFixed(1)+'%'):'';
    return '<div class="result-card"><div class="result-head"><label class="check"><input type="checkbox" data-amazon-id="'+esc(c.id)+'" '+(selected?'checked':'')+' onchange="toggleAmazonCandidate(this)"></label><div class="'+scoreClass(score)+'">'+score+'</div><div class="result-main">'+
      '<div class="result-title">'+esc(c.title||c.amazon?.title||'Amazon product')+'</div>'+
      '<div class="result-meta">ASIN <span class="mono">'+esc(c.asin||c.amazon?.asin||'')+'</span> · Amazon '+money(price)+' · Avg90 '+money(c.avg90Price)+' · Rank '+txt(c.salesRank)+drop+'</div>'+
      '</div>'+badge(c.comparisonStatus||c.safetyStatus||'PASS')+'</div>'+
      '<div class="chips">'+(reasons||'<span class="chip">Amazon-only candidate</span>')+'</div>'+
      (risks?'<div class="chips">'+risks+'</div>':'')+'</div>';
  }).join('');
}

function render(){
  var d=state.data;if(!d)return;
  var icons={productCandidates:['🔎','rgba(99,102,241,.18)'],amazonMatches:['📦','rgba(34,211,238,.16)'],ebayListings:['🏷','rgba(52,211,153,.16)'],orders:['🧾','rgba(96,165,250,.16)'],actions:['⚡','rgba(251,191,36,.16)'],purchases:['💳','rgba(45,212,191,.16)'],discoveryScans:['⌕','rgba(45,212,191,.16)'],amazonScouts:['🧭','rgba(34,211,238,.16)']};
  var labels={productCandidates:'Candidates',amazonMatches:'Amazon Matches',ebayListings:'Listings',orders:'Orders',actions:'Actions',purchases:'Purchases',discoveryScans:'Scans',amazonScouts:'Amazon Scouts'};
  document.getElementById('stats').innerHTML=Object.keys(d.counts).map(function(k){
    var ic=icons[k]||['•','rgba(99,102,241,.18)'];
    return '<div class="stat" style="--gl:'+ic[1]+'"><div class="ic">'+ic[0]+'</div><div class="label">'+(labels[k]||k)+'</div><div class="count">'+d.counts[k]+'</div></div>';
  }).join('');

  var actCols=[
    {key:'id',label:'ID',fmt:function(v){return shortId(v)}},
    {key:'type',label:'Type',fmt:badge},
    {key:'status',label:'Status',fmt:badge},
    {key:'priority',label:'Pri'},
    {key:'reason',label:'Reason',cls:'truncate',fmt:function(v){return '<span class="truncate" title="'+esc(v||'')+'">'+txt(v)+'</span>'}},
    {key:'createdAt',label:'Created',fmt:when}
  ];
  document.getElementById('actionsTable').innerHTML=table(d.actions,actCols,{selectKey:'id'});
  document.getElementById('ovActions').innerHTML=table((d.actions||[]).slice(0,6),actCols,{selectKey:'id'});

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
    {key:'startedAt',label:'Started',fmt:when}
  ]);
  if((d.amazonDiscoveryCandidates||[]).length&&!state.amazonScoutCandidates.length)renderAmazonScoutCandidates(d.amazonDiscoveryCandidates);

  var rc=d.ruleConfig||{};
  if(rc.amazonPriceCheckIntervalMinutes)document.getElementById('interval').value=rc.amazonPriceCheckIntervalMinutes;
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
    document.getElementById('keysLocked').style.display='none';return r.json();
  }).then(function(j){if(j)renderCredentials(j.credentials)}).catch(function(e){document.getElementById('credsContainer').innerHTML='<div class="empty">Could not load credentials: '+esc(e.message)+'</div>'});
}
function putCred(key,value,okMsg){
  return apiFetch('/api/credentials/'+encodeURIComponent(key),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({value:value})}).then(function(r){
    if(r.status===401){document.getElementById('keysLocked').style.display='flex';throw new Error('Unauthorized — set the Local Agent Shared Secret in Settings')}
    return r.json();
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
  fetch('/api/dashboard').then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(data){
    state.data=data;document.getElementById('offline').classList.remove('show');render();
  }).catch(function(e){
    document.getElementById('offlineMsg').textContent='Could not load dashboard data: '+e.message+'. Check the database connection.';
    document.getElementById('offline').classList.add('show');
  });
}

function saveSecret(){localStorage.setItem('localAgentSecret',document.getElementById('agentSecret').value);toast('Secret saved','Stored in this browser.','ok')}
function clearSecret(){localStorage.removeItem('localAgentSecret');document.getElementById('agentSecret').value='';toast('Secret cleared',null,'ok')}
function saveInterval(){var v=Number(document.getElementById('interval').value);if(!v)return toast('Invalid interval',null,'warn');
  fetch('/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({amazonPriceCheckIntervalMinutes:v})}).then(function(r){return r.json()}).then(function(){toast('Interval saved',v+' minutes','ok');load()}).catch(function(e){toast('Save failed',e.message,'err')})}
function saveSafety(){
  var body={
    safeMode:document.getElementById('settingsSafeMode').checked,
    minimumOpportunityScore:Number(document.getElementById('settingsMinScore').value||65),
    maxAmazonCostUsd:Number(document.getElementById('settingsMaxCost').value||150),
    allowedCategories:lines(document.getElementById('settingsAllowedCategories').value),
    blockedCategories:lines(document.getElementById('settingsBlockedCategories').value),
    blockedKeywords:lines(document.getElementById('settingsBlockedKeywords').value)
  };
  fetch('/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()}).then(function(){toast('Safety rules saved',null,'ok');load()}).catch(function(e){toast('Save failed',e.message,'err')});
}
function runMonitor(){toast('Running price check','Scanning active listings…');
  jpost('/api/monitor/amazon-prices/run',{}).then(function(res){toast('Price check complete',res,'ok');load()}).catch(function(e){toast('Price check failed',e.message,'err')})}
function actId(){var id=document.getElementById('actionId').value.trim();if(!id)toast('No action selected','Click a row or paste an Action ID.','warn');return id}
function updateAction(status){var id=actId();if(!id)return;apiFetch('/actions/'+encodeURIComponent(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:status,reviewedBy:'dashboard'})}).then(function(r){return r.json()}).then(function(){toast('Action '+status.toLowerCase(),id,'ok');load()}).catch(function(e){toast('Update failed',e.message,'err')})}
function approveAction(){updateAction('APPROVED')}
function rejectAction(){updateAction('REJECTED')}
function executeAction(){var id=actId();if(!id)return;apiFetch('/actions/'+encodeURIComponent(id)+'/execute',{method:'POST'}).then(function(r){return r.json()}).then(function(res){toast('Action executed',res,'ok');load()}).catch(function(e){toast('Execute failed',e.message,'err')})}
function toggleAmazonCandidate(el){state.selectedAmazon[el.getAttribute('data-amazon-id')]=el.checked}
function selectedAmazonIds(){return Object.keys(state.selectedAmazon).filter(function(id){return state.selectedAmazon[id]})}
function selectHighAmazonScores(){
  state.selectedAmazon={};
  var min=Number(document.getElementById('amazonScoutMinScore').value||62);
  state.amazonScoutCandidates.forEach(function(c){if(Number(c.amazonScore||0)>=min&&c.comparisonStatus!=='OPPORTUNITY')state.selectedAmazon[c.id]=true});
  renderAmazonScoutCandidates(state.amazonScoutCandidates);
  toast('Selected high-score candidates',selectedAmazonIds().length+' products','ok');
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
    query:q||undefined,
    limit:Number(document.getElementById('amazonScoutLimit').value||40),
    mode:auto?'AUTO':'MANUAL',
    autoCompare:auto,
    compareLimit:Number(document.getElementById('amazonScoutCompareLimit').value||12),
    safeMode:document.getElementById('amazonScoutSafeMode').checked,
    minAmazonScore:Number(document.getElementById('amazonScoutMinScore').value||62),
    maxAmazonCostUsd:Number(document.getElementById('amazonScoutMaxCost').value||150),
    minPriceDropPercent:Number(document.getElementById('amazonScoutMinDrop').value||0)
  };
  toast('Running Amazon Scout',profile+' · '+category);
  jpost('/amazon-discovery/run',body).then(function(res){
    state.amazonScoutRunId=res.run&&res.run.id;
    state.selectedAmazon={};
    renderAmazonScoutCandidates((res.run&&res.run.candidates)||[]);
    document.getElementById('amazonScoutSummary').textContent='Scanned '+(res.summary.scanned||0)+' · accepted '+(res.summary.accepted||0)+' · rejected '+(res.summary.rejected||0)+' · compared '+(res.summary.compared||0)+' · opportunities '+(res.summary.opportunities||0);
    toast('Amazon Scout complete',res.summary,'ok');
    load();
  }).catch(function(e){toast('Amazon Scout failed',e.message,'err')});
}
function compareSelectedAmazon(){
  var ids=selectedAmazonIds();
  if(!ids.length)return toast('No Amazon candidates selected','Select products first.','warn');
  toast('Comparing with eBay',ids.length+' selected products');
  jpost('/amazon-discovery/compare',{candidateIds:ids,limit:ids.length}).then(function(res){
    toast('eBay comparison complete',{compared:res.compared,opportunities:(res.opportunities||[]).length,rejected:(res.rejected||[]).length},'ok');
    state.amazonScoutCandidates=[];
    state.selectedAmazon={};
    load();
  }).catch(function(e){toast('Comparison failed',e.message,'err')});
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
function createOrder(){jpost('/orders/ebay/manual',{ebayOrderId:document.getElementById('orderEbayOrderId').value,ebayItemId:document.getElementById('orderEbayItemId').value,buyerName:document.getElementById('orderBuyerName').value,buyerShippingAddress:{enteredInDashboard:true},salePrice:Number(document.getElementById('orderSalePrice').value)}).then(function(res){toast('Order created',res,'ok');load()}).catch(function(e){toast('Create failed',e.message,'err')})}
function recordPurchase(){apiFetch('/orders/'+encodeURIComponent(document.getElementById('purchaseOrderId').value)+'/amazon-purchase',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({asin:document.getElementById('purchaseAsin').value,amazonOrderId:document.getElementById('purchaseAmazonOrderId').value,purchasePrice:Number(document.getElementById('purchasePrice').value),status:'PURCHASED'})}).then(function(r){return r.json()}).then(function(res){toast('Purchase recorded',res,'ok');load()}).catch(function(e){toast('Record failed',e.message,'err')})}

document.getElementById('nav').addEventListener('click',function(e){var item=e.target.closest('.nav-item');if(item)navigate(item.getAttribute('data-view'))});
document.getElementById('scanProfile').addEventListener('change',renderProfiles);
document.getElementById('amazonScoutProfile').addEventListener('change',renderAmazonProfiles);
document.getElementById('amazonScoutCategory').addEventListener('change',renderAmazonProfiles);
loadProfiles();
loadAmazonProfiles();
load();
setInterval(checkDb,30000);
</script>
</body>
</html>`;

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => reply.type('text/html').send(dashboardHtml));
  app.get('/favicon.ico', async (_request, reply) => reply.status(204).send(null));
  app.get('/api/dashboard', async () => getDashboardData(prisma));
  app.get('/api/health/db', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { connected: true };
    } catch (error) {
      return { connected: false, error: error instanceof Error ? error.message : 'Database unavailable' };
    }
  });
  app.get('/api/settings', async () => getActiveRuleConfig(prisma));
  app.patch('/api/settings', async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid settings payload', details: parsed.error.flatten() });
    const existing = await prisma.ruleConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } });
    const decimalKeys = new Set(['minimumProfitUsd', 'minimumRoiPercent', 'minimumMatchConfidence', 'estimatedSalesTaxRate', 'returnRiskBuffer', 'priceChangeBuffer', 'maxDailyPurchaseAmountUsd', 'maxAmazonCostUsd']);
    const data = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, typeof value === 'number' && decimalKeys.has(key) ? String(value) : value]));
    const ruleConfig = existing
      ? await prisma.ruleConfig.update({ where: { id: existing.id }, data })
      : await prisma.ruleConfig.create({ data: { id: 'default-rule-config', name: 'default', active: true, ...data } });
    return { ruleConfig };
  });
  app.post('/api/monitor/amazon-prices/run', async () => runAmazonPriceMonitor(prisma));
}
