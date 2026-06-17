import type { ActionItemDto, AutomationMode, AutomationRunStatus, BackendClientOptions, VerificationResultDto } from './backendClient.js';
import { addAutomationEvent, executeAction, finishAutomationRun, startAutomationRun, submitVerificationResult } from './backendClient.js';
import { runComputerUseOperator, type ComputerUseAutomationJob, type ComputerUseAutomationResult } from './computerUseOperator.js';
import { runComputerUseVerifier, type ComputerUseVerificationJob } from './computerUseVerifier.js';

const automationModes: AutomationMode[] = ['VERIFY', 'DRAFT', 'ASSISTED', 'AUTOPILOT'];
const modeRank: Record<AutomationMode, number> = { VERIFY: 0, DRAFT: 1, ASSISTED: 2, AUTOPILOT: 3 };

const payloadRecord = (action: ActionItemDto): Record<string, unknown> => (
  action.payloadJson && typeof action.payloadJson === 'object' && !Array.isArray(action.payloadJson)
    ? action.payloadJson as Record<string, unknown>
    : {}
);

const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;

const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  : [];

const automationModeValue = (value: unknown): AutomationMode | undefined => (
  typeof value === 'string' && automationModes.includes(value as AutomationMode) ? value as AutomationMode : undefined
);

const validRunStatus = (value: unknown): AutomationRunStatus | undefined => (
  typeof value === 'string' && ['RUNNING', 'NEEDS_HUMAN_CONFIRMATION', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED', 'CANCELLED'].includes(value)
    ? value as AutomationRunStatus
    : undefined
);

function configuredMode(options: BackendClientOptions): AutomationMode {
  return options.automationMode ?? 'ASSISTED';
}

export function resolveAutomationMode(options: BackendClientOptions, action: ActionItemDto): AutomationMode {
  if (action.type === 'VERIFY') return 'VERIFY';

  const configured = configuredMode(options);
  const requested = automationModeValue(payloadRecord(action).automationMode);
  if (requested && requested !== 'VERIFY' && modeRank[requested] <= modeRank[configured]) return requested;

  if (configured === 'AUTOPILOT') return 'AUTOPILOT';
  if (configured === 'ASSISTED') return action.type === 'BUY' ? 'ASSISTED' : 'DRAFT';
  return 'DRAFT';
}

function commandForMode(options: BackendClientOptions, mode: AutomationMode): string | undefined {
  if (mode === 'VERIFY') return options.computerUseVerifierCommand ?? options.computerUseOperatorCommand;
  if (mode === 'DRAFT') return options.computerUseDraftCommand ?? options.computerUseOperatorCommand;
  if (mode === 'ASSISTED') return options.computerUseAssistedCommand ?? options.computerUseOperatorCommand;
  return options.computerUseAutopilotCommand ?? options.computerUseOperatorCommand;
}

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

function allowedDomains(options: BackendClientOptions): string[] {
  const domains = new Set(['amazon.com', 'amazon.de', 'ebay.com', 'ebay.de']);
  try {
    domains.add(new URL(options.backendUrl).host);
  } catch {
    domains.add('localhost');
  }
  return [...domains];
}

function instructionsForAction(action: ActionItemDto, mode: AutomationMode): string[] {
  const payload = payloadRecord(action);
  const payloadInstructions = stringArray(payload.automationInstructions);
  if (payloadInstructions.length) return payloadInstructions;

  if (mode === 'VERIFY') {
    return stringArray(payload.verificationInstructions);
  }

  if (mode === 'DRAFT') {
    if (action.type === 'LIST') {
      return [
        'Open the relevant eBay selling surface and prepare a listing draft using the action payload.',
        'Do not publish the listing. Stop on the final review or saved-draft state.',
        'Capture screenshots and return the draft fields, artifact paths, and anything that still needs human review.'
      ];
    }
    if (action.type === 'REPRICE') {
      return [
        'Open the relevant eBay listing and prepare the repricing change.',
        'Do not submit the final price update. Stop on the final confirmation screen.',
        'Capture screenshots and return the old price, proposed price, and evidence.'
      ];
    }
    if (action.type === 'PAUSE') {
      return [
        'Open the relevant eBay listing or offer and prepare the pause/end/withdraw action.',
        'Do not submit the final pause or withdraw confirmation.',
        'Capture screenshots and return the visible listing or offer identifiers.'
      ];
    }
    return [
      'Prepare the marketplace workflow as a draft.',
      'Do not publish, purchase, pause, withdraw, or submit a final irreversible action.',
      'Capture evidence and return the prepared state.'
    ];
  }

  if (mode === 'ASSISTED') {
    return [
      'Open the required marketplace workflow and prepare it for the final human confirmation.',
      'Do not click place order, publish, submit payment, withdraw offer, or any final irreversible button.',
      'Capture screenshots and return what is ready, what needs confirmation, and any mismatch.'
    ];
  }

  return [
    'Complete the approved marketplace action only if the visible page, account, item, price, and payload all match.',
    'Do not continue on domain, price, item, quantity, shipping, policy, or account mismatch.',
    'Capture evidence before and after the final submit, then return a structured completion result.'
  ];
}

export function buildAutomationJob(options: BackendClientOptions, action: ActionItemDto, mode: AutomationMode): ComputerUseAutomationJob {
  return {
    actionId: action.id,
    actionType: action.type,
    mode,
    reason: action.reason,
    orderId: action.orderId,
    backendUrl: options.backendUrl,
    payload: payloadRecord(action),
    guardrails: {
      finalSubmitAllowed: mode === 'AUTOPILOT',
      requiresHumanConfirmation: mode !== 'AUTOPILOT',
      allowedDomains: allowedDomains(options)
    },
    instructions: instructionsForAction(action, mode)
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

function manualVerificationPayload(action: ActionItemDto): VerificationResultDto {
  const payload = payloadRecord(action);
  return {
    status: 'PASSED',
    amazon: {
      observedPrice: payload.expectedAmazonPrice as number | undefined,
      brand: stringValue(payload.expectedBrand),
      condition: 'New',
      url: stringValue(payload.expectedAmazonUrl)
    },
    ebay: {
      observedPrice: payload.expectedEbayPrice as number | undefined,
      brand: stringValue(payload.expectedBrand),
      condition: 'New',
      buyingFormat: 'Buy It Now',
      url: stringValue(payload.expectedEbayUrl)
    },
    evidence: {
      amazonScreenshotPath: '/absolute/path/to/amazon.png',
      ebayScreenshotPath: '/absolute/path/to/ebay.png'
    },
    checkedBy: 'computer-use-verifier'
  };
}

function normalizeOperatorStatus(mode: AutomationMode, result: ComputerUseAutomationResult): AutomationRunStatus {
  const status = validRunStatus(result.status);
  if (status === 'FAILED' || status === 'REVIEW_REQUIRED' || status === 'CANCELLED') return status;
  if (mode !== 'AUTOPILOT' && result.actionCompleted !== true) return 'NEEDS_HUMAN_CONFIRMATION';
  return status ?? 'COMPLETED';
}

async function markRunFailed(options: BackendClientOptions, runId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await finishAutomationRun(options, runId, {
    status: 'FAILED',
    phase: 'FAILED',
    error: message,
    eventType: 'AUTOMATION_FAILED',
    message
  });
}

async function runVerifyMode(options: BackendClientOptions, action: ActionItemDto, runId: string): Promise<void> {
  const verifierCommand = options.computerUseVerifierCommand;
  const operatorCommand = !verifierCommand ? options.computerUseOperatorCommand : undefined;
  const timeoutMs = options.computerUseTimeoutMs ?? 10 * 60 * 1000;

  if (verifierCommand) {
    await addAutomationEvent(options, runId, {
      eventType: 'COMPUTER_USE_VERIFY_STARTED',
      message: 'Running computer-use verifier command.'
    });
    const result = await runComputerUseVerifier(verifierCommand, buildVerificationJob(action), timeoutMs);
    await submitVerificationResult(options, action.id, {
      ...result,
      checkedBy: result.checkedBy ?? 'computer-use-verifier'
    });
    const status: AutomationRunStatus = result.status === 'FAILED' ? 'FAILED' : result.status === 'MANUAL_REVIEW' ? 'REVIEW_REQUIRED' : 'COMPLETED';
    await finishAutomationRun(options, runId, {
      status,
      phase: status,
      result: result as Record<string, unknown>,
      eventType: 'COMPUTER_USE_VERIFY_FINISHED',
      message: `Computer-use verification finished with ${result.status ?? 'PASSED'}.`
    });
    return;
  }

  if (operatorCommand) {
    await addAutomationEvent(options, runId, {
      eventType: 'COMPUTER_USE_VERIFY_STARTED',
      message: 'Running generic computer-use operator for verification.'
    });
    const result = await runComputerUseOperator(operatorCommand, buildAutomationJob(options, action, 'VERIFY'), timeoutMs);
    if (!result.verificationResult) throw new Error('VERIFY operator result must include verificationResult');
    await submitVerificationResult(options, action.id, {
      ...result.verificationResult,
      checkedBy: result.verificationResult.checkedBy ?? result.checkedBy ?? 'computer-use-operator'
    });
    const status: AutomationRunStatus = result.verificationResult.status === 'FAILED'
      ? 'FAILED'
      : result.verificationResult.status === 'MANUAL_REVIEW'
        ? 'REVIEW_REQUIRED'
        : 'COMPLETED';
    await finishAutomationRun(options, runId, {
      status,
      phase: status,
      result: result as Record<string, unknown>,
      eventType: 'COMPUTER_USE_VERIFY_FINISHED',
      message: `Computer-use verification finished with ${result.verificationResult.status ?? 'PASSED'}.`
    });
    return;
  }

  console.log('Computer-use gate: open the Amazon and eBay links in the real browser, capture evidence, then submit the observed values.');
  console.log(`Submit to: POST ${options.backendUrl}/actions/${action.id}/verification-result`);
  console.log(JSON.stringify(manualVerificationPayload(action), null, 2));
  await finishAutomationRun(options, runId, {
    status: 'NEEDS_HUMAN_CONFIRMATION',
    phase: 'AWAITING_VERIFICATION_RESULT',
    result: { manualSubmissionTemplate: manualVerificationPayload(action) },
    eventType: 'AWAITING_MANUAL_VERIFICATION',
    message: 'No computer-use verifier command is configured. Waiting for browser-observed verification result.'
  });
}

async function runOperatorMode(options: BackendClientOptions, action: ActionItemDto, mode: AutomationMode, runId: string): Promise<void> {
  const command = commandForMode(options, mode);
  const job = buildAutomationJob(options, action, mode);

  if (!command) {
    console.log(`${mode} automation is ready for action ${action.id}, but no computer-use operator command is configured.`);
    console.log(JSON.stringify(job, null, 2));
    await finishAutomationRun(options, runId, {
      status: 'NEEDS_HUMAN_CONFIRMATION',
      phase: `${mode}_COMMAND_NOT_CONFIGURED`,
      result: { job },
      eventType: 'AWAITING_OPERATOR',
      message: `No command configured for ${mode} mode.`
    });
    return;
  }

  await addAutomationEvent(options, runId, {
    eventType: `COMPUTER_USE_${mode}_STARTED`,
    message: `Running ${mode} computer-use operator command.`,
    data: { actionType: action.type }
  });

  const result = await runComputerUseOperator(command, job, options.computerUseTimeoutMs ?? 10 * 60 * 1000);
  const status = normalizeOperatorStatus(mode, result);
  await finishAutomationRun(options, runId, {
    status,
    phase: status,
    result: result as Record<string, unknown>,
    eventType: `COMPUTER_USE_${mode}_FINISHED`,
    message: result.summary ?? `${mode} automation finished with ${status}.`
  });

  if (status === 'COMPLETED' && (mode === 'AUTOPILOT' || options.autoCompleteManualActions || result.actionCompleted === true)) {
    await executeAction(options, action.id, result as Record<string, unknown>);
  }
}

export async function runApprovedAction(options: BackendClientOptions, action: ActionItemDto): Promise<void> {
  const mode = resolveAutomationMode(options, action);
  console.log(`${describeAction(action)} Mode: ${mode}.`);
  const run = await startAutomationRun(options, action.id, {
    mode,
    agentType: 'local-agent',
    phase: `${mode}_STARTED`,
    metadata: { actionType: action.type }
  });

  if (!run.id || run.status !== 'RUNNING') {
    console.log(`Automation run ${run.id} is already ${run.status}; skipping duplicate handling.`);
    return;
  }

  try {
    if (mode === 'VERIFY') {
      await runVerifyMode(options, action, run.id);
      return;
    }

    await runOperatorMode(options, action, mode, run.id);
  } catch (error) {
    await markRunFailed(options, run.id, error);
    throw error;
  }
}
