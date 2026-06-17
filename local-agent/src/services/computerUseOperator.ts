import { z } from 'zod';
import type { ActionItemDto, AutomationMode, AutomationRunStatus, VerificationResultDto } from './backendClient.js';
import { runJsonCommand } from './jsonCommand.js';

export interface ComputerUseAutomationJob {
  actionId: string;
  actionType: ActionItemDto['type'];
  mode: AutomationMode;
  reason: string;
  orderId?: string;
  backendUrl: string;
  payload: Record<string, unknown>;
  guardrails: {
    finalSubmitAllowed: boolean;
    requiresHumanConfirmation: boolean;
    allowedDomains: string[];
  };
  instructions: string[];
}

export interface ComputerUseAutomationResult {
  status?: AutomationRunStatus;
  summary?: string;
  evidence?: Record<string, unknown>;
  artifacts?: string[];
  actionCompleted?: boolean;
  checkedBy?: string;
  failureReasons?: string[];
  nextSteps?: string[];
  verificationResult?: VerificationResultDto;
}

const verificationObservationSchema = z.object({
  observedPrice: z.number().positive().optional(),
  brand: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  buyingFormat: z.string().min(1).optional(),
  url: z.string().url().optional(),
  screenshotPath: z.string().min(1).optional(),
  notes: z.string().min(1).optional()
}).passthrough();

const verificationResultSchema: z.ZodType<VerificationResultDto> = z.object({
  status: z.enum(['PASSED', 'FAILED', 'MANUAL_REVIEW']).optional(),
  amazon: verificationObservationSchema.optional(),
  ebay: verificationObservationSchema.optional(),
  evidence: z.record(z.unknown()).optional(),
  failureReasons: z.array(z.string()).optional(),
  checkedBy: z.string().optional()
}).passthrough();

const automationResultSchema: z.ZodType<ComputerUseAutomationResult> = z.object({
  status: z.enum(['RUNNING', 'NEEDS_HUMAN_CONFIRMATION', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED', 'CANCELLED']).optional(),
  summary: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
  artifacts: z.array(z.string()).optional(),
  actionCompleted: z.boolean().optional(),
  checkedBy: z.string().optional(),
  failureReasons: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
  verificationResult: verificationResultSchema.optional()
}).passthrough();

export async function runComputerUseOperator(
  command: string,
  job: ComputerUseAutomationJob,
  timeoutMs: number
): Promise<ComputerUseAutomationResult> {
  return runJsonCommand(command, job, timeoutMs, automationResultSchema, 'Computer-use operator');
}
