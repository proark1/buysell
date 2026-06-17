import type { ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';

export function profitInputsFromRuleConfig(ruleConfig: ActiveRuleConfig): {
  estimatedSalesTaxRate: number;
  returnRiskBuffer: number;
  priceChangeBuffer: number;
  sourceShippingCost: number;
  packagingCost: number;
  paymentFixedFee: number;
  promotedListingFeeRate: number;
  returnReserveRate: number;
  cancellationReserveRate: number;
  marketplaceRiskBuffer: number;
} {
  return {
    estimatedSalesTaxRate: ruleConfig.estimatedSalesTaxRate,
    returnRiskBuffer: ruleConfig.returnRiskBuffer,
    priceChangeBuffer: ruleConfig.priceChangeBuffer,
    sourceShippingCost: ruleConfig.sourceShippingCost,
    packagingCost: ruleConfig.packagingCost,
    paymentFixedFee: ruleConfig.paymentFixedFee,
    promotedListingFeeRate: ruleConfig.defaultPromotedListingFeeRate,
    returnReserveRate: ruleConfig.returnReserveRate,
    cancellationReserveRate: ruleConfig.cancellationReserveRate,
    marketplaceRiskBuffer: ruleConfig.marketplaceRiskBuffer
  };
}
