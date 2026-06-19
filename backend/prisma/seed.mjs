import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

await prisma.ruleConfig.upsert({
  where: { name: 'default' },
  update: {
    active: true,
    minimumProfitUsd: '10.00',
    minimumRoiPercent: '25.000',
    minimumMatchConfidence: '0.750',
    estimatedSalesTaxRate: '0.0800',
    returnRiskBuffer: '2.00',
    priceChangeBuffer: '2.00',
    sourceShippingCost: '0.00',
    packagingCost: '0.00',
    paymentFixedFee: '0.00',
    defaultPromotedListingFeeRate: '0.0000',
    returnReserveRate: '0.0000',
    cancellationReserveRate: '0.0000',
    marketplaceRiskBuffer: '0.00',
    minimumSellThroughRate: '0.0500',
    maximumCompetitionRatio: '12.000',
    maxDailyListings: 10,
    maxDailyPurchaseAmountUsd: '250.00',
    safeMode: true,
    maxAmazonCostUsd: '150.00',
    minimumOpportunityScore: 65,
    blockedBrands: [],
    blockedCategories: ['Clothing', 'Shoes', 'Food', 'Grocery', 'Beauty', 'Health', 'Baby', 'Medical', 'Adult', 'Weapons'],
    blockedKeywords: ['shirt', 'dress', 'shoe', 'sneaker', 'food', 'snack', 'supplement', 'vitamin', 'makeup', 'cosmetic', 'lotion', 'medicine', 'baby formula', 'knife', 'gun', 'adult'],
    amazonPriceCheckIntervalMinutes: 30
  },
  create: {
    id: 'default-rule-config',
    name: 'default',
    active: true,
    minimumProfitUsd: '10.00',
    minimumRoiPercent: '25.000',
    minimumMatchConfidence: '0.750',
    estimatedSalesTaxRate: '0.0800',
    returnRiskBuffer: '2.00',
    priceChangeBuffer: '2.00',
    sourceShippingCost: '0.00',
    packagingCost: '0.00',
    paymentFixedFee: '0.00',
    defaultPromotedListingFeeRate: '0.0000',
    returnReserveRate: '0.0000',
    cancellationReserveRate: '0.0000',
    marketplaceRiskBuffer: '0.00',
    minimumSellThroughRate: '0.0500',
    maximumCompetitionRatio: '12.000',
    maxDailyListings: 10,
    maxDailyPurchaseAmountUsd: '250.00',
    safeMode: true,
    maxAmazonCostUsd: '150.00',
    minimumOpportunityScore: 65,
    blockedBrands: [],
    blockedCategories: ['Clothing', 'Shoes', 'Food', 'Grocery', 'Beauty', 'Health', 'Baby', 'Medical', 'Adult', 'Weapons'],
    blockedKeywords: ['shirt', 'dress', 'shoe', 'sneaker', 'food', 'snack', 'supplement', 'vitamin', 'makeup', 'cosmetic', 'lotion', 'medicine', 'baby formula', 'knife', 'gun', 'adult'],
    amazonPriceCheckIntervalMinutes: 30
  }
});

await prisma.$disconnect();
console.log('Seeded default RuleConfig');
