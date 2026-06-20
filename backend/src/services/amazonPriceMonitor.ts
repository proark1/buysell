import type { PrismaClient } from '@prisma/client';
import { getAmazonProductByAsin, keepaDomainIdFromAmazonUrl } from '../clients/keepaClient.js';
import { getSecret } from './secrets.js';
import { getActiveRuleConfig, type ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { profitInputsFromRuleConfig } from './profitInputs.js';
import { calculateProfit } from './profitCalculator.js';
import { notify } from './notificationService.js';

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    const n = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const isOutOfStock = (availability: string | undefined, latestPrice: number | undefined): boolean =>
  latestPrice === undefined || (typeof availability === 'string' && /out.?of.?stock|unavailable|no.?price/i.test(availability));

type MonitoredListing = {
  id: string;
  listingStatus: string;
  listedPrice: unknown;
  ebayItemId: string | null;
  ebayOfferId: string | null;
  productCandidateId: string;
  amazonMatchId: string;
  amazonMatch: { asin: string; amazonUrl: string | null; buyBoxPrice: unknown; currentPrice: unknown } | null;
};

// Create an action only if no open (PENDING/APPROVED) action of this type already exists
// for the same candidate/match, so repeated monitor passes don't pile up duplicates.
async function createActionOnce(
  db: PrismaClient,
  listing: MonitoredListing,
  type: 'PAUSE' | 'REPRICE' | 'REVIEW',
  priority: number,
  reason: string,
  payload: Record<string, unknown>
): Promise<{ created: boolean; actionId: string }> {
  const existing = await db.actionItem.findFirst({
    where: {
      productCandidateId: listing.productCandidateId,
      amazonMatchId: listing.amazonMatchId,
      type,
      status: { in: ['PENDING', 'APPROVED', 'EXECUTING'] }
    },
    orderBy: { createdAt: 'desc' }
  });
  if (existing) return { created: false, actionId: existing.id };
  const action = await db.actionItem.create({
    data: {
      productCandidateId: listing.productCandidateId,
      amazonMatchId: listing.amazonMatchId,
      type,
      priority,
      reason,
      payloadJson: { listingId: listing.id, ebayItemId: listing.ebayItemId, ebayOfferId: listing.ebayOfferId, asin: listing.amazonMatch?.asin, ...payload }
    }
  });
  return { created: true, actionId: action.id };
}

async function syncInventoryRecord(
  db: PrismaClient,
  listing: MonitoredListing,
  inStock: boolean,
  unitCost: number | undefined,
  availability: string | undefined
): Promise<void> {
  const existing = await db.sourceInventoryRecord.findFirst({
    where: { productCandidateId: listing.productCandidateId, amazonMatchId: listing.amazonMatchId },
    orderBy: { createdAt: 'desc' }
  });
  const data = {
    status: inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
    unitCost: unitCost === undefined ? undefined : unitCost.toFixed(2),
    quantityOnHand: inStock ? 1 : 0,
    lastCheckedAt: new Date(),
    metadataJson: { availabilityStatus: availability ?? null, asin: listing.amazonMatch?.asin }
  };
  if (existing) {
    await db.sourceInventoryRecord.update({ where: { id: existing.id }, data });
  } else {
    await db.sourceInventoryRecord.create({
      data: { productCandidateId: listing.productCandidateId, amazonMatchId: listing.amazonMatchId, asin: listing.amazonMatch?.asin, supplierName: 'Amazon', ...data }
    });
  }
}

export async function runAmazonPriceMonitor(db: PrismaClient): Promise<unknown> {
  const keepaApiKey = await getSecret(db, 'KEEPA_API_KEY');
  if (!keepaApiKey) throw new Error('KEEPA_API_KEY is required for Amazon price monitoring');

  const config: ActiveRuleConfig = await getActiveRuleConfig(db);
  const inputs = profitInputsFromRuleConfig(config);
  const feeRate = inputs.ebayFinalValueFeeRate + inputs.ebayPaymentFeeRate + inputs.promotedListingFeeRate;

  // Repricing/resume considers PAUSED listings too; otherwise only ACTIVE ones matter.
  const statuses = config.repricingEnabled ? ['ACTIVE', 'PAUSED'] : ['ACTIVE'];
  const listings = await db.ebayListing.findMany({
    where: { listingStatus: { in: statuses } },
    include: { amazonMatch: true, productCandidate: true }
  }) as unknown as MonitoredListing[];

  const profitAt = (ebayPrice: number, amazonCost: number): { profit: number; roi: number } => {
    const result = calculateProfit({ ebaySalePrice: ebayPrice, amazonItemCost: amazonCost, ...inputs });
    return { profit: result.expectedProfit, roi: result.roiPercent };
  };
  const isHealthy = (ebayPrice: number, amazonCost: number): boolean => {
    const { profit, roi } = profitAt(ebayPrice, amazonCost);
    return profit >= config.thresholds.minimumProfitUsd && roi >= config.thresholds.minimumRoiPercent;
  };

  const results: Array<Record<string, unknown>> = [];

  for (const listing of listings) {
    const asin = listing.amazonMatch?.asin;
    const listedPrice = numberValue(listing.listedPrice);
    if (!asin || listedPrice === undefined) continue;

    const latest = await getAmazonProductByAsin({ asin, apiKey: keepaApiKey, domain: keepaDomainIdFromAmazonUrl(listing.amazonMatch?.amazonUrl ?? undefined) });
    const latestPrice = latest ? latest.buyBoxPrice ?? latest.currentPrice : undefined;
    const availability = latest?.availabilityStatus;
    const oos = isOutOfStock(availability ?? undefined, latestPrice);

    if (config.inventorySyncEnabled) {
      await syncInventoryRecord(db, listing, !oos, latestPrice, availability ?? undefined);
    }

    // Out of stock / unfulfillable: pause active listings as a sourcing risk.
    if (oos) {
      if (listing.listingStatus === 'ACTIVE' && config.inventorySyncEnabled) {
        const { created, actionId } = await createActionOnce(db, listing, 'PAUSE', 1,
          `Amazon source for ${asin} appears out of stock; pause eBay listing to avoid an unfulfillable sale.`,
          { reasonCode: 'OUT_OF_STOCK', availabilityStatus: availability ?? null });
        if (created) notify(db, { code: 'SOURCE_OUT_OF_STOCK', severity: 'high', title: 'Source out of stock', message: `ASIN ${asin} is out of stock; pause action created.`, data: { listingId: listing.id, asin } });
        results.push({ listingId: listing.id, asin, status: 'OUT_OF_STOCK_PAUSE', actionId });
      } else {
        results.push({ listingId: listing.id, asin, status: 'NO_PRICE' });
      }
      continue;
    }

    const amazonCost = latestPrice as number;
    const healthy = isHealthy(listedPrice, amazonCost);

    // Paused listing whose economics recovered: surface a resume candidate (re-listing is a
    // human/LIST step, so this is a REVIEW signal rather than an auto-republish).
    if (listing.listingStatus === 'PAUSED') {
      if (config.repricingEnabled && healthy) {
        const { created, actionId } = await createActionOnce(db, listing, 'REVIEW', 20,
          `Amazon price for ${asin} recovered to ${amazonCost}; this paused listing is profitable again at ${listedPrice} and can be relisted.`,
          { reasonCode: 'RESUME_CANDIDATE', latestAmazonPrice: amazonCost });
        if (created) notify(db, { code: 'LISTING_RESUME_CANDIDATE', severity: 'medium', title: 'Paused listing profitable again', message: `ASIN ${asin} recovered; consider relisting.`, data: { listingId: listing.id, asin } });
        results.push({ listingId: listing.id, asin, status: 'RESUME_CANDIDATE', actionId });
      } else {
        results.push({ listingId: listing.id, asin, status: 'PAUSED_STILL_UNPROFITABLE' });
      }
      continue;
    }

    // ACTIVE and profitable: nothing to do.
    if (healthy) {
      results.push({ listingId: listing.id, asin, status: 'OK', listedPrice, latestAmazonPrice: amazonCost });
      continue;
    }

    // ACTIVE but no longer profitable at the current price.
    if (config.repricingEnabled) {
      // Approximate the eBay price needed to restore the minimum profit, then cap the raise.
      const { profit } = profitAt(listedPrice, amazonCost);
      const shortfall = config.thresholds.minimumProfitUsd - profit;
      const targetPrice = round2(listedPrice + shortfall / Math.max(1 - feeRate, 0.5));
      const maxAllowed = round2(listedPrice * (1 + config.repriceMaxIncreasePercent));
      if (targetPrice > listedPrice && targetPrice <= maxAllowed && isHealthy(targetPrice, amazonCost)) {
        const { created, actionId } = await createActionOnce(db, listing, 'REPRICE', 5,
          `Amazon cost rose to ${amazonCost}; raise eBay price from ${listedPrice} to ${targetPrice} to restore the minimum margin.`,
          { recommendedPrice: targetPrice, previousPrice: listedPrice, latestAmazonPrice: amazonCost, reasonCode: 'MARGIN_REPRICE' });
        if (created) notify(db, { code: 'LISTING_REPRICE', severity: 'medium', title: 'Reprice to protect margin', message: `ASIN ${asin}: raise ${listedPrice} -> ${targetPrice}.`, data: { listingId: listing.id, asin, targetPrice } });
        results.push({ listingId: listing.id, asin, status: 'REPRICE_ACTION', listedPrice, targetPrice, latestAmazonPrice: amazonCost, actionId });
        continue;
      }
      // Can't raise enough without pricing out of the market: pause instead.
    }

    const { created, actionId } = await createActionOnce(db, listing, 'PAUSE', 1,
      `Listing ${listing.id} is no longer profitable at ${listedPrice} (Amazon cost ${amazonCost}); pause to avoid a loss.`,
      { latestAmazonPrice: amazonCost, previousPrice: listedPrice, reasonCode: 'UNPROFITABLE' });
    if (created) notify(db, { code: 'LISTING_UNPROFITABLE_PAUSE', severity: 'high', title: 'Listing no longer profitable', message: `ASIN ${asin}: pause action created (Amazon cost ${amazonCost}).`, data: { listingId: listing.id, asin } });
    results.push({ listingId: listing.id, asin, status: created ? 'PAUSE_ACTION_CREATED' : 'PAUSE_ACTION_EXISTS', listedPrice, latestAmazonPrice: amazonCost, actionId });
  }

  return { checked: listings.length, results };
}
