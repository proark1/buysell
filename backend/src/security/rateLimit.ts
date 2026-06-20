import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const windowMs = 60_000;

const expensivePathPattern = /\/(?:run|compare|execute|credentials|monitor|automation-mode|amazon-purchase)(?:\/|$)/;

type RateLimitRequest = FastifyRequest & {
  method?: string;
  url?: string;
  ip?: string;
  raw?: {
    method?: string;
    url?: string;
    socket?: { remoteAddress?: string };
  };
};

type RateLimitReply = FastifyReply & {
  header(name: string, value: string): RateLimitReply;
  status(code: number): RateLimitReply;
  send(payload: unknown): unknown;
};

type RateLimitApp = FastifyInstance & {
  addHook(name: 'preHandler', hook: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void): void;
};

const requestMethod = (request: FastifyRequest): string => {
  const typed = request as RateLimitRequest;
  return typed.method ?? typed.raw?.method ?? 'GET';
};

const requestUrl = (request: FastifyRequest): string => {
  const typed = request as RateLimitRequest;
  return typed.url ?? typed.raw?.url ?? '/';
};

const requestIp = (request: FastifyRequest): string => {
  const typed = request as RateLimitRequest;
  return typed.ip ?? typed.raw?.socket?.remoteAddress ?? 'unknown';
};

function clientKey(request: FastifyRequest): string {
  // Use the framework-computed client IP (request.ip), which honors trustProxy. Keying
  // on a raw X-Forwarded-For header let any client spoof its bucket and bypass limits.
  const ip = requestIp(request);
  const method = requestMethod(request).toUpperCase();
  const path = requestUrl(request).split('?')[0] || '/';
  const group = expensivePathPattern.test(path) ? 'expensive' : method === 'GET' ? 'read' : 'write';
  return `${ip}:${group}:${method}:${path}`;
}

function limitFor(request: FastifyRequest): number {
  const method = requestMethod(request).toUpperCase();
  const path = requestUrl(request).split('?')[0] || '/';
  if (path === '/health' || path === '/favicon.ico') return 0;
  // /api/health/db runs a DB query, so it must be rate-limited (it was previously exempt).
  if (path === '/api/health/db') return 30;
  if (path === '/' || path === '/dashboard/login') return 60;
  if (expensivePathPattern.test(path)) return 30;
  if (method === 'GET') return 240;
  return 120;
}

function prune(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function registerRateLimit(app: FastifyInstance): void {
  (app as RateLimitApp).addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const limit = limitFor(request);
    if (limit <= 0) return;

    const now = Date.now();
    prune(now);
    const key = clientKey(request);
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count <= limit) return;

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    (reply as RateLimitReply)
      .header('retry-after', String(retryAfterSeconds))
      .status(429)
      .send({
        error: 'Too many requests. Wait briefly and try again.',
        retryAfterSeconds
      });
  });
}
