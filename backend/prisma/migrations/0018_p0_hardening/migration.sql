-- P0 hardening: atomic action claim status, shipping-label cost, and hot-path indexes.

-- Add an EXECUTING state so executeAction can atomically claim an APPROVED action
-- (APPROVED -> EXECUTING) before performing irreversible external side effects.
ALTER TYPE "ActionStatus" ADD VALUE IF NOT EXISTS 'EXECUTING' AFTER 'APPROVED';

-- Outbound shipping label cost so landed-cost profit math can include it.
ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "shippingLabelCost" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- Hot-path foreign-key / status indexes.
CREATE INDEX IF NOT EXISTS "EbayListing_amazonMatchId_idx" ON "EbayListing"("amazonMatchId");
CREATE INDEX IF NOT EXISTS "EbayListing_productCandidateId_idx" ON "EbayListing"("productCandidateId");
CREATE INDEX IF NOT EXISTS "EbayListing_listingStatus_idx" ON "EbayListing"("listingStatus");
CREATE INDEX IF NOT EXISTS "Order_ebayListingId_idx" ON "Order"("ebayListingId");
CREATE INDEX IF NOT EXISTS "Order_orderStatus_idx" ON "Order"("orderStatus");
CREATE INDEX IF NOT EXISTS "AmazonPurchase_orderId_idx" ON "AmazonPurchase"("orderId");
CREATE INDEX IF NOT EXISTS "AmazonPurchase_status_createdAt_idx" ON "AmazonPurchase"("status", "createdAt");
