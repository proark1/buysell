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
  amazonPriceCheckIntervalMinutes: z.number().int().positive().optional()
});

const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Buysell Dashboard</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;margin:0;background:#0f172a;color:#e2e8f0}header{padding:24px;background:#111827;border-bottom:1px solid #334155}main{padding:24px;display:grid;gap:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:16px}.count{font-size:34px;font-weight:800}.row{display:flex;gap:12px;flex-wrap:wrap}button,input{border-radius:10px;border:1px solid #475569;padding:10px;background:#0f172a;color:#e2e8f0}button{cursor:pointer;background:#2563eb;border-color:#2563eb}pre{white-space:pre-wrap;max-height:340px;overflow:auto;background:#020617;padding:12px;border-radius:10px}.danger{background:#dc2626;border-color:#dc2626}.ok{color:#86efac}a{color:#93c5fd}</style>
</head>
<body>
<header><h1>Buysell Control Center</h1><p>Products, listings, orders, actions, rules, and Amazon price protection.</p></header>
<main>
  <section class="card"><h2>Connection</h2><p>If LOCAL_AGENT_SHARED_SECRET is set, enter it here so dashboard action/order calls are accepted.</p><div class="row"><input id="agentSecret" type="password" placeholder="Local agent secret"><button onclick="saveSecret()">Save secret</button><button onclick="clearSecret()">Clear</button></div></section>
  <section class="grid" id="counts"></section>
  <section class="card"><h2>Actions</h2><div class="row"><button onclick="load()">Refresh</button><button class="danger" onclick="runMonitor()">Run Amazon Price Check Now</button></div><div class="row"><input id="actionId" placeholder="Action ID"><button onclick="approveAction()">Approve</button><button onclick="executeAction()">Execute</button><button onclick="rejectAction()">Reject</button></div><pre id="actions"></pre></section>
  <section class="card"><h2>Settings</h2><p>Amazon price check interval controls how often active eBay listings should be checked against Amazon cost.</p><div class="row"><input id="interval" type="number" min="1" placeholder="Interval minutes"><button onclick="saveInterval()">Save interval</button></div><pre id="settings"></pre></section>
  <section class="card"><h2>Opportunity Search</h2><div class="row"><input id="searchQuery" placeholder="Search product keywords"><input id="searchLimit" type="number" min="1" max="25" value="5"><label><input id="searchPersist" type="checkbox"> persist</label><button onclick="searchOpportunities()">Search</button></div><pre id="searchResult"></pre></section>
  <section class="card"><h2>Listings</h2><pre id="listings"></pre></section>
  <section class="card"><h2>Orders</h2><div class="row"><input id="orderEbayOrderId" placeholder="eBay order ID"><input id="orderEbayItemId" placeholder="eBay item ID"><input id="orderBuyerName" placeholder="Buyer name"><input id="orderSalePrice" type="number" step="0.01" placeholder="Sale price"><button onclick="createOrder()">Create BUY action</button></div><div class="row"><input id="purchaseOrderId" placeholder="Internal order ID"><input id="purchaseAsin" placeholder="ASIN"><input id="purchaseAmazonOrderId" placeholder="Amazon order ID"><input id="purchasePrice" type="number" step="0.01" placeholder="Purchase price"><button onclick="recordPurchase()">Record Amazon purchase</button></div><pre id="orders"></pre></section>
  <section class="card"><h2>Product Candidates</h2><pre id="products"></pre></section>
  <section class="card"><h2>API examples</h2><p><a href="/health">/health</a> · <a href="/api/dashboard">/api/dashboard</a></p></section>
</main>
<script>
const authHeaders=()=>{const secret=localStorage.getItem('localAgentSecret');return secret?{'x-local-agent-secret':secret}:{}}
function saveSecret(){localStorage.setItem('localAgentSecret',agentSecret.value);alert('Saved for this browser')}
function clearSecret(){localStorage.removeItem('localAgentSecret');agentSecret.value='';alert('Cleared')}
async function apiFetch(url,options={}){const headers={...(options.headers||{}),...authHeaders()};return fetch(url,{...options,headers})}
async function load(){agentSecret.value=localStorage.getItem('localAgentSecret')||'';const data=await fetch('/api/dashboard').then(r=>r.json());counts.innerHTML=Object.entries(data.counts).map(([k,v])=>'<div class="card"><div>'+k+'</div><div class="count">'+v+'</div></div>').join('');actions.textContent=JSON.stringify(data.actions,null,2);settings.textContent=JSON.stringify(data.ruleConfig,null,2);listings.textContent=JSON.stringify(data.ebayListings,null,2);orders.textContent=JSON.stringify(data.orders,null,2);products.textContent=JSON.stringify(data.productCandidates,null,2);if(data.ruleConfig?.amazonPriceCheckIntervalMinutes)interval.value=data.ruleConfig.amazonPriceCheckIntervalMinutes}
async function saveInterval(){await fetch('/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({amazonPriceCheckIntervalMinutes:Number(interval.value)})});await load()}
async function runMonitor(){const result=await fetch('/api/monitor/amazon-prices/run',{method:'POST'}).then(r=>r.json());alert(JSON.stringify(result,null,2));await load()}
async function approveAction(){await updateAction('APPROVED')}
async function rejectAction(){await updateAction('REJECTED')}
async function updateAction(status){const id=actionId.value.trim();if(!id)return alert('Action ID required');await apiFetch('/actions/'+encodeURIComponent(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status,reviewedBy:'dashboard'})});await load()}
async function executeAction(){const id=actionId.value.trim();if(!id)return alert('Action ID required');const result=await apiFetch('/actions/'+encodeURIComponent(id)+'/execute',{method:'POST'}).then(r=>r.json());alert(JSON.stringify(result,null,2));await load()}
async function searchOpportunities(){const result=await fetch('/opportunities/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:searchQuery.value,limit:Number(searchLimit.value||5),persist:searchPersist.checked})}).then(r=>r.json());searchResult.textContent=JSON.stringify(result,null,2);await load()}
async function createOrder(){const result=await fetch('/orders/ebay/manual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ebayOrderId:orderEbayOrderId.value,ebayItemId:orderEbayItemId.value,buyerName:orderBuyerName.value,buyerShippingAddress:{enteredInDashboard:true},salePrice:Number(orderSalePrice.value)})}).then(r=>r.json());alert(JSON.stringify(result,null,2));await load()}
async function recordPurchase(){const result=await apiFetch('/orders/'+encodeURIComponent(purchaseOrderId.value)+'/amazon-purchase',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({asin:purchaseAsin.value,amazonOrderId:purchaseAmazonOrderId.value,purchasePrice:Number(purchasePrice.value),status:'PURCHASED'})}).then(r=>r.json());alert(JSON.stringify(result,null,2));await load()}
load();
</script>
</body>
</html>`;

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => reply.type('text/html').send(dashboardHtml));
  app.get('/api/dashboard', async () => getDashboardData(prisma));
  app.get('/api/settings', async () => getActiveRuleConfig(prisma));
  app.patch('/api/settings', async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid settings payload', details: parsed.error.flatten() });
    const existing = await prisma.ruleConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } });
    const decimalKeys = new Set(['minimumProfitUsd', 'minimumRoiPercent', 'minimumMatchConfidence', 'estimatedSalesTaxRate', 'returnRiskBuffer', 'priceChangeBuffer', 'maxDailyPurchaseAmountUsd']);
    const data = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, typeof value === 'number' && decimalKeys.has(key) ? String(value) : value]));
    const ruleConfig = existing
      ? await prisma.ruleConfig.update({ where: { id: existing.id }, data })
      : await prisma.ruleConfig.create({ data: { id: 'default-rule-config', name: 'default', active: true, ...data } });
    return { ruleConfig };
  });
  app.post('/api/monitor/amazon-prices/run', async () => runAmazonPriceMonitor(prisma));
}
