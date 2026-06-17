import type { PrismaClient } from '@prisma/client';
import { findAmazonMatches } from '../clients/keepaClient.js';
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

    const matches = await findAmazonMatches({ query: listing.amazonMatch.asin, apiKey: keepaApiKey, limit: 1 });
    const latest = matches[0];
    const latestPrice = latest ? latest.buyBoxPrice ?? latest.currentPrice : undefined;

    if (!latestPrice) {
      results.push({ listingId: listing.id, asin: listing.amazonMatch.asin, status: 'NO_PRICE' });
      continue;
    }

    if (latestPrice > storedPrice) {
      const action = await db.actionItem.create({
        data: {
          productCandidateId: listing.productCandidateId,
          amazonMatchId: listing.amazonMatchId,
          type: 'PAUSE',
          priority: 1,
          reason: `Amazon price increased from ${storedPrice} to ${latestPrice}; pause eBay listing to avoid loss.`,
          payloadJson: { listingId: listing.id, ebayItemId: listing.ebayItemId, ebayOfferId: listing.ebayOfferId, asin: listing.amazonMatch.asin, storedPrice, latestPrice }
        }
      });

      await db.ebayListing.update({ where: { id: listing.id }, data: { listingStatus: 'PAUSED' } });
      await db.auditLog.create({
        data: {
          entityType: 'EbayListing',
          entityId: listing.id,
          action: 'AMAZON_PRICE_INCREASE_PAUSED_LISTING',
          actor: 'amazon-price-monitor',
          afterJson: { actionItemId: action.id, asin: listing.amazonMatch.asin, storedPrice, latestPrice }
        }
      });
      results.push({ listingId: listing.id, asin: listing.amazonMatch.asin, status: 'PAUSED', storedPrice, latestPrice, actionItemId: action.id });
    } else {
      results.push({ listingId: listing.id, asin: listing.amazonMatch.asin, status: 'OK', storedPrice, latestPrice });
    }
  }

  return { checked: listings.length, results };
}
