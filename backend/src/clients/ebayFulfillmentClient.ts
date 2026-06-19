import { z } from 'zod';

const ebayOrderLineItemSchema = z.object({
  legacyItemId: z.string().optional(),
  lineItemId: z.string().optional(),
  title: z.string().optional()
}).passthrough();

const ebayOrderSchema = z.object({
  orderId: z.string(),
  buyer: z.object({
    username: z.string().optional()
  }).passthrough().optional(),
  pricingSummary: z.object({
    total: z.object({
      value: z.string().optional(),
      currency: z.string().optional()
    }).passthrough().optional()
  }).passthrough().optional(),
  fulfillmentStartInstructions: z.array(z.object({
    shippingStep: z.object({
      shipTo: z.object({
        fullName: z.string().optional(),
        contactAddress: z.unknown().optional()
      }).passthrough().optional()
    }).passthrough().optional()
  }).passthrough()).optional(),
  lineItems: z.array(ebayOrderLineItemSchema).optional()
}).passthrough();

const ebayOrdersResponseSchema = z.object({
  orders: z.array(ebayOrderSchema).optional(),
  next: z.string().optional()
}).passthrough();

export interface EbayFulfillmentOrder {
  orderId: string;
  buyerName?: string;
  buyerShippingAddress?: unknown;
  total?: number;
  currency?: string;
  lineItems: Array<{
    ebayItemId?: string;
    lineItemId?: string;
    title?: string;
  }>;
}

type ParsedEbayOrder = {
  orderId: string;
  buyer?: { username?: string };
  pricingSummary?: {
    total?: {
      value?: string;
      currency?: string;
    };
  };
  fulfillmentStartInstructions?: Array<{
    shippingStep?: {
      shipTo?: {
        fullName?: string;
        contactAddress?: unknown;
      };
    };
  }>;
  lineItems?: Array<{
    legacyItemId?: string;
    lineItemId?: string;
    title?: string;
  }>;
};

export interface FetchEbayOrdersOptions {
  accessToken: string;
  sandbox: boolean;
  createdAfter: Date;
  limit?: number;
}

function endpoint(sandbox: boolean): string {
  return sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

function normalizeOrder(order: ParsedEbayOrder): EbayFulfillmentOrder {
  const shipTo = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
  return {
    orderId: order.orderId,
    buyerName: shipTo?.fullName ?? order.buyer?.username,
    buyerShippingAddress: shipTo?.contactAddress,
    total: numberValue(order.pricingSummary?.total?.value),
    currency: order.pricingSummary?.total?.currency,
    lineItems: (order.lineItems ?? []).map((item) => ({
      ebayItemId: item.legacyItemId,
      lineItemId: item.lineItemId,
      title: item.title
    }))
  };
}

export async function fetchRecentEbayOrders(options: FetchEbayOrdersOptions): Promise<EbayFulfillmentOrder[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const params = new URLSearchParams({
    filter: `creationdate:[${options.createdAfter.toISOString()}..]`,
    limit: String(limit)
  });

  const response = await fetch(`${endpoint(options.sandbox)}/sell/fulfillment/v1/order?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body.trim() ? `eBay order sync failed with status ${response.status}: ${body.trim().slice(0, 500)}` : `eBay order sync failed with status ${response.status}`);
  }

  const payload = ebayOrdersResponseSchema.parse(await response.json());
  return (payload.orders ?? []).map(normalizeOrder);
}
