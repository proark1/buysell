import { submitPriceVerificationResult } from './priceVerification.js';
import { assertEqual } from './testHelpers.js';

type Write = {
  table: string;
  action: string;
  data?: Record<string, unknown>;
};

function dbForVerification(): { db: unknown; writes: Write[]; transactionUsed: () => boolean } {
  const writes: Write[] = [];
  let usedTransaction = false;
  const action = {
    id: 'verify-action-1',
    type: 'VERIFY',
    reason: 'Verification required.',
    productCandidateId: 'candidate-1',
    amazonMatchId: 'match-1',
    payloadJson: { expectedBrand: 'Acme' },
    productCandidate: { ebaySoldPrice: undefined },
    amazonMatch: { brand: 'Acme', buyBoxPrice: undefined, currentPrice: undefined },
    priceVerification: {
      id: 'verification-1',
      expectedAmazonPrice: undefined,
      expectedEbayPrice: undefined,
      expectedBrand: 'Acme',
      listingActionItemId: undefined
    }
  };
  const tx = {
    actionItem: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ table: 'actionItem', action: 'create', data });
        return { id: 'review-action-1', ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ table: 'actionItem', action: 'update', data });
        return { id: action.id, ...data };
      }
    },
    priceVerification: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ table: 'priceVerification', action: 'update', data });
        return { id: 'verification-1', ...data };
      }
    },
    automationRun: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ table: 'automationRun', action: 'updateMany', data });
        return { count: 1 };
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ table: 'auditLog', action: 'create', data });
        return { id: 'audit-1', ...data };
      }
    }
  };
  const db = {
    actionItem: {
      findUnique: async () => action
    },
    $transaction: async <T>(fn: (transaction: typeof tx) => Promise<T>) => {
      usedTransaction = true;
      return fn(tx);
    }
  };
  return { db, writes, transactionUsed: () => usedTransaction };
}

{
  const { db, writes, transactionUsed } = dbForVerification();
  const result = await submitPriceVerificationResult(db as never, 'verify-action-1', {
    status: 'MANUAL_REVIEW',
    checkedBy: 'unit-test'
  });

  assertEqual(result.status, 'MANUAL_REVIEW', 'manual review result status');
  assertEqual(transactionUsed(), true, 'manual review writes use a transaction');
  assertEqual(writes.some((write) => write.table === 'actionItem' && write.action === 'create'), true, 'manual review creates review action');
  assertEqual(writes.some((write) => write.table === 'priceVerification' && write.action === 'update'), true, 'manual review updates verification');
  assertEqual(writes.some((write) => write.table === 'automationRun' && write.action === 'updateMany'), true, 'manual review closes automation runs');
  assertEqual(writes.some((write) => write.table === 'auditLog' && write.action === 'create'), true, 'manual review writes audit log');
}

{
  const { db, writes, transactionUsed } = dbForVerification();
  const result = await submitPriceVerificationResult(db as never, 'verify-action-1', {
    status: 'FAILED',
    checkedBy: 'unit-test'
  });

  assertEqual(result.status, 'FAILED', 'failed result status');
  assertEqual(transactionUsed(), true, 'failed verification writes use a transaction');
  assertEqual(writes.some((write) => write.table === 'actionItem' && write.action === 'update' && write.data?.status === 'REJECTED'), true, 'failed verification rejects action');
  assertEqual(writes.some((write) => write.table === 'priceVerification' && write.action === 'update' && write.data?.status === 'FAILED'), true, 'failed verification updates verification');
  assertEqual(writes.some((write) => write.table === 'automationRun' && write.action === 'updateMany'), true, 'failed verification closes automation runs');
  assertEqual(writes.some((write) => write.table === 'auditLog' && write.action === 'create'), true, 'failed verification writes audit log');
}

console.log('priceVerification unit test passed');
