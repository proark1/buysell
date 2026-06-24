import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';
import type { EbayCandidateInput } from '../domain/products.js';
import { productFamilyKeyForEbayCandidate } from './productFamily.js';

export interface SoldCompInput {
  source: string;
  sourceFile: string;
  sourceRow: number;
  marketplaceId: string;
  soldAt?: Date;
  ebayItemId?: string;
  title: string;
  ebayUrl?: string;
  soldPrice?: number;
  shippingPrice?: number;
  totalPrice?: number;
  currency: string;
  condition?: string;
  category?: string;
  categoryId?: string;
  sellerName?: string;
  quantitySold: number;
  familyKey: string;
  normalizedTitle: string;
  raw: Record<string, string>;
}

export interface SoldCompImportSummary {
  source: string;
  sourceFile: string;
  parsedRows: number;
  importedRows: number;
  familyCount: number;
  marketplaceId: string;
}

const headerAliases = {
  soldAt: ['sold date', 'date sold', 'date', 'verkaufsdatum', 'datum', 'ended date'],
  ebayItemId: ['item id', 'item number', 'ebay item id', 'artikelnummer'],
  title: ['title', 'item title', 'item name', 'produkt', 'artikel', 'name'],
  ebayUrl: ['url', 'item url', 'link'],
  soldPrice: ['sold price', 'sale price', 'price', 'verkaufspreis', 'final price'],
  shippingPrice: ['shipping', 'shipping price', 'shipping cost', 'versand', 'versandkosten'],
  totalPrice: ['total price', 'total', 'total sale amount', 'umsatz', 'gross sale'],
  currency: ['currency', 'waehrung', 'wahrung'],
  condition: ['condition', 'zustand'],
  category: ['category', 'kategorie'],
  categoryId: ['category id', 'categoryid', 'kategorie id'],
  sellerName: ['seller', 'seller name', 'verkaeufer', 'verkaufer'],
  quantitySold: ['quantity', 'quantity sold', 'qty', 'anzahl', 'menge']
} as const;

type HeaderAlias = keyof typeof headerAliases;

type SoldCompDb = PrismaClient & {
  soldComp: {
    upsert(args: unknown): Promise<unknown>;
    count(args?: unknown): Promise<number>;
    findMany(args?: unknown): Promise<Array<{ familyKey: string }>>;
  };
};

const soldCompDb = (db: PrismaClient): SoldCompDb => db as unknown as SoldCompDb;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) rows.push([...row, cell]);
  return rows;
}

function normalizeHeader(value: string): string {
  return normalizeText(value.replace(/[._-]+/g, ' '));
}

function headerFor(alias: HeaderAlias, headers: string[]): number {
  const aliases = new Set(headerAliases[alias].map(normalizeHeader));
  return headers.findIndex((header) => aliases.has(header));
}

function recordValue(row: string[], headers: string[], alias: HeaderAlias): string | undefined {
  const index = headerFor(alias, headers);
  if (index < 0) return undefined;
  const value = row[index]?.trim();
  return value ? value : undefined;
}

function sourceRowRecord(row: string[], rawHeaders: string[]): Record<string, string> {
  return Object.fromEntries(rawHeaders.map((header, index) => [header || `Column ${index + 1}`, row[index] ?? '']));
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value
    .trim()
    .replace(/\s/g, '')
    .replace(/[€$£]/g, '');
  if (!cleaned) return undefined;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = parseNumber(value);
  return parsed === undefined ? fallback : Math.max(0, Math.round(parsed));
}

function parseSoldDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parts = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (parts) {
    const year = Number(parts[3].length === 2 ? `20${parts[3]}` : parts[3]);
    return new Date(Date.UTC(year, Number(parts[2]) - 1, Number(parts[1])));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function findHeaderRow(rows: string[][]): number {
  return rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headerFor('title', headers) >= 0 && (
      headerFor('soldPrice', headers) >= 0 ||
      headerFor('totalPrice', headers) >= 0
    );
  });
}

const money = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(2);

export function parseSoldCompCsv(text: string, options: {
  sourceFile?: string;
  source?: string;
  marketplaceId?: string;
  currency?: string;
} = {}): SoldCompInput[] {
  const rows = parseCsvRows(text);
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) throw new Error('Sold-comp CSV header row was not found.');

  const rawHeaders = rows[headerIndex].map((header) => header.trim());
  const headers = rawHeaders.map(normalizeHeader);
  const parsed: SoldCompInput[] = [];
  const source = options.source ?? 'terapeak';
  const marketplaceId = options.marketplaceId ?? 'EBAY_DE';
  const defaultCurrency = options.currency ?? 'EUR';

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((cell) => cell.trim())) continue;

    const title = recordValue(row, headers, 'title')?.trim();
    if (!title || /^total$/i.test(title)) continue;
    const soldPrice = parseNumber(recordValue(row, headers, 'soldPrice'));
    const totalPrice = parseNumber(recordValue(row, headers, 'totalPrice'));
    const shippingPrice = parseNumber(recordValue(row, headers, 'shippingPrice'));
    const ebay: EbayCandidateInput = {
      itemId: recordValue(row, headers, 'ebayItemId'),
      title,
      soldPrice: soldPrice ?? totalPrice,
      shippingPrice
    };
    parsed.push({
      source,
      sourceFile: options.sourceFile ?? 'unknown',
      sourceRow: index + 1,
      marketplaceId,
      soldAt: parseSoldDate(recordValue(row, headers, 'soldAt')),
      ebayItemId: ebay.itemId,
      title,
      ebayUrl: recordValue(row, headers, 'ebayUrl'),
      soldPrice,
      shippingPrice,
      totalPrice,
      currency: recordValue(row, headers, 'currency') ?? defaultCurrency,
      condition: recordValue(row, headers, 'condition'),
      category: recordValue(row, headers, 'category'),
      categoryId: recordValue(row, headers, 'categoryId'),
      sellerName: recordValue(row, headers, 'sellerName'),
      quantitySold: parseInteger(recordValue(row, headers, 'quantitySold'), 1),
      familyKey: productFamilyKeyForEbayCandidate(ebay),
      normalizedTitle: normalizeText(title),
      raw: sourceRowRecord(row, rawHeaders)
    });
  }

  return parsed;
}

export async function importSoldCompRows(db: PrismaClient, rows: SoldCompInput[]): Promise<SoldCompImportSummary> {
  const client = soldCompDb(db);
  let importedRows = 0;
  for (const row of rows) {
    await client.soldComp.upsert({
      where: {
        sourceFile_sourceRow: {
          sourceFile: row.sourceFile,
          sourceRow: row.sourceRow
        }
      },
      create: {
        source: row.source,
        sourceFile: row.sourceFile,
        sourceRow: row.sourceRow,
        marketplaceId: row.marketplaceId,
        soldAt: row.soldAt,
        ebayItemId: row.ebayItemId,
        title: row.title,
        ebayUrl: row.ebayUrl,
        soldPrice: money(row.soldPrice),
        shippingPrice: money(row.shippingPrice),
        totalPrice: money(row.totalPrice),
        currency: row.currency,
        condition: row.condition,
        category: row.category,
        categoryId: row.categoryId,
        sellerName: row.sellerName,
        quantitySold: row.quantitySold,
        familyKey: row.familyKey,
        normalizedTitle: row.normalizedTitle,
        rawJson: row.raw
      },
      update: {
        source: row.source,
        marketplaceId: row.marketplaceId,
        soldAt: row.soldAt,
        ebayItemId: row.ebayItemId,
        title: row.title,
        ebayUrl: row.ebayUrl,
        soldPrice: money(row.soldPrice),
        shippingPrice: money(row.shippingPrice),
        totalPrice: money(row.totalPrice),
        currency: row.currency,
        condition: row.condition,
        category: row.category,
        categoryId: row.categoryId,
        sellerName: row.sellerName,
        quantitySold: row.quantitySold,
        familyKey: row.familyKey,
        normalizedTitle: row.normalizedTitle,
        rawJson: row.raw
      }
    });
    importedRows += 1;
  }

  return {
    source: rows[0]?.source ?? 'terapeak',
    sourceFile: rows[0]?.sourceFile ?? 'unknown',
    parsedRows: rows.length,
    importedRows,
    familyCount: new Set(rows.map((row) => row.familyKey)).size,
    marketplaceId: rows[0]?.marketplaceId ?? 'EBAY_DE'
  };
}

export async function importSoldCompCsvFile(db: PrismaClient, path: string, options: {
  source?: string;
  marketplaceId?: string;
  currency?: string;
} = {}): Promise<SoldCompImportSummary> {
  const text = await readFile(path, 'utf8');
  const rows = parseSoldCompCsv(text, {
    sourceFile: basename(path),
    ...options
  });
  return importSoldCompRows(db, rows);
}

export async function soldCompSummary(db: PrismaClient, marketplaceId = 'EBAY_DE'): Promise<{
  soldCompCount: number;
  familyCount: number;
}> {
  const client = soldCompDb(db);
  const [soldCompCount, families] = await Promise.all([
    client.soldComp.count({ where: { marketplaceId } }),
    client.soldComp.findMany({ where: { marketplaceId }, distinct: ['familyKey'], select: { familyKey: true } })
  ]);
  return { soldCompCount, familyCount: families.length };
}
