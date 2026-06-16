import type { ActionItemDto, BackendClientOptions } from './backendClient.js';
import { completeAction } from './backendClient.js';

export function describeAction(action: ActionItemDto): string {
  if (action.type === 'BUY') return `Prepare Amazon checkout for approved action ${action.id}${action.orderId ? ` / order ${action.orderId}` : ''}: ${action.reason}`;
  if (action.type === 'LIST') return `Prepare eBay listing review for approved action ${action.id}: ${action.reason}`;
  if (action.type === 'REPRICE') return `Prepare eBay repricing review for approved action ${action.id}: ${action.reason}`;
  if (action.type === 'PAUSE') return `Prepare eBay pause review for approved action ${action.id}: ${action.reason}`;
  return `Open manual review for approved action ${action.id}: ${action.reason}`;
}

export async function runApprovedAction(options: BackendClientOptions, action: ActionItemDto): Promise<void> {
  console.log(describeAction(action));
  console.log('MVP safety stop: complete the browser/API action manually, then this scaffold marks the action completed.');
  await completeAction(options, action.id);
}
