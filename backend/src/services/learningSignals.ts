import type { PrismaClient } from '@prisma/client';
import type { EbayCandidateInput } from '../domain/products.js';
import { productFamilyKeyForEbayCandidate } from './productFamily.js';

export interface FamilyLearningInput {
  rejectedCount: number;
  manualReviewCount: number;
  opportunityCount: number;
  listedCount: number;
  realizedProfit: number;
}

const numberValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    const n = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Turn a product family's accumulated decision history into a score multiplier in
 * [0.8, 1.2]. Families we've repeatedly rejected are damped; families that have been
 * listed and realized positive profit are boosted. Returns 1.0 when there isn't enough
 * history to have an opinion.
 */
export function computeFamilyAdjustment(family: FamilyLearningInput): { factor: number; reasons: string[] } {
  const total = family.rejectedCount + family.manualReviewCount + family.opportunityCount + family.listedCount;
  const reasons: string[] = [];
  if (total < 3) return { factor: 1, reasons: [] };

  let factor = 1;
  const rejectRatio = family.rejectedCount / (total + 1);
  if (rejectRatio >= 0.6) {
    factor -= 0.15;
    reasons.push(`Family rejected ${(rejectRatio * 100).toFixed(0)}% of the time historically.`);
  } else if (rejectRatio <= 0.2 && family.opportunityCount + family.listedCount >= 2) {
    factor += 0.08;
    reasons.push('Family has a strong historical accept rate.');
  }

  if (family.listedCount > 0 && family.realizedProfit > 0) {
    factor += 0.1;
    reasons.push(`Family has realized $${family.realizedProfit.toFixed(2)} profit across ${family.listedCount} listings.`);
  } else if (family.listedCount > 0 && family.realizedProfit < 0) {
    factor -= 0.12;
    reasons.push('Family has realized a net loss on prior listings.');
  }

  return { factor: Math.min(1.2, Math.max(0.8, factor)), reasons };
}

/**
 * Resolve the learning multiplier for an eBay candidate from its product family's history.
 * Returns 1.0 (no effect) when learning is disabled or the family has no record yet.
 */
export async function resolveLearningFactor(db: PrismaClient, ebay: EbayCandidateInput, enabled: boolean): Promise<number> {
  if (!enabled) return 1;
  try {
    const familyKey = productFamilyKeyForEbayCandidate(ebay);
    if (!familyKey) return 1;
    const family = await db.productFamily.findUnique({ where: { familyKey } });
    if (!family) return 1;
    return computeFamilyAdjustment({
      rejectedCount: family.rejectedCount,
      manualReviewCount: family.manualReviewCount,
      opportunityCount: family.opportunityCount,
      listedCount: family.listedCount,
      realizedProfit: numberValue(family.realizedProfit)
    }).factor;
  } catch {
    return 1;
  }
}
