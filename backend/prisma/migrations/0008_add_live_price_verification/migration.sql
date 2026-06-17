ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'VERIFY';

CREATE TABLE "PriceVerification" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT NOT NULL,
  "amazonMatchId" TEXT,
  "actionItemId" TEXT,
  "listingActionItemId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "amazonUrl" TEXT,
  "ebayUrl" TEXT,
  "expectedAmazonPrice" DECIMAL(10,2),
  "observedAmazonPrice" DECIMAL(10,2),
  "expectedEbayPrice" DECIMAL(10,2),
  "observedEbayPrice" DECIMAL(10,2),
  "expectedBrand" TEXT,
  "observedAmazonBrand" TEXT,
  "observedEbayBrand" TEXT,
  "expectedCondition" TEXT NOT NULL DEFAULT 'NEW',
  "observedAmazonCondition" TEXT,
  "observedEbayCondition" TEXT,
  "expectedBuyingFormat" TEXT NOT NULL DEFAULT 'BIN',
  "observedBuyingFormat" TEXT,
  "evidenceJson" JSONB,
  "failureReasons" JSONB,
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceVerification_actionItemId_key" ON "PriceVerification"("actionItemId");
CREATE INDEX "PriceVerification_productCandidateId_idx" ON "PriceVerification"("productCandidateId");
CREATE INDEX "PriceVerification_amazonMatchId_idx" ON "PriceVerification"("amazonMatchId");
CREATE INDEX "PriceVerification_status_idx" ON "PriceVerification"("status");
CREATE INDEX "PriceVerification_listingActionItemId_idx" ON "PriceVerification"("listingActionItemId");

ALTER TABLE "PriceVerification" ADD CONSTRAINT "PriceVerification_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceVerification" ADD CONSTRAINT "PriceVerification_amazonMatchId_fkey" FOREIGN KEY ("amazonMatchId") REFERENCES "AmazonMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceVerification" ADD CONSTRAINT "PriceVerification_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
