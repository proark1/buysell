WITH ranked_active_runs AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "actionItemId" ORDER BY "startedAt" DESC, "id" DESC) AS row_number
  FROM "AutomationRun"
  WHERE "status" IN ('RUNNING', 'NEEDS_HUMAN_CONFIRMATION')
)
UPDATE "AutomationRun"
SET
  "status" = 'CANCELLED',
  "phase" = 'CANCELLED_DUPLICATE_ACTIVE_RUN',
  "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP)
WHERE "id" IN (
  SELECT "id" FROM ranked_active_runs WHERE row_number > 1
);

CREATE UNIQUE INDEX "AutomationRun_active_actionItemId_key"
  ON "AutomationRun"("actionItemId")
  WHERE "status" IN ('RUNNING', 'NEEDS_HUMAN_CONFIRMATION');
