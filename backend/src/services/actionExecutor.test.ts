import { executeAction } from './actionExecutor.js';
import { assertEqual } from './testHelpers.js';

type AnyRecord = Record<string, unknown>;

const errorCode = (error: unknown): string | undefined =>
  error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : undefined;

async function expectThrow(fn: () => Promise<unknown>, code: string, message: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assertEqual(errorCode(error), code, message);
    return;
  }
  throw new Error(`${message}: expected throw with code ${code}, but it resolved`);
}

// --- Safe mode blocks irreversible BUY before any claim or external call ---
{
  const db = {
    actionItem: {
      findUnique: async () => ({ id: 'a1', type: 'BUY', status: 'APPROVED', orderId: 'o1', payloadJson: { asin: 'B1', maxPrice: 10 } })
    },
    ruleConfig: { findFirst: async () => ({ active: true, safeMode: true }) }
  };
  await expectThrow(() => executeAction(db as never, 'a1'), 'SAFE_MODE_ACTION_BLOCKED', 'safe mode blocks BUY execution');
}

// --- Atomic claim: a non-APPROVED (already-claimed) action is rejected ---
{
  let claimWhere: AnyRecord | undefined;
  const db = {
    actionItem: {
      findUnique: async () => ({ id: 'a2', type: 'REVIEW', status: 'APPROVED', payloadJson: {} }),
      updateMany: async ({ where }: { where: AnyRecord }) => { claimWhere = where; return { count: 0 }; }
    },
    ruleConfig: { findFirst: async () => ({ active: true, safeMode: false }) }
  };
  await expectThrow(() => executeAction(db as never, 'a2'), 'ACTION_NOT_APPROVED', 'lost claim (count 0) rejects execution');
  assertEqual(claimWhere?.status, 'APPROVED', 'claim filters on APPROVED status');
}

// --- Successful claim path runs the action body once ---
{
  let claimed = false;
  let completedStatus: string | undefined;
  const tx = {
    actionItem: { update: async ({ data }: { data: AnyRecord }) => { completedStatus = String(data.status); return {}; } },
    auditLog: { create: async () => ({}) }
  };
  const db = {
    actionItem: {
      findUnique: async () => ({ id: 'a3', type: 'REVIEW', status: 'APPROVED', reason: 'review me', payloadJson: {} }),
      updateMany: async () => { claimed = true; return { count: 1 }; }
    },
    ruleConfig: { findFirst: async () => ({ active: true, safeMode: false }) },
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx)
  };
  await executeAction(db as never, 'a3');
  assertEqual(claimed, true, 'approved action is atomically claimed');
  assertEqual(completedStatus, 'COMPLETED', 'claimed REVIEW action completes');
}

console.log('actionExecutor unit test passed');
