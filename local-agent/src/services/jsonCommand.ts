import { spawn } from 'node:child_process';
import { z } from 'zod';

const maxOutputChars = 1_000_000;
const maxStderrRelayChars = 500;

// Secrets that must not be inherited by the spawned computer-use command's environment.
const sensitiveEnvKeys = new Set([
  'LOCAL_AGENT_SHARED_SECRET',
  'BUYSELL_ENCRYPTION_KEY',
  'BUYSELL_ENCRYPTION_KEY_PREVIOUS',
  'DATABASE_URL',
  'OPENAI_API_KEY',
  'KEEPA_API_KEY',
  'SERPAPI_API_KEY',
  'EBAY_CLIENT_ID',
  'EBAY_CLIENT_SECRET',
  'EBAY_REFRESH_TOKEN',
  'NOTIFICATION_WEBHOOK_URL'
]);

const minimalChildEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!sensitiveEnvKeys.has(key)) env[key] = value;
  }
  return env;
};

export function parseCommandLine(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (const char of command.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? undefined : char;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (escaped) current += '\\';
  if (quote) throw new Error('Command contains an unterminated quoted string');
  if (current) args.push(current);
  if (!args.length) throw new Error('Command is empty');
  return args;
}

export async function runJsonCommand<T>(
  command: string,
  input: unknown,
  timeoutMs: number,
  schema: z.ZodType<T>,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const [file, ...args] = parseCommandLine(command);
    const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'], env: minimalChildEnv() });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      reject(error);
    };

    const timer = setTimeout(() => {
      fail(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const append = (target: 'stdout' | 'stderr', chunk: string): void => {
      if (target === 'stdout') stdout += chunk;
      else stderr += chunk;
      if (stdout.length + stderr.length > maxOutputChars) {
        fail(new Error(`${label} exceeded ${maxOutputChars} output characters`));
      }
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => append('stdout', chunk));
    child.stderr.on('data', (chunk: string) => append('stderr', chunk));
    child.on('error', fail);
    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        // Truncate child stderr before relaying so a noisy/secret-bearing dump isn't
        // forwarded verbatim to the backend.
        const relayStderr = stderr.trim().slice(0, maxStderrRelayChars);
        reject(new Error(`${label} exited with ${code ?? 'unknown'}: ${relayStderr}`));
        return;
      }
      try {
        const parsed = schema.parse(JSON.parse(stdout));
        resolve(parsed);
      } catch (error) {
        reject(new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
