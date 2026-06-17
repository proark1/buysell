import { createActionForDecision } from './actionRepository.js';
import { assertEqual } from '../services/testHelpers.js';

let createdAction: Record<string, unknown> | undefined;
let createdVerification: Record<string, unknown> | undefined;

const tx = {
  productCandidate: {
    findUnique: async () => ({
      id: 'candidate-1',
      ebaySoldPrice: { toNumber: () => 99.99 },
      ebayUrl: 'https://www.ebay.de/itm/123'
    })
  },
  amazonMatch: {
    findUnique: async () => ({
      id: 'match-1',
      brand: 'Acme',
      buyBoxPrice: { toNumber: () => 49.99 },
      currentPrice: { toNumber: () => 55.99 },
      amazonUrl: 'https://www.amazon.de/dp/B000SCAN'
    })
  },
  actionItem: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdAction = data;
      return { id: 'verify-action-1' };
    }
  },
  priceVerification: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdVerification = data;
      return { id: 'verification-1' };
    }
  }
};

const db = {
  $transaction: async <T>(fn: (transaction: typeof tx) => Promise<T>) => fn(tx)
};

const actionId = await createActionForDecision(db as never, {
  productCandidateId: 'candidate-1',
  amazonMatchId: 'match-1',
  decision: {
    decision: 'LIST',
    confidence: 0.93,
    riskFlags: [],
    reasoningSummary: 'Profitable exact match.',
    recommendedPrice: 89.99,
    recommendedTitle: 'Acme scanner',
    recommendedDescription: 'New Acme scanner.'
  }
});

assertEqual(actionId, 'verify-action-1', 'LIST decision action id');
assertEqual(createdAction?.type, 'VERIFY', 'LIST decision creates VERIFY action');
assertEqual((createdAction?.payloadJson as Record<string, unknown>).pendingActionType, 'LIST', 'VERIFY action records pending LIST');
assertEqual((createdAction?.payloadJson as Record<string, unknown>).expectedBuyingFormat, 'BIN', 'VERIFY action requires fixed price');
assertEqual(createdVerification?.status, 'PENDING', 'verification starts pending');
assertEqual(createdVerification?.expectedCondition, 'NEW', 'verification requires new condition');
assertEqual(createdVerification?.expectedBuyingFormat, 'BIN', 'verification requires fixed price');

console.log('actionRepository unit test passed');
