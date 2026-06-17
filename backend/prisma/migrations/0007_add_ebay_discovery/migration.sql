-- Add eBay-first discovery runs and candidates.

ALTER TABLE "ProductCandidate" ADD COLUMN "ebayCandidateId" TEXT;

CREATE TABLE "EbayDiscoveryRun" (
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
  CONSTRAINT "EbayDiscoveryRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EbayDiscoveryCandidate" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "ebayItemId" TEXT,
  "title" TEXT NOT NULL,
  "ebayUrl" TEXT,
  "soldPrice" DECIMAL(10,2),
  "shippingPrice" DECIMAL(10,2),
  "condition" TEXT,
  "category" TEXT,
  "categoryId" TEXT,
  "ebayScore" INTEGER NOT NULL DEFAULT 0,
  "safetyStatus" TEXT,
  "riskFlags" JSONB,
  "scoreBreakdown" JSONB,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "comparisonStatus" TEXT NOT NULL DEFAULT 'NOT_COMPARED',
  "productCandidateId" TEXT,
  "amazonMatchId" TEXT,
  "rawSerpapiJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EbayDiscoveryCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductCandidate_ebayCandidateId_idx" ON "ProductCandidate"("ebayCandidateId");
CREATE INDEX "EbayDiscoveryRun_profileKey_startedAt_idx" ON "EbayDiscoveryRun"("profileKey", "startedAt");
CREATE INDEX "EbayDiscoveryRun_status_idx" ON "EbayDiscoveryRun"("status");
CREATE INDEX "EbayDiscoveryCandidate_runId_ebayScore_idx" ON "EbayDiscoveryCandidate"("runId", "ebayScore");
CREATE INDEX "EbayDiscoveryCandidate_ebayItemId_idx" ON "EbayDiscoveryCandidate"("ebayItemId");
CREATE INDEX "EbayDiscoveryCandidate_comparisonStatus_idx" ON "EbayDiscoveryCandidate"("comparisonStatus");

ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_ebayCandidateId_fkey" FOREIGN KEY ("ebayCandidateId") REFERENCES "EbayDiscoveryCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EbayDiscoveryCandidate" ADD CONSTRAINT "EbayDiscoveryCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EbayDiscoveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
