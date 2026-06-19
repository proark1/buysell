import type { PrismaClient } from '@prisma/client';
import {
  createEbayOffer,
  createOrReplaceEbayInventoryItem,
  getEbayAccessToken,
  prepareEbayListingDraft,
  publishEbayOffer,
  updateEbayOfferPriceQuantity,
  withdrawEbayOffer
} from '../clients/ebaySellClient.js';
import { getSecret } from './secrets.js';
import { badRequest, conflict, notFound } from '../security/httpErrors.js';
import { recordAmazonPurchaseRows } from '../repositories/orderRepository.js';
import { getActiveRuleConfig, type ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { enforceDailyListingLimit, enforceDailyPurchaseLimit, lockDailyPurchaseBudget } from './spendLimits.js';

interface ActionPayload {
  listingId?: string;
  ebayDraft?: unknown;
  ebayOfferId?: string;
  recommendedPrice?: number;
  recommendedTitle?: string;
  recommendedDescription?: string;
  asin?: string;
  ebayPublishMode?: 'PREPARE' | 'DRAFT' | 'PUBLISH';
  categoryId?: string;
  merchantLocationKey?: string;
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  condition?: string;
  brand?: string;
  imageUrls?: string[];
  aspects?: Record<string, string[]>;
}

export interface ExecuteActionInput {
  actor?: string;
  idempotencyKey?: string;
  result?: Record<string, unknown>;
}

type ActionRecord = NonNullable<Awaited<ReturnType<PrismaClient['actionItem']['findUnique']>>>;

const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const actionPayload = (value: unknown): ActionPayload => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as ActionPayload : {}
);

const idempotentReplay = (payload: Record<string, unknown>, key: string | undefined): unknown | undefined => {
  if (!key) return undefined;
  return payload.executionIdempotencyKey === key && payload.executionResponse
    ? { idempotent: true, result: payload.executionResponse }
    : undefined;
};

const executionMetadata = (input: ExecuteActionInput, response: unknown): Record<string, unknown> => ({
  executionResult: input.result,
  executionIdempotencyKey: input.idempotencyKey,
  executionCompletedAt: new Date().toISOString(),
  executionResponse: response
});

const listingMode = (payload: ActionPayload, result: Record<string, unknown> | undefined): 'PREPARE' | 'DRAFT' | 'PUBLISH' => {
  const raw = stringValue(result?.ebayPublishMode) ?? stringValue(result?.listingMode) ?? payload.ebayPublishMode;
  if (raw === 'DRAFT' || raw === 'PUBLISH') return raw;
  if (result?.publishToEbay === true) return 'PUBLISH';
  if (result?.createEbayOffer === true) return 'DRAFT';
  return 'PREPARE';
};

async function ebayInventoryCredentials(db: PrismaClient): Promise<{
  accessToken?: string;
  sandbox: boolean;
  marketplaceId: string;
}> {
  const marketplaceId = (await getSecret(db, 'EBAY_MARKETPLACE_ID')) ?? 'EBAY_US';
  const clientId = await getSecret(db, 'EBAY_CLIENT_ID');
  const clientSecret = await getSecret(db, 'EBAY_CLIENT_SECRET');
  const refreshToken = await getSecret(db, 'EBAY_REFRESH_TOKEN');
  const sandbox = (await getSecret(db, 'EBAY_SANDBOX')) === 'true';

  if (!clientId || !clientSecret || !refreshToken) return { sandbox, marketplaceId };
  return {
    accessToken: await getEbayAccessToken({ clientId, clientSecret, refreshToken, sandbox }),
    sandbox,
    marketplaceId
  };
}

const payloadString = (payload: ActionPayload, result: Record<string, unknown> | undefined, key: keyof ActionPayload): string | undefined => (
  stringValue(result?.[key]) ?? (typeof payload[key] === 'string' ? payload[key] as string : undefined)
);

function requiredEbayListingFields(payload: ActionPayload, result: Record<string, unknown> | undefined): {
  categoryId: string;
  merchantLocationKey: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
} {
  const categoryId = payloadString(payload, result, 'categoryId');
  const merchantLocationKey = payloadString(payload, result, 'merchantLocationKey');
  const fulfillmentPolicyId = payloadString(payload, result, 'fulfillmentPolicyId');
  const paymentPolicyId = payloadString(payload, result, 'paymentPolicyId');
  const returnPolicyId = payloadString(payload, result, 'returnPolicyId');

  const missing = [
    categoryId ? undefined : 'categoryId',
    merchantLocationKey ? undefined : 'merchantLocationKey',
    fulfillmentPolicyId ? undefined : 'fulfillmentPolicyId',
    paymentPolicyId ? undefined : 'paymentPolicyId',
    returnPolicyId ? undefined : 'returnPolicyId'
  ].filter((item): item is string => Boolean(item));
  if (missing.length) {
    throw badRequest(`eBay DRAFT/PUBLISH requires ${missing.join(', ')}`, 'EBAY_LISTING_FIELDS_REQUIRED');
  }
  if (!categoryId || !merchantLocationKey || !fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    throw badRequest('eBay DRAFT/PUBLISH has missing required fields', 'EBAY_LISTING_FIELDS_REQUIRED');
  }

  return { categoryId, merchantLocationKey, fulfillmentPolicyId, paymentPolicyId, returnPolicyId };
}

async function releaseExecutingClaim(db: PrismaClient, actionId: string): Promise<void> {
  // Hand the action back to APPROVED so a failed execution can be retried.
  await db.actionItem.updateMany({ where: { id: actionId, status: 'EXECUTING' }, data: { status: 'APPROVED' } });
}

async function runClaimedAction(
  db: PrismaClient,
  action: ActionRecord,
  config: ActiveRuleConfig,
  input: ExecuteActionInput
): Promise<unknown> {
  const actor = input.actor ?? 'action-executor';

  if (action.type === 'LIST') {
    const payload = actionPayload(action.payloadJson);
    // Safe mode downgrades every listing to a local PREPARE draft; it never
    // creates or publishes a live eBay offer.
    let mode = listingMode(payload, input.result);
    if (config.safeMode) mode = 'PREPARE';
    if (mode !== 'PREPARE') await enforceDailyListingLimit(db);
    const marketplaceId = (await getSecret(db, 'EBAY_MARKETPLACE_ID')) ?? 'EBAY_US';
    const draft = prepareEbayListingDraft({
      sku: action.productCandidateId ?? action.id,
      title: payload.recommendedTitle ?? `Pending listing ${action.id}`,
      description: payload.recommendedDescription ?? action.reason,
      price: payload.recommendedPrice ?? 0,
      quantity: 1,
      marketplaceId
    });
    let ebayResult: unknown = { mode, skipped: true, reason: 'Mode PREPARE only creates a local draft payload.' };
    let ebayOfferId: string | undefined;
    let ebayItemId: string | undefined;

    if (mode !== 'PREPARE') {
      if (draft.price <= 0) throw badRequest('eBay DRAFT/PUBLISH requires a positive recommendedPrice', 'EBAY_LISTING_PRICE_REQUIRED');
      const { accessToken, sandbox } = await ebayInventoryCredentials(db);
      if (!accessToken) {
        throw badRequest('eBay credentials are required for DRAFT or PUBLISH listing execution', 'EBAY_CREDENTIALS_REQUIRED');
      }
      const required = requiredEbayListingFields(payload, input.result);
      await createOrReplaceEbayInventoryItem({
        sku: draft.sku,
        accessToken,
        sandbox,
        title: draft.title,
        description: payload.recommendedDescription ?? action.reason,
        quantity: draft.quantity,
        condition: payload.condition,
        brand: payload.brand,
        imageUrls: payload.imageUrls,
        aspects: payload.aspects
      });
      const offer = await createEbayOffer({
        sku: draft.sku,
        accessToken,
        sandbox,
        marketplaceId: draft.marketplaceId,
        price: draft.price,
        quantity: draft.quantity,
        categoryId: required.categoryId,
        merchantLocationKey: required.merchantLocationKey,
        fulfillmentPolicyId: required.fulfillmentPolicyId,
        paymentPolicyId: required.paymentPolicyId,
        returnPolicyId: required.returnPolicyId,
        listingDescription: payload.recommendedDescription ?? action.reason
      });
      ebayOfferId = offer.offerId;
      ebayResult = { mode, offerId: ebayOfferId, offer: offer.raw };
      if (mode === 'PUBLISH') {
        const publishResult = await publishEbayOffer({ offerId: ebayOfferId, accessToken, sandbox }) as Record<string, unknown>;
        ebayItemId = typeof publishResult.listingId === 'string' ? publishResult.listingId : undefined;
        ebayResult = { mode, offerId: ebayOfferId, listingId: ebayItemId, publishResult };
      }
    }

    const response = { draft, ebayResult };
    await db.$transaction(async (tx) => {
      let listingId: string | undefined;
      if (action.productCandidateId && action.amazonMatchId && (mode !== 'PREPARE' || ebayItemId || ebayOfferId)) {
        const listing = await tx.ebayListing.create({
          data: {
            productCandidateId: action.productCandidateId,
            amazonMatchId: action.amazonMatchId,
            ebayItemId,
            ebayOfferId,
            listingStatus: mode === 'PUBLISH' ? 'ACTIVE' : 'DRAFT',
            listedPrice: draft.price.toFixed(2),
            quantity: draft.quantity,
            title: draft.title,
            description: payload.recommendedDescription ?? action.reason,
            shippingPolicyId: payload.fulfillmentPolicyId,
            returnPolicyId: payload.returnPolicyId,
            paymentPolicyId: payload.paymentPolicyId
          }
        });
        listingId = listing.id;
      }
      await tx.actionItem.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          reviewedBy: actor,
          reviewedAt: new Date(),
          payloadJson: { ...payload, ebayDraft: draft, ebayResult, ebayListingId: listingId, ...executionMetadata(input, response) }
        }
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ActionItem',
          entityId: action.id,
          action: mode === 'PUBLISH' ? 'EBAY_LISTING_PUBLISHED' : mode === 'DRAFT' ? 'EBAY_OFFER_CREATED' : 'LISTING_DRAFT_PREPARED',
          actor,
          afterJson: { draft, ebayResult, listingId, executionResult: input.result }
        }
      });
    });

    return response;
  }

  if (action.type === 'PAUSE') {
    const payload = actionPayload(action.payloadJson);
    const listing = payload.listingId ? await db.ebayListing.findUnique({ where: { id: payload.listingId } }) : undefined;
    const offerId = payload.ebayOfferId ?? listing?.ebayOfferId;
    let ebayResult: unknown = { skipped: true, reason: 'Missing eBay credentials or offer ID' };

    const clientId = await getSecret(db, 'EBAY_CLIENT_ID');
    const clientSecret = await getSecret(db, 'EBAY_CLIENT_SECRET');
    const refreshToken = await getSecret(db, 'EBAY_REFRESH_TOKEN');

    if (offerId && clientId && clientSecret && refreshToken) {
      const sandbox = (await getSecret(db, 'EBAY_SANDBOX')) === 'true';
      const accessToken = await getEbayAccessToken({ clientId, clientSecret, refreshToken, sandbox });
      ebayResult = await withdrawEbayOffer({ offerId, accessToken, sandbox });
    }

    const response = { listingId: listing?.id, offerId, ebayResult };
    await db.$transaction(async (tx) => {
      if (listing) await tx.ebayListing.update({ where: { id: listing.id }, data: { listingStatus: 'PAUSED' } });
      await tx.actionItem.update({ where: { id: action.id }, data: { status: 'COMPLETED', reviewedBy: actor, reviewedAt: new Date(), payloadJson: { ...payload, ebayResult, ...executionMetadata(input, response) } } });
      await tx.auditLog.create({
        data: {
          entityType: 'ActionItem',
          entityId: action.id,
          action: 'PAUSE_ACTION_EXECUTED',
          actor,
          afterJson: { listingId: listing?.id, offerId, ebayResult, executionResult: input.result }
        }
      });
    });
    return response;
  }

  if (action.type === 'REPRICE') {
    const payload = actionPayload(action.payloadJson);
    const listingId = payload.listingId;
    const recommendedPrice = numberValue(input.result?.recommendedPrice) ?? numberValue(input.result?.price) ?? payload.recommendedPrice;
    if (!listingId) throw badRequest('REPRICE action requires listingId in payload', 'REPRICE_LISTING_ID_REQUIRED');
    if (recommendedPrice === undefined || recommendedPrice <= 0) throw badRequest('REPRICE action requires a positive recommended price', 'REPRICE_PRICE_REQUIRED');

    const listing = await db.ebayListing.findUnique({ where: { id: listingId } });
    if (!listing) throw notFound('eBay listing not found', 'EBAY_LISTING_NOT_FOUND');
    let ebayResult: unknown = { skipped: true, reason: 'Missing eBay offer ID or credentials' };
    const { accessToken, sandbox, marketplaceId } = await ebayInventoryCredentials(db);
    if (listing.ebayOfferId && accessToken) {
      ebayResult = await updateEbayOfferPriceQuantity({
        sku: listing.productCandidateId,
        offerId: listing.ebayOfferId,
        accessToken,
        sandbox,
        marketplaceId,
        price: recommendedPrice,
        quantity: listing.quantity
      });
    }

    const response = { listingId: listing.id, listedPrice: recommendedPrice, ebayResult };
    await db.$transaction(async (tx) => {
      await tx.ebayListing.update({ where: { id: listing.id }, data: { listedPrice: recommendedPrice.toFixed(2) } });
      await tx.actionItem.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          reviewedBy: actor,
          reviewedAt: new Date(),
          payloadJson: { ...payload, previousPrice: listing.listedPrice, appliedPrice: recommendedPrice, ebayResult, ...executionMetadata(input, response) }
        }
      });
      await tx.auditLog.create({
        data: {
          entityType: 'EbayListing',
          entityId: listing.id,
          action: 'LISTING_REPRICED',
          actor,
          beforeJson: { listedPrice: listing.listedPrice },
          afterJson: { listedPrice: recommendedPrice, actionItemId: action.id, ebayResult, executionResult: input.result }
        }
      });
    });

    return response;
  }

  if (action.type === 'BUY') {
    const payload = actionPayload(action.payloadJson);
    if (!action.orderId) throw badRequest('BUY action requires an orderId', 'BUY_ORDER_ID_REQUIRED');
    const asin = stringValue(input.result?.asin) ?? payload.asin;
    if (!asin) throw badRequest('BUY execution requires an ASIN', 'BUY_ASIN_REQUIRED');
    const amazonOrderId = stringValue(input.result?.amazonOrderId);
    const purchasePrice = numberValue(input.result?.purchasePrice);
    const estimatedPurchaseAmount = purchasePrice ?? numberValue((payload as Record<string, unknown>).maxPrice);
    const trackingNumber = stringValue(input.result?.trackingNumber);
    const carrier = stringValue(input.result?.carrier);
    const status = stringValue(input.result?.status) ?? 'PURCHASED';
    if (!amazonOrderId && purchasePrice === undefined) {
      throw badRequest('BUY execution requires amazonOrderId or purchasePrice evidence', 'BUY_PURCHASE_EVIDENCE_REQUIRED');
    }
    if (estimatedPurchaseAmount === undefined || estimatedPurchaseAmount <= 0) {
      throw badRequest('BUY execution requires a positive purchasePrice or payload maxPrice', 'BUY_PURCHASE_AMOUNT_REQUIRED');
    }
    let response: unknown;
    // Serialize the budget re-check, purchase row, and completion in one transaction so
    // concurrent BUY executions can't both pass the daily spend cap. A transaction-scoped
    // advisory lock (auto-released at commit/rollback) forces them to run one at a time.
    // The recorded purchasePrice falls back to the estimated amount so the daily spend sum
    // matches what the limit check counted (instead of recording null and undercounting).
    await db.$transaction(async (tx) => {
      await lockDailyPurchaseBudget(tx);
      await enforceDailyPurchaseLimit(tx, estimatedPurchaseAmount);
      const purchase = await recordAmazonPurchaseRows(tx, action.orderId as string, {
        asin,
        amazonOrderId,
        purchasePrice: purchasePrice ?? estimatedPurchaseAmount,
        trackingNumber,
        carrier,
        status
      }, actor);
      response = { actionId: action.id, purchase };
      await tx.actionItem.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          reviewedBy: actor,
          reviewedAt: new Date(),
          payloadJson: { ...payload, ...executionMetadata(input, response) }
        }
      });
    });
    return response;
  }

  if (action.type === 'REVIEW') {
    const payload = actionPayload(action.payloadJson);
    const result = {
      actionId: action.id,
      actionType: action.type,
      status: 'COMPLETED',
      reason: action.reason
    };

    await db.$transaction(async (tx) => {
      await tx.actionItem.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          reviewedBy: actor,
          reviewedAt: new Date(),
          payloadJson: { ...payload, manualReviewCompletedAt: new Date().toISOString(), ...executionMetadata(input, result) }
        }
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ActionItem',
          entityId: action.id,
          action: 'MANUAL_REVIEW_COMPLETED',
          actor,
          afterJson: { ...result, executionResult: input.result }
        }
      });
    });

    return result;
  }

  if (action.type === 'VERIFY') {
    throw conflict('VERIFY actions must be completed through /actions/:id/verification-result with browser-observed prices and conditions', 'VERIFY_EXECUTION_NOT_ALLOWED');
  }

  throw badRequest(`Execution is not implemented for action type ${action.type}`, 'ACTION_EXECUTION_NOT_IMPLEMENTED');
}

export async function executeAction(db: PrismaClient, actionId: string, input: ExecuteActionInput = {}): Promise<unknown> {
  const action = await db.actionItem.findUnique({ where: { id: actionId } });
  if (!action) throw notFound('Action not found', 'ACTION_NOT_FOUND');
  const existingPayload = actionPayload(action.payloadJson) as Record<string, unknown>;
  const replay = idempotentReplay(existingPayload, input.idempotencyKey);
  if (replay) return replay;

  const config = await getActiveRuleConfig(db);
  // Safe mode is a hard kill-switch for irreversible money/marketplace mutations.
  if (config.safeMode && (action.type === 'BUY' || action.type === 'REPRICE')) {
    throw conflict(
      `Safe mode is enabled; ${action.type} execution is blocked. Disable safe mode in settings to proceed.`,
      'SAFE_MODE_ACTION_BLOCKED'
    );
  }

  // Verification freshness gate (opt-in): block LIST/BUY whose latest passed price
  // verification is older than the configured TTL, so we never act on a stale price.
  if (config.verificationTtlMinutes > 0 && (action.type === 'LIST' || action.type === 'BUY') && action.productCandidateId) {
    const ttlCutoff = new Date(Date.now() - config.verificationTtlMinutes * 60_000);
    const fresh = await db.priceVerification.findFirst({
      where: { productCandidateId: action.productCandidateId, status: 'PASSED', checkedAt: { gte: ttlCutoff } },
      orderBy: { checkedAt: 'desc' },
      select: { id: true }
    });
    if (!fresh) {
      throw conflict(
        `A price verification within the last ${config.verificationTtlMinutes} minutes is required before executing this ${action.type}.`,
        'VERIFICATION_STALE'
      );
    }
  }

  // Atomically claim the action (APPROVED -> EXECUTING) BEFORE any external call so a
  // double-click, retry, or concurrent worker cannot execute the same action twice.
  const claim = await db.actionItem.updateMany({
    where: { id: actionId, status: 'APPROVED' },
    data: { status: 'EXECUTING' }
  });
  if (claim.count === 0) throw conflict('Action must be APPROVED before execution', 'ACTION_NOT_APPROVED');

  try {
    return await runClaimedAction(db, { ...action, status: 'EXECUTING' }, config, input);
  } catch (error) {
    await releaseExecutingClaim(db, actionId);
    throw error;
  }
}
