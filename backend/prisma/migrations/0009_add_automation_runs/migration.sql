CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL,
  "actionItemId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "agentType" TEXT NOT NULL DEFAULT 'local-agent',
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "phase" TEXT NOT NULL DEFAULT 'STARTED',
  "riskScore" INTEGER NOT NULL DEFAULT 50,
  "resultJson" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationEvent" (
  "id" TEXT NOT NULL,
  "automationRunId" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'INFO',
  "eventType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "dataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRun_actionItemId_idx" ON "AutomationRun"("actionItemId");
CREATE INDEX "AutomationRun_status_startedAt_idx" ON "AutomationRun"("status", "startedAt");
CREATE INDEX "AutomationRun_mode_idx" ON "AutomationRun"("mode");
CREATE INDEX "AutomationEvent_automationRunId_createdAt_idx" ON "AutomationEvent"("automationRunId", "createdAt");

ALTER TABLE "AutomationRun"
  ADD CONSTRAINT "AutomationRun_actionItemId_fkey"
  FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationEvent"
  ADD CONSTRAINT "AutomationEvent_automationRunId_fkey"
  FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
