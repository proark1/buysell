import type { OpportunityEvidence, OpportunityEvidenceItem, ProductOpportunity } from '../domain/products.js';

const nowIso = (): string => new Date().toISOString();

function item(type: string, source: OpportunityEvidenceItem['source'], value: string, confidence: number): OpportunityEvidenceItem {
  return {
    type,
    source,
    value,
    confidence: Math.max(0, Math.min(1, confidence)),
    capturedAt: nowIso()
  };
}

export function buildOpportunityEvidence(opportunity: ProductOpportunity): OpportunityEvidence {
  const productIdentity: OpportunityEvidenceItem[] = [];
  const economics: OpportunityEvidenceItem[] = [];
  const market: OpportunityEvidenceItem[] = [];
  const safety: OpportunityEvidenceItem[] = [];

  for (const evidence of opportunity.identityMatch?.evidence ?? []) {
    productIdentity.push(item('IDENTITY_MATCH', 'SYSTEM', evidence, opportunity.identityMatch?.confidence ?? 0.5));
  }
  for (const conflict of opportunity.identityMatch?.conflicts ?? []) {
    productIdentity.push(item('IDENTITY_CONFLICT', 'SYSTEM', conflict, 0.95));
  }

  if (opportunity.amazon.asin) productIdentity.push(item('ASIN', 'AMAZON', opportunity.amazon.asin, 1));
  if (opportunity.amazon.brand) productIdentity.push(item('AMAZON_BRAND', 'AMAZON', opportunity.amazon.brand, 0.9));
  if (opportunity.amazon.model) productIdentity.push(item('AMAZON_MODEL', 'AMAZON', opportunity.amazon.model, 0.9));
  if (opportunity.amazon.upc) productIdentity.push(item('AMAZON_UPC', 'AMAZON', opportunity.amazon.upc, 0.95));
  if (opportunity.ebay.itemId) productIdentity.push(item('EBAY_ITEM_ID', 'EBAY', opportunity.ebay.itemId, 0.9));

  economics.push(item('EXPECTED_PROFIT', 'SYSTEM', opportunity.profit.expectedProfit.toFixed(2), 0.9));
  economics.push(item('ROI_PERCENT', 'SYSTEM', opportunity.profit.roiPercent.toFixed(3), 0.9));
  economics.push(item('EBAY_PRICE', 'EBAY', String(opportunity.ebay.soldPrice ?? opportunity.decision.recommendedPrice ?? 'missing'), opportunity.ebay.soldPrice ? 0.9 : 0.45));
  economics.push(item('AMAZON_PRICE', 'AMAZON', String(opportunity.amazon.buyBoxPrice ?? opportunity.amazon.currentPrice ?? 'missing'), (opportunity.amazon.buyBoxPrice ?? opportunity.amazon.currentPrice) ? 0.9 : 0.45));
  if (opportunity.profit.totalLandedCost !== undefined) {
    economics.push(item('TOTAL_LANDED_COST', 'SYSTEM', opportunity.profit.totalLandedCost.toFixed(2), 0.9));
  }

  if (opportunity.marketMetrics) {
    market.push(item('SOLD_SAMPLE_SIZE', 'EBAY', String(opportunity.marketMetrics.soldSampleSize), 0.85));
    if (opportunity.marketMetrics.medianSoldPrice !== undefined) {
      market.push(item('MEDIAN_SOLD_PRICE', 'EBAY', opportunity.marketMetrics.medianSoldPrice.toFixed(2), 0.85));
    }
    if (opportunity.marketMetrics.sellThroughRate !== undefined) {
      market.push(item('SELL_THROUGH_RATE', 'SYSTEM', opportunity.marketMetrics.sellThroughRate.toFixed(4), 0.7));
    }
    for (const reason of opportunity.marketMetrics.reasons) {
      market.push(item('MARKET_REASON', 'SYSTEM', reason, 0.75));
    }
  }

  for (const flag of opportunity.decision.riskFlags) safety.push(item('DECISION_RISK_FLAG', 'SYSTEM', flag, 0.8));
  for (const flag of opportunity.safety?.riskFlags ?? []) safety.push(item('SAFETY_RISK_FLAG', 'SYSTEM', flag, 0.8));
  for (const reason of opportunity.safety?.reasons ?? []) safety.push(item('SAFETY_REASON', 'SYSTEM', reason, 0.8));

  return { productIdentity, economics, market, safety };
}
