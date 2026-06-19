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
- `local-agent`: local browser automation host for verify, draft, assisted, and controlled autopilot workflows.

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

Most operator routes are protected. For local curl examples that search, scan, update settings, change actions, manage credentials, or record orders, include:

```bash
-H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET"
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
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"query":"wireless barcode scanner","limit":5,"persist":false}'
```

Guided discovery scan:

```bash
curl -X POST http://localhost:3000/opportunities/scan \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"profileKey":"starter-safe","limit":8,"safeMode":true,"minScore":65,"persist":true}'
```

Discovery profiles:

```bash
curl http://localhost:3000/opportunities/profiles
```

Guided discovery uses predefined sourcing profiles, safe-mode category/keyword exclusions, Keepa price-drop signals, eBay sold-price comps, market-quality metrics, match confidence, landed-cost assumptions, and deterministic profit gates to rank results from 0-100. The dashboard shows only accepted opportunities by default, with score reasons, evidence, and risk flags so the operator can see why a product is worth attention.

Amazon-first scout:

```bash
# Find promising Amazon candidates before spending eBay comparison checks
curl -X POST http://localhost:3000/amazon-discovery/run \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"profileKey":"starter-safe","categoryKey":"office-electronics","limit":40,"minAmazonScore":62,"safeMode":true}'

# Compare selected Amazon candidates with eBay sold comps
curl -X POST http://localhost:3000/amazon-discovery/compare \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"candidateIds":["amazon_discovery_candidate_id"],"limit":10}'
```

Amazon Scout intentionally runs before eBay comparison. It uses Keepa/Amazon signals — current price, 90-day average, price-drop percentage, Buy Box/in-stock status, sales rank, ratings/reviews, and safety filters — to reduce a large category into a smaller shortlist. Operators can bulk-select high-score Amazon candidates and compare only those products with eBay, which keeps SerpApi/eBay checks focused on candidates that already look promising.

eBay-first discovery:

```bash
# Find sold eBay products first
curl -X POST http://localhost:3000/ebay-discovery/run \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"profileKey":"starter-safe","categoryKey":"office-electronics","limit":25,"minEbayScore":50,"soldOnly":true,"completedOnly":true}'

# Compare selected eBay sold candidates with Amazon/Keepa matches
curl -X POST http://localhost:3000/ebay-discovery/compare \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"candidateIds":["ebay_discovery_candidate_id"],"amazonMatchLimit":3}'
```

eBay Discovery is the reverse of Amazon Scout. It starts with sold/completed eBay listings through SerpApi, applies eBay-side category, price, condition, location, and safety filters, then uses Keepa to find Amazon source matches. Profitable matches are persisted through the same opportunity/action pipeline; uncertain high-upside matches stay in manual review.

Automatic opportunities require exact-product evidence. Shared UPC/EAN/MPN/model data or exact brand-plus-model agreement can pass; brand, model, pack-count, or variant conflicts are rejected; brand-only or title-only similarity stays in manual review.

Listing opportunities are not queued directly as `LIST` actions. A profitable `LIST` decision first creates a `VERIFY` action and `PriceVerification` record. The verifier must open the Amazon and eBay product links on a real browser, confirm current price, new condition, fixed-price eBay format, and brand, then submit the observed values. Only a passed verification creates the actual `LIST` action.

Every persisted opportunity stores an evidence ledger and market metrics. Evidence records product-identity signals, economics, market reasons, and safety flags. Market metrics track sold sample size, median sold price, price spread, estimated sell-through when active samples are available, competition ratio, and market-specific risk flags. These metrics participate in opportunity scoring, so a product with attractive raw margin can still be rejected when the market evidence is weak.

Action list:

```bash
curl http://localhost:3000/actions \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET"
curl -X PATCH http://localhost:3000/actions/action_id \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"status":"APPROVED","reviewedBy":"operator"}'
curl -X POST http://localhost:3000/actions/action_id/verification-result \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"status":"PASSED","amazon":{"observedPrice":49.99,"brand":"Acme","condition":"New"},"ebay":{"observedPrice":99.99,"brand":"Acme","condition":"New","buyingFormat":"Buy It Now"}}'
```

Local agent:

```bash
BACKEND_URL=http://localhost:3000 LOCAL_AGENT_RUN_ONCE=true npm run dev -w local-agent
```

The local agent polls approved action-list items and runs the selected automation mode:

- `VERIFY`: opens real browser evidence through `COMPUTER_USE_VERIFIER_COMMAND` or `COMPUTER_USE_OPERATOR_COMMAND`, then posts observed prices/conditions to `/actions/:id/verification-result`.
- `DRAFT`: prepares listing/reprice/pause workflows and stops before publish, submit, pause, withdraw, purchase, or any irreversible final action.
- `ASSISTED`: prepares checkout or marketplace changes up to the final confirmation screen and leaves the run waiting for human confirmation.
- `AUTOPILOT`: allows the configured operator command to complete the final marketplace action only when visible page data matches the approved payload and guardrails.

Set `LOCAL_AGENT_AUTOMATION_MODE` to the maximum mode the local agent may use. The default is `ASSISTED`; dashboard/payload requests for `AUTOPILOT` are ignored unless the agent is explicitly configured for `AUTOPILOT`.

Manual marketplace actions are left open by default after the agent prepares the workflow or prints the required operator step. Set `LOCAL_AGENT_AUTOCOMPLETE_MANUAL_ACTIONS=true` only when another trusted process has actually completed those manual actions and you want the scaffold to mark them complete.

Set `COMPUTER_USE_VERIFIER_COMMAND`, `COMPUTER_USE_DRAFT_COMMAND`, `COMPUTER_USE_ASSISTED_COMMAND`, `COMPUTER_USE_AUTOPILOT_COMMAND`, or fallback `COMPUTER_USE_OPERATOR_COMMAND` to connect Codex Computer Use or another real computer-use provider. The command is parsed into an executable plus arguments, not run through a shell, so use direct commands such as `node ./operator.js` instead of shell pipelines. The local agent sends a job JSON object on stdin and expects validated structured JSON on stdout. No Playwright browser automation is used for marketplace account flows.

Protected operator routes require a shared secret. Set `LOCAL_AGENT_SHARED_SECRET` on the backend, and include the same value in the local agent environment so action polling, credential updates, settings writes, discovery runs, and order updates are accepted. The local agent sends timestamped HMAC request signatures derived from that secret; the legacy `x-local-agent-secret` header remains accepted for CLI/backward compatibility. Browser dashboard users sign in once with the shared secret and then use a short-lived HttpOnly session plus CSRF token.

Execute approved listing draft action:

```bash
curl -X POST http://localhost:3000/actions/action_id/execute \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET"
```

Approved `LIST` execution supports three eBay modes:

- `PREPARE` (default): produce and audit a local eBay draft payload only.
- `DRAFT`: create or replace the eBay inventory item and create an unpublished eBay offer through the Sell Inventory API.
- `PUBLISH`: create the inventory item, create the offer, and publish it through the Sell Inventory API.

Use `{"result":{"ebayPublishMode":"DRAFT"}}` or `{"result":{"ebayPublishMode":"PUBLISH"}}` on `/actions/:id/execute`. `DRAFT` and `PUBLISH` require eBay OAuth credentials plus `categoryId`, `merchantLocationKey`, `fulfillmentPolicyId`, `paymentPolicyId`, and `returnPolicyId` in the action payload or execution result. Reprice actions update the internal listing and attempt an eBay Sell Inventory price/quantity update when an `ebayOfferId` and credentials are present.

Manual eBay order intake:

```bash
curl -X POST http://localhost:3000/orders/ebay/manual \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"ebayOrderId":"ORDER-1","ebayItemId":"EBAY-ITEM-1","buyerName":"Buyer","buyerShippingAddress":{"country":"US"},"salePrice":54.99}'

# Poll recent eBay orders and create BUY actions for known listings
curl -X POST http://localhost:3000/orders/ebay/sync \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"lookbackHours":24,"limit":50}'
```

Record Amazon purchase:

```bash
curl -X POST http://localhost:3000/orders/order_id/amazon-purchase \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
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
3. Add the remaining production variables from `.env.example` to the app service. Set a stable `BUYSELL_ENCRYPTION_KEY` with 32+ characters; production startup now rejects missing or shorter encryption keys so stored credentials cannot be encrypted with a development fallback.
4. Deploy the app service. On every deploy the start command runs `prisma migrate deploy` against `DATABASE_URL` before booting the server, so the schema is created/updated automatically.
5. After the first successful deploy, optionally seed default rules:

   ```bash
   railway run npm run prisma:seed -w backend
   ```

The dashboard shows a live **Postgres connected / DB disconnected** indicator backed by `GET /api/health/db`, so you can confirm the database is wired up at a glance.

Useful Prisma checks:

```bash
# Validate schema locally. Uses a placeholder DATABASE_URL if one is not set; it does not connect.
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

The GitHub Actions workflow in `.github/workflows/ci.yml` runs install, production dependency audit, typecheck, build, Prisma validation, a Postgres-backed migration smoke test, tests, and lint validation on pushes and pull requests.

Dashboard:

Open `/` on the Railway app to use the Buysell Control Center. The dashboard requires sign-in with the configured `LOCAL_AGENT_SHARED_SECRET`; after login, the browser uses a short-lived HttpOnly session cookie plus CSRF token instead of storing the shared secret in `localStorage`. Mutating dashboard requests require the CSRF token, while the local agent continues to use timestamped HMAC signatures.

The dashboard includes a sidebar (Overview, Actions, Listings & Orders, Discovery, Settings), live stat cards, sortable data tables with status badges, toast notifications, a live Postgres connection indicator, guided discovery profiles, alert checks, CSV exports, credential checks, and a manual Amazon price-check trigger. High-risk actions such as execution, purchase recording, and Autopilot queueing require typed confirmation words.

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

The **Settings** tab lets operators manage all API keys and config (SerpApi, Keepa, OpenAI, eBay credentials/marketplace/sandbox, and the local-agent secret) without redeploying. Values are encrypted with AES-256-GCM and stored in the `Credential` table (`backend/prisma/migrations/0004_add_credential`); a stored value takes precedence over the matching environment variable. The API never returns full secrets — only a masked preview, the source (`database` / `environment` / `unset`), and whether the key is configured:

```bash
# Read masked status of all managed keys
curl http://localhost:3000/api/credentials \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET"

# Save / overwrite a key (empty value clears it)
curl -X PUT http://localhost:3000/api/credentials/SERPAPI_API_KEY \
  -H 'content-type: application/json' \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET" \
  -d '{"value":"your-serpapi-key"}'

# Check a configured credential without revealing it
curl -X POST http://localhost:3000/api/credentials/KEEPA_API_KEY/test \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET"

# Export selected operational data
curl "http://localhost:3000/api/export/actions?format=csv" \
  -H "x-local-agent-secret: $LOCAL_AGENT_SHARED_SECRET"
```

Both routes require a configured local-agent secret, matching the rest of the protected API. `DATABASE_URL` and `BUYSELL_ENCRYPTION_KEY` are intentionally **not** manageable here — they are required from the environment to reach and decrypt the credential store. Set `BUYSELL_ENCRYPTION_KEY` to a stable 32+ character value in production so stored secrets remain decryptable across deploys.
