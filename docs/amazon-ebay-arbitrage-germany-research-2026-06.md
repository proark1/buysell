# Amazon/eBay Arbitrage Tool Research: Germany

Research date: 2026-06-24  
Workspace: Buysell

## Executive summary

The strongest opportunity is not a generic "Amazon/eBay arbitrage bot". It is a Germany-focused decision-support system that finds, verifies, ranks, and monitors arbitrage opportunities across Amazon.de and eBay.de with unusually good product matching, true landed-cost math, fee/VAT configurability, and evidence-driven manual approval.

Public operator discussions on Reddit and YouTube converge on a few practical truths:

- Keepa-style price/rank history is mandatory. Current price alone is too noisy.
- SellerAmp/BuyBotPro-style deal analysis is useful, but existing tools are mostly Amazon-centric and often weak at Germany-specific eBay.de-to-Amazon.de workflows.
- The hard part is exact product identity: EAN/GTIN, ASIN, model, pack size, variation, condition, and source reliability.
- Thin margins get destroyed by hidden costs: marketplace fees, shipping, VAT treatment, returns, storage, repricing pressure, promoted listings, and source-price changes.
- Good operators do not buy everything that shows margin. They demand proof of demand, price stability, competition quality, and replenishment potential.
- The biggest product gap is a single workflow that combines Amazon.de price/rank history, eBay.de sold/live comps, German fee defaults, VAT modes, evidence ledgers, alerts, and post-listing monitoring.

The current Buysell codebase already has a strong foundation: Keepa enrichment, eBay/Amazon discovery, match scoring, profit snapshots, evidence ledgers, verification actions, local-agent guarded automation, order sync, price monitoring, repricing, inventory sync, and sold-winner replenishment. The biggest remaining product gaps are official Amazon SP-API fee/pricing integration, more official eBay data paths, category-level German fee tables, richer VAT/accounting modes, image/attribute matching, eBay seller/source reliability scoring, and a workflow/UI designed around "trust but verify" rather than blind automation.

This report intentionally focuses on making the tool work. It does not provide a legal review. However, some "policy" items are still included as operational constraints because ignoring them causes failed listings, frozen inventory, bad profit math, or account interruptions.

## Research base

### Official marketplace/API sources

- Amazon Selling Partner API overview: https://developer-docs.amazon.com/sp-api
- Amazon Product Fees API: https://developer-docs.amazon.com/sp-api/docs/product-fees-api
- Amazon `getMyFeesEstimateForASIN`: https://developer-docs.amazon.com/sp-api/reference/getmyfeesestimateforasin
- Amazon Revenue Calculator help: https://sellercentral.amazon.com/help/hub/reference/external/GWYBC38TZGCUNRKW?locale=en-US
- Amazon marketplace IDs: https://developer-docs.amazon.com/sp-api/docs/marketplace-ids
- eBay Browse API search: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
- eBay Browse API overview: https://developer.ebay.com/api-docs/buy/browse/static/overview.html
- eBay REST marketplace IDs, including `EBAY_DE`: https://developer.ebay.com/develop/guides-v2
- eBay Product Research / Terapeak help: https://www.ebay.com/help/selling/selling-tools/product-research?id=4853
- eBay Seller Center research tools: https://www.ebay.com/sellercenter/growth/ebay-research-tools
- eBay.de private seller fees: https://www.ebay.de/help/selling/fees-credits-invoices/gebhren-fr-private-verkufer?id=4822
- eBay.de commercial seller fee changes effective 2026-02-12: https://www.ebay.de/verkaeuferportal/news/seller-news/2026-januar/gebuehrenaenderungen

### Data/tool market sources

- Keepa: https://keepa.com/
- Keepa API/client documentation: https://keepaapi.readthedocs.io/en/latest/product_query.html
- SellerAmp: https://selleramp.com/
- SellerAmp features: https://selleramp.com/features/
- BuyBotPro: https://www.buybotpro.com/
- Tactical Arbitrage: https://tacticalarbitrage.com/
- SourceMogul OA definition: https://www.sourcemogul.com/public/what-is-online-arbitrage
- ZIK Analytics eBay product research: https://www.zikanalytics.com/
- SerpApi eBay Search API: https://serpapi.com/ebay-search-api

### Reddit/subreddit signal sources

- r/FulfillmentByAmazon, useful Amazon software: https://www.reddit.com/r/FulfillmentByAmazon/comments/1bl2pqr/whats_the_most_useful_amazon_software_you_own/
- r/AmazonFBATips, online arbitrage sourcing: https://www.reddit.com/r/AmazonFBATips/comments/1awmttj/online_arbitrage_sourcing/
- r/Flipping, Amazon FBA retail arbitrage viability: https://www.reddit.com/r/Flipping/comments/qiukmb/is_amazon_fba_retail_arbitrage_a_viable_side/
- r/Flipping, selling in Amazon out-of-stock gaps: https://www.reddit.com/r/Flipping/comments/lwaxtw/retail_arbitrage_strategy_selling_in_the_gaps/
- r/FulfillmentByAmazon, FBA profitability calculation: https://www.reddit.com/r/FulfillmentByAmazon/comments/1sblq7v/how_do_you_actually_calculate_fba_profitability_i/
- r/Flipping, eBay fees ruining retail arbitrage margin: https://www.reddit.com/r/Flipping/comments/s7sya6/tried_buying_new_products_on_discounts_to_sell/
- r/ecommerce, marketplace channel differences: https://www.reddit.com/r/ecommerce/comments/8dvmdd/ama_ask_me_anything_2018_edition_60m_in_gross/
- r/FulfillmentByAmazon, German translation thread on SellerAmp: https://www.reddit.com/r/FulfillmentByAmazon/comments/1m05eye/i_hope_to_start_soon_is_selleramp_worth_it/?tl=de
- r/Flipping, eBay Marketplace Insights API access discussion: https://www.reddit.com/r/Flipping/comments/uaz1wt/has_anyone_gained_access_to_ebays_marketplace/
- r/Ebay, eBay API for sold items: https://www.reddit.com/r/Ebay/comments/181jf5i/ebay_api_for_sold_items/

### YouTube signal sources

- Amazon online arbitrage beginner guide, 2026: https://www.youtube.com/watch?v=V0lMedQJzmQ
- Online arbitrage sourcing method for beginners, 2026: https://www.youtube.com/watch?v=MWyq0J18-sM
- Keepa for Amazon FBA complete tutorial, 2026: https://www.youtube.com/watch?v=UCWWuCIqvQM
- Keepa tutorial, 2026: https://www.youtube.com/watch?v=a9Lgqaddnro
- SellerAmp and Keepa beginner guide: https://www.youtube.com/watch?v=L1Qiwiv7Gkg
- SellerAmp and Keepa product research tutorial, 2025: https://www.youtube.com/watch?v=jmDnyPPpGKI
- SellerAmp German tutorial: https://www.youtube.com/watch?v=XxRq_-LNH5c
- Amazon Germany start/selling market video: https://www.youtube.com/watch?v=fdieTch5txg
- Online Arbitrage Germany video: https://www.youtube.com/watch?v=_PgIt4fRFJc
- Can EUR 1,000 start an Amazon Germany business in 2026: https://www.youtube.com/watch?v=9GQco9woUeY
- eBay Product Research/Terapeak tutorial: https://www.youtube.com/watch?v=9Xjm9uUsmjQ
- eBay Terapeak guide: https://www.youtube.com/watch?v=BtufGwRVw1s

## Market and operator learnings

### 1. Arbitrage is possible, but the easy version is gone

Reddit discussions repeatedly say the same thing in different words: arbitrage can work, but it is no longer a simple scan-and-buy game. Operators mention hundreds of hours of searching before finding profitable, replenishable products. The winning pattern is not "one lucky flip"; it is repeatable sourcing filters, demand evidence, test buys, and a feedback loop.

Implication for Buysell: the product should optimize for repeatable discovery and learning, not just one-off opportunity search.

### 2. Keepa is the default source of truth for Amazon history

Reddit and YouTube operators treat Keepa as essential. They use it to judge:

- 30/90/180-day average price, not just current price.
- Buy Box history and current Buy Box.
- Amazon in-stock/out-of-stock behavior.
- Sales rank history and rank drops.
- Offer count changes.
- Seasonality and Q4 behavior.
- Price crash risk when Amazon or many sellers restock.

Implication: every opportunity should show a compact Keepa evidence summary:

- Current Buy Box.
- 30/90-day average Buy Box or new price.
- 90-day lowest price.
- Sales rank current/average and rank-drop count.
- Amazon availability.
- New/FBA offer count trend.
- Warning when the margin only exists because of a temporary stock gap.

### 3. SellerAmp/BuyBotPro solve analysis, not the full Germany workflow

SellerAmp, BuyBotPro, Tactical Arbitrage, and SourceMogul all emphasize product analysis, ROI/profit calculators, advanced sourcing filters, offer data, Keepa visibility, and Amazon-focused decisions. This validates the feature set, but it also exposes gaps:

- Most tools are Amazon-first.
- Germany-specific eBay.de sold/live comp analysis is not the center of the workflow.
- VAT/accounting assumptions vary and are not always transparent.
- Exact cross-marketplace identity matching is still hard.
- Existing tools often help humans source; they do not provide a full audited workflow from discovery to listing, order, buy, repricing, pause, and realized P/L.

Implication: Buysell should not copy a calculator. It should be an operations layer around reliable data and approvals.

### 4. eBay sold data is valuable but messy

eBay Product Research/Terapeak exposes historical sales data, trends, average sale price, sold price range, seller counts, listing format, sell-through, and seasonality. Reddit discussions show that operators do not fully trust one sold-data view. Standard sold filters, Terapeak, third-party tools, and scraped APIs can disagree.

Implication: the tool should store market evidence with source labels and confidence:

- Official eBay Product Research import/export when available.
- eBay Browse API for active listings.
- SerpApi or another provider for search/result scraping where needed.
- Manual sold-comp import when API access is limited.
- Confidence penalties when sold sample size is too small or price spread is too wide.

### 5. Current price is a trap

Multiple sources point to the same failure mode: a product looks profitable at the current price, but the normal price/rank/competition history says otherwise. The product may be temporarily inflated because Amazon is out of stock, a seller is testing a high price, or Q4 demand is active.

Implication: default scoring should prefer normal price and sell-through over current spread:

- Use conservative sale price: min(current viable price, 90-day average, recent eBay median).
- Require a margin buffer over the conservative price.
- Show upside separately from base-case profit.
- Flag "stock-gap arbitrage" as a distinct strategy, not as normal profit.

### 6. eBay and Amazon customer behavior differs

Experienced marketplace sellers report that some products sell nonstop on Amazon and barely move on eBay, and vice versa. Amazon rewards Prime, Buy Box, convenience, reviews, and listing consolidation. eBay rewards price, condition variety, used/refurbished inventory, search title quality, seller reputation, and long-tail demand.

Implication: the tool needs marketplace-specific demand logic:

- Amazon demand: BSR/rank history, review count, Buy Box activity, offer count, category rank percentile.
- eBay demand: sold count, sell-through, active/sold ratio, median sold price, condition distribution, seller competition, title keyword patterns.

## Germany-specific operating assumptions

### Market setup

For Germany, the application should default to:

- Amazon domain: `amazon.de`.
- Keepa domain id: `3`.
- Amazon SP-API marketplace ID: `A1PA6795UKMFR9` for Germany.
- eBay marketplace ID: `EBAY_DE`.
- eBay locale/content language: `de-DE`.
- Currency: `EUR`.
- Default domestic postal code for proximity/shipping assumptions: e.g. Berlin `10115`, configurable.

The current Buysell `marketplaces.ts` already includes Germany as the first configured market with Amazon.de, eBay.de, EUR, Keepa domain id 3, and postal code 10115.

### Fee assumptions must be data-driven

eBay.de fee logic changed for commercial sellers effective 2026-02-12. The official eBay.de seller portal says the fixed fee remains EUR 0.35 up to EUR 10 order value and becomes EUR 0.45 for orders over EUR 10. It also raises the variable commission above category thresholds from 2% to 3%, and selected categories move from 11% to 12%.

Private eBay.de selling within Germany is listed by eBay as free, but an arbitrage tool built for repeat profit should model commercial-seller economics. Do not build a product whose margin only works under private-seller assumptions.

Implication:

- Store fee rate cards by marketplace, category, seller type, shop subscription, item condition, effective date, and threshold.
- Do not hard-code one `0.11` German eBay fee forever.
- Save the fee-card version used on each profit snapshot for auditability.
- Add an admin update path for fee tables.

### VAT/tax should be a financial mode, not a single percent

The current Buysell Germany default uses 19% as `estimatedSalesTaxRate`. That is useful as a conservative starter assumption, but serious Germany operation needs modes:

- Gross-only beginner mode: treat source cost as gross paid price and apply no input VAT reclaim.
- VAT-registered mode: split gross/net cost, input VAT, output VAT, and marketplace VAT on fees.
- Kleinunternehmer-like mode: gross cost/revenue view without input VAT reclaim.
- Reduced-rate category override where applicable.
- Cross-border EU mode later, with separate VAT and currency assumptions.

This is not just legal/accounting polish. If the app handles VAT incorrectly, the tool will approve false profit.

## Best-practice arbitrage workflow

### Step 1: Choose a strategy lane

Do not mix every strategy into one score. The tool should make the operator choose or infer the lane:

1. Amazon.de to eBay.de: buy from Amazon, sell on eBay.
2. eBay.de to Amazon.de: buy from eBay, sell on Amazon.
3. eBay.de replenishment: find more of products that already sold profitably.
4. Stock-gap arbitrage: sell when Amazon is repeatedly out of stock and price rises.
5. Used/refurbished arbitrage: eBay condition spread to eBay or Amazon used offers.
6. Bundle/multipack arbitrage: same item but pack-count economics differ.

Each lane needs different risk gates.

### Step 2: Start with exact identity, then economics

The matching engine should prefer signals in this order:

1. Same EAN/GTIN/UPC/ISBN.
2. Same ASIN found on eBay listing or external catalog.
3. Same brand plus exact MPN/model.
4. Same brand plus normalized model tokens plus compatible image.
5. Same product family with manual review only.

Automatic approval should reject:

- Pack-count conflicts.
- Size/color/storage-capacity conflicts.
- New vs used mismatch unless the strategy lane explicitly supports it.
- Bundle vs single-unit mismatch.
- Generic/private-label ambiguity.
- "Compatible with" listings where the Amazon item is the original product.
- Title-only matches without a durable identifier.

### Step 3: Use conservative sale-price evidence

Recommended sale-price ladder:

- For Amazon selling: use current Buy Box only if it is supported by 30/90-day history, recent rank movement, and offer count. Otherwise use 90-day average or lower percentile.
- For eBay selling: use recent sold median, not active listing ask price. Penalize high spread and low sold sample size.
- For stock-gap plays: compute a base case at normal price and an upside case at gap price.

### Step 4: Calculate true landed cost

A realistic Germany arbitrage calculator needs:

- Source item price.
- Source shipping.
- Source VAT mode.
- Prep/packaging.
- Outbound shipping label or FBA inbound/fulfillment fee.
- eBay final value fee by category/effective date.
- eBay fixed order fee.
- Promoted listing fee or ad reserve.
- Amazon referral/FBA/closing/storage fees through Product Fees API where possible.
- Return reserve by category.
- Return shipping reserve where seller bears it.
- Cancellation/non-payment reserve.
- Currency conversion buffer for cross-border sourcing.
- Source-price-change buffer.
- Stockout/replacement buffer.
- Minimum cash ROI and minimum absolute profit.

Good default gates for early operation:

- Minimum absolute expected profit: EUR 8-15, category dependent.
- Minimum ROI: 20-35% for normal items; higher for one-off or uncertain matches.
- Minimum margin: 10-15% after all fees/reserves.
- Minimum evidence score: exact ID or manual review.
- Maximum payback period: based on sell-through and rank/sold comps.

### Step 5: Require evidence before action

Every opportunity page should answer:

- What is the exact source item?
- What is the exact destination listing?
- Why do we believe they are the same product?
- What is the conservative sale price?
- What costs were included?
- What data is fresh, and what is stale?
- What could break the profit?
- What action is recommended: watch, test buy, list, reprice, pause, reject, manual review?

The current Buysell evidence ledger is directionally right. The next step is making this evidence the main UI, not an internal JSON blob.

### Step 6: Monitor after listing

The buying decision is not complete when a listing is created. The app must watch:

- Source price changes.
- Source out-of-stock.
- Amazon Buy Box changes.
- eBay active competition.
- Sold velocity.
- Listing visibility.
- Margin after repricing.
- Orders waiting for source purchase.
- Returns/refunds.
- Realized P/L.

Post-listing monitoring is a moat because many arbitrage tools stop at "deal found".

## Product requirements for a good Germany arbitrage app

### Core modules

1. Marketplace configuration
   - Amazon.de/eBay.de defaults.
   - Multi-market later, but do Germany first.
   - Currency, locale, postal code, shipping assumptions, fee-card version.

2. Data connectors
   - Keepa for Amazon price/rank/offers history.
   - Amazon SP-API Product Fees and Product Pricing for fee/offer estimates.
   - eBay Browse API for active eBay.de listings.
   - eBay Sell APIs for listing drafts/offers where credentials exist.
   - eBay Product Research/Terapeak import path for sold comps.
   - SerpApi as fallback/augmentation, with usage tracking.

3. Product identity engine
   - EAN/GTIN/UPC/ISBN extraction and validation.
   - Brand/model/MPN normalization.
   - German/English token normalization.
   - Pack-size and bundle parser.
   - Variation attribute parser.
   - Optional perceptual image hashing.
   - Explainable match score and hard conflict reasons.

4. Market evidence engine
   - Amazon rank/price history summaries.
   - eBay sold median, sold sample size, price spread.
   - Active/sold ratio and competition ratio.
   - Seasonality flag.
   - Stock-gap flag.
   - Source reliability score.

5. Profit engine
   - Fee-card versioning.
   - VAT mode support.
   - Amazon Product Fees API estimates.
   - eBay category/shop/condition fee tables.
   - Risk reserves and scenario analysis.
   - Break-even max buy price.
   - Break-even min sell price.

6. Opportunity scorer
   - Separate scores for identity, economics, demand, stability, competition, source reliability, operational risk, and data freshness.
   - Overall decision: reject, watch, manual review, test buy, list, reprice, pause.

7. Operator UI
   - Scan setup.
   - Opportunity table.
   - Evidence detail.
   - Profit editor.
   - Watchlist.
   - Action queue.
   - Listing/order monitor.
   - Realized P/L ledger.
   - Settings/credentials/API usage.

8. Feedback loop
   - Store false positives and false negatives.
   - Track realized sell time and profit.
   - Learn category/source-specific buffers.
   - Backtest thresholds against historical outcomes.

### Data objects the app should store

- `Marketplace`
- `FeeRateCard`
- `VatMode`
- `SourceListing`
- `DestinationListing`
- `ProductIdentity`
- `IdentityEvidence`
- `MarketEvidence`
- `PriceObservation`
- `ProfitScenario`
- `OpportunityDecision`
- `ActionItem`
- `VerificationRecord`
- `ListingLifecycleEvent`
- `Order`
- `PurchaseRecord`
- `ProfitLedgerEntry`
- `ApiUsage`
- `SourceSellerProfile`
- `ProductFamily`
- `ReplenishmentWatchItem`

Buysell already has many of these concepts. The main missing pieces are fee-card/VAT/source-seller richness and official Amazon/eBay data connectors.

## Best categories and filters for early Germany testing

Start narrow. The best MVP is not all of Amazon/eBay.

### Better early categories

- Office electronics and accessories.
- Computer accessories.
- Small consumer electronics with clear model IDs.
- Printer/scanner accessories.
- Tools and DIY items with strong MPN/EAN.
- Toys/games only where gating/brand risk is low and identity is exact.
- Books/media only if fees and rank velocity are modeled carefully.
- Used/refurbished electronics only in a dedicated lane.

### Categories to avoid or force manual review

- Beauty, supplements, medical/health, food, baby safety products.
- Hazmat/battery-heavy products without clear handling data.
- Luxury/fashion unless authentication and variation matching are strong.
- Products with frequent counterfeits.
- Products with many visually similar variants.
- Generic no-brand items.
- High-return categories until return reserve is calibrated.

### Initial source filters

- Domestic Germany location.
- Fixed-price/BIN first; auctions can be a later strategy.
- Seller feedback threshold.
- Item condition explicit.
- Free/known shipping.
- Listing has EAN/MPN/model or high-confidence title/attribute match.
- Avoid listings with weak photos, vague titles, "defekt", "Ersatzteil", "nur Verpackung", "kompatibel", "ohne Zubehoer", unless the lane explicitly handles them.

## Gaps in the existing Buysell app

### What Buysell already does well

Based on the repo docs and code:

- Germany is configured as the default discovery market in `backend/src/services/marketplaces.ts`.
- Keepa domain mapping includes Amazon.de domain id 3.
- The profit calculator includes source shipping, packaging, fixed fee thresholds, return reserves, marketplace buffers, stockout buffers, and taxable source shipping.
- The app has Amazon-first and eBay-first discovery flows.
- It persists opportunities, matches, profit snapshots, evidence, market metrics, action items, orders, purchases, and audit trails.
- It has exact-product evidence requirements and manual verification before listing.
- It has local-agent modes that keep human approval in front of risky actions.
- It has sold-winner replenishment import/watch logic.
- It has price monitoring, repricing/pause concepts, order sync, alerting, API usage, and learning/backtesting hooks.

This is far beyond a calculator MVP.

### Highest-value gaps

1. Official Amazon SP-API fee/pricing integration
   - Current app appears to rely on Keepa and static/default marketplace fee inputs.
   - Add SP-API Product Fees for ASIN/SKU fee estimates and Product Pricing/Offers for live offer context.
   - Keep the warning that Product Fees estimates are not guaranteed; save estimate version/time.

2. eBay.de fee-card engine
   - Current Germany defaults use one broad final value fee rate and fixed fee thresholds.
   - eBay.de commercial fees now vary by category, threshold, shop status, and effective date.
   - Build a configurable fee table instead of code defaults.

3. VAT modes
   - A single 19% source-tax assumption is too blunt.
   - Add gross/net modes, VAT-registered mode, no-input-tax mode, and category override.
   - Save VAT mode per profit snapshot.

4. Official eBay Browse API path
   - Current eBay discovery leans on SerpApi.
   - Add eBay Browse API for active listings on `EBAY_DE`.
   - Keep SerpApi as fallback or augmentation.

5. Sold-comp ingestion from eBay Product Research/Terapeak
   - Official sold-history API access is limited.
   - Add CSV/manual import from eBay Product Research and map it into market metrics.
   - Store source label: Terapeak export, eBay sold search, SerpApi, manual import, historical own sales.

6. Source seller reliability
   - Add eBay seller feedback, seller country, handling time, return policy, stock quantity, sold count, and cancellation history when available.
   - The same margin from a weak source seller should score lower.

7. Image and attribute matching
   - Existing matching appears strong on identifiers/tokens, but product images and structured eBay item specifics would reduce false positives.
   - Add image hash comparison for ambiguous products.
   - Add stronger extraction for storage size, voltage, color, dimensions, model generation, and included accessories.

8. Stock-gap strategy separation
   - Products where profit exists only because Amazon is temporarily out of stock should not be mixed with normal arbitrage.
   - Add a separate "stock-gap" score, required history pattern, and exit/holding assumptions.

9. Realized P/L and learning UX
   - The codebase has ledger/learning concepts. Make realized P/L highly visible.
   - The app should show which score reasons predicted profit and which caused losses.

10. Mobile/manual sourcing
   - Add a simple mobile-friendly barcode/EAN lookup mode.
   - For Germany, this can support local retail, eBay lots, and manual checks without changing the backend logic.

11. API budget and cache controls in the UI
   - Keepa/SP-API/SerpApi calls cost money or quota.
   - Operators need "tokens left", cost per scan, cache hits, and estimated spend before starting large scans.

12. German-language normalization
   - Build German stopword and condition token handling:
     - "neu", "neuwertig", "gebraucht", "defekt", "OVP", "ohne", "mit Rechnung", "Ersatzteil", "kompatibel", "refurbished", "generaluberholt".
   - These tokens should affect condition and risk, not just title similarity.

## Opportunity scoring model

Recommended score components:

1. Identity confidence, 0-100
   - 100: same EAN/GTIN/UPC plus brand/model agreement.
   - 90: same ASIN/EAN found in source listing.
   - 80: brand plus exact MPN/model plus no variation conflict.
   - 60: strong title/model match but missing durable ID; manual review.
   - Below 60: reject or research only.

2. Demand score, 0-100
   - Amazon: rank category percentile, rank-drop frequency, review count, offer activity.
   - eBay: sold count, sell-through, sold recency, active/sold ratio.

3. Price stability score, 0-100
   - Stable 90-day history, low price spread, normal Buy Box behavior.
   - Penalize one-day spikes, Q4-only profit, or Amazon restock crashes.

4. Economics score, 0-100
   - Expected profit, ROI, margin, max buy price, break-even sell price.
   - Use conservative scenario as the default score.

5. Competition score, 0-100
   - Offer count, FBA/FBM mix, Amazon as seller, eBay active competition, undercut pressure.

6. Source reliability score, 0-100
   - eBay seller feedback, domestic shipping, return history, listing clarity, stock quantity.

7. Operational risk score, 0-100
   - Category restrictions, hazmat/battery, fragile/high-return, gated brand, invoice requirement risk, condition ambiguity.

8. Data freshness score, 0-100
   - All key price/availability observations should have timestamps and TTLs.

Overall decision should not be a weighted average only. Use hard stops:

- Identity conflict: reject.
- Profit below minimum: reject.
- Data stale: recheck.
- Source out of stock: reject/watch.
- High operational risk: manual review.
- Exact match plus strong economics/demand: action candidate.

## MVP product design

### First-screen workflow

The app should open to the actual work surface, not a landing page:

- Left: scan profiles and watchlists.
- Center: opportunity table sorted by expected value.
- Right: selected opportunity evidence/profit panel.
- Top bar: market `DE`, API budget, safe mode, alerts.

### Opportunity table columns

- Decision.
- Score.
- Product title.
- Source market and price.
- Destination market and conservative sale price.
- Expected profit.
- ROI.
- Match confidence.
- Demand signal.
- Price stability.
- Data age.
- Risk flags.
- Next action.

### Opportunity detail page

Sections:

- Identity evidence: identifiers, brand/model, pack size, variation, images.
- Amazon evidence: Keepa summary, Buy Box, rank, offers, Amazon stock.
- eBay evidence: sold comps, active comps, seller/source data.
- Profit scenarios: conservative/base/upside.
- Risk flags.
- Verification checklist.
- Action buttons: watch, reject, test buy, create draft, recheck prices.

### Settings pages

- Market: Germany defaults, postal code, currency.
- Fees: eBay fee table, Amazon fee source, effective dates.
- VAT/accounting mode.
- API credentials and quota.
- Score thresholds.
- Category/brand/source blocklists.
- Automation mode and approvals.

## Build roadmap

### Phase 0: Data correctness hardening

Goal: prevent false profit.

- Add Amazon SP-API marketplace config for Germany.
- Add Product Fees API estimates for ASINs.
- Add Product Pricing/offer checks where permissions allow.
- Add eBay.de fee-card table with effective dates.
- Add VAT mode support.
- Save fee/VAT assumptions on every profit snapshot.
- Add UI visibility for fee-card version and VAT mode.

### Phase 1: Better Germany discovery

Goal: improve source data and matching.

- Add eBay Browse API active listing connector with `EBAY_DE` and `de-DE`.
- Add structured eBay item specifics extraction.
- Add Terapeak/Product Research CSV import for sold comps.
- Add source seller reliability scoring.
- Add German condition/risk token parser.
- Add pack-size and variation conflict UI.

### Phase 2: Operator-grade opportunity workflow

Goal: make decisions explainable and repeatable.

- Build evidence-first opportunity detail screen.
- Add conservative/base/upside profit scenarios.
- Add stock-gap strategy lane.
- Add watchlist recheck schedules.
- Add mobile barcode/EAN lookup.
- Add test-buy tracking.

### Phase 3: Monitoring and realized P/L

Goal: close the loop after listing.

- Surface realized P/L as a primary dashboard metric.
- Add order-to-purchase profitability reconciliation.
- Track predicted vs realized profit per product family.
- Alert on source price jump, source stockout, stale verification, negative margin, and high-return products.
- Backtest thresholds by category/source.

### Phase 4: Scale and moat

Goal: make the app smarter than manual tools.

- Add image hash matching.
- Add category rank normalization.
- Add replenishment recommendations from own sold winners.
- Add source seller cohorts.
- Add API cost optimization and scan planner.
- Add multi-market EU expansion only after Germany is reliable.

## Key product gaps in the market

1. Germany-first arbitrage workflow
   - Existing content/tools are often US/UK/Amazon-first.
   - A focused Amazon.de/eBay.de workflow is underserved.

2. eBay.de sold comps plus Amazon.de Keepa in one evidence view
   - Users currently stitch together Keepa, SellerAmp, eBay sold search/Terapeak, spreadsheets, and manual checks.

3. VAT/fee transparency
   - Many calculators hide assumptions.
   - Germany needs visible, configurable fee/VAT modes.

4. Exact identity matching
   - False matches are the fastest way to lose money.
   - A tool that rejects ambiguous matches is more valuable than one that shows many fake deals.

5. Post-listing source monitoring
   - Arbitrage profit can disappear after listing.
   - Source price/stock monitoring, repricing, and pause automation are critical.

6. Realized-profit learning
   - Operators need to know which categories/sources actually made money.
   - Most sourcing tools stop before accounting reality.

7. Replenishment from own winners
   - A tool should learn from sold items and search for more of the same product family.

8. Source reliability
   - Two identical prices are not equal if one source seller is unreliable.

9. API budget visibility
   - Serious scanning burns paid data.
   - Operators need cost-per-scan estimates and cache visibility.

10. Strategy separation
   - Normal arbitrage, stock-gap arbitrage, used/refurbished arbitrage, and bundle arbitrage should not share one naive score.

## Recommended immediate Buysell backlog

1. Add `FeeRateCard` and replace broad German eBay fee defaults with category/effective-date data.
2. Add `VatMode` and profit-snapshot persistence of VAT assumptions.
3. Add Amazon SP-API Product Fees client and fallback behavior.
4. Add eBay Browse API active listing client for `EBAY_DE`.
5. Add eBay Product Research/Terapeak CSV import for sold comps.
6. Add source seller profile/reliability scoring.
7. Add German title/condition parser.
8. Add stock-gap lane and flags.
9. Add image-hash matching for ambiguous listings.
10. Add opportunity detail UI around the evidence ledger.
11. Add API cost planner before scans.
12. Add realized-vs-predicted P/L review screen.

## Practical defaults for Germany MVP

- Market: Germany.
- Currency: EUR.
- Amazon source: Keepa + SP-API fees/pricing.
- eBay source: Browse API active listings + Terapeak/Product Research import + SerpApi fallback.
- Default strategy: eBay.de sold-winner replenishment and Amazon.de-to-eBay.de comparison.
- Default condition: new only for automatic approval.
- Used/refurbished: separate manual-review lane.
- Minimum profit: EUR 10.
- Minimum ROI: 25%.
- Minimum match confidence for action: 0.75.
- Minimum sold sample: 5 recent comps for eBay-led decisions, configurable.
- Max data age before action: 15-60 minutes depending on action.
- Safe mode: on by default.
- Auto-buy/publish: off by default; draft/verify first.

## Final recommendation

Build Buysell as a Germany-first arbitrage operating system:

- Use Keepa for Amazon history.
- Use Amazon SP-API for current fee/pricing estimates where authorized.
- Use eBay Browse for active listings and Product Research/Terapeak import for sold comps.
- Make exact product identity the main gate.
- Model Germany fees and VAT explicitly.
- Make every recommendation evidence-backed and auditable.
- Keep human approval for money/listing actions until historical realized P/L proves the workflow.
- Differentiate with post-listing monitoring, replenishment learning, and source reliability scoring.

The product should be intentionally conservative. A good arbitrage tool is not the one that finds the most apparent deals; it is the one that filters out the fake deals before they cost money.
