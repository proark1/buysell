export interface DiscoveryMarket {
  key: string;
  label: string;
  country: string;
  currency: string;
  currencySymbol: string;
  amazonDomainId: number;
  amazonDomain: string;
  ebayDomain: string;
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

export const amazonDiscoveryMarkets: DiscoveryMarket[] = [
  {
    key: 'de',
    label: 'Germany',
    country: 'Germany',
    currency: 'EUR',
    currencySymbol: '€',
    amazonDomainId: 3,
    amazonDomain: 'amazon.de',
    ebayDomain: 'ebay.de',
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
    ebayDomain: 'ebay.com',
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
    ebayDomain: 'ebay.co.uk'
  },
  {
    key: 'fr',
    label: 'France',
    country: 'France',
    currency: 'EUR',
    currencySymbol: '€',
    amazonDomainId: 4,
    amazonDomain: 'amazon.fr',
    ebayDomain: 'ebay.fr'
  },
  {
    key: 'ca',
    label: 'Canada',
    country: 'Canada',
    currency: 'CAD',
    currencySymbol: 'CA$',
    amazonDomainId: 6,
    amazonDomain: 'amazon.ca',
    ebayDomain: 'ebay.ca'
  },
  {
    key: 'it',
    label: 'Italy',
    country: 'Italy',
    currency: 'EUR',
    currencySymbol: '€',
    amazonDomainId: 8,
    amazonDomain: 'amazon.it',
    ebayDomain: 'ebay.it'
  },
  {
    key: 'es',
    label: 'Spain',
    country: 'Spain',
    currency: 'EUR',
    currencySymbol: '€',
    amazonDomainId: 9,
    amazonDomain: 'amazon.es',
    ebayDomain: 'ebay.es'
  }
];

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
