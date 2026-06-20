-- Hardening tail: revocable dashboard sessions + persisted landed-cost breakdown.

ALTER TABLE "ProfitSnapshot" ADD COLUMN IF NOT EXISTS "breakdownJson" JSONB;

CREATE TABLE IF NOT EXISTS "DashboardSession" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DashboardSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DashboardSession_expiresAt_idx" ON "DashboardSession"("expiresAt");
