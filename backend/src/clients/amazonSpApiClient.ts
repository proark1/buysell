import { z } from 'zod';
import { fetchWithRetry } from './httpClient.js';

export interface AmazonLwaOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface AmazonFeesEstimateOptions {
  asin: string;
  accessToken: string;
  endpoint?: string;
  marketplaceId: string;
  listingPrice: number;
  currencyCode?: string;
  shippingPrice?: number;
  isAmazonFulfilled?: boolean;
  identifier?: string;
}

export interface AmazonFeesEstimate {
  asin: string;
  marketplaceId: string;
  identifier: string;
  totalFeesEstimate?: number;
  currencyCode?: string;
  status?: string;
  detail?: Array<{ feeType?: string; amount?: number; currencyCode?: string }>;
  raw: unknown;
}

const lwaTokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional()
}).passthrough();

const amountSchema = z.object({
  Amount: z.number().optional(),
  CurrencyCode: z.string().optional()
}).passthrough();

const feesEstimateResponseSchema = z.object({
  payload: z.unknown().optional()
}).passthrough();

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedAccessToken>();
const tokenInFlight = new Map<string, Promise<string>>();
const TOKEN_REFRESH_SKEW_MS = 60_000;

function amazonEndpoint(endpoint: string | undefined): string {
  return (endpoint ?? 'https://sellingpartnerapi-eu.amazon.com').replace(/\/+$/, '');
}

function numberFromAmount(value: unknown): { amount?: number; currencyCode?: string } {
  const parsed = amountSchema.safeParse(value);
  if (!parsed.success) return {};
  return {
    amount: parsed.data.Amount,
    currencyCode: parsed.data.CurrencyCode
  };
}

function normalizeFeesPayload(raw: unknown, fallback: Pick<AmazonFeesEstimateOptions, 'asin' | 'marketplaceId'> & { identifier: string }): AmazonFeesEstimate {
  const root = raw && typeof raw === 'object' && 'payload' in raw ? (raw as { payload?: unknown }).payload : raw;
  const result = root && typeof root === 'object' && 'FeesEstimateResult' in root
    ? (root as { FeesEstimateResult?: unknown }).FeesEstimateResult
    : root;
  const resultRecord = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  const estimate = resultRecord.FeesEstimate && typeof resultRecord.FeesEstimate === 'object'
    ? resultRecord.FeesEstimate as Record<string, unknown>
    : {};
  const total = numberFromAmount(estimate.TotalFeesEstimate);
  const detail = Array.isArray(estimate.FeeDetailList)
    ? estimate.FeeDetailList.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const fee = numberFromAmount(record.FeeAmount);
      return [{
        feeType: typeof record.FeeType === 'string' ? record.FeeType : undefined,
        amount: fee.amount,
        currencyCode: fee.currencyCode
      }];
    })
    : undefined;

  return {
    asin: fallback.asin,
    marketplaceId: fallback.marketplaceId,
    identifier: typeof resultRecord.Identifier === 'string' ? resultRecord.Identifier : fallback.identifier,
    totalFeesEstimate: total.amount,
    currencyCode: total.currencyCode,
    status: typeof resultRecord.Status === 'string' ? resultRecord.Status : undefined,
    detail,
    raw
  };
}

async function requestLwaAccessToken(options: AmazonLwaOptions): Promise<{ token: string; ttlMs: number }> {
  const response = await fetchWithRetry('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: options.refreshToken,
      client_id: options.clientId,
      client_secret: options.clientSecret
    })
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Amazon LWA token refresh failed with status ${response.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ''}`);
  }
  const payload = lwaTokenSchema.parse(bodyText ? JSON.parse(bodyText) : {});
  const ttlMs = (payload.expires_in && payload.expires_in > 0 ? payload.expires_in : 3600) * 1000;
  return { token: payload.access_token, ttlMs };
}

export async function getAmazonSpApiAccessToken(options: AmazonLwaOptions): Promise<string> {
  const key = options.clientId;
  const now = Date.now();
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > now + TOKEN_REFRESH_SKEW_MS) return cached.token;

  const inFlight = tokenInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const { token, ttlMs } = await requestLwaAccessToken(options);
      tokenCache.set(key, { token, expiresAt: Date.now() + ttlMs });
      return token;
    } finally {
      tokenInFlight.delete(key);
    }
  })();
  tokenInFlight.set(key, promise);
  return promise;
}

export async function getMyFeesEstimateForAsin(options: AmazonFeesEstimateOptions): Promise<AmazonFeesEstimate> {
  const identifier = options.identifier ?? `buysell-${options.asin}-${Date.now()}`;
  const currencyCode = options.currencyCode ?? 'EUR';
  const body = {
    FeesEstimateRequest: {
      MarketplaceId: options.marketplaceId,
      IsAmazonFulfilled: options.isAmazonFulfilled ?? true,
      PriceToEstimateFees: {
        ListingPrice: {
          CurrencyCode: currencyCode,
          Amount: Number(options.listingPrice.toFixed(2))
        },
        Shipping: {
          CurrencyCode: currencyCode,
          Amount: Number((options.shippingPrice ?? 0).toFixed(2))
        }
      },
      Identifier: identifier
    }
  };

  const response = await fetchWithRetry(`${amazonEndpoint(options.endpoint)}/products/fees/v0/items/${encodeURIComponent(options.asin)}/feesEstimate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-amz-access-token': options.accessToken
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const raw = text ? feesEstimateResponseSchema.parse(JSON.parse(text)) : {};
  if (!response.ok) {
    throw new Error(`Amazon Product Fees estimate failed with status ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
  }
  return normalizeFeesPayload(raw, { asin: options.asin, marketplaceId: options.marketplaceId, identifier });
}
