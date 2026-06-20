import 'dotenv/config';
import { z } from 'zod';

// Railway and local .env files can define optional values as empty strings.
// Treat those the same as missing so optional/defaulted schema fields behave.
const emptyStringToUndefined = (value: unknown): unknown => value === '' ? undefined : value;
const envValue = (schema: Parameters<typeof z.preprocess>[1]) => z.preprocess(emptyStringToUndefined, schema);

const rawEnvSchema = z.object({
  NODE_ENV: envValue(z.enum(['development', 'test', 'production']).default('development')),
  DATABASE_URL: envValue(z.string().min(1).optional()),
  SERPAPI_API_KEY: envValue(z.string().min(1).optional()),
  KEEPA_API_KEY: envValue(z.string().min(1).optional()),
  EBAY_CLIENT_ID: envValue(z.string().min(1).optional()),
  EBAY_CLIENT_SECRET: envValue(z.string().min(1).optional()),
  EBAY_REFRESH_TOKEN: envValue(z.string().min(1).optional()),
  EBAY_MARKETPLACE_ID: envValue(z.string().min(1).default('EBAY_US')),
  EBAY_SANDBOX: envValue(z.enum(['true', 'false']).default('false')),
  OPENAI_API_KEY: envValue(z.string().min(1).optional()),
  LOCAL_AGENT_SHARED_SECRET: envValue(z.string().min(1).optional()),
  BUYSELL_ENCRYPTION_KEY: envValue(z.string().min(32).optional()),
  // Optional previous key, kept valid for decrypt only, so the active key can be rotated
  // without losing access to data encrypted under the old key.
  BUYSELL_ENCRYPTION_KEY_PREVIOUS: envValue(z.string().min(32).optional()),
  // Fastify trustProxy: 'true'/'false', a trusted-hop count, or an IP/CIDR allow-list.
  // Leave unset to derive client IPs from the socket only (no X-Forwarded-For trust).
  TRUST_PROXY: envValue(z.string().min(1).optional()),
  PORT: envValue(z.coerce.number().int().positive().default(3000))
});

type EnvRefinementValue = {
  NODE_ENV: 'development' | 'test' | 'production';
  BUYSELL_ENCRYPTION_KEY?: string;
};

type RefinementContext = {
  addIssue(issue: { code: 'custom'; path: string[]; message: string }): void;
};

const envSchema = rawEnvSchema.superRefine((value: EnvRefinementValue, context: RefinementContext) => {
  if (value.NODE_ENV === 'production' && !value.BUYSELL_ENCRYPTION_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['BUYSELL_ENCRYPTION_KEY'],
      message: 'BUYSELL_ENCRYPTION_KEY is required in production and must be at least 32 characters.'
    });
  }
});

export const env = envSchema.parse(process.env);
