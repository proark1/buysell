import type { PrismaClient } from '@prisma/client';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { calculateProfit } from './profitCalculator.js';
import { conflict, notFound } from '../security/httpErrors.js';
import { profitInputsFromRuleConfig } from './profitInputs.js';

export interface VerificationObservation {
  observedPrice?: number;
  brand?: string;
  title?: string;
  condition?: string;
  buyingFormat?: string;
  url?: string;
  screenshotPath?: string;
  notes?: string;
}

export interface PriceVerificationResultInput {
  status?: 'PASSED' | 'FAILED' | 'MANUAL_REVIEW';
  amazon?: VerificationObservation;
  ebay?: VerificationObservation;
  evidence?: Record<string, unknown>;
  failureReasons?: string[];
  checkedBy?: string;
}

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const money = (value: unknown): string | undefined => {
  const parsed = numberValue(value);
  return parsed === undefined ? undefined : parsed.toFixed(2);
};

const normalized = (value: string | undefined): string => value?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() ?? '';

const hasAny = (value: string, terms: string[]): boolean => terms.some((term) => value.includes(term));

const isNewCondition = (value: string | undefined): boolean => {
  const text = normalized(value);
  if (!text) return false;
  const notNewTerms = [
    'used',
    'pre owned',
    'preowned',
    'open box',
    'new other',
    'like new',
    'refurbished',
    'renewed',
    'for parts',
    'not working',
    'gebraucht',
    'neuwertig',
    'generaluberholt',
    'generalüberholt',
    'general berholt',
    'defekt',
    'ersatzteile'
  ];
  if (hasAny(text, notNewTerms)) return false;
  return hasAny(text, ['new', 'brand new', 'sealed', 'unused', 'neu', 'neuf', 'nuevo', 'nuovo']);
};

const isFixedPriceFormat = (value: string | undefined): boolean => {
  const text = normalized(value);
  if (!text) return false;
  if (hasAny(text, ['auction', 'bid', 'bids', 'auktion', 'gebot', 'gebote'])) return false;
  return hasAny(text, ['bin', 'buy it now', 'fixed', 'fixed price', 'sofort kaufen', 'festpreis']);
};

const brandMatches = (expected: string | undefined, observed: string | undefined): boolean => {
  const expectedBrand = normalized(expected);
  const observedBrand = normalized(observed);
  if (!expectedBrand) return true;
  if (!observedBrand) return false;
  return observedBrand === expectedBrand || observedBrand.includes(expectedBrand) || expectedBrand.includes(observedBrand);
};

const priceTolerance = (expected: number): number => Math.max(1, expected * 0.03);

const verificationEvidence = (input: PriceVerificationResultInput): Record<string, unknown> => ({
  amazon: input.amazon,
  ebay: input.ebay,
  evidence: input.evidence
});

const activeAutomationStatuses = ['RUNNING', 'NEEDS_HUMAN_CONFIRMATION'];

async function closeActiveVerificationAutomationRuns(
  db: PrismaClient,
  actionId: string,
  status: 'COMPLETED' | 'FAILED' | 'REVIEW_REQUIRED',
  result: Record<string, unknown>
): Promise<void> {
  await db.automationRun.updateMany({
    where: {
      actionItemId: actionId,
      status: { in: activeAutomationStatuses }
    },
    data: {
      status,
      phase: status,
      resultJson: result,
      completedAt: new Date()
    }
  });
}

export async function submitPriceVerificationResult(
  db: PrismaClient,
  actionId: string,
  input: PriceVerificationResultInput
): Promise<Record<string, unknown>> {
  const action = await db.actionItem.findUnique({
    where: { id: actionId },
    include: {
      productCandidate: true,
      amazonMatch: true,
      priceVerification: true
    }
  });

  if (!action) throw notFound('Verification action not found', 'VERIFICATION_ACTION_NOT_FOUND');
  if (action.type !== 'VERIFY') throw conflict('Action is not a live verification action', 'ACTION_NOT_VERIFICATION');

  const verification = action.priceVerification;
  if (!verification) throw notFound('Verification record not found for action', 'PRICE_VERIFICATION_NOT_FOUND');

  const expectedAmazonPrice = numberValue(verification.expectedAmazonPrice ?? action.amazonMatch?.buyBoxPrice ?? action.amazonMatch?.currentPrice);
  const expectedEbayPrice = numberValue(verification.expectedEbayPrice ?? action.productCandidate?.ebaySoldPrice);
  const observedAmazonPrice = input.amazon?.observedPrice;
  const observedEbayPrice = input.ebay?.observedPrice;
  const expectedBrand = verification.expectedBrand ?? action.amazonMatch?.brand ?? undefined;
  const failureReasons = [...(input.failureReasons ?? [])];

  if (input.status === 'FAILED') failureReasons.push('Computer-use verification reported failure.');
  if (input.status === 'MANUAL_REVIEW') failureReasons.push('Computer-use verification requested manual review.');

  if (!observedAmazonPrice || observedAmazonPrice <= 0) failureReasons.push('Amazon browser price was not captured.');
  if (!observedEbayPrice || observedEbayPrice <= 0) failureReasons.push('eBay browser sold price was not captured.');

  if (expectedAmazonPrice !== undefined && observedAmazonPrice !== undefined && observedAmazonPrice > expectedAmazonPrice + priceTolerance(expectedAmazonPrice)) {
    failureReasons.push(`Amazon browser price ${observedAmazonPrice.toFixed(2)} is materially above expected ${expectedAmazonPrice.toFixed(2)}.`);
  }

  if (expectedEbayPrice !== undefined && observedEbayPrice !== undefined && Math.abs(observedEbayPrice - expectedEbayPrice) > priceTolerance(expectedEbayPrice)) {
    failureReasons.push(`eBay browser sold price ${observedEbayPrice.toFixed(2)} does not match expected ${expectedEbayPrice.toFixed(2)}.`);
  }

  if (!isNewCondition(input.amazon?.condition)) failureReasons.push('Amazon browser condition is not confirmed as new.');
  if (!isNewCondition(input.ebay?.condition)) failureReasons.push('eBay browser condition is not confirmed as new.');
  if (!isFixedPriceFormat(input.ebay?.buyingFormat)) failureReasons.push('eBay browser buying format is not confirmed as fixed-price Buy It Now.');

  if (expectedBrand && !brandMatches(expectedBrand, input.amazon?.brand)) {
    failureReasons.push(`Amazon browser brand does not match expected brand ${expectedBrand}.`);
  }
  if (expectedBrand && input.ebay?.brand && !brandMatches(expectedBrand, input.ebay.brand)) {
    failureReasons.push(`eBay browser brand does not match expected brand ${expectedBrand}.`);
  }

  let observedProfit: ReturnType<typeof calculateProfit> | undefined;
  if (observedAmazonPrice !== undefined && observedEbayPrice !== undefined && observedAmazonPrice > 0 && observedEbayPrice > 0) {
    const ruleConfig = await getActiveRuleConfig(db);
    observedProfit = calculateProfit({
      ebaySalePrice: observedEbayPrice,
      amazonItemCost: observedAmazonPrice,
      ...profitInputsFromRuleConfig(ruleConfig)
    });
    if (observedProfit.expectedProfit < ruleConfig.thresholds.minimumProfitUsd) {
      failureReasons.push(`Browser-verified profit ${observedProfit.expectedProfit.toFixed(2)} is below minimum ${ruleConfig.thresholds.minimumProfitUsd.toFixed(2)}.`);
    }
    if (observedProfit.roiPercent < ruleConfig.thresholds.minimumRoiPercent) {
      failureReasons.push(`Browser-verified ROI ${observedProfit.roiPercent.toFixed(3)}% is below minimum ${ruleConfig.thresholds.minimumRoiPercent.toFixed(3)}%.`);
    }
  }

  const existingPayload = action.payloadJson && typeof action.payloadJson === 'object' && !Array.isArray(action.payloadJson)
    ? action.payloadJson as Record<string, unknown>
    : {};
  const actor = input.checkedBy ?? 'computer-use-verifier';
  const evidenceJson = verificationEvidence(input);
  const terminalStatus = input.status === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : failureReasons.length > 0 ? 'FAILED' : 'PASSED';

  if (terminalStatus === 'PASSED') {
    if (verification.listingActionItemId) {
      const result = { status: 'PASSED', listingActionItemId: verification.listingActionItemId, failureReasons: [] };
      await closeActiveVerificationAutomationRuns(db, action.id, 'COMPLETED', result);
      return result;
    }

    const transactionalDb = db as unknown as {
      $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
    };

    return transactionalDb.$transaction(async (tx) => {
      const listAction = await tx.actionItem.create({
        data: {
          productCandidateId: action.productCandidateId,
          amazonMatchId: action.amazonMatchId,
          type: 'LIST',
          status: 'PENDING',
          priority: 20,
          reason: `Live browser verification passed. ${action.reason}`,
          payloadJson: {
            ...existingPayload,
            liveVerificationId: verification.id,
            sourceVerifyActionId: action.id,
            observedAmazonPrice,
            observedEbayPrice,
            observedAmazonBrand: input.amazon?.brand,
            observedEbayBrand: input.ebay?.brand,
            observedAmazonCondition: input.amazon?.condition,
            observedEbayCondition: input.ebay?.condition,
            observedBuyingFormat: input.ebay?.buyingFormat,
            observedProfit
          }
        }
      });

      await tx.priceVerification.update({
        where: { id: verification.id },
        data: {
          status: 'PASSED',
          listingActionItemId: listAction.id,
          observedAmazonPrice: money(observedAmazonPrice),
          observedEbayPrice: money(observedEbayPrice),
          observedAmazonBrand: input.amazon?.brand,
          observedEbayBrand: input.ebay?.brand,
          observedAmazonCondition: input.amazon?.condition,
          observedEbayCondition: input.ebay?.condition,
          observedBuyingFormat: input.ebay?.buyingFormat,
          evidenceJson,
          failureReasons: [],
          checkedAt: new Date()
        }
      });

      await tx.actionItem.update({
        where: { id: action.id },
        data: { status: 'COMPLETED', reviewedBy: actor, reviewedAt: new Date() }
      });

      const result = { status: 'PASSED', listingActionItemId: listAction.id, failureReasons: [], observedProfit };

      await tx.automationRun.updateMany({
        where: {
          actionItemId: action.id,
          status: { in: activeAutomationStatuses }
        },
        data: {
          status: 'COMPLETED',
          phase: 'COMPLETED',
          resultJson: result,
          completedAt: new Date()
        }
      });

      await tx.auditLog.create({
        data: {
          entityType: 'PriceVerification',
          entityId: verification.id,
          action: 'LIVE_VERIFICATION_PASSED',
          actor,
          afterJson: { listingActionItemId: listAction.id, observedAmazonPrice, observedEbayPrice, observedProfit }
        }
      });

      return result;
    });
  }

  if (terminalStatus === 'MANUAL_REVIEW') {
    const reviewAction = await db.actionItem.create({
      data: {
        productCandidateId: action.productCandidateId,
        amazonMatchId: action.amazonMatchId,
        type: 'REVIEW',
        status: 'PENDING',
        priority: 25,
        reason: `Live browser verification needs manual review: ${failureReasons.join(' ')}`,
        payloadJson: {
          ...existingPayload,
          liveVerificationId: verification.id,
          sourceVerifyActionId: action.id,
          failureReasons,
          observedAmazonPrice,
          observedEbayPrice
        }
      }
    });

    await db.priceVerification.update({
      where: { id: verification.id },
      data: {
        status: 'MANUAL_REVIEW',
        observedAmazonPrice: money(observedAmazonPrice),
        observedEbayPrice: money(observedEbayPrice),
        observedAmazonBrand: input.amazon?.brand,
        observedEbayBrand: input.ebay?.brand,
        observedAmazonCondition: input.amazon?.condition,
        observedEbayCondition: input.ebay?.condition,
        observedBuyingFormat: input.ebay?.buyingFormat,
        evidenceJson,
        failureReasons,
        checkedAt: new Date()
      }
    });
    await db.actionItem.update({ where: { id: action.id }, data: { status: 'COMPLETED', reviewedBy: actor, reviewedAt: new Date() } });
    const result = { status: 'MANUAL_REVIEW', reviewActionItemId: reviewAction.id, failureReasons };
    await closeActiveVerificationAutomationRuns(db, action.id, 'REVIEW_REQUIRED', result);
    await db.auditLog.create({
      data: {
        entityType: 'PriceVerification',
        entityId: verification.id,
        action: 'LIVE_VERIFICATION_MANUAL_REVIEW',
        actor,
        afterJson: { reviewActionItemId: reviewAction.id, failureReasons }
      }
    });
    return result;
  }

  await db.priceVerification.update({
    where: { id: verification.id },
    data: {
      status: 'FAILED',
      observedAmazonPrice: money(observedAmazonPrice),
      observedEbayPrice: money(observedEbayPrice),
      observedAmazonBrand: input.amazon?.brand,
      observedEbayBrand: input.ebay?.brand,
      observedAmazonCondition: input.amazon?.condition,
      observedEbayCondition: input.ebay?.condition,
      observedBuyingFormat: input.ebay?.buyingFormat,
      evidenceJson,
      failureReasons,
      checkedAt: new Date()
    }
  });
  await db.actionItem.update({ where: { id: action.id }, data: { status: 'REJECTED', reviewedBy: actor, reviewedAt: new Date() } });
  const result = { status: 'FAILED', failureReasons, observedProfit };
  await closeActiveVerificationAutomationRuns(db, action.id, 'FAILED', result);
  await db.auditLog.create({
    data: {
      entityType: 'PriceVerification',
      entityId: verification.id,
      action: 'LIVE_VERIFICATION_FAILED',
      actor,
      afterJson: { failureReasons, observedAmazonPrice, observedEbayPrice, observedProfit }
    }
  });

  return result;
}
