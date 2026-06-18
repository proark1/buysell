import type { PrismaClient } from '@prisma/client';
import type { ProductOpportunity } from '../domain/products.js';
import type { PersistedOpportunityIds, PersistOpportunityContext } from './opportunityRepository.js';
import { productFamilyKeyForEbayCandidate } from '../services/productFamily.js';
import { rejectionStageForFlag } from '../services/discoveryPolicy.js';

const money = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(2);

const jsonReady = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(jsonReady);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, jsonReady(item)])
  );
};

function createDecisionCounters(decision: ProductOpportunity['decision']['decision']): {
  opportunityCount: number;
  manualReviewCount: number;
  rejectedCount: number;
  listedCount: number;
} {
  return {
    opportunityCount: 1,
    manualReviewCount: decision === 'MANUAL_REVIEW' ? 1 : 0,
    rejectedCount: decision === 'REJECT' ? 1 : 0,
    listedCount: decision === 'LIST' ? 1 : 0
  };
}

function updateDecisionCounters(decision: ProductOpportunity['decision']['decision']): {
  opportunityCount: { increment: number };
  manualReviewCount: { increment: number };
  rejectedCount: { increment: number };
  listedCount: { increment: number };
} {
  return {
    opportunityCount: { increment: 1 },
    manualReviewCount: { increment: decision === 'MANUAL_REVIEW' ? 1 : 0 },
    rejectedCount: { increment: decision === 'REJECT' ? 1 : 0 },
    listedCount: { increment: decision === 'LIST' ? 1 : 0 }
  };
}

function identityMetadata(opportunity: ProductOpportunity): {
  brand?: string;
  modelTokens?: string[];
  identifiers?: string[];
} {
  const normalized = opportunity.identityMatch?.normalized;
  return {
    brand: normalized?.ebayBrand ?? normalized?.amazonBrand ?? opportunity.amazon.brand,
    modelTokens: [...new Set([...(normalized?.ebayModelTokens ?? []), ...(normalized?.amazonModelTokens ?? [])])],
    identifiers: [...new Set([...(normalized?.ebayIdentifiers ?? []), ...(normalized?.amazonIdentifiers ?? []), opportunity.amazon.upc].filter((item): item is string => Boolean(item)))]
  };
}

export interface DiscoveryCandidateLearningInput {
  marketplace: 'AMAZON' | 'EBAY';
  title: string;
  familyKey?: string;
  ebayCandidateId?: string;
  amazonCandidateId?: string;
  source: string;
  accepted: boolean;
  score?: number;
  riskFlags: string[];
  rejectionReasons: string[];
  metadata?: Record<string, unknown>;
}

export async function recordDiscoveryCandidateLearning(
  db: PrismaClient,
  input: DiscoveryCandidateLearningInput
): Promise<void> {
  const stages = [...new Set(input.riskFlags.map(rejectionStageForFlag))];
  const primaryStage = stages[0] ?? 'SCORING';
  const reasonCode = input.riskFlags[0] ?? (input.accepted ? 'DISCOVERY_ACCEPTED' : 'LOW_DISCOVERY_SCORE');
  const feedbackType = input.accepted
    ? 'DISCOVERY_ACCEPTED'
    : primaryStage === 'SOURCE_DATA' || primaryStage === 'SOURCE_FORMAT'
      ? 'SOURCE_REJECT'
      : primaryStage === 'MATCHING'
        ? 'MATCH_REJECT'
        : primaryStage === 'ECONOMICS'
          ? 'ECONOMICS_REJECT'
          : 'DISCOVERY_REJECT';

  if (input.familyKey) {
    await db.productFamily.upsert({
      where: { familyKey: input.familyKey },
      create: {
        familyKey: input.familyKey,
        canonicalTitle: input.title.slice(0, 240),
        rejectedCount: input.accepted ? 0 : 1,
        lastDecision: feedbackType,
        lastRiskFlags: input.riskFlags,
        lastSeenAt: new Date()
      },
      update: {
        canonicalTitle: input.title.slice(0, 240),
        rejectedCount: { increment: input.accepted ? 0 : 1 },
        lastDecision: feedbackType,
        lastRiskFlags: input.riskFlags,
        lastSeenAt: new Date()
      }
    });
  }

  await db.opportunityFeedback.create({
    data: {
      ebayCandidateId: input.ebayCandidateId,
      feedbackType,
      reasonCode,
      reasonText: input.rejectionReasons[0] ?? reasonCode,
      source: input.source,
      weight: input.accepted ? 1 : -1,
      metadataJson: jsonReady({
        marketplace: input.marketplace,
        amazonCandidateId: input.amazonCandidateId,
        title: input.title,
        score: input.score,
        riskFlags: input.riskFlags,
        rejectionReasons: input.rejectionReasons,
        stages,
        ...input.metadata
      })
    }
  });
}

function priceObservations(opportunity: ProductOpportunity, ids: PersistedOpportunityIds, context: PersistOpportunityContext): Array<Record<string, unknown>> {
  const observed: Array<Record<string, unknown>> = [];
  const ebayPrice = opportunity.ebay.soldPrice ?? opportunity.decision.recommendedPrice;
  const amazonPrice = opportunity.amazon.buyBoxPrice ?? opportunity.amazon.currentPrice;

  if (ebayPrice !== undefined) {
    observed.push({
      productCandidateId: ids.productCandidateId,
      ebayCandidateId: context.ebayCandidateId,
      marketplace: 'EBAY',
      source: context.source ?? 'opportunity',
      observedPrice: money(ebayPrice),
      shippingPrice: money(opportunity.ebay.shippingPrice),
      rawJson: jsonReady({
        title: opportunity.ebay.title,
        url: opportunity.ebay.url,
        condition: opportunity.ebay.condition
      })
    });
  }

  if (amazonPrice !== undefined) {
    observed.push({
      productCandidateId: ids.productCandidateId,
      amazonMatchId: ids.amazonMatchId,
      marketplace: 'AMAZON',
      source: context.source ?? 'opportunity',
      observedPrice: money(amazonPrice),
      availabilityStatus: opportunity.amazon.availabilityStatus,
      rawJson: jsonReady({
        asin: opportunity.amazon.asin,
        title: opportunity.amazon.title,
        url: opportunity.amazon.url,
        buyBoxPrice: opportunity.amazon.buyBoxPrice,
        currentPrice: opportunity.amazon.currentPrice
      })
    });
  }

  return observed;
}

export async function recordOpportunityLearning(
  db: PrismaClient,
  opportunity: ProductOpportunity,
  ids: PersistedOpportunityIds,
  context: PersistOpportunityContext
): Promise<void> {
  const familyKey = productFamilyKeyForEbayCandidate(opportunity.ebay);
  const identity = identityMetadata(opportunity);
  const decision = opportunity.decision.decision;
  const family = await db.productFamily.upsert({
    where: { familyKey },
    create: {
      familyKey,
      canonicalTitle: opportunity.ebay.title.slice(0, 240),
      brand: identity.brand,
      modelTokens: identity.modelTokens,
      identifiers: identity.identifiers,
      ...createDecisionCounters(decision),
      lastDecision: decision,
      lastRiskFlags: opportunity.decision.riskFlags,
      lastSeenAt: new Date()
    },
    update: {
      canonicalTitle: opportunity.ebay.title.slice(0, 240),
      brand: identity.brand,
      modelTokens: identity.modelTokens,
      identifiers: identity.identifiers,
      ...updateDecisionCounters(decision),
      lastDecision: decision,
      lastRiskFlags: opportunity.decision.riskFlags,
      lastSeenAt: new Date()
    },
    select: { id: true }
  });

  await db.productCandidate.update({
    where: { id: ids.productCandidateId },
    data: { productFamilyId: family.id }
  });

  await db.opportunityFeedback.create({
    data: {
      productCandidateId: ids.productCandidateId,
      amazonMatchId: ids.amazonMatchId,
      ebayCandidateId: context.ebayCandidateId,
      feedbackType: decision,
      reasonCode: opportunity.decision.riskFlags[0] ?? 'PASSED_GATES',
      reasonText: opportunity.decision.reasoningSummary,
      source: context.source ?? 'system',
      weight: decision === 'LIST' ? 2 : decision === 'REJECT' ? -2 : 1,
      metadataJson: jsonReady({
        score: opportunity.score,
        profit: opportunity.profit,
        identityMatch: opportunity.identityMatch,
        marketMetrics: opportunity.marketMetrics
      })
    }
  });

  const observations = priceObservations(opportunity, ids, context);
  if (observations.length) await db.priceObservation.createMany({ data: observations });

  await db.sourceInventoryRecord.create({
    data: {
      productCandidateId: ids.productCandidateId,
      amazonMatchId: ids.amazonMatchId,
      supplierName: 'Amazon',
      asin: opportunity.amazon.asin,
      sourceUrl: opportunity.amazon.url,
      unitCost: money(opportunity.amazon.buyBoxPrice ?? opportunity.amazon.currentPrice),
      quantityOnHand: 0,
      status: 'WATCHING',
      lastCheckedAt: new Date(),
      metadataJson: jsonReady({
        availabilityStatus: opportunity.amazon.availabilityStatus,
        salesRank: opportunity.amazon.salesRank,
        rating: opportunity.amazon.rating,
        reviewCount: opportunity.amazon.reviewCount
      })
    }
  });

  await db.listingLifecycleEvent.create({
    data: {
      productCandidateId: ids.productCandidateId,
      eventType: 'OPPORTUNITY_CREATED',
      status: decision,
      dataJson: jsonReady({
        source: context.source,
        discoveryProfile: context.discoveryProfile,
        expectedProfit: opportunity.profit.expectedProfit,
        roiPercent: opportunity.profit.roiPercent,
        score: opportunity.score?.total
      })
    }
  });
}
