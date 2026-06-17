import 'dotenv/config';
import { z } from 'zod';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).optional(),
  SERPAPI_API_KEY: z.string().min(1).optional(),
  KEEPA_API_KEY: z.string().min(1).optional(),
  EBAY_CLIENT_ID: z.string().min(1).optional(),
  EBAY_CLIENT_SECRET: z.string().min(1).optional(),
  EBAY_REFRESH_TOKEN: z.string().min(1).optional(),
  EBAY_MARKETPLACE_ID: z.string().default('EBAY_US'),
  EBAY_SANDBOX: z.enum(['true', 'false']).default('false'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  LOCAL_AGENT_SHARED_SECRET: z.string().min(1).optional(),
  BUYSELL_ENCRYPTION_KEY: z.string().min(32).optional(),
  PORT: z.coerce.number().int().positive().default(3000)
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
