-- Operational features: order-sync scheduler, automation retry/dead-letter, verification TTL.

ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "automationAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);

ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "ebayOrderSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "ebayOrderSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "ebayOrderSyncLookbackHours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "maxAutomationAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "RuleConfig" ADD COLUMN IF NOT EXISTS "verificationTtlMinutes" INTEGER NOT NULL DEFAULT 0;
