ALTER TABLE "ProfitSnapshot"
  ADD COLUMN IF NOT EXISTS "feeRateCardId" TEXT,
  ADD COLUMN IF NOT EXISTS "vatModeId" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "marketplaceKey" TEXT,
  ADD COLUMN IF NOT EXISTS "destinationMarketplaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "feeRateCardVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "vatModeKey" TEXT,
  ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS "taxableSourceShipping" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sourcePriceIncludesVat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inputVatCredit" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "outputVatReserve" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS "FeeRateCard" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "marketplaceKey" TEXT NOT NULL,
  "marketplaceId" TEXT NOT NULL,
  "sellerType" TEXT NOT NULL DEFAULT 'COMMERCIAL',
  "categoryId" TEXT,
  "categoryName" TEXT,
  "variableFeeRate" DECIMAL(7,4) NOT NULL,
  "aboveThresholdFeeRate" DECIMAL(7,4),
  "thresholdAmount" DECIMAL(10,2),
  "fixedFeeBelowThreshold" DECIMAL(10,2),
  "fixedFeeAboveThreshold" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "sourceLabel" TEXT,
  "sourceUrl" TEXT,
  "version" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeRateCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VatMode" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "marketplaceKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "vatRate" DECIMAL(5,4) NOT NULL,
  "sourcePriceIncludesVat" BOOLEAN NOT NULL DEFAULT true,
  "reclaimInputVat" BOOLEAN NOT NULL DEFAULT false,
  "collectOutputVat" BOOLEAN NOT NULL DEFAULT false,
  "outputVatIncludedInSalePrice" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VatMode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SoldComp" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'terapeak',
  "sourceFile" TEXT NOT NULL DEFAULT 'unknown',
  "sourceRow" INTEGER NOT NULL,
  "marketplaceId" TEXT NOT NULL DEFAULT 'EBAY_DE',
  "soldAt" TIMESTAMP(3),
  "ebayItemId" TEXT,
  "title" TEXT NOT NULL,
  "ebayUrl" TEXT,
  "soldPrice" DECIMAL(10,2),
  "shippingPrice" DECIMAL(10,2),
  "totalPrice" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "condition" TEXT,
  "category" TEXT,
  "categoryId" TEXT,
  "sellerName" TEXT,
  "quantitySold" INTEGER NOT NULL DEFAULT 1,
  "familyKey" TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "rawJson" JSONB,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SoldComp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeeRateCard_key_key" ON "FeeRateCard"("key");
CREATE INDEX IF NOT EXISTS "FeeRateCard_marketplaceKey_active_idx" ON "FeeRateCard"("marketplaceKey", "active");
CREATE INDEX IF NOT EXISTS "FeeRateCard_marketplaceId_categoryId_active_idx" ON "FeeRateCard"("marketplaceId", "categoryId", "active");
CREATE INDEX IF NOT EXISTS "FeeRateCard_effectiveFrom_effectiveTo_idx" ON "FeeRateCard"("effectiveFrom", "effectiveTo");

CREATE UNIQUE INDEX IF NOT EXISTS "VatMode_key_key" ON "VatMode"("key");
CREATE INDEX IF NOT EXISTS "VatMode_marketplaceKey_active_idx" ON "VatMode"("marketplaceKey", "active");

CREATE UNIQUE INDEX IF NOT EXISTS "SoldComp_sourceFile_sourceRow_key" ON "SoldComp"("sourceFile", "sourceRow");
CREATE INDEX IF NOT EXISTS "SoldComp_marketplaceId_soldAt_idx" ON "SoldComp"("marketplaceId", "soldAt");
CREATE INDEX IF NOT EXISTS "SoldComp_familyKey_idx" ON "SoldComp"("familyKey");
CREATE INDEX IF NOT EXISTS "SoldComp_ebayItemId_idx" ON "SoldComp"("ebayItemId");
CREATE INDEX IF NOT EXISTS "SoldComp_soldPrice_idx" ON "SoldComp"("soldPrice");

CREATE INDEX IF NOT EXISTS "ProfitSnapshot_feeRateCardId_idx" ON "ProfitSnapshot"("feeRateCardId");
CREATE INDEX IF NOT EXISTS "ProfitSnapshot_vatModeId_idx" ON "ProfitSnapshot"("vatModeId");
CREATE INDEX IF NOT EXISTS "ProfitSnapshot_marketplaceKey_createdAt_idx" ON "ProfitSnapshot"("marketplaceKey", "createdAt");

ALTER TABLE "ProfitSnapshot"
  ADD CONSTRAINT "ProfitSnapshot_feeRateCardId_fkey" FOREIGN KEY ("feeRateCardId") REFERENCES "FeeRateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProfitSnapshot"
  ADD CONSTRAINT "ProfitSnapshot_vatModeId_fkey" FOREIGN KEY ("vatModeId") REFERENCES "VatMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "FeeRateCard" (
  "id",
  "key",
  "marketplaceKey",
  "marketplaceId",
  "sellerType",
  "categoryId",
  "categoryName",
  "variableFeeRate",
  "aboveThresholdFeeRate",
  "thresholdAmount",
  "fixedFeeBelowThreshold",
  "fixedFeeAboveThreshold",
  "currency",
  "effectiveFrom",
  "sourceLabel",
  "sourceUrl",
  "version",
  "metadataJson"
) VALUES (
  'fee-ebay-de-commercial-default-2026-02',
  'ebay-de-commercial-default-2026-02',
  'de',
  'EBAY_DE',
  'COMMERCIAL',
  NULL,
  'Default eBay.de commercial seller rate',
  0.1200,
  0.0300,
  1990.00,
  0.35,
  0.45,
  'EUR',
  '2026-02-12T00:00:00.000Z',
  'eBay.de seller fee changes effective 2026-02-12',
  'https://www.ebay.de/verkaeuferportal/news/seller-news/2026-januar/gebuehrenaenderungen',
  'ebay-de-commercial-2026-02',
  '{"notes":["Conservative default for unknown categories.","Category-specific cards should override this row when available."]}'::jsonb
) ON CONFLICT ("key") DO NOTHING;

INSERT INTO "VatMode" (
  "id",
  "key",
  "marketplaceKey",
  "label",
  "description",
  "vatRate",
  "sourcePriceIncludesVat",
  "reclaimInputVat",
  "collectOutputVat",
  "outputVatIncludedInSalePrice"
) VALUES
  (
    'vat-de-gross-no-reclaim',
    'de_gross_no_reclaim',
    'de',
    'Germany gross prices, no input VAT reclaim',
    'Treat Amazon/eBay source prices as gross paid prices and do not add extra source VAT.',
    0.1900,
    true,
    false,
    false,
    true
  ),
  (
    'vat-de-registered-standard',
    'de_registered_standard',
    'de',
    'Germany VAT registered',
    'Split gross source price into net plus input VAT credit, and reserve output VAT from gross sale price.',
    0.1900,
    true,
    true,
    true,
    true
  ),
  (
    'vat-de-legacy-additive',
    'de_legacy_additive',
    'de',
    'Germany additive 19 percent reserve',
    'Legacy conservative mode: add a 19 percent source-tax reserve to the source price.',
    0.1900,
    false,
    false,
    false,
    true
  )
ON CONFLICT ("key") DO NOTHING;
