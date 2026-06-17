import { calculateProfit } from './profitCalculator.js';
import { assertApprox } from './testHelpers.js';

const result = calculateProfit({
  ebaySalePrice: 54.99,
  amazonItemCost: 31.5,
  estimatedSalesTaxRate: 0.08,
  returnRiskBuffer: 2,
  priceChangeBuffer: 2
});

assertApprox(result.estimatedFees, 8.94, 'estimated fees');
assertApprox(result.estimatedTax, 2.52, 'estimated tax');
assertApprox(result.bufferAmount, 4, 'buffer amount');
assertApprox(result.expectedProfit, 8.03, 'expected profit');
assertApprox(result.roiPercent, 23.616, 'ROI percent');
assertApprox(result.marginPercent, 14.61, 'margin percent');

const landed = calculateProfit({
  ebaySalePrice: 100,
  amazonItemCost: 50,
  ebayFinalValueFeeRate: 0.1,
  ebayPaymentFeeRate: 0.03,
  promotedListingFeeRate: 0.02,
  paymentFixedFee: 0.4,
  sourceShippingCost: 3,
  packagingCost: 1.5,
  estimatedSalesTaxRate: 0.08,
  returnRiskBuffer: 2,
  priceChangeBuffer: 1,
  returnReserveRate: 0.04,
  cancellationReserveRate: 0.01,
  marketplaceRiskBuffer: 0.75
});

assertApprox(landed.estimatedVariableFees ?? 0, 15, 'landed variable fees');
assertApprox(landed.estimatedFees, 15.4, 'landed total fees');
assertApprox(landed.totalSourceCost ?? 0, 57, 'landed source cost');
assertApprox(landed.bufferAmount, 8.75, 'landed buffers');
assertApprox(landed.totalLandedCost ?? 0, 67.25, 'landed cost');
assertApprox(landed.expectedProfit, 17.35, 'landed expected profit');

console.log('profitCalculator unit test passed');
