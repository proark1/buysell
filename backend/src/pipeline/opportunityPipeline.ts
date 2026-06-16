import type { ProductOpportunity } from '../domain/products.js';
import { searchEbayCandidates } from '../clients/serpApiClient.js';
import { findAmazonMatches } from '../clients/keepaClient.js';
import { scoreAmazonMatch } from '../services/matchScorer.js';
import { calculateProfit } from '../services/profitCalculator.js';
import { decideOpportunity, type OpportunityThresholds } from '../services/opportunityDecider.js';

export interface BuildOpportunitiesOptions {
  query: string;
  serpApiKey: string;
  keepaApiKey: string;
  limit?: number;
  thresholds?: OpportunityThresholds;
  estimatedSalesTaxRate?: number;
  returnRiskBuffer?: number;
  priceChangeBuffer?: number;
  blockedBrands?: string[];
  blockedCategories?: string[];
}

export async function buildOpportunities(options: BuildOpportunitiesOptions): Promise<ProductOpportunity[]> {
  const ebayCandidates = await searchEbayCandidates({
    query: options.query,
    apiKey: options.serpApiKey,
    limit: options.limit ?? 10
  });

  const opportunities: ProductOpportunity[] = [];

  for (const ebay of ebayCandidates) {
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

    const blockedBrands = options.blockedBrands ?? [];
    const blockedCategories = options.blockedCategories ?? [];
    const isBlockedBrand = bestMatch.brand ? blockedBrands.some((brand) => brand.toLowerCase() === bestMatch.brand?.toLowerCase()) : false;
    const isBlockedCategory = ebay.category ? blockedCategories.some((category) => category.toLowerCase() === ebay.category?.toLowerCase()) : false;

    const amazonCost = bestMatch.buyBoxPrice ?? bestMatch.currentPrice;
    if (!ebay.soldPrice || !amazonCost) {
      const emptyProfit = { estimatedFees: 0, estimatedTax: 0, bufferAmount: 0, expectedProfit: 0, roiPercent: 0, marginPercent: 0 };
      opportunities.push({
        ebay,
        amazon: bestMatch,
        profit: emptyProfit,
        decision: decideOpportunity(ebay, bestMatch, emptyProfit, options.thresholds)
      });
      continue;
    }

    const profit = calculateProfit({
      ebaySalePrice: ebay.soldPrice,
      amazonItemCost: amazonCost,
      estimatedSalesTaxRate: options.estimatedSalesTaxRate ?? 0.08,
      returnRiskBuffer: options.returnRiskBuffer ?? 2,
      priceChangeBuffer: options.priceChangeBuffer ?? 2
    });

    opportunities.push({
      ebay,
      amazon: bestMatch,
      profit,
      decision: isBlockedBrand || isBlockedCategory
        ? {
          decision: 'REJECT',
          confidence: 0.95,
          riskFlags: [isBlockedBrand ? 'BLOCKED_BRAND' : undefined, isBlockedCategory ? 'BLOCKED_CATEGORY' : undefined].filter((flag): flag is string => Boolean(flag)),
          reasoningSummary: 'Rejected by active rule configuration blocklist.'
        }
        : decideOpportunity(ebay, bestMatch, profit, options.thresholds)
    });
  }

  return opportunities;
}
