import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import {
  clearDashboardSessionHeaders,
  createDashboardSessionHeaders,
  revokeDashboardSessionRequest,
  setCookieHeaders,
  verifyDashboardSessionRequest
} from '../security/dashboardSession.js';

const dashboardLoginHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Buysell Sign In</title>
  <style>
    :root{color-scheme:dark;--bg:#08111f;--panel:#111b2b;--border:rgba(148,163,184,.24);--text:#e8eefc;--muted:#94a3b8;--brand:#0ea5e9;--red:#f87171}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);padding:24px}
    .login{width:min(420px,100%);border:1px solid var(--border);background:var(--panel);border-radius:8px;padding:24px;box-shadow:0 18px 40px -20px rgba(0,0,0,.65)}
    h1{font-size:22px;margin:0 0 8px}p{color:var(--muted);line-height:1.5;margin:0 0 18px}label{display:block;font-size:12px;font-weight:800;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
    input{width:100%;height:42px;border:1px solid var(--border);border-radius:6px;background:#0d1828;color:var(--text);padding:0 12px;font-size:14px}
    button{height:42px;border:0;border-radius:6px;background:var(--brand);color:white;font-weight:800;padding:0 16px;margin-top:14px;cursor:pointer;width:100%}
    .error{display:none;color:#fecaca;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.35);padding:10px 12px;border-radius:6px;margin-top:14px;font-size:13px}
  </style>
</head>
<body>
  <main class="login">
    <h1>Buysell Control Center</h1>
    <p>Sign in with the configured local-agent shared secret. The dashboard will use a short-lived HttpOnly session after this step.</p>
    <form id="loginForm">
      <label for="secret">Shared Secret</label>
      <input id="secret" name="secret" type="password" autocomplete="current-password" autofocus />
      <button type="submit">Sign In</button>
      <div class="error" id="error"></div>
    </form>
  </main>
  <script>
    document.getElementById('loginForm').addEventListener('submit',function(event){
      event.preventDefault();
      var error=document.getElementById('error');
      error.style.display='none';
      fetch('/dashboard/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:document.getElementById('secret').value})})
        .then(function(response){return response.json().catch(function(){return{error:'HTTP '+response.status}}).then(function(body){if(!response.ok)throw new Error(body.error||('HTTP '+response.status));return body})})
        .then(function(){window.location.href='/'})
        .catch(function(err){error.textContent=err.message;error.style.display='block'});
    });
  </script>
</body>
</html>`;

const loginBodySchema = z.object({ secret: z.string().min(1) });

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
      --bg:#08111f;--bg-2:#0d1828;--panel:#111b2b;--panel-2:#172438;
      --border:rgba(148,163,184,.14);--border-strong:rgba(148,163,184,.28);
      --text:#e8eefc;--muted:#94a3b8;--faint:#7e8da2;
      --brand:#0ea5e9;--brand-2:#14b8a6;--accent:#2dd4bf;
      --green:#34d399;--amber:#fbbf24;--red:#f87171;--blue:#60a5fa;--slate:#94a3b8;--teal:#2dd4bf;
      --shadow:0 18px 40px -20px rgba(0,0,0,.65);
    }
    *{box-sizing:border-box}
    html,body{height:100%}
    body{margin:0;font-family:'Inter',system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:var(--text);
      background:radial-gradient(1200px 700px at 80% -10%,rgba(20,184,166,.11),transparent 60%),
                 radial-gradient(900px 600px at -10% 10%,rgba(14,165,233,.10),transparent 55%),
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
      color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 8px 20px -6px rgba(14,165,233,.55)}
    .brand b{font-size:16px;letter-spacing:.2px}.brand span{display:block;color:var(--muted);font-size:11px;font-weight:500}
    nav{display:flex;flex-direction:column;gap:4px;margin-top:4px}
    .nav-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;color:var(--muted);
      cursor:pointer;font-weight:500;border:1px solid transparent;transition:.15s}
    .nav-item:hover{background:rgba(148,163,184,.07);color:var(--text)}
    .nav-item.active{background:linear-gradient(135deg,rgba(14,165,233,.22),rgba(20,184,166,.14));
      color:#fff;border-color:var(--border-strong)}
    .nav-item .ic{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:800;color:var(--muted);background:rgba(148,163,184,.08)}
    .nav-item.active .ic{color:#fff;background:rgba(255,255,255,.12)}
    .side-foot{margin-top:auto;padding:12px 10px 4px;border-top:1px solid var(--border);color:var(--faint);font-size:11px}
    /* Main */
    main{padding:0 0 60px}
    .topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:16px;
      padding:16px 28px;border-bottom:1px solid var(--border);
      background:linear-gradient(180deg,rgba(11,17,32,.92),rgba(11,17,32,.72));backdrop-filter:blur(10px)}
    .topbar h1{margin:0;font-size:18px;font-weight:700}
    .topbar .sub{color:var(--muted);font-size:12px}
    .job-headline{display:none;align-items:center;gap:8px;margin-top:7px;font-size:12px;font-weight:800;max-width:760px;color:var(--muted)}
    .job-headline.show{display:flex}
    .job-headline .job-dot{width:9px;height:9px;border-radius:50%;background:currentColor;flex:0 0 9px}
    .job-headline.running{color:var(--blue)}
    .job-headline.running .job-dot{animation:pulseBlue 1.6s infinite}
    .job-headline.paused{color:var(--amber)}
    .job-headline.idle{color:var(--slate);font-weight:700}
    .spacer{flex:1}
    .pill{display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:999px;
      border:1px solid var(--border-strong);background:rgba(17,26,46,.6);font-size:12px;font-weight:600;color:var(--muted)}
    .mobile-nav{display:none;margin-top:10px}
    .dot{width:9px;height:9px;border-radius:50%;background:var(--faint);box-shadow:0 0 0 0 rgba(52,211,153,.5)}
    .dot.on{background:var(--green);animation:pulse 2s infinite}
    .dot.off{background:var(--red)}
    @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.45)}70%{box-shadow:0 0 0 7px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
    @keyframes pulseBlue{0%{box-shadow:0 0 0 0 rgba(96,165,250,.55)}70%{box-shadow:0 0 0 8px rgba(96,165,250,0)}100%{box-shadow:0 0 0 0 rgba(96,165,250,0)}}
    .btn{display:inline-flex;align-items:center;gap:8px;cursor:pointer;border-radius:10px;
      border:1px solid var(--border-strong);padding:9px 14px;font-weight:600;font-size:13px;color:var(--text);
      background:rgba(148,163,184,.06);transition:.15s;font-family:inherit}
    .btn:hover{background:rgba(148,163,184,.13);transform:translateY(-1px)}
    .btn:active{transform:translateY(0)}
    .btn.primary{background:linear-gradient(135deg,var(--brand),var(--brand-2));border-color:transparent;
      box-shadow:0 10px 24px -10px rgba(14,165,233,.65);color:#fff}
    .btn.primary:hover{filter:brightness(1.08)}
    .btn:disabled{cursor:not-allowed;opacity:.5;transform:none;filter:none}
    .btn:disabled:hover{background:rgba(148,163,184,.06);transform:none;filter:none}
    .btn.danger{background:linear-gradient(135deg,#ef4444,#f97316);border-color:transparent;color:#fff}
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
    .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .hidden{display:none!important}
    .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
    .tab-btn{border:1px solid var(--border-strong);background:rgba(148,163,184,.06);color:var(--muted);border-radius:10px;padding:8px 12px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}
    .tab-btn.active{background:rgba(14,165,233,.16);color:var(--text);border-color:rgba(14,165,233,.34)}
    .discover-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}
    .discover-tab{min-height:52px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:12px;padding:12px 14px;font-size:13px;color:var(--text);background:rgba(148,163,184,.07)}
    .discover-tab.active{background:linear-gradient(135deg,var(--brand),var(--brand-2));border-color:transparent;color:#fff;box-shadow:0 10px 24px -12px rgba(14,165,233,.72)}
    .discover-tab:not(.active):hover{background:rgba(148,163,184,.13);border-color:var(--border-strong)}
    .discover-controls{margin-top:14px}
    .discover-controls .discover-command{padding-top:2px}
    .discover-command{display:none}
    .discover-command.active{display:block}
    .discover-mode-panel{display:none}
    .discover-mode-panel.active{display:block}
    .discover-command-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;align-items:end}
    .discover-primary-field{grid-column:span 2}
    .discover-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(126px,1fr));gap:10px}
    .discover-metric{border:1px solid var(--border);border-radius:12px;background:rgba(2,6,23,.24);padding:11px 12px;min-height:74px}
    .discover-metric-value{font-size:22px;font-weight:800;line-height:1;color:var(--text)}
    .discover-metric-label{margin-top:7px;color:var(--muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
    .discover-workbench{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.7fr);gap:14px;align-items:start}
    .discover-main,.discover-side{display:grid;gap:14px;min-width:0}
    .discover-side{position:sticky;top:92px;height:calc(100vh - 124px);grid-template-rows:minmax(320px,1fr) minmax(150px,.45fr);align-self:start;min-height:0}
    .discover-panel-head{display:flex;align-items:center;gap:10px;margin-bottom:12px;min-width:0}
    .discover-panel-head h3{margin:0;font-size:14px}
    .discover-panel-head .hint{color:var(--muted);font-size:12px}
    .discover-inspector,.discover-activity{min-height:0;display:flex;flex-direction:column;overflow:hidden}
    .discover-inspector .discover-panel-head,.discover-activity .discover-panel-head{flex:0 0 auto}
    #discoverInspector,#discoverActivityTimeline{min-height:0;overflow:auto;overscroll-behavior:contain;padding-right:2px}
    #discoverInspector{flex:1}
    #discoverActivityTimeline{flex:1}
    .inspector-title{font-weight:800;font-size:15px;line-height:1.35}
    .inspector-meta{color:var(--muted);font-size:12px;margin-top:4px}
    .inspector-section{border-top:1px solid var(--border);padding-top:11px;margin-top:11px;display:grid;gap:8px}
    .inspector-section-title{font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.5px}
    .queue-row{width:100%;border:1px solid var(--border);border-radius:10px;background:rgba(2,6,23,.26);padding:11px;display:grid;grid-template-columns:42px minmax(0,1fr) minmax(126px,auto);gap:10px;align-items:start;color:var(--text);font:inherit;text-align:left;cursor:pointer}
    .queue-row:hover,.queue-row.active{border-color:var(--border-strong);background:rgba(15,23,42,.62)}
    .queue-row.active{border-color:rgba(45,212,191,.58);box-shadow:inset 3px 0 0 var(--accent),0 12px 28px -24px rgba(45,212,191,.8)}
    .queue-row:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    .queue-copy{min-width:0;display:grid;gap:4px}
    .queue-title{font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .queue-meta{color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
    .queue-reason{color:var(--text);font-size:12px;line-height:1.38;overflow-wrap:anywhere}
    .queue-reason span{color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.45px;margin-right:5px}
    .queue-stats{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:flex-start;min-width:max-content}
    .queue-time{font-size:11px;color:var(--muted);width:100%;text-align:right}
    .activity-list{display:grid;gap:8px}
    .activity-row{border:1px solid var(--border);border-radius:10px;background:rgba(2,6,23,.22);padding:10px;display:grid;gap:6px}
    .activity-row-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .activity-title{font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .activity-meta{color:var(--muted);font-size:12px}
    .advanced-data{margin-top:0}
    .setup-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
    .setup-card{border:1px solid var(--border);background:rgba(2,6,23,.24);border-radius:12px;padding:13px;display:grid;gap:8px}
    .setup-card .setup-status{display:inline-flex;width:max-content;align-items:center;gap:6px;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800;border:1px solid var(--border-strong);color:var(--muted)}
    .setup-card.ok .setup-status{color:var(--green);border-color:rgba(52,211,153,.35);background:rgba(52,211,153,.08)}
    .setup-card.warn .setup-status{color:var(--amber);border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.08)}
    .setup-card.err .setup-status{color:var(--red);border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.08)}
    .setup-title{font-weight:800}.setup-copy{color:var(--muted);font-size:12px}
    .workflow-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}
    .workflow-step{border:1px solid var(--border);border-radius:12px;padding:10px;background:rgba(2,6,23,.22);min-height:88px}
    .workflow-step b{display:block;font-size:13px;margin-bottom:4px}.workflow-step span{display:block;color:var(--muted);font-size:11px}
    .primary-flow{border-color:rgba(14,165,233,.35);background:rgba(14,165,233,.08)}
    .decision-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:rgba(2,6,23,.22);margin-bottom:12px}
    .decision-row b{display:block}.decision-row span{display:block;color:var(--muted);font-size:12px}
    .compact-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;align-items:end}
    .schedule-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:end}
    .subtle-box{border:1px solid var(--border);border-radius:12px;background:rgba(2,6,23,.18);padding:14px}
    .danger-zone{border-color:rgba(248,113,113,.28);background:rgba(127,29,29,.08)}
    @media(max-width:960px){
      .grid-2,.grid-3,.workflow-steps{grid-template-columns:1fr}.layout{grid-template-columns:1fr}aside{display:none}
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
    .result-card.workbench-card{cursor:pointer}
    .result-card.workbench-card.active{border-color:var(--border-strong);background:rgba(15,23,42,.62)}
    .result-card.rejected{border-color:rgba(248,113,113,.32);background:rgba(127,29,29,.08)}
    .result-card.review{border-color:rgba(251,191,36,.36);background:rgba(120,53,15,.10)}
    .result-card.error{border-color:rgba(248,113,113,.44);background:rgba(127,29,29,.12)}
    .result-head{display:flex;gap:12px;align-items:flex-start}
    .result-main{min-width:0;flex:1}.result-title{font-weight:700}.result-meta{color:var(--muted);font-size:12px;margin-top:3px}
    .chips{display:flex;gap:6px;flex-wrap:wrap;min-width:0}.chip{font-size:11px;font-weight:700;border-radius:999px;padding:3px 8px;border:1px solid var(--border-strong);color:var(--muted);max-width:100%;overflow-wrap:anywhere}
    .section-label{display:flex;align-items:center;gap:8px;color:var(--text);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin:2px 0}
    .section-label span{color:var(--muted);font-weight:700;text-transform:none;letter-spacing:0}
    .result-section{border:1px solid var(--border);border-radius:12px;background:rgba(2,6,23,.22);overflow:hidden}
    .result-section summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
    .result-section summary::-webkit-details-marker{display:none}
    .result-section summary::after{content:'+';margin-left:auto;color:var(--muted);font-size:15px;line-height:1}
    .result-section[open] summary{border-bottom:1px solid var(--border)}
    .result-section[open] summary::after{content:'-'}
    .section-help{color:var(--muted);font-weight:600;text-transform:none;letter-spacing:0}
    .result-section-body{display:grid;gap:12px;padding:12px}
    .mini-summary{display:flex;gap:8px;flex-wrap:wrap;align-items:center;color:var(--muted);font-size:12px;padding:8px 0}
    .job-status-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0 0}
    .job-status-card{border:1px solid var(--border);border-radius:12px;background:rgba(2,6,23,.22);padding:12px;min-width:0}
    .job-status-card.running{border-color:rgba(96,165,250,.35);background:rgba(37,99,235,.09)}
    .job-status-card.paused{border-color:rgba(251,191,36,.35);background:rgba(120,53,15,.11)}
    .job-status-card.stopped{border-color:rgba(148,163,184,.22);background:rgba(15,23,42,.42)}
    .job-status-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
    .job-status-count{display:inline-grid;place-items:center;min-width:24px;height:24px;border-radius:999px;border:1px solid var(--border-strong);color:var(--text);font-size:11px}
    .job-status-list{display:grid;gap:7px;margin-top:10px}
    .job-status-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border-top:1px solid var(--border);padding-top:7px}
    .job-status-row:first-child{border-top:none;padding-top:0}
    .job-status-title{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .job-status-meta{color:var(--muted);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .placeholder-check{width:20px;flex:0 0 20px}
    .comparison-box{border:1px solid var(--border);border-radius:10px;background:rgba(15,23,42,.48);padding:10px;display:grid;gap:7px;min-width:0}
    .comparison-box.locked{border-color:rgba(248,113,113,.28);background:rgba(127,29,29,.1)}
    .comparison-box.review{border-color:rgba(251,191,36,.35);background:rgba(120,53,15,.11)}
    .comparison-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;color:var(--text);min-width:0;flex-wrap:wrap}
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
    .table-summary{color:var(--muted);font-size:12px;padding:10px 12px;border-bottom:1px solid var(--border);background:rgba(2,6,23,.22)}
    .pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:12px;color:var(--muted);font-size:12px}
    .table-pager{padding:10px 12px;margin-top:0;border-top:1px solid var(--border);background:rgba(2,6,23,.18)}
    .pager .btn{min-width:34px;justify-content:center}
    .settings-group{margin-top:0;margin-bottom:12px}
    .settings-group:last-child{margin-bottom:0}
    @media(max-width:1100px){.discover-workbench{grid-template-columns:1fr}.discover-side{position:static;height:auto;max-height:none;grid-template-rows:auto}.discover-inspector,.discover-activity{overflow:visible}#discoverInspector,#discoverActivityTimeline{overflow:visible}}
    @media(max-width:920px){.compact-product summary{grid-template-columns:40px minmax(160px,1fr) 82px 80px}.compact-hide-sm{display:none}.job-status-grid{grid-template-columns:1fr}.queue-row{grid-template-columns:38px minmax(0,1fr)}.queue-stats{grid-column:1/-1;justify-content:flex-start}.queue-time{text-align:left}.discover-tabs{grid-template-columns:1fr}.discover-primary-field{grid-column:auto}}
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
    .banner.setup{background:rgba(251,191,36,.09);border-color:rgba(251,191,36,.32);color:#fde68a}
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
    /* Analytics + a11y (Slice 1) */
    .analytics-pl{margin-bottom:14px}
    .analytics-grid{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:14px}
    .analytics-card{border:1px solid var(--border);border-radius:12px;background:rgba(2,6,23,.24);padding:13px 14px;min-width:0}
    .analytics-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:11px;display:flex;align-items:center;gap:7px}
    .bs-funnel{display:grid;gap:9px}
    .bs-frow{display:grid;grid-template-columns:84px 1fr 44px;align-items:center;gap:9px}
    .bs-flabel{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bs-ftrack{height:14px;border-radius:5px;background:rgba(148,163,184,.12);overflow:hidden}
    .bs-fbar{height:100%;border-radius:5px}
    .bs-fval{font-size:12px;font-weight:700;text-align:right}
    .bs-fnote{margin-top:11px;font-size:11px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap}
    .bs-gauge{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:128px}
    .bs-gauge-sub{font-size:11px;color:var(--muted);text-align:center}
    .bs-donut-legend{display:grid;gap:6px;margin-top:10px;font-size:11px;color:var(--muted)}
    .bs-donut-legend span{display:inline-flex;align-items:center;gap:6px}
    .bs-dot{width:9px;height:9px;border-radius:3px;flex:0 0 9px}
    .bs-highlight{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center}
    .bs-conf{min-width:0}
    .bs-conf-head{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:5px}
    .bs-conf-track{height:8px;border-radius:5px;background:rgba(148,163,184,.14);overflow:hidden}
    .bs-conf-bar{display:block;height:100%;border-radius:5px}
    .bs-prof{text-align:right;white-space:nowrap}
    .bs-prof-main{font-size:20px;font-weight:800;line-height:1}
    .bs-prof-sub{font-size:11px;color:var(--muted);margin-top:3px}
    .notif{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:start;border:1px solid var(--border);border-left:3px solid var(--slate);border-radius:10px;background:rgba(2,6,23,.24);padding:10px 12px;margin-bottom:8px}
    .notif:last-child{margin-bottom:0}
    .notif-ic{display:flex;align-items:center;justify-content:center;padding-top:1px}
    .notif-main{min-width:0}
    .notif-title{font-weight:700;font-size:13px}
    .notif-msg{color:var(--muted);font-size:12px;margin-top:2px;overflow-wrap:anywhere}
    @media(max-width:960px){.analytics-grid{grid-template-columns:1fr}}
    .nav-item{border:0;background:transparent;width:100%;text-align:left;font:inherit;cursor:pointer}
    .nav-item:focus-visible,.btn:focus-visible,.tab-btn:focus-visible,.discover-tab:focus-visible,.mobile-nav:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
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
      <button type="button" class="nav-item active" data-view="overview" aria-current="page"><span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12 12 5l7 7"/><path d="M6 10.5V19a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-8.5"/></svg></span> Home</button>
      <button type="button" class="nav-item" data-view="ebayDiscovery"><span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-3.2-3.2"/></svg></span> Discover</button>
      <button type="button" class="nav-item" data-view="actions"><span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h9"/><path d="M10 12h9"/><path d="M10 18h9"/><path d="m4 6 1.2 1.2L7.5 5"/><path d="m4 12 1.2 1.2L7.5 11"/><path d="m4 18 1.2 1.2L7.5 17"/></svg></span> Review</button>
      <button type="button" class="nav-item" data-view="catalog"><span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 5 7.5v9L12 20l7-3.5v-9z"/><path d="M5 7.5 12 11l7-3.5"/><path d="M12 11v9"/></svg></span> Listings &amp; Orders</button>
      <button type="button" class="nav-item" data-view="automation"><span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="14" height="10" rx="2"/><path d="M12 9V5"/><circle cx="12" cy="4" r="1"/><path d="M9.5 13.5h.01"/><path d="M14.5 13.5h.01"/><path d="M9.5 16.5h5"/></svg></span> Automation</button>
      <button type="button" class="nav-item" data-view="settings"><span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/></svg></span> Settings</button>
    </nav>
    <div class="side-foot">
      API: <a href="/health">/health</a> · <a href="/api/dashboard">/api/dashboard</a><br>
      <span id="footVer">v0.1.0</span>
    </div>
  </aside>

  <main>
    <div class="topbar">
      <div>
        <h1 id="viewTitle">Home</h1>
        <div class="sub" id="viewSub">What needs attention and what is safe to do next</div>
        <div class="job-headline idle" id="jobHeadline"><span class="job-dot"></span><span id="jobHeadlineText">Checking jobs...</span></div>
        <select id="mobileNav" class="mobile-nav" aria-label="View">
          <option value="overview">Home</option>
          <option value="ebayDiscovery">Discover</option>
          <option value="actions">Review</option>
          <option value="catalog">Listings &amp; Orders</option>
          <option value="automation">Automation</option>
          <option value="settings">Settings</option>
        </select>
      </div>
      <div class="spacer"></div>
      <div class="pill"><span class="dot" id="dbDot"></span><span id="dbLabel">Checking DB…</span></div>
      <div class="pill" id="updatedPill">Updated —</div>
      <button class="btn primary" onclick="load()"><span>↻</span> Refresh</button>
    </div>

    <div class="content">
      <div class="banner setup" id="offline"><span>Setup</span><span id="offlineMsg">Complete setup before running protected workflows.</span></div>

      <!-- OVERVIEW -->
      <section class="view active" id="view-overview">
        <div class="panel" id="setupChecklist">
          <div class="panel-head"><h2>Setup Checklist</h2><span class="hint">Complete these before running discovery or marketplace actions.</span></div>
          <div class="panel-body">
            <div class="setup-grid">
              <div class="setup-card warn" id="setupDbCard">
                <div class="setup-status" id="setupDbStatus">Checking</div>
                <div class="setup-title">Connect the database</div>
                <div class="setup-copy" id="setupDbCopy">Postgres stores candidates, listings, credentials, and review history.</div>
              </div>
              <div class="setup-card warn" id="setupBackendSecretCard">
                <div class="setup-status" id="setupBackendSecretStatus">Checking</div>
                <div class="setup-title">Set the backend shared secret</div>
                <div class="setup-copy" id="setupBackendSecretCopy">Configure LOCAL_AGENT_SHARED_SECRET on the backend so protected routes can run.</div>
              </div>
              <div class="setup-card warn" id="setupBrowserSecretCard">
                <div class="setup-status" id="setupBrowserSecretStatus">Needed</div>
                <div class="setup-title">Save this browser's secret</div>
                <div class="setup-copy">Add the same shared secret under Settings so this dashboard can call protected routes.</div>
                <div><button class="btn sm" onclick="navigate('settings')">Open Settings</button></div>
              </div>
              <div class="setup-card warn" id="setupKeysCard">
                <div class="setup-status" id="setupKeysStatus">After secret</div>
                <div class="setup-title">Add marketplace keys</div>
                <div class="setup-copy">SerpAPI and Keepa are required for discovery; eBay credentials are required for inventory actions.</div>
              </div>
            </div>
          </div>
        </div>
        <div class="stats" id="stats"></div>
        <div class="panel" id="analyticsPanel">
          <div class="panel-head"><h2>Performance</h2><span class="hint">Realized P/L, discovery funnel, outcome split, and metered-API budget</span></div>
          <div class="panel-body">
            <div class="analytics-pl"><div class="analytics-title">Realized P/L &mdash; last 30 days<span id="plSource" class="bs-gauge-sub" style="margin-left:auto;text-align:right"></span></div><div id="plChart"></div></div>
            <div class="analytics-grid">
              <div class="analytics-card"><div class="analytics-title">Discovery funnel</div><div id="funnelChart"></div></div>
              <div class="analytics-card"><div class="analytics-title">Outcome split</div><div id="outcomeChart"></div></div>
              <div class="analytics-card"><div class="analytics-title">Keepa budget</div><div id="keepaGauge"></div></div>
            </div>
          </div>
        </div>
        <div class="panel" id="notificationsPanel">
          <div class="panel-head"><h2>Notifications</h2><span class="hint">Operational alerts &mdash; profitable opportunities, price-spike pauses, failed runs, low API budget</span><span class="spacer"></span><button class="btn sm" onclick="loadAlerts()">Refresh</button></div>
          <div class="panel-body"><div id="notificationsBox"><div class="empty">Loading notifications…</div></div></div>
        </div>
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
            <div class="panel-head"><h2>Needs Review</h2><span class="hint">Top pending decisions</span></div>
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
          <div class="panel-head"><h2>Review Queue</h2><span class="hint">Select one item, then choose the next safe action.</span></div>
          <div class="panel-body">
            <div class="decision-row">
              <div>
                <b id="reviewSelectionTitle">No action selected</b>
                <span id="reviewSelectionCopy">Click a queue row to approve, verify, draft, execute, complete, or reject it.</span>
              </div>
              <input id="actionId" placeholder="Action ID" oninput="updateActionButtons()" style="max-width:260px">
            </div>
            <div class="inline" style="margin-bottom:14px">
              <button class="btn requires-action" id="approveActionBtn" onclick="approveAction()" disabled>Approve</button>
              <button class="btn primary requires-action" id="executeActionBtn" onclick="executeAction()" disabled>Execute</button>
              <button class="btn requires-action" id="completeActionBtn" onclick="completeSelectedAction()" disabled>Complete</button>
              <button class="btn ghost requires-action" id="rejectActionBtn" onclick="rejectAction()" disabled>Reject</button>
              <span class="selected-tag" id="selTag"></span>
            </div>
            <div class="inline" style="margin-bottom:14px">
              <button class="btn requires-action" id="verifyActionBtn" onclick="queueAutomation('VERIFY')" disabled>Queue Verify</button>
              <button class="btn requires-action" id="draftActionBtn" onclick="queueAutomation('DRAFT')" disabled>Queue Draft</button>
              <button class="btn requires-action" id="assistedActionBtn" onclick="queueAutomation('ASSISTED')" disabled>Queue Assisted</button>
              <details class="advanced" style="margin:0;min-width:220px">
                <summary>High-risk mode</summary>
                <div class="subtle-box danger-zone">
                  <div class="result-meta">Autopilot can complete final marketplace actions only when the local agent is explicitly configured for it.</div>
                  <div class="actions-row"><button class="btn danger requires-action" id="autopilotActionBtn" onclick="queueAutomation('AUTOPILOT')" disabled>Queue Autopilot</button></div>
                </div>
              </details>
            </div>
            <div class="inline" style="margin-bottom:14px">
              <select id="feedbackType" style="max-width:190px">
                <option value="GOOD_OPPORTUNITY">Good opportunity</option>
                <option value="BAD_MATCH">Bad match</option>
                <option value="BAD_ECONOMICS">Bad economics</option>
                <option value="BAD_SOURCE">Bad source</option>
                <option value="NEEDS_REVIEW">Needs review</option>
              </select>
              <input id="feedbackReason" placeholder="Feedback note" style="max-width:320px">
              <button class="btn ghost requires-action" id="feedbackActionBtn" onclick="recordActionFeedback()" disabled>Save Feedback</button>
            </div>
            <div class="table-wrap"><div id="actionsTable"></div></div>
          </div>
        </div>
      </section>

      <!-- AUTOMATION -->
      <section class="view" id="view-automation">
        <div class="panel">
          <div class="panel-head"><h2>Run Automation</h2><span class="hint">Manual runs and history. Schedule settings live in Settings.</span><span class="spacer"></span><button class="btn sm" onclick="navigate('settings')">Open Settings</button></div>
          <div class="panel-body">
            <div class="grid-3">
              <div class="subtle-box">
                <div class="setup-title">Amazon price protection</div>
                <div class="setup-copy">Checks active listings and queues pause actions if source prices make them unsafe.</div>
                <div class="actions-row"><button class="btn danger" onclick="runMonitor()">Run Price Check Now</button></div>
              </div>
              <div class="subtle-box">
                <div class="setup-title">eBay sold-product scan</div>
                <div class="setup-copy">Finds new sold eBay products. Configure the timer in Settings.</div>
                <div class="actions-row"><button class="btn primary" onclick="runEbayAutoNow()">Run Now</button><button class="btn" onclick="navigate('settings')">Schedule Settings</button></div>
              </div>
              <div class="subtle-box">
                <div class="setup-title">Amazon comparison queue</div>
                <div class="setup-copy">Compares highest-score queued eBay products with Amazon source matches.</div>
                <div class="actions-row"><button class="btn primary" onclick="startEbayAmazonCompareQueue()">Start Queue</button><button class="btn" onclick="navigate('settings')">Schedule Settings</button></div>
              </div>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Automation Runs</h2><span class="hint">Browser and computer-use operator history</span></div>
          <div class="panel-body"><div class="table-wrap"><div id="automationRunsTable"></div></div></div>
        </div>
        <div class="panel hidden" id="automationComparisonRunsPanel">
          <div class="panel-head"><h2>Amazon Comparison Jobs</h2><span class="hint">Manual and scheduled eBay-to-Amazon comparison history</span></div>
          <div class="panel-body"><div class="table-wrap"><div id="automationComparisonRunsTable"></div></div></div>
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
              <div class="actions-row" style="margin-bottom:10px"><button class="btn" onclick="syncEbayOrders()">Sync Recent eBay Orders</button></div>
              <details class="advanced">
                <summary>Add order manually</summary>
                <div class="form-grid">
                  <div class="field"><label>eBay Order ID</label><input id="orderEbayOrderId" placeholder="ORDER-1"></div>
                  <div class="field"><label>eBay Item ID</label><input id="orderEbayItemId" placeholder="EBAY-ITEM-1"></div>
                  <div class="field"><label>Buyer Name</label><input id="orderBuyerName" placeholder="Buyer"></div>
                  <div class="field"><label>Sale Price</label><input id="orderSalePrice" type="number" step="0.01" placeholder="54.99"></div>
                </div>
                <div class="actions-row"><button class="btn primary" onclick="createOrder()">Create BUY action</button></div>
              </details>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><h2>Record Amazon Purchase</h2></div>
            <div class="panel-body">
              <details class="advanced">
                <summary>Record purchase manually</summary>
                <div class="form-grid">
                  <div class="field"><label>Internal Order ID</label><input id="purchaseOrderId" placeholder="order_id"></div>
                  <div class="field"><label>ASIN</label><input id="purchaseAsin" placeholder="B000000000"></div>
                  <div class="field"><label>Amazon Order ID</label><input id="purchaseAmazonOrderId" placeholder="AMZ-1"></div>
                  <div class="field"><label>Purchase Price</label><input id="purchasePrice" type="number" step="0.01" placeholder="31.50"></div>
                </div>
                <div class="actions-row"><button class="btn primary" onclick="recordPurchase()">Record purchase</button></div>
              </details>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Orders</h2></div>
          <div class="panel-body"><div class="table-wrap"><div id="ordersTable"></div></div></div>
        </div>
      </section>

      <!-- DISCOVERY -->
      <section class="view" id="view-ebayDiscovery">
        <div class="panel">
          <div class="panel-head"><h2>Discover</h2><span class="hint" id="discoverModeHint">Recent Amazon comparison decisions first.</span><span class="spacer"></span><span class="hint" id="keepaTokenHint">Keepa tokens —</span></div>
          <div class="panel-body">
            <div class="discover-tabs">
              <button class="tab-btn discover-tab active" data-discover-mode="queue" onclick="setDiscoverMode('queue')">Comparison Results</button>
              <button class="tab-btn discover-tab" data-discover-mode="ebay" onclick="setDiscoverMode('ebay')">eBay Search</button>
              <button class="tab-btn discover-tab" data-discover-mode="amazon" onclick="setDiscoverMode('amazon')">Amazon Scout</button>
            </div>

            <div class="discover-summary" id="discoverSummaryStrip"></div>

            <details class="advanced discover-controls">
              <summary id="discoverControlsSummary">Filter or run comparisons</summary>

            <div class="discover-command" data-discover-command="ebay">
              <div class="subsection-title">Sold eBay search</div>
              <div class="discover-command-grid">
                <div class="field"><label>Market</label><select id="ebayDiscoveryMarket"></select></div>
                <div class="field"><label>Profile</label><select id="ebayDiscoveryProfile"></select></div>
                <div class="field"><label>Category</label><select id="ebayDiscoveryCategory"></select></div>
                <div class="field discover-primary-field"><label>Optional eBay Keywords</label><input id="ebayDiscoveryQuery" placeholder="wireless barcode scanner"></div>
                <div class="field"><label>Sold Products</label><input id="ebayDiscoveryLimit" type="number" min="1" max="100" value="25"></div>
                <div class="field"><label>Query Breadth</label><select id="ebayDiscoveryQueryBreadth"><option value="BALANCED" selected>Balanced</option><option value="WIDE">Wide</option><option value="FOCUSED">Focused</option></select></div>
                <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoverySafeMode" type="checkbox" checked> Safe mode</label></div>
              </div>
              <details class="advanced">
                <summary>Search rules and thresholds</summary>
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
                  <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoverySoldOnly" type="checkbox" checked> Sold listings only</label></div>
                  <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoveryCompletedOnly" type="checkbox" checked> Completed listings only</label></div>
                  <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoverySkipExisting" type="checkbox" checked> Skip known products</label></div>
                </div>
                <div class="subsection-title">Amazon comparison gates</div>
                <div class="form-grid compact">
                  <div class="field"><label>Max Amazon Comparisons</label><input id="ebayDiscoveryCompareLimit" type="number" min="1" max="50" value="10"></div>
                  <div class="field"><label>Amazon Matches Per Product</label><input id="ebayDiscoveryAmazonMatches" type="number" min="1" max="10" value="3"></div>
                  <div class="field"><label>Min Profit</label><input id="ebayDiscoveryMinProfit" type="number" min="0" step="1" value="10"></div>
                  <div class="field"><label>Min ROI %</label><input id="ebayDiscoveryMinRoi" type="number" min="0" max="500" step="1" value="25"></div>
                  <div class="field"><label>Min Match %</label><input id="ebayDiscoveryMinMatch" type="number" min="0" max="100" step="1" value="75"></div>
                  <div class="field"><label>Min Compare Score</label><input id="ebayDiscoveryMinCompareScore" type="number" min="0" max="100" value="65"></div>
                </div>
                <div class="subsection-title">Run behavior</div>
                <div class="form-grid compact">
                  <div class="field"><label>&nbsp;</label><label class="check"><input id="ebayDiscoveryAuto" type="checkbox"> Compare top candidates after this scan</label></div>
                </div>
              </details>
              <div class="actions-row">
                <button class="btn primary" id="ebayDiscoveryRunBtn" onclick="runEbayDiscovery()">Find Sold Products</button>
                <button class="btn" id="ebayDiscoverySelectBtn" onclick="selectHighEbayScores()">Select High-Score Products</button>
                <button class="btn primary" id="ebayDiscoveryCompareBtn" onclick="compareSelectedEbay()">Compare Selected With Amazon</button>
                <span class="hint" id="ebayDiscoveryHint"></span>
              </div>
            </div>

            <div class="discover-command" data-discover-command="amazon">
              <div class="subsection-title">Amazon scout</div>
              <div class="discover-command-grid">
                <div class="field"><label>Market</label><select id="amazonScoutMarket"></select></div>
                <div class="field"><label>eBay Preset</label><select id="amazonScoutEbayPreset"></select></div>
                <div class="field"><label>Scout Profile</label><select id="amazonScoutProfile"></select></div>
                <div class="field"><label>Category</label><select id="amazonScoutCategory"></select></div>
                <div class="field discover-primary-field"><label>Optional Amazon Keywords</label><input id="amazonScoutQuery" placeholder="thermal label printer"></div>
                <div class="field"><label>Amazon Products</label><input id="amazonScoutLimit" type="number" min="1" max="100" value="40"></div>
                <div class="field"><label>&nbsp;</label><label class="check"><input id="amazonScoutSafeMode" type="checkbox" checked> Safe mode</label></div>
                <div class="field"><label>&nbsp;</label><label class="check"><input id="amazonScoutAuto" type="checkbox"> Auto compare top candidates</label></div>
              </div>
              <details class="advanced">
                <summary>Amazon filters and eBay gates</summary>
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
                  <div class="field"><label>Min Compare Score</label><input id="amazonScoutMinCompareScore" type="number" min="0" max="100" value="55"></div>
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

            <div class="discover-command active" data-discover-command="queue">
              <div class="subsection-title">Comparison queue</div>
              <div class="discover-command-grid">
                <div class="field discover-primary-field"><label>Search</label><input id="ebayCompareSearch" placeholder="title, item, Amazon match" oninput="updateEbayCompareFilters()"></div>
                <div class="field"><label>Status</label><select id="ebayCompareStatus" onchange="updateEbayCompareFilters()"><option value="ALL">All</option><option value="QUEUED">Queued</option><option value="COMPARING">Comparing</option><option value="OPPORTUNITY">Opportunity</option><option value="MANUAL_REVIEW">Manual review</option><option value="REJECTED">Rejected</option><option value="ERROR">Error</option></select></div>
                <div class="field"><label>Min Score</label><input id="ebayCompareMinScore" type="number" min="0" max="100" step="1" placeholder="0" oninput="updateEbayCompareFilters()"></div>
                <div class="field"><label>&nbsp;</label><button class="btn" onclick="clearEbayCompareFilters()">Clear</button></div>
              </div>
              <div class="mini-summary" id="ebayCompareTimerInfo"></div>
              <div class="actions-row">
                <button class="btn primary" onclick="startEbayAmazonCompareQueue()">Start Queue</button>
                <button class="btn" onclick="runEbayAmazonCompareNow()">Run Batch Now</button>
                <button class="btn" onclick="navigate('settings')">Schedule Settings</button>
              </div>
            </div>
            </details>
          </div>
        </div>

        <div class="discover-workbench">
          <div class="discover-main">
            <div class="subtle-box">
              <div class="discover-panel-head">
                <h3 id="discoverQueueTitle">Latest Comparison Results</h3>
                <span class="hint hidden" id="ebayDiscoverySummary">Run a sold-products search to build a shortlist.</span>
                <span class="hint hidden" id="amazonScoutSummary">Run Amazon Scout to build a shortlist.</span>
                <span class="hint" id="ebayAmazonComparisonSummary">Newest decisions first; queued work stays below completed results.</span>
              </div>
              <div class="discover-mode-panel" data-discover-panel="ebay">
                <div id="ebayDiscoveryResults" class="result-list"><div class="empty">No eBay discovery results yet.</div></div>
              </div>
              <div class="discover-mode-panel" data-discover-panel="amazon">
                <div id="amazonScoutResults" class="result-list"><div class="empty">No Amazon scout results yet.</div></div>
              </div>
              <div class="discover-mode-panel active" data-discover-panel="queue">
                <div id="ebayAmazonComparisonRows" class="compact-products"><div class="empty">No comparison rows yet.</div></div>
                <div id="ebayComparePager" class="pager"></div>
                <div id="ebayCompareJobStatus" class="job-status-grid"></div>
              </div>
            </div>
          </div>

          <div class="discover-side">
            <div class="subtle-box discover-inspector">
              <div class="discover-panel-head"><h3>Inspector</h3><span class="hint">Selected product</span></div>
              <div id="discoverInspector"><div class="empty">Select a product row to inspect pricing, match quality, and decision reasons.</div></div>
            </div>
            <div class="subtle-box discover-activity">
              <div class="discover-panel-head"><h3>Activity</h3><span class="hint">Recent discovery and comparison jobs</span></div>
              <div id="discoverActivityTimeline" class="activity-list"><div class="empty">No job activity yet.</div></div>
            </div>
          </div>
        </div>

        <details class="advanced advanced-data">
          <summary>Advanced data</summary>
          <div class="subsection-title">All eBay product lines</div>
          <div id="ebayCompactPanel" class="hidden">
            <div class="list-controls">
              <div class="field"><label>Search</label><input id="ebayCompactSearch" placeholder="title, family, category, source" oninput="updateEbayCompactFilters()"></div>
              <div class="field"><label>Status</label><select id="ebayCompactStatus" onchange="updateEbayCompactFilters()"><option value="ALL">All</option><option value="NOT_COMPARED">Queued</option><option value="OPPORTUNITY">Opportunity</option><option value="MANUAL_REVIEW">Manual review</option><option value="REJECTED">Rejected</option><option value="ERROR">Error</option></select></div>
              <div class="field"><label>Min Score</label><input id="ebayCompactMinScore" type="number" min="0" max="100" step="1" placeholder="0" oninput="updateEbayCompactFilters()"></div>
              <div class="field"><label>&nbsp;</label><button class="btn" onclick="clearEbayCompactFilters()">Clear</button></div>
            </div>
            <div class="mini-summary" id="ebayCompactSummary">Compact one-line view across recent discovery products.</div>
            <div id="ebayCompactProducts" class="compact-products"><div class="empty">No product lines yet.</div></div>
            <div id="ebayCompactPager" class="pager"></div>
          </div>
          <div class="grid-2" style="margin-top:14px">
            <div id="ebayRunsPanel" class="hidden">
              <div class="subsection-title">Recent eBay searches</div>
              <div class="table-wrap"><div id="ebayDiscoveryRunsTable"></div></div>
            </div>
            <div id="ebayCompareRunsPanel" class="hidden">
              <div class="subsection-title">Recent Amazon comparison jobs</div>
              <div class="table-wrap"><div id="ebayAmazonComparisonRunsTable"></div></div>
            </div>
          </div>
          <div class="subsection-title">Amazon Scout runs</div>
          <div class="table-wrap"><div id="amazonScoutRunsTable"></div></div>
          <details class="advanced">
            <summary>Guided Discovery</summary>
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
            <div class="actions-row"><button class="btn primary" onclick="searchOpportunities()">Find Opportunities</button><span class="hint" id="scanHint"></span></div>
            <div class="subsection-title">Ranked results</div>
            <div class="mini-summary" id="scanSummary">Run a scan to see scored opportunities.</div>
            <div id="scanResults" class="result-list"><div class="empty">No scan results yet.</div></div>
            <div class="subsection-title">Recent scans</div>
            <div class="table-wrap"><div id="scanRunsTable"></div></div>
          </details>
          <div class="subsection-title">Product candidates</div>
          <div class="table-wrap"><div id="productsTable"></div></div>
        </details>
      </section>

      <!-- SETTINGS -->
      <section class="view" id="view-settings">
        <div class="panel">
          <div class="panel-head"><h2>Settings</h2><span class="hint">All configuration lives here. Automation pages only run and monitor jobs.</span></div>
          <div class="panel-body">
            <details class="advanced settings-group" open>
              <summary>Dashboard session</summary>
              <div class="field"><label>Signed In</label>
                <div class="inline"><span class="chip">Session active</span><button class="btn ghost" onclick="logoutDashboard()">Logout</button></div>
                <div class="hint" style="margin-top:6px">Protected dashboard calls use a short-lived HttpOnly session and CSRF token. The local-agent shared secret can be rotated under Security credentials.</div>
              </div>
            </details>
            <details class="advanced settings-group" open>
              <summary>Marketplace credentials</summary>
              <div class="banner" id="keysLocked" style="display:none;background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.35);color:#fde68a;margin-bottom:14px">
                <span>Locked</span><span>Configure <b>LOCAL_AGENT_SHARED_SECRET</b> on the backend, then sign in again.</span>
              </div>
              <div id="credsContainer"><div class="empty">Open Settings after the shared secret is configured to manage credentials.</div></div>
            </details>
            <details class="advanced settings-group">
              <summary>Exports and alerts</summary>
              <div class="subtle-box">
                <div class="setup-title">Operational alerts</div>
                <div id="alertsBox" style="margin-top:10px"><div class="empty">Alerts load when Settings opens.</div></div>
                <div class="actions-row"><button class="btn" onclick="loadAlerts()">Refresh Alerts</button></div>
              </div>
              <div class="subtle-box" style="margin-top:12px">
                <div class="setup-title">Notification delivery</div>
                <div class="result-meta" style="margin-bottom:10px">Choose what to be notified about. Dispatch to webhook/email is wired in a backend follow-up; preferences save locally on this browser for now.</div>
                <div class="field" style="margin-bottom:10px"><label for="notifWebhook">Webhook URL</label><input id="notifWebhook" placeholder="https://hooks.slack.com/services/…"></div>
                <label class="check" style="margin-bottom:8px"><input type="checkbox" id="notifEmail"> Email alerts</label>
                <div class="subsection-title">Notify me about</div>
                <label class="check"><input type="checkbox" id="notifOpp" checked> Profitable opportunity</label>
                <label class="check"><input type="checkbox" id="notifPause" checked> Price-spike PAUSE</label>
                <label class="check"><input type="checkbox" id="notifFail" checked> Automation run FAILED</label>
                <label class="check"><input type="checkbox" id="notifKeepa" checked> Keepa tokens low</label>
                <label class="check"><input type="checkbox" id="notifBuy"> Pending BUY</label>
                <div class="field" style="margin-top:10px;max-width:220px"><label for="notifMinProfit">Min. profit to alert (USD)</label><input id="notifMinProfit" type="number" step="0.01" placeholder="15.00"></div>
                <div class="actions-row"><button class="btn primary" onclick="saveNotifPrefs()">Save Preferences</button></div>
              </div>
              <div class="subtle-box" style="margin-top:12px">
                <div class="setup-title">Data exports</div>
                <div class="actions-row">
                  <button class="btn ghost" onclick="downloadExport('actions')">Actions CSV</button>
                  <button class="btn ghost" onclick="downloadExport('candidates')">Candidates CSV</button>
                  <button class="btn ghost" onclick="downloadExport('listings')">Listings CSV</button>
                  <button class="btn ghost" onclick="downloadExport('orders')">Orders CSV</button>
                  <button class="btn ghost" onclick="downloadExport('profit-ledger')">Profit CSV</button>
                </div>
              </div>
            </details>
            <details class="advanced settings-group" open>
              <summary>Automation schedules</summary>
              <div class="grid-3">
                <div class="subtle-box">
                  <div class="setup-title">Amazon price protection</div>
                  <div class="setup-copy">How often active listings are checked against current Amazon pricing.</div>
                  <div class="field" style="margin-top:12px"><label>Interval (minutes)</label><input id="interval" type="number" min="1" placeholder="30"></div>
                  <div class="actions-row"><button class="btn primary" onclick="saveInterval()">Save</button><button class="btn danger" onclick="runMonitor()">Run Now</button></div>
                </div>
                <div class="subtle-box">
                  <div class="setup-title">eBay sold-product scan</div>
                  <div class="setup-copy">Find sold eBay products automatically, then queue them for Amazon comparison.</div>
                  <div class="schedule-grid" style="margin-top:12px">
                    <label class="check"><input id="ebayAutoRunEnabled" type="checkbox"> Run on schedule</label>
                    <div class="field"><label>Every minutes</label><input id="ebayAutoRunInterval" type="number" min="1" max="1440" value="1"></div>
                    <div class="field"><label>Products per run</label><input id="ebayAutoRunLimit" type="number" min="1" max="25" value="5"></div>
                  </div>
                  <div class="actions-row"><button class="btn primary" onclick="saveEbayAutoRun()">Save</button><button class="btn" onclick="runEbayAutoNow()">Run Now</button><button class="btn" onclick="stopEbayAutoRun()">Stop</button><button class="btn danger" onclick="deleteEbayAutoRun()">Delete</button></div>
                </div>
                <div class="subtle-box">
                  <div class="setup-title">Amazon comparison queue</div>
                  <div class="setup-copy">Compare queued eBay products against Amazon source matches automatically.</div>
                  <div class="schedule-grid" style="margin-top:12px">
                    <label class="check"><input id="ebayAmazonCompareEnabled" type="checkbox"> Run on schedule</label>
                    <div class="field"><label>Every minutes</label><input id="ebayAmazonCompareInterval" type="number" min="1" max="1440" value="1"></div>
                    <div class="field"><label>Products per run</label><input id="ebayAmazonCompareLimit" type="number" min="1" max="25" value="1"></div>
                  </div>
                  <div class="actions-row"><button class="btn primary" onclick="saveEbayAmazonCompareAutoRun()">Save</button><button class="btn" onclick="runEbayAmazonCompareNow()">Run Batch Now</button><button class="btn" onclick="stopEbayAmazonCompareAutoRun()">Stop</button><button class="btn danger" onclick="deleteEbayAmazonCompareAutoRun()">Delete</button></div>
                </div>
              </div>
            </details>
            <details class="advanced settings-group" open>
              <summary>Profit and comparison thresholds</summary>
              <div class="form-grid compact">
                <div class="field"><label>Minimum Profit</label><input id="settingsMinProfit" type="number" min="0" step="1"></div>
                <div class="field"><label>Minimum ROI %</label><input id="settingsMinRoi" type="number" min="0" max="500" step="1"></div>
                <div class="field"><label>Minimum Match %</label><input id="settingsMinMatch" type="number" min="0" max="100" step="1"></div>
                <div class="field"><label>Minimum Score</label><input id="settingsMinScore" type="number" min="0" max="100"></div>
                <div class="field"><label>Max Amazon Cost</label><input id="settingsMaxCost" type="number" min="1" step="1"></div>
              </div>
              <div class="actions-row"><button class="btn primary" onclick="saveThresholds()">Save Thresholds</button></div>
            </details>
            <details class="advanced settings-group">
              <summary>Discovery safety defaults</summary>
              <div class="form-grid">
                <div class="field"><label>Safe Mode</label><label class="check"><input id="settingsSafeMode" type="checkbox"> Keep risky products out</label></div>
                <div class="field"><label>Blocked Categories</label><textarea id="settingsBlockedCategories" placeholder="One per line"></textarea></div>
                <div class="field"><label>Blocked Keywords</label><textarea id="settingsBlockedKeywords" placeholder="One per line"></textarea></div>
              </div>
              <div class="actions-row"><button class="btn primary" onclick="saveSafety()">Save Safety Rules</button></div>
            </details>
            <details class="advanced settings-group">
              <summary>Active rule config</summary>
              <div class="kv" id="settingsKv"></div>
            </details>
          </div>
        </div>
      </section>
    </div>
  </main>
</div>
<div class="toasts" id="toasts"></div>

<script>
var state={data:null,profiles:[],amazonProfiles:[],amazonMarkets:[],ebayPresets:[],amazonScoutRunId:null,amazonScoutCandidates:[],amazonScoutReview:[],amazonScoutRejected:[],selectedAmazon:{},ebayDiscoveryProfiles:[],ebayDiscoveryMarkets:[],ebayDiscoveryRunId:null,ebayDiscoveryCandidates:[],ebayDiscoveryReview:[],ebayDiscoveryRejected:[],selectedEbay:{},scanOpportunities:[],keepaToken:null,discoverMode:'queue',discoverSelection:null,discoveryRowsLoaded:false,discoveryRowsLoading:false,ebayCompactPage:1,ebayComparePage:1,tablePages:{},cardPages:{},sectionOpen:{},expandedLists:{},localJobs:{},setup:{db:false,dashboard:false,backendSecret:'checking',browserSecret:false}};
var pageSize=20;
var tablePageSize=12;
var cardPageSize=8;
var META={
  overview:['Home','What needs attention and what is safe to do next'],
  actions:['Review','Approve, verify, draft, execute, complete, or reject one item at a time'],
  automation:['Automation','Price protection, schedules, browser runs, and confirmation states'],
  catalog:['Listings & Orders','Manage marketplace inventory and fulfillment'],
  discovery:['Discover','Recent comparison decisions, search, scout, and queue controls'],
  ebayDiscovery:['Discover','Recent comparison decisions, search, scout, and queue controls'],
  settings:['Settings','Connections, credentials, thresholds, and safety rules']
};
var BADGE={
  PENDING:'amber',APPROVED:'blue',COMPLETED:'green',REJECTED:'slate',CANCELLED:'red',ERROR:'red',
  ACTIVE:'green',PAUSED:'amber',DRAFT:'slate',ENDED:'slate',
  NEW:'blue',VALIDATING:'amber',READY_FOR_PURCHASE:'blue',MANUAL_REVIEW:'amber',PURCHASED:'green',SHIPPED:'teal',
  VERIFY:'amber',LIST:'blue',REPRICE:'teal',PAUSE:'amber',BUY:'green',REVIEW:'slate',
  DRAFT:'blue',ASSISTED:'amber',AUTOPILOT:'red',
  NEEDS_HUMAN_CONFIRMATION:'amber',FAILED:'red',REVIEW_REQUIRED:'amber',SKIPPED:'slate',
  PASS:'green',WARN:'amber',REJECT:'red',RUNNING:'blue',PAUSED:'amber',STOPPED:'slate',IDLE:'slate',NOT_COMPARED:'slate',COMPARING:'blue',OPPORTUNITY:'green'
  ,NO_EBAY_RESULTS:'red',NO_FIXED_PRICE_EBAY_RESULTS:'red',NO_PRICED_EBAY_RESULTS:'red',NO_AMAZON_RESULTS:'red',NO_PRICED_AMAZON_RESULTS:'red',SKIPPED_EBAY_SOURCE_FORMAT:'red',SKIPPED_EBAY_SOURCE_DATA:'red'
};
var COLORS={green:'#34d399',amber:'#fbbf24',red:'#f87171',blue:'#60a5fa',slate:'#94a3b8',teal:'#2dd4bf'};

  function cookieValue(name){return document.cookie.split(';').map(function(v){return v.trim()}).reduce(function(found,item){if(found)return found;var prefix=name+'=';return item.indexOf(prefix)===0?decodeURIComponent(item.slice(prefix.length)):''},'')}
  function authHeaders(){var csrf=cookieValue('buysell_dashboard_csrf');return csrf?{'x-csrf-token':csrf}:{}}
  function apiFetch(url,options){options=options||{};var h=Object.assign({},options.headers||{},authHeaders());return fetch(url,Object.assign({},options,{headers:h,credentials:'same-origin'}))}
  function responseJson(r){return r.json().catch(function(){return{error:'HTTP '+r.status}}).then(function(j){if(!r.ok){var m=j.error||('HTTP '+r.status);if(j.details)m+='\\n'+(typeof j.details==='string'?j.details:JSON.stringify(j.details));var err=new Error(m);err.status=r.status;err.payload=j;throw err}return j})}
  function apiJson(url,options){return apiFetch(url,options).then(responseJson)}
  function jpost(url,body){var h=Object.assign({'content-type':'application/json'},authHeaders());return fetch(url,{method:'POST',headers:h,credentials:'same-origin',body:JSON.stringify(body)}).then(responseJson)}
  function confirmAction(title,detail,word){
    if(word){
      var value=window.prompt(title+(detail?'\\n\\n'+detail:'')+'\\n\\nType '+word+' to continue.');
      return value===word;
    }
    return window.confirm(title+(detail?'\\n\\n'+detail:''));
  }
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
function safeUrl(s){var u=String(s==null?'':s).trim();var lu=u.toLowerCase();return (lu.indexOf('http://')===0||lu.indexOf('https://')===0)?esc(u):'#'}
function jsString(s){return JSON.stringify(String(s||''))}
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
function jobAge(startedAt){
  if(!startedAt)return '';
  var d=new Date(startedAt);
  if(isNaN(d.getTime()))return '';
  var mins=Math.max(0,Math.round((Date.now()-d.getTime())/60000));
  if(mins<1)return 'started just now';
  return 'started '+mins+' min ago';
}
function beginLocalJob(key,label,detail,category){
  state.localJobs[key]={label:label,detail:detail||'',status:'RUNNING',category:category||'general',startedAt:new Date().toISOString()};
  renderJobActivity();
  renderComparisonJobStatus();
}
function endLocalJob(key){
  if(state.localJobs&&state.localJobs[key])delete state.localJobs[key];
  renderJobActivity();
  renderComparisonJobStatus();
}
function clearLocalJobsByCategory(category){
  var changed=false;
  Object.keys(state.localJobs||{}).forEach(function(key){
    if(state.localJobs[key]&&state.localJobs[key].category===category){
      delete state.localJobs[key];
      changed=true;
    }
  });
  if(changed){
    renderJobActivity();
    renderComparisonJobStatus();
  }
}
function localJobRows(category){
  return Object.keys(state.localJobs||{}).map(function(key){
    var job=state.localJobs[key];
    return {
      key:key,
      label:job.label,
      detail:[job.detail,jobAge(job.startedAt)].filter(Boolean).join(' · '),
      status:job.status||'RUNNING',
      category:job.category||'general'
    };
  }).filter(function(job){return !category||job.category===category});
}
function selectedCandidateTitle(run){
  var selected=Array.isArray(run&&run.selectedCandidates)?run.selectedCandidates:[];
  return selected[0]&&selected[0].title?String(selected[0].title):'';
}
function comparisonRunMeta(run){
  var parts=[];
  if(run.mode)parts.push(String(run.mode).toLowerCase());
  if(run.selectedCount!==undefined&&run.selectedCount!==null)parts.push('selected '+run.selectedCount);
  if(run.comparedCount!==undefined&&run.comparedCount!==null)parts.push('compared '+run.comparedCount);
  if(run.opportunityCount)parts.push('opps '+run.opportunityCount);
  if(run.keepaTokensLeft!==undefined&&run.keepaTokensLeft!==null)parts.push('Keepa '+run.keepaTokensLeft);
  var title=selectedCandidateTitle(run);
  if(title)parts.push(title);
  var reason=run.error||run.reason;
  if(reason)parts.push(reason);
  parts.push('started '+when(run.startedAt));
  return parts.filter(Boolean).join(' · ');
}
function isKeepaPause(run){
  var status=String((run&&run.status)||'');
  var msg=String((run&&run.reason)||(run&&run.error)||'').toLowerCase();
  if(!(status==='SKIPPED'&&(msg.indexOf('keepa')>=0||msg.indexOf('rate limit')>=0||msg.indexOf('token')>=0||msg.indexOf('retry')>=0)))return false;
  var retry=Number(run&&run.keepaRetryAfterSeconds||0);
  var base=new Date((run&&run.completedAt)||(run&&run.startedAt)||0).getTime();
  if(!retry||!base)return false;
  return Date.now()<=base+(retry*1000)+5000;
}
function comparisonJobBuckets(){
  var d=state.data||{};
  var rc=d.ruleConfig||{};
  var p=d.pipeline||{};
  var f=p.funnel||{};
  var runs=d.ebayAmazonComparisonRuns||[];
  var running=localJobRows('comparison');
  runs.filter(function(run){return run.status==='RUNNING'}).forEach(function(run){
    running.push({label:'Amazon comparison job',detail:comparisonRunMeta(run),status:'RUNNING'});
  });
  if((f.ebayComparing||0)>0&&!running.length){
    running.push({label:f.ebayComparing+' product'+(f.ebayComparing===1?'':'s')+' comparing',detail:'Candidate rows are marked COMPARING',status:'RUNNING'});
  }
  var paused=[];
  if(d.ruleConfig&&!rc.ebayAmazonCompareAutoRunEnabled){
    paused.push({label:'Amazon comparison timer',detail:'Paused in Settings; manual compare can still be run from this page.',status:'PAUSED'});
  }
  runs.filter(isKeepaPause).slice(0,4).forEach(function(run){
    paused.push({label:'Waiting for Keepa tokens',detail:comparisonRunMeta(run),status:'PAUSED'});
  });
  var stopped=runs.filter(function(run){
    return run.status&&run.status!=='RUNNING'&&!isKeepaPause(run);
  }).slice(0,6).map(function(run){
    return {label:'Amazon comparison job',detail:comparisonRunMeta(run),status:run.status||'STOPPED'};
  });
  return {running:running,paused:paused,stopped:stopped};
}
function jobStatusRow(row){
  var detail=row.detail||'—';
  return '<div class="job-status-row"><div><div class="job-status-title" title="'+esc(row.label)+'">'+esc(row.label)+'</div><div class="job-status-meta" title="'+esc(detail)+'">'+esc(detail)+'</div></div>'+badge(row.status||'IDLE')+'</div>';
}
function jobStatusCard(kind,label,rows,emptyText){
  return '<div class="job-status-card '+kind+'"><div class="job-status-head"><span>'+esc(label)+'</span><span class="job-status-count">'+esc(rows.length)+'</span></div><div class="job-status-list">'+(rows.length?rows.map(jobStatusRow).join(''):'<div class="job-status-meta">'+esc(emptyText)+'</div>')+'</div></div>';
}
function renderComparisonJobStatus(buckets){
  var el=document.getElementById('ebayCompareJobStatus');
  if(!el)return;
  buckets=buckets||comparisonJobBuckets();
  el.innerHTML=[
    jobStatusCard('running','Running',buckets.running,'No comparison jobs are running.'),
    jobStatusCard('paused','Paused',buckets.paused,'No paused comparison timers or token waits.'),
    jobStatusCard('stopped','Stopped',buckets.stopped,'No stopped comparison jobs in recent history.')
  ].join('');
}
function liveSchedulerLocks(){
  var locks=((state.data&&state.data.pipeline&&state.data.pipeline.schedulerLocks)||[]);
  return locks.filter(function(lock){return new Date(lock.leasedUntil).getTime()>Date.now()});
}
function visibleSchedulerLocks(rc){
  rc=rc||{};
  return liveSchedulerLocks().filter(function(lock){
    var meta=lock&&lock.metadataJson&&typeof lock.metadataJson==='object'?lock.metadataJson:{};
    if(meta.job==='ebay-amazon-comparison-auto-run'&&meta.mode==='AUTO'&&rc.ebayAmazonCompareAutoRunEnabled===false)return false;
    if(meta.job==='ebay-discovery-auto-run'&&rc.ebayDiscoveryAutoRunEnabled===false)return false;
    return true;
  });
}
function pushActiveRuns(target,rows,label,detailFn,statuses){
  var active={};
  statuses.forEach(function(status){active[status]=true});
  (rows||[]).filter(function(row){return active[row.status]}).forEach(function(row){
    target.push({label:label,detail:detailFn(row),status:row.status});
  });
}
function buildTopJobActivity(){
  var d=state.data||{};
  var p=d.pipeline||{};
  var f=p.funnel||{};
  var rc=d.ruleConfig||{};
  var running=localJobRows();
  pushActiveRuns(running,d.ebayAmazonComparisonRuns,'Amazon comparison job',comparisonRunMeta,['RUNNING']);
  pushActiveRuns(running,d.ebayDiscoveryRuns,'eBay discovery scan',function(run){return [run.mode||'manual',run.query||run.categoryKey||run.profileKey,'accepted '+(run.acceptedCount||0),'started '+when(run.startedAt)].filter(Boolean).join(' · ')},['RUNNING']);
  pushActiveRuns(running,d.amazonDiscoveryRuns,'Amazon scout job',function(run){return [run.mode||'manual',run.query||run.categoryKey||run.profileKey,'accepted '+(run.acceptedCount||0),'started '+when(run.startedAt)].filter(Boolean).join(' · ')},['RUNNING']);
  pushActiveRuns(running,d.discoveryScanRuns,'Guided scan',function(run){return [run.profileKey,run.query,'accepted '+(run.acceptedCount||0),'started '+when(run.startedAt)].filter(Boolean).join(' · ')},['RUNNING']);
  pushActiveRuns(running,d.automationRuns,'Automation run',function(run){return [run.phase,'risk '+(run.riskScore||0),latestEventText(run),'started '+when(run.startedAt)].filter(Boolean).join(' · ')},['RUNNING','NEEDS_HUMAN_CONFIRMATION']);
  if((f.ebayComparing||0)>0&&!running.some(function(job){return job.label.indexOf('comparison')>=0||job.label.indexOf('comparing')>=0})){
    running.push({label:f.ebayComparing+' Amazon comparison row'+(f.ebayComparing===1?'':'s'),detail:'Products are marked COMPARING',status:'RUNNING'});
  }
  visibleSchedulerLocks(rc).forEach(function(lock){
    running.push({label:'Scheduler lock: '+lock.name,detail:'Owner '+(lock.owner||'—')+' · lease '+when(lock.leasedUntil),status:'RUNNING'});
  });
  var paused=[];
  (d.ebayAmazonComparisonRuns||[]).filter(isKeepaPause).slice(0,2).forEach(function(run){
    paused.push({label:'Amazon comparison waiting for Keepa',detail:comparisonRunMeta(run),status:'PAUSED'});
  });
  return {running:running,paused:paused};
}
function headlineText(items,maxItems){
  var shown=items.slice(0,maxItems).map(function(item){return item.label});
  if(items.length>shown.length)shown.push('+'+(items.length-shown.length)+' more');
  return shown.join(' · ');
}
function renderJobActivity(){
  var el=document.getElementById('jobHeadline');
  var txtEl=document.getElementById('jobHeadlineText');
  if(!el||!txtEl)return;
  var activity=buildTopJobActivity();
  el.className='job-headline';
  if(activity.running.length){
    el.className='job-headline show running';
    txtEl.textContent='Jobs running: '+headlineText(activity.running,3);
    return;
  }
  if(activity.paused.length){
    el.className='job-headline show paused';
    txtEl.textContent='No jobs running · '+headlineText(activity.paused,2);
    return;
  }
  if(state.data){
    el.className='job-headline show idle';
    txtEl.textContent='No jobs running';
  }
}

function comparisonRunSummary(res){
  res=res||{};
  var parts=[];
  if(res.selected&&res.selected.length!==undefined)parts.push('selected '+res.selected.length);
  if(res.compared!==undefined)parts.push('compared '+res.compared);
  if(res.opportunities!==undefined)parts.push('opportunities '+res.opportunities);
  if(res.manualReviews!==undefined)parts.push('review '+res.manualReviews);
  if(res.rejected!==undefined)parts.push('rejected '+res.rejected);
  if(res.keepa){
    var keepa=[];
    if(res.keepa.tokensLeft!==undefined&&res.keepa.tokensLeft!==null)keepa.push('left '+res.keepa.tokensLeft);
    if(res.keepa.requestedTokens!==undefined&&res.keepa.requestedTokens!==null)keepa.push('needed '+res.keepa.requestedTokens);
    if(res.keepa.retryAfterSeconds!==undefined&&res.keepa.retryAfterSeconds!==null)keepa.push('retry '+res.keepa.retryAfterSeconds+'s');
    if(keepa.length)parts.push('Keepa '+keepa.join(', '));
  }
  if(res.reason)parts.push(res.reason);
  return parts.join(' · ')||'No comparison details returned.';
}
function comparisonRunToast(res){
  if(!res||res.enabled===false)return {title:'Amazon comparison not running',kind:'warn',message:(res&&res.reason)||'Enable it in Settings to run on schedule.'};
  if((res.compared||0)>0)return {title:'Amazon comparison complete',kind:'ok',message:comparisonRunSummary(res)};
  if(res.selected&&res.selected.length)return {title:'Amazon comparison skipped',kind:'warn',message:comparisonRunSummary(res)};
  return {title:'No Amazon comparison work',kind:'warn',message:comparisonRunSummary(res)};
}
function comparisonStartSummary(res){
  var first=(res&&res.firstRun)||{};
  var rc=(res&&res.ruleConfig)||{};
  var interval=rc.ebayAmazonCompareAutoRunIntervalMinutes||'configured';
  var limit=rc.ebayAmazonCompareAutoRunLimit||'configured';
  return 'Schedule on · every '+interval+' min · '+limit+' product'+(Number(limit)===1?'':'s')+'/run · '+comparisonRunSummary(first);
}

function table(rows,cols,opts){
  opts=opts||{};
  if(!rows||!rows.length)return '<div class="empty">No '+esc(opts.noun||'records')+' yet.</div>';
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

function amazonComparisonRunColumns(){
  return [
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
  ];
}
function amazonComparisonRunsTable(key,rows){
  return pagedTable(key,rows,amazonComparisonRunColumns(),{noun:'jobs'});
}

function pagerButtonsHtml(key,page,totalRows,size,setterName,noun){
  if(totalRows<=size)return '';
  var totalPages=Math.max(1,Math.ceil(totalRows/size));
  return '<div class="pager table-pager">'+
    '<button class="btn sm" '+(page<=1?'disabled':'')+' onclick="'+setterName+'(\\''+esc(key)+'\\','+(page-1)+')">Prev</button>'+
    '<span>Page '+page+' of '+totalPages+' · '+totalRows+' '+esc(noun||'items')+'</span>'+
    '<button class="btn sm" '+(page>=totalPages?'disabled':'')+' onclick="'+setterName+'(\\''+esc(key)+'\\','+(page+1)+')">Next</button>'+
  '</div>';
}
function pagedTable(key,rows,cols,opts){
  opts=opts||{};
  rows=rows||[];
  if(!rows.length)return '<div class="empty">No '+esc(opts.noun||'records')+' yet.</div>';
  var size=opts.pageSize||tablePageSize;
  var page=clampPage(state.tablePages[key]||1,rows.length,size);
  state.tablePages[key]=page;
  var start=(page-1)*size;
  var end=Math.min(start+size,rows.length);
  var pageRows=rows.slice(start,end);
  var noun=opts.noun||'records';
  var summary=rows.length>size?'<div class="table-summary">Showing '+(start+1)+'-'+end+' of '+rows.length+' '+esc(noun)+' · '+size+' per page</div>':'';
  return summary+table(pageRows,cols,opts)+pagerButtonsHtml(key,page,rows.length,size,'setTablePage',noun);
}
function setTablePage(key,page){
  state.tablePages[key]=page;
  render();
}
function rememberSectionOpen(el){
  var key=el&&el.getAttribute('data-section-key');
  if(key)state.sectionOpen[key]=!!el.open;
}
function sectionIsOpen(key,defaultOpen){
  return state.sectionOpen[key]===undefined?!!defaultOpen:!!state.sectionOpen[key];
}
function renderCardSection(key,label,rows,renderFn,opts){
  opts=opts||{};
  rows=rows||[];
  if(!rows.length)return '';
  var size=opts.pageSize||cardPageSize;
  var page=clampPage(state.cardPages[key]||1,rows.length,size);
  state.cardPages[key]=page;
  var start=(page-1)*size;
  var end=Math.min(start+size,rows.length);
  var pageRows=rows.slice(start,end);
  var defaultOpen=opts.open!==undefined?opts.open:true;
  if(opts.collapseWhenLong&&rows.length>size)defaultOpen=false;
  var open=sectionIsOpen(key,defaultOpen);
  var help=opts.help||(rows.length>size?('Showing '+(start+1)+'-'+end+' of '+rows.length+' · '+size+' per page'):'');
  return '<details class="result-section" data-section-key="'+esc(key)+'" ontoggle="rememberSectionOpen(this)" '+(open?'open':'')+'>'+
    '<summary><span>'+esc(label)+'</span><span class="chip">'+rows.length+'</span>'+(help?'<span class="section-help">'+esc(help)+'</span>':'')+'</summary>'+
    '<div class="result-section-body">'+(opts.before||'')+pageRows.map(renderFn).join('')+pagerButtonsHtml(key,page,rows.length,size,'setCardPage',label.toLowerCase())+'</div>'+
  '</details>';
}
function setCardPage(key,page){
  state.cardPages[key]=page;
  if(key.indexOf('scanResults')===0)renderScanOpportunitySections();
  else if(key.indexOf('amazonScout')===0)renderAmazonScoutSections();
  else if(key.indexOf('ebayDiscovery')===0)renderEbayDiscoverySections();
}

function setSetupCard(id,status,label,copy){
  var card=document.getElementById(id+'Card');
  var statusEl=document.getElementById(id+'Status');
  var copyEl=document.getElementById(id+'Copy');
  if(!card||!statusEl)return;
  card.classList.remove('ok','warn','err');
  card.classList.add(status);
  statusEl.textContent=label;
  if(copyEl&&copy)copyEl.textContent=copy;
}
function updateSetupChecklist(){
  var hasBrowserSecret=true;
  state.setup.browserSecret=true;
  setSetupCard('setupDb',state.setup.db?'ok':'err',state.setup.db?'Connected':'Needs setup',state.setup.db?'Postgres is reachable.':'DATABASE_URL is missing or Postgres is unavailable.');
  var backendStatus=state.setup.backendSecret;
  setSetupCard('setupBackendSecret',backendStatus==='ok'?'ok':(backendStatus==='checking'?'warn':'err'),backendStatus==='ok'?'Configured':(backendStatus==='checking'?'Checking':'Needs setup'),backendStatus==='ok'?'Protected backend routes are available.':'Set LOCAL_AGENT_SHARED_SECRET in the backend environment.');
  setSetupCard('setupBrowserSecret','ok','Signed in','This browser uses a protected dashboard session for API calls.');
  var keysReady=state.setup.dashboard&&state.setup.db&&backendStatus==='ok'&&hasBrowserSecret;
  setSetupCard('setupKeys',keysReady?'ok':'warn',keysReady?'Manage now':'After setup',keysReady?'Open Settings to add or update SerpAPI, Keepa, and eBay credentials.':'Credentials unlock after the database and shared secret are configured.');
  var checklist=document.getElementById('setupChecklist');
  if(checklist)checklist.classList.toggle('hidden',state.setup.dashboard&&state.setup.db&&backendStatus==='ok'&&hasBrowserSecret);
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
  renderKeepaGauge();
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
function renderScanOpportunityCard(o){
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
}
function renderScanOpportunitySections(){
  var el=document.getElementById('scanResults');
  if(!el)return;
  if(!state.scanOpportunities.length){
    el.innerHTML='<div class="empty">No accepted opportunities. Try a different profile or lower the minimum score.</div>';
    return;
  }
  el.innerHTML=renderCardSection('scanResultsAccepted','Accepted opportunities',state.scanOpportunities,renderScanOpportunityCard,{help:'Highest score first. Open each page instead of scanning one long list.'});
}
function renderScanResults(res){
  var summary=res.summary||{};
  document.getElementById('scanSummary').textContent='Scanned '+(summary.scanned||0)+' · accepted '+(summary.accepted||0)+' · rejected '+(summary.rejected||0)+' · saved '+(summary.persisted||0);
  state.scanOpportunities=res.opportunities||[];
  state.cardPages.scanResultsAccepted=1;
  renderScanOpportunitySections();
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
  if(selectBtn){selectBtn.disabled=!selectable.length;selectBtn.classList.toggle('hidden',!selectable.length)}
  if(compareBtn){compareBtn.disabled=!selectedAmazonIds().length;compareBtn.classList.toggle('hidden',!selectable.length)}
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
  var best=comparisonFallbackMatch(comparison)||{};
  var market=comparison.market||amazonCandidateMarket(c);
  var settings=comparison.settings||{};
  var reasons=unique(comparison.reasons||[]).slice(0,4).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var title=best.title?'<div class="result-meta">eBay match: '+(best.url?'<a href="'+safeUrl(best.url)+'" target="_blank" rel="noreferrer">'+esc(best.title)+'</a>':esc(best.title))+'</div>':'';
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
  var discoverId=discoverKey('amazon',c);
  var selected=selectable&&(!!state.selectedAmazon[c.id]||!!c.selected);
  if(selectable)state.selectedAmazon[c.id]=selected;
  var score=amazonCandidateScore(c);
  var positive=amazonPositiveReasons(c).slice(0,3).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var rejection=amazonCandidateReasons(c).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var risks=amazonRiskFlags(c).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var drop=amazonCandidateDrop(c);
  var dropText=drop?(' · Down '+Number(drop).toFixed(1)+'%'):'';
  var url=amazonCandidateUrl(c);
  var title=url?'<a href="'+safeUrl(url)+'" target="_blank" rel="noreferrer">'+esc(amazonCandidateTitle(c))+'</a>':esc(amazonCandidateTitle(c));
  var check=selectable?'<label class="check"><input type="checkbox" data-amazon-id="'+esc(c.id)+'" '+(selected?'checked':'')+' onchange="toggleAmazonCandidate(this)"></label>':'<span class="placeholder-check"></span>';
  var comparison=amazonComparison(c);
  var rejectedLabel=review?'Needs manual review':comparison?'Rejected by eBay comparison':'Rejected because';
  var market=amazonCandidateMarket(c);
  var actions='<div class="card-actions">';
  if(c.id&&(rejected||review)&&c.productCandidateId)actions+='<button class="btn sm" onclick="navigate(\\'actions\\')">Open Review Queue</button>';
  else if(c.id&&(rejected||review||c.comparisonStatus==='ERROR'))actions+='<button class="btn primary sm" onclick="considerAmazonCandidate(\\''+esc(c.id)+'\\')">Review Anyway</button>';
  if(c.id&&(rejected||review||c.comparisonStatus==='ERROR')&&c.comparisonStatus!=='OPPORTUNITY')actions+='<button class="btn sm" onclick="recompareAmazonCandidate(\\''+esc(c.id)+'\\')">Recompare</button>';
  if(url)actions+='<a class="btn sm" href="'+safeUrl(url)+'" target="_blank" rel="noreferrer">Open Amazon</a>';
  if(comparison&&comparison.best&&comparison.best.url)actions+='<a class="btn sm" href="'+safeUrl(comparison.best.url)+'" target="_blank" rel="noreferrer">Open eBay</a>';
  actions+='</div>';
  return '<div class="result-card workbench-card '+(review?'review':(rejected?'rejected':''))+'" data-discover-type="amazon" data-discover-key="'+esc(discoverId)+'" onclick="selectDiscoverItemFromRow(this,event)"><div class="result-head">'+check+'<div class="'+scoreClass(score)+'">'+score+'</div><div class="result-main">'+
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
  renderAmazonScoutSections();
  updateAmazonScoutActions();
  if(state.discoverMode==='amazon')renderDiscoverMode();
}
function renderAmazonScoutSections(){
  var el=document.getElementById('amazonScoutResults');
  if(!el)return;
  var sections=[
    renderCardSection('amazonScoutAccepted','Accepted candidates',state.amazonScoutCandidates,renderAmazonCandidateCard,{help:'Passed the first filters. Select only products worth comparing.'}),
    renderCardSection('amazonScoutReview','Needs review',state.amazonScoutReview,renderAmazonCandidateCard,{help:'Promising, but one rule needs a human check.'}),
    renderCardSection('amazonScoutRejected','Rejected products',state.amazonScoutRejected,renderAmazonCandidateCard,{before:renderRejectionBreakdown(state.amazonScoutRejected),collapseWhenLong:true,help:'Collapsed when long so rejects do not crowd the page.'})
  ].filter(Boolean).join('');
  el.innerHTML=sections||'<div class="empty">No Amazon scout results yet.</div>';
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
  if(selectBtn){selectBtn.disabled=!selectable.length;selectBtn.classList.toggle('hidden',!selectable.length)}
  if(compareBtn){compareBtn.disabled=!selectedEbayIds().length;compareBtn.classList.toggle('hidden',!selectable.length)}
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
  var best=comparisonFallbackMatch(comparison)||{};
  var market=comparison.market||ebayCandidateMarket(c);
  var reasons=unique(comparison.reasons||[]).slice(0,4).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var title=best.title?'<div class="result-meta">Amazon match: '+(best.url?'<a href="'+safeUrl(best.url)+'" target="_blank" rel="noreferrer">'+esc(best.title)+'</a>':esc(best.title))+'</div>':'';
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
  var discoverId=discoverKey('ebay',c);
  var selected=selectable&&(!!state.selectedEbay[c.id]||!!c.selected);
  if(selectable)state.selectedEbay[c.id]=selected;
  var score=ebayCandidateScore(c);
  var positive=ebayPositiveReasons(c).slice(0,3).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var rejection=ebayCandidateReasons(c).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var risks=ebayRiskFlags(c).map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('');
  var url=ebayCandidateUrl(c);
  var title=url?'<a href="'+safeUrl(url)+'" target="_blank" rel="noreferrer">'+esc(ebayCandidateTitle(c))+'</a>':esc(ebayCandidateTitle(c));
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
  if(url)actions+='<a class="btn sm" href="'+safeUrl(url)+'" target="_blank" rel="noreferrer">Open eBay</a>';
  if(comparison&&comparison.best&&comparison.best.url)actions+='<a class="btn sm" href="'+safeUrl(comparison.best.url)+'" target="_blank" rel="noreferrer">Open Amazon</a>';
  actions+='</div>';
  return '<div class="result-card workbench-card '+(review?'review':(rejected?'rejected':''))+'" data-discover-type="ebay" data-discover-key="'+esc(discoverId)+'" onclick="selectDiscoverItemFromRow(this,event)"><div class="result-head">'+check+'<div class="'+scoreClass(score)+'">'+score+'</div><div class="result-main">'+
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
  renderEbayDiscoverySections();
  updateEbayDiscoveryActions();
  if(state.discoverMode==='ebay')renderDiscoverMode();
}
function renderEbayDiscoverySections(){
  var el=document.getElementById('ebayDiscoveryResults');
  if(!el)return;
  var sections=[
    renderCardSection('ebayDiscoveryAccepted','Accepted sold candidates',state.ebayDiscoveryCandidates,renderEbayCandidateCard,{help:'Products that passed sold-listing filters. Select candidates before Amazon comparison.'}),
    renderCardSection('ebayDiscoveryReview','Needs review',state.ebayDiscoveryReview,renderEbayCandidateCard,{help:'Potentially useful products that need a human check.'}),
    renderCardSection('ebayDiscoveryRejected','Rejected products',state.ebayDiscoveryRejected,renderEbayCandidateCard,{before:renderEbayRejectionBreakdown(state.ebayDiscoveryRejected),collapseWhenLong:true,help:'Collapsed when long so you can focus on accepted products first.'})
  ].filter(Boolean).join('');
  el.innerHTML=sections||'<div class="empty">No eBay discovery results yet.</div>';
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
  if(filter==='QUEUED')return actual==='NOT_COMPARED';
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
function clampPage(page,totalRows,size){
  size=size||pageSize;
  var totalPages=Math.max(1,Math.ceil(totalRows/size));
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
function refreshDiscoveryRows(){
  var rows=currentAllEbayRows();
  renderEbayCompactProducts(rows);
  renderEbayAmazonComparisonRows(rows);
  renderDiscoverSummary();
  if(state.discoverMode==='queue')renderDiscoverInspector();
}
function loadDashboardDiscoveryRows(force){
  if(!state.data||state.discoveryRowsLoading)return Promise.resolve();
  if(state.discoveryRowsLoaded&&!force)return Promise.resolve();
  state.discoveryRowsLoading=true;
  return apiJson('/api/dashboard/discovery-candidates?take=500').then(function(res){
    state.data.allEbayDiscoveryCandidates=res.allEbayDiscoveryCandidates||[];
    state.data.allEbayDiscoveryCandidatesTotal=res.total||state.data.allEbayDiscoveryCandidates.length;
    state.data.allEbayDiscoveryCandidatesLoaded=true;
    state.discoveryRowsLoaded=true;
    refreshDiscoveryRows();
  }).catch(function(e){
    toast('Could not load discovery rows',e.message,'warn');
  }).finally(function(){
    state.discoveryRowsLoading=false;
  });
}
function showPanel(id,visible){
  var el=document.getElementById(id);
  if(el)el.classList.toggle('hidden',!visible);
}
function discoverKey(type,c){
  if(!c)return '';
  if(type==='amazon')return c.id||amazonCandidateAsin(c)||amazonCandidateTitle(c)||'';
  return c.id||ebayCandidateItemId(c)||ebayCandidateTitle(c)||'';
}
function selectedDiscoverKey(){
  return state.discoverSelection ? state.discoverSelection.type+'|'+state.discoverSelection.key : '';
}
function renderDiscoverSelectionStyles(){
  var selected=selectedDiscoverKey();
  document.querySelectorAll('[data-discover-key]').forEach(function(el){
    var key=el.getAttribute('data-discover-type')+'|'+el.getAttribute('data-discover-key');
    var active=!!selected&&key===selected;
    el.classList.toggle('active',active);
    if(el.classList&&el.classList.contains('queue-row'))el.setAttribute('aria-pressed',active?'true':'false');
  });
}
function revealDiscoverInspector(){
  var content=document.getElementById('discoverInspector');
  if(content)content.scrollTop=0;
  var panel=document.querySelector('.discover-inspector');
  if(panel&&window.matchMedia&&window.matchMedia('(max-width:1100px)').matches&&panel.scrollIntoView){
    panel.scrollIntoView({block:'start',behavior:'smooth'});
  }
}
function selectDiscoverItemFromRow(row,event){
  if(!row)return;
  selectDiscoverItem(row.getAttribute('data-discover-type'),row.getAttribute('data-discover-key'),event);
}
function selectDiscoverItem(type,key,event){
  if(event&&event.target&&event.target.closest){
    var interactive=event.target.closest('a,input,label,select,textarea');
    var button=event.target.closest('button');
    if(interactive||(button&&button!==event.currentTarget))return;
  }
  state.discoverSelection={type:type,key:key};
  renderDiscoverInspector();
  revealDiscoverInspector();
  renderDiscoverSelectionStyles();
}
function discoverRowsForMode(mode){
  mode=mode||state.discoverMode||'queue';
  if(mode==='amazon')return state.amazonScoutCandidates.concat(state.amazonScoutReview,state.amazonScoutRejected);
  if(mode==='queue')return filteredAmazonComparisonRows();
  return state.ebayDiscoveryCandidates.concat(state.ebayDiscoveryReview,state.ebayDiscoveryRejected);
}
function findDiscoverItem(selection){
  if(!selection)return null;
  var rows=selection.type==='amazon'
    ? state.amazonScoutCandidates.concat(state.amazonScoutReview,state.amazonScoutRejected)
    : currentAllEbayRows();
  return rows.find(function(row){return discoverKey(selection.type,row)===selection.key})||null;
}
function ensureDiscoverSelection(){
  var mode=state.discoverMode||'ebay';
  var type=mode==='amazon'?'amazon':'ebay';
  if(state.discoverSelection&&state.discoverSelection.type===type&&findDiscoverItem(state.discoverSelection))return;
  var rows=discoverRowsForMode(mode);
  var first=rows.find(function(row){return discoverKey(type,row)});
  state.discoverSelection=first?{type:type,key:discoverKey(type,first)}:null;
}
function discoverMetric(label,value,color){
  return '<div class="discover-metric" style="border-color:'+(color||'var(--border)')+'40"><div class="discover-metric-value" style="color:'+(color||'var(--text)')+'">'+esc(value===undefined||value===null?0:value)+'</div><div class="discover-metric-label">'+esc(label)+'</div></div>';
}
function renderDiscoverSummary(){
  var el=document.getElementById('discoverSummaryStrip');
  if(!el)return;
  var d=state.data||{};
  var f=(d.pipeline&&d.pipeline.funnel)||{};
  if(state.discoverMode==='amazon'){
    el.innerHTML=[
      discoverMetric('Accepted',state.amazonScoutCandidates.length,COLORS.green),
      discoverMetric('Review',state.amazonScoutReview.length,COLORS.amber),
      discoverMetric('Rejected',state.amazonScoutRejected.length,COLORS.red),
      discoverMetric('Selected',selectedAmazonIds().length,COLORS.blue),
      discoverMetric('Scout Runs',(d.amazonDiscoveryRuns||[]).length,COLORS.teal)
    ].join('');
    return;
  }
  el.innerHTML=[
    discoverMetric('Queued',f.ebayQueued||0,COLORS.slate),
    discoverMetric('Comparing',f.ebayComparing||0,COLORS.blue),
    discoverMetric('Opportunities',f.ebayOpportunities||0,COLORS.green),
    discoverMetric('Review',f.ebayManualReview||0,COLORS.amber),
    discoverMetric('Rejected',f.ebayRejected||0,COLORS.red),
    discoverMetric('Errors',f.ebayErrors||0,COLORS.red)
  ].join('');
}
function activityCountText(run){
  var parts=[];
  if(run.scannedCount!==undefined)parts.push('scanned '+(run.scannedCount||0));
  if(run.acceptedCount!==undefined)parts.push('accepted '+(run.acceptedCount||0));
  if(run.selectedCount!==undefined)parts.push('selected '+(run.selectedCount||0));
  if(run.comparedCount!==undefined)parts.push('compared '+(run.comparedCount||0));
  if(run.opportunityCount!==undefined)parts.push('opps '+(run.opportunityCount||0));
  if(run.manualReviewCount!==undefined)parts.push('review '+(run.manualReviewCount||0));
  if(run.rejectedCount!==undefined)parts.push('rejected '+(run.rejectedCount||0));
  if(run.keepaTokensLeft!==undefined&&run.keepaTokensLeft!==null)parts.push('Keepa '+run.keepaTokensLeft);
  var reason=run.error||run.reason;
  if(reason)parts.push(reason);
  return parts.join(' · ')||'No counts recorded';
}
function renderActivityRow(item){
  var run=item.run;
  var title=item.kind+' · '+(run.query||run.categoryKey||run.profileKey||run.mode||'run');
  return '<div class="activity-row"><div class="activity-row-head"><div class="activity-title" title="'+esc(title)+'">'+esc(title)+'</div>'+badge(run.status||'COMPLETED')+'</div>'+
    '<div class="activity-meta">'+esc(activityCountText(run))+'</div>'+
    '<div class="activity-meta">'+esc(when(run.startedAt))+'</div></div>';
}
function renderDiscoverActivity(){
  var el=document.getElementById('discoverActivityTimeline');
  if(!el)return;
  var d=state.data||{};
  var rows=[];
  (d.ebayAmazonComparisonRuns||[]).forEach(function(run){rows.push({kind:'Amazon compare',run:run})});
  (d.ebayDiscoveryRuns||[]).forEach(function(run){rows.push({kind:'eBay search',run:run})});
  (d.amazonDiscoveryRuns||[]).forEach(function(run){rows.push({kind:'Amazon scout',run:run})});
  rows.sort(function(a,b){return new Date(b.run.startedAt||0)-new Date(a.run.startedAt||0)});
  el.innerHTML=rows.length?rows.slice(0,8).map(renderActivityRow).join(''):'<div class="empty">No job activity yet.</div>';
}
function reasonsHtml(reasons,fallback){
  var list=unique(reasons||[]).slice(0,8);
  if(!list.length&&fallback)list=[fallback];
  return list.length?'<div class="chips">'+list.map(function(r){return '<span class="chip">'+esc(r)+'</span>'}).join('')+'</div>':'';
}
function comparisonFallbackMatch(comparison){
  if(!comparison)return null;
  if(comparison.best)return comparison.best;
  var matches=Array.isArray(comparison.topMatches)?comparison.topMatches:[];
  return matches.find(function(match){return match&&match.url})||matches[0]||null;
}
function ebayInspectorSourceGrid(c,market){
  var family=ebayCandidateFamily(c);
  return '<div class="comparison-grid">'+
    metric('Market',(market&&market.label)||'—')+
    metric('Category',ebayCandidateCategory(c)||'—')+
    metric('Family',family.key||'—')+
    metric('Source query',family.sourceQuery||'—')+
    metric('Item ID',ebayCandidateItemId(c)||'—')+
    metric('Updated',when(c.updatedAt))+
    '</div>';
}
function amazonInspectorSourceGrid(c,market){
  return '<div class="comparison-grid">'+
    metric('Market',(market&&market.label)||'—')+
    metric('Brand',c.brand||'—')+
    metric('Category',c.rootCategory||'—')+
    metric('ASIN',amazonCandidateAsin(c)||'—')+
    metric('Updated',when(c.updatedAt))+
    metric('Reviews',c.reviewCount===undefined||c.reviewCount===null?'—':String(c.reviewCount))+
    '</div>';
}
function inspectorActionsForEbay(c){
  var id=c&&c.id;
  var url=ebayCandidateUrl(c);
  var comparison=ebayComparison(c);
  var amazonMatch=comparisonFallbackMatch(comparison);
  var html='<div class="card-actions">';
  if(id&&(isRejectedEbayCandidate(c)||isManualReviewEbayCandidate(c)||c.comparisonStatus==='ERROR'))html+='<button class="btn primary sm" onclick="considerEbayCandidate(\\''+esc(id)+'\\')">Review Anyway</button>';
  if(id&&c.comparisonStatus!=='OPPORTUNITY')html+='<button class="btn sm" onclick="recompareEbayCandidate(\\''+esc(id)+'\\')">Recompare</button>';
  if(url)html+='<a class="btn sm" href="'+safeUrl(url)+'" target="_blank" rel="noreferrer">Open eBay</a>';
  if(amazonMatch&&amazonMatch.url)html+='<a class="btn sm" href="'+safeUrl(amazonMatch.url)+'" target="_blank" rel="noreferrer">Open Amazon</a>';
  return html+'</div>';
}
function inspectorActionsForAmazon(c){
  var id=c&&c.id;
  var url=amazonCandidateUrl(c);
  var comparison=amazonComparison(c);
  var ebayMatch=comparisonFallbackMatch(comparison);
  var html='<div class="card-actions">';
  if(id&&(isRejectedAmazonCandidate(c)||isManualReviewAmazonCandidate(c)||c.comparisonStatus==='ERROR'))html+='<button class="btn primary sm" onclick="considerAmazonCandidate(\\''+esc(id)+'\\')">Review Anyway</button>';
  if(id&&c.comparisonStatus!=='OPPORTUNITY')html+='<button class="btn sm" onclick="recompareAmazonCandidate(\\''+esc(id)+'\\')">Recompare</button>';
  if(url)html+='<a class="btn sm" href="'+safeUrl(url)+'" target="_blank" rel="noreferrer">Open Amazon</a>';
  if(ebayMatch&&ebayMatch.url)html+='<a class="btn sm" href="'+safeUrl(ebayMatch.url)+'" target="_blank" rel="noreferrer">Open eBay</a>';
  return html+'</div>';
}
function renderInspectorHighlight(c){
  var comparison=ebayComparison(c);
  if(!comparison)return '';
  var best=comparisonFallbackMatch(comparison)||{};
  var market=comparison.market||ebayCandidateMarket(c);
  var conf=(best.matchConfidence!==undefined&&best.matchConfidence!==null)?Math.max(0,Math.min(100,Number(best.matchConfidence)*100)):null;
  var hasProfit=best.expectedProfit!==undefined&&best.expectedProfit!==null;
  var profitNum=Number(best.expectedProfit||0);
  var pcol=hasProfit?(profitNum>0?COLORS.green:(profitNum<0?COLORS.red:COLORS.amber)):COLORS.slate;
  var ccol=conf===null?COLORS.slate:(conf>=80?COLORS.green:(conf>=55?COLORS.amber:COLORS.red));
  if(conf===null&&!hasProfit)return '';
  var bar=conf===null?'<div class="bs-conf"><div class="bs-conf-head"><span>Match confidence</span><span>—</span></div></div>':
    '<div class="bs-conf"><div class="bs-conf-head"><span>Match confidence</span><span style="color:'+ccol+'">'+conf.toFixed(0)+'%</span></div><div class="bs-conf-track"><span class="bs-conf-bar" style="width:'+conf.toFixed(0)+'%;background:'+ccol+'"></span></div></div>';
  var prof='<div class="bs-prof"><div class="bs-prof-main" style="color:'+pcol+'">'+(hasProfit?marketMoney(best.expectedProfit,market):'—')+'</div><div class="bs-prof-sub">net · ROI '+(best.roiPercent===undefined||best.roiPercent===null?'—':Number(best.roiPercent).toFixed(1)+'%')+'</div></div>';
  return '<div class="inspector-section bs-highlight">'+bar+prof+'</div>';
}
function renderDiscoverInspector(){
  var el=document.getElementById('discoverInspector');
  if(!el)return;
  ensureDiscoverSelection();
  var selection=state.discoverSelection;
  var item=findDiscoverItem(selection);
  if(!selection||!item){
    el.innerHTML='<div class="empty">Select a product row to inspect pricing, match quality, and decision reasons.</div>';
    renderDiscoverSelectionStyles();
    return;
  }
  if(selection.type==='amazon'){
    var aMarket=amazonCandidateMarket(item);
    var aRejected=isRejectedAmazonCandidate(item);
    var aReview=isManualReviewAmazonCandidate(item);
    el.innerHTML='<div class="inspector-title">'+esc(amazonCandidateTitle(item))+'</div>'+
      '<div class="inspector-meta">ASIN <span class="mono">'+esc(amazonCandidateAsin(item)||'unknown')+'</span> · '+badge(amazonCandidateStatus(item))+'</div>'+
      '<div class="inspector-section"><div class="inspector-section-title">Actions</div>'+inspectorActionsForAmazon(item)+'</div>'+
      '<div class="inspector-section"><div class="inspector-section-title">Source</div>'+amazonInspectorSourceGrid(item,aMarket)+'</div>'+
      '<div class="inspector-section"><div class="inspector-section-title">Economics</div><div class="comparison-grid">'+
      metric('Amazon cost',marketMoney(amazonCandidatePrice(item),aMarket))+
      metric('Avg90',marketMoney(amazonCandidateAvg90(item),aMarket))+
      metric('Drop',amazonCandidateDrop(item)?Number(amazonCandidateDrop(item)).toFixed(1)+'%':'—')+
      metric('Rank',txt(amazonCandidateRank(item)))+'</div></div>'+
      '<div class="inspector-section"><div class="inspector-section-title">Decision Reasons</div>'+reasonsHtml(aRejected||aReview?amazonCandidateReasons(item):amazonPositiveReasons(item),'No reasons captured yet')+'</div>'+
      renderEbayComparison(item,aRejected,aReview);
  }else{
    var eMarket=ebayCandidateMarket(item);
    var eRejected=isRejectedEbayCandidate(item);
    var eReview=isManualReviewEbayCandidate(item);
    el.innerHTML='<div class="inspector-title">'+esc(ebayCandidateTitle(item))+'</div>'+
      '<div class="inspector-meta">Item <span class="mono">'+esc(ebayCandidateItemId(item)||'unknown')+'</span> · '+badge(ebayCandidateStatus(item))+'</div>'+
      renderInspectorHighlight(item)+
      '<div class="inspector-section"><div class="inspector-section-title">Actions</div>'+inspectorActionsForEbay(item)+'</div>'+
      '<div class="inspector-section"><div class="inspector-section-title">Source</div>'+ebayInspectorSourceGrid(item,eMarket)+'</div>'+
      '<div class="inspector-section"><div class="inspector-section-title">Demand</div><div class="comparison-grid">'+
      metric('Sold price',marketMoney(ebayCandidatePrice(item),eMarket))+
      metric('Shipping',marketMoney(ebayCandidateShipping(item),eMarket))+
      metric('Condition',txt(ebayCandidateCondition(item)))+
      metric('Score',String(ebayCandidateScore(item)))+'</div></div>'+
      '<div class="inspector-section"><div class="inspector-section-title">Decision Reasons</div>'+reasonsHtml(eRejected||eReview?ebayCandidateReasons(item):ebayPositiveReasons(item),'No reasons captured yet')+'</div>'+
      renderAmazonComparisonForEbay(item,eRejected,eReview);
  }
  renderDiscoverSelectionStyles();
}
function ebayComparisonResultRank(c){
  var status=ebayCandidateStatus(c);
  if(status==='OPPORTUNITY'||status==='MANUAL_REVIEW'||status==='REJECTED'||status==='ERROR')return 0;
  if(status==='COMPARING')return 1;
  if(status==='NOT_COMPARED')return 2;
  return 3;
}
function ebayComparisonTimeValue(c){
  var comparison=ebayComparison(c);
  var value=(comparison&&comparison.comparedAt)||c.updatedAt||c.createdAt;
  var time=new Date(value||0).getTime();
  return isNaN(time)?0:time;
}
function latestComparisonSort(a,b){
  return ebayComparisonResultRank(a)-ebayComparisonResultRank(b)||ebayComparisonTimeValue(b)-ebayComparisonTimeValue(a)||ebayCandidateScore(b)-ebayCandidateScore(a);
}
function queueDecisionLabel(c){
  var status=ebayCandidateStatus(c);
  if(status==='OPPORTUNITY')return 'Passed';
  if(status==='MANUAL_REVIEW')return 'Review';
  if(status==='REJECTED')return 'Rejected';
  if(status==='ERROR')return 'Error';
  if(status==='COMPARING')return 'Running';
  if(status==='NOT_COMPARED')return 'Queued';
  return 'Status';
}
function queueDecisionReason(c){
  var status=ebayCandidateStatus(c);
  var comparison=ebayComparison(c);
  var reasons=[];
  if(isRejectedEbayCandidate(c)||isManualReviewEbayCandidate(c)||status==='ERROR')addStrings(reasons,ebayCandidateReasons(c));
  if(!reasons.length&&comparison)addStrings(reasons,comparison.reasons);
  if(!reasons.length&&status==='OPPORTUNITY')addStrings(reasons,ebayPositiveReasons(c));
  reasons=unique(reasons);
  if(reasons.length)return reasons[0];
  if(status==='OPPORTUNITY')return 'Passed the Amazon price, margin, ROI, and match checks.';
  if(status==='MANUAL_REVIEW')return 'Promising result, but one rule needs a human check.';
  if(status==='REJECTED')return 'Did not pass the Amazon comparison gates.';
  if(status==='ERROR')return 'Comparison failed and can be retried.';
  if(status==='COMPARING')return 'Amazon matching is currently running.';
  if(status==='NOT_COMPARED')return 'Waiting for Amazon comparison.';
  return 'No decision reason captured yet.';
}
function filteredAmazonComparisonRows(){
  var allRows=currentAllEbayRows().slice().sort(function(a,b){
    return latestComparisonSort(a,b);
  });
  return filterEbayRows(allRows,{
    text:inputValue('ebayCompareSearch'),
    status:selectValue('ebayCompareStatus','ALL'),
    minScore:inputValue('ebayCompareMinScore')
  });
}
function setDiscoverMode(mode){
  state.discoverMode=mode||'queue';
  state.discoverSelection=null;
  renderDiscoverMode();
}
function renderDiscoverMode(){
  var mode=state.discoverMode||'queue';
  document.querySelectorAll('[data-discover-mode]').forEach(function(btn){btn.classList.toggle('active',btn.getAttribute('data-discover-mode')===mode)});
  document.querySelectorAll('[data-discover-command]').forEach(function(panel){panel.classList.toggle('active',panel.getAttribute('data-discover-command')===mode)});
  document.querySelectorAll('[data-discover-panel]').forEach(function(panel){panel.classList.toggle('active',panel.getAttribute('data-discover-panel')===mode)});
  var title=document.getElementById('discoverQueueTitle');
  var hint=document.getElementById('discoverModeHint');
  var controlsSummary=document.getElementById('discoverControlsSummary');
  var ebaySummary=document.getElementById('ebayDiscoverySummary');
  var amazonSummary=document.getElementById('amazonScoutSummary');
  var queueSummary=document.getElementById('ebayAmazonComparisonSummary');
  if(title)title.textContent=mode==='amazon'?'Amazon Candidates':(mode==='queue'?'Latest Comparison Results':'Sold Product Shortlist');
  if(hint)hint.textContent=mode==='amazon'?'Amazon candidates first, then eBay demand checks.':(mode==='queue'?'Recent Amazon comparison decisions first.':'Sold eBay demand first, then Amazon source checks.');
  if(controlsSummary)controlsSummary.textContent=mode==='amazon'?'Run or filter Amazon Scout':(mode==='queue'?'Filter or run comparisons':'Run or filter eBay search');
  if(ebaySummary)ebaySummary.classList.toggle('hidden',mode!=='ebay');
  if(amazonSummary)amazonSummary.classList.toggle('hidden',mode!=='amazon');
  if(queueSummary)queueSummary.classList.toggle('hidden',mode!=='queue');
  renderDiscoverSummary();
  renderDiscoverActivity();
  renderDiscoverInspector();
}
function renderEbayCompactProducts(candidates){
  var el=document.getElementById('ebayCompactProducts');
  var summary=document.getElementById('ebayCompactSummary');
  if(!el)return;
  var allRows=compactEbayLines(candidates);
  showPanel('ebayCompactPanel',allRows.length>0);
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
    var title=url?'<a href="'+safeUrl(url)+'" target="_blank" rel="noreferrer">'+esc(ebayCandidateTitle(c))+'</a>':esc(ebayCandidateTitle(c));
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
    if(url)actions+='<a class="btn sm" href="'+safeUrl(url)+'" target="_blank" rel="noreferrer">Open eBay</a>';
    var comp=ebayComparison(c);
    if(comp&&comp.best&&comp.best.url)actions+='<a class="btn sm" href="'+safeUrl(comp.best.url)+'" target="_blank" rel="noreferrer">Open Amazon</a>';
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
    return latestComparisonSort(a,b);
  });
  var jobBuckets=comparisonJobBuckets();
  var rows=filterEbayRows(allRows,{
    text:inputValue('ebayCompareSearch'),
    status:selectValue('ebayCompareStatus','ALL'),
    minScore:inputValue('ebayCompareMinScore')
  });
  state.ebayComparePage=clampPage(state.ebayComparePage,rows.length);
  var start=(state.ebayComparePage-1)*pageSize;
  var pageRows=rows.slice(start,start+pageSize);
  var queued=rows.filter(function(c){return ebayCandidateStatus(c)==='NOT_COMPARED'}).length;
  var errors=rows.filter(function(c){return ebayCandidateStatus(c)==='ERROR'}).length;
  var completed=rows.filter(function(c){var s=ebayCandidateStatus(c);return s==='OPPORTUNITY'||s==='MANUAL_REVIEW'||s==='REJECTED'}).length;
  var rc=(state.data&&state.data.ruleConfig)||{};
  renderEbayCompareTimerInfo(rc);
  renderComparisonJobStatus(jobBuckets);
  var timer=rc.ebayAmazonCompareAutoRunEnabled?'timer on · '+(rc.ebayAmazonCompareAutoRunIntervalMinutes||1)+' min · '+(rc.ebayAmazonCompareAutoRunLimit||1)+'/run':'timer off';
  if(summary)summary.textContent=completed+' outcomes · '+errors+' errors · '+queued+' queued · '+rows.length+' of '+allRows.length+' rows · '+timer+' · newest decisions first';
  if(!rows.length){
    el.innerHTML='<div class="empty">No comparison rows yet.</div>';
    renderPager('ebayComparePager',state.ebayComparePage,0,'setEbayComparePage');
    if(state.discoverMode==='queue')renderDiscoverInspector();
    return;
  }
  el.innerHTML=pageRows.map(function(c){
    var score=ebayCandidateScore(c);
    var market=ebayCandidateMarket(c);
    var status=ebayCandidateStatus(c);
    var comparison=ebayComparison(c);
    var best=comparisonFallbackMatch(comparison)||{};
    var sourcePrice=best.buyBoxPrice!==undefined?best.buyBoxPrice:best.currentPrice;
    var profit=best.expectedProfit!==undefined?marketMoney(best.expectedProfit,market):'Queued';
    var roi=best.roiPercent!==undefined?Number(best.roiPercent).toFixed(1)+'%':'—';
    var cost=sourcePrice!==undefined?marketMoney(sourcePrice,market):'—';
    var match=best.matchConfidence!==undefined?pct(Number(best.matchConfidence)*100):'—';
    var discoverId=discoverKey('ebay',c);
    var completedAt=ebayComparisonResultRank(c)===0&&ebayComparisonTimeValue(c)?'Updated '+when(ebayComparisonTimeValue(c)):'';
    return '<button type="button" class="queue-row" data-discover-type="ebay" data-discover-key="'+esc(discoverId)+'" onclick="selectDiscoverItemFromRow(this,event)">'+
      '<span class="'+scoreClass(score)+'">'+score+'</span>'+
      '<span class="queue-copy"><span class="queue-title">'+esc(ebayCandidateTitle(c))+'</span><span class="queue-meta">eBay '+marketMoney(ebayCandidatePrice(c),market)+' · Cost '+cost+' · Profit '+profit+' · ROI '+roi+' · Match '+match+'</span><span class="queue-reason"><span>'+esc(queueDecisionLabel(c))+'</span>'+esc(queueDecisionReason(c))+'</span></span>'+
      '<span class="queue-stats">'+badge(status)+(completedAt?'<span class="queue-time">'+esc(completedAt)+'</span>':'')+'</span>'+
      '</button>';
  }).join('');
  renderPager('ebayComparePager',state.ebayComparePage,rows.length,'setEbayComparePage');
  if(state.discoverMode==='queue')renderDiscoverInspector();
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
  renderDiscoverSummary();
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
    '<button class="btn primary" onclick="runEbayAmazonCompareNow()">Run Amazon Batch</button>',
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
  }).join(''):'<div class="empty">No scored opportunities yet. Open Discover to build the queue.</div>';
}

function bsBar(label,value,max,color){
  var pct=max>0?Math.max(2,Math.round((value/max)*100)):0;
  return '<div class="bs-frow"><span class="bs-flabel">'+esc(label)+'</span><span class="bs-ftrack"><span class="bs-fbar" style="width:'+pct+'%;background:'+color+'"></span></span><span class="bs-fval">'+esc(value==null?0:value)+'</span></div>';
}
function renderPlChart(){
  var el=document.getElementById('plChart');if(!el)return;
  var pl=(state.data&&state.data.pipeline&&state.data.pipeline.plTrend)||{};
  var pts=pl.points||[];
  var srcEl=document.getElementById('plSource');
  if(srcEl)srcEl.textContent=pts.length?(pl.source==='cashflow'?'sales minus source cost':'from ledger'):'';
  if(!pts.length){el.innerHTML='<div class="empty" style="padding:20px">No realized P/L recorded yet — fills in once purchases write ledger entries.</div>';return;}
  var vals=pts.map(function(p){return Number(p.v)||0});
  var lo=Math.min.apply(null,vals.concat(0)),hi=Math.max.apply(null,vals.concat(0));
  var W=560,H=120,pad=8,span=(hi-lo)||1;
  var xAt=function(i){return pts.length>1?pad+(i/(pts.length-1))*(W-2*pad):W/2};
  var yAt=function(v){return H-pad-((v-lo)/span)*(H-2*pad)};
  var d=pts.map(function(p,i){return (i?'L':'M')+xAt(i).toFixed(1)+' '+yAt(Number(p.v)||0).toFixed(1)}).join(' ');
  var last=Number(pts[pts.length-1].v)||0;
  var col=last>=0?COLORS.green:COLORS.red;
  var area=d+' L'+xAt(pts.length-1).toFixed(1)+' '+(H-pad)+' L'+xAt(0).toFixed(1)+' '+(H-pad)+' Z';
  var zeroY=yAt(0).toFixed(1);
  el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="120" preserveAspectRatio="none" role="img" aria-label="Realized profit and loss trend, latest '+money(last)+'"><line x1="0" y1="'+zeroY+'" x2="'+W+'" y2="'+zeroY+'" stroke="rgba(148,163,184,.18)" stroke-dasharray="3 3"/><path d="'+area+'" fill="'+col+'" fill-opacity="0.12"/><path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg><div class="bs-gauge-sub" style="text-align:left;margin-top:5px">Latest '+money(last)+' · '+pts.length+' days with activity</div>';
}
function renderFunnelChart(){
  var el=document.getElementById('funnelChart');if(!el)return;
  var f=(state.data&&state.data.pipeline&&state.data.pipeline.funnel)||{};
  var rows=[['Queued',f.ebayQueued||0,COLORS.slate],['Comparing',f.ebayComparing||0,COLORS.blue],['Opportunities',f.ebayOpportunities||0,COLORS.green],['Active listings',f.activeListings||0,COLORS.teal]];
  var max=rows.reduce(function(m,r){return Math.max(m,r[1])},0);
  el.innerHTML='<div class="bs-funnel">'+rows.map(function(r){return bsBar(r[0],r[1],max,r[2])}).join('')+'</div><div class="bs-fnote"><span>Rejected '+esc(f.ebayRejected||0)+'</span><span>Manual review '+esc(f.ebayManualReview||0)+'</span><span>Errors '+esc(f.ebayErrors||0)+'</span></div>';
}
function bsDonut(segments,centerLabel){
  var total=segments.reduce(function(s,x){return s+(x.value||0)},0);
  var r=42,c=2*Math.PI*r,off=0,arcs='';
  if(total>0){segments.forEach(function(s){var len=((s.value||0)/total)*c;arcs+='<circle cx="60" cy="60" r="'+r+'" fill="none" stroke="'+s.color+'" stroke-width="13" stroke-dasharray="'+len.toFixed(1)+' '+(c-len).toFixed(1)+'" stroke-dashoffset="'+(-off).toFixed(1)+'" transform="rotate(-90 60 60)"/>';off+=len;});}
  else{arcs='<circle cx="60" cy="60" r="'+r+'" fill="none" stroke="rgba(148,163,184,.16)" stroke-width="13"/>';}
  return '<svg viewBox="0 0 120 120" width="116" height="116" role="img" aria-label="Outcome split, '+total+' total"><g>'+arcs+'</g><text x="60" y="57" text-anchor="middle" style="fill:var(--text)" font-size="20" font-weight="700">'+total+'</text><text x="60" y="74" text-anchor="middle" style="fill:var(--muted)" font-size="10">'+esc(centerLabel||'')+'</text></svg>';
}
function renderOutcomeChart(){
  var el=document.getElementById('outcomeChart');if(!el)return;
  var f=(state.data&&state.data.pipeline&&state.data.pipeline.funnel)||{};
  var segs=[{label:'Opportunities',value:f.ebayOpportunities||0,color:COLORS.green},{label:'Manual review',value:f.ebayManualReview||0,color:COLORS.amber},{label:'Rejected',value:f.ebayRejected||0,color:COLORS.red},{label:'Errors',value:f.ebayErrors||0,color:COLORS.slate}];
  el.innerHTML='<div style="display:flex;justify-content:center">'+bsDonut(segs,'outcomes')+'</div><div class="bs-donut-legend">'+segs.map(function(s){return '<span><span class="bs-dot" style="background:'+s.color+'"></span>'+esc(s.label)+' &middot; '+esc(s.value)+'</span>'}).join('')+'</div>';
}
function renderKeepaGauge(){
  var el=document.getElementById('keepaGauge');if(!el)return;
  var k=state.keepaToken;
  if(!k||k.tokensLeft===undefined||k.tokensLeft===null){el.innerHTML='<div class="bs-gauge"><div class="bs-gauge-sub">Keepa tokens unavailable</div></div>';return;}
  var left=Number(k.tokensLeft)||0;
  state.keepaTokenMax=Math.max(state.keepaTokenMax||0,left,1);
  var max=state.keepaTokenMax,pct=Math.max(0,Math.min(1,left/max));
  var color=left<60?COLORS.red:(left<200?COLORS.amber:COLORS.green);
  var r=42,c=2*Math.PI*r,len=pct*c;
  var sub=(k.refillRate!==undefined&&k.refillRate!==null)?('+'+k.refillRate+'/min &middot; peak ~'+max):('peak ~'+max);
  el.innerHTML='<div class="bs-gauge"><svg viewBox="0 0 120 120" width="116" height="116" role="img" aria-label="Keepa tokens '+left+' remaining of about '+max+'"><circle cx="60" cy="60" r="'+r+'" fill="none" stroke="rgba(148,163,184,.16)" stroke-width="13"/><circle cx="60" cy="60" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="13" stroke-linecap="round" stroke-dasharray="'+len.toFixed(1)+' '+(c-len).toFixed(1)+'" transform="rotate(-90 60 60)"/><text x="60" y="57" text-anchor="middle" style="fill:var(--text)" font-size="22" font-weight="700">'+left+'</text><text x="60" y="74" text-anchor="middle" style="fill:var(--muted)" font-size="10">tokens left</text></svg><div class="bs-gauge-sub">'+esc(sub)+'</div></div>';
}
function render(){
  var d=state.data;if(!d)return;
  var icons={productCandidates:['PC','rgba(14,165,233,.16)'],amazonMatches:['AM','rgba(20,184,166,.16)'],ebayListings:['EL','rgba(52,211,153,.16)'],orders:['OR','rgba(96,165,250,.16)'],actions:['RV','rgba(251,191,36,.16)'],purchases:['PU','rgba(45,212,191,.16)'],discoveryScans:['SC','rgba(45,212,191,.16)'],amazonScouts:['AS','rgba(20,184,166,.16)'],ebayDiscoveries:['ES','rgba(52,211,153,.16)'],ebayAmazonComparisons:['AC','rgba(14,165,233,.16)'],automationRuns:['AU','rgba(96,165,250,.16)'],automationNeedsConfirmation:['HC','rgba(251,191,36,.16)'],automationFailures:['!','rgba(248,113,113,.16)']};
  var labels={productCandidates:'Candidates',amazonMatches:'Amazon Matches',ebayListings:'Listings',orders:'Orders',actions:'Review Items',purchases:'Purchases',discoveryScans:'Scans',amazonScouts:'Amazon Scouts',ebayDiscoveries:'eBay Searches',ebayAmazonComparisons:'Amazon Compare Jobs',automationRuns:'Automation Runs',automationNeedsConfirmation:'Needs Confirm',automationFailures:'Automation Issues'};
  document.getElementById('stats').innerHTML=Object.keys(d.counts).map(function(k){
    var ic=icons[k]||['•','rgba(99,102,241,.18)'];
    return '<div class="stat" style="--gl:'+ic[1]+'"><div class="ic">'+ic[0]+'</div><div class="label">'+(labels[k]||k)+'</div><div class="count">'+d.counts[k]+'</div></div>';
  }).join('');
  renderJobActivity();
  renderPipeline();
  renderPlChart();renderFunnelChart();renderOutcomeChart();renderKeepaGauge();

  var actCols=[
    {key:'id',label:'ID',fmt:function(v){return shortId(v)}},
    {key:'type',label:'Type',fmt:badge},
    {key:'status',label:'Status',fmt:badge},
    {key:'payloadJson',label:'Mode',fmt:function(_v,r){return badge(actionMode(r))}},
    {key:'priority',label:'Pri'},
    {key:'reason',label:'Reason',cls:'truncate',fmt:function(v){return '<span class="truncate" title="'+esc(v||'')+'">'+txt(v)+'</span>'}},
    {key:'createdAt',label:'Created',fmt:when}
  ];
  document.getElementById('actionsTable').innerHTML=pagedTable('actions',d.actions,actCols,{selectKey:'id',noun:'review items'});
  document.getElementById('ovActions').innerHTML=table((d.actions||[]).slice(0,6),actCols,{selectKey:'id'});

  document.getElementById('automationRunsTable').innerHTML=pagedTable('automationRuns',d.automationRuns||[],[
    {key:'id',label:'Run',fmt:shortId},
    {key:'mode',label:'Mode',fmt:badge},
    {key:'status',label:'Status',fmt:badge},
    {key:'phase',label:'Phase',fmt:function(v){return '<span class="mono">'+esc(v||'—')+'</span>'}},
    {key:'riskScore',label:'Risk'},
    {key:'actionItem',label:'Action',fmt:function(v){return v?badge(v.type)+' '+shortId(v.id):'—'}},
    {key:'events',label:'Latest Event',cls:'truncate',fmt:function(_v,r){var e=latestEventText(r);return '<span class="truncate" title="'+esc(e)+'">'+esc(e)+'</span>'}},
    {key:'startedAt',label:'Started',fmt:when}
  ],{noun:'runs'});
  document.getElementById('automationComparisonRunsTable').innerHTML=amazonComparisonRunsTable('automationComparisonRuns',d.ebayAmazonComparisonRuns||[]);
  showPanel('automationComparisonRunsPanel',!!(d.ebayAmazonComparisonRuns&&d.ebayAmazonComparisonRuns.length));

  var listCols=[
    {key:'id',label:'ID',fmt:shortId},
    {key:'listingStatus',label:'Status',fmt:badge},
    {key:'listedPrice',label:'Price',fmt:money},
    {key:'title',label:'Title',fmt:function(v){return '<span class="truncate" title="'+esc(v||'')+'">'+txt(v)+'</span>'}},
    {key:'ebayItemId',label:'eBay Item',fmt:function(v){return v?'<span class="mono">'+esc(v)+'</span>':'—'}},
    {key:'updatedAt',label:'Updated',fmt:when}
  ];
  document.getElementById('listingsTable').innerHTML=pagedTable('listings',d.ebayListings,listCols,{noun:'listings'});
  document.getElementById('ovListings').innerHTML=table((d.ebayListings||[]).slice(0,6),listCols);

  document.getElementById('ordersTable').innerHTML=pagedTable('orders',d.orders,[
    {key:'ebayOrderId',label:'eBay Order',fmt:function(v){return '<span class="mono">'+esc(v||'—')+'</span>'}},
    {key:'orderStatus',label:'Status',fmt:badge},
    {key:'salePrice',label:'Sale',fmt:money},
    {key:'buyerName',label:'Buyer'},
    {key:'amazonOrderStatus',label:'Amazon'},
    {key:'createdAt',label:'Created',fmt:when}
  ],{noun:'orders'});

  document.getElementById('productsTable').innerHTML=pagedTable('products',d.productCandidates,[
    {key:'opportunityScore',label:'Score',fmt:function(v){return v===null||v===undefined?'—':'<b>'+esc(v)+'</b>'}},
    {key:'ebayTitle',label:'Title',fmt:function(v){return '<span class="truncate" title="'+esc(v||'')+'">'+txt(v)+'</span>'}},
    {key:'ebaySoldPrice',label:'eBay Price',fmt:money},
    {key:'discoveryProfile',label:'Profile'},
    {key:'safetyStatus',label:'Safety',fmt:badge},
    {key:'ebayCondition',label:'Condition'},
    {key:'createdAt',label:'Found',fmt:when}
  ],{noun:'candidates'});

  document.getElementById('scanRunsTable').innerHTML=pagedTable('scanRuns',d.discoveryScanRuns,[
    {key:'profileKey',label:'Profile'},
    {key:'status',label:'Status',fmt:badge},
    {key:'scannedCount',label:'Scanned'},
    {key:'acceptedCount',label:'Accepted'},
    {key:'rejectedCount',label:'Rejected'},
    {key:'startedAt',label:'Started',fmt:when}
  ],{noun:'runs'});
  document.getElementById('amazonScoutRunsTable').innerHTML=pagedTable('amazonScoutRuns',d.amazonDiscoveryRuns,[
    {key:'profileKey',label:'Profile'},
    {key:'categoryKey',label:'Category'},
    {key:'status',label:'Status',fmt:badge},
    {key:'scannedCount',label:'Scanned'},
    {key:'acceptedCount',label:'Accepted'},
    {key:'comparedCount',label:'Compared'},
    {key:'opportunityCount',label:'Opps'},
    {key:'error',label:'Error',fmt:function(v){return v?'<span class="truncate" title="'+esc(v)+'">'+esc(v)+'</span>':'—'}},
    {key:'startedAt',label:'Started',fmt:when}
  ],{noun:'runs'});
  if((d.amazonDiscoveryCandidates||[]).length&&!state.amazonScoutCandidates.length&&!state.amazonScoutRejected.length)renderAmazonScoutReport(d.amazonDiscoveryCandidates,[],false);
  document.getElementById('ebayDiscoveryRunsTable').innerHTML=pagedTable('ebayDiscoveryRuns',d.ebayDiscoveryRuns,[
    {key:'profileKey',label:'Profile'},
    {key:'categoryKey',label:'Category'},
    {key:'status',label:'Status',fmt:badge},
    {key:'scannedCount',label:'Scanned'},
    {key:'acceptedCount',label:'Accepted'},
    {key:'comparedCount',label:'Compared'},
    {key:'opportunityCount',label:'Opps'},
    {key:'error',label:'Error',fmt:function(v){return v?'<span class="truncate" title="'+esc(v)+'">'+esc(v)+'</span>':'—'}},
    {key:'startedAt',label:'Started',fmt:when}
  ],{noun:'runs'});
  showPanel('ebayRunsPanel',!!(d.ebayDiscoveryRuns&&d.ebayDiscoveryRuns.length));
  document.getElementById('ebayAmazonComparisonRunsTable').innerHTML=amazonComparisonRunsTable('ebayAmazonComparisonRuns',d.ebayAmazonComparisonRuns||[]);
  showPanel('ebayCompareRunsPanel',!!(d.ebayAmazonComparisonRuns&&d.ebayAmazonComparisonRuns.length));
  if((d.ebayDiscoveryCandidates||[]).length&&!state.ebayDiscoveryCandidates.length&&!state.ebayDiscoveryRejected.length)renderEbayDiscoveryReport(d.ebayDiscoveryCandidates,[],false);
  refreshDiscoveryRows();
  renderDiscoverMode();

  var rc=d.ruleConfig||{};
  if(rc.amazonPriceCheckIntervalMinutes)document.getElementById('interval').value=rc.amazonPriceCheckIntervalMinutes;
  if(rc.ebayDiscoveryAutoRunEnabled!==undefined)document.getElementById('ebayAutoRunEnabled').checked=!!rc.ebayDiscoveryAutoRunEnabled;
  if(rc.ebayDiscoveryAutoRunIntervalMinutes)document.getElementById('ebayAutoRunInterval').value=rc.ebayDiscoveryAutoRunIntervalMinutes;
  if(rc.ebayDiscoveryAutoRunLimit)document.getElementById('ebayAutoRunLimit').value=rc.ebayDiscoveryAutoRunLimit;
  if(rc.ebayAmazonCompareAutoRunEnabled!==undefined)document.getElementById('ebayAmazonCompareEnabled').checked=!!rc.ebayAmazonCompareAutoRunEnabled;
  if(rc.ebayAmazonCompareAutoRunIntervalMinutes)document.getElementById('ebayAmazonCompareInterval').value=rc.ebayAmazonCompareAutoRunIntervalMinutes;
  if(rc.ebayAmazonCompareAutoRunLimit)document.getElementById('ebayAmazonCompareLimit').value=rc.ebayAmazonCompareAutoRunLimit;
  document.getElementById('settingsSafeMode').checked=!!rc.safeMode;
  if(rc.thresholds&&rc.thresholds.minimumProfitUsd!==undefined)document.getElementById('settingsMinProfit').value=rc.thresholds.minimumProfitUsd;
  if(rc.thresholds&&rc.thresholds.minimumRoiPercent!==undefined)document.getElementById('settingsMinRoi').value=rc.thresholds.minimumRoiPercent;
  if(rc.thresholds&&rc.thresholds.minimumMatchConfidence!==undefined)document.getElementById('settingsMinMatch').value=Math.round(Number(rc.thresholds.minimumMatchConfidence||0)*100);
  if(rc.minimumOpportunityScore!==undefined)document.getElementById('settingsMinScore').value=rc.minimumOpportunityScore;
  if(rc.maxAmazonCostUsd!==undefined)document.getElementById('settingsMaxCost').value=rc.maxAmazonCostUsd;
  document.getElementById('settingsBlockedCategories').value=lineText(rc.blockedCategories);
  document.getElementById('settingsBlockedKeywords').value=lineText(rc.blockedKeywords);
  if(rc.minimumOpportunityScore!==undefined)document.getElementById('scanMinScore').value=rc.minimumOpportunityScore;
  if(rc.maxAmazonCostUsd!==undefined)document.getElementById('scanMaxCost').value=rc.maxAmazonCostUsd;
  document.getElementById('scanSafeMode').checked=!!rc.safeMode;
  if(rc.maxAmazonCostUsd!==undefined)document.getElementById('amazonScoutMaxCost').value=rc.maxAmazonCostUsd;
  if(rc.minimumOpportunityScore!==undefined)document.getElementById('amazonScoutMinCompareScore').value=rc.minimumOpportunityScore;
  if(rc.thresholds&&rc.thresholds.minimumProfitUsd!==undefined)document.getElementById('amazonScoutMinProfit').value=rc.thresholds.minimumProfitUsd;
  if(rc.thresholds&&rc.thresholds.minimumRoiPercent!==undefined)document.getElementById('amazonScoutMinRoi').value=rc.thresholds.minimumRoiPercent;
  if(rc.thresholds&&rc.thresholds.minimumMatchConfidence!==undefined)document.getElementById('amazonScoutMinMatch').value=Math.round(Number(rc.thresholds.minimumMatchConfidence||0)*100);
  document.getElementById('amazonScoutSafeMode').checked=!!rc.safeMode;
  if(rc.minimumOpportunityScore!==undefined)document.getElementById('ebayDiscoveryMinCompareScore').value=rc.minimumOpportunityScore;
  if(rc.thresholds&&rc.thresholds.minimumProfitUsd!==undefined)document.getElementById('ebayDiscoveryMinProfit').value=rc.thresholds.minimumProfitUsd;
  if(rc.thresholds&&rc.thresholds.minimumRoiPercent!==undefined)document.getElementById('ebayDiscoveryMinRoi').value=rc.thresholds.minimumRoiPercent;
  if(rc.thresholds&&rc.thresholds.minimumMatchConfidence!==undefined)document.getElementById('ebayDiscoveryMinMatch').value=Math.round(Number(rc.thresholds.minimumMatchConfidence||0)*100);
  document.getElementById('ebayDiscoverySafeMode').checked=!!rc.safeMode;
  var prettySet={minimumProfitUsd:'Min Profit',minimumRoiPercent:'Min ROI %',minimumMatchConfidence:'Min Match %',minimumOpportunityScore:'Min Opportunity Score',safeMode:'Safe Mode',maxAmazonCostUsd:'Max Amazon Cost',estimatedSalesTaxRate:'Est. Sales Tax Rate',returnRiskBuffer:'Return Risk Buffer',priceChangeBuffer:'Price Change Buffer',maxDailyListings:'Max Daily Listings',maxDailyPurchaseAmountUsd:'Max Daily Spend',amazonPriceCheckIntervalMinutes:'Price-Check Interval (min)'};
  var settingValue=function(k){return rc[k]!==undefined&&rc[k]!==null?rc[k]:(rc.thresholds&&rc.thresholds[k]!==undefined&&rc.thresholds[k]!==null?rc.thresholds[k]:undefined)};
  var settingDisplay=function(k,v){
    if(k==='minimumMatchConfidence')return Math.round(Number(v||0)*100)+'%';
    if(['minimumProfitUsd','maxAmazonCostUsd','maxDailyPurchaseAmountUsd'].includes(k))return '$'+Number(v||0).toFixed(2);
    return v;
  };
  document.getElementById('settingsKv').innerHTML=Object.keys(prettySet).filter(function(k){var v=settingValue(k);return v!==undefined&&v!==null}).map(function(k){
    return '<div class="k">'+prettySet[k]+'</div><div class="v">'+esc(settingDisplay(k,settingValue(k)))+'</div>';
  }).join('')||'<div class="empty" style="grid-column:span 2">No active rule config.</div>';

  document.querySelectorAll('[data-select]').forEach(function(tr){tr.onclick=function(){selectAction(tr.getAttribute('data-select'))}});
  document.getElementById('updatedPill').textContent='Updated '+new Date().toLocaleTimeString();
}

function activeNavView(view){return view==='discovery'?'ebayDiscovery':view}
function updateActionButtons(){
  var id=(document.getElementById('actionId').value||'').trim();
  document.querySelectorAll('.requires-action').forEach(function(btn){btn.disabled=!id});
  var title=document.getElementById('reviewSelectionTitle');
  var copy=document.getElementById('reviewSelectionCopy');
  var tag=document.getElementById('selTag');
  if(title)title.textContent=id?'Selected action':'No action selected';
  if(copy)copy.innerHTML=id?'Review <span class="mono">'+esc(id)+'</span>, then choose one next step.':'Click a queue row to approve, verify, draft, execute, complete, or reject it.';
  if(tag)tag.innerHTML=id?'Selected: <b>'+esc(id)+'</b>':'';
}
function selectAction(id){document.getElementById('actionId').value=id;updateActionButtons();navigate('actions')}

  function navigate(view){
    if(view==='discovery'){
      state.discoverMode='queue';
    }
    var navView=activeNavView(view);
    var previousActive=document.querySelector('.view.active');
    var targetView='view-'+navView;
    document.querySelectorAll('.nav-item').forEach(function(n){var on=n.getAttribute('data-view')===navView;n.classList.toggle('active',on);if(on){n.setAttribute('aria-current','page')}else{n.removeAttribute('aria-current')}});
    document.querySelectorAll('.view').forEach(function(v){v.classList.toggle('active',v.id===targetView)});
    if(!previousActive||previousActive.id!==targetView){
      window.scrollTo({top:0,left:0,behavior:'auto'});
      var main=document.querySelector('main');if(main)main.scrollTop=0;
    }
    var mobile=document.getElementById('mobileNav');if(mobile)mobile.value=navView;
    var meta=META[view]||META[navView];
    document.getElementById('viewTitle').textContent=meta[0];
    document.getElementById('viewSub').textContent=meta[1];
    if(navView==='ebayDiscovery'){renderDiscoverMode();loadDashboardDiscoveryRows();}
    if(navView==='settings'){loadCredentials();loadAlerts();}
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
  var testBtn=c.source!=='unset'?'<button class="btn ghost sm" onclick="testCred(\\''+c.key+'\\')">Test</button>':'';
  return '<div class="cred-row"><div class="cred-meta"><div class="cred-label">'+esc(c.label)+' '+credBadge(c.source)+'</div>'+help+'</div>'+
    '<div class="cred-input">'+input+'</div><div class="cred-actions"><button class="btn primary sm" onclick="saveCred(\\''+c.key+'\\')">Save</button>'+testBtn+clearBtn+'</div></div>';
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
      if(r.status===401){state.setup.backendSecret='ok';updateSetupChecklist();document.getElementById('keysLocked').style.display='flex';document.getElementById('credsContainer').innerHTML='<div class="empty">Locked. Sign in again to refresh the dashboard session.</div>';return null}
      if(r.status===503){state.setup.backendSecret='missing';updateSetupChecklist();document.getElementById('keysLocked').style.display='flex';document.getElementById('credsContainer').innerHTML='<div class="empty">Protected routes are not configured. Set LOCAL_AGENT_SHARED_SECRET on the backend first.</div>';return null}
      state.setup.backendSecret='ok';updateSetupChecklist();
      document.getElementById('keysLocked').style.display='none';return responseJson(r);
    }).then(function(j){if(j)renderCredentials(j.credentials)}).catch(function(e){document.getElementById('credsContainer').innerHTML='<div class="empty">Could not load credentials: '+esc(e.message)+'</div>'});
  }
  function putCred(key,value,okMsg){
    return apiFetch('/api/credentials/'+encodeURIComponent(key),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({value:value})}).then(function(r){
      if(r.status===401){document.getElementById('keysLocked').style.display='flex';throw new Error('Unauthorized — sign in again to refresh the dashboard session')}
      if(r.status===503){document.getElementById('keysLocked').style.display='flex';throw new Error('Protected routes are not configured — set LOCAL_AGENT_SHARED_SECRET on the backend first')}
      return responseJson(r);
    }).then(function(){toast(okMsg,key,'ok');loadCredentials()}).catch(function(e){toast('Save failed',e.message,'err')});
  }
function saveCred(key){var el=document.getElementById('cred_'+key);putCred(key,el?el.value:'','Credential saved')}
function clearCred(key){putCred(key,'','Credential cleared')}
function testCred(key){apiFetch('/api/credentials/'+encodeURIComponent(key)+'/test',{method:'POST'}).then(responseJson).then(function(res){toast('Credential check',res.check||res,'ok')}).catch(function(e){toast('Credential check failed',e.message,'err')})}
function notifIcon(kind){
  if(kind==='high')return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
  if(kind==='medium')return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
  if(kind==='info')return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>';
  return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
}
function severityKind(sev){sev=String(sev||'low').toLowerCase();if(sev==='high'||sev==='critical')return 'high';if(sev==='medium'||sev==='warn'||sev==='warning')return 'medium';if(sev==='info')return 'info';return 'low';}
function severityColor(kind){return kind==='high'?COLORS.red:(kind==='medium'?COLORS.amber:(kind==='info'?COLORS.blue:COLORS.slate));}
function renderAlerts(alerts){
  var html;
  if(!alerts||!alerts.length){html='<div class="empty">No operational alerts right now.</div>';}
  else{html=alerts.map(function(a){
    var kind=severityKind(a.severity);var col=severityColor(kind);
    return '<div class="notif" style="border-left-color:'+col+'"><span class="notif-ic" style="color:'+col+'">'+notifIcon(kind)+'</span><div class="notif-main"><div class="notif-title">'+esc(a.code||'ALERT')+'</div><div class="notif-msg">'+esc(a.message||'')+'</div></div><span class="badge" style="color:'+col+';background:'+col+'1f;border-color:'+col+'40">'+esc(String(a.severity||'low').toLowerCase())+'</span></div>';
  }).join('');}
  ['alertsBox','notificationsBox'].forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML=html;});
}
function loadAlerts(){apiJson('/api/alerts').then(function(res){renderAlerts(res.alerts||[])}).catch(function(e){var h='<div class="empty">Could not load alerts: '+esc(e.message)+'</div>';['alertsBox','notificationsBox'].forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML=h;});})}
function saveNotifPrefs(){
  try{
    var chk=function(id){var el=document.getElementById(id);return !!(el&&el.checked);};
    var p={webhook:inputValue('notifWebhook'),email:chk('notifEmail'),opp:chk('notifOpp'),pause:chk('notifPause'),fail:chk('notifFail'),keepa:chk('notifKeepa'),buy:chk('notifBuy'),minProfit:inputValue('notifMinProfit')};
    localStorage.setItem('buysell.notifPrefs',JSON.stringify(p));
    toast('Notification preferences saved','Stored locally on this browser. Webhook/email dispatch is a backend follow-up.','ok');
  }catch(e){toast('Could not save preferences',String((e&&e.message)||e),'err');}
}
function loadNotifPrefs(){
  try{
    var raw=localStorage.getItem('buysell.notifPrefs');if(!raw)return;
    var p=JSON.parse(raw)||{};
    var setVal=function(id,v){var el=document.getElementById(id);if(el&&v!==undefined&&v!==null)el.value=v;};
    var setChk=function(id,v){var el=document.getElementById(id);if(el)el.checked=!!v;};
    setVal('notifWebhook',p.webhook);setVal('notifMinProfit',p.minProfit);
    setChk('notifEmail',p.email);setChk('notifOpp',p.opp);setChk('notifPause',p.pause);setChk('notifFail',p.fail);setChk('notifKeepa',p.keepa);setChk('notifBuy',p.buy);
  }catch(e){}
}
function downloadExport(entity){window.location.href='/api/export/'+encodeURIComponent(entity)+'?format=csv&take=5000'}

function setDb(connected,msg){
  var dot=document.getElementById('dbDot'),lbl=document.getElementById('dbLabel');
  dot.className='dot '+(connected?'on':'off');
  lbl.textContent=connected?'Postgres connected':'DB disconnected';
  if(!connected&&msg)lbl.title=msg;
  state.setup.db=!!connected;
  updateSetupChecklist();
}

function checkDb(){
  fetch('/api/health/db').then(function(r){return r.json()}).then(function(j){setDb(!!j.connected,j.error)}).catch(function(){setDb(false)});
}

  function load(){
    updateSetupChecklist();
    checkDb();
    loadAlerts();
    apiJson('/api/dashboard').then(function(data){
      state.data=data;state.discoveryRowsLoaded=!!data.allEbayDiscoveryCandidatesLoaded;state.discoveryRowsLoading=false;state.setup.dashboard=true;state.setup.backendSecret='ok';document.getElementById('offline').classList.remove('show');updateSetupChecklist();render();
      if(document.getElementById('view-ebayDiscovery')&&document.getElementById('view-ebayDiscovery').classList.contains('active'))loadDashboardDiscoveryRows();
    }).catch(function(e){
      state.setup.dashboard=false;
      state.setup.backendSecret=e.status===503?'missing':(e.status===401?'ok':state.setup.backendSecret);
      updateSetupChecklist();
      renderJobActivity();
      var authHint=e.status===401?' Save the shared secret in Settings.':(e.status===503?' Configure LOCAL_AGENT_SHARED_SECRET on the backend first.':' Check the database connection.');
      document.getElementById('offlineMsg').textContent='Setup needed: '+e.message+'.'+authHint;
      document.getElementById('offline').classList.add('show');
    });
  }

  function logoutDashboard(){apiFetch('/dashboard/logout',{method:'POST'}).then(function(){window.location.href='/' }).catch(function(){window.location.href='/'})}
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
    clearLocalJobsByCategory('comparison');
    toast('Amazon comparison auto-run stopped',res,'ok');
    load();
  }).catch(function(e){toast('Stop failed',e.message,'err')});
}
function deleteEbayAmazonCompareAutoRun(){
  if(!confirmAction('Delete Amazon comparison auto-run job?','This disables the scheduled Amazon comparison job and resets its interval and product count to defaults. Product data and past completed runs are kept.'))return;
  apiJson('/api/ebay-discovery/amazon-compare-auto-run/delete',{method:'POST'}).then(function(res){
    clearLocalJobsByCategory('comparison');
    toast('Amazon comparison auto-run deleted',res,'ok');
    load();
  }).catch(function(e){toast('Delete failed',e.message,'err')});
}
function runEbayAutoNow(){
  beginLocalJob('ebayAutoNow','eBay discovery scan running','Using auto-run settings','discovery');
  toast('Running scheduled eBay discovery','Using auto-run settings');
  jpost('/api/ebay-discovery/auto-run/run',{}).then(function(res){
    toast('Scheduled eBay discovery complete',res,'ok');
    endLocalJob('ebayAutoNow');
    load();
  }).catch(function(e){endLocalJob('ebayAutoNow');toast('Scheduled run failed',e.message,'err')});
}
function runEbayAmazonCompareNow(){
  beginLocalJob('ebayAmazonCompareNow','Amazon comparison running','Using the highest-score queued eBay products','comparison');
  toast('Running Amazon comparison','Using the highest-score queued eBay products');
  jpost('/api/ebay-discovery/amazon-compare-auto-run/run',{}).then(function(res){
    var resultToast=comparisonRunToast(res);
    toast(resultToast.title,resultToast.message,resultToast.kind);
    loadKeepaTokenStatus();
    endLocalJob('ebayAmazonCompareNow');
    load();
  }).catch(function(e){endLocalJob('ebayAmazonCompareNow');toast('Comparison run failed',e.message,'err')});
}
function startEbayAmazonCompareQueue(){
  beginLocalJob('ebayAmazonCompareStart','Amazon comparison queue starting','Enabling schedule and running the first batch','comparison');
  toast('Starting Amazon comparison queue','Enabling the schedule and running the first batch');
  jpost('/api/ebay-discovery/amazon-compare-auto-run/start',{}).then(function(res){
    toast('Amazon comparison queue started',comparisonStartSummary(res),'ok');
    loadKeepaTokenStatus();
    endLocalJob('ebayAmazonCompareStart');
    load();
  }).catch(function(e){endLocalJob('ebayAmazonCompareStart');toast('Start queue failed',e.message,'err')});
}
function saveThresholds(){
  var minProfit=Number(document.getElementById('settingsMinProfit').value||0);
  var minRoi=Number(document.getElementById('settingsMinRoi').value||0);
  var minMatch=Number(document.getElementById('settingsMinMatch').value||0);
  var minScore=Number(document.getElementById('settingsMinScore').value||65);
  var maxCost=Number(document.getElementById('settingsMaxCost').value||150);
  if(!Number.isFinite(minProfit)||minProfit<0)return toast('Invalid minimum profit','Use 0 or higher.','warn');
  if(!Number.isFinite(minRoi)||minRoi<0||minRoi>500)return toast('Invalid minimum ROI','Use 0 to 500 percent.','warn');
  if(!Number.isFinite(minMatch)||minMatch<0||minMatch>100)return toast('Invalid minimum match','Use 0 to 100 percent.','warn');
  if(!Number.isFinite(minScore)||minScore<0||minScore>100)return toast('Invalid minimum score','Use 0 to 100.','warn');
  if(!Number.isFinite(maxCost)||maxCost<=0)return toast('Invalid max Amazon cost','Use a value above 0.','warn');
  var body={
    minimumProfitUsd:minProfit,
    minimumRoiPercent:minRoi,
    minimumMatchConfidence:minMatch/100,
    minimumOpportunityScore:Math.round(minScore),
    maxAmazonCostUsd:maxCost
  };
  apiJson('/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(){
    toast('Thresholds saved','Manual and scheduled discovery will use the updated values.','ok');
    load();
  }).catch(function(e){toast('Save failed',e.message,'err')});
}
function saveSafety(){
  var body={
    safeMode:document.getElementById('settingsSafeMode').checked,
    blockedCategories:lines(document.getElementById('settingsBlockedCategories').value),
    blockedKeywords:lines(document.getElementById('settingsBlockedKeywords').value)
  };
    apiJson('/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(){toast('Safety rules saved',null,'ok');load()}).catch(function(e){toast('Save failed',e.message,'err')});
  }
  function runMonitor(){if(!confirmAction('Run Amazon price check now?','This can pause internal listings and create PAUSE actions when source prices rise.'))return;beginLocalJob('priceMonitor','Amazon price check running','Scanning active listings','automation');toast('Running price check','Scanning active listings…');
    jpost('/api/monitor/amazon-prices/run',{}).then(function(res){toast('Price check complete',res,'ok');endLocalJob('priceMonitor');load()}).catch(function(e){endLocalJob('priceMonitor');toast('Price check failed',e.message,'err')})}
  function idempotencyKey(prefix){return prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2)}
  function actId(){var id=document.getElementById('actionId').value.trim();if(!id)toast('No action selected','Click a row or paste an Action ID.','warn');return id}
  function updateAction(status){var id=actId();if(!id)return;if(!confirmAction(status.charAt(0)+status.slice(1).toLowerCase()+' this action?',id))return;apiFetch('/actions/'+encodeURIComponent(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:status,reviewedBy:'dashboard'})}).then(responseJson).then(function(){toast('Action '+status.toLowerCase(),id,'ok');load()}).catch(function(e){toast('Update failed',e.message,'err')})}
  function approveAction(){updateAction('APPROVED')}
  function rejectAction(){updateAction('REJECTED')}
  function completeSelectedAction(){updateAction('COMPLETED')}
  function executeAction(){var id=actId();if(!id)return;if(!confirmAction('Execute this approved action?',id,'EXECUTE'))return;apiFetch('/actions/'+encodeURIComponent(id)+'/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor:'dashboard',idempotencyKey:idempotencyKey('execute')})}).then(responseJson).then(function(res){toast('Action executed',res,'ok');load()}).catch(function(e){toast('Execute failed',e.message,'err')})}
  function recordActionFeedback(){var id=actId();if(!id)return;var type=document.getElementById('feedbackType').value;var reason=document.getElementById('feedbackReason').value.trim();apiFetch('/actions/'+encodeURIComponent(id)+'/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({feedbackType:type,reasonText:reason||undefined,reasonCode:type,weight:type==='GOOD_OPPORTUNITY'?2:-1})}).then(responseJson).then(function(res){toast('Feedback saved',res.feedback&&res.feedback.feedbackType,'ok');document.getElementById('feedbackReason').value='';load()}).catch(function(e){toast('Feedback failed',e.message,'err')})}
  function queueAutomation(mode){
    var id=actId();if(!id)return;
    var detail=mode==='AUTOPILOT'?'Autopilot allows a configured local agent to complete the final marketplace action. Backend limits and agent config still apply.':id;
    if(!confirmAction('Queue '+mode+' automation?',detail,mode==='AUTOPILOT'?'AUTOPILOT':undefined))return;
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
  beginLocalJob('amazonScout','Amazon scout running',profile+(q?' · '+q:'')+' · '+category,'discovery');
  toast('Running Amazon Scout',profile+' · '+category);
  jpost('/amazon-discovery/run',body).then(function(res){
    state.amazonScoutRunId=res.run&&res.run.id;
    state.selectedAmazon={};
    renderAmazonScoutReport((res.run&&res.run.candidates)||[],res.rejected||[],false);
    document.getElementById('amazonScoutSummary').textContent='Scanned '+(res.summary.scanned||0)+' · accepted '+(res.summary.accepted||0)+' · review '+(res.summary.manualReviews||0)+' · source rejected '+(res.summary.sourceRejected||0)+' · rejected '+(res.summary.rejected||0)+' · compared '+(res.summary.compared||0)+' · opportunities '+(res.summary.opportunities||0);
    toast('Amazon Scout complete',{summary:res.summary,rejectionBreakdown:res.rejectionBreakdown||[]},'ok');
    loadKeepaTokenStatus();
    endLocalJob('amazonScout');
    load();
  }).catch(function(e){endLocalJob('amazonScout');renderKeepaTokenFromPayload(e.payload);loadKeepaTokenStatus();toast('Amazon Scout failed',e.message,'err')});
}
function compareSelectedAmazon(){
  var ids=selectedAmazonIds();
  if(!ids.length)return toast('No accepted candidates selected','Only accepted Amazon candidates can be compared with eBay.','warn');
  beginLocalJob('amazonEbayCompare','eBay comparison running',ids.length+' selected Amazon products','comparison');
  toast('Comparing with eBay',ids.length+' selected products');
  jpost('/amazon-discovery/compare',{candidateIds:ids,limit:ids.length,marketKey:document.getElementById('amazonScoutMarket').value||'de',ebayComparison:amazonComparisonPayload()}).then(function(res){
    toast('eBay comparison complete',{compared:res.compared,opportunities:(res.opportunities||[]).length,manualReviews:(res.manualReviews||[]).length,rejected:(res.rejected||[]).length},'ok');
    state.amazonScoutCandidates=[];
    state.amazonScoutReview=[];
    state.amazonScoutRejected=[];
    state.selectedAmazon={};
    endLocalJob('amazonEbayCompare');
    load();
  }).catch(function(e){endLocalJob('amazonEbayCompare');toast('Comparison failed',e.message,'err')});
}
function recompareAmazonCandidate(id){
  beginLocalJob('amazonRecompare','eBay recompare running','One Amazon candidate','comparison');
  toast('Recomparing with eBay','Using the current comparison filters');
  jpost('/amazon-discovery/compare',{candidateIds:[id],limit:1,force:true,marketKey:document.getElementById('amazonScoutMarket').value||'de',ebayComparison:amazonComparisonPayload()}).then(function(res){
    toast('Recompare complete',{compared:res.compared,opportunities:(res.opportunities||[]).length,manualReviews:(res.manualReviews||[]).length,rejected:(res.rejected||[]).length},'ok');
    state.amazonScoutCandidates=[];state.amazonScoutReview=[];state.amazonScoutRejected=[];state.selectedAmazon={};
    endLocalJob('amazonRecompare');
    load();
  }).catch(function(e){endLocalJob('amazonRecompare');toast('Recompare failed',e.message,'err')});
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
  beginLocalJob('ebayDiscovery','eBay discovery scan running',profile+(q?' · '+q:'')+' · '+category,'discovery');
  toast('Searching eBay sold products',profile+' · '+category);
  jpost('/ebay-discovery/run',body).then(function(res){
    state.ebayDiscoveryRunId=res.run&&res.run.id;
    state.selectedEbay={};
    renderEbayDiscoveryReport((res.run&&res.run.candidates)||[],res.rejected||[],false);
    document.getElementById('ebayDiscoverySummary').textContent='Scanned '+(res.summary.scanned||0)+' · accepted '+(res.summary.accepted||0)+' · review '+(res.summary.manualReviews||0)+' · source dropped '+(res.summary.sourceDropped||0)+' · auctions '+(res.summary.auctionDropped||0)+' · no price '+(res.summary.missingPriceDropped||0)+' · rejected '+(res.summary.rejected||0)+' · skipped known '+(res.summary.skippedExisting||0)+' · compared '+(res.summary.compared||0)+' · opportunities '+(res.summary.opportunities||0);
    renderEbayCompactProducts((res.run&&res.run.candidates)||[]);
    toast('eBay search complete',{summary:res.summary,rejectionBreakdown:res.rejectionBreakdown||[]},'ok');
    loadKeepaTokenStatus();
    endLocalJob('ebayDiscovery');
    load();
  }).catch(function(e){endLocalJob('ebayDiscovery');renderKeepaTokenFromPayload(e.payload);loadKeepaTokenStatus();toast('eBay Discovery failed',e.message,'err')});
}
function compareSelectedEbay(){
  var ids=selectedEbayIds();
  if(!ids.length)return toast('No accepted candidates selected','Only accepted eBay candidates can be compared with Amazon.','warn');
  beginLocalJob('ebayAmazonCompare','Amazon comparison running',ids.length+' selected eBay products','comparison');
  toast('Comparing with Amazon',ids.length+' selected products');
  jpost('/ebay-discovery/compare',{candidateIds:ids,limit:ids.length,marketKey:document.getElementById('ebayDiscoveryMarket').value||'de',amazonMatchLimit:Number(document.getElementById('ebayDiscoveryAmazonMatches').value||3),comparison:ebayDiscoveryComparisonPayload()}).then(function(res){
    toast('Amazon comparison complete',{compared:res.compared,opportunities:(res.opportunities||[]).length,manualReviews:(res.manualReviews||[]).length,rejected:res.rejectedCount!==undefined?res.rejectedCount:(res.rejected||[]).length},'ok');
    state.ebayDiscoveryCandidates=[];
    state.ebayDiscoveryReview=[];
    state.ebayDiscoveryRejected=[];
    state.selectedEbay={};
    endLocalJob('ebayAmazonCompare');
    load();
  }).catch(function(e){endLocalJob('ebayAmazonCompare');toast('Comparison failed',e.message,'err')});
}
function recompareEbayCandidate(id){
  beginLocalJob('ebayAmazonRecompare','Amazon recompare running','One eBay candidate','comparison');
  toast('Recomparing with Amazon','Using the current comparison gates');
  jpost('/ebay-discovery/compare',{candidateIds:[id],limit:1,force:true,marketKey:document.getElementById('ebayDiscoveryMarket').value||'de',amazonMatchLimit:Number(document.getElementById('ebayDiscoveryAmazonMatches').value||3),comparison:ebayDiscoveryComparisonPayload()}).then(function(res){
    toast('Recompare complete',{compared:res.compared,opportunities:(res.opportunities||[]).length,manualReviews:(res.manualReviews||[]).length,rejected:res.rejectedCount!==undefined?res.rejectedCount:(res.rejected||[]).length},'ok');
    state.ebayDiscoveryCandidates=[];state.ebayDiscoveryReview=[];state.ebayDiscoveryRejected=[];state.selectedEbay={};
    endLocalJob('ebayAmazonRecompare');
    load();
  }).catch(function(e){endLocalJob('ebayAmazonRecompare');toast('Recompare failed',e.message,'err')});
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
  beginLocalJob('guidedScan','Guided scan running',profile+(q?' · '+q:''),'discovery');
  toast('Scanning',profile+(q?' · '+q:''));
  jpost('/opportunities/scan',body).then(function(res){renderScanResults(res);toast('Scan complete',res.summary,'ok');endLocalJob('guidedScan');load()}).catch(function(e){endLocalJob('guidedScan');toast('Scan failed',e.message,'err')})
}
  function createOrder(){var orderId=document.getElementById('orderEbayOrderId').value;if(!confirmAction('Create BUY action from this eBay order?',orderId||'New manual order'))return;jpost('/orders/ebay/manual',{ebayOrderId:orderId,ebayItemId:document.getElementById('orderEbayItemId').value,buyerName:document.getElementById('orderBuyerName').value,buyerShippingAddress:{enteredInDashboard:true},salePrice:Number(document.getElementById('orderSalePrice').value)}).then(function(res){toast('Order created',res,'ok');load()}).catch(function(e){toast('Create failed',e.message,'err')})}
  function syncEbayOrders(){if(!confirmAction('Sync recent eBay orders?','This fetches recent eBay orders and creates BUY actions for known listings.'))return;jpost('/orders/ebay/sync',{lookbackHours:24,limit:50}).then(function(res){toast('eBay order sync complete',res,'ok');load()}).catch(function(e){toast('Sync failed',e.message,'err')})}
  function recordPurchase(){var orderId=document.getElementById('purchaseOrderId').value;if(!confirmAction('Record this Amazon purchase?',orderId||'Selected internal order','PURCHASE'))return;apiFetch('/orders/'+encodeURIComponent(orderId)+'/amazon-purchase',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({asin:document.getElementById('purchaseAsin').value,amazonOrderId:document.getElementById('purchaseAmazonOrderId').value,purchasePrice:Number(document.getElementById('purchasePrice').value),status:'PURCHASED'})}).then(responseJson).then(function(res){toast('Purchase recorded',res,'ok');load()}).catch(function(e){toast('Record failed',e.message,'err')})}

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
loadNotifPrefs();
load();
setInterval(checkDb,30000);
setInterval(load,30000);
setInterval(loadKeepaTokenStatus,60000);
</script>
</body>
</html>`;

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (request, reply) => {
    if (!(await verifyDashboardSessionRequest(prisma, request))) {
      return reply.type('text/html').send(dashboardLoginHtml);
    }
    return reply.type('text/html').send(dashboardHtml);
  });
  app.post('/dashboard/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Shared secret is required.' });
    const cookies = await createDashboardSessionHeaders(prisma, parsed.data.secret);
    if (!cookies) return reply.status(401).send({ error: 'Invalid shared secret.' });
    setCookieHeaders(reply, cookies);
    return { ok: true };
  });
  app.post('/dashboard/logout', async (request, reply) => {
    await revokeDashboardSessionRequest(prisma, request);
    setCookieHeaders(reply, clearDashboardSessionHeaders());
    return { ok: true };
  });
  app.get('/favicon.ico', async (_request, reply) => reply.status(204).send(null));
}
