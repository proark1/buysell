import type { ActionItemDto, BackendClientOptions } from './backendClient.js';
import { completeAction, submitVerificationResult } from './backendClient.js';
import { runComputerUseVerifier, type ComputerUseVerificationJob } from './computerUseVerifier.js';

const payloadRecord = (action: ActionItemDto): Record<string, unknown> => (
  action.payloadJson && typeof action.payloadJson === 'object' && !Array.isArray(action.payloadJson)
    ? action.payloadJson as Record<string, unknown>
    : {}
);

const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;

const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  : [];

function buildVerificationJob(action: ActionItemDto): ComputerUseVerificationJob {
  const payload = payloadRecord(action);
  return {
    actionId: action.id,
    amazonUrl: stringValue(payload.expectedAmazonUrl),
    ebayUrl: stringValue(payload.expectedEbayUrl),
    expectedAmazonPrice: payload.expectedAmazonPrice,
    expectedEbayPrice: payload.expectedEbayPrice,
    expectedBrand: payload.expectedBrand,
    expectedCondition: 'NEW',
    expectedBuyingFormat: 'BIN',
    instructions: stringArray(payload.verificationInstructions)
  };
}

export function describeAction(action: ActionItemDto): string {
  if (action.type === 'VERIFY') {
    const payload = payloadRecord(action);
    const amazonUrl = stringValue(payload.expectedAmazonUrl);
    const ebayUrl = stringValue(payload.expectedEbayUrl);
    return `Run live browser verification for approved action ${action.id}: Amazon ${amazonUrl ?? 'link missing'} / eBay ${ebayUrl ?? 'link missing'}. ${action.reason}`;
  }
  if (action.type === 'BUY') return `Prepare Amazon checkout for approved action ${action.id}${action.orderId ? ` / order ${action.orderId}` : ''}: ${action.reason}`;
  if (action.type === 'LIST') return `Prepare eBay listing review for approved action ${action.id}: ${action.reason}`;
  if (action.type === 'REPRICE') return `Prepare eBay repricing review for approved action ${action.id}: ${action.reason}`;
  if (action.type === 'PAUSE') return `Prepare eBay pause review for approved action ${action.id}: ${action.reason}`;
  return `Open manual review for approved action ${action.id}: ${action.reason}`;
}

export async function runApprovedAction(options: BackendClientOptions, action: ActionItemDto): Promise<void> {
  console.log(describeAction(action));
  if (action.type === 'VERIFY') {
    const job = buildVerificationJob(action);
    if (options.computerUseVerifierCommand) {
      const result = await runComputerUseVerifier(options.computerUseVerifierCommand, job);
      await submitVerificationResult(options, action.id, {
        ...result,
        checkedBy: result.checkedBy ?? 'computer-use-verifier'
      });
      return;
    }

    const payload = payloadRecord(action);
    console.log('Computer-use gate: open the Amazon and eBay links in the real browser, capture evidence, then submit the observed values.');
    console.log(`Submit to: POST ${options.backendUrl}/actions/${action.id}/verification-result`);
    console.log(JSON.stringify({
      status: 'PASSED',
      amazon: {
        observedPrice: payload.expectedAmazonPrice,
        brand: payload.expectedBrand,
        condition: 'New',
        url: payload.expectedAmazonUrl
      },
      ebay: {
        observedPrice: payload.expectedEbayPrice,
        brand: payload.expectedBrand,
        condition: 'New',
        buyingFormat: 'Buy It Now',
        url: payload.expectedEbayUrl
      },
      evidence: {
        amazonScreenshotPath: '/absolute/path/to/amazon.png',
        ebayScreenshotPath: '/absolute/path/to/ebay.png'
      },
      checkedBy: 'computer-use-verifier'
    }, null, 2));
    return;
  }
  console.log('MVP safety stop: complete the browser/API action manually, then this scaffold marks the action completed.');
  await completeAction(options, action.id);
}
