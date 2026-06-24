# Arbitrage Sourcing & Strategy Research — German Market (2025-2026)

> Research synthesis for the Buysell assistant, scoped specifically to the
> **German market**: Amazon.de, eBay.de, German sourcing, and — critically —
> German tax and legal obligations. Compiled June 2026 from German legal/tax
> advisories (e-recht24, Haendlerbund, anwalt.de, Pandotax), official eBay.de
> help pages, German reseller/deal communities (mydealz, Restposten.de), and
> German marketplace policy. The US-market version lives in
> `arbitrage-sourcing-research.md` — this file is the German counterpart.
>
> **This is not legal or tax advice.** German compliance is materially heavier
> than the US; the load-bearing items below (Gewerbe, USt, LUCID, DAC7,
> Widerrufsrecht) should be confirmed with a Steuerberater before scaling.

---

## TL;DR — what's different about Germany

The arbitrage *mechanics* (Keepa on Amazon.de → eBay.de sold comps → profit gate)
are the same as the US. What changes — and what dominates German viability — is
**compliance overhead and consumer-protection law**:

1. **You must register a business (Gewerbe) almost immediately.** Regular,
   profit-oriented reselling is a *gewerbliche* activity in Germany — not a
   hobby. This is not optional once you're buying to resell. [taxfix, pandotax]
2. **Marketplaces enforce LUCID packaging registration.** Since 1 July 2022,
   eBay.de and Amazon.de must block sellers who can't prove **LUCID /
   Verpackungsregister** registration + a dual-system (Duales System) license.
   No bagatelle/minimum threshold — it applies from the first package. Fines up
   to **€200,000**. This is a hard gate to even sell. [e-recht24, deutsche-recycling, haendlerbund]
3. **DAC7 / Plattformen-Steuertransparenzgesetz reporting.** eBay.de and
   Amazon.de report you to the Bundeszentralamt für Steuern once you cross
   **30 transactions OR €2,000 in sales** per platform per calendar year. The
   Finanzamt sees your numbers automatically. [ebay-dac7, kpmg-dac7]
4. **14-day Widerrufsrecht (right of withdrawal).** As a *gewerblicher*
   (commercial) seller you must grant private buyers a 14-day no-reason return.
   This changes your return-rate math vs. the US — bake it into buffers. [shopify-de, general consumer law]
5. **Retail dropshipping is banned on eBay.de** exactly as on eBay.com — and
   German trademark holders enforce aggressively via **Abmahnung** (cease-and-
   desist letters with lawyer fees), which can run into thousands of euros even
   for a single listing. [edesk-de, anwalt-markenverletzung]

> Net: in Germany the binding constraint is usually *compliance*, not finding the
> spread. Buysell's safety/verify gates matter even more here, and the discovery
> engine should treat "are we set up to legally sell this?" as a precondition.

---

## 1. Legal & tax setup (the German gate — do this first)

- **Gewerbeanmeldung.** Buying to resell regularly = a trade. Register a Gewerbe
  at the local Gewerbeamt; the Finanzamt then issues a Steuernummer (and a
  USt-IdNr. if you're umsatzsteuerpflichtig). eBay.de requires gewerbliche
  sellers to flag themselves as commercial. [taxfix, pandotax, ebay-rechtsportal]
- **Kleinunternehmerregelung (§19 UStG).** You can skip charging/remitting VAT if
  prior-year gross turnover was **under €22,000** and the current year is expected
  **under €50,000**. Pros: no USt on invoices, no monthly USt-Voranmeldung. Con:
  you can't reclaim Vorsteuer (input VAT) on your purchases — which hurts if your
  buy costs are high. [pandotax, anwaltonline, internetrecht-rostock]
- **Regelbesteuerung + Differenzbesteuerung (§25a UStG).** If you go VAT-regular,
  resellers can use **margin taxation (Differenzbesteuerung)** — VAT is charged
  only on the *difference* between buy and sell price, not the full sale. This is
  the classic reseller-friendly scheme (esp. for used goods sourced without VAT
  invoices). [pandotax]
- **Standard VAT rate is 19%** (7% reduced for some goods). Factor 19% into
  pricing once you're past Kleinunternehmer status.
- **DAC7 / PStTG reporting thresholds:** platform reports you at **≥30 sales OR
  >€2,000/year** (net of fees), per platform. Reporting ≠ automatic tax owed, but
  it means the Finanzamt can cross-check — so your books must be clean. [ebay-dac7, ing-psttg]

## 2. Mandatory operational compliance (hard sell-blockers)

- **LUCID / Verpackungsgesetz (VerpackG).** Register at the
  Verpackungsregister (ZSVR/LUCID) — free — AND license your packaging with a
  dual system (e.g. Der Grüne Punkt, Reclay, etc.) which costs money. Marketplaces
  verify this and **disable your selling function** if missing. No minimum
  threshold. Penalty up to €200k. **Treat this as a precondition to listing.**
  [e-recht24, deutsche-recycling, haendlerbund, epr-one]
- **Widerrufsrecht (14-day returns).** Commercial sellers must provide a compliant
  Widerrufsbelehrung and accept 14-day returns from consumers. Higher effective
  return rate than US eBay → widen the return-risk buffer in the profit calc. [shopify-de]
- **Imprint/Impressum + legal texts.** Gewerbliche sellers need an Impressum, AGB,
  Datenschutz, and correct Widerrufsbelehrung on their eBay.de profile/listings —
  missing/wrong ones are a classic Abmahnung trigger. [haendlerbund]
- **WEEE/ElektroG (Elektrogesetz) + BattG.** If you sell electronics or batteries
  (a top arbitrage category!), you may also need WEEE registration (Stiftung EAR)
  and battery registration. Another reason electronics is higher-compliance in DE. [general]

## 3. How the model works best in Germany

- **eBay.de retail dropshipping = verboten**, same as globally: listing first and
  having Amazon/another retailer ship to your buyer is prohibited; enforcement
  tightened 2024-2025. The compliant model is **buy → take possession → list →
  ship yourself** (or wholesale/manufacturer dropship with proper invoices). [edesk-de, amzscout-de]
- **Velocity over margin still rules.** Use eBay.de **Terapeak** (built into Seller
  Hub) for sold-price/demand research — it's the native German sold-comp tool the
  guides point to. [amzscout-de-bestseller, shopify-de]
- **Refurbished / used is a bigger, more accepted segment in Germany** than the US.
  German buyers actively search refurbished electronics and sustainable/secondhand
  branded fashion — and used goods pair well with Differenzbesteuerung. [amzscout-de-bestseller]
- **Margin reality:** after eBay.de fees (~11-13% Verkaufsprovision + payment),
  19% VAT once you're VAT-regular, Widerruf returns, and LUCID/EPR overhead, German
  net margins are *thinner* than the US for the same item. Gate harder on ROI. [general, pandotax]

## 4. What products work best on eBay.de / Amazon.de (2025-2026)

German bestseller categories cited across guides:
- **Electronics & accessories** — smartphones, laptops, consoles, smartwatches,
  headphones; **refurbished is especially strong**. High price → higher margin,
  but also higher compliance (WEEE) and VeRO/brand risk. [amzscout-de-bestseller, shopify-de]
- **Gaming & pop culture** — retro consoles, trading/Sammelkarten, limited
  merch — booming, same as US. [amzscout-de-bestseller]
- **Sustainable / vintage fashion & branded secondhand** — German buyers
  deliberately seek nachhaltige Mode and used branded items (Secondhand). [amzscout-de-bestseller]
- **Smart home & wearables** — smart plugs, fitness bands — rising demand. [amzscout-de-bestseller]
- **DIY / Handarbeit / Modellbau** — craft materials and tools resurging. [amzscout-de-bestseller]
- **Home & deco, household goods** — stable, beginner-friendly, easy to ship. [amzscout-de-bestseller, shopify-de]

**Winning traits (same logic as US):** branded & identifiable (clean EAN/MPN),
small/light (German shipping via DHL/Hermes is pricey — value-to-weight matters),
replenishable, year-round, and *not* trademark-restricted. Apply Keepa on
**Amazon.de** (German Verkaufsrang/sales rank, German Buy Box) — a US BSR is
not the German one. [stacvalley, ing-arbitrage]

## 5. Where to source good offers (German-specific)

**Liquidation / Restposten / Retouren (B2B pallets — the German staple):**
- **Restposten.de** — the central German marketplace for A-/B-Ware, Retourware,
  Mischpaletten, Auslaufmodelle; checked daily by Amazon-arbitrage sellers. [restposten, mydealz-tools]
- **Retourenking**, **Salzmann Restwaren**, **retoure-paletten.de** — branded
  return pallets / B-Ware for resale (DE/AT/CH sourced). [retourenking, salzmann]
- **B-Stock Europe** and **Merkandi** — pan-EU liquidation auctions/wholesale. [merkandi]
- Note: pallet quality varies (B-Ware = cosmetic defects, Mischpaletten = random
  mix); best lots sell before they're even publicly listed. [restposten, salzmann]

**Deal / clearance hunting (retail arbitrage, buy-and-hold):**
- **mydealz.de** — the dominant German deal community (the German equivalent of
  the Slickdeals/r/buildapcsales scene); surfaces price errors (Preisfehler) and
  flash discounts. [mydealz]
- **Kaufda** — aggregates Prospekte/offers from Rossmann, MediaMarkt, Kaufland &
  co. in one place — explicitly called out as valuable for retail-arbitrage
  sellers. [mydealz-tools]
- **idealo, Geizhals, billiger.de, Check24** — price-comparison engines;
  **Geizhals** is electronics/hardware-focused. Use their **Preisalarm** to catch
  drops. These are also your *sell-side comp* reference for what German buyers pay. [mydealz-preisvergleich, geizhals]
- **MediaMarkt / Saturn** promos — MwSt-geschenkt (VAT-off) events and 20x-points
  weekends are recurring arbitrage windows on electronics. [mydealz-mediamarkt]
- German retailers for clearance: **Kaufland, Lidl/Aldi, Rossmann/dm, Otto,
  Real** (Sonderangebote/Ausverkauf). [mydealz-tools]

**Tools:** **Keepa** for Amazon.de history; **eBay Terapeak** (native) for eBay.de
sold comps; SerpApi/eBay APIs for programmatic sold comps (as Buysell already
uses). [stacvalley, amzscout-de-bestseller]

## 6. Account & legal risk / red flags (Germany)

- **Abmahnung culture.** Germany's biggest differentiator: competitors *and* brand
  owners (often via specialized lawyers) send **Abmahnungen** for trademark
  misuse, missing Impressum/Widerrufsbelehrung, wrong packaging compliance, or
  using protected brand names/photos. Costs can reach thousands of euros for a
  single violation. This makes "boring, compliant, generic-but-branded" products
  safer than hot brand-name flips. [anwalt-markenverletzung, marken-legal]
- **eBay VeRO** operates in Germany too — IP owners report listings for removal;
  combine with German trademark law (Markenrecht) and selective-distribution
  (Vertriebsverbot) restrictions that can block resale of certain brands even when
  genuine. [datafeedwatch-de, e-recht24-markenware]
- **Amazon.de brand gating / Kontosperrung.** Amazon deactivates listings or locks
  whole accounts on Markenrechtsverletzung reports — and may lock immediately for
  serious cases. Gated brands/categories block sourcing entirely. [keytersberg, repricerexpress-de]
- **Selective distribution (selektiver Vertrieb).** Some brands legally restrict
  who may resell — reselling genuine units can still draw a Vertriebsverbot/
  Abmahnung. [e-recht24-markenware]
- **Safe-mode exclusions** (already in Buysell, even more important in DE):
  clothing/shoes (returns + IP + WEEE-free but sizing risk), food/supplements/
  cosmetics/medical (heavily regulated), electronics needing WEEE/BattG, weapons,
  adult. [general]

---

## 7. Concrete recommendations for Buysell (German mode)

1. **Add a "German compliance precondition" concept to discovery/operations.**
   Before any LIST, the operator must have Gewerbe + LUCID + dual-system license
   (and WEEE/BattG for electronics). Surface this as an operator checklist /
   settings flag rather than something the engine can assume.
2. **Localize the data sources:** Keepa **Amazon.de** (German Verkaufsrang & Buy
   Box) and **eBay.de Terapeak / .de sold comps** — never reuse US BSR or US sold
   prices for German decisions.
3. **Widen the return-risk buffer** in the profit calculator for DE to reflect the
   mandatory 14-day Widerrufsrecht, and **add a VAT mode** (Kleinunternehmer vs.
   19% Regelbesteuerung vs. §25a Differenzbesteuerung) so landed-cost/net-profit
   math is correct for the operator's tax status.
4. **Extend the brand blocklist for German Abmahnung/VeRO risk** (luxury, Apple,
   Nike, plus selective-distribution brands) and flag them to manual review — the
   downside in Germany (lawyer Abmahnung) is more expensive than a US listing pull.
5. **Bias German profiles toward the proven DE winners:** refurbished/used
   electronics, gaming & Sammelkarten, branded secondhand, smart home, DIY —
   small, light, identifiable, year-round.
6. **Track the DAC7 thresholds** (30 sales / €2,000 per platform) as an operator
   dashboard metric so the user knows when reporting kicks in.

---

## Sources

**eBay.de / Amazon.de arbitrage & dropshipping policy**
- eDesk (DE) — Dropshipping von Amazon zu eBay (2025): https://www.edesk.com/de/blog/dropshipping-amazon-ebay/
- AMZScout (DE) — Ist Dropshipping legal?: https://amzscout.net/de/blog/ist-dropshipping-legal/
- AMZScout (DE) — Amazon Arbitrage 2025: https://amzscout.net/de/blog/amazon-arbitrage/
- ING — Arbitrage erklärt: https://www.ing.de/wissen/arbitrage/
- RA Wenck — Amazon-eBay-Arbitrage rechtlich: https://www.rechtsanwalt-wenck.de/cross-plattform-ninja-dropshipping-amazon-ebay/
- RepricerExpress (DE) — Retail Arbitrage auf Amazon 2025: https://www.repricerexpress.com/de/wie-man-die-einzelhandelsarbitrage-auf-amazon-im-jahr-2024-zerschlaegt/

**Tax / Gewerbe / VAT**
- Taxfix — eBay-Einnahmen versteuern, privat oder gewerblich: https://taxfix.de/ratgeber/pflichten/ebay-steuern-zahlen-privat-oder-gewerblich/
- Pandotax — eBay Steuern: https://pandotax.de/ecommerce/ebay-steuern/
- Pandotax — Dropshipping Steuern: https://pandotax.de/ecommerce/dropshipping-steuern-chancen-und-risiken/
- AnwaltOnline — Umsatzsteuer & Kleinunternehmer: https://www.anwaltonline.com/ebay-recht/tipps/635/online-verkaeufe-und-die-umsatzsteuer-was-kleinunternehmer-wissen-muessen
- Internetrecht-Rostock — eBay Kleinunternehmerregelung: https://www.internetrecht-rostock.de/ebay-kleinunternehmerregelung
- eBay.de Rechtsportal (gewerbliche Verkäufer): https://pages.ebay.de/rechtsportal/gewerbliche_vk_3.html

**DAC7 / Plattformen-Steuertransparenzgesetz**
- eBay.de — DAC7 & PStTG Meldepflichten: https://www.ebay.de/help/selling/selling/eu-dac7-und-das-plattformensteuertransparenzgesetz-meldepflichten?id=5394
- KPMG — DAC7 Steuertipp: https://kpmg.com/de/de/themen/corporate-governance-und-compliance/kpmg-steuertipps/steuertipp-dac7-meldepflicht-digitaler-plattformbetreiber.html
- ING — Plattformen-Steuertransparenzgesetz Überblick: https://www.ing.de/wissen/plattformen-steuertransparenzgesetz/
- Pandotax — PStTG 2026 für Händler: https://pandotax.de/ecommerce/plattform-steuertransparenzgesetz-haendler/

**Verpackungsgesetz / LUCID / consumer law**
- e-recht24 — Verpackungsgesetz für Onlineshops: https://www.e-recht24.de/ecommerce/212-verpackungsgesetz-fuer-onlineshops.html
- Deutsche Recycling — Verpackungsverordnung Online-Shop 2025: https://deutsche-recycling.de/blog/verpackungsverordnung-online-shop/
- Haendlerbund — Das Verpackungsgesetz (VerpackG): https://www.haendlerbund.de/de/ratgeber/recht/4032-das-verpackungsgesetz
- EPR One — LUCID-Registrierung 2025: https://epr-one.com/de/articles/lucid-registrierung-deutschland-verpackungsgesetz-2025
- anwalt.de — Abmahnfalle Verpackungsgesetz (LUCID): https://www.anwalt.de/rechtstipps/abmahnfalle-verpackungsgesetz-lucid-was-online-haendler-unbedingt-beachten-sollten-248709.html

**Best products / categories (DE)**
- AMZScout (DE) — Was verkauft sich gut auf eBay, Top 50: https://amzscout.net/de/blog/was-verkauft-sich-gut-auf-eBay/
- Shopify (DE) — Was verkauft sich gut auf eBay: https://www.shopify.com/de/blog/was-verkauft-sich-gut-auf-ebay
- StacValley — Amazon Arbitrage Praxisleitfaden: https://en.stacvalley.de/

**Sourcing sources (DE)**
- Restposten.de — Palettenware: https://www.restposten.de/palettenware
- Retourenking — Rest- & Sonderposten: https://retourenking.de/rest-sonderposten/
- Salzmann Restwaren — Retourware: https://salzmann-restwaren.de/products/retourware/
- retoure-paletten.de: https://retoure-paletten.de/
- Merkandi — Mixed electronics pallets: https://merkandi.us/categories/pallets-of-mixed-electronics/34
- mydealz — Deals community: https://www.mydealz.de/
- mydealz — Preisvergleich-Guide: https://www.mydealz.de/magazin/preisvergleich-guide-so-kommt-ihr-auf-den-wirklich-besten-preis-21349
- Geizhals — Deals: https://geizhals.de/?deals=1
- profithunch — mydealz-Alternativen & Tools (Kaufda etc.): https://profithunch.de/blog/mydealz-alternative-vergleich

**Trademark / VeRO / account risk (DE)**
- anwalt.de — Markenverletzung auf Amazon & eBay: https://www.anwalt.de/rechtstipps/markenverletzung-auf-amazon-und-ebay-typische-fehler-von-onlinehaendlern-erfahrungen-und-praxis-tipps-265661.html
- e-recht24 — Markenware über eBay/Shops verkaufen (Vertriebsverbot): https://www.e-recht24.de/ecommerce/5981-markenware-onlineshops-vertriebsverbot.html
- DatafeedWatch (DE) — eBay VeRO-Programm: https://www.datafeedwatch.de/blog/alles-was-sie-uber-das-ebay-vero-programm-wissen-mussen
- Keytersberg — Amazon Kontosperrung wegen Markenrecht: https://keytersberg.de/amazon-kontosperrung-markenrecht
- marken.legal — Abmahnung im Online-Handel: https://marken.legal/en/attorney-at-law/trademark-law/warning-letter-online-trade/

> **Source-quality caveat:** product/tool roundups are vendor marketing
> (directional). The high-confidence, load-bearing items are the **legal/tax/
> compliance** points (Gewerbe, USt/Kleinunternehmer §19, Differenzbesteuerung
> §25a, LUCID/VerpackG, DAC7/PStTG, Widerrufsrecht, Abmahnung/Markenrecht), which
> are corroborated across independent German legal/tax sources and official
> eBay.de pages. Confirm specifics with a Steuerberater/Anwalt before scaling.
