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

export function getDiscoveryProfile(key?: string): DiscoveryProfile {
  return discoveryProfiles.find((profile) => profile.key === key) ?? discoveryProfiles[0];
}

const normalizedIncludes = (value: string | undefined, patterns: string[]): string | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return patterns.find((pattern) => normalized.includes(pattern.toLowerCase()));
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

  const blockedKeyword = normalizedIncludes(titleText, policy.blockedKeywords);
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
