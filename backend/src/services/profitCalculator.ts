export interface ProfitCalculatorInput {
  ebaySalePrice: number;
  amazonItemCost: number;
  ebayFinalValueFeeRate?: number;
  ebayPaymentFeeRate?: number;
  promotedListingFeeRate?: number;
  amazonShippingCost?: number;
  sourceShippingCost?: number;
  packagingCost?: number;
  paymentFixedFee?: number;
  returnReserveRate?: number;
  cancellationReserveRate?: number;
  marketplaceRiskBuffer?: number;
  estimatedSalesTaxRate?: number;
  returnRiskBuffer?: number;
  priceChangeBuffer?: number;
}

export interface ProfitCalculatorResult {
  estimatedVariableFees?: number;
  estimatedFees: number;
  estimatedTax: number;
  bufferAmount: number;
  sourceShippingCost?: number;
  packagingCost?: number;
  paymentFixedFee?: number;
  returnReserve?: number;
  cancellationReserve?: number;
  marketplaceRiskBuffer?: number;
  totalSourceCost?: number;
  totalLandedCost?: number;
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
  const sourceShippingCost = input.sourceShippingCost ?? input.amazonShippingCost ?? 0;
  const packagingCost = input.packagingCost ?? 0;
  const paymentFixedFee = input.paymentFixedFee ?? 0;
  const returnReserveRate = input.returnReserveRate ?? 0;
  const cancellationReserveRate = input.cancellationReserveRate ?? 0;
  const marketplaceRiskBuffer = input.marketplaceRiskBuffer ?? 0;
  const estimatedSalesTaxRate = input.estimatedSalesTaxRate ?? 0;
  const returnRiskBuffer = input.returnRiskBuffer ?? 0;
  const priceChangeBuffer = input.priceChangeBuffer ?? 0;

  const estimatedVariableFees = input.ebaySalePrice * (ebayFinalValueFeeRate + ebayPaymentFeeRate + promotedListingFeeRate);
  const estimatedFees = estimatedVariableFees + paymentFixedFee;
  const estimatedTax = input.amazonItemCost * estimatedSalesTaxRate;
  const returnReserve = input.ebaySalePrice * returnReserveRate;
  const cancellationReserve = input.ebaySalePrice * cancellationReserveRate;
  const bufferAmount = returnRiskBuffer + priceChangeBuffer + returnReserve + cancellationReserve + marketplaceRiskBuffer;
  const totalSourceCost = input.amazonItemCost + sourceShippingCost + estimatedTax;
  const totalLandedCost = totalSourceCost + packagingCost + bufferAmount;
  const expectedProfit = input.ebaySalePrice - estimatedFees - totalLandedCost;

  return {
    estimatedVariableFees: roundMoney(estimatedVariableFees),
    estimatedFees: roundMoney(estimatedFees),
    estimatedTax: roundMoney(estimatedTax),
    bufferAmount: roundMoney(bufferAmount),
    sourceShippingCost: roundMoney(sourceShippingCost),
    packagingCost: roundMoney(packagingCost),
    paymentFixedFee: roundMoney(paymentFixedFee),
    returnReserve: roundMoney(returnReserve),
    cancellationReserve: roundMoney(cancellationReserve),
    marketplaceRiskBuffer: roundMoney(marketplaceRiskBuffer),
    totalSourceCost: roundMoney(totalSourceCost),
    totalLandedCost: roundMoney(totalLandedCost),
    expectedProfit: roundMoney(expectedProfit),
    roiPercent: totalSourceCost > 0 ? roundPercent((expectedProfit / totalSourceCost) * 100) : 0,
    marginPercent: input.ebaySalePrice > 0 ? roundPercent((expectedProfit / input.ebaySalePrice) * 100) : 0
  };
}
