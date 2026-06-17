import { spawn } from 'node:child_process';
import type { VerificationResultDto } from './backendClient.js';

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

export async function runComputerUseVerifier(
  command: string,
  job: ComputerUseVerificationJob,
  timeoutMs = 10 * 60 * 1000
): Promise<VerificationResultDto> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Computer-use verifier timed out after ${timeoutMs}ms`));
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
        reject(new Error(`Computer-use verifier exited with ${code ?? 'unknown'}: ${stderr.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as VerificationResultDto);
      } catch (error) {
        reject(new Error(`Computer-use verifier returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    child.stdin.write(JSON.stringify(job));
    child.stdin.end();
  });
}
