export interface ProfitCalculatorInput {
  ebaySalePrice: number;
  ebayShippingPrice?: number;
  amazonItemCost: number;
  ebayFinalValueFeeRate?: number;
  categoryFinalValueFeeRate?: number;
  ebayFinalValueFeeThreshold?: number;
  ebayFinalValueFeeBelowThresholdRate?: number;
  ebayFinalValueFeeAboveThresholdRate?: number;
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
  paymentFixedFeeThreshold?: number;
  paymentFixedFeeBelowThreshold?: number;
  paymentFixedFeeAboveThreshold?: number;
  returnReserveRate?: number;
  returnShippingReserveRate?: number;
  cancellationReserveRate?: number;
  marketplaceRiskBuffer?: number;
  stockoutRiskBuffer?: number;
  estimatedSalesTaxRate?: number;
  taxableSourceShipping?: boolean;
  sourcePriceIncludesVat?: boolean;
  reclaimInputVat?: boolean;
  collectOutputVat?: boolean;
  outputVatIncludedInSalePrice?: boolean;
  vatModeKey?: string;
  feeRateCardVersion?: string;
  marketplaceKey?: string;
  destinationMarketplaceId?: string;
  currency?: string;
  returnRiskBuffer?: number;
  priceChangeBuffer?: number;
}

export interface ProfitCalculatorResult {
  estimatedVariableFees?: number;
  estimatedFees: number;
  estimatedTax: number;
  inputVatCredit?: number;
  outputVatReserve?: number;
  netVatCost?: number;
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
  feeRateCardVersion?: string;
  vatModeKey?: string;
  vatRate?: number;
  sourcePriceIncludesVat?: boolean;
  taxableSourceShipping?: boolean;
  marketplaceKey?: string;
  destinationMarketplaceId?: string;
  currency?: string;
  totalSourceCost?: number;
  totalLandedCost?: number;
  totalRiskReserve?: number;
  expectedProfit: number;
  roiPercent: number;
  marginPercent: number;
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
const roundPercent = (value: number): number => Math.round(value * 1000) / 1000;

const tieredFinalValueFee = (grossRevenue: number, input: ProfitCalculatorInput, fallbackRate: number): number => {
  const threshold = input.ebayFinalValueFeeThreshold;
  const belowRate = input.ebayFinalValueFeeBelowThresholdRate;
  const aboveRate = input.ebayFinalValueFeeAboveThresholdRate;
  if (
    threshold !== undefined &&
    threshold > 0 &&
    belowRate !== undefined &&
    aboveRate !== undefined
  ) {
    const belowBase = Math.min(grossRevenue, threshold);
    const aboveBase = Math.max(0, grossRevenue - threshold);
    return (belowBase * belowRate) + (aboveBase * aboveRate);
  }
  return grossRevenue * fallbackRate;
};

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
  const grossRevenue = input.ebaySalePrice + (input.ebayShippingPrice ?? 0);
  const thresholdPaymentFixedFee = (
    input.paymentFixedFeeThreshold !== undefined &&
    input.paymentFixedFeeBelowThreshold !== undefined &&
    input.paymentFixedFeeAboveThreshold !== undefined
      ? grossRevenue <= input.paymentFixedFeeThreshold
        ? input.paymentFixedFeeBelowThreshold
        : input.paymentFixedFeeAboveThreshold
      : undefined
  );
  const paymentFixedFee = input.paymentFixedFee && input.paymentFixedFee > 0
    ? input.paymentFixedFee
    : thresholdPaymentFixedFee ?? input.paymentFixedFee ?? 0;
  const returnReserveRate = input.returnReserveRate ?? 0;
  const returnShippingReserveRate = input.returnShippingReserveRate ?? 0;
  const cancellationReserveRate = input.cancellationReserveRate ?? 0;
  const marketplaceRiskBuffer = input.marketplaceRiskBuffer ?? 0;
  const stockoutRiskBuffer = input.stockoutRiskBuffer ?? 0;
  const estimatedSalesTaxRate = input.estimatedSalesTaxRate ?? 0;
  const sourcePriceIncludesVat = input.sourcePriceIncludesVat ?? false;
  const reclaimInputVat = input.reclaimInputVat ?? false;
  const collectOutputVat = input.collectOutputVat ?? false;
  const outputVatIncludedInSalePrice = input.outputVatIncludedInSalePrice ?? true;
  const returnRiskBuffer = input.returnRiskBuffer ?? 0;
  const priceChangeBuffer = input.priceChangeBuffer ?? 0;
  const finalValueFee = tieredFinalValueFee(grossRevenue, input, ebayFinalValueFeeRate);
  const estimatedVariableFees = finalValueFee + (grossRevenue * (ebayPaymentFeeRate + promotedListingFeeRate + currencyConversionBufferRate));
  const currencyConversionReserve = grossRevenue * currencyConversionBufferRate;
  const estimatedFees = estimatedVariableFees + paymentFixedFee + insertionFee + listingUpgradeFees + promotedListingFixedFee;
  // Source tax/VAT can be additive (legacy sales-tax reserve) or included in a gross EU price.
  const taxableBase = input.amazonItemCost + (input.taxableSourceShipping ? sourceShippingCost : 0);
  const estimatedTax = sourcePriceIncludesVat ? 0 : taxableBase * estimatedSalesTaxRate;
  const inputVatCredit = sourcePriceIncludesVat && reclaimInputVat && estimatedSalesTaxRate > 0
    ? taxableBase - (taxableBase / (1 + estimatedSalesTaxRate))
    : 0;
  const outputVatReserve = collectOutputVat && estimatedSalesTaxRate > 0
    ? outputVatIncludedInSalePrice
      ? grossRevenue - (grossRevenue / (1 + estimatedSalesTaxRate))
      : grossRevenue * estimatedSalesTaxRate
    : 0;
  const netVatCost = estimatedTax + outputVatReserve - inputVatCredit;
  const returnReserve = grossRevenue * returnReserveRate;
  const returnShippingReserve = grossRevenue * returnShippingReserveRate;
  const cancellationReserve = grossRevenue * cancellationReserveRate;
  const bufferAmount = returnRiskBuffer
    + priceChangeBuffer
    + returnReserve
    + returnShippingReserve
    + cancellationReserve
    + marketplaceRiskBuffer
    + stockoutRiskBuffer
    + outputVatReserve;
  const totalSourceCost = input.amazonItemCost + sourceShippingCost + estimatedTax - inputVatCredit;
  // Cash actually invested (out-of-pocket), excluding risk reserves which are not spend.
  const cashInvested = input.amazonItemCost + sourceShippingCost + estimatedTax + shippingLabelCost + packagingCost;
  const totalLandedCost = totalSourceCost + shippingLabelCost + packagingCost + bufferAmount;
  const expectedProfit = grossRevenue - estimatedFees - totalLandedCost;

  return {
    estimatedVariableFees: roundMoney(estimatedVariableFees),
    estimatedFees: roundMoney(estimatedFees),
    estimatedTax: roundMoney(estimatedTax),
    inputVatCredit: roundMoney(inputVatCredit),
    outputVatReserve: roundMoney(outputVatReserve),
    netVatCost: roundMoney(netVatCost),
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
    feeRateCardVersion: input.feeRateCardVersion,
    vatModeKey: input.vatModeKey,
    vatRate: estimatedSalesTaxRate,
    sourcePriceIncludesVat,
    taxableSourceShipping: Boolean(input.taxableSourceShipping),
    marketplaceKey: input.marketplaceKey,
    destinationMarketplaceId: input.destinationMarketplaceId,
    currency: input.currency,
    totalSourceCost: roundMoney(totalSourceCost),
    totalLandedCost: roundMoney(totalLandedCost),
    totalRiskReserve: roundMoney(bufferAmount),
    expectedProfit: roundMoney(expectedProfit),
    roiPercent: cashInvested > 0 ? roundPercent((expectedProfit / cashInvested) * 100) : 0,
    marginPercent: grossRevenue > 0 ? roundPercent((expectedProfit / grossRevenue) * 100) : 0
  };
}
