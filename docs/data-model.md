# Data Model

The Prisma schema in `backend/prisma/schema.prisma` defines the MVP persistence layer.

## Core Entities

- `ProductCandidate`: normalized eBay candidate from SerpApi.
- `AmazonMatch`: Keepa/Amazon match with ASIN, price, availability, and confidence metadata.
- `ProfitSnapshot`: point-in-time margin and ROI calculation.
- `AiDecision`: structured AI recommendation such as `LIST`, `REPRICE`, `PAUSE`, `REJECT`, or `MANUAL_REVIEW`.
- `EbayListing`: internal representation of a draft or live eBay listing.
- `Order`: eBay order tied back to an internal listing.
- `AmazonPurchase`: Amazon purchase/tracking information for an eBay order.
- `AuditLog`: append-only record of automation decisions and marketplace-impacting actions.
- `ActionItem`: operator queue for next actions such as listing, repricing, pausing, buying, or manual review.
- `RuleConfig`: active safety/business rules for opportunity scoring, buffers, blocklists, and daily limits.
- `Order.actionItems`: links eBay orders to generated `BUY` action items for local-agent purchase review.
