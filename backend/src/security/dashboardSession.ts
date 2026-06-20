import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { getCredentialValue } from '../repositories/credentialRepository.js';

export const dashboardSessionCookieName = 'buysell_dashboard_session';
export const dashboardCsrfCookieName = 'buysell_dashboard_csrf';

const sessionMaxAgeSeconds = 8 * 60 * 60;
const cookiePath = '/';

type DashboardSessionPayload = {
  version: 1;
  expiresAt: number;
  csrfToken: string;
  nonce: string;
};

type HeaderReply = FastifyReply & {
  header(name: string, value: string | string[]): FastifyReply;
};

const base64Url = (value: Buffer | string): string => (
  typeof value === 'string' ? Buffer.from(value) : value
).toString('base64url');

const fromBase64Url = (value: string): string => Buffer
  .from(value, 'base64url')
  .toString('utf8');

const hashSecret = (value: string): Buffer => createHash('sha256').update(value).digest();

export const secretMatches = (provided: string, configured: string): boolean => {
  // Compare fixed-width digests so this never short-circuits on length.
  return timingSafeEqual(hashSecret(provided), hashSecret(configured));
};

export async function getConfiguredLocalAgentSecrets(db: PrismaClient): Promise<string[]> {
  // A corrupt or undecryptable stored secret must not lock out the entire auth path:
  // skip it with a warning and fall back to the environment secret.
  let stored: string | undefined;
  try {
    stored = await getCredentialValue(db, 'LOCAL_AGENT_SHARED_SECRET');
  } catch (error) {
    console.warn('Failed to read stored LOCAL_AGENT_SHARED_SECRET; using environment secret only.', error instanceof Error ? error.message : error);
    stored = undefined;
  }
  return [env.LOCAL_AGENT_SHARED_SECRET, stored].filter((value): value is string => Boolean(value));
}

function parseCookies(request: FastifyRequest): Record<string, string> {
  const rawHeader = request.headers.cookie;
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!header) return {};

  return header.split(';').reduce<Record<string, string>>((cookies: Record<string, string>, part: string) => {
    const index = part.indexOf('=');
    if (index <= 0) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function cookieHeader(name: string, value: string, options: { httpOnly?: boolean; maxAgeSeconds?: number }): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${cookiePath}`,
    'SameSite=Strict'
  ];
  if (options.httpOnly) parts.push('HttpOnly');
  if (env.NODE_ENV === 'production') parts.push('Secure');
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  return parts.join('; ');
}

function clearCookieHeader(name: string): string {
  return [
    `${name}=`,
    `Path=${cookiePath}`,
    'SameSite=Strict',
    env.NODE_ENV === 'production' ? 'Secure' : undefined,
    'Max-Age=0'
  ].filter((part): part is string => Boolean(part)).join('; ');
}

function signSession(payloadText: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`dashboard-session\n${payloadText}`)
    .digest('base64url');
}

function encodeSession(payload: DashboardSessionPayload, secret: string): string {
  const payloadText = base64Url(JSON.stringify(payload));
  return `${payloadText}.${signSession(payloadText, secret)}`;
}

function verifySession(value: string | undefined, secrets: string[]): DashboardSessionPayload | undefined {
  if (!value) return undefined;
  const [payloadText, signature] = value.split('.');
  if (!payloadText || !signature) return undefined;

  const matched = secrets.some((secret) => {
    const expected = signSession(payloadText, secret);
    return timingSafeEqual(hashSecret(signature), hashSecret(expected));
  });
  if (!matched) return undefined;

  try {
    const payload = JSON.parse(fromBase64Url(payloadText)) as DashboardSessionPayload;
    if (payload.version !== 1) return undefined;
    if (!payload.csrfToken || !payload.nonce) return undefined;
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

// The generated PrismaClient type doesn't surface newly-added model delegates under this
// project's NodeNext resolution; the delegate exists at runtime, so cast to it.
type SessionDelegate = {
  dashboardSession: {
    create(args: { data: { id: string; expiresAt: Date } }): Promise<unknown>;
    findUnique(args: { where: { id: string } }): Promise<{ revokedAt: Date | null; expiresAt: Date } | null>;
    updateMany(args: { where: Record<string, unknown>; data: { revokedAt: Date } }): Promise<{ count: number }>;
    deleteMany(args: { where: { expiresAt: { lt: Date } } }): Promise<{ count: number }>;
  };
};
const sessionDb = (db: PrismaClient): SessionDelegate['dashboardSession'] => (db as unknown as SessionDelegate).dashboardSession;

export async function createDashboardSessionHeaders(db: PrismaClient, providedSecret: string): Promise<string[] | undefined> {
  const secrets = await getConfiguredLocalAgentSecrets(db);
  const matchingSecret = secrets.find((secret) => secretMatches(providedSecret, secret));
  if (!matchingSecret) return undefined;

  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + sessionMaxAgeSeconds * 1000;
  const payload: DashboardSessionPayload = {
    version: 1,
    expiresAt,
    csrfToken,
    nonce: randomBytes(18).toString('base64url')
  };

  // Persist the session so it can be revoked server-side (logout / revoke-all). Best-effort:
  // if the write fails the cookie still works (it falls back to stateless behavior).
  try {
    await sessionDb(db).create({ data: { id: payload.nonce, expiresAt: new Date(expiresAt) } });
  } catch (error) {
    console.warn('Failed to persist dashboard session record; session will not be server-revocable.', error instanceof Error ? error.message : error);
  }

  return [
    cookieHeader(dashboardSessionCookieName, encodeSession(payload, matchingSecret), { httpOnly: true, maxAgeSeconds: sessionMaxAgeSeconds }),
    cookieHeader(dashboardCsrfCookieName, csrfToken, { httpOnly: false, maxAgeSeconds: sessionMaxAgeSeconds })
  ];
}

/** Revoke the session carried by this request (used on logout). */
export async function revokeDashboardSessionRequest(db: PrismaClient, request: FastifyRequest): Promise<void> {
  const secrets = await getConfiguredLocalAgentSecrets(db).catch(() => []);
  if (!secrets.length) return;
  const cookies = parseCookies(request);
  const session = verifySession(cookies[dashboardSessionCookieName], secrets);
  if (!session) return;
  try {
    await sessionDb(db).updateMany({ where: { id: session.nonce, revokedAt: null }, data: { revokedAt: new Date() } });
  } catch {
    // best-effort
  }
}

/**
 * Delete EXPIRED session rows to bound table growth. Deliberately deletes only on expiry,
 * never on revokedAt: a missing row is treated as a legacy session allowed until expiry, so
 * deleting a still-in-window revoked row would re-enable it. Expired rows are safe because
 * verifySession independently rejects on expiry.
 */
export async function deleteExpiredDashboardSessions(db: PrismaClient): Promise<number> {
  try {
    const result = await sessionDb(db).deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return result.count;
  } catch {
    return 0;
  }
}

/** Revoke every active dashboard session (e.g. on suspected compromise). */
export async function revokeAllDashboardSessions(db: PrismaClient): Promise<number> {
  try {
    const result = await sessionDb(db).updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } });
    return result.count;
  } catch {
    return 0;
  }
}

export function clearDashboardSessionHeaders(): string[] {
  return [
    clearCookieHeader(dashboardSessionCookieName),
    clearCookieHeader(dashboardCsrfCookieName)
  ];
}

export async function verifyDashboardSessionRequest(
  db: PrismaClient,
  request: FastifyRequest,
  options: { requireCsrf?: boolean } = {}
): Promise<boolean> {
  const secrets = await getConfiguredLocalAgentSecrets(db);
  if (!secrets.length) return false;

  const cookies = parseCookies(request);
  const session = verifySession(cookies[dashboardSessionCookieName], secrets);
  if (!session) return false;

  // Server-side revocation check. A missing row is treated as a legacy (pre-persistence)
  // session and allowed until it expires; a present row that is revoked/expired is rejected.
  // A DB error fails open here because the HMAC signature already authenticated the cookie.
  try {
    const record = await sessionDb(db).findUnique({ where: { id: session.nonce } });
    if (record && (record.revokedAt !== null || record.expiresAt.getTime() < Date.now())) return false;
  } catch {
    // fail open on DB error
  }

  if (!options.requireCsrf) return true;

  const csrfHeader = request.headers['x-csrf-token'];
  const providedCsrf = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
  return providedCsrf === session.csrfToken && cookies[dashboardCsrfCookieName] === session.csrfToken;
}

export function setCookieHeaders(reply: FastifyReply, headers: string[]): void {
  (reply as HeaderReply).header('set-cookie', headers);
}
