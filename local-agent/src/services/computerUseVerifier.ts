import { z } from 'zod';
import type { VerificationResultDto } from './backendClient.js';
import { runJsonCommand } from './jsonCommand.js';

export interface ComputerUseVerificationJob {
  actionId: string;
  amazonUrl?: string;
  ebayUrl?: string;
  expectedAmazonPrice?: unknown;
  expectedEbayPrice?: unknown;
  expectedBrand?: unknown;
  expectedCondition: 'NEW';
  expectedBuyingFormat: 'BIN';
  instructions: string[];
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

export async function runComputerUseVerifier(
  command: string,
  job: ComputerUseVerificationJob,
  timeoutMs = 10 * 60 * 1000
): Promise<VerificationResultDto> {
  return runJsonCommand(command, job, timeoutMs, verificationResultSchema, 'Computer-use verifier');
}
