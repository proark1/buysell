import { defaultRuleConfig, type ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { profitDefaultsForMarket, type DiscoveryMarket } from './marketplaces.js';

const marketDefaultWhenConfigIsDefault = (configured: number, defaultValue: number, marketValue: number): number => (
  configured === defaultValue ? marketValue : configured
);

export function profitInputsFromRuleConfig(ruleConfig: ActiveRuleConfig, market?: Pick<DiscoveryMarket, 'key'> | string): {
  ebayFinalValueFeeRate: number;
  ebayPaymentFeeRate: number;
  estimatedSalesTaxRate: number;
  returnRiskBuffer: number;
  priceChangeBuffer: number;
  sourceShippingCost: number;
  packagingCost: number;
  shippingLabelCost: number;
  paymentFixedFee: number;
  promotedListingFeeRate: number;
  returnReserveRate: number;
  cancellationReserveRate: number;
  marketplaceRiskBuffer: number;
} {
  const marketDefaults = profitDefaultsForMarket(market);
  return {
    ebayFinalValueFeeRate: marketDefaults.ebayFinalValueFeeRate,
    ebayPaymentFeeRate: marketDefaults.ebayPaymentFeeRate,
    estimatedSalesTaxRate: marketDefaultWhenConfigIsDefault(
      ruleConfig.estimatedSalesTaxRate,
      defaultRuleConfig.estimatedSalesTaxRate,
      marketDefaults.estimatedSalesTaxRate
    ),
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
    promotedListingFeeRate: ruleConfig.defaultPromotedListingFeeRate,
    returnReserveRate: ruleConfig.returnReserveRate,
    cancellationReserveRate: ruleConfig.cancellationReserveRate,
    marketplaceRiskBuffer: ruleConfig.marketplaceRiskBuffer
  };
}
