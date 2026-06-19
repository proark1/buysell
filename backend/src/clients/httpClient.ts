export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch() with a hard request timeout so a hung upstream connection can't stall
 * discovery/monitoring indefinitely.
 */
export async function fetchWithTimeout(url: string, options: FetchWithTimeoutOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * fetch() with a bounded exponential backoff (+ jitter) for transient failures: network
 * errors/timeouts and 502/503/504. Intended for idempotent GETs against metered APIs so a
 * blip doesn't waste the whole run. 429/4xx are returned as-is for the caller to handle.
 */
export async function fetchWithRetry(url: string, options: FetchWithTimeoutOptions = {}, retry: RetryOptions = {}): Promise<Response> {
  const attempts = Math.max(1, retry.attempts ?? 3);
  const baseDelayMs = retry.baseDelayMs ?? 300;
  const timeoutMs = retry.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, { ...options, timeoutMs });
      if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < attempts) {
        await delay(baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * baseDelayMs));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await delay(baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * baseDelayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed after retries');
}
