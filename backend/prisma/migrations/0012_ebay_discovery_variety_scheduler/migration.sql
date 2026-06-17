-- Add eBay discovery product-family dedupe metadata and scheduler settings.

ALTER TABLE "RuleConfig"
  ADD COLUMN "ebayDiscoveryAutoRunEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ebayDiscoveryAutoRunIntervalMinutes" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "ebayDiscoveryAutoRunLimit" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "EbayDiscoveryCandidate"
  ADD COLUMN "productFamilyKey" TEXT,
  ADD COLUMN "sourceQuery" TEXT,
  ADD COLUMN "familySoldCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "familyMinSoldPrice" DECIMAL(10,2),
  ADD COLUMN "familyMedianSoldPrice" DECIMAL(10,2),
  ADD COLUMN "familyMaxSoldPrice" DECIMAL(10,2);

CREATE INDEX "EbayDiscoveryCandidate_productFamilyKey_idx" ON "EbayDiscoveryCandidate"("productFamilyKey");
