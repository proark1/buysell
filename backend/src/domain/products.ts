export interface EbayCandidateInput {
  title: string;
  url?: string;
  soldPrice?: number;
  shippingPrice?: number;
  condition?: string;
  category?: string;
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
    expectedProfit: number;
    roiPercent: number;
    marginPercent: number;
  };
  decision: OpportunityDecision;
  score?: {
    total: number;
    profit: number;
    roi: number;
    demand: number;
    priceSignal: number;
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

export interface OpportunityDecision {
  decision: 'LIST' | 'REPRICE' | 'PAUSE' | 'REJECT' | 'MANUAL_REVIEW';
  confidence: number;
  riskFlags: string[];
  reasoningSummary: string;
  recommendedPrice?: number;
  recommendedTitle?: string;
  recommendedDescription?: string;
}
