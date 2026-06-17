import type { PrismaClient } from '@prisma/client';
import { getAmazonProductByAsin, keepaDomainIdFromAmazonUrl } from '../clients/keepaClient.js';
import { getSecret } from './secrets.js';

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber();
  return undefined;
};

export async function runAmazonPriceMonitor(db: PrismaClient): Promise<unknown> {
  const keepaApiKey = await getSecret(db, 'KEEPA_API_KEY');
  if (!keepaApiKey) throw new Error('KEEPA_API_KEY is required for Amazon price monitoring');

  const listings = await db.ebayListing.findMany({
    where: { listingStatus: 'ACTIVE' },
    include: { amazonMatch: true, productCandidate: true }
  });

  const results = [];

  for (const listing of listings) {
    const storedPrice = numberValue(listing.amazonMatch?.buyBoxPrice) ?? numberValue(listing.amazonMatch?.currentPrice);
    if (!storedPrice || !listing.amazonMatch?.asin) continue;

    const latest = await getAmazonProductByAsin({
      asin: listing.amazonMatch.asin,
      apiKey: keepaApiKey,
      domain: keepaDomainIdFromAmazonUrl(listing.amazonMatch.amazonUrl)
    });
    const latestPrice = latest ? latest.buyBoxPrice ?? latest.currentPrice : undefined;

    if (!latestPrice) {
      results.push({ listingId: listing.id, asin: listing.amazonMatch.asin, status: 'NO_PRICE' });
      continue;
    }

    if (latestPrice > storedPrice) {
      const existingAction = await db.actionItem.findFirst({
        where: {
          productCandidateId: listing.productCandidateId,
          amazonMatchId: listing.amazonMatchId,
          type: 'PAUSE',
          status: { in: ['PENDING', 'APPROVED'] }
        },
        orderBy: { createdAt: 'desc' }
      });

      const action = existingAction ?? await db.actionItem.create({
        data: {
          productCandidateId: listing.productCandidateId,
          amazonMatchId: listing.amazonMatchId,
          type: 'PAUSE',
          priority: 1,
          reason: `Amazon price increased from ${storedPrice} to ${latestPrice}; pause eBay listing to avoid loss.`,
          payloadJson: { listingId: listing.id, ebayItemId: listing.ebayItemId, ebayOfferId: listing.ebayOfferId, asin: listing.amazonMatch.asin, storedPrice, latestPrice }
        }
      });

      await db.auditLog.create({
        data: {
          entityType: 'EbayListing',
          entityId: listing.id,
          action: existingAction ? 'AMAZON_PRICE_INCREASE_PAUSE_ACTION_ALREADY_EXISTS' : 'AMAZON_PRICE_INCREASE_PAUSE_ACTION_CREATED',
          actor: 'amazon-price-monitor',
          afterJson: { actionItemId: action.id, asin: listing.amazonMatch.asin, storedPrice, latestPrice }
        }
      });
      results.push({ listingId: listing.id, asin: listing.amazonMatch.asin, status: existingAction ? 'PAUSE_ACTION_EXISTS' : 'PAUSE_ACTION_CREATED', storedPrice, latestPrice, actionItemId: action.id });
    } else {
      results.push({ listingId: listing.id, asin: listing.amazonMatch.asin, status: 'OK', storedPrice, latestPrice });
    }
  }

  return { checked: listings.length, results };
}
