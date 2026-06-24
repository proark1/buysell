import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';
import type { EbayCandidateInput } from '../domain/products.js';
import { productFamilyKeyForEbayCandidate } from './productFamily.js';

export interface SoldWinnerSeedInput {
  sourceFile: string;
  sourceRow: number;
  soldAt?: Date;
  ebayItemId?: string;
  orderNo?: string;
  title: string;
  listingType?: string;
  quantitySold: number;
  itemCost?: number;
  sellingPrice?: number;
  ebayFees?: number;
  shippingCost?: number;
  discount?: number;
  addFee?: number;
  totalSaleAmount?: number;
  netProfit?: number;
  totalCost?: number;
  familyKey: string;
  normalizedTitle: string;
  raw: Record<string, string>;
}

export interface SoldWinnerImportSummary {
  sourceFile: string;
  parsedRows: number;
  importedRows: number;
  skippedRows: number;
  watchlistUpserts: number;
  familyCount: number;
  totalQuantitySold: number;
  totalNetProfit: number;
}

export interface WinnerSignal {
  familyKey: string;
  title: string;
  saleCount: number;
  totalQuantitySold: number;
  totalNetProfit: number;
  averageSellingPrice?: number;
  averageUnitCost?: number;
  lastSoldAt?: Date;
  tokens: string[];
  strength: number;
}

export interface WinnerSignalIndex {
  byFamilyKey: Map<string, WinnerSignal>;
  signals: WinnerSignal[];
  totalSeeds: number;
}

export interface WinnerSignalScore {
  score: number;
  familyKey?: string;
  matchType?: 'FAMILY' | 'SIMILAR';
  reasons: string[];
}

type DecimalLike = number | string | { toNumber(): number } | null | undefined;

export interface SoldWinnerSeedRecord {
  familyKey: string;
  title: string;
  ebayItemId?: string | null;
  orderNo?: string | null;
  quantitySold: number;
  sellingPrice?: DecimalLike;
  itemCost?: DecimalLike;
  netProfit?: DecimalLike;
  soldAt?: Date | null;
}

export interface ReplenishmentWatchItemRecord {
  id: string;
  familyKey: string;
  title: string;
  saleCount: number;
  totalQuantitySold: number;
  averageSellingPrice?: DecimalLike;
  averageUnitCost?: DecimalLike;
  totalNetProfit: DecimalLike;
  targetBuyPrice?: DecimalLike;
  targetSellPrice?: DecimalLike;
  priority: number;
  status: string;
  lastSoldAt?: Date | null;
}

interface SoldWinnerSeedDelegate {
  count(args?: unknown): Promise<number>;
  findMany(args?: unknown): Promise<SoldWinnerSeedRecord[]>;
  upsert(args: unknown): Promise<unknown>;
}

interface ReplenishmentWatchItemDelegate {
  findMany(args?: unknown): Promise<ReplenishmentWatchItemRecord[]>;
  upsert(args: unknown): Promise<unknown>;
}

export type SoldWinnerDb = PrismaClient & {
  soldWinnerSeed: SoldWinnerSeedDelegate;
  replenishmentWatchItem: ReplenishmentWatchItemDelegate;
};

export const soldWinnerDb = (db: PrismaClient): SoldWinnerDb => db as unknown as SoldWinnerDb;

const headerAliases: Record<Exclude<keyof SoldWinnerSeedInput, 'sourceFile' | 'sourceRow' | 'familyKey' | 'normalizedTitle' | 'raw'>, string[]> = {
  soldAt: ['date', 'sold date', 'verkaufsdatum', 'datum'],
  ebayItemId: ['item id', 'item number', 'ebay item id', 'artikelnummer'],
  orderNo: ['order no.', 'order no', 'order number', 'bestellnummer'],
  title: ['item name', 'title', 'product title', 'produkt', 'artikel', 'name'],
  listingType: ['listing type', 'format', 'listing format'],
  quantitySold: ['quantity sold', 'quantity', 'qty', 'anzahl', 'menge'],
  itemCost: ['item cost', 'buy cost', 'source cost', 'unit cost', 'einkaufspreis'],
  sellingPrice: ['selling price', 'sold price', 'price', 'verkaufspreis'],
  ebayFees: ['ebay fees', 'fees', 'gebuehren', 'gebuhren'],
  shippingCost: ['shipping cost', 'shipping', 'versandkosten'],
  discount: ['discount', 'rabatt'],
  addFee: ['add fee', 'additional fee'],
  totalSaleAmount: ['total sale amount', 'gross sale', 'umsatz'],
  netProfit: ['net profit', 'profit', 'gewinn'],
  totalCost: ['total cost', 'kosten gesamt']
};

const monthByName: Record<string, number> = {
  jan: 0,
  january: 0,
  januar: 0,
  feb: 1,
  february: 1,
  februar: 1,
  mar: 2,
  march: 2,
  maerz: 2,
  mrz: 2,
  apr: 3,
  april: 3,
  may: 4,
  mai: 4,
  jun: 5,
  june: 5,
  juni: 5,
  jul: 6,
  july: 6,
  juli: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  okt: 9,
  oktober: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
  dez: 11,
  dezember: 11
};

const stopWords = new Set([
  'der',
  'die',
  'das',
  'und',
  'oder',
  'mit',
  'fuer',
  'fur',
  'the',
  'and',
  'for',
  'von',
  'aus',
  'neu',
  'new',
  'original',
  'set',
  'pack',
  'stueck',
  'stk',
  'pcs',
  'piece',
  'pieces'
]);

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const money = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(2);

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

export function soldWinnerTokens(value: string): string[] {
  return [...new Set(normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token)))];
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

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string): string {
  return normalizeText(value.replace(/[._-]+/g, ' '));
}

function headerFor(alias: keyof typeof headerAliases, headers: string[]): number {
  const aliases = new Set(headerAliases[alias].map(normalizeHeader));
  return headers.findIndex((header) => aliases.has(header));
}

function recordValue(row: string[], headers: string[], alias: keyof typeof headerAliases): string | undefined {
  const index = headerFor(alias, headers);
  if (index < 0) return undefined;
  const value = row[index]?.trim();
  return value ? value : undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value
    .trim()
    .replace(/\s/g, '')
    .replace(/[€$£]/g, '');
  if (!cleaned || cleaned.startsWith('#')) return undefined;

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
  const normalized = normalizeText(value);
  const isoMatch = /^(\d{4}) (\d{1,2}) (\d{1,2})$/.exec(normalized);
  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }

  const textMatch = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(normalized);
  if (textMatch) {
    const month = monthByName[textMatch[2]];
    if (month !== undefined) return new Date(Date.UTC(Number(textMatch[3]), month, Number(textMatch[1])));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function sourceRowRecord(row: string[], rawHeaders: string[]): Record<string, string> {
  return Object.fromEntries(rawHeaders.map((header, index) => [header || `Column ${index + 1}`, row[index] ?? '']));
}

function findHeaderRow(rows: string[][]): number {
  return rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headerFor('title', headers) >= 0 && (
      headerFor('sellingPrice', headers) >= 0 ||
      headerFor('netProfit', headers) >= 0 ||
      headerFor('quantitySold', headers) >= 0
    );
  });
}

export function parseSoldWinnerCsv(text: string, sourceFile = 'unknown'): SoldWinnerSeedInput[] {
  const rows = parseCsvRows(text);
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) throw new Error('Sold winner CSV header row was not found.');

  const rawHeaders = rows[headerIndex].map((header) => header.trim());
  const headers = rawHeaders.map(normalizeHeader);
  const parsed: SoldWinnerSeedInput[] = [];

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((cell) => cell.trim())) continue;

    const title = recordValue(row, headers, 'title')?.trim();
    if (!title || /^total$/i.test(title) || title.startsWith('#')) continue;

    const raw = sourceRowRecord(row, rawHeaders);
    const quantitySold = parseInteger(recordValue(row, headers, 'quantitySold'), 1);
    const ebay: EbayCandidateInput = {
      itemId: recordValue(row, headers, 'ebayItemId'),
      title,
      soldPrice: parseNumber(recordValue(row, headers, 'sellingPrice'))
    };

    parsed.push({
      sourceFile,
      sourceRow: index + 1,
      soldAt: parseSoldDate(recordValue(row, headers, 'soldAt')),
      ebayItemId: ebay.itemId,
      orderNo: recordValue(row, headers, 'orderNo'),
      title,
      listingType: recordValue(row, headers, 'listingType'),
      quantitySold,
      itemCost: parseNumber(recordValue(row, headers, 'itemCost')),
      sellingPrice: ebay.soldPrice,
      ebayFees: parseNumber(recordValue(row, headers, 'ebayFees')),
      shippingCost: parseNumber(recordValue(row, headers, 'shippingCost')),
      discount: parseNumber(recordValue(row, headers, 'discount')),
      addFee: parseNumber(recordValue(row, headers, 'addFee')),
      totalSaleAmount: parseNumber(recordValue(row, headers, 'totalSaleAmount')),
      netProfit: parseNumber(recordValue(row, headers, 'netProfit')),
      totalCost: parseNumber(recordValue(row, headers, 'totalCost')),
      familyKey: productFamilyKeyForEbayCandidate(ebay),
      normalizedTitle: normalizeText(title),
      raw
    });
  }

  return parsed;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    const parsed = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown): Date | undefined {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;
}

function buildSignalFromSeeds(familyKey: string, rows: Array<{
  title: string;
  quantitySold: number;
  sellingPrice?: unknown;
  itemCost?: unknown;
  netProfit?: unknown;
  soldAt?: Date | null;
}>): WinnerSignal {
  const saleCount = rows.length;
  const totalQuantitySold = rows.reduce((sum, row) => sum + Math.max(0, row.quantitySold), 0);
  const totalNetProfit = rows.reduce((sum, row) => sum + numberValue(row.netProfit), 0);
  const sellingPrices = rows.map((row) => numberValue(row.sellingPrice)).filter((value) => value > 0);
  const itemCosts = rows.map((row) => numberValue(row.itemCost)).filter((value) => value > 0);
  const sorted = [...rows].sort((a, b) => b.quantitySold - a.quantitySold || numberValue(b.netProfit) - numberValue(a.netProfit));
  const title = sorted[0]?.title ?? familyKey;
  const dates = rows.map((row) => dateValue(row.soldAt)).filter((value): value is Date => Boolean(value));
  const lastSoldAt = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined;
  const strength = clamp(
    (Math.min(saleCount, 8) * 0.9) +
    (Math.min(totalQuantitySold, 20) * 0.35) +
    (Math.min(Math.max(totalNetProfit, 0), 120) / 20),
    0,
    18
  );

  return {
    familyKey,
    title,
    saleCount,
    totalQuantitySold,
    totalNetProfit: roundMoney(totalNetProfit),
    averageSellingPrice: sellingPrices.length ? roundMoney(sellingPrices.reduce((sum, value) => sum + value, 0) / sellingPrices.length) : undefined,
    averageUnitCost: itemCosts.length ? roundMoney(itemCosts.reduce((sum, value) => sum + value, 0) / itemCosts.length) : undefined,
    lastSoldAt,
    tokens: soldWinnerTokens(title),
    strength: Math.round(strength)
  };
}

export function buildWinnerSignalIndexFromRows(rows: Array<{
  familyKey: string;
  title: string;
  quantitySold: number;
  sellingPrice?: unknown;
  itemCost?: unknown;
  netProfit?: unknown;
  soldAt?: Date | null;
}>): WinnerSignalIndex {
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    if (numberValue(row.netProfit) <= 0) continue;
    const family = grouped.get(row.familyKey) ?? [];
    family.push(row);
    grouped.set(row.familyKey, family);
  }

  const signals = [...grouped.entries()]
    .map(([familyKey, familyRows]) => buildSignalFromSeeds(familyKey, familyRows))
    .sort((a, b) => b.strength - a.strength || b.totalQuantitySold - a.totalQuantitySold);
  return {
    byFamilyKey: new Map(signals.map((signal) => [signal.familyKey, signal])),
    signals,
    totalSeeds: rows.length
  };
}

function recommendedTestBuyQuantity(signal: WinnerSignal): number {
  if (signal.saleCount >= 8 && signal.totalQuantitySold >= 20 && signal.totalNetProfit >= 80) return 5;
  if (signal.saleCount >= 4 && signal.totalQuantitySold >= 8 && signal.totalNetProfit >= 30) return 3;
  return 1;
}

function watchPriority(signal: WinnerSignal): number {
  return Math.round(clamp(100 - signal.strength * 3 - Math.min(signal.totalQuantitySold, 30), 10, 100));
}

function targetBuyPrice(signal: WinnerSignal): number | undefined {
  if (signal.averageSellingPrice === undefined) return undefined;
  const target = signal.averageUnitCost !== undefined
    ? Math.min(signal.averageUnitCost, signal.averageSellingPrice * 0.68)
    : signal.averageSellingPrice * 0.68;
  return roundMoney(target);
}

export async function loadWinnerSignalIndex(db: PrismaClient, take = 2_000): Promise<WinnerSignalIndex> {
  const rows = await soldWinnerDb(db).soldWinnerSeed.findMany({
    where: { netProfit: { gt: '0' } },
    orderBy: [{ soldAt: 'desc' }, { importedAt: 'desc' }],
    take,
    select: {
      familyKey: true,
      title: true,
      quantitySold: true,
      sellingPrice: true,
      itemCost: true,
      netProfit: true,
      soldAt: true
    }
  });
  return buildWinnerSignalIndexFromRows(rows);
}

export function scoreWinnerSignalForText(title: string, familyKey: string | undefined, index: WinnerSignalIndex | undefined): WinnerSignalScore {
  if (!index || index.signals.length === 0) return { score: 0, reasons: [] };

  const familySignal = familyKey ? index.byFamilyKey.get(familyKey) : undefined;
  if (familySignal) {
    const score = Math.round(clamp(10 + familySignal.strength * 0.65, 10, 20));
    return {
      score,
      familyKey: familySignal.familyKey,
      matchType: 'FAMILY',
      reasons: [`Matches imported sold-winner family (${familySignal.saleCount} sales, ${familySignal.totalQuantitySold} units).`]
    };
  }

  const tokens = soldWinnerTokens(title);
  if (tokens.length < 2) return { score: 0, reasons: [] };
  const tokenSet = new Set(tokens);
  let best: { signal: WinnerSignal; similarity: number; overlap: number } | undefined;

  for (const signal of index.signals.slice(0, 750)) {
    if (signal.tokens.length < 2) continue;
    const overlap = signal.tokens.filter((token) => tokenSet.has(token)).length;
    if (overlap < 2) continue;
    const union = new Set([...tokens, ...signal.tokens]).size;
    const similarity = union > 0 ? overlap / union : 0;
    if (!best || similarity > best.similarity || (similarity === best.similarity && signal.strength > best.signal.strength)) {
      best = { signal, similarity, overlap };
    }
  }

  if (!best || best.similarity < 0.24) return { score: 0, reasons: [] };
  const score = Math.round(clamp(best.similarity * 22 + best.signal.strength * 0.25, 4, 16));
  return {
    score,
    familyKey: best.signal.familyKey,
    matchType: 'SIMILAR',
    reasons: [`Similar to imported sold winner "${best.signal.title}" (${best.overlap} shared terms).`]
  };
}

async function upsertWatchItems(db: PrismaClient, familyKeys: string[]): Promise<number> {
  const client = soldWinnerDb(db);
  let count = 0;
  for (const familyKey of [...new Set(familyKeys)]) {
    const rows = await client.soldWinnerSeed.findMany({
      where: { familyKey },
      select: {
        familyKey: true,
        title: true,
        ebayItemId: true,
        quantitySold: true,
        sellingPrice: true,
        itemCost: true,
        netProfit: true,
        soldAt: true,
        orderNo: true
      }
    });
    if (!rows.length) continue;
    const signal = buildSignalFromSeeds(familyKey, rows);
    const bestRow = [...rows].sort((a, b) => b.quantitySold - a.quantitySold || numberValue(b.netProfit) - numberValue(a.netProfit))[0];

    await client.replenishmentWatchItem.upsert({
      where: { familyKey },
      create: {
        familyKey,
        title: signal.title.slice(0, 240),
        ebayItemId: bestRow?.ebayItemId,
        saleCount: signal.saleCount,
        totalQuantitySold: signal.totalQuantitySold,
        averageSellingPrice: money(signal.averageSellingPrice),
        averageUnitCost: money(signal.averageUnitCost),
        totalNetProfit: money(signal.totalNetProfit) ?? '0.00',
        lastSoldAt: signal.lastSoldAt,
        targetBuyPrice: money(targetBuyPrice(signal)),
        targetSellPrice: money(signal.averageSellingPrice),
        priority: watchPriority(signal),
        metadataJson: {
          recommendedTestBuyQuantity: recommendedTestBuyQuantity(signal),
          winnerStrength: signal.strength,
          importedOrderNos: rows.map((row) => row.orderNo).filter(Boolean).slice(0, 20),
          tokens: signal.tokens
        }
      },
      update: {
        title: signal.title.slice(0, 240),
        ebayItemId: bestRow?.ebayItemId,
        saleCount: signal.saleCount,
        totalQuantitySold: signal.totalQuantitySold,
        averageSellingPrice: money(signal.averageSellingPrice),
        averageUnitCost: money(signal.averageUnitCost),
        totalNetProfit: money(signal.totalNetProfit) ?? '0.00',
        lastSoldAt: signal.lastSoldAt,
        targetBuyPrice: money(targetBuyPrice(signal)),
        targetSellPrice: money(signal.averageSellingPrice),
        status: 'WATCHING',
        priority: watchPriority(signal),
        metadataJson: {
          recommendedTestBuyQuantity: recommendedTestBuyQuantity(signal),
          winnerStrength: signal.strength,
          importedOrderNos: rows.map((row) => row.orderNo).filter(Boolean).slice(0, 20),
          tokens: signal.tokens
        }
      }
    });
    count += 1;
  }
  return count;
}

export async function importSoldWinnerRows(db: PrismaClient, rows: SoldWinnerSeedInput[]): Promise<SoldWinnerImportSummary> {
  const client = soldWinnerDb(db);
  let importedRows = 0;
  for (const row of rows) {
    await client.soldWinnerSeed.upsert({
      where: {
        sourceFile_sourceRow: {
          sourceFile: row.sourceFile,
          sourceRow: row.sourceRow
        }
      },
      create: {
        sourceFile: row.sourceFile,
        sourceRow: row.sourceRow,
        soldAt: row.soldAt,
        ebayItemId: row.ebayItemId,
        orderNo: row.orderNo,
        title: row.title,
        listingType: row.listingType,
        quantitySold: row.quantitySold,
        itemCost: money(row.itemCost),
        sellingPrice: money(row.sellingPrice),
        ebayFees: money(row.ebayFees),
        shippingCost: money(row.shippingCost),
        discount: money(row.discount),
        addFee: money(row.addFee),
        totalSaleAmount: money(row.totalSaleAmount),
        netProfit: money(row.netProfit),
        totalCost: money(row.totalCost),
        familyKey: row.familyKey,
        normalizedTitle: row.normalizedTitle,
        rawJson: row.raw
      },
      update: {
        soldAt: row.soldAt,
        ebayItemId: row.ebayItemId,
        orderNo: row.orderNo,
        title: row.title,
        listingType: row.listingType,
        quantitySold: row.quantitySold,
        itemCost: money(row.itemCost),
        sellingPrice: money(row.sellingPrice),
        ebayFees: money(row.ebayFees),
        shippingCost: money(row.shippingCost),
        discount: money(row.discount),
        addFee: money(row.addFee),
        totalSaleAmount: money(row.totalSaleAmount),
        netProfit: money(row.netProfit),
        totalCost: money(row.totalCost),
        familyKey: row.familyKey,
        normalizedTitle: row.normalizedTitle,
        rawJson: row.raw
      }
    });
    importedRows += 1;
  }

  const watchlistUpserts = await upsertWatchItems(db, rows.map((row) => row.familyKey));
  const totalNetProfit = rows.reduce((sum, row) => sum + (row.netProfit ?? 0), 0);
  const totalQuantitySold = rows.reduce((sum, row) => sum + row.quantitySold, 0);
  return {
    sourceFile: rows[0]?.sourceFile ?? 'unknown',
    parsedRows: rows.length,
    importedRows,
    skippedRows: 0,
    watchlistUpserts,
    familyCount: new Set(rows.map((row) => row.familyKey)).size,
    totalQuantitySold,
    totalNetProfit: roundMoney(totalNetProfit)
  };
}

export async function importSoldWinnerCsvFile(db: PrismaClient, path: string): Promise<SoldWinnerImportSummary> {
  const text = await readFile(path, 'utf8');
  const sourceFile = basename(path);
  const rows = parseSoldWinnerCsv(text, sourceFile);
  return importSoldWinnerRows(db, rows);
}

export async function listReplenishmentTargets(db: PrismaClient, take = 50): Promise<Array<{
  profileKey: string;
  categoryKey?: string;
  query: string;
}>> {
  const rows = await soldWinnerDb(db).replenishmentWatchItem.findMany({
    where: { status: 'WATCHING' },
    orderBy: [{ priority: 'asc' }, { lastSoldAt: 'desc' }],
    take,
    select: { title: true }
  });
  return rows.map((row) => ({
    profileKey: 'proven-replenishment',
    query: row.title.slice(0, 140)
  }));
}
