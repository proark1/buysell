# Arbitrage Sourcing & Strategy Research (2025–2026)

> Research synthesis for the Buysell Amazon↔eBay arbitrage assistant.
> Compiled June 2026 from reseller blogs, eBay/Amazon policy pages, the eBay
> seller community, and practitioner guidance circulating on Reddit (r/Flipping,
> r/FulfillmentByAmazon) and YouTube reseller channels. Every claim is cited at
> the bottom. Treat marketplace-policy points as the highest-confidence items
> and "best product" lists as directional, not guarantees.

---

## TL;DR for this project

1. **The single most important finding is a policy one, and it directly shapes
   how Buysell should be operated.** eBay **bans retail dropshipping** — listing
   an item and, only after it sells, ordering it from Amazon/Walmart/Target to
   ship straight to the eBay buyer. That exact pattern is what gets accounts
   restricted or suspended, and Amazon also cancels/locks the buyer side when it
   detects you're shipping its inventory to third-party addresses. What *is*
   allowed is buying discounted stock, **taking possession of it**, then listing
   and shipping it yourself. Buysell's `BUY`-after-`SELL` order-sync flow is the
   risky pattern unless the operator actually holds inventory; the
   `VERIFY → LIST` gate and "hold then ship" model is the compliant one.
2. **Velocity beats margin.** Across both platforms the consistent advice is to
   rank on *sell-through / sales-rank stability first*, then profit. A 40% ROI
   item that sits for 6 months is worse than a 20% item that turns in 2 weeks.
3. **Best categories are boring, branded, replenishable consumables and
   accessories** — not trendy one-offs. This matches the repo's recent commits
   ("Focus discovery on proven replenishment products", "Bias sourcing toward
   identifiable, branded products").
4. **Sourcing edge comes from breadth of scanning + sold-comp truth.** The pros
   scan 1,000+ stores (Tactical Arbitrage), gate on Keepa history, and price
   against eBay *sold* comps — exactly the Amazon-Scout (Keepa) → eBay-sold-comp
   pipeline Buysell already implements.

---

## 1. How the model works best (practitioner consensus)

- **Arbitrage itself is legal** — there is no law against buying low and selling
  high. The legal/viable line is about *fulfillment method and IP*, not the act
  of reselling. [edesk, ebay-community, sellbery]
- **Two execution modes, very different risk:**
  - *Inventory arbitrage (compliant):* buy clearance/liquidation stock, hold it,
    list it, ship it yourself. Allowed on eBay. [ebay-community]
  - *Retail dropshipping (banned on eBay):* list first, buy from another retailer
    after the sale, have that retailer ship to your buyer. Explicitly prohibited;
    enforcement ramped up 2024–2026. [edesk, doba, super-ds]
- **Why people still do Amazon→eBay anyway:** eBay buyers will pay a premium for
  convenience/findability, and Amazon's catalog + discounts create the spread.
  But the margin is thin and the account risk is real, which is why several 2026
  write-ups bluntly call pure Amazon→eBay arbitrage "dead" as a dropship play and
  push toward held inventory or wholesale. [loveregards, dropified]
- **Tooling is now table stakes.** Manual sourcing doesn't scale; serious sellers
  since ~2025 rely on AI/product-research tools (Tactical Arbitrage, Seller
  Assistant, ZIK, SmartScout, Keepa) to pre-filter sales history, competition,
  and margins before committing capital. [sellbery, threecolts]
- **The 90-day rule:** only buy what you can realistically sell in ~90 days —
  avoids dead capital (and, on the Amazon side, long-term storage fees).
  [goaura, easync-oa]

### Profit & fee math to gate on
- **eBay take is ~13–15%** of the sale once final-value fees + payment processing
  are included; budget that plus shipping, packaging, and return risk before
  calling anything profitable. [closo, frooition]
- **Common practitioner floors:** many sellers won't touch a deal under **~$3
  net profit or ~30% ROI**; set a per-category BSR cutoff too. [goaura]
- **Net margins by category:** roughly **30–50% in higher-margin niches**
  (vintage, specialty) vs **15–25% in commodity electronics**. A healthy mixed
  book targets ~3–5× cost basis on average, with a few 10× winners and some
  ~1.5× items sold just to free up capital. [closo]

> Buysell already encodes this as the deterministic profit calculator + landed
> cost + return/price-change buffers. The research validates keeping a **hard ROI
> AND velocity gate**, not margin alone.

---

## 2. What products work best

**Winning traits (the through-line across every source):** branded &
identifiable (clean UPC/EAN/MPN match), small/light (cheap shipping, high
value-to-weight), consumable or replenishable (repeat demand), year-round (not
fad-dependent), and not IP-restricted. [closo, flowlister, linnworks]

**Categories repeatedly cited as strong on eBay (2025–2026):**
- **Auto parts & accessories** — frequently called the top eBay category;
  year-round demand, good margins, lower competition on niche fitments. [closo, resellersource]
- **Game controllers / gaming gear** — sell-through commonly **50–70%**. [closo]
- **Electronics accessories** (cables, chargers, adapters, small peripherals) —
  high velocity, though commodity margins (15–25%). [linnworks, flowlister]
- **Collectibles & trading cards** — very high gross dollars (Collectible Card
  Games cited at $166.7M / 1.8M units), but pricing skill required. [closo]
- **Tools & office / home small goods** — steady, identifiable, replenishable —
  matches Buysell's existing "Tools & Office" and "Home / Small Goods" profiles. [linnworks]
- **Specialty apparel with brand pull** (e.g. Patagonia outdoor) — 50%+
  sell-through, *but* brand/IP and condition risk (see VeRO below). [closo]

**Sell-through benchmarks to target:**
- **>50% STR = strong, fast-turning demand.** Top niches hit **50–70%**.
- **<20% STR = slow mover**, capital risk — avoid or deep-discount. [closo]

**On the Amazon (Keepa) side, what a good candidate looks like:**
- **BSR consistently under ~100k** in its category, with frequent, *steady* sales
  (lots of rank "drops"), not one-off spikes. [smartscout, fulltimefba]
- **Stable Buy Box / price history** — use Keepa's "90-day drop %" filter (e.g.
  −20 to +20) to find price-stable products and avoid "trap" deals that look
  cheap because the price is collapsing. [talloak, easync-oa]
- **Manageable competition** — many sellers (>15) on the Buy Box signals a price
  war; ~80% of Amazon sales go through the Buy Box, so heavy competition crushes
  realized price. [smartscout]
- **Watch for seasonal patterns** — a rank that only improves in Q4 is a seasonal
  product that will sit the rest of the year. [fulltimefba, oabeans]

---

## 3. Where to source good offers

**Retail / clearance (buy-and-hold, the compliant path):**
- **Walmart** — perennial #1 for cheapest clearance; **Target** strong on toys,
  detergents, baking, towels; **Home Depot/Lowe's**, **Sears** clearance on
  discontinued lines. [oabeans-stores, linnworks-retail]
- **BrickSeek** — surfaces in-store/online clearance prices at Walmart, Target,
  Lowe's for arbitrage. [linnworks-retail]

**Liquidation / overstock (lots & pallets):**
- **B-Stock** (official liquidation auctions from Walmart/Target/Amazon),
  **Liquidation.com**, **Direct Liquidation**, **888 Lots** (small lots, good for
  beginners), **BlueLots** (no membership fee). [entreresource, sourcemogul]

**Online-arbitrage scanning tools (find the spread at scale):**
- **Tactical Arbitrage** — scans 1,000+ (cited "1,500") stores, ~24M product
  matches/day; the standard for breadth. [oabeans-sites]
- **Seller Assistant / SmartScout / OAXRAY / ZIK Analytics** — pre-filter sales
  history, competition, profitability; ZIK is eBay-centric. [sellbery, threecolts]
- **Keepa** — the price/rank/Buy-Box history backbone for the Amazon side
  (Product Finder filters for BSR, drop count, seller count, price stability). [smartscout, talloak]
- **Sold-comp data for the eBay side** — eBay "sold listings" search, and APIs
  (SerpApi eBay search, third-party sold-listing scrapers) to get *realized*
  prices, not asking prices. [resellbot, underpriced]

> This is exactly Buysell's architecture: **Keepa for Amazon discovery →
> SerpApi/eBay sold comps for realized price → deterministic profit gate.** The
> research suggests the highest-leverage additions are (a) a real **sell-through
> estimate** (sold ÷ (sold+active) over a window) as a first-class score input,
> and (b) **price-stability filters** (90-day drop %) to reject collapsing deals.

---

## 4. Account risk & red flags (highest-confidence section)

- **eBay retail dropshipping ban** — sourcing from another *retailer* (Amazon,
  Walmart, Target) and shipping directly to the buyer is prohibited. Triggers:
  the buyer receives a package with another retailer's invoice/branding, tracking
  that traces to Amazon, etc. Consequence: listing removal, reduced visibility,
  suspension. Compliant alternative is wholesale/manufacturer dropship **or** held
  inventory. [edesk, doba, super-ds, zik-policy]
- **Amazon buyer-side enforcement** — Amazon flags accounts buying to ship to
  third-party addresses (gift-ship at scale), risking order cancellations and
  account locks; gated brands/categories block sourcing entirely. [edesk]
- **eBay VeRO (IP) program** — thousands of brands actively monitor and can have
  listings pulled even on *authentic* goods. **Apple** is one of the most active;
  others frequently cited: **Nike** (restricts resale beyond just photos),
  Harley-Davidson, H&M, plus many luxury/tech names. A single VeRO strike can mean
  removal → restriction → permanent suspension. Don't use brand logos/copyrighted
  photos or "inspired by"/"-style" wording. Check the **VeRO Participant List**
  before listing a brand. [ebay-vero, super-ds-vero, yaballe]
- **Safe-mode exclusions** (already in Buysell, and corroborated): avoid
  clothing/shoes (sizing returns + IP), food/supplements/cosmetics/medical
  (gated, liability), weapons, adult, and any high-return-rate or
  authenticity-sensitive category. [repricerexpress, autods-suspension]
- **Trap deals** — a low Amazon price caused by a *falling* price trend (not a
  real discount); catch with Keepa price-history/drop-% filters. [talloak]

---

## 5. Concrete recommendations for Buysell

1. **Make velocity a first-class, hard gate, not a tiebreaker.** Add/strengthen a
   computed eBay sell-through estimate and an Amazon BSR-stability check; reject
   `<~20%` STR and erratic/seasonal-only rank even when raw margin passes. (The
   repo already has market-metrics scaffolding to extend.)
2. **Add a price-stability gate** using Keepa 90-day drop % to filter "trap"
   deals before they reach the profit calculator.
3. **Keep the `VERIFY → LIST` discipline and hold-inventory framing front-and-
   center** in operator docs — and reconsider/flag the auto-`BUY`-after-eBay-sale
   path, which is the textbook *retail-dropshipping* pattern eBay bans unless the
   operator genuinely holds stock.
4. **Bake a VeRO/brand-risk check into discovery** — maintain a configurable
   blocklist of high-risk brands (Apple, Nike, luxury) and flag them as manual-
   review, mirroring the existing safe-mode keyword exclusions.
5. **Bias profiles toward the proven winners:** branded auto parts/accessories,
   gaming peripherals, electronics accessories, tools/office, replenishable home
   small goods — small, light, identifiable, year-round.
6. **Treat eBay *sold* comps (not active asks) as the price source of truth**,
   and prefer a sample of ≥N recent solds before accepting an opportunity (the
   repo's market-metrics "sold sample size" already points this way).

---

## Sources

**eBay dropshipping / arbitrage policy & viability**
- eDesk — Dropshipping from Amazon to eBay (2025): https://www.edesk.com/blog/dropshipping-amazon-ebay/
- Doba — Understanding eBay's Dropshipping Policy for 2025: https://www.doba.com/blog/dropshipping-platforms/ebay-dropshipping/understanding-ebays-dropshipping-policy-for-2025-36997
- SuperDS — eBay Dropshipping Policy 2026: https://super-ds.com/blog/ebay-dropshipping-policy-2025-you-must-know
- ZIK Analytics — eBay Dropshipping Policy: https://www.zikanalytics.com/blog/ebay-dropshipping-policy/
- Dropified — "Why Amazon Arbitrage is Dead" (2026): https://www.dropified.com/blog/mastering-dropshipping-from-amazon-to-ebay-simplified/
- Love Regards — Amazon to eBay Arbitrage, What It Is and Why It Works: https://loveregards.com/amazon-to-ebay-arbitrage-what-it-is-and-why-it-works/
- eBay Community — "Is retail/online arbitrage reselling currently viable on eBay?": https://community.ebay.com/t5/Selling/Is-retail-online-arbitrage-reselling-currently-viable-on-Ebay/td-p/31139043
- Sellbery — eBay Arbitrage profitable reselling strategies: https://sellbery.com/blog/ebay-arbitrage-finding-hidden-gems-for-a-profitable-resale/
- RepricerExpress — A Seller's Guide to eBay Arbitrage: https://www.repricerexpress.com/sellers-guide-to-ebay-arbitrage/
- AutoDS — How to avoid eBay suspension: https://www.autods.com/blog/dropshipping-tips-strategies/avoid-ebay-suspension/

**Best products / categories / sell-through**
- CLOSO — 15 eBay Best Sellers in 2025: https://closo.co/blogs/inventory-logistics-management/15-ebay-best-sellers-in-2025-and-how-to-find-winning-products-yourself
- Flowlister — Best things to sell on eBay (high-value low-weight): https://flowlister.com/blog/best-things-to-sell-on-ebay/
- Linnworks — How to resell on eBay in 2026 (50 items): https://www.linnworks.com/blog/ebay-reselling/
- Reseller Source — Top selling items on eBay 2025: https://resellersource.com/blog/top-selling-items-ebay/
- Resellbot — Top categories on eBay by sold revenue: https://resellbot.com/top-categories-on-ebay/

**Keepa / Amazon-side sourcing signals**
- SmartScout — How to use Keepa for online arbitrage: https://www.smartscout.com/blog/how-to-use-keepa-for-online-arbitrage
- Full-Time FBA — How to read & understand Keepa graphs: https://www.fulltimefba.com/read-understand-keepa-graphs/
- Tall Oak Advisors — Keepa Product Finder hacks: https://talloakadvisors.com/11-keepa-product-finder-hacks-for-profitable-amazon-sourcing/
- OABeans — How to use Keepa: https://oabeans.com/how-to-use-keepa/
- GoAura — Online Arbitrage getting started (ROI/BSR/90-day): https://goaura.com/blog/online-arbitrage-guide
- Easync — Online arbitrage on Amazon 2025: https://easync.io/articles/online-arbitrage-on-amazon/

**Sourcing sources & scanning tools**
- OABeans — Best stores for retail arbitrage 2025: https://oabeans.com/best-stores-for-retail-arbitrage/
- OABeans — Best OA websites list 2025: https://oabeans.com/best-online-arbitrage-websites/
- Linnworks — Best stores for retail arbitrage: https://www.linnworks.com/blog/retail-arbitrage/
- EntreResource — 12 best liquidation sites for resellers: https://entreresource.com/best-liquidation-sites/
- SourceMogul — Warehouse & overstock liquidation arbitrage: https://www.sourcemogul.com/training/strategy/warehouse-and-overstock-liquidation-arbitrage/
- Threecolts — Best online arbitrage tools 2025: https://www.threecolts.com/blog/best-online-arbitrage-tools/
- Seller Assistant — Best OA websites for lead sourcing: https://www.sellerassistant.app/blog/best-online-arbitrage-websites-for-lead-sourcing/

**eBay sold comps / pricing**
- Resellbot — eBay sold listings free comps search: https://resellbot.com/ebay-sold-listings/
- Underpriced — eBay sold listings price research guide: https://www.underpriced.app/blog/how-to-use-ebay-sold-listings-price-research-guide
- Frooition — eBay fee calculator 2026 / profit margins: https://www.frooition.com/blog/ebay-fee-calculator-2026-the-professional-sellers-guide-to-profit-margins/

**VeRO / IP risk**
- eBay — Intellectual property (VeRO) policy: https://www.ebay.com/help/policies/listing-policies/selling-policies/intellectual-property-vero-program?id=4349
- SuperDS — eBay VeRO List 2026, brands to avoid: https://super-ds.com/blog/ebay-vero-list-2026-brands-to-avoid
- Yaballe — eBay VeRO List 2026 guide: https://yaballe.com/blog/guide-to-the-ebay-vero-list/
- AutoDS — eBay VeRO list / copyright issues: https://www.autods.com/blog/dropshipping-tips-strategies/ebay-vero-guide/

> **Caveat on source quality:** most "best products" and tool-roundup pages are
> marketing content from vendors with a stake in the answer, so product lists are
> directional. The *policy* points (eBay dropshipping ban, VeRO, Amazon buyer
> enforcement) are corroborated across independent sources and the official eBay
> policy page, and should be treated as the load-bearing conclusions.
