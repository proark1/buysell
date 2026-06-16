# Buysell

Buysell is a TypeScript monorepo for a staged eBay/Amazon arbitrage assistant.

The initial implementation provides:

- Fastify backend scaffold.
- Prisma schema for Railway Postgres.
- Deterministic profit calculator endpoint.
- Local PC agent scaffold for future Amazon checkout assistance.
- Architecture and workflow documentation.

## Packages

- `backend`: API, database schema, and future marketplace integrations.
- `local-agent`: local browser automation host, initially manual-confirmation only.

## Setup

```bash
npm install
cp .env.example .env
npm run typecheck
npm run build
```

## Backend

```bash
npm run dev -w backend
```

Health check:

```bash
curl http://localhost:3000/health
```

Profit calculation:

```bash
curl -X POST http://localhost:3000/profit/calculate \
  -H 'content-type: application/json' \
  -d '{"ebaySalePrice":54.99,"amazonItemCost":31.5,"estimatedSalesTaxRate":0.08,"returnRiskBuffer":2,"priceChangeBuffer":2}'
```

Opportunity search:

```bash
curl -X POST http://localhost:3000/opportunities/search \
  -H 'content-type: application/json' \
  -d '{"query":"wireless barcode scanner","limit":5,"persist":false}'
```

Action list:

```bash
curl http://localhost:3000/actions
curl -X PATCH http://localhost:3000/actions/action_id \
  -H 'content-type: application/json' \
  -d '{"status":"APPROVED","reviewedBy":"operator"}'
```

Local agent:

```bash
BACKEND_URL=http://localhost:3000 LOCAL_AGENT_RUN_ONCE=true npm run dev -w local-agent
```

The local agent polls approved action-list items and keeps the MVP in manual-confirmation mode before any eBay or Amazon action is completed.

If `LOCAL_AGENT_SHARED_SECRET` is set on the backend, include the same value in the local agent environment so `/actions` polling and updates are accepted.

Execute approved listing draft action:

```bash
curl -X POST http://localhost:3000/actions/action_id/execute \
  -H 'content-type: application/json'
```

Manual eBay order intake:

```bash
curl -X POST http://localhost:3000/orders/ebay/manual \
  -H 'content-type: application/json' \
  -d '{"ebayOrderId":"ORDER-1","ebayItemId":"EBAY-ITEM-1","buyerName":"Buyer","buyerShippingAddress":{"country":"US"},"salePrice":54.99}'
```

Record Amazon purchase:

```bash
curl -X POST http://localhost:3000/orders/order_id/amazon-purchase \
  -H 'content-type: application/json' \
  -d '{"asin":"B000000000","amazonOrderId":"AMZ-1","purchasePrice":31.50,"status":"PURCHASED"}'
```

Railway deployment:

```bash
npm run railway:build
npm run railway:start
```

The backend starts from `backend/dist/index.js`; `railway.json` points Railway at `/health` for deployment health checks.

Database migrations:

```bash
npm run prisma:migrate -w backend
```

The initial migration lives under `backend/prisma/migrations/0001_initial` and mirrors the current Prisma schema for Railway Postgres.

Seed default rules:

```bash
npm run prisma:seed -w backend
```

The seed creates an active `RuleConfig` named `default` with conservative MVP thresholds.

Run all tests:

```bash
npm run test
```

Lint/type validation:

```bash
npm run lint
```

For this TypeScript MVP, lint currently delegates to package-level typechecks so the advertised validation command works without additional parser setup.

CI validation:

The GitHub Actions workflow in `.github/workflows/ci.yml` runs install, typecheck, build, tests, and lint validation on pushes and pull requests.

Note: CI currently uses `npm install` instead of `npm ci` until a `package-lock.json` is committed.

Dashboard:

Open `/` on the Railway app to use the Buysell Control Center. It displays products, listings, orders, actions, settings, and includes a manual Amazon price-check trigger.
