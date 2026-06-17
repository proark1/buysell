-- Add Amazon-first discovery runs and candidates.

ALTER TABLE "ProductCandidate" ADD COLUMN "amazonCandidateId" TEXT;

CREATE TABLE "AmazonDiscoveryRun" (
  "id" TEXT NOT NULL,
  "profileKey" TEXT NOT NULL,
  "categoryKey" TEXT,
  "query" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "filtersJson" JSONB,
  "scannedCount" INTEGER NOT NULL DEFAULT 0,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "comparedCount" INTEGER NOT NULL DEFAULT 0,
  "opportunityCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AmazonDiscoveryRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AmazonDiscoveryCandidate" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "asin" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "amazonUrl" TEXT,
  "brand" TEXT,
  "rootCategory" TEXT,
  "categoryTree" JSONB,
  "currentPrice" DECIMAL(10,2),
  "buyBoxPrice" DECIMAL(10,2),
  "avg90Price" DECIMAL(10,2),
  "priceDropPercent" DECIMAL(7,3),
  "availabilityStatus" TEXT,
  "salesRank" INTEGER,
  "rating" DECIMAL(3,2),
  "reviewCount" INTEGER,
  "amazonScore" INTEGER NOT NULL DEFAULT 0,
  "safetyStatus" TEXT,
  "riskFlags" JSONB,
  "scoreBreakdown" JSONB,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "comparisonStatus" TEXT NOT NULL DEFAULT 'NOT_COMPARED',
  "productCandidateId" TEXT,
  "amazonMatchId" TEXT,
  "rawKeepaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmazonDiscoveryCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductCandidate_amazonCandidateId_idx" ON "ProductCandidate"("amazonCandidateId");
CREATE INDEX "AmazonDiscoveryRun_profileKey_startedAt_idx" ON "AmazonDiscoveryRun"("profileKey", "startedAt");
CREATE INDEX "AmazonDiscoveryRun_status_idx" ON "AmazonDiscoveryRun"("status");
CREATE UNIQUE INDEX "AmazonDiscoveryCandidate_runId_asin_key" ON "AmazonDiscoveryCandidate"("runId", "asin");
CREATE INDEX "AmazonDiscoveryCandidate_runId_amazonScore_idx" ON "AmazonDiscoveryCandidate"("runId", "amazonScore");
CREATE INDEX "AmazonDiscoveryCandidate_asin_idx" ON "AmazonDiscoveryCandidate"("asin");
CREATE INDEX "AmazonDiscoveryCandidate_comparisonStatus_idx" ON "AmazonDiscoveryCandidate"("comparisonStatus");

ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_amazonCandidateId_fkey" FOREIGN KEY ("amazonCandidateId") REFERENCES "AmazonDiscoveryCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmazonDiscoveryCandidate" ADD CONSTRAINT "AmazonDiscoveryCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AmazonDiscoveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
