import { buildAutomationJob, describeAction, resolveAutomationMode } from './actionRunner.js';
import { parseCommandLine } from './jsonCommand.js';
import { assertEqual, assertIncludes } from './testHelpers.js';

const buyDescription = describeAction({
  id: 'action-1',
  type: 'BUY',
  status: 'APPROVED',
  reason: 'Order is ready for purchase review.',
  orderId: 'order-1'
});

assertIncludes(buyDescription, 'Amazon checkout', 'BUY action description');
assertIncludes(buyDescription, 'order order-1', 'BUY action order reference');

const listDescription = describeAction({
  id: 'action-2',
  type: 'LIST',
  status: 'APPROVED',
  reason: 'Candidate passed listing rules.'
});

assertIncludes(listDescription, 'eBay listing review', 'LIST action description');

const verifyDescription = describeAction({
  id: 'action-verify',
  type: 'VERIFY',
  status: 'APPROVED',
  reason: 'Live check required.',
  payloadJson: {
    expectedAmazonUrl: 'https://www.amazon.de/dp/B000SCAN',
    expectedEbayUrl: 'https://www.ebay.de/itm/123'
  }
});

assertIncludes(verifyDescription, 'live browser verification', 'VERIFY action description');
assertIncludes(verifyDescription, 'https://www.amazon.de/dp/B000SCAN', 'VERIFY action Amazon URL');

const reviewDescription = describeAction({
  id: 'action-3',
  type: 'REVIEW',
  status: 'APPROVED',
  reason: 'Needs operator review.'
});

assertEqual(reviewDescription, 'Open manual review for approved action action-3: Needs operator review.', 'REVIEW action description');

const baseOptions = { backendUrl: 'http://localhost:3000', automationMode: 'ASSISTED' as const };

assertEqual(resolveAutomationMode(baseOptions, {
  id: 'verify-mode',
  type: 'VERIFY',
  status: 'APPROVED',
  reason: 'Verify.'
}), 'VERIFY', 'VERIFY action mode');

assertEqual(resolveAutomationMode(baseOptions, {
  id: 'list-mode',
  type: 'LIST',
  status: 'APPROVED',
  reason: 'List.'
}), 'DRAFT', 'LIST action default mode');

assertEqual(resolveAutomationMode(baseOptions, {
  id: 'buy-mode',
  type: 'BUY',
  status: 'APPROVED',
  reason: 'Buy.'
}), 'ASSISTED', 'BUY action default mode');

assertEqual(resolveAutomationMode({ ...baseOptions, automationMode: 'AUTOPILOT' }, {
  id: 'autopilot-mode',
  type: 'LIST',
  status: 'APPROVED',
  reason: 'List autopilot.'
}), 'AUTOPILOT', 'Configured AUTOPILOT mode');

assertEqual(resolveAutomationMode(baseOptions, {
  id: 'blocked-autopilot-mode',
  type: 'LIST',
  status: 'APPROVED',
  reason: 'List autopilot.',
  payloadJson: { automationMode: 'AUTOPILOT' }
}), 'DRAFT', 'Payload AUTOPILOT cannot exceed configured mode');

const draftJob = buildAutomationJob(baseOptions, {
  id: 'draft-job',
  type: 'LIST',
  status: 'APPROVED',
  reason: 'Prepare listing.',
  payloadJson: { recommendedTitle: 'Acme scanner' }
}, 'DRAFT');

assertEqual(draftJob.guardrails.finalSubmitAllowed, false, 'DRAFT mode blocks final submit');
assertEqual(draftJob.guardrails.requiresHumanConfirmation, true, 'DRAFT mode requires human confirmation');
assertIncludes(draftJob.instructions.join(' '), 'Do not publish', 'DRAFT instructions stop before publish');
assertEqual(draftJob.guardrails.allowedDomains.includes('amazon.co.uk'), true, 'guardrails include UK Amazon');
assertEqual(draftJob.guardrails.allowedDomains.includes('ebay.fr'), true, 'guardrails include France eBay');

const customDomainJob = buildAutomationJob({ ...baseOptions, allowedDomains: ['supplier.example'] }, {
  id: 'custom-domain-job',
  type: 'BUY',
  status: 'APPROVED',
  reason: 'Prepare purchase.'
}, 'ASSISTED');
assertEqual(customDomainJob.guardrails.allowedDomains.includes('supplier.example'), true, 'guardrails include custom domain');

const parsedCommand = parseCommandLine('node "./operator script.js" --mode draft');
assertEqual(parsedCommand[0], 'node', 'command parser executable');
assertEqual(parsedCommand[1], './operator script.js', 'command parser quoted path');
assertEqual(parsedCommand[2], '--mode', 'command parser argument');
assertEqual(parsedCommand[3], 'draft', 'command parser argument value');

console.log('local-agent actionRunner unit test passed');
