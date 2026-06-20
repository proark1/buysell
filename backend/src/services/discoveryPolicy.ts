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

export interface EbayDiscoveryCategory {
  key: string;
  label: string;
  description: string;
  seedQueries: string[];
  categoryId?: string;
}

export interface EbayDiscoveryProfile {
  key: string;
  label: string;
  description: string;
  categories: EbayDiscoveryCategory[];
  defaultLimit: number;
  compareLimit: number;
  minEbayScore: number;
  minSoldPrice: number;
  maxSoldPrice: number;
}

export interface SafetyPolicy {
  safeMode: boolean;
  blockedBrands: string[];
  blockedCategories: string[];
  blockedKeywords: string[];
  maxAmazonCostUsd: number;
}

export interface SafetyReview {
  status: 'PASS' | 'WARN' | 'REJECT';
  riskFlags: string[];
  reasons: string[];
}

export type RejectionStage = 'SOURCE_DATA' | 'SOURCE_FORMAT' | 'SAFETY' | 'SOURCE_COST' | 'MATCHING' | 'ECONOMICS' | 'REVIEW_NEEDED' | 'SCORING';

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

// Pipeline order, earliest failure first. A rejected candidate is attributed to the first
// stage it failed, so the funnel buckets each candidate exactly once.
const rejectionStageOrder: RejectionStage[] = ['SOURCE_DATA', 'SOURCE_FORMAT', 'SAFETY', 'SOURCE_COST', 'MATCHING', 'ECONOMICS', 'SCORING', 'REVIEW_NEEDED'];

/** The earliest pipeline stage among a candidate's rejection flags (defaults to SCORING). */
export function primaryRejectionStage(flags: string[]): RejectionStage {
  const stages = new Set(flags.map(rejectionStageForFlag));
  for (const stage of rejectionStageOrder) {
    if (stages.has(stage)) return stage;
  }
  return 'SCORING';
}

export function rejectionStageForFlag(flag: string): RejectionStage {
  if (['MISSING_EBAY_PRICE', 'MISSING_AMAZON_PRICE'].includes(flag)) return 'SOURCE_DATA';
  if (['EBAY_AUCTION_FORMAT', 'EBAY_NOT_NEW', 'DAMAGED_OR_PARTS'].includes(flag)) return 'SOURCE_FORMAT';
  if (['BLOCKED_BRAND', 'BLOCKED_CATEGORY', 'BLOCKED_KEYWORD', 'AMAZON_OUT_OF_STOCK'].includes(flag)) return 'SAFETY';
  if (['AMAZON_COST_TOO_HIGH', 'AMAZON_COST_ABOVE_PROFILE'].includes(flag)) return 'SOURCE_COST';
  if ([
    'PRODUCT_IDENTITY_CONFLICT',
    'BRAND_MISMATCH',
    'MODEL_MISMATCH',
    'BUNDLE_OR_QUANTITY_MISMATCH',
    'VARIANT_MISMATCH',
    'LOW_MATCH_CONFIDENCE',
    'PRODUCT_IDENTITY_UNVERIFIED',
    'BRAND_NOT_VERIFIED',
    'MODEL_NOT_VERIFIED'
  ].includes(flag)) return 'MATCHING';
  if (['LOW_PROFIT', 'LOW_ROI'].includes(flag)) return 'ECONOMICS';
  if (['AMAZON_STOCK_UNKNOWN'].includes(flag)) return 'REVIEW_NEEDED';
  return 'SCORING';
}

export function hardSafetyRejectFlags(flags: string[]): string[] {
  return flags.filter((flag) => [
    'BLOCKED_BRAND',
    'BLOCKED_CATEGORY',
    'BLOCKED_KEYWORD',
    'AMAZON_COST_TOO_HIGH',
    'AMAZON_OUT_OF_STOCK',
    'EBAY_NOT_NEW',
    'EBAY_AUCTION_FORMAT'
  ].includes(flag));
}

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

export const ebayDiscoveryProfiles: EbayDiscoveryProfile[] = [
  {
    key: 'starter-safe',
    label: 'Starter Safe Sold Items',
    description: 'eBay-first scan for compact, non-consumable sold listings with safer fulfillment characteristics.',
    defaultLimit: 25,
    compareLimit: 10,
    minEbayScore: 50,
    minSoldPrice: 25,
    maxSoldPrice: 250,
    categories: [
      {
        key: 'office-electronics',
        label: 'Office Electronics',
        description: 'Sold scanners, label printers, remotes, small office devices, and accessories.',
        seedQueries: ['wireless barcode scanner', 'thermal label printer', 'label printer accessory', 'laminator machine', 'replacement remote control', 'document scanner', 'receipt printer', 'etikettendrucker']
      },
      {
        key: 'small-tools',
        label: 'Small Tools',
        description: 'Sold chargers, measuring tools, adapters, and compact shop equipment.',
        seedQueries: ['cordless tool charger', 'digital caliper', 'laser distance measure', 'multimeter leads', 'stud finder', 'laser level', 'battery adapter tool', 'messgeraet']
      },
      {
        key: 'home-parts',
        label: 'Home Parts',
        description: 'Sold replacement filters, vacuum parts, remotes, and small household components.',
        seedQueries: ['air purifier filter', 'vacuum replacement part', 'garage remote control', 'appliance replacement knob', 'coffee machine part', 'dishwasher basket', 'remote control garage', 'ersatzteil fernbedienung']
      },
      {
        key: 'networking-smart-home',
        label: 'Networking & Smart Home',
        description: 'Sold routers, mesh nodes, hubs, sensors, smart plugs, and network accessories.',
        seedQueries: ['mesh wifi router', 'smart home hub', 'zigbee sensor', 'smart plug pack', 'network switch 8 port', 'wifi range extender', 'router mesh wlan', 'smarthome sensor']
      },
      {
        key: 'auto-electronics',
        label: 'Auto Electronics',
        description: 'Sold diagnostic tools, adapters, chargers, dash accessories, and compact vehicle electronics.',
        seedQueries: ['obd2 scanner', 'car battery charger', 'dash cam mount', 'tpms tool', 'bluetooth obd adapter', 'diagnosegeraet auto', 'batterieladegeraet auto']
      }
    ]
  },
  {
    key: 'electronics-accessories',
    label: 'Electronics Accessories',
    description: 'eBay sold listings for cables, adapters, mounts, batteries, remotes, and small electronics accessories.',
    defaultLimit: 30,
    compareLimit: 12,
    minEbayScore: 52,
    minSoldPrice: 20,
    maxSoldPrice: 300,
    categories: [
      {
        key: 'adapters-cables',
        label: 'Adapters & Cables',
        description: 'Sold docking stations, splitters, adapters, hubs, and cable tools.',
        seedQueries: ['usb c docking station', 'hdmi splitter', 'displayport adapter', 'ethernet adapter', 'usb hub powered', 'thunderbolt dock', 'kvm switch', 'usb c hub', 'dockingstation']
      },
      {
        key: 'camera-accessories',
        label: 'Camera Accessories',
        description: 'Sold chargers, mounts, lights, and compact camera accessories.',
        seedQueries: ['camera battery charger', 'led video light', 'tripod quick release plate', 'camera remote shutter', 'camera cage accessory', 'gimbal battery charger', 'action camera mount', 'kamera akku ladegeraet']
      },
      {
        key: 'gaming-accessories',
        label: 'Gaming Accessories',
        description: 'Sold controllers, docks, adapters, chargers, and console accessories with clear model signals.',
        seedQueries: ['controller charging dock', 'console power supply', 'game controller adapter', 'switch dock replacement', 'gaming headset stand', 'controller ladestation', 'netzteil konsole']
      },
      {
        key: 'audio-accessories',
        label: 'Audio Accessories',
        description: 'Sold microphones, interfaces, small mixers, receivers, and replacement audio parts.',
        seedQueries: ['usb audio interface', 'wireless microphone receiver', 'podcast microphone arm', 'headphone amplifier', 'bluetooth audio transmitter', 'audio interface usb', 'mikrofon empfaenger']
      }
    ]
  },
  {
    key: 'tools-office',
    label: 'Tools & Office',
    description: 'eBay sold listings where model matching and practical demand signals are usually clearer.',
    defaultLimit: 30,
    compareLimit: 12,
    minEbayScore: 55,
    minSoldPrice: 30,
    maxSoldPrice: 350,
    categories: [
      {
        key: 'office-equipment',
        label: 'Office Equipment',
        description: 'Sold printers, scanners, label tools, laminators, and office hardware.',
        seedQueries: ['thermal label printer', 'document scanner', 'barcode scanner', 'paper cutter heavy duty', 'receipt printer', 'label rewinder', 'time clock machine', 'aktenvernichter']
      },
      {
        key: 'tool-accessories',
        label: 'Tool Accessories',
        description: 'Sold chargers, adapters, meters, and compact hardware.',
        seedQueries: ['cordless tool charger', 'battery adapter tool', 'stud finder', 'digital multimeter', 'laser level', 'torque adapter', 'inspection camera', 'akku adapter werkzeug']
      },
      {
        key: 'maker-electronics',
        label: 'Maker Electronics',
        description: 'Sold soldering, testing, 3D-printer, and small workshop electronics.',
        seedQueries: ['soldering station accessory', 'bench power supply', '3d printer hotend', 'filament dryer', 'oscilloscope probe', 'loetstation', 'netzteil labor']
      },
      {
        key: 'shipping-supplies',
        label: 'Shipping Tools',
        description: 'Sold label scales, thermal printers, tape dispensers, and warehouse accessories.',
        seedQueries: ['shipping label scale', 'thermal shipping printer', 'barcode label scanner', 'packing tape dispenser', 'postal scale digital', 'paketwaage', 'versandetiketten drucker']
      }
    ]
  },
  {
    key: 'branded-value',
    label: 'Branded & Model-Specific',
    description: 'eBay-first scan biased toward brand-name, model-specific products that map cleanly to a single Amazon ASIN and carry real price spreads — instead of generic commodity accessories where Amazon is rarely cheaper. Higher sold-price floor and score gate. Tune the seed queries to brands you want to source.',
    defaultLimit: 30,
    compareLimit: 12,
    minEbayScore: 60,
    minSoldPrice: 40,
    maxSoldPrice: 400,
    categories: [
      {
        key: 'audio-brands',
        label: 'Audio (Branded)',
        description: 'Brand-name headphones, speakers, and audio gear with clear model numbers.',
        seedQueries: ['sony wh-1000xm', 'bose quietcomfort', 'jbl charge', 'sennheiser momentum', 'anker soundcore', 'sonos one', 'marshall emberton', 'teufel kopfhoerer']
      },
      {
        key: 'pc-peripherals-brands',
        label: 'PC Peripherals (Branded)',
        description: 'Brand-name keyboards, mice, docks, and storage with model identifiers.',
        seedQueries: ['logitech mx master', 'keychron mechanical keyboard', 'elgato stream deck', 'samsung t7 ssd', 'sandisk extreme ssd', 'razer deathadder', 'logitech mx keys', 'caldigit dock']
      },
      {
        key: 'power-tools-brands',
        label: 'Power Tools (Branded)',
        description: 'Brand-name cordless tools and kits whose model numbers map to a single ASIN.',
        seedQueries: ['dewalt cordless drill', 'makita impact driver', 'bosch professional gsr', 'einhell power x-change', 'metabo akkuschrauber', 'milwaukee m18', 'bosch akkuschrauber']
      },
      {
        key: 'smart-home-brands',
        label: 'Smart Home (Branded)',
        description: 'Brand-name smart-home hardware with clear product models.',
        seedQueries: ['philips hue starter', 'tp-link tapo camera', 'aqara sensor', 'eufy robovac', 'tado thermostat', 'ring video doorbell', 'netatmo wetterstation']
      }
    ]
  },
  {
    key: 'custom',
    label: 'Custom eBay Discovery',
    description: 'Use your own sold-listing keywords with the same safety and score gates.',
    defaultLimit: 20,
    compareLimit: 8,
    minEbayScore: 45,
    minSoldPrice: 10,
    maxSoldPrice: 300,
    categories: [
      {
        key: 'custom',
        label: 'Custom',
        description: 'Custom sold-listing search terms.',
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

export function getEbayDiscoveryProfile(key?: string): EbayDiscoveryProfile {
  return ebayDiscoveryProfiles.find((profile) => profile.key === key) ?? ebayDiscoveryProfiles[0];
}

export function getEbayDiscoveryCategory(profile: EbayDiscoveryProfile, key?: string): EbayDiscoveryCategory {
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

const rawText = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value).slice(0, 4000);
  } catch {
    return '';
  }
};

const effectiveAmazonCostLimit = (policy: SafetyPolicy, ebaySoldPrice?: number): number => {
  if (!ebaySoldPrice || ebaySoldPrice <= 0) return policy.maxAmazonCostUsd;
  const priceBackedLimit = ebaySoldPrice * 0.65;
  const capitalGuardrail = Math.max(policy.maxAmazonCostUsd, policy.maxAmazonCostUsd * 1.8);
  return Math.min(Math.max(policy.maxAmazonCostUsd, priceBackedLimit), capitalGuardrail);
};

const availabilityRisk = (status: string | undefined): { flag?: string; reason?: string } => {
  if (!status || status === 'IN_STOCK') return {};
  const normalized = status.toLowerCase().replace(/[_-]+/g, ' ');
  if (/\bout\b|\bunavailable\b|\bnot available\b|\bcurrently unavailable\b|\bsold out\b/.test(normalized)) {
    return { flag: 'AMAZON_OUT_OF_STOCK', reason: 'Amazon source appears out of stock.' };
  }
  return { flag: 'AMAZON_STOCK_UNKNOWN', reason: 'Amazon stock status is not confirmed as in stock.' };
};

const listingEvidenceText = (ebay: EbayCandidateInput): string => [
  ebay.title,
  ebay.condition,
  ebay.category,
  rawText(ebay.raw)
].filter(Boolean).join(' ').toLowerCase();

export function ebayFixedNewListingRisks(ebay: EbayCandidateInput): { riskFlags: string[]; reasons: string[] } {
  const text = listingEvidenceText(ebay);
  const condition = ebay.condition?.toLowerCase() ?? '';
  const riskFlags: string[] = [];
  const reasons: string[] = [];
  const notNewPatterns = [
    /\bused\b/,
    /\bpre[- ]?owned\b/,
    /\bopen[- ]?box\b/,
    /\bnew other\b/,
    /\blike new\b/,
    /\brefurbished\b/,
    /\brenewed\b/,
    /\bfor parts\b/,
    /\bnot working\b/,
    /\bgebraucht\b/,
    /\bneuwertig\b/,
    /\bgeneral[üu ]?berholt\b/,
    /\bdefekt\b/,
    /\bersatzteile\b/
  ];
  const auctionPatterns = [
    /\bauction\b/,
    /\bbid\b/,
    /\bbids\b/,
    /\bcurrent bid\b/,
    /\bauktion\b/,
    /\bgebot\b/,
    /\bgebote\b/
  ];

  if (condition && notNewPatterns.some((pattern) => pattern.test(condition))) {
    riskFlags.push('EBAY_NOT_NEW');
    reasons.push('eBay listing condition is not new.');
  } else if (!condition && notNewPatterns.some((pattern) => pattern.test(text))) {
    riskFlags.push('EBAY_NOT_NEW');
    reasons.push('eBay listing text indicates used, open-box, refurbished, or parts condition.');
  }

  if (auctionPatterns.some((pattern) => pattern.test(text))) {
    riskFlags.push('EBAY_AUCTION_FORMAT');
    reasons.push('eBay listing appears to be an auction or bidding listing.');
  }

  return { riskFlags, reasons };
}

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

  if (amazonCost !== undefined && amazonCost > policy.maxAmazonCostUsd) {
    const effectiveLimit = effectiveAmazonCostLimit(policy, ebay.soldPrice);
    if (amazonCost <= effectiveLimit) {
      riskFlags.push('AMAZON_COST_ABOVE_PROFILE');
      reasons.push(`Amazon cost ${amazonCost.toFixed(2)} is above the profile max ${policy.maxAmazonCostUsd.toFixed(2)}, but within the sold-price-backed review limit ${effectiveLimit.toFixed(2)}.`);
    } else {
      riskFlags.push('AMAZON_COST_TOO_HIGH');
      reasons.push(`Amazon cost ${amazonCost.toFixed(2)} is above max ${effectiveLimit.toFixed(2)}.`);
    }
  }

  if (!amazonCost) {
    riskFlags.push('MISSING_AMAZON_PRICE');
    reasons.push('Missing Amazon price.');
  }

  if (!ebay.soldPrice) {
    riskFlags.push('MISSING_EBAY_PRICE');
    reasons.push('Missing eBay sold price.');
  }

  const availability = availabilityRisk(amazon.availabilityStatus);
  if (availability.flag) {
    riskFlags.push(availability.flag);
    if (availability.reason) reasons.push(availability.reason);
  }

  const ebayListingRisks = ebayFixedNewListingRisks(ebay);
  riskFlags.push(...ebayListingRisks.riskFlags);
  reasons.push(...ebayListingRisks.reasons);

  const hardReject = hardSafetyRejectFlags(riskFlags).length > 0;
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

  if (amazonCost !== undefined && amazonCost > policy.maxAmazonCostUsd) {
    riskFlags.push('AMAZON_COST_TOO_HIGH');
    reasons.push(`Amazon cost ${amazonCost.toFixed(2)} is above max ${policy.maxAmazonCostUsd.toFixed(2)}.`);
  }

  if (!amazonCost) {
    riskFlags.push('MISSING_AMAZON_PRICE');
    reasons.push('Missing Amazon price.');
  }

  const availability = availabilityRisk(amazon.availabilityStatus);
  if (availability.flag) {
    riskFlags.push(availability.flag);
    if (availability.reason) reasons.push(availability.reason);
  }

  const hardReject = hardSafetyRejectFlags(riskFlags).length > 0;
  const status = hardReject ? 'REJECT' : riskFlags.length > 0 ? 'WARN' : 'PASS';

  return { status, riskFlags, reasons };
}
