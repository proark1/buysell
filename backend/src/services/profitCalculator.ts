export interface ProfitCalculatorInput {
  ebaySalePrice: number;
  amazonItemCost: number;
  ebayFinalValueFeeRate?: number;
  ebayPaymentFeeRate?: number;
  promotedListingFeeRate?: number;
  amazonShippingCost?: number;
  estimatedSalesTaxRate?: number;
  returnRiskBuffer?: number;
  priceChangeBuffer?: number;
}

export interface ProfitCalculatorResult {
  estimatedFees: number;
  estimatedTax: number;
  bufferAmount: number;
  expectedProfit: number;
  roiPercent: number;
  marginPercent: number;
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
const roundPercent = (value: number): number => Math.round(value * 1000) / 1000;

export function calculateProfit(input: ProfitCalculatorInput): ProfitCalculatorResult {
  const ebayFinalValueFeeRate = input.ebayFinalValueFeeRate ?? 0.1325;
  const ebayPaymentFeeRate = input.ebayPaymentFeeRate ?? 0.03;
  const promotedListingFeeRate = input.promotedListingFeeRate ?? 0;
  const amazonShippingCost = input.amazonShippingCost ?? 0;
  const estimatedSalesTaxRate = input.estimatedSalesTaxRate ?? 0;
  const returnRiskBuffer = input.returnRiskBuffer ?? 0;
  const priceChangeBuffer = input.priceChangeBuffer ?? 0;

  const estimatedFees = input.ebaySalePrice * (ebayFinalValueFeeRate + ebayPaymentFeeRate + promotedListingFeeRate);
  const estimatedTax = input.amazonItemCost * estimatedSalesTaxRate;
  const bufferAmount = returnRiskBuffer + priceChangeBuffer;
  const totalSourceCost = input.amazonItemCost + amazonShippingCost + estimatedTax;
  const expectedProfit = input.ebaySalePrice - estimatedFees - totalSourceCost - bufferAmount;

  return {
    estimatedFees: roundMoney(estimatedFees),
    estimatedTax: roundMoney(estimatedTax),
    bufferAmount: roundMoney(bufferAmount),
    expectedProfit: roundMoney(expectedProfit),
    roiPercent: totalSourceCost > 0 ? roundPercent((expectedProfit / totalSourceCost) * 100) : 0,
    marginPercent: input.ebaySalePrice > 0 ? roundPercent((expectedProfit / input.ebaySalePrice) * 100) : 0
  };
}
