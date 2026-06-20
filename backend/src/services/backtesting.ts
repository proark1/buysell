import type { PrismaClient } from '@prisma/client';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';

const numberValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    const n = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface BacktestSample {
  score: number;
  realizedNet: number;
}

interface ThresholdRow {
  threshold: number;
  accepted: number;
  profitable: number;
  precision: number;
  totalRealizedNet: number;
}

/**
 * Backtest the opportunity-score gate against realized outcomes: join product candidates'
 * stored opportunityScore to the realized net profit recorded in the ledger, then report,
 * for each candidate score threshold, how many accepted candidates actually turned a profit
 * and the total realized net. Suggests the threshold that maximizes realized profit.
 */
export async function runScoreBacktest(db: PrismaClient): Promise<unknown> {
  const config = await getActiveRuleConfig(db);

  const ledger = await db.profitLedgerEntry.findMany({
    where: { productCandidateId: { not: null } },
    select: { productCandidateId: true, netProfit: true }
  });
  if (ledger.length === 0) {
    return { sampleSize: 0, message: 'No realized profit-ledger entries yet; sell-through data is required to backtest.', currentThreshold: config.minimumOpportunityScore };
  }

  const realizedByCandidate = new Map<string, number>();
  for (const row of ledger) {
    if (!row.productCandidateId) continue;
    realizedByCandidate.set(row.productCandidateId, (realizedByCandidate.get(row.productCandidateId) ?? 0) + numberValue(row.netProfit));
  }

  const candidates = await db.productCandidate.findMany({
    where: { id: { in: [...realizedByCandidate.keys()] }, opportunityScore: { not: null } },
    select: { id: true, opportunityScore: true }
  });

  const samples: BacktestSample[] = (candidates as Array<{ id: string; opportunityScore: number | null }>)
    .filter((candidate) => candidate.opportunityScore !== null)
    .map((candidate) => ({ score: candidate.opportunityScore as number, realizedNet: realizedByCandidate.get(candidate.id) ?? 0 }));

  if (samples.length === 0) {
    return { sampleSize: 0, message: 'Realized entries exist but their candidates have no opportunity score to backtest against.', currentThreshold: config.minimumOpportunityScore };
  }

  const byThreshold: ThresholdRow[] = [];
  for (let threshold = 0; threshold <= 95; threshold += 5) {
    const accepted = samples.filter((sample) => sample.score >= threshold);
    const profitable = accepted.filter((sample) => sample.realizedNet > 0).length;
    const totalRealizedNet = accepted.reduce((sum, sample) => sum + sample.realizedNet, 0);
    byThreshold.push({
      threshold,
      accepted: accepted.length,
      profitable,
      precision: accepted.length ? Math.round((profitable / accepted.length) * 1000) / 1000 : 0,
      totalRealizedNet: Math.round(totalRealizedNet * 100) / 100
    });
  }

  // Suggest the threshold that maximizes total realized net while keeping at least a small sample.
  const viable = byThreshold.filter((row) => row.accepted >= Math.max(3, Math.ceil(samples.length * 0.1)));
  const bestByProfit = (viable.length ? viable : byThreshold).reduce((best, row) => (row.totalRealizedNet > best.totalRealizedNet ? row : best));

  return {
    sampleSize: samples.length,
    currentThreshold: config.minimumOpportunityScore,
    suggestedThreshold: bestByProfit.threshold,
    suggestedThresholdRealizedNet: bestByProfit.totalRealizedNet,
    note: 'Suggestion maximizes total realized net profit across the backtest sample; treat as directional until the sample is large.',
    byThreshold
  };
}
