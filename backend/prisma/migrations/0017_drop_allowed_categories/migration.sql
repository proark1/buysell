-- Drop the unused safe-mode allow-list category column.
-- The allow-list gate was removed in commit acb5686; hard blocking is handled by
-- blockedBrands/blockedCategories/blockedKeywords plus product-identity verification,
-- so this column is no longer read or written by application code.

ALTER TABLE "RuleConfig" DROP COLUMN IF EXISTS "allowedCategories";
