-- Growth features: repricing engine, inventory sync, learning read-back, API usage tracking.

ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "repricingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "repriceMaxIncreasePercent" DECIMAL(5,4) NOT NULL DEFAULT 0.1500;
ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "inventorySyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "learningAdjustmentEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ApiUsage" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "tokensConsumed" INTEGER NOT NULL DEFAULT 0,
  "tokensLeft" INTEGER,
  "context" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ApiUsage_provider_createdAt_idx" ON "ApiUsage"("provider", "createdAt");
