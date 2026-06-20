import type { PrismaClient } from '@prisma/client';

export interface ApiUsageInput {
  provider: string;
  endpoint: string;
  tokensConsumed?: number;
  tokensLeft?: number;
  context?: string;
}

/**
 * Best-effort time-series record of metered-API usage (Keepa/SerpApi) so spend and burn
 * rate are observable. Never throws into the caller.
 */
// The generated PrismaClient type doesn't surface newly-added model delegates under this
// project's NodeNext resolution (see the ebayAmazonComparisonRun cast in dashboardApi.ts);
// the delegate exists at runtime, so cast to it.
type ApiUsageDelegate = {
  apiUsage: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
};

export async function recordApiUsage(db: PrismaClient, input: ApiUsageInput): Promise<void> {
  try {
    await (db as unknown as ApiUsageDelegate).apiUsage.create({
      data: {
        provider: input.provider,
        endpoint: input.endpoint,
        tokensConsumed: input.tokensConsumed ?? 0,
        tokensLeft: input.tokensLeft,
        context: input.context
      }
    });
  } catch {
    // Usage tracking must never break the operation it is measuring.
  }
}
