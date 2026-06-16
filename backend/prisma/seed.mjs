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
    maxDailyListings: 10,
    maxDailyPurchaseAmountUsd: '250.00',
    blockedBrands: [],
    blockedCategories: []
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
    maxDailyListings: 10,
    maxDailyPurchaseAmountUsd: '250.00',
    blockedBrands: [],
    blockedCategories: []
  }
});

await prisma.$disconnect();
console.log('Seeded default RuleConfig');
