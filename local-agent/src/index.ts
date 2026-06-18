import { env } from './config/env.js';
import { fetchApprovedActions } from './services/backendClient.js';
import { runApprovedAction } from './services/actionRunner.js';

interface PurchaseTask {
  taskType: 'BUY_ON_AMAZON';
  orderId: string;
  asin: string;
  quantity: number;
  maxPrice: number;
  buyerShippingAddress: string;
  requiredDeliveryDate?: string;
}

export function describePurchaseTask(task: PurchaseTask): string {
  return `Prepare manual Amazon checkout for order ${task.orderId}, ASIN ${task.asin}, quantity ${task.quantity}, max price ${task.maxPrice}.`;
}

async function pollApprovedActions(): Promise<void> {
  const clientOptions = {
    backendUrl: env.backendUrl,
    sharedSecret: env.sharedSecret,
    computerUseVerifierCommand: env.computerUseVerifierCommand,
    computerUseOperatorCommand: env.computerUseOperatorCommand,
    computerUseDraftCommand: env.computerUseDraftCommand,
    computerUseAssistedCommand: env.computerUseAssistedCommand,
    computerUseAutopilotCommand: env.computerUseAutopilotCommand,
    automationMode: env.automationMode,
    computerUseTimeoutMs: env.computerUseTimeoutMs,
    autoCompleteManualActions: env.autoCompleteManualActions,
    allowedDomains: env.allowedDomains
  };
  const actions = await fetchApprovedActions(clientOptions);

  for (const action of actions) {
    await runApprovedAction(clientOptions, action);
  }
}

console.log('Local agent scaffold ready. Amazon checkout automation requires manual confirmation in the MVP.');

let pollInProgress = false;

async function pollApprovedActionsOnce(): Promise<void> {
  if (pollInProgress) {
    console.log('Previous local-agent poll is still running; skipping this interval.');
    return;
  }
  pollInProgress = true;
  try {
    await pollApprovedActions();
  } finally {
    pollInProgress = false;
  }
}

if (env.runOnce) {
  await pollApprovedActionsOnce();
} else {
  await pollApprovedActionsOnce();
  setInterval(() => {
    pollApprovedActionsOnce().catch((error: unknown) => {
      console.error(error);
    });
  }, env.pollIntervalMs);
}
