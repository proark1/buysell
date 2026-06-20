import type { PrismaClient } from '@prisma/client';
import { defaultBlockedCategories, defaultBlockedKeywords } from '../services/discoveryPolicy.js';
import type { OpportunityThresholds } from '../services/opportunityDecider.js';
import { BREAKEVEN_MODE, BREAKEVEN_THRESHOLDS } from '../config/engineMode.js';

const costedDefaultThresholds: OpportunityThresholds = {
  minimumProfitUsd: 10,
  minimumRoiPercent: 25,
  minimumMatchConfidence: 0.75
};

export interface ActiveRuleConfig {
  thresholds: OpportunityThresholds;
  estimatedSalesTaxRate: number;
  returnRiskBuffer: number;
  priceChangeBuffer: number;
  sourceShippingCost: number;
  packagingCost: number;
  shippingLabelCost: number;
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
  amazonPriceCheckIntervalMinutes: number;
  ebayDiscoveryAutoRunEnabled: boolean;
  ebayDiscoveryAutoRunIntervalMinutes: number;
  ebayDiscoveryAutoRunLimit: number;
  ebayDiscoveryAutoCompareEnabled: boolean;
  ebayAmazonCompareAutoRunEnabled: boolean;
  ebayAmazonCompareAutoRunIntervalMinutes: number;
  ebayAmazonCompareAutoRunLimit: number;
  ebayOrderSyncEnabled: boolean;
  ebayOrderSyncIntervalMinutes: number;
  ebayOrderSyncLookbackHours: number;
  maxAutomationAttempts: number;
  verificationTtlMinutes: number;
  repricingEnabled: boolean;
  repriceMaxIncreasePercent: number;
  inventorySyncEnabled: boolean;
  learningAdjustmentEnabled: boolean;
}

export const defaultRuleConfig: ActiveRuleConfig = {
  // Breakeven mode accepts any non-negative spread and a 0.55 match floor; otherwise the costed
  // model's $10 / 25% / 0.75 gates apply. The active mode is the single BREAKEVEN_MODE switch.
  thresholds: BREAKEVEN_MODE
    ? {
      minimumProfitUsd: BREAKEVEN_THRESHOLDS.minimumProfitUsd,
      minimumRoiPercent: BREAKEVEN_THRESHOLDS.minimumRoiPercent,
      minimumMatchConfidence: BREAKEVEN_THRESHOLDS.minimumMatchConfidence
    }
    : costedDefaultThresholds,
  estimatedSalesTaxRate: 0.08,
  returnRiskBuffer: 2,
  priceChangeBuffer: 2,
  sourceShippingCost: 0,
  packagingCost: 0,
  shippingLabelCost: 0,
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
  // At breakeven the profit/ROI score components are ~0, so the composite score is carried by
  // match quality + Amazon demand; 20 still filters no-demand junk. Costed mode keeps 65.
  minimumOpportunityScore: BREAKEVEN_MODE ? BREAKEVEN_THRESHOLDS.minimumOpportunityScore : 65,
  blockedBrands: [],
  blockedCategories: defaultBlockedCategories,
  blockedKeywords: defaultBlockedKeywords,
  amazonPriceCheckIntervalMinutes: 30,
  ebayDiscoveryAutoRunEnabled: false,
  ebayDiscoveryAutoRunIntervalMinutes: 1,
  ebayDiscoveryAutoRunLimit: 5,
  ebayDiscoveryAutoCompareEnabled: false,
  ebayAmazonCompareAutoRunEnabled: false,
  ebayAmazonCompareAutoRunIntervalMinutes: 1,
  ebayAmazonCompareAutoRunLimit: 1,
  ebayOrderSyncEnabled: false,
  ebayOrderSyncIntervalMinutes: 15,
  ebayOrderSyncLookbackHours: 48,
  maxAutomationAttempts: 3,
  verificationTtlMinutes: 0,
  repricingEnabled: false,
  repriceMaxIncreasePercent: 0.15,
  inventorySyncEnabled: false,
  learningAdjustmentEnabled: false
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

// When BREAKEVEN_MODE is on, force the no-cost / breakeven gates regardless of what the saved
// RuleConfig row holds, so production behaves consistently without a manual dashboard/DB edit.
// (The saved $10 / 25% / 0.75 / 65 values would otherwise override the code defaults.)
function withBreakevenOverrides(config: ActiveRuleConfig): ActiveRuleConfig {
  if (!BREAKEVEN_MODE) return config;
  return {
    ...config,
    thresholds: {
      minimumProfitUsd: BREAKEVEN_THRESHOLDS.minimumProfitUsd,
      minimumRoiPercent: BREAKEVEN_THRESHOLDS.minimumRoiPercent,
      minimumMatchConfidence: BREAKEVEN_THRESHOLDS.minimumMatchConfidence
    },
    minimumOpportunityScore: BREAKEVEN_THRESHOLDS.minimumOpportunityScore,
    returnRiskBuffer: 0,
    priceChangeBuffer: 0,
    marketplaceRiskBuffer: 0,
    estimatedSalesTaxRate: 0
  };
}

export async function getActiveRuleConfig(db: PrismaClient): Promise<ActiveRuleConfig> {
  const config = await db.ruleConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } });
  if (!config) return withBreakevenOverrides(defaultRuleConfig);

  return withBreakevenOverrides({
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
    shippingLabelCost: numberValue(config.shippingLabelCost, defaultRuleConfig.shippingLabelCost),
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
    amazonPriceCheckIntervalMinutes: numberValue(config.amazonPriceCheckIntervalMinutes, defaultRuleConfig.amazonPriceCheckIntervalMinutes),
    ebayDiscoveryAutoRunEnabled: typeof config.ebayDiscoveryAutoRunEnabled === 'boolean' ? config.ebayDiscoveryAutoRunEnabled : defaultRuleConfig.ebayDiscoveryAutoRunEnabled,
    ebayDiscoveryAutoRunIntervalMinutes: numberValue(config.ebayDiscoveryAutoRunIntervalMinutes, defaultRuleConfig.ebayDiscoveryAutoRunIntervalMinutes),
    ebayDiscoveryAutoRunLimit: numberValue(config.ebayDiscoveryAutoRunLimit, defaultRuleConfig.ebayDiscoveryAutoRunLimit),
    ebayDiscoveryAutoCompareEnabled: typeof config.ebayDiscoveryAutoCompareEnabled === 'boolean' ? config.ebayDiscoveryAutoCompareEnabled : defaultRuleConfig.ebayDiscoveryAutoCompareEnabled,
    ebayAmazonCompareAutoRunEnabled: typeof config.ebayAmazonCompareAutoRunEnabled === 'boolean' ? config.ebayAmazonCompareAutoRunEnabled : defaultRuleConfig.ebayAmazonCompareAutoRunEnabled,
    ebayAmazonCompareAutoRunIntervalMinutes: numberValue(config.ebayAmazonCompareAutoRunIntervalMinutes, defaultRuleConfig.ebayAmazonCompareAutoRunIntervalMinutes),
    ebayAmazonCompareAutoRunLimit: numberValue(config.ebayAmazonCompareAutoRunLimit, defaultRuleConfig.ebayAmazonCompareAutoRunLimit),
    ebayOrderSyncEnabled: typeof config.ebayOrderSyncEnabled === 'boolean' ? config.ebayOrderSyncEnabled : defaultRuleConfig.ebayOrderSyncEnabled,
    ebayOrderSyncIntervalMinutes: numberValue(config.ebayOrderSyncIntervalMinutes, defaultRuleConfig.ebayOrderSyncIntervalMinutes),
    ebayOrderSyncLookbackHours: numberValue(config.ebayOrderSyncLookbackHours, defaultRuleConfig.ebayOrderSyncLookbackHours),
    maxAutomationAttempts: numberValue(config.maxAutomationAttempts, defaultRuleConfig.maxAutomationAttempts),
    verificationTtlMinutes: numberValue(config.verificationTtlMinutes, defaultRuleConfig.verificationTtlMinutes),
    repricingEnabled: typeof config.repricingEnabled === 'boolean' ? config.repricingEnabled : defaultRuleConfig.repricingEnabled,
    repriceMaxIncreasePercent: numberValue(config.repriceMaxIncreasePercent, defaultRuleConfig.repriceMaxIncreasePercent),
    inventorySyncEnabled: typeof config.inventorySyncEnabled === 'boolean' ? config.inventorySyncEnabled : defaultRuleConfig.inventorySyncEnabled,
    learningAdjustmentEnabled: typeof config.learningAdjustmentEnabled === 'boolean' ? config.learningAdjustmentEnabled : defaultRuleConfig.learningAdjustmentEnabled
  });
}
