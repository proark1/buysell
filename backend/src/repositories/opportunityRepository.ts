import type { PrismaClient } from '@prisma/client';
import type { ProductOpportunity } from '../domain/products.js';
import { createActionForDecision } from './actionRepository.js';
import { postgresInt } from '../utils/postgres.js';

export interface PersistedOpportunityIds {
  productCandidateId: string;
  amazonMatchId: string;
  profitSnapshotId: string;
  aiDecisionId: string;
}

export interface PersistOpportunityContext {
  discoveryRunId?: string;
  discoveryProfile?: string;
  amazonCandidateId?: string;
  ebayCandidateId?: string;
  source?: string;
}

const money = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(2);
const decimal = (value: number): string => value.toFixed(3);
const jsonReady = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(jsonReady);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, jsonReady(item)])
  );
};

async function existingPersistedOpportunity(
  db: PrismaClient,
  context: PersistOpportunityContext
): Promise<PersistedOpportunityIds | undefined> {
  const where = context.amazonCandidateId
    ? { amazonCandidateId: context.amazonCandidateId }
    : context.ebayCandidateId
      ? { ebayCandidateId: context.ebayCandidateId }
      : undefined;
  if (!where) return undefined;

  const existing = await db.productCandidate.findFirst({
    where,
    include: {
      amazonMatches: { orderBy: { createdAt: 'desc' }, take: 1 },
      profitSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
      aiDecisions: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  });
  const amazonMatch = existing?.amazonMatches[0];
  const profitSnapshot = existing?.profitSnapshots[0];
  const aiDecision = existing?.aiDecisions[0];
  if (!existing || !amazonMatch || !profitSnapshot || !aiDecision) return undefined;

  return {
    productCandidateId: existing.id,
    amazonMatchId: amazonMatch.id,
    profitSnapshotId: profitSnapshot.id,
    aiDecisionId: aiDecision.id
  };
}

async function persistOpportunityRows(
  db: PrismaClient,
  opportunity: ProductOpportunity,
  context: PersistOpportunityContext
): Promise<PersistedOpportunityIds> {
  const existing = await existingPersistedOpportunity(db, context);
  if (existing) return existing;

  const productCandidate = await db.productCandidate.create({
    data: {
      discoveryRunId: context.discoveryRunId,
      amazonCandidateId: context.amazonCandidateId,
      ebayCandidateId: context.ebayCandidateId,
      discoveryProfile: context.discoveryProfile ?? opportunity.discoveryProfile,
      opportunityScore: opportunity.score?.total,
      safetyStatus: opportunity.safety?.status,
      riskFlags: opportunity.safety?.riskFlags ?? opportunity.decision.riskFlags,
      scoreBreakdown: opportunity.identityMatch
        ? {
          ...(opportunity.score ?? {}),
          identityMatch: opportunity.identityMatch
        }
        : opportunity.score,
      evidenceJson: opportunity.evidence ? jsonReady(opportunity.evidence) : undefined,
      marketMetricsJson: opportunity.marketMetrics ? jsonReady(opportunity.marketMetrics) : undefined,
      source: context.source ?? 'serpapi',
      ebayTitle: opportunity.ebay.title,
      ebayUrl: opportunity.ebay.url,
      ebaySoldPrice: money(opportunity.ebay.soldPrice),
      ebayShippingPrice: money(opportunity.ebay.shippingPrice),
      ebayCondition: opportunity.ebay.condition,
      ebayCategory: opportunity.ebay.category,
      rawSerpapiJson: opportunity.ebay.raw
    }
  });

  const amazonMatch = await db.amazonMatch.create({
    data: {
      productCandidateId: productCandidate.id,
      asin: opportunity.amazon.asin,
      amazonTitle: opportunity.amazon.title,
      amazonUrl: opportunity.amazon.url,
      brand: opportunity.amazon.brand,
      model: opportunity.amazon.model,
      upc: opportunity.amazon.upc,
      currentPrice: money(opportunity.amazon.currentPrice),
      buyBoxPrice: money(opportunity.amazon.buyBoxPrice),
      avg90Price: money(opportunity.amazon.avg90Price),
      priceDropPercent: opportunity.amazon.priceDropPercent === undefined ? undefined : decimal(opportunity.amazon.priceDropPercent),
      availabilityStatus: opportunity.amazon.availabilityStatus,
      salesRank: postgresInt(opportunity.amazon.salesRank),
      rating: opportunity.amazon.rating === undefined ? undefined : decimal(opportunity.amazon.rating),
      reviewCount: postgresInt(opportunity.amazon.reviewCount),
      rawKeepaJson: opportunity.amazon.raw,
      evidenceJson: opportunity.evidence ? jsonReady({ productIdentity: opportunity.evidence.productIdentity }) : undefined,
      matchConfidence: decimal(opportunity.amazon.matchConfidence)
    }
  });

  const estimatedEbaySalePrice = opportunity.ebay.soldPrice ?? opportunity.decision.recommendedPrice ?? 0;
  const amazonCost = opportunity.amazon.buyBoxPrice ?? opportunity.amazon.currentPrice ?? 0;

  const profitSnapshot = await db.profitSnapshot.create({
    data: {
      productCandidateId: productCandidate.id,
      amazonMatchId: amazonMatch.id,
      estimatedEbaySalePrice: money(estimatedEbaySalePrice) ?? '0.00',
      amazonCost: money(amazonCost) ?? '0.00',
      estimatedFees: money(opportunity.profit.estimatedFees) ?? '0.00',
      estimatedTax: money(opportunity.profit.estimatedTax) ?? '0.00',
      bufferAmount: money(opportunity.profit.bufferAmount) ?? '0.00',
      sourceShippingCost: money(opportunity.profit.sourceShippingCost) ?? '0.00',
      packagingCost: money(opportunity.profit.packagingCost) ?? '0.00',
      paymentFixedFee: money(opportunity.profit.paymentFixedFee) ?? '0.00',
      returnReserve: money(opportunity.profit.returnReserve) ?? '0.00',
      cancellationReserve: money(opportunity.profit.cancellationReserve) ?? '0.00',
      marketplaceRiskBuffer: money(opportunity.profit.marketplaceRiskBuffer) ?? '0.00',
      totalLandedCost: money(opportunity.profit.totalLandedCost) ?? '0.00',
      expectedProfit: money(opportunity.profit.expectedProfit) ?? '0.00',
      roiPercent: decimal(opportunity.profit.roiPercent),
      marginPercent: decimal(opportunity.profit.marginPercent)
    }
  });

  const aiDecision = await db.aiDecision.create({
    data: {
      productCandidateId: productCandidate.id,
      amazonMatchId: amazonMatch.id,
      decision: opportunity.decision.decision,
      confidence: decimal(opportunity.decision.confidence),
      reasoningSummary: opportunity.decision.reasoningSummary,
      riskFlags: opportunity.decision.riskFlags,
      recommendedEbayTitle: opportunity.decision.recommendedTitle,
      recommendedEbayDescription: opportunity.decision.recommendedDescription,
      recommendedPrice: money(opportunity.decision.recommendedPrice)
    }
  });

  const actionItemId = await createActionForDecision(db, {
    productCandidateId: productCandidate.id,
    amazonMatchId: amazonMatch.id,
    decision: opportunity.decision
  });

  await db.auditLog.create({
    data: {
      entityType: 'ProductOpportunity',
      entityId: productCandidate.id,
      action: 'OPPORTUNITY_PERSISTED',
      actor: 'system',
      afterJson: {
        productCandidateId: productCandidate.id,
        amazonMatchId: amazonMatch.id,
        profitSnapshotId: profitSnapshot.id,
        aiDecisionId: aiDecision.id,
        actionItemId,
        decision: opportunity.decision.decision
      }
    }
  });

  return {
    productCandidateId: productCandidate.id,
    amazonMatchId: amazonMatch.id,
    profitSnapshotId: profitSnapshot.id,
    aiDecisionId: aiDecision.id
  };
}

export async function persistOpportunity(
  db: PrismaClient,
  opportunity: ProductOpportunity,
  context: PersistOpportunityContext = {}
): Promise<PersistedOpportunityIds> {
  const transactionalDb = db as unknown as { $transaction?: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> };
  if (typeof transactionalDb.$transaction !== 'function') {
    return persistOpportunityRows(db, opportunity, context);
  }
  return transactionalDb.$transaction((tx) => persistOpportunityRows(tx, opportunity, context));
}

export async function persistOpportunities(
  db: PrismaClient,
  opportunities: ProductOpportunity[],
  context: PersistOpportunityContext = {}
): Promise<PersistedOpportunityIds[]> {
  const persisted: PersistedOpportunityIds[] = [];

  for (const opportunity of opportunities) {
    persisted.push(await persistOpportunity(db, opportunity, context));
  }

  return persisted;
}
