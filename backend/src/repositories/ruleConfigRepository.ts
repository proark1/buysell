import type { PrismaClient } from '@prisma/client';
import type { OpportunityThresholds } from '../services/opportunityDecider.js';

export interface ActiveRuleConfig {
  thresholds: OpportunityThresholds;
  estimatedSalesTaxRate: number;
  returnRiskBuffer: number;
  priceChangeBuffer: number;
  maxDailyListings: number;
  maxDailyPurchaseAmountUsd: number;
  blockedBrands: string[];
  blockedCategories: string[];
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
  maxDailyListings: 10,
  maxDailyPurchaseAmountUsd: 250,
  blockedBrands: [],
  blockedCategories: []
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
    maxDailyListings: numberValue(config.maxDailyListings, defaultRuleConfig.maxDailyListings),
    maxDailyPurchaseAmountUsd: numberValue(config.maxDailyPurchaseAmountUsd, defaultRuleConfig.maxDailyPurchaseAmountUsd),
    blockedBrands: stringArray(config.blockedBrands),
    blockedCategories: stringArray(config.blockedCategories)
  };
}
