-- Split scheduled eBay discovery collection from optional Amazon comparison.

ALTER TABLE "RuleConfig"
  ADD COLUMN "ebayDiscoveryAutoCompareEnabled" BOOLEAN NOT NULL DEFAULT false;
