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

console.log('profitCalculator unit test passed');
