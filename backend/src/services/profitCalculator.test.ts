import { calculateProfit } from './profitCalculator.js';
import { defaultRuleConfig } from '../repositories/ruleConfigRepository.js';
import { profitInputsFromRuleConfig } from './profitInputs.js';
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

const fullRisk = calculateProfit({
  ebaySalePrice: 120,
  amazonItemCost: 65,
  categoryFinalValueFeeRate: 0.12,
  ebayPaymentFeeRate: 0.03,
  promotedListingFeeRate: 0.02,
  currencyConversionBufferRate: 0.01,
  insertionFee: 0.35,
  listingUpgradeFees: 1,
  promotedListingFixedFee: 0.5,
  paymentFixedFee: 0.3,
  sourceShippingCost: 2,
  shippingLabelCost: 5,
  packagingCost: 1.25,
  estimatedSalesTaxRate: 0.07,
  returnReserveRate: 0.03,
  returnShippingReserveRate: 0.02,
  cancellationReserveRate: 0.01,
  marketplaceRiskBuffer: 1,
  stockoutRiskBuffer: 2,
  returnRiskBuffer: 1,
  priceChangeBuffer: 1.5
});

assertApprox(fullRisk.estimatedVariableFees ?? 0, 21.6, 'full risk variable fees');
assertApprox(fullRisk.estimatedFees, 23.75, 'full risk total fees');
assertApprox(fullRisk.shippingLabelCost ?? 0, 5, 'full risk shipping label');
assertApprox(fullRisk.totalRiskReserve ?? 0, 12.7, 'full risk reserve');
assertApprox(fullRisk.totalLandedCost ?? 0, 90.5, 'full risk landed cost');
assertApprox(fullRisk.expectedProfit, 5.75, 'full risk expected profit');

const germanInputs = profitInputsFromRuleConfig(defaultRuleConfig, 'de');
const usInputs = profitInputsFromRuleConfig(defaultRuleConfig, 'us');
assertApprox(germanInputs.estimatedSalesTaxRate, 0.19, 'Germany default source tax');
assertApprox(germanInputs.ebayPaymentFeeRate, 0.0235, 'Germany payment fee default');
assertApprox(usInputs.estimatedSalesTaxRate, 0.08, 'US default source tax');
assertApprox(usInputs.ebayFinalValueFeeRate, 0.1325, 'US final value fee default');

console.log('profitCalculator unit test passed');
