import type { PrismaClient } from '@prisma/client';
import { conflict } from '../security/httpErrors.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

// Stable advisory-lock key so every daily-spend transaction serializes against the others.
const DAILY_PURCHASE_LOCK_KEY = 4071780001;

/**
 * Take a transaction-scoped Postgres advisory lock for the daily spend budget. It is
 * released automatically at commit/rollback, forcing concurrent budget-counting
 * transactions to run one at a time so the check-then-act can't be raced.
 */
export async function lockDailyPurchaseBudget(tx: PrismaClient): Promise<void> {
  // $executeRawUnsafe exists at runtime; cast around the reduced PrismaClient view that
  // tsc resolves under NodeNext module resolution. The key is a constant (no injection).
  const raw = tx as unknown as { $executeRawUnsafe(query: string): Promise<number> };
  await raw.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${DAILY_PURCHASE_LOCK_KEY})`);
}

/**
 * Enforce the configured per-day listing cap by counting eBay listings actually
 * created today. Call inside the same transaction that creates the listing so the
 * check-then-act is atomic against concurrent executions.
 */
export async function enforceDailyListingLimit(db: PrismaClient): Promise<void> {
  const config = await getActiveRuleConfig(db);
  const listedToday = await db.ebayListing.count({
    where: { createdAt: { gte: startOfUtcDay() } }
  });
  if (listedToday >= config.maxDailyListings) {
    throw conflict(`Daily listing limit reached (${listedToday}/${config.maxDailyListings}).`, 'DAILY_LISTING_LIMIT_REACHED');
  }
}

/**
 * Enforce the configured per-day Amazon spend cap. Sums today's non-cancelled
 * purchase prices and rejects if adding `purchaseAmount` would exceed the cap.
 * Call inside a Serializable transaction that also writes the purchase row.
 */
export async function enforceDailyPurchaseLimit(db: PrismaClient, purchaseAmount: number): Promise<void> {
  const config = await getActiveRuleConfig(db);
  const purchases = await db.amazonPurchase.findMany({
    where: {
      createdAt: { gte: startOfUtcDay() },
      status: { notIn: ['CANCELLED', 'ERROR'] }
    },
    select: { purchasePrice: true }
  });
  const spentToday = purchases.reduce(
    (sum: number, purchase: { purchasePrice: unknown }) => sum + (numberValue(purchase.purchasePrice) ?? 0),
    0
  );
  if (spentToday + purchaseAmount > config.maxDailyPurchaseAmountUsd) {
    throw conflict(
      `Daily purchase limit would be exceeded (${(spentToday + purchaseAmount).toFixed(2)}/${config.maxDailyPurchaseAmountUsd.toFixed(2)}).`,
      'DAILY_PURCHASE_LIMIT_REACHED'
    );
  }
}
