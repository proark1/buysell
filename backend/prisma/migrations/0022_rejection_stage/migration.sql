-- Denormalized rejection stage on eBay discovery candidates so the dashboard rejection
-- funnel can be computed with an accurate, scalable groupBy instead of a JS pass over a
-- truncated sample. Populated going forward at each reject site (source / no-match /
-- decision-reject); legacy rows stay NULL and are counted via the existing JS fallback.

ALTER TABLE "EbayDiscoveryCandidate" ADD COLUMN IF NOT EXISTS "rejectionStage" TEXT;
CREATE INDEX IF NOT EXISTS "EbayDiscoveryCandidate_comparisonStatus_rejectionStage_idx" ON "EbayDiscoveryCandidate"("comparisonStatus", "rejectionStage");
