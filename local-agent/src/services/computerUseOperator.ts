import { spawn } from 'node:child_process';
import type { ActionItemDto, AutomationMode, AutomationRunStatus, VerificationResultDto } from './backendClient.js';

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

export async function runComputerUseOperator(
  command: string,
  job: ComputerUseAutomationJob,
  timeoutMs: number
): Promise<ComputerUseAutomationResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Computer-use operator timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Computer-use operator exited with ${code ?? 'unknown'}: ${stderr.trim()}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('Computer-use operator returned a non-object JSON value'));
          return;
        }
        resolve(parsed as ComputerUseAutomationResult);
      } catch (error) {
        reject(new Error(`Computer-use operator returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    child.stdin.write(JSON.stringify(job));
    child.stdin.end();
  });
}
