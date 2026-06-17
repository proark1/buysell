-- Add guided discovery metadata, safety defaults, and scan history.

ALTER TABLE "ProductCandidate" ADD COLUMN "discoveryRunId" TEXT;
ALTER TABLE "ProductCandidate" ADD COLUMN "discoveryProfile" TEXT;
ALTER TABLE "ProductCandidate" ADD COLUMN "opportunityScore" INTEGER;
ALTER TABLE "ProductCandidate" ADD COLUMN "safetyStatus" TEXT;
ALTER TABLE "ProductCandidate" ADD COLUMN "riskFlags" JSONB;
ALTER TABLE "ProductCandidate" ADD COLUMN "scoreBreakdown" JSONB;

ALTER TABLE "AmazonMatch" ADD COLUMN "avg90Price" DECIMAL(10,2);
ALTER TABLE "AmazonMatch" ADD COLUMN "priceDropPercent" DECIMAL(7,3);

ALTER TABLE "RuleConfig" ADD COLUMN "safeMode" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RuleConfig" ADD COLUMN "maxAmazonCostUsd" DECIMAL(10,2) NOT NULL DEFAULT 150.00;
ALTER TABLE "RuleConfig" ADD COLUMN "minimumOpportunityScore" INTEGER NOT NULL DEFAULT 65;
ALTER TABLE "RuleConfig" ADD COLUMN "blockedKeywords" JSONB;
ALTER TABLE "RuleConfig" ADD COLUMN "allowedCategories" JSONB;

CREATE TABLE "DiscoveryScanRun" (
  "id" TEXT NOT NULL,
  "profileKey" TEXT NOT NULL,
  "query" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "filtersJson" JSONB,
  "scannedCount" INTEGER NOT NULL DEFAULT 0,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "DiscoveryScanRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductCandidate_discoveryRunId_idx" ON "ProductCandidate"("discoveryRunId");
CREATE INDEX "ProductCandidate_opportunityScore_idx" ON "ProductCandidate"("opportunityScore");
CREATE INDEX "DiscoveryScanRun_profileKey_startedAt_idx" ON "DiscoveryScanRun"("profileKey", "startedAt");
CREATE INDEX "DiscoveryScanRun_status_idx" ON "DiscoveryScanRun"("status");

ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_discoveryRunId_fkey" FOREIGN KEY ("discoveryRunId") REFERENCES "DiscoveryScanRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
