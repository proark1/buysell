export interface ProfitCalculatorInput {
  ebaySalePrice: number;
  ebayShippingPrice?: number;
  amazonItemCost: number;
  ebayFinalValueFeeRate?: number;
  categoryFinalValueFeeRate?: number;
  ebayPaymentFeeRate?: number;
  promotedListingFeeRate?: number;
  currencyConversionBufferRate?: number;
  insertionFee?: number;
  listingUpgradeFees?: number;
  promotedListingFixedFee?: number;
  amazonShippingCost?: number;
  sourceShippingCost?: number;
  shippingLabelCost?: number;
  packagingCost?: number;
  paymentFixedFee?: number;
  returnReserveRate?: number;
  returnShippingReserveRate?: number;
  cancellationReserveRate?: number;
  marketplaceRiskBuffer?: number;
  stockoutRiskBuffer?: number;
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
  returnShippingReserve?: number;
  cancellationReserve?: number;
  marketplaceRiskBuffer?: number;
  stockoutRiskBuffer?: number;
  shippingLabelCost?: number;
  insertionFee?: number;
  listingUpgradeFees?: number;
  promotedListingFixedFee?: number;
  currencyConversionReserve?: number;
  totalSourceCost?: number;
  totalLandedCost?: number;
  totalRiskReserve?: number;
  expectedProfit: number;
  roiPercent: number;
  marginPercent: number;
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
const roundPercent = (value: number): number => Math.round(value * 1000) / 1000;

export function calculateProfit(input: ProfitCalculatorInput): ProfitCalculatorResult {
  const ebayFinalValueFeeRate = input.categoryFinalValueFeeRate ?? input.ebayFinalValueFeeRate ?? 0.1325;
  const ebayPaymentFeeRate = input.ebayPaymentFeeRate ?? 0.03;
  const promotedListingFeeRate = input.promotedListingFeeRate ?? 0;
  const currencyConversionBufferRate = input.currencyConversionBufferRate ?? 0;
  const insertionFee = input.insertionFee ?? 0;
  const listingUpgradeFees = input.listingUpgradeFees ?? 0;
  const promotedListingFixedFee = input.promotedListingFixedFee ?? 0;
  const sourceShippingCost = input.sourceShippingCost ?? input.amazonShippingCost ?? 0;
  const shippingLabelCost = input.shippingLabelCost ?? 0;
  const packagingCost = input.packagingCost ?? 0;
  const paymentFixedFee = input.paymentFixedFee ?? 0;
  const returnReserveRate = input.returnReserveRate ?? 0;
  const returnShippingReserveRate = input.returnShippingReserveRate ?? 0;
  const cancellationReserveRate = input.cancellationReserveRate ?? 0;
  const marketplaceRiskBuffer = input.marketplaceRiskBuffer ?? 0;
  const stockoutRiskBuffer = input.stockoutRiskBuffer ?? 0;
  const estimatedSalesTaxRate = input.estimatedSalesTaxRate ?? 0;
  const returnRiskBuffer = input.returnRiskBuffer ?? 0;
  const priceChangeBuffer = input.priceChangeBuffer ?? 0;
  const ebayShippingPrice = input.ebayShippingPrice ?? 0;

  // eBay charges its final-value fee on the full buyer payment (item + shipping), and the
  // buyer-paid shipping is also revenue to the seller.
  const grossRevenue = input.ebaySalePrice + ebayShippingPrice;

  const estimatedVariableFees = grossRevenue * (ebayFinalValueFeeRate + ebayPaymentFeeRate + promotedListingFeeRate + currencyConversionBufferRate);
  const currencyConversionReserve = grossRevenue * currencyConversionBufferRate;
  const estimatedFees = estimatedVariableFees + paymentFixedFee + insertionFee + listingUpgradeFees + promotedListingFixedFee;
  const estimatedTax = input.amazonItemCost * estimatedSalesTaxRate;
  const returnReserve = grossRevenue * returnReserveRate;
  const returnShippingReserve = grossRevenue * returnShippingReserveRate;
  const cancellationReserve = grossRevenue * cancellationReserveRate;
  const bufferAmount = returnRiskBuffer
    + priceChangeBuffer
    + returnReserve
    + returnShippingReserve
    + cancellationReserve
    + marketplaceRiskBuffer
    + stockoutRiskBuffer;
  const totalSourceCost = input.amazonItemCost + sourceShippingCost + estimatedTax;
  // Cash actually invested (out-of-pocket), excluding risk reserves which are not spend.
  const cashInvested = totalSourceCost + shippingLabelCost + packagingCost;
  const totalLandedCost = totalSourceCost + shippingLabelCost + packagingCost + bufferAmount;
  const expectedProfit = grossRevenue - estimatedFees - totalLandedCost;

  return {
    estimatedVariableFees: roundMoney(estimatedVariableFees),
    estimatedFees: roundMoney(estimatedFees),
    estimatedTax: roundMoney(estimatedTax),
    bufferAmount: roundMoney(bufferAmount),
    sourceShippingCost: roundMoney(sourceShippingCost),
    packagingCost: roundMoney(packagingCost),
    paymentFixedFee: roundMoney(paymentFixedFee),
    returnReserve: roundMoney(returnReserve),
    returnShippingReserve: roundMoney(returnShippingReserve),
    cancellationReserve: roundMoney(cancellationReserve),
    marketplaceRiskBuffer: roundMoney(marketplaceRiskBuffer),
    stockoutRiskBuffer: roundMoney(stockoutRiskBuffer),
    shippingLabelCost: roundMoney(shippingLabelCost),
    insertionFee: roundMoney(insertionFee),
    listingUpgradeFees: roundMoney(listingUpgradeFees),
    promotedListingFixedFee: roundMoney(promotedListingFixedFee),
    currencyConversionReserve: roundMoney(currencyConversionReserve),
    totalSourceCost: roundMoney(totalSourceCost),
    totalLandedCost: roundMoney(totalLandedCost),
    totalRiskReserve: roundMoney(bufferAmount),
    expectedProfit: roundMoney(expectedProfit),
    roiPercent: totalSourceCost > 0 ? roundPercent((expectedProfit / totalSourceCost) * 100) : 0,
    marginPercent: input.ebaySalePrice > 0 ? roundPercent((expectedProfit / input.ebaySalePrice) * 100) : 0
  };
}
