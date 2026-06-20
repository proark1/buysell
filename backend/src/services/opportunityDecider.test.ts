import { decideOpportunity } from './opportunityDecider.js';
import { assertEqual, assertIncludes } from './testHelpers.js';

const listDecision = decideOpportunity(
  { title: 'Acme Wireless Barcode Scanner', soldPrice: 79.99 },
  { asin: 'B000TEST', title: 'Acme Wireless Barcode Scanner', currentPrice: 39.99, availabilityStatus: 'IN_STOCK', matchConfidence: 0.9 },
  { estimatedFees: 12, estimatedTax: 3.2, bufferAmount: 4, expectedProfit: 20.8, roiPercent: 48, marginPercent: 26 }
);

assertEqual(listDecision.decision, 'LIST', 'profitable opportunity decision');

// Weak match (0.4 < 0.55 floor) AND a negative spread (loss): both gates fire under breakeven.
// A small positive profit would now pass the profit gate by design — only an actual loss trips it.
const rejectDecision = decideOpportunity(
  { title: 'Acme Wireless Barcode Scanner', soldPrice: 49.99 },
  { asin: 'B000TEST', title: 'Acme Wireless Barcode Scanner', currentPrice: 39.99, availabilityStatus: 'IN_STOCK', matchConfidence: 0.4 },
  { estimatedFees: 8, estimatedTax: 3.2, bufferAmount: 4, expectedProfit: -5, roiPercent: -12, marginPercent: -10 }
);

assertEqual(rejectDecision.decision, 'REJECT', 'weak opportunity decision');
assertIncludes(rejectDecision.riskFlags, 'LOW_MATCH_CONFIDENCE', 'weak opportunity risk flags');
assertIncludes(rejectDecision.riskFlags, 'LOW_PROFIT', 'weak opportunity risk flags');

console.log('opportunityDecider unit test passed');
