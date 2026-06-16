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
  availabilityStatus?: string;
  salesRank?: number;
  rating?: number;
  reviewCount?: number;
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
