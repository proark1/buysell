-- Add a separate scheduler for comparing collected eBay products with Amazon.

ALTER TABLE "RuleConfig"
  ADD COLUMN "ebayAmazonCompareAutoRunEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ebayAmazonCompareAutoRunIntervalMinutes" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "ebayAmazonCompareAutoRunLimit" INTEGER NOT NULL DEFAULT 1;
