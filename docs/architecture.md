# Buysell Architecture

Buysell is planned as a controlled eBay/Amazon arbitrage assistant. The MVP starts at Weg 2 with SerpApi discovery, enriches candidates with Keepa data, stores all decisions in Railway Postgres, and keeps human approvals in front of marketplace-changing actions until the workflow is proven safe.

## Services

- `backend`: Fastify API, worker entry points, Prisma data model, profit calculator, and future SerpApi/Keepa/eBay integrations.
- `local-agent`: PC-side automation host for real browser/computer-use verification, draft preparation, assisted execution, and controlled autopilot.
- `Railway Postgres`: canonical store for product candidates, Amazon matches, profit snapshots, AI decisions, listings, orders, purchase records, and audit logs.

## Workflow

1. SerpApi discovers eBay sold/listing candidates.
2. Keepa enriches candidates with Amazon ASIN, price, availability, and sales-rank data.
3. Market-quality metrics and evidence are attached from sold comps, identity signals, economics, and safety checks.
4. The deterministic landed-cost profit calculator rejects weak opportunities before AI review.
5. AI evaluates only filtered candidates and writes structured decisions.
6. Approved listings can be prepared locally, created as unpublished eBay offers, or published through the eBay Sell API depending on the explicit execution mode.
7. Active listings are repriced or paused when Keepa data shows margin or inventory risk.
8. eBay orders are validated before a local PC agent prepares the Amazon purchase.
9. `AutomationRun` and `AutomationEvent` records track every AI/browser operator attempt, artifact, and confirmation state.
10. The default production mode stops for human approval before Amazon checkout submission; explicit autopilot requires a trusted local operator command and agent-side opt-in.

## Safety Defaults

- Manual approval for listing creation.
- Manual approval for Amazon purchases.
- Automation modes default to draft/assisted behavior unless the local agent is explicitly configured for autopilot.
- Run/event records for every computer-use operation.
- Audit log for every automated decision.
- Hard landed-cost profit, stock, market-quality, and match-confidence gates before AI can recommend listing.
- Immediate pause path for out-of-stock or unprofitable active listings.
- Timestamped HMAC signatures for local-agent protected route calls, with shared-secret header compatibility for dashboard-driven operations.
