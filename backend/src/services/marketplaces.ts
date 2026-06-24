export interface DiscoveryMarket {
  key: string;
  label: string;
  country: string;
  currency: string;
  currencySymbol: string;
  amazonDomainId: number;
  amazonDomain: string;
  amazonMarketplaceId?: string;
  ebayDomain: string;
  ebayMarketplaceId?: string;
  defaultPostalCode?: string;
}

export interface EbayComparisonPreset {
  key: string;
  label: string;
  description: string;
  minimumProfit: number;
  minimumRoiPercent: number;
  minimumMatchConfidence: number;
  minimumOpportunityScore: number;
  ebayResultLimit: number;
  soldOnly: boolean;
  completedOnly: boolean;
  buyingFormat: 'ANY' | 'BIN' | 'Auction' | 'BO';
  itemCondition: 'ANY' | 'NEW' | 'USED' | 'OPEN_BOX';
  preferredLocation: 'ANY' | 'Domestic' | 'Regional' | 'Worldwide';
}

export interface EbayComparisonSettings {
  presetKey: string;
  minimumProfit: number;
  minimumRoiPercent: number;
  minimumMatchConfidence: number;
  minimumOpportunityScore: number;
  ebayResultLimit: number;
  soldOnly: boolean;
  completedOnly: boolean;
  buyingFormat: 'ANY' | 'BIN' | 'Auction' | 'BO';
  itemCondition: 'ANY' | 'NEW' | 'USED' | 'OPEN_BOX';
  preferredLocation: 'ANY' | 'Domestic' | 'Regional' | 'Worldwide';
  postalCode?: string;
}

export interface MarketplaceProfitDefaults {
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
  paymentFixedFee: number;
  paymentFixedFeeThreshold?: number;
  paymentFixedFeeBelowThreshold?: number;
  paymentFixedFeeAboveThreshold?: number;
}

export const amazonDiscoveryMarkets: DiscoveryMarket[] = [
  {
    key: 'de',
    label: 'Germany',
    country: 'Germany',
    currency: 'EUR',
    currencySymbol: '€',
    amazonDomainId: 3,
    amazonDomain: 'amazon.de',
    amazonMarketplaceId: 'A1PA6795UKMFR9',
    ebayDomain: 'ebay.de',
    ebayMarketplaceId: 'EBAY_DE',
    defaultPostalCode: '10115'
  },
  {
    key: 'us',
    label: 'United States',
    country: 'United States',
    currency: 'USD',
    currencySymbol: '$',
    amazonDomainId: 1,
    amazonDomain: 'amazon.com',
    amazonMarketplaceId: 'ATVPDKIKX0DER',
    ebayDomain: 'ebay.com',
    ebayMarketplaceId: 'EBAY_US',
    defaultPostalCode: '10001'
  },
  {
    key: 'uk',
    label: 'United Kingdom',
    country: 'United Kingdom',
    currency: 'GBP',
    currencySymbol: '£',
    amazonDomainId: 2,
    amazonDomain: 'amazon.co.uk',
    amazonMarketplaceId: 'A1F83G8C2ARO7P',
    ebayDomain: 'ebay.co.uk',
    ebayMarketplaceId: 'EBAY_GB'
  },
  {
    key: 'fr',
    label: 'France',
    country: 'France',
    currency: 'EUR',
    currencySymbol: '€',
    amazonDomainId: 4,
    amazonDomain: 'amazon.fr',
    amazonMarketplaceId: 'A13V1IB3VIYZZH',
    ebayDomain: 'ebay.fr',
    ebayMarketplaceId: 'EBAY_FR'
  },
  {
    key: 'ca',
    label: 'Canada',
    country: 'Canada',
    currency: 'CAD',
    currencySymbol: 'CA$',
    amazonDomainId: 6,
    amazonDomain: 'amazon.ca',
    amazonMarketplaceId: 'A2EUQ1WTGCTBG2',
    ebayDomain: 'ebay.ca',
    ebayMarketplaceId: 'EBAY_CA'
  },
  {
    key: 'it',
    label: 'Italy',
    country: 'Italy',
    currency: 'EUR',
    currencySymbol: '€',
    amazonDomainId: 8,
    amazonDomain: 'amazon.it',
    amazonMarketplaceId: 'APJ6JRA9NG5V4',
    ebayDomain: 'ebay.it',
    ebayMarketplaceId: 'EBAY_IT'
  },
  {
    key: 'es',
    label: 'Spain',
    country: 'Spain',
    currency: 'EUR',
    currencySymbol: '€',
    amazonDomainId: 9,
    amazonDomain: 'amazon.es',
    amazonMarketplaceId: 'A1RKKUPIHCS9HS',
    ebayDomain: 'ebay.es',
    ebayMarketplaceId: 'EBAY_ES'
  }
];

const marketplaceProfitDefaults: Record<string, MarketplaceProfitDefaults> = {
  de: {
    ebayFinalValueFeeRate: 0.12,
    ebayFinalValueFeeThreshold: 1990,
    ebayFinalValueFeeBelowThresholdRate: 0.12,
    ebayFinalValueFeeAboveThresholdRate: 0.03,
    ebayPaymentFeeRate: 0,
    estimatedSalesTaxRate: 0.19,
    sourcePriceIncludesVat: true,
    reclaimInputVat: false,
    collectOutputVat: false,
    outputVatIncludedInSalePrice: true,
    vatModeKey: 'de_gross_no_reclaim',
    feeRateCardVersion: 'ebay-de-commercial-2026-02',
    marketplaceKey: 'de',
    destinationMarketplaceId: 'EBAY_DE',
    currency: 'EUR',
    paymentFixedFee: 0.35,
    paymentFixedFeeThreshold: 10,
    paymentFixedFeeBelowThreshold: 0.35,
    paymentFixedFeeAboveThreshold: 0.45
  },
  us: {
    ebayFinalValueFeeRate: 0.1325,
    ebayPaymentFeeRate: 0.03,
    estimatedSalesTaxRate: 0.08,
    sourcePriceIncludesVat: false,
    vatModeKey: 'us_additive_sales_tax',
    marketplaceKey: 'us',
    destinationMarketplaceId: 'EBAY_US',
    currency: 'USD',
    paymentFixedFee: 0.3
  },
  uk: {
    ebayFinalValueFeeRate: 0.128,
    ebayPaymentFeeRate: 0.029,
    estimatedSalesTaxRate: 0.2,
    paymentFixedFee: 0.3
  },
  fr: {
    ebayFinalValueFeeRate: 0.11,
    ebayPaymentFeeRate: 0,
    estimatedSalesTaxRate: 0.2,
    paymentFixedFee: 0.35
  },
  ca: {
    ebayFinalValueFeeRate: 0.1325,
    ebayPaymentFeeRate: 0.03,
    estimatedSalesTaxRate: 0.05,
    paymentFixedFee: 0.3
  },
  it: {
    ebayFinalValueFeeRate: 0.11,
    ebayPaymentFeeRate: 0,
    estimatedSalesTaxRate: 0.22,
    paymentFixedFee: 0.35
  },
  es: {
    ebayFinalValueFeeRate: 0.11,
    ebayPaymentFeeRate: 0,
    estimatedSalesTaxRate: 0.21,
    paymentFixedFee: 0.35
  }
};

export const ebayComparisonPresets: EbayComparisonPreset[] = [
  {
    key: 'balanced',
    label: 'Balanced',
    description: 'Good default: requires profit and demand, but routes borderline matches to manual review.',
    minimumProfit: 10,
    minimumRoiPercent: 20,
    minimumMatchConfidence: 0.6,
    minimumOpportunityScore: 55,
    ebayResultLimit: 10,
    soldOnly: true,
    completedOnly: true,
    buyingFormat: 'BIN',
    itemCondition: 'NEW',
    preferredLocation: 'Domestic'
  },
  {
    key: 'strict',
    label: 'Strict',
    description: 'Only strong same-product matches should pass automatically.',
    minimumProfit: 15,
    minimumRoiPercent: 30,
    minimumMatchConfidence: 0.75,
    minimumOpportunityScore: 70,
    ebayResultLimit: 8,
    soldOnly: true,
    completedOnly: true,
    buyingFormat: 'BIN',
    itemCondition: 'NEW',
    preferredLocation: 'Domestic'
  },
  {
    key: 'exploratory',
    label: 'Exploratory',
    description: 'Looser matching for research; high-risk results stay in manual review.',
    minimumProfit: 5,
    minimumRoiPercent: 12,
    minimumMatchConfidence: 0.45,
    minimumOpportunityScore: 40,
    ebayResultLimit: 15,
    soldOnly: true,
    completedOnly: true,
    buyingFormat: 'BIN',
    itemCondition: 'NEW',
    preferredLocation: 'ANY'
  }
];

export function getAmazonDiscoveryMarket(key?: string): DiscoveryMarket {
  return amazonDiscoveryMarkets.find((market) => market.key === key) ?? amazonDiscoveryMarkets[0];
}

export function getEbayDiscoveryMarket(key?: string): DiscoveryMarket {
  return getAmazonDiscoveryMarket(key);
}

export function getEbayComparisonPreset(key?: string): EbayComparisonPreset {
  return ebayComparisonPresets.find((preset) => preset.key === key) ?? ebayComparisonPresets[0];
}

export function resolveEbayComparisonSettings(input: Partial<EbayComparisonSettings> = {}): EbayComparisonSettings {
  const preset = getEbayComparisonPreset(input.presetKey);
  return {
    presetKey: preset.key,
    minimumProfit: input.minimumProfit ?? preset.minimumProfit,
    minimumRoiPercent: input.minimumRoiPercent ?? preset.minimumRoiPercent,
    minimumMatchConfidence: input.minimumMatchConfidence ?? preset.minimumMatchConfidence,
    minimumOpportunityScore: input.minimumOpportunityScore ?? preset.minimumOpportunityScore,
    ebayResultLimit: input.ebayResultLimit ?? preset.ebayResultLimit,
    soldOnly: input.soldOnly ?? preset.soldOnly,
    completedOnly: input.completedOnly ?? preset.completedOnly,
    buyingFormat: input.buyingFormat ?? preset.buyingFormat,
    itemCondition: input.itemCondition ?? preset.itemCondition,
    preferredLocation: input.preferredLocation ?? preset.preferredLocation,
    postalCode: input.postalCode
  };
}

export function profitDefaultsForMarket(market?: Pick<DiscoveryMarket, 'key'> | string): MarketplaceProfitDefaults {
  const key = typeof market === 'string' ? market : market?.key;
  return marketplaceProfitDefaults[key ?? ''] ?? marketplaceProfitDefaults.us;
}
