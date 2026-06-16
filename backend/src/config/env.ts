import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
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
  BUYSELL_ENCRYPTION_KEY: z.string().min(16).optional(),
  PORT: z.coerce.number().int().positive().default(3000)
});

export const env = envSchema.parse(process.env);
