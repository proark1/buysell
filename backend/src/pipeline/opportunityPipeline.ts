import type { ProductOpportunity } from '../domain/products.js';
import { searchEbayCandidates } from '../clients/serpApiClient.js';
import { findAmazonMatches } from '../clients/keepaClient.js';
import { scoreAmazonMatch } from '../services/matchScorer.js';
import { calculateProfit } from '../services/profitCalculator.js';
import { decideOpportunity, type OpportunityThresholds } from '../services/opportunityDecider.js';
import { evaluateProductSafety, type SafetyPolicy } from '../services/discoveryPolicy.js';
import { scoreOpportunity } from '../services/opportunityScorer.js';
import { applyIdentityDecision, evaluateProductIdentity } from '../services/productIdentityMatcher.js';
import { buildOpportunityEvidence } from '../services/opportunityEvidence.js';
import { calculateEbayMarketMetrics } from '../services/marketMetrics.js';
import { filterEbaySourceCandidates } from '../services/ebaySourceFilters.js';

export interface BuildOpportunitiesOptions {
  query: string;
  queries?: string[];
  serpApiKey: string;
  keepaApiKey: string;
  limit?: number;
  discoveryProfile?: string;
  minimumOpportunityScore?: number;
  maxAmazonCostUsd?: number;
  thresholds?: OpportunityThresholds;
  estimatedSalesTaxRate?: number;
  returnRiskBuffer?: number;
  priceChangeBuffer?: number;
  sourceShippingCost?: number;
  packagingCost?: number;
  paymentFixedFee?: number;
  promotedListingFeeRate?: number;
  returnReserveRate?: number;
  cancellationReserveRate?: number;
  marketplaceRiskBuffer?: number;
  minimumSellThroughRate?: number;
  maximumCompetitionRatio?: number;
  safeMode?: boolean;
  blockedBrands?: string[];
  blockedCategories?: string[];
  blockedKeywords?: string[];
}

export async function buildOpportunities(options: BuildOpportunitiesOptions): Promise<ProductOpportunity[]> {
  const queryList = (options.queries?.length ? options.queries : [options.query])
    .map((query) => query.trim())
    .filter((query, index, values) => query.length > 0 && values.indexOf(query) === index);

  const candidatesByKey = new Map<string, ProductOpportunity['ebay']>();
  for (const query of queryList) {
    const rawEbayCandidates = await searchEbayCandidates({
      query,
      apiKey: options.serpApiKey,
      limit: Math.max(3, Math.ceil((options.limit ?? 10) / queryList.length))
    });
    const ebayCandidates = filterEbaySourceCandidates(rawEbayCandidates, query).candidates;

    for (const candidate of ebayCandidates) {
      const key = `${candidate.title.toLowerCase()}|${candidate.soldPrice ?? ''}`;
      if (!candidatesByKey.has(key)) candidatesByKey.set(key, candidate);
    }
  }

  const opportunities: ProductOpportunity[] = [];
  const thresholds = options.thresholds ?? { minimumProfitUsd: 10, minimumRoiPercent: 25, minimumMatchConfidence: 0.75 };
  const policy: SafetyPolicy = {
    safeMode: options.safeMode ?? true,
    blockedBrands: options.blockedBrands ?? [],
    blockedCategories: options.blockedCategories ?? [],
    blockedKeywords: options.blockedKeywords ?? [],
    maxAmazonCostUsd: options.maxAmazonCostUsd ?? 150
  };
  const marketMetrics = calculateEbayMarketMetrics({
    soldCandidates: [...candidatesByKey.values()],
    minimumSellThroughRate: options.minimumSellThroughRate,
    maximumCompetitionRatio: options.maximumCompetitionRatio
  });

  for (const ebay of [...candidatesByKey.values()].slice(0, options.limit ?? 10)) {
    const amazonMatches = await findAmazonMatches({
      query: ebay.title,
      apiKey: options.keepaApiKey,
      limit: 3
    });

    const scoredMatches = amazonMatches
      .map((amazon) => ({ ...amazon, matchConfidence: scoreAmazonMatch(ebay, amazon) }))
      .sort((a, b) => b.matchConfidence - a.matchConfidence);

    const bestMatch = scoredMatches[0];
    if (!bestMatch) continue;

    const safety = evaluateProductSafety(ebay, bestMatch, policy);
    const identityMatch = evaluateProductIdentity(ebay, bestMatch);

    const amazonCost = bestMatch.buyBoxPrice ?? bestMatch.currentPrice;
    if (!ebay.soldPrice || !amazonCost) {
      const emptyProfit = { estimatedFees: 0, estimatedTax: 0, bufferAmount: 0, expectedProfit: 0, roiPercent: 0, marginPercent: 0 };
      const baseDecision = safety.status === 'REJECT'
        ? {
          decision: 'REJECT' as const,
          confidence: 0.95,
          riskFlags: safety.riskFlags,
          reasoningSummary: `Rejected by safety policy: ${safety.reasons.join(' ')}`
        }
        : decideOpportunity(ebay, bestMatch, emptyProfit, thresholds);
      const decision = applyIdentityDecision(baseDecision, identityMatch);
      const opportunity: ProductOpportunity = {
        ebay,
        amazon: bestMatch,
        profit: emptyProfit,
        identityMatch,
        decision,
        safety,
        marketMetrics,
        discoveryProfile: options.discoveryProfile
      };
      opportunity.score = scoreOpportunity(opportunity, {
        minimumProfitUsd: thresholds.minimumProfitUsd,
        minimumRoiPercent: thresholds.minimumRoiPercent,
        minimumOpportunityScore: options.minimumOpportunityScore ?? 65
      }, [...new Set([...safety.riskFlags, ...decision.riskFlags, ...marketMetrics.riskFlags])]);
      opportunity.evidence = buildOpportunityEvidence(opportunity);
      opportunities.push({
        ...opportunity
      });
      continue;
    }

    const profit = calculateProfit({
      ebaySalePrice: ebay.soldPrice,
      amazonItemCost: amazonCost,
      estimatedSalesTaxRate: options.estimatedSalesTaxRate ?? 0.08,
      returnRiskBuffer: options.returnRiskBuffer ?? 2,
      priceChangeBuffer: options.priceChangeBuffer ?? 2,
      sourceShippingCost: options.sourceShippingCost ?? 0,
      packagingCost: options.packagingCost ?? 0,
      paymentFixedFee: options.paymentFixedFee ?? 0,
      promotedListingFeeRate: options.promotedListingFeeRate ?? 0,
      returnReserveRate: options.returnReserveRate ?? 0,
      cancellationReserveRate: options.cancellationReserveRate ?? 0,
      marketplaceRiskBuffer: options.marketplaceRiskBuffer ?? 0
    });

    const baseDecision = safety.status === 'REJECT'
      ? {
        decision: 'REJECT' as const,
        confidence: 0.95,
        riskFlags: safety.riskFlags,
        reasoningSummary: `Rejected by safety policy: ${safety.reasons.join(' ')}`
      }
      : decideOpportunity(ebay, bestMatch, profit, thresholds);
    const identityDecision = applyIdentityDecision(baseDecision, identityMatch);

    const preliminaryOpportunity: ProductOpportunity = {
      ebay,
      amazon: bestMatch,
      profit,
      identityMatch,
      decision: identityDecision,
      safety,
      marketMetrics,
      discoveryProfile: options.discoveryProfile
    };
    const score = scoreOpportunity(preliminaryOpportunity, {
      minimumProfitUsd: thresholds.minimumProfitUsd,
      minimumRoiPercent: thresholds.minimumRoiPercent,
      minimumOpportunityScore: options.minimumOpportunityScore ?? 65
    }, [...new Set([...safety.riskFlags, ...identityDecision.riskFlags, ...marketMetrics.riskFlags])]);

    const minimumOpportunityScore = options.minimumOpportunityScore ?? 65;
    const decision = identityDecision.decision !== 'REJECT' && identityMatch.status !== 'REVIEW' && score.total < minimumOpportunityScore
      ? {
        decision: 'REJECT' as const,
        confidence: 0.8,
        riskFlags: [...new Set([...identityDecision.riskFlags, ...marketMetrics.riskFlags, 'LOW_OPPORTUNITY_SCORE'])],
        reasoningSummary: `Rejected because opportunity score ${score.total} is below ${minimumOpportunityScore}.`
      }
      : identityDecision;

    const opportunity: ProductOpportunity = {
      ...preliminaryOpportunity,
      decision,
      score
    };
    opportunity.evidence = buildOpportunityEvidence(opportunity);
    opportunities.push(opportunity);
  }

  return opportunities.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
}
