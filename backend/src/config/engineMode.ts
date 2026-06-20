// ───────────────────────────────────────────────────────────────────────────────────────────
// Single switch for the operator's "buy on Amazon, resell on eBay, no costs on top, breakeven
// is fine" model. When BREAKEVEN_MODE is true the engine:
//   • subtracts NO marketplace fees, source tax, or risk buffers (profit = pure spread), and
//   • relaxes the profit / ROI / match-confidence / opportunity-score gates to breakeven,
// overriding whatever is saved in the active RuleConfig row. This makes the behavior consistent
// whether you run a fresh local DB or the production DB, and a deploy flips it on with no DB edit.
//
// Set to false to restore the full costed model (eBay final-value ~11–13% + payment ~3% + source
// VAT + buffers) and the dashboard-configured thresholds.
// ───────────────────────────────────────────────────────────────────────────────────────────
export const BREAKEVEN_MODE: boolean = true;

// Gate values applied while BREAKEVEN_MODE is on. Profit/ROI at 0 accept any non-negative spread;
// the 0.55 match floor lets genuine same-product matches through while brand/model/UPC conflicts
// still hard-reject via the product-identity matcher; opportunity score 20 filters no-demand junk.
export const BREAKEVEN_THRESHOLDS = {
  minimumProfitUsd: 0,
  minimumRoiPercent: 0,
  minimumMatchConfidence: 0.55,
  minimumOpportunityScore: 20
} as const;
