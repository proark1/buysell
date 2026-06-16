import type { AmazonMatchInput, EbayCandidateInput, OpportunityDecision } from '../domain/products.js';
import type { ProfitCalculatorResult } from './profitCalculator.js';

export interface OpportunityThresholds {
  minimumProfitUsd: number;
  minimumRoiPercent: number;
  minimumMatchConfidence: number;
}

const defaultThresholds: OpportunityThresholds = {
  minimumProfitUsd: 10,
  minimumRoiPercent: 25,
  minimumMatchConfidence: 0.75
};

export function decideOpportunity(
  ebay: EbayCandidateInput,
  amazon: AmazonMatchInput,
  profit: ProfitCalculatorResult,
  thresholds: OpportunityThresholds = defaultThresholds
): OpportunityDecision {
  const riskFlags: string[] = [];

  if ((amazon.matchConfidence ?? 0) < thresholds.minimumMatchConfidence) riskFlags.push('LOW_MATCH_CONFIDENCE');
  if (profit.expectedProfit < thresholds.minimumProfitUsd) riskFlags.push('LOW_PROFIT');
  if (profit.roiPercent < thresholds.minimumRoiPercent) riskFlags.push('LOW_ROI');
  if (!amazon.currentPrice && !amazon.buyBoxPrice) riskFlags.push('MISSING_AMAZON_PRICE');
  if (!ebay.soldPrice) riskFlags.push('MISSING_EBAY_PRICE');
  if (amazon.availabilityStatus && amazon.availabilityStatus !== 'IN_STOCK') riskFlags.push('AMAZON_STOCK_UNKNOWN');

  if (riskFlags.includes('MISSING_AMAZON_PRICE') || riskFlags.includes('MISSING_EBAY_PRICE')) {
    return {
      decision: 'MANUAL_REVIEW',
      confidence: 0.5,
      riskFlags,
      reasoningSummary: 'Missing required price data; route to manual review before listing.'
    };
  }

  if (riskFlags.length > 0) {
    return {
      decision: 'REJECT',
      confidence: 0.8,
      riskFlags,
      reasoningSummary: `Rejected by deterministic safety gates: ${riskFlags.join(', ')}.`
    };
  }

  const recommendedPrice = Math.ceil(((ebay.soldPrice ?? 0) * 1.03) * 100) / 100;

  return {
    decision: 'LIST',
    confidence: 0.9,
    riskFlags,
    reasoningSummary: 'Candidate passes deterministic profit, ROI, stock, and match-confidence gates.',
    recommendedPrice,
    recommendedTitle: ebay.title.slice(0, 80),
    recommendedDescription: `New listing candidate matched to Amazon ASIN ${amazon.asin}. Verify product details before publishing.`
  };
}
