ALTER TABLE "ProductCandidate"
  ADD COLUMN "evidenceJson" JSONB,
  ADD COLUMN "marketMetricsJson" JSONB;

ALTER TABLE "AmazonMatch"
  ADD COLUMN "evidenceJson" JSONB;

ALTER TABLE "ProfitSnapshot"
  ADD COLUMN "sourceShippingCost" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "packagingCost" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "paymentFixedFee" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "returnReserve" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "cancellationReserve" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "marketplaceRiskBuffer" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "totalLandedCost" DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

UPDATE "ProfitSnapshot"
SET "totalLandedCost" = "amazonCost" + "estimatedTax" + "bufferAmount";

ALTER TABLE "RuleConfig"
  ADD COLUMN "sourceShippingCost" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "packagingCost" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "paymentFixedFee" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "defaultPromotedListingFeeRate" DECIMAL(5, 4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN "returnReserveRate" DECIMAL(5, 4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN "cancellationReserveRate" DECIMAL(5, 4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN "marketplaceRiskBuffer" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "minimumSellThroughRate" DECIMAL(7, 4) NOT NULL DEFAULT 0.0500,
  ADD COLUMN "maximumCompetitionRatio" DECIMAL(7, 3) NOT NULL DEFAULT 12.000;
