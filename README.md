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
npm ci
cp .env.example .env
npm run prisma:validate
npm run typecheck
npm run build
npm run test
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

Guided discovery scan:

```bash
curl -X POST http://localhost:3000/opportunities/scan \
  -H 'content-type: application/json' \
  -d '{"profileKey":"starter-safe","limit":8,"safeMode":true,"minScore":65,"persist":true}'
```

Discovery profiles:

```bash
curl http://localhost:3000/opportunities/profiles
```

Guided discovery uses predefined sourcing profiles, safe-mode category/keyword exclusions, Keepa price-drop signals, eBay sold-price comps, match confidence, and deterministic profit gates to rank results from 0-100. The dashboard shows only accepted opportunities by default, with score reasons and risk flags so the operator can see why a product is worth attention.

Amazon-first scout:

```bash
# Find promising Amazon candidates before spending eBay comparison checks
curl -X POST http://localhost:3000/amazon-discovery/run \
  -H 'content-type: application/json' \
  -d '{"profileKey":"starter-safe","categoryKey":"office-electronics","limit":40,"minAmazonScore":62,"safeMode":true}'

# Compare selected Amazon candidates with eBay sold comps
curl -X POST http://localhost:3000/amazon-discovery/compare \
  -H 'content-type: application/json' \
  -d '{"candidateIds":["amazon_discovery_candidate_id"],"limit":10}'
```

Amazon Scout intentionally runs before eBay comparison. It uses Keepa/Amazon signals — current price, 90-day average, price-drop percentage, Buy Box/in-stock status, sales rank, ratings/reviews, and safety filters — to reduce a large category into a smaller shortlist. Operators can bulk-select high-score Amazon candidates and compare only those products with eBay, which keeps SerpApi/eBay checks focused on candidates that already look promising.

eBay-first discovery:

```bash
# Find sold eBay products first
curl -X POST http://localhost:3000/ebay-discovery/run \
  -H 'content-type: application/json' \
  -d '{"profileKey":"starter-safe","categoryKey":"office-electronics","limit":25,"minEbayScore":50,"soldOnly":true,"completedOnly":true}'

# Compare selected eBay sold candidates with Amazon/Keepa matches
curl -X POST http://localhost:3000/ebay-discovery/compare \
  -H 'content-type: application/json' \
  -d '{"candidateIds":["ebay_discovery_candidate_id"],"amazonMatchLimit":3}'
```

eBay Discovery is the reverse of Amazon Scout. It starts with sold/completed eBay listings through SerpApi, applies eBay-side category, price, condition, location, and safety filters, then uses Keepa to find Amazon source matches. Profitable matches are persisted through the same opportunity/action pipeline; uncertain high-upside matches stay in manual review.

Automatic opportunities require exact-product evidence. Shared UPC/EAN/MPN/model data or exact brand-plus-model agreement can pass; brand, model, pack-count, or variant conflicts are rejected; brand-only or title-only similarity stays in manual review.

Listing opportunities are not queued directly as `LIST` actions. A profitable `LIST` decision first creates a `VERIFY` action and `PriceVerification` record. The verifier must open the Amazon and eBay product links on a real browser, confirm current price, new condition, fixed-price eBay format, and brand, then submit the observed values. Only a passed verification creates the actual `LIST` action.

Action list:

```bash
curl http://localhost:3000/actions
curl -X PATCH http://localhost:3000/actions/action_id \
  -H 'content-type: application/json' \
  -d '{"status":"APPROVED","reviewedBy":"operator"}'
curl -X POST http://localhost:3000/actions/action_id/verification-result \
  -H 'content-type: application/json' \
  -d '{"status":"PASSED","amazon":{"observedPrice":49.99,"brand":"Acme","condition":"New"},"ebay":{"observedPrice":99.99,"brand":"Acme","condition":"New","buyingFormat":"Buy It Now"}}'
```

Local agent:

```bash
BACKEND_URL=http://localhost:3000 LOCAL_AGENT_RUN_ONCE=true npm run dev -w local-agent
```

The local agent polls approved action-list items and keeps the MVP in manual-confirmation mode before any eBay or Amazon action is completed.

Set `COMPUTER_USE_VERIFIER_COMMAND` to connect a real computer-use verifier. The local agent sends the verification job JSON to the command on stdin and expects a verification-result JSON object on stdout; it then posts that result back to `/actions/:id/verification-result`. No Playwright browser automation is used for this gate.

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

## Railway Postgres

The expected Railway layout is one app service (`buysell`) and one Postgres service (`Postgres`) in the same environment. The backend connects through Prisma using the `DATABASE_URL` environment variable.

On Railway:

1. Confirm the Postgres service is online. Railway exposes database variables from that service, including `DATABASE_URL`.
2. Open the app service (`buysell`) → **Variables** and add a reference variable so the API reads the Postgres URL:

   ```
   DATABASE_URL=${{ Postgres.DATABASE_URL }}
   ```

   Use the exact service name shown in your project. If the database service is renamed from `Postgres`, update the namespace in the reference.
3. Add the remaining production variables from `.env.example` to the app service. At minimum set a stable `BUYSELL_ENCRYPTION_KEY` with 32+ characters so encrypted credentials remain decryptable across deploys.
4. Deploy the app service. On every deploy the start command runs `prisma migrate deploy` against `DATABASE_URL` before booting the server, so the schema is created/updated automatically.
5. After the first successful deploy, optionally seed default rules:

   ```bash
   railway run npm run prisma:seed -w backend
   ```

The dashboard shows a live **Postgres connected / DB disconnected** indicator backed by `GET /api/health/db`, so you can confirm the database is wired up at a glance.

Useful Prisma checks:

```bash
# Validate schema locally. Requires DATABASE_URL to exist, but does not connect.
npm run prisma:validate

# Run pending migrations with Railway production variables.
railway run npm run prisma:deploy

# Confirm app-to-database connectivity after deploy.
curl https://your-railway-domain.up.railway.app/api/health/db
```

Railway deployment:

```bash
npm run railway:build
npm run railway:start
```

`railway.json` sets the build command to `npm run build`, the start command to `npm run start:railway -w backend` (which runs `prisma migrate deploy` then starts the API from `backend/dist/index.js`), and points Railway at `/health` for deployment health checks. Nixpacks handles dependency installation with `npm ci`; the app build command should not run a second install.

Check Railway deployment health:

```bash
npm run railway:check
```

The check reads the latest production deployment, prints recent Railway build/deploy logs if it failed, and verifies the deployed `/health` and `/api/health/db` endpoints when the latest deployment is successful.

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
npm run typecheck
npm run lint
```

`npm run lint` runs ESLint against the TypeScript source in both workspaces.

CI validation:

The GitHub Actions workflow in `.github/workflows/ci.yml` runs install, typecheck, build, tests, and lint validation on pushes and pull requests.

Dashboard:

Open `/` on the Railway app to use the Buysell Control Center — a single-page operator dashboard with a sidebar (Overview, Actions, Listings & Orders, Discovery, API Keys, Settings), live stat cards, sortable data tables with status badges, toast notifications, a live Postgres connection indicator, guided discovery profiles, and a manual Amazon price-check trigger.

Discovery:

The **Discovery** tab is intentionally profile-first instead of a raw product dump:

- Start in **Amazon Scout** to scan a profile/category and build a shortlist from Amazon data before eBay comparison.
- Select high-score Amazon candidates in bulk, then click **Compare Selected With eBay**.
- Use **eBay Discovery** when you want the reverse: start from sold eBay products, then compare selected candidates with Amazon prices.
- Pick a profile such as **Starter Safe Products**, **Electronics Accessories**, **Tools & Office**, or **Home / Small Goods**.
- Keep **Safe mode** enabled to exclude risky products such as clothing, shoes, food, supplements, cosmetics, medical items, weapons, adult items, and other blocked keywords/categories.
- Run **Find Opportunities**. Accepted results are ranked by opportunity score, expected profit, ROI, Keepa price signal, demand signal, match confidence, and risk penalties.
- Review score reasons and risk badges before approving any listing action.

Safety defaults can be edited in **Settings → Discovery Safety**.

API Keys & Credentials:

The **API Keys** tab lets operators manage all API keys and config (SerpApi, Keepa, OpenAI, eBay credentials/marketplace/sandbox, and the local-agent secret) without redeploying. Values are encrypted with AES-256-GCM and stored in the `Credential` table (`backend/prisma/migrations/0004_add_credential`); a stored value takes precedence over the matching environment variable. The API never returns full secrets — only a masked preview, the source (`database` / `environment` / `unset`), and whether the key is configured:

```bash
# Read masked status of all managed keys
curl http://localhost:3000/api/credentials

# Save / overwrite a key (empty value clears it)
curl -X PUT http://localhost:3000/api/credentials/SERPAPI_API_KEY \
  -H 'content-type: application/json' \
  -d '{"value":"your-serpapi-key"}'
```

Both routes are gated by `LOCAL_AGENT_SHARED_SECRET` (when set), matching the rest of the protected API. `DATABASE_URL` and `BUYSELL_ENCRYPTION_KEY` are intentionally **not** manageable here — they are required from the environment to reach and decrypt the credential store. Set `BUYSELL_ENCRYPTION_KEY` to a stable 32+ character value in production so stored secrets remain decryptable across deploys.
