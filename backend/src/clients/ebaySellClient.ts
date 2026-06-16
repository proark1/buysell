export interface EbayListingDraftInput {
  sku: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  marketplaceId: string;
}

export interface EbayListingDraftResult {
  sku: string;
  marketplaceId: string;
  status: 'PREPARED';
  title: string;
  price: number;
  quantity: number;
}

export function prepareEbayListingDraft(input: EbayListingDraftInput): EbayListingDraftResult {
  return {
    sku: input.sku,
    marketplaceId: input.marketplaceId,
    status: 'PREPARED',
    title: input.title.slice(0, 80),
    price: Math.round(input.price * 100) / 100,
    quantity: input.quantity
  };
}
