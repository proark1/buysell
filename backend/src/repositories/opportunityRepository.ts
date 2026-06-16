import type { PrismaClient } from '@prisma/client';
import type { ProductOpportunity } from '../domain/products.js';
import { createActionForDecision } from './actionRepository.js';

export interface PersistedOpportunityIds {
  productCandidateId: string;
  amazonMatchId: string;
  profitSnapshotId: string;
  aiDecisionId: string;
}

const money = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(2);
const decimal = (value: number): string => value.toFixed(3);

export async function persistOpportunity(
  db: PrismaClient,
  opportunity: ProductOpportunity
): Promise<PersistedOpportunityIds> {
  const productCandidate = await db.productCandidate.create({
    data: {
      source: 'serpapi',
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
      availabilityStatus: opportunity.amazon.availabilityStatus,
      salesRank: opportunity.amazon.salesRank,
      rating: opportunity.amazon.rating === undefined ? undefined : decimal(opportunity.amazon.rating),
      reviewCount: opportunity.amazon.reviewCount,
      rawKeepaJson: opportunity.amazon.raw,
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

export async function persistOpportunities(
  db: PrismaClient,
  opportunities: ProductOpportunity[]
): Promise<PersistedOpportunityIds[]> {
  const persisted: PersistedOpportunityIds[] = [];

  for (const opportunity of opportunities) {
    persisted.push(await persistOpportunity(db, opportunity));
  }

  return persisted;
}
