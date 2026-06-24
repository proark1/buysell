CREATE TABLE "SoldWinnerSeed" (
  "id" TEXT NOT NULL,
  "sourceFile" TEXT NOT NULL DEFAULT 'unknown',
  "sourceRow" INTEGER NOT NULL,
  "soldAt" TIMESTAMP(3),
  "ebayItemId" TEXT,
  "orderNo" TEXT,
  "title" TEXT NOT NULL,
  "listingType" TEXT,
  "quantitySold" INTEGER NOT NULL DEFAULT 1,
  "itemCost" DECIMAL(10,2),
  "sellingPrice" DECIMAL(10,2),
  "ebayFees" DECIMAL(10,2),
  "shippingCost" DECIMAL(10,2),
  "discount" DECIMAL(10,2),
  "addFee" DECIMAL(10,2),
  "totalSaleAmount" DECIMAL(12,2),
  "netProfit" DECIMAL(12,2),
  "totalCost" DECIMAL(12,2),
  "familyKey" TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "rawJson" JSONB,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SoldWinnerSeed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReplenishmentWatchItem" (
  "id" TEXT NOT NULL,
  "familyKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "ebayItemId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'sold-winner',
  "saleCount" INTEGER NOT NULL DEFAULT 0,
  "totalQuantitySold" INTEGER NOT NULL DEFAULT 0,
  "averageSellingPrice" DECIMAL(10,2),
  "averageUnitCost" DECIMAL(10,2),
  "totalNetProfit" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  "lastSoldAt" TIMESTAMP(3),
  "targetBuyPrice" DECIMAL(10,2),
  "targetSellPrice" DECIMAL(10,2),
  "status" TEXT NOT NULL DEFAULT 'WATCHING',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReplenishmentWatchItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SoldWinnerSeed_sourceFile_sourceRow_key" ON "SoldWinnerSeed"("sourceFile", "sourceRow");
CREATE INDEX "SoldWinnerSeed_familyKey_idx" ON "SoldWinnerSeed"("familyKey");
CREATE INDEX "SoldWinnerSeed_ebayItemId_idx" ON "SoldWinnerSeed"("ebayItemId");
CREATE INDEX "SoldWinnerSeed_netProfit_idx" ON "SoldWinnerSeed"("netProfit");
CREATE INDEX "SoldWinnerSeed_soldAt_idx" ON "SoldWinnerSeed"("soldAt");

CREATE UNIQUE INDEX "ReplenishmentWatchItem_familyKey_key" ON "ReplenishmentWatchItem"("familyKey");
CREATE INDEX "ReplenishmentWatchItem_status_priority_idx" ON "ReplenishmentWatchItem"("status", "priority");
CREATE INDEX "ReplenishmentWatchItem_lastSoldAt_idx" ON "ReplenishmentWatchItem"("lastSoldAt");
