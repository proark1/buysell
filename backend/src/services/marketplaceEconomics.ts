import type { PrismaClient } from '@prisma/client';

export interface FeeRateCardView {
  key: string;
  marketplaceKey: string;
  marketplaceId: string;
  sellerType: string;
  categoryId?: string | null;
  categoryName?: string | null;
  variableFeeRate: number;
  aboveThresholdFeeRate?: number | null;
  thresholdAmount?: number | null;
  fixedFeeBelowThreshold?: number | null;
  fixedFeeAboveThreshold?: number | null;
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  version: string;
  active: boolean;
}

export interface VatModeView {
  key: string;
  marketplaceKey: string;
  label: string;
  description?: string | null;
  vatRate: number;
  sourcePriceIncludesVat: boolean;
  reclaimInputVat: boolean;
  collectOutputVat: boolean;
  outputVatIncludedInSalePrice: boolean;
  active: boolean;
}

type DecimalLike = number | string | { toNumber(): number } | null | undefined;

const numberValue = (value: DecimalLike): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
  return 0;
};

export const defaultGermanyFeeRateCard: FeeRateCardView = {
  key: 'ebay-de-commercial-default-2026-02',
  marketplaceKey: 'de',
  marketplaceId: 'EBAY_DE',
  sellerType: 'COMMERCIAL',
  categoryId: null,
  categoryName: 'Default eBay.de commercial seller rate',
  variableFeeRate: 0.12,
  aboveThresholdFeeRate: 0.03,
  thresholdAmount: 1990,
  fixedFeeBelowThreshold: 0.35,
  fixedFeeAboveThreshold: 0.45,
  currency: 'EUR',
  effectiveFrom: new Date('2026-02-12T00:00:00.000Z'),
  sourceLabel: 'eBay.de seller fee changes effective 2026-02-12',
  sourceUrl: 'https://www.ebay.de/verkaeuferportal/news/seller-news/2026-januar/gebuehrenaenderungen',
  version: 'ebay-de-commercial-2026-02',
  active: true
};

export const defaultGermanyVatModes: VatModeView[] = [
  {
    key: 'de_gross_no_reclaim',
    marketplaceKey: 'de',
    label: 'Germany gross prices, no input VAT reclaim',
    description: 'Treat source prices as gross paid prices and do not add extra source VAT.',
    vatRate: 0.19,
    sourcePriceIncludesVat: true,
    reclaimInputVat: false,
    collectOutputVat: false,
    outputVatIncludedInSalePrice: true,
    active: true
  },
  {
    key: 'de_registered_standard',
    marketplaceKey: 'de',
    label: 'Germany VAT registered',
    description: 'Credit input VAT and reserve output VAT from gross sale price.',
    vatRate: 0.19,
    sourcePriceIncludesVat: true,
    reclaimInputVat: true,
    collectOutputVat: true,
    outputVatIncludedInSalePrice: true,
    active: true
  },
  {
    key: 'de_legacy_additive',
    marketplaceKey: 'de',
    label: 'Germany additive 19 percent reserve',
    description: 'Legacy conservative mode that adds a 19 percent source-tax reserve.',
    vatRate: 0.19,
    sourcePriceIncludesVat: false,
    reclaimInputVat: false,
    collectOutputVat: false,
    outputVatIncludedInSalePrice: true,
    active: true
  }
];

function normalizeFeeRateCard(row: Record<string, unknown>): FeeRateCardView {
  return {
    key: String(row.key),
    marketplaceKey: String(row.marketplaceKey),
    marketplaceId: String(row.marketplaceId),
    sellerType: String(row.sellerType ?? 'COMMERCIAL'),
    categoryId: typeof row.categoryId === 'string' ? row.categoryId : null,
    categoryName: typeof row.categoryName === 'string' ? row.categoryName : null,
    variableFeeRate: numberValue(row.variableFeeRate as DecimalLike),
    aboveThresholdFeeRate: row.aboveThresholdFeeRate === null || row.aboveThresholdFeeRate === undefined ? null : numberValue(row.aboveThresholdFeeRate as DecimalLike),
    thresholdAmount: row.thresholdAmount === null || row.thresholdAmount === undefined ? null : numberValue(row.thresholdAmount as DecimalLike),
    fixedFeeBelowThreshold: row.fixedFeeBelowThreshold === null || row.fixedFeeBelowThreshold === undefined ? null : numberValue(row.fixedFeeBelowThreshold as DecimalLike),
    fixedFeeAboveThreshold: row.fixedFeeAboveThreshold === null || row.fixedFeeAboveThreshold === undefined ? null : numberValue(row.fixedFeeAboveThreshold as DecimalLike),
    currency: String(row.currency ?? 'EUR'),
    effectiveFrom: row.effectiveFrom instanceof Date ? row.effectiveFrom : new Date(String(row.effectiveFrom)),
    effectiveTo: row.effectiveTo instanceof Date || row.effectiveTo === null ? row.effectiveTo as Date | null : undefined,
    sourceLabel: typeof row.sourceLabel === 'string' ? row.sourceLabel : null,
    sourceUrl: typeof row.sourceUrl === 'string' ? row.sourceUrl : null,
    version: String(row.version),
    active: row.active !== false
  };
}

function normalizeVatMode(row: Record<string, unknown>): VatModeView {
  return {
    key: String(row.key),
    marketplaceKey: String(row.marketplaceKey),
    label: String(row.label),
    description: typeof row.description === 'string' ? row.description : null,
    vatRate: numberValue(row.vatRate as DecimalLike),
    sourcePriceIncludesVat: row.sourcePriceIncludesVat !== false,
    reclaimInputVat: row.reclaimInputVat === true,
    collectOutputVat: row.collectOutputVat === true,
    outputVatIncludedInSalePrice: row.outputVatIncludedInSalePrice !== false,
    active: row.active !== false
  };
}

export async function listMarketplaceEconomics(db: PrismaClient, marketplaceKey = 'de'): Promise<{
  feeRateCards: FeeRateCardView[];
  vatModes: VatModeView[];
}> {
  const dynamicDb = db as PrismaClient & {
    feeRateCard?: { findMany(args?: unknown): Promise<Array<Record<string, unknown>>> };
    vatMode?: { findMany(args?: unknown): Promise<Array<Record<string, unknown>>> };
  };

  const [feeRows, vatRows] = await Promise.all([
    dynamicDb.feeRateCard?.findMany({
      where: { marketplaceKey, active: true },
      orderBy: [{ categoryId: 'asc' }, { effectiveFrom: 'desc' }]
    }) ?? Promise.resolve([]),
    dynamicDb.vatMode?.findMany({
      where: { marketplaceKey, active: true },
      orderBy: [{ key: 'asc' }]
    }) ?? Promise.resolve([])
  ]);

  return {
    feeRateCards: feeRows.length ? feeRows.map(normalizeFeeRateCard) : marketplaceKey === 'de' ? [defaultGermanyFeeRateCard] : [],
    vatModes: vatRows.length ? vatRows.map(normalizeVatMode) : marketplaceKey === 'de' ? defaultGermanyVatModes : []
  };
}
