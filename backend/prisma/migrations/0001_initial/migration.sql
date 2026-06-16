-- Initial Buysell schema for Railway Postgres.

CREATE TYPE "AiDecisionType" AS ENUM ('LIST', 'REPRICE', 'PAUSE', 'REJECT', 'MANUAL_REVIEW');
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'ERROR');
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'VALIDATING', 'READY_FOR_PURCHASE', 'MANUAL_REVIEW', 'PURCHASED', 'SHIPPED', 'CANCELLED', 'ERROR');
CREATE TYPE "ActionType" AS ENUM ('LIST', 'REPRICE', 'PAUSE', 'BUY', 'REVIEW');
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'ERROR');

CREATE TABLE "ProductCandidate" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'serpapi',
  "ebayTitle" TEXT NOT NULL,
  "ebayUrl" TEXT,
  "ebaySoldPrice" DECIMAL(10,2),
  "ebayShippingPrice" DECIMAL(10,2),
  "ebayCondition" TEXT,
  "ebayCategory" TEXT,
  "rawSerpapiJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AmazonMatch" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT NOT NULL,
  "asin" TEXT NOT NULL,
  "amazonTitle" TEXT NOT NULL,
  "amazonUrl" TEXT,
  "brand" TEXT,
  "model" TEXT,
  "upc" TEXT,
  "currentPrice" DECIMAL(10,2),
  "buyBoxPrice" DECIMAL(10,2),
  "availabilityStatus" TEXT,
  "salesRank" INTEGER,
  "rating" DECIMAL(3,2),
  "reviewCount" INTEGER,
  "rawKeepaJson" JSONB,
  "matchConfidence" DECIMAL(4,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmazonMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfitSnapshot" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT NOT NULL,
  "amazonMatchId" TEXT NOT NULL,
  "estimatedEbaySalePrice" DECIMAL(10,2) NOT NULL,
  "amazonCost" DECIMAL(10,2) NOT NULL,
  "estimatedFees" DECIMAL(10,2) NOT NULL,
  "estimatedTax" DECIMAL(10,2) NOT NULL,
  "bufferAmount" DECIMAL(10,2) NOT NULL,
  "expectedProfit" DECIMAL(10,2) NOT NULL,
  "roiPercent" DECIMAL(7,3) NOT NULL,
  "marginPercent" DECIMAL(7,3) NOT NULL,
  "calculationVersion" TEXT NOT NULL DEFAULT 'v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfitSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiDecision" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT NOT NULL,
  "amazonMatchId" TEXT,
  "decision" "AiDecisionType" NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL,
  "reasoningSummary" TEXT NOT NULL,
  "riskFlags" JSONB,
  "recommendedEbayTitle" TEXT,
  "recommendedEbayDescription" TEXT,
  "recommendedPrice" DECIMAL(10,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EbayListing" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT NOT NULL,
  "amazonMatchId" TEXT NOT NULL,
  "ebayItemId" TEXT,
  "listingStatus" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
  "listedPrice" DECIMAL(10,2) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "shippingPolicyId" TEXT,
  "returnPolicyId" TEXT,
  "paymentPolicyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EbayListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "ebayOrderId" TEXT NOT NULL,
  "ebayListingId" TEXT NOT NULL,
  "buyerName" TEXT,
  "buyerShippingAddressEncrypted" TEXT,
  "salePrice" DECIMAL(10,2) NOT NULL,
  "orderStatus" "OrderStatus" NOT NULL DEFAULT 'NEW',
  "fulfillmentStatus" TEXT,
  "amazonOrderStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AmazonPurchase" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "asin" TEXT NOT NULL,
  "amazonOrderId" TEXT,
  "purchasePrice" DECIMAL(10,2),
  "trackingNumber" TEXT,
  "carrier" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmazonPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionItem" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT,
  "amazonMatchId" TEXT,
  "orderId" TEXT,
  "type" "ActionType" NOT NULL,
  "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "reason" TEXT NOT NULL,
  "payloadJson" JSONB,
  "createdBy" TEXT NOT NULL DEFAULT 'system',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuleConfig" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "minimumProfitUsd" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  "minimumRoiPercent" DECIMAL(7,3) NOT NULL DEFAULT 25.000,
  "minimumMatchConfidence" DECIMAL(4,3) NOT NULL DEFAULT 0.750,
  "estimatedSalesTaxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.080,
  "returnRiskBuffer" DECIMAL(10,2) NOT NULL DEFAULT 2.00,
  "priceChangeBuffer" DECIMAL(10,2) NOT NULL DEFAULT 2.00,
  "maxDailyListings" INTEGER NOT NULL DEFAULT 10,
  "maxDailyPurchaseAmountUsd" DECIMAL(10,2) NOT NULL DEFAULT 250.00,
  "blockedBrands" JSONB,
  "blockedCategories" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuleConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EbayListing_ebayItemId_key" ON "EbayListing"("ebayItemId");
CREATE UNIQUE INDEX "Order_ebayOrderId_key" ON "Order"("ebayOrderId");
CREATE UNIQUE INDEX "RuleConfig_name_key" ON "RuleConfig"("name");
CREATE INDEX "AmazonMatch_asin_idx" ON "AmazonMatch"("asin");
CREATE INDEX "AmazonMatch_productCandidateId_idx" ON "AmazonMatch"("productCandidateId");
CREATE INDEX "ProfitSnapshot_productCandidateId_idx" ON "ProfitSnapshot"("productCandidateId");
CREATE INDEX "ProfitSnapshot_amazonMatchId_idx" ON "ProfitSnapshot"("amazonMatchId");
CREATE INDEX "AiDecision_productCandidateId_idx" ON "AiDecision"("productCandidateId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "ActionItem_status_type_idx" ON "ActionItem"("status", "type");
CREATE INDEX "ActionItem_productCandidateId_idx" ON "ActionItem"("productCandidateId");
CREATE INDEX "ActionItem_orderId_idx" ON "ActionItem"("orderId");

ALTER TABLE "AmazonMatch" ADD CONSTRAINT "AmazonMatch_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfitSnapshot" ADD CONSTRAINT "ProfitSnapshot_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfitSnapshot" ADD CONSTRAINT "ProfitSnapshot_amazonMatchId_fkey" FOREIGN KEY ("amazonMatchId") REFERENCES "AmazonMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiDecision" ADD CONSTRAINT "AiDecision_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiDecision" ADD CONSTRAINT "AiDecision_amazonMatchId_fkey" FOREIGN KEY ("amazonMatchId") REFERENCES "AmazonMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EbayListing" ADD CONSTRAINT "EbayListing_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EbayListing" ADD CONSTRAINT "EbayListing_amazonMatchId_fkey" FOREIGN KEY ("amazonMatchId") REFERENCES "AmazonMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_ebayListingId_fkey" FOREIGN KEY ("ebayListingId") REFERENCES "EbayListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmazonPurchase" ADD CONSTRAINT "AmazonPurchase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_amazonMatchId_fkey" FOREIGN KEY ("amazonMatchId") REFERENCES "AmazonMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
