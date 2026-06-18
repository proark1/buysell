-- Persist eBay-to-Amazon comparison scheduler/manual job history.

CREATE TABLE "EbayAmazonComparisonRun" (
  "id" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'AUTO',
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "selectedCount" INTEGER NOT NULL DEFAULT 0,
  "comparedCount" INTEGER NOT NULL DEFAULT 0,
  "opportunityCount" INTEGER NOT NULL DEFAULT 0,
  "manualReviewCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "keepaTokensLeft" INTEGER,
  "keepaRetryAfterSeconds" INTEGER,
  "keepaRequestedTokens" INTEGER,
  "selectedCandidates" JSONB,
  "reason" TEXT,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "EbayAmazonComparisonRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EbayAmazonComparisonRun_status_startedAt_idx" ON "EbayAmazonComparisonRun"("status", "startedAt");
CREATE INDEX "EbayAmazonComparisonRun_mode_startedAt_idx" ON "EbayAmazonComparisonRun"("mode", "startedAt");
