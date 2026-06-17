# MVP Workflows

## Product Discovery

1. Submit a SerpApi search job.
2. Normalize the eBay result into `ProductCandidate` rows.
3. Store raw SerpApi JSON for debugging and future parser improvements.

## Keepa Enrichment

1. Match candidates by UPC/EAN/ISBN/MPN where possible.
2. Fall back to title and specification matching when identifiers are missing.
3. Store ambiguous matches with low confidence and require manual review.

## Profit Calculation

The first backend route is `POST /profit/calculate`. It accepts eBay sale price, Amazon cost, fee rates, tax, and buffers, then returns estimated profit, ROI, and margin percentage.

## Listing Approval

The first eBay integration should create drafts or approved listings only after a human confirms the AI recommendation.

## Order Fulfillment

When an eBay order arrives, the backend must recheck Keepa price and availability before sending a purchase task to the local agent. The local agent should require manual confirmation before submitting an Amazon order in the MVP.

## Opportunity Search API

`POST /opportunities/search` is the first end-to-end API shape for Weg 2. It requires `SERPAPI_API_KEY` and `KEEPA_API_KEY`, searches sold eBay candidates through SerpApi, asks Keepa for Amazon matches, scores the best match, calculates profit, and returns a deterministic `LIST`, `REJECT`, or `MANUAL_REVIEW` decision.

Example request:

```json
{
  "query": "wireless barcode scanner",
  "limit": 5
}
```

The route currently returns opportunities to the caller and does not create eBay listings or Amazon purchases. Persisting the returned opportunities into Prisma tables is the next implementation step.

## eBay-First Discovery

`POST /ebay-discovery/run` is the first-class reverse discovery flow. It starts from sold/completed eBay listings, stores the full eBay candidate shortlist in `EbayDiscoveryRun` and `EbayDiscoveryCandidate`, and can either stop for operator selection or automatically compare the selected set with Keepa/Amazon matches.

`POST /ebay-discovery/compare` checks selected eBay candidates against Amazon source prices, applies the same match, safety, profit, ROI, and opportunity-score gates as the rest of the pipeline, and persists accepted matches through `ProductCandidate`, `AmazonMatch`, `ProfitSnapshot`, `AiDecision`, and `ActionItem`. Borderline or user-overridden products can be routed to manual review with `POST /ebay-discovery/consider`.

Both eBay-first and Amazon-first comparison now require product identity evidence before an automatic opportunity can be created. Shared UPC/EAN/MPN/model evidence or exact brand-plus-model evidence can pass; brand, model, pack-count, or variant conflicts are rejected; brand-only or title-only similarity is routed to manual review instead of listing.

## Persisting Opportunities

The opportunity search request accepts `"persist": true`. When enabled, the backend requires `DATABASE_URL` and writes each returned opportunity into `ProductCandidate`, `AmazonMatch`, `ProfitSnapshot`, `AiDecision`, and `AuditLog` records. This keeps the first API safe by making persistence explicit while still supporting a dry-run mode for API/parser testing.

## Action List

When persisted opportunities produce a `LIST`, `REPRICE`, `PAUSE`, or `MANUAL_REVIEW` decision, the backend creates an `ActionItem`. Operators can fetch pending work with `GET /actions` and approve, reject, complete, cancel, or mark an item as errored with `PATCH /actions/:id`. This maps the chart's `Aktionsliste` step into a database-backed review queue before eBay or Amazon automation runs.


## Local Agent Polling

The local agent polls `GET /actions?status=APPROVED` and starts an `AutomationRun` for each runnable action. Actions with an active `RUNNING` or `NEEDS_HUMAN_CONFIRMATION` run are not re-polled, so long browser tasks and prepared final-confirmation screens do not repeat every interval.

Supported modes:

- `VERIFY`: browser-observed Amazon/eBay price, condition, brand, and buying-format checks before a `LIST` action can be created.
- `DRAFT`: listing, reprice, or pause preparation that stops before final submit.
- `ASSISTED`: checkout or marketplace preparation that stops on the final human-confirmation screen.
- `AUTOPILOT`: final submission is allowed only for a local agent explicitly configured with `LOCAL_AGENT_AUTOMATION_MODE=AUTOPILOT` and a trusted operator command.

The local agent leaves manual marketplace actions open by default so the dashboard or API can record completion after the operator or a trusted executor actually finishes the step. `LOCAL_AGENT_AUTOCOMPLETE_MANUAL_ACTIONS=true` restores scaffold auto-complete behavior only for controlled environments.

`COMPUTER_USE_VERIFIER_COMMAND` is the dedicated verification adapter. `COMPUTER_USE_DRAFT_COMMAND`, `COMPUTER_USE_ASSISTED_COMMAND`, and `COMPUTER_USE_AUTOPILOT_COMMAND` are mode-specific operator adapters; `COMPUTER_USE_OPERATOR_COMMAND` is the fallback. Each command is parsed into an executable plus arguments, receives job JSON on stdin, and returns validated structured JSON plus evidence on stdout.

## Automation Runs

`AutomationRun` records the mode, agent type, phase, status, risk score, result JSON, and error for every AI/browser operation. `AutomationEvent` stores recent run events. The dashboard's Automation view shows these records, and the Actions view can queue a selected action as Verify, Draft, Assisted, or Autopilot by setting `payloadJson.automationMode` and approving it.

## Local Agent Authentication

Protected operator routes require a shared secret. Configure `LOCAL_AGENT_SHARED_SECRET` on the backend, then send the same value in the `x-local-agent-secret` header from the local agent or dashboard. A secret stored in the encrypted credentials table can also authorize requests after the backend has been bootstrapped with an existing valid secret.

## Rule Configuration

`RuleConfig` stores adjustable safety thresholds such as minimum profit, ROI, match confidence, tax/buffer assumptions, daily limits, and brand/category blocklists. Opportunity search loads the active rule config before scoring, so filters can change without code edits.

## Listing Draft Execution

Approved `LIST` actions can be sent to `POST /actions/:id/execute`. The current executor prepares and audits an eBay listing draft payload without publishing to eBay, preserving the manual approval boundary while creating the future integration point for the eBay Sell API.

## eBay Order Intake

`POST /orders/ebay/manual` records an eBay order against a known `EbayListing`, encrypts the buyer shipping address, marks the order ready for purchase review, and creates a high-priority `BUY` action for the local agent/operator. This is the bridge between an eBay sale and the Amazon purchase workflow while keeping checkout manual in the MVP.

## Amazon Purchase Recording

After the operator/local agent completes an Amazon purchase, `POST /orders/:id/amazon-purchase` stores the Amazon order details, updates the eBay order status, and appends an audit log. Tracking details can be included immediately or added by posting another purchase/status update once Amazon provides carrier and tracking information.

## Dashboard and Amazon Price Protection

`GET /` now serves the Buysell Control Center instead of a 404. It shows candidates, listings, orders, actions, purchases, and settings. The dashboard can update the Amazon price-check interval and manually trigger `POST /api/monitor/amazon-prices/run`. The monitor checks active eBay listings against current Keepa/Amazon pricing and pauses the internal eBay listing plus creates a high-priority `PAUSE` action when Amazon cost rises above the stored source price.

The backend also starts a scheduler on boot. It reads `amazonPriceCheckIntervalMinutes` from the active `RuleConfig` before each cycle, so changing the setting in the dashboard changes the next monitoring interval without redeploying.

When Amazon source price rises, the monitor queues a high-priority `PAUSE` action without marking the listing paused prematurely. When a `PAUSE` action is executed, the backend attempts to withdraw the corresponding eBay Inventory offer via eBay's Sell Inventory `withdrawOffer` endpoint if an `ebayOfferId` and eBay OAuth credentials are configured; otherwise it pauses internally and records why the external withdraw was skipped.

The dashboard now includes operator forms for searching opportunities, approving/rejecting/executing actions, creating manual eBay order intake records, and recording Amazon purchases, so the main MVP workflows can be driven from the browser instead of raw curl commands.

The dashboard includes a connection section for `LOCAL_AGENT_SHARED_SECRET`; when saved in the browser, protected action execution and Amazon-purchase routes send the same `x-local-agent-secret` header as the local agent.
