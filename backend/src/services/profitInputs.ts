import { defaultRuleConfig, type ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { profitDefaultsForMarket, type DiscoveryMarket } from './marketplaces.js';
import { BREAKEVEN_MODE } from '../config/engineMode.js';

const marketDefaultWhenConfigIsDefault = (configured: number, defaultValue: number, marketValue: number): number => (
  configured === defaultValue ? marketValue : configured
);

export interface ProfitRateInputs {
  ebayFinalValueFeeRate: number;
  ebayFinalValueFeeThreshold?: number;
  ebayFinalValueFeeBelowThresholdRate?: number;
  ebayFinalValueFeeAboveThresholdRate?: number;
  ebayPaymentFeeRate: number;
  estimatedSalesTaxRate: number;
  sourcePriceIncludesVat?: boolean;
  reclaimInputVat?: boolean;
  collectOutputVat?: boolean;
  outputVatIncludedInSalePrice?: boolean;
  vatModeKey?: string;
  feeRateCardVersion?: string;
  marketplaceKey?: string;
  destinationMarketplaceId?: string;
  currency?: string;
  returnRiskBuffer: number;
  priceChangeBuffer: number;
  sourceShippingCost: number;
  packagingCost: number;
  shippingLabelCost: number;
  paymentFixedFee: number;
  paymentFixedFeeThreshold?: number;
  paymentFixedFeeBelowThreshold?: number;
  paymentFixedFeeAboveThreshold?: number;
  promotedListingFeeRate: number;
  returnReserveRate: number;
  cancellationReserveRate: number;
  marketplaceRiskBuffer: number;
}

const ZERO_COST_INPUTS: ProfitRateInputs = {
  ebayFinalValueFeeRate: 0,
  ebayFinalValueFeeThreshold: undefined,
  ebayFinalValueFeeBelowThresholdRate: undefined,
  ebayFinalValueFeeAboveThresholdRate: undefined,
  ebayPaymentFeeRate: 0,
  estimatedSalesTaxRate: 0,
  sourcePriceIncludesVat: false,
  reclaimInputVat: false,
  collectOutputVat: false,
  outputVatIncludedInSalePrice: true,
  vatModeKey: 'breakeven',
  feeRateCardVersion: 'breakeven',
  marketplaceKey: undefined,
  destinationMarketplaceId: undefined,
  currency: undefined,
  returnRiskBuffer: 0,
  priceChangeBuffer: 0,
  sourceShippingCost: 0,
  packagingCost: 0,
  shippingLabelCost: 0,
  paymentFixedFee: 0,
  paymentFixedFeeThreshold: undefined,
  paymentFixedFeeBelowThreshold: undefined,
  paymentFixedFeeAboveThreshold: undefined,
  promotedListingFeeRate: 0,
  returnReserveRate: 0,
  cancellationReserveRate: 0,
  marketplaceRiskBuffer: 0
};

// Breakeven-aware entry point used by the discovery/comparison pipeline. In pure-spread mode it
// subtracts nothing; flip BREAKEVEN_MODE to false to fall back to the costed market model.
export function profitInputsFromRuleConfig(ruleConfig: ActiveRuleConfig, market?: Pick<DiscoveryMarket, 'key'> | string): ProfitRateInputs {
  if (BREAKEVEN_MODE) return { ...ZERO_COST_INPUTS };
  return costedProfitInputsFromRuleConfig(ruleConfig, market);
}

// The full costed model: marketplace final-value/payment fees, source VAT, and configured risk
// buffers. Kept separate (and exported) so the fee plumbing stays covered regardless of the flag.
export function costedProfitInputsFromRuleConfig(ruleConfig: ActiveRuleConfig, market?: Pick<DiscoveryMarket, 'key'> | string): ProfitRateInputs {
  const marketDefaults = profitDefaultsForMarket(market);
  return {
    ebayFinalValueFeeRate: marketDefaults.ebayFinalValueFeeRate,
    ebayFinalValueFeeThreshold: marketDefaults.ebayFinalValueFeeThreshold,
    ebayFinalValueFeeBelowThresholdRate: marketDefaults.ebayFinalValueFeeBelowThresholdRate,
    ebayFinalValueFeeAboveThresholdRate: marketDefaults.ebayFinalValueFeeAboveThresholdRate,
    ebayPaymentFeeRate: marketDefaults.ebayPaymentFeeRate,
    estimatedSalesTaxRate: marketDefaultWhenConfigIsDefault(
      ruleConfig.estimatedSalesTaxRate,
      defaultRuleConfig.estimatedSalesTaxRate,
      marketDefaults.estimatedSalesTaxRate
    ),
    sourcePriceIncludesVat: marketDefaults.sourcePriceIncludesVat,
    reclaimInputVat: marketDefaults.reclaimInputVat,
    collectOutputVat: marketDefaults.collectOutputVat,
    outputVatIncludedInSalePrice: marketDefaults.outputVatIncludedInSalePrice,
    vatModeKey: marketDefaults.vatModeKey,
    feeRateCardVersion: marketDefaults.feeRateCardVersion,
    marketplaceKey: marketDefaults.marketplaceKey,
    destinationMarketplaceId: marketDefaults.destinationMarketplaceId,
    currency: marketDefaults.currency,
    returnRiskBuffer: ruleConfig.returnRiskBuffer,
    priceChangeBuffer: ruleConfig.priceChangeBuffer,
    sourceShippingCost: ruleConfig.sourceShippingCost,
    packagingCost: ruleConfig.packagingCost,
    shippingLabelCost: ruleConfig.shippingLabelCost,
    paymentFixedFee: marketDefaultWhenConfigIsDefault(
      ruleConfig.paymentFixedFee,
      defaultRuleConfig.paymentFixedFee,
      marketDefaults.paymentFixedFee
    ),
    paymentFixedFeeThreshold: marketDefaults.paymentFixedFeeThreshold,
    paymentFixedFeeBelowThreshold: marketDefaults.paymentFixedFeeBelowThreshold,
    paymentFixedFeeAboveThreshold: marketDefaults.paymentFixedFeeAboveThreshold,
    promotedListingFeeRate: ruleConfig.defaultPromotedListingFeeRate,
    returnReserveRate: ruleConfig.returnReserveRate,
    cancellationReserveRate: ruleConfig.cancellationReserveRate,
    marketplaceRiskBuffer: ruleConfig.marketplaceRiskBuffer
  };
}
