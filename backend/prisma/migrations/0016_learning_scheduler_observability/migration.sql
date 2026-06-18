-- Add durable automation locks, opportunity learning, lifecycle, price history,
-- inventory, realized P/L, and automation artifact tracking.

ALTER TABLE "ProductCandidate" ADD COLUMN "productFamilyId" TEXT;

CREATE TABLE "SchedulerLock" (
  "name" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "leasedUntil" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulerLock_pkey" PRIMARY KEY ("name")
);

CREATE TABLE "ProductFamily" (
  "id" TEXT NOT NULL,
  "familyKey" TEXT NOT NULL,
  "canonicalTitle" TEXT NOT NULL,
  "brand" TEXT,
  "modelTokens" JSONB,
  "identifiers" JSONB,
  "opportunityCount" INTEGER NOT NULL DEFAULT 0,
  "manualReviewCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "listedCount" INTEGER NOT NULL DEFAULT 0,
  "realizedProfit" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "lastDecision" TEXT,
  "lastRiskFlags" JSONB,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFamily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpportunityFeedback" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT,
  "amazonMatchId" TEXT,
  "ebayCandidateId" TEXT,
  "feedbackType" TEXT NOT NULL,
  "reasonCode" TEXT,
  "reasonText" TEXT,
  "source" TEXT NOT NULL DEFAULT 'system',
  "weight" INTEGER NOT NULL DEFAULT 1,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceObservation" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT,
  "amazonMatchId" TEXT,
  "ebayCandidateId" TEXT,
  "marketplace" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "observedPrice" DECIMAL(10,2) NOT NULL,
  "shippingPrice" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "availabilityStatus" TEXT,
  "rawJson" JSONB,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ListingLifecycleEvent" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT,
  "ebayListingId" TEXT,
  "eventType" TEXT NOT NULL,
  "status" TEXT,
  "dataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceInventoryRecord" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT,
  "amazonMatchId" TEXT,
  "supplierName" TEXT NOT NULL DEFAULT 'Amazon',
  "asin" TEXT,
  "sourceUrl" TEXT,
  "unitCost" DECIMAL(10,2),
  "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
  "quantityReserved" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'WATCHING',
  "metadataJson" JSONB,
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourceInventoryRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfitLedgerEntry" (
  "id" TEXT NOT NULL,
  "productCandidateId" TEXT,
  "ebayListingId" TEXT,
  "orderId" TEXT,
  "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "sourceCost" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "marketplaceFees" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "shippingCost" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "refunds" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "netProfit" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "notes" TEXT,
  "realizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfitLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationArtifact" (
  "id" TEXT NOT NULL,
  "automationRunId" TEXT,
  "actionItemId" TEXT,
  "kind" TEXT NOT NULL,
  "path" TEXT,
  "url" TEXT,
  "sha256" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductFamily_familyKey_key" ON "ProductFamily"("familyKey");
CREATE INDEX "ProductCandidate_productFamilyId_idx" ON "ProductCandidate"("productFamilyId");
CREATE INDEX "SchedulerLock_leasedUntil_idx" ON "SchedulerLock"("leasedUntil");
CREATE INDEX "ProductFamily_lastSeenAt_idx" ON "ProductFamily"("lastSeenAt");
CREATE INDEX "ProductFamily_opportunityCount_idx" ON "ProductFamily"("opportunityCount");
CREATE INDEX "OpportunityFeedback_productCandidateId_idx" ON "OpportunityFeedback"("productCandidateId");
CREATE INDEX "OpportunityFeedback_amazonMatchId_idx" ON "OpportunityFeedback"("amazonMatchId");
CREATE INDEX "OpportunityFeedback_ebayCandidateId_idx" ON "OpportunityFeedback"("ebayCandidateId");
CREATE INDEX "OpportunityFeedback_feedbackType_createdAt_idx" ON "OpportunityFeedback"("feedbackType", "createdAt");
CREATE INDEX "OpportunityFeedback_reasonCode_idx" ON "OpportunityFeedback"("reasonCode");
CREATE INDEX "PriceObservation_productCandidateId_capturedAt_idx" ON "PriceObservation"("productCandidateId", "capturedAt");
CREATE INDEX "PriceObservation_amazonMatchId_capturedAt_idx" ON "PriceObservation"("amazonMatchId", "capturedAt");
CREATE INDEX "PriceObservation_ebayCandidateId_capturedAt_idx" ON "PriceObservation"("ebayCandidateId", "capturedAt");
CREATE INDEX "PriceObservation_marketplace_capturedAt_idx" ON "PriceObservation"("marketplace", "capturedAt");
CREATE INDEX "ListingLifecycleEvent_productCandidateId_createdAt_idx" ON "ListingLifecycleEvent"("productCandidateId", "createdAt");
CREATE INDEX "ListingLifecycleEvent_ebayListingId_createdAt_idx" ON "ListingLifecycleEvent"("ebayListingId", "createdAt");
CREATE INDEX "ListingLifecycleEvent_eventType_createdAt_idx" ON "ListingLifecycleEvent"("eventType", "createdAt");
CREATE INDEX "SourceInventoryRecord_productCandidateId_idx" ON "SourceInventoryRecord"("productCandidateId");
CREATE INDEX "SourceInventoryRecord_amazonMatchId_idx" ON "SourceInventoryRecord"("amazonMatchId");
CREATE INDEX "SourceInventoryRecord_asin_idx" ON "SourceInventoryRecord"("asin");
CREATE INDEX "SourceInventoryRecord_status_idx" ON "SourceInventoryRecord"("status");
CREATE INDEX "ProfitLedgerEntry_productCandidateId_idx" ON "ProfitLedgerEntry"("productCandidateId");
CREATE INDEX "ProfitLedgerEntry_ebayListingId_idx" ON "ProfitLedgerEntry"("ebayListingId");
CREATE INDEX "ProfitLedgerEntry_orderId_idx" ON "ProfitLedgerEntry"("orderId");
CREATE INDEX "ProfitLedgerEntry_realizedAt_idx" ON "ProfitLedgerEntry"("realizedAt");
CREATE INDEX "AutomationArtifact_automationRunId_idx" ON "AutomationArtifact"("automationRunId");
CREATE INDEX "AutomationArtifact_actionItemId_idx" ON "AutomationArtifact"("actionItemId");
CREATE INDEX "AutomationArtifact_kind_idx" ON "AutomationArtifact"("kind");

ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_productFamilyId_fkey" FOREIGN KEY ("productFamilyId") REFERENCES "ProductFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpportunityFeedback" ADD CONSTRAINT "OpportunityFeedback_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityFeedback" ADD CONSTRAINT "OpportunityFeedback_amazonMatchId_fkey" FOREIGN KEY ("amazonMatchId") REFERENCES "AmazonMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpportunityFeedback" ADD CONSTRAINT "OpportunityFeedback_ebayCandidateId_fkey" FOREIGN KEY ("ebayCandidateId") REFERENCES "EbayDiscoveryCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_amazonMatchId_fkey" FOREIGN KEY ("amazonMatchId") REFERENCES "AmazonMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_ebayCandidateId_fkey" FOREIGN KEY ("ebayCandidateId") REFERENCES "EbayDiscoveryCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ListingLifecycleEvent" ADD CONSTRAINT "ListingLifecycleEvent_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingLifecycleEvent" ADD CONSTRAINT "ListingLifecycleEvent_ebayListingId_fkey" FOREIGN KEY ("ebayListingId") REFERENCES "EbayListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceInventoryRecord" ADD CONSTRAINT "SourceInventoryRecord_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceInventoryRecord" ADD CONSTRAINT "SourceInventoryRecord_amazonMatchId_fkey" FOREIGN KEY ("amazonMatchId") REFERENCES "AmazonMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfitLedgerEntry" ADD CONSTRAINT "ProfitLedgerEntry_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfitLedgerEntry" ADD CONSTRAINT "ProfitLedgerEntry_ebayListingId_fkey" FOREIGN KEY ("ebayListingId") REFERENCES "EbayListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfitLedgerEntry" ADD CONSTRAINT "ProfitLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationArtifact" ADD CONSTRAINT "AutomationArtifact_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationArtifact" ADD CONSTRAINT "AutomationArtifact_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
