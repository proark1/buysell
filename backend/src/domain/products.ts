export interface EbayCandidateInput {
  itemId?: string;
  title: string;
  url?: string;
  soldPrice?: number;
  shippingPrice?: number;
  condition?: string;
  category?: string;
  categoryId?: string;
  raw?: unknown;
}

export interface AmazonMatchInput {
  asin: string;
  title: string;
  url?: string;
  brand?: string;
  model?: string;
  upc?: string;
  currentPrice?: number;
  buyBoxPrice?: number;
  avg90Price?: number;
  priceDropPercent?: number;
  availabilityStatus?: string;
  salesRank?: number;
  rating?: number;
  reviewCount?: number;
  rootCategory?: string;
  categoryTree?: string[];
  matchConfidence: number;
  raw?: unknown;
}

export interface ProductOpportunity {
  ebay: EbayCandidateInput;
  amazon: AmazonMatchInput;
  profit: {
    estimatedFees: number;
    estimatedTax: number;
    bufferAmount: number;
    sourceShippingCost?: number;
    packagingCost?: number;
    paymentFixedFee?: number;
    returnReserve?: number;
    cancellationReserve?: number;
    marketplaceRiskBuffer?: number;
    totalSourceCost?: number;
    totalLandedCost?: number;
    expectedProfit: number;
    roiPercent: number;
    marginPercent: number;
  };
  identityMatch?: ProductIdentityMatch;
  evidence?: OpportunityEvidence;
  marketMetrics?: OpportunityMarketMetrics;
  decision: OpportunityDecision;
  score?: {
    total: number;
    profit: number;
    roi: number;
    demand: number;
    priceSignal: number;
    market?: number;
    match: number;
    riskPenalty: number;
    reasons: string[];
  };
  safety?: {
    status: 'PASS' | 'WARN' | 'REJECT';
    riskFlags: string[];
    reasons: string[];
  };
  discoveryProfile?: string;
}

export interface ProductIdentityMatch {
  status: 'EXACT' | 'STRONG' | 'REVIEW' | 'REJECT';
  confidence: number;
  evidence: string[];
  conflicts: string[];
  riskFlags: string[];
  normalized: {
    ebayBrand?: string;
    amazonBrand?: string;
    ebayModelTokens: string[];
    amazonModelTokens: string[];
    ebayIdentifiers: string[];
    amazonIdentifiers: string[];
  };
}

export interface OpportunityEvidenceItem {
  type: string;
  source: 'AMAZON' | 'EBAY' | 'SYSTEM' | 'VERIFIER';
  value: string;
  confidence: number;
  capturedAt: string;
}

export interface OpportunityEvidence {
  productIdentity: OpportunityEvidenceItem[];
  economics: OpportunityEvidenceItem[];
  market: OpportunityEvidenceItem[];
  safety: OpportunityEvidenceItem[];
}

export interface OpportunityMarketMetrics {
  soldSampleSize: number;
  activeSampleSize?: number;
  medianSoldPrice?: number;
  averageSoldPrice?: number;
  lowSoldPrice?: number;
  highSoldPrice?: number;
  priceSpreadPercent?: number;
  targetPricePercentile?: number;
  sellThroughRate?: number;
  competitionRatio?: number;
  demandScore: number;
  riskFlags: string[];
  reasons: string[];
}

export interface OpportunityDecision {
  decision: 'LIST' | 'REPRICE' | 'PAUSE' | 'REJECT' | 'MANUAL_REVIEW';
  confidence: number;
  riskFlags: string[];
  reasoningSummary: string;
  recommendedPrice?: number;
  recommendedTitle?: string;
  recommendedDescription?: string;
}
