import type { AmazonMatchInput, EbayCandidateInput } from '../domain/products.js';

export interface DiscoveryProfile {
  key: string;
  label: string;
  description: string;
  seedQueries: string[];
  defaultLimit: number;
  maxAmazonCostUsd: number;
  minimumOpportunityScore: number;
  minimumProfitUsd: number;
  minimumRoiPercent: number;
}

export interface AmazonDiscoveryCategory {
  key: string;
  label: string;
  description: string;
  seedQueries: string[];
}

export interface AmazonDiscoveryProfile {
  key: string;
  label: string;
  description: string;
  categories: AmazonDiscoveryCategory[];
  defaultLimit: number;
  compareLimit: number;
  maxAmazonCostUsd: number;
  minimumAmazonScore: number;
  minPriceDropPercent: number;
}

export interface SafetyPolicy {
  safeMode: boolean;
  blockedBrands: string[];
  blockedCategories: string[];
  blockedKeywords: string[];
  allowedCategories: string[];
  maxAmazonCostUsd: number;
}

export interface SafetyReview {
  status: 'PASS' | 'WARN' | 'REJECT';
  riskFlags: string[];
  reasons: string[];
}

export const defaultBlockedCategories = [
  'Clothing',
  'Shoes',
  'Food',
  'Grocery',
  'Beauty',
  'Health',
  'Baby',
  'Medical',
  'Adult',
  'Weapons'
];

export const defaultBlockedKeywords = [
  'shirt',
  'dress',
  'shoe',
  'sneaker',
  'hoodie',
  'pants',
  'food',
  'snack',
  'coffee',
  'tea',
  'supplement',
  'vitamin',
  'protein powder',
  'makeup',
  'cosmetic',
  'lotion',
  'shampoo',
  'perfume',
  'baby formula',
  'diaper',
  'medicine',
  'prescription',
  'pesticide',
  'hazmat',
  'knife',
  'gun',
  'adult',
  'lingerie'
];

export const defaultAllowedCategories = [
  'Electronics',
  'Office Products',
  'Tools',
  'Home Improvement',
  'Home & Kitchen',
  'Automotive',
  'Pet Supplies'
];

export const discoveryProfiles: DiscoveryProfile[] = [
  {
    key: 'starter-safe',
    label: 'Starter Safe Products',
    description: 'Small, non-consumable products with simple shipping and lower return risk.',
    seedQueries: ['wireless barcode scanner', 'label printer accessory', 'desk cable organizer', 'replacement remote control'],
    defaultLimit: 8,
    maxAmazonCostUsd: 120,
    minimumOpportunityScore: 65,
    minimumProfitUsd: 10,
    minimumRoiPercent: 25
  },
  {
    key: 'electronics-accessories',
    label: 'Electronics Accessories',
    description: 'Cables, adapters, remotes, mounts, and small electronics accessories.',
    seedQueries: ['usb c docking station', 'camera battery charger', 'hdmi splitter', 'replacement tv remote'],
    defaultLimit: 8,
    maxAmazonCostUsd: 180,
    minimumOpportunityScore: 68,
    minimumProfitUsd: 12,
    minimumRoiPercent: 25
  },
  {
    key: 'tools-office',
    label: 'Tools & Office',
    description: 'Office equipment, shop tools, scanners, printers, organizers, and parts.',
    seedQueries: ['thermal label printer', 'cordless tool charger', 'barcode scanner', 'laminator machine'],
    defaultLimit: 8,
    maxAmazonCostUsd: 220,
    minimumOpportunityScore: 70,
    minimumProfitUsd: 15,
    minimumRoiPercent: 28
  },
  {
    key: 'home-small-goods',
    label: 'Home / Small Goods',
    description: 'Compact household goods that are easier to pack and verify.',
    seedQueries: ['air purifier filter', 'vacuum replacement part', 'drawer organizer', 'garage remote control'],
    defaultLimit: 8,
    maxAmazonCostUsd: 140,
    minimumOpportunityScore: 66,
    minimumProfitUsd: 10,
    minimumRoiPercent: 25
  },
  {
    key: 'custom',
    label: 'Custom Search',
    description: 'Use your own keywords while keeping the same safety gates.',
    seedQueries: [],
    defaultLimit: 8,
    maxAmazonCostUsd: 150,
    minimumOpportunityScore: 65,
    minimumProfitUsd: 10,
    minimumRoiPercent: 25
  }
];

export const amazonDiscoveryProfiles: AmazonDiscoveryProfile[] = [
  {
    key: 'starter-safe',
    label: 'Starter Safe Products',
    description: 'Amazon-first scout for compact, non-consumable products that are easier to ship and verify.',
    defaultLimit: 40,
    compareLimit: 12,
    maxAmazonCostUsd: 150,
    minimumAmazonScore: 62,
    minPriceDropPercent: 5,
    categories: [
      {
        key: 'office-electronics',
        label: 'Office Electronics',
        description: 'Scanners, label printers, remotes, small office devices, and accessories.',
        seedQueries: ['wireless barcode scanner', 'thermal label printer', 'label printer accessory', 'laminator machine', 'replacement remote control']
      },
      {
        key: 'small-tools',
        label: 'Small Tools',
        description: 'Chargers, adapters, measurement tools, bits, and compact shop equipment.',
        seedQueries: ['cordless tool charger', 'digital caliper', 'laser distance measure', 'soldering station accessory', 'multimeter leads']
      },
      {
        key: 'home-parts',
        label: 'Home Parts',
        description: 'Replacement filters, vacuum parts, remotes, and small household components.',
        seedQueries: ['air purifier filter', 'vacuum replacement part', 'garage remote control', 'appliance replacement knob', 'drawer organizer']
      }
    ]
  },
  {
    key: 'electronics-accessories',
    label: 'Electronics Accessories',
    description: 'Cables, adapters, mounts, batteries, remotes, and small electronics accessories.',
    defaultLimit: 50,
    compareLimit: 15,
    maxAmazonCostUsd: 180,
    minimumAmazonScore: 65,
    minPriceDropPercent: 6,
    categories: [
      {
        key: 'adapters-cables',
        label: 'Adapters & Cables',
        description: 'Docking stations, splitters, adapters, and cable tools.',
        seedQueries: ['usb c docking station', 'hdmi splitter', 'displayport adapter', 'ethernet adapter', 'usb hub powered']
      },
      {
        key: 'camera-accessories',
        label: 'Camera Accessories',
        description: 'Battery chargers, mounts, lights, and compact camera accessories.',
        seedQueries: ['camera battery charger', 'camera cage accessory', 'led video light', 'tripod quick release plate', 'camera remote shutter']
      }
    ]
  },
  {
    key: 'tools-office',
    label: 'Tools & Office',
    description: 'Tools and office equipment with clearer model matching and practical demand signals.',
    defaultLimit: 50,
    compareLimit: 15,
    maxAmazonCostUsd: 220,
    minimumAmazonScore: 68,
    minPriceDropPercent: 5,
    categories: [
      {
        key: 'office-equipment',
        label: 'Office Equipment',
        description: 'Printers, scanners, label tools, laminators, and office hardware.',
        seedQueries: ['thermal label printer', 'document scanner', 'barcode scanner', 'paper cutter heavy duty', 'laminator machine']
      },
      {
        key: 'tool-accessories',
        label: 'Tool Accessories',
        description: 'Battery chargers, tool accessories, meters, and compact hardware.',
        seedQueries: ['cordless tool charger', 'battery adapter tool', 'stud finder', 'digital multimeter', 'laser level']
      }
    ]
  },
  {
    key: 'custom',
    label: 'Custom Amazon Scout',
    description: 'Use your own Amazon search terms with the same safety and score gates.',
    defaultLimit: 30,
    compareLimit: 10,
    maxAmazonCostUsd: 150,
    minimumAmazonScore: 60,
    minPriceDropPercent: 0,
    categories: [
      {
        key: 'custom',
        label: 'Custom',
        description: 'Custom search terms.',
        seedQueries: []
      }
    ]
  }
];

export function getDiscoveryProfile(key?: string): DiscoveryProfile {
  return discoveryProfiles.find((profile) => profile.key === key) ?? discoveryProfiles[0];
}

export function getAmazonDiscoveryProfile(key?: string): AmazonDiscoveryProfile {
  return amazonDiscoveryProfiles.find((profile) => profile.key === key) ?? amazonDiscoveryProfiles[0];
}

export function getAmazonDiscoveryCategory(profile: AmazonDiscoveryProfile, key?: string): AmazonDiscoveryCategory {
  return profile.categories.find((category) => category.key === key) ?? profile.categories[0];
}

const normalizedIncludes = (value: string | undefined, patterns: string[]): string | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return patterns.find((pattern) => normalized.includes(pattern.toLowerCase()));
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizedKeywordIncludes = (value: string | undefined, patterns: string[]): string | undefined => {
  if (!value) return undefined;
  return patterns.find((pattern) => {
    const normalizedPattern = pattern.trim().toLowerCase();
    if (!normalizedPattern) return false;
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedPattern)}([^a-z0-9]|$)`, 'i').test(value);
  });
};

export function evaluateProductSafety(
  ebay: EbayCandidateInput,
  amazon: AmazonMatchInput,
  policy: SafetyPolicy
): SafetyReview {
  const riskFlags: string[] = [];
  const reasons: string[] = [];
  const titleText = `${ebay.title} ${amazon.title}`;
  const categoryText = [ebay.category, amazon.rootCategory, ...(amazon.categoryTree ?? [])].filter(Boolean).join(' ');
  const amazonCost = amazon.buyBoxPrice ?? amazon.currentPrice;

  const blockedBrand = normalizedIncludes(amazon.brand, policy.blockedBrands);
  if (blockedBrand) {
    riskFlags.push('BLOCKED_BRAND');
    reasons.push(`Blocked brand: ${blockedBrand}`);
  }

  const blockedCategory = normalizedIncludes(categoryText, policy.blockedCategories);
  if (blockedCategory) {
    riskFlags.push('BLOCKED_CATEGORY');
    reasons.push(`Blocked category: ${blockedCategory}`);
  }

  const blockedKeyword = normalizedKeywordIncludes(titleText, policy.blockedKeywords);
  if (blockedKeyword) {
    riskFlags.push('BLOCKED_KEYWORD');
    reasons.push(`Blocked keyword: ${blockedKeyword}`);
  }

  if (policy.safeMode && policy.allowedCategories.length > 0 && categoryText) {
    const allowedCategory = normalizedIncludes(categoryText, policy.allowedCategories);
    if (!allowedCategory) {
      riskFlags.push('OUTSIDE_ALLOWED_CATEGORY');
      reasons.push('Category is outside the safe-mode allow list.');
    }
  }

  if (amazonCost !== undefined && amazonCost > policy.maxAmazonCostUsd) {
    riskFlags.push('AMAZON_COST_TOO_HIGH');
    reasons.push(`Amazon cost ${amazonCost.toFixed(2)} is above max ${policy.maxAmazonCostUsd.toFixed(2)}.`);
  }

  if (!amazonCost) {
    riskFlags.push('MISSING_AMAZON_PRICE');
    reasons.push('Missing Amazon price.');
  }

  if (!ebay.soldPrice) {
    riskFlags.push('MISSING_EBAY_PRICE');
    reasons.push('Missing eBay sold price.');
  }

  if (amazon.availabilityStatus && amazon.availabilityStatus !== 'IN_STOCK') {
    riskFlags.push('AMAZON_STOCK_UNKNOWN');
    reasons.push('Amazon stock is unknown.');
  }

  const hardReject = riskFlags.some((flag) => ['BLOCKED_BRAND', 'BLOCKED_CATEGORY', 'BLOCKED_KEYWORD', 'AMAZON_COST_TOO_HIGH'].includes(flag));
  const status = hardReject ? 'REJECT' : riskFlags.length > 0 ? 'WARN' : 'PASS';

  return { status, riskFlags, reasons };
}

export function evaluateAmazonProductSafety(
  amazon: AmazonMatchInput,
  policy: SafetyPolicy
): SafetyReview {
  const riskFlags: string[] = [];
  const reasons: string[] = [];
  const titleText = amazon.title;
  const categoryText = [amazon.rootCategory, ...(amazon.categoryTree ?? [])].filter(Boolean).join(' ');
  const amazonCost = amazon.buyBoxPrice ?? amazon.currentPrice;

  const blockedBrand = normalizedIncludes(amazon.brand, policy.blockedBrands);
  if (blockedBrand) {
    riskFlags.push('BLOCKED_BRAND');
    reasons.push(`Blocked brand: ${blockedBrand}`);
  }

  const blockedCategory = normalizedIncludes(categoryText, policy.blockedCategories);
  if (blockedCategory) {
    riskFlags.push('BLOCKED_CATEGORY');
    reasons.push(`Blocked category: ${blockedCategory}`);
  }

  const blockedKeyword = normalizedKeywordIncludes(titleText, policy.blockedKeywords);
  if (blockedKeyword) {
    riskFlags.push('BLOCKED_KEYWORD');
    reasons.push(`Blocked keyword: ${blockedKeyword}`);
  }

  if (policy.safeMode && policy.allowedCategories.length > 0 && categoryText) {
    const allowedCategory = normalizedIncludes(categoryText, policy.allowedCategories);
    if (!allowedCategory) {
      riskFlags.push('OUTSIDE_ALLOWED_CATEGORY');
      reasons.push('Category is outside the safe-mode allow list.');
    }
  }

  if (amazonCost !== undefined && amazonCost > policy.maxAmazonCostUsd) {
    riskFlags.push('AMAZON_COST_TOO_HIGH');
    reasons.push(`Amazon cost ${amazonCost.toFixed(2)} is above max ${policy.maxAmazonCostUsd.toFixed(2)}.`);
  }

  if (!amazonCost) {
    riskFlags.push('MISSING_AMAZON_PRICE');
    reasons.push('Missing Amazon price.');
  }

  if (amazon.availabilityStatus && amazon.availabilityStatus !== 'IN_STOCK') {
    riskFlags.push('AMAZON_STOCK_UNKNOWN');
    reasons.push('Amazon stock is unknown.');
  }

  const hardReject = riskFlags.some((flag) => ['BLOCKED_BRAND', 'BLOCKED_CATEGORY', 'BLOCKED_KEYWORD', 'AMAZON_COST_TOO_HIGH'].includes(flag));
  const status = hardReject ? 'REJECT' : riskFlags.length > 0 ? 'WARN' : 'PASS';

  return { status, riskFlags, reasons };
}
