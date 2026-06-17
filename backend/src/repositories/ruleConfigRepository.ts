import type { PrismaClient } from '@prisma/client';
import { defaultAllowedCategories, defaultBlockedCategories, defaultBlockedKeywords } from '../services/discoveryPolicy.js';
import type { OpportunityThresholds } from '../services/opportunityDecider.js';

export interface ActiveRuleConfig {
  thresholds: OpportunityThresholds;
  estimatedSalesTaxRate: number;
  returnRiskBuffer: number;
  priceChangeBuffer: number;
  sourceShippingCost: number;
  packagingCost: number;
  paymentFixedFee: number;
  defaultPromotedListingFeeRate: number;
  returnReserveRate: number;
  cancellationReserveRate: number;
  marketplaceRiskBuffer: number;
  minimumSellThroughRate: number;
  maximumCompetitionRatio: number;
  maxDailyListings: number;
  maxDailyPurchaseAmountUsd: number;
  safeMode: boolean;
  maxAmazonCostUsd: number;
  minimumOpportunityScore: number;
  blockedBrands: string[];
  blockedCategories: string[];
  blockedKeywords: string[];
  allowedCategories: string[];
  amazonPriceCheckIntervalMinutes: number;
  ebayDiscoveryAutoRunEnabled: boolean;
  ebayDiscoveryAutoRunIntervalMinutes: number;
  ebayDiscoveryAutoRunLimit: number;
  ebayDiscoveryAutoCompareEnabled: boolean;
}

export const defaultRuleConfig: ActiveRuleConfig = {
  thresholds: {
    minimumProfitUsd: 10,
    minimumRoiPercent: 25,
    minimumMatchConfidence: 0.75
  },
  estimatedSalesTaxRate: 0.08,
  returnRiskBuffer: 2,
  priceChangeBuffer: 2,
  sourceShippingCost: 0,
  packagingCost: 0,
  paymentFixedFee: 0,
  defaultPromotedListingFeeRate: 0,
  returnReserveRate: 0,
  cancellationReserveRate: 0,
  marketplaceRiskBuffer: 0,
  minimumSellThroughRate: 0.05,
  maximumCompetitionRatio: 12,
  maxDailyListings: 10,
  maxDailyPurchaseAmountUsd: 250,
  safeMode: true,
  maxAmazonCostUsd: 150,
  minimumOpportunityScore: 65,
  blockedBrands: [],
  blockedCategories: defaultBlockedCategories,
  blockedKeywords: defaultBlockedKeywords,
  allowedCategories: defaultAllowedCategories,
  amazonPriceCheckIntervalMinutes: 30,
  ebayDiscoveryAutoRunEnabled: false,
  ebayDiscoveryAutoRunIntervalMinutes: 1,
  ebayDiscoveryAutoRunLimit: 5,
  ebayDiscoveryAutoCompareEnabled: false
};

const numberValue = (value: unknown, fallback: number): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return fallback;
};

const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : [];

export async function getActiveRuleConfig(db: PrismaClient): Promise<ActiveRuleConfig> {
  const config = await db.ruleConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } });
  if (!config) return defaultRuleConfig;

  return {
    thresholds: {
      minimumProfitUsd: numberValue(config.minimumProfitUsd, defaultRuleConfig.thresholds.minimumProfitUsd),
      minimumRoiPercent: numberValue(config.minimumRoiPercent, defaultRuleConfig.thresholds.minimumRoiPercent),
      minimumMatchConfidence: numberValue(config.minimumMatchConfidence, defaultRuleConfig.thresholds.minimumMatchConfidence)
    },
    estimatedSalesTaxRate: numberValue(config.estimatedSalesTaxRate, defaultRuleConfig.estimatedSalesTaxRate),
    returnRiskBuffer: numberValue(config.returnRiskBuffer, defaultRuleConfig.returnRiskBuffer),
    priceChangeBuffer: numberValue(config.priceChangeBuffer, defaultRuleConfig.priceChangeBuffer),
    sourceShippingCost: numberValue(config.sourceShippingCost, defaultRuleConfig.sourceShippingCost),
    packagingCost: numberValue(config.packagingCost, defaultRuleConfig.packagingCost),
    paymentFixedFee: numberValue(config.paymentFixedFee, defaultRuleConfig.paymentFixedFee),
    defaultPromotedListingFeeRate: numberValue(config.defaultPromotedListingFeeRate, defaultRuleConfig.defaultPromotedListingFeeRate),
    returnReserveRate: numberValue(config.returnReserveRate, defaultRuleConfig.returnReserveRate),
    cancellationReserveRate: numberValue(config.cancellationReserveRate, defaultRuleConfig.cancellationReserveRate),
    marketplaceRiskBuffer: numberValue(config.marketplaceRiskBuffer, defaultRuleConfig.marketplaceRiskBuffer),
    minimumSellThroughRate: numberValue(config.minimumSellThroughRate, defaultRuleConfig.minimumSellThroughRate),
    maximumCompetitionRatio: numberValue(config.maximumCompetitionRatio, defaultRuleConfig.maximumCompetitionRatio),
    maxDailyListings: numberValue(config.maxDailyListings, defaultRuleConfig.maxDailyListings),
    maxDailyPurchaseAmountUsd: numberValue(config.maxDailyPurchaseAmountUsd, defaultRuleConfig.maxDailyPurchaseAmountUsd),
    safeMode: typeof config.safeMode === 'boolean' ? config.safeMode : defaultRuleConfig.safeMode,
    maxAmazonCostUsd: numberValue(config.maxAmazonCostUsd, defaultRuleConfig.maxAmazonCostUsd),
    minimumOpportunityScore: numberValue(config.minimumOpportunityScore, defaultRuleConfig.minimumOpportunityScore),
    blockedBrands: stringArray(config.blockedBrands),
    blockedCategories: stringArray(config.blockedCategories).length > 0 ? stringArray(config.blockedCategories) : defaultRuleConfig.blockedCategories,
    blockedKeywords: stringArray(config.blockedKeywords).length > 0 ? stringArray(config.blockedKeywords) : defaultRuleConfig.blockedKeywords,
    allowedCategories: stringArray(config.allowedCategories).length > 0 ? stringArray(config.allowedCategories) : defaultRuleConfig.allowedCategories,
    amazonPriceCheckIntervalMinutes: numberValue(config.amazonPriceCheckIntervalMinutes, defaultRuleConfig.amazonPriceCheckIntervalMinutes),
    ebayDiscoveryAutoRunEnabled: typeof config.ebayDiscoveryAutoRunEnabled === 'boolean' ? config.ebayDiscoveryAutoRunEnabled : defaultRuleConfig.ebayDiscoveryAutoRunEnabled,
    ebayDiscoveryAutoRunIntervalMinutes: numberValue(config.ebayDiscoveryAutoRunIntervalMinutes, defaultRuleConfig.ebayDiscoveryAutoRunIntervalMinutes),
    ebayDiscoveryAutoRunLimit: numberValue(config.ebayDiscoveryAutoRunLimit, defaultRuleConfig.ebayDiscoveryAutoRunLimit),
    ebayDiscoveryAutoCompareEnabled: typeof config.ebayDiscoveryAutoCompareEnabled === 'boolean' ? config.ebayDiscoveryAutoCompareEnabled : defaultRuleConfig.ebayDiscoveryAutoCompareEnabled
  };
}
