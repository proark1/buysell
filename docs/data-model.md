# Data Model

The Prisma schema in `backend/prisma/schema.prisma` defines the MVP persistence layer.

## Core Entities

- `ProductCandidate`: normalized eBay candidate from SerpApi.
- `AmazonMatch`: Keepa/Amazon match with ASIN, price, availability, and confidence metadata.
- `ProfitSnapshot`: point-in-time landed-cost, margin, and ROI calculation.
- `AiDecision`: structured AI recommendation such as `LIST`, `REPRICE`, `PAUSE`, `REJECT`, or `MANUAL_REVIEW`.
- `EbayListing`: internal representation of a draft or live eBay listing.
- `Order`: eBay order tied back to an internal listing.
- `AmazonPurchase`: Amazon purchase/tracking information for an eBay order.
- `AuditLog`: append-only record of automation decisions and marketplace-impacting actions.
- `ActionItem`: operator queue for next actions such as listing, repricing, pausing, buying, or manual review.
- `AutomationRun`: lifecycle record for a computer-use/local-agent attempt, including mode, phase, status, risk score, result JSON, and errors.
- `AutomationEvent`: append-only event stream for an automation run.
- `RuleConfig`: active safety/business rules for opportunity scoring, buffers, blocklists, and daily limits.
- `Order.actionItems`: links eBay orders to generated `BUY` action items for local-agent purchase review.
- `SoldWinnerSeed`: imported historical eBay sales rows used as positive replenishment evidence.
- `ReplenishmentWatchItem`: grouped sold-winner families with sale counts, target buy/sell prices, priority, and test-buy metadata.

## Evidence And Market Metrics

- `ProductCandidate.evidenceJson`: auditable product-identity, economics, market, and safety evidence used for the recommendation.
- `ProductCandidate.marketMetricsJson`: eBay market-quality metrics such as sold sample size, median sold price, price spread, estimated sell-through, competition ratio, demand score, and market risk flags.
- `AmazonMatch.evidenceJson`: Amazon-side identity evidence attached to the chosen match.
- `ProfitSnapshot` now stores the major landed-cost components separately: source shipping, packaging, payment fixed fee, return reserve, cancellation reserve, marketplace risk buffer, and total landed cost.
- `RuleConfig` includes the matching defaults for landed-cost and market-quality thresholds so operators can tune economics without code changes.
- `SoldWinnerSeed` rows feed a winner-similarity index used by Amazon Scout and eBay Discovery. Matching candidates receive a `winnerSimilarity` score reason, and scheduled discovery uses `ReplenishmentWatchItem` titles as rotating scan targets.
