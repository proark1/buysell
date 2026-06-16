ALTER TABLE "EbayListing" ADD COLUMN "ebayOfferId" TEXT;
CREATE INDEX "EbayListing_ebayOfferId_idx" ON "EbayListing"("ebayOfferId");
