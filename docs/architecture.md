# Buysell Architecture

Buysell is planned as a controlled eBay/Amazon arbitrage assistant. The MVP starts at Weg 2 with SerpApi discovery, enriches candidates with Keepa data, stores all decisions in Railway Postgres, and keeps human approvals in front of marketplace-changing actions until the workflow is proven safe.

## Services

- `backend`: Fastify API, worker entry points, Prisma data model, profit calculator, and future SerpApi/Keepa/eBay integrations.
- `local-agent`: PC-side automation scaffold for Amazon checkout assistance. The MVP requires manual confirmation before purchase submission.
- `Railway Postgres`: canonical store for product candidates, Amazon matches, profit snapshots, AI decisions, listings, orders, purchase records, and audit logs.

## Workflow

1. SerpApi discovers eBay sold/listing candidates.
2. Keepa enriches candidates with Amazon ASIN, price, availability, and sales-rank data.
3. The deterministic profit calculator rejects weak opportunities before AI review.
4. AI evaluates only filtered candidates and writes structured decisions.
5. Approved listings are created or updated through the eBay Sell API.
6. Active listings are repriced or paused when Keepa data shows margin or inventory risk.
7. eBay orders are validated before a local PC agent prepares the Amazon purchase.
8. The first production version stops for human approval before Amazon checkout submission.

## Safety Defaults

- Manual approval for listing creation.
- Manual approval for Amazon purchases.
- Audit log for every automated decision.
- Hard profit, stock, and match-confidence gates before AI can recommend listing.
- Immediate pause path for out-of-stock or unprofitable active listings.
