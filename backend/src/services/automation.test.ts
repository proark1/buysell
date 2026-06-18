import {
  automationArtifactsFromResult,
  automationRiskScore,
  defaultAutomationModeForAction,
  isTerminalAutomationStatus
} from './automation.js';
import { assertEqual } from './testHelpers.js';

assertEqual(defaultAutomationModeForAction({ type: 'VERIFY' }), 'VERIFY', 'VERIFY defaults to verify mode');
assertEqual(defaultAutomationModeForAction({ type: 'LIST' }), 'DRAFT', 'LIST defaults to draft mode');
assertEqual(defaultAutomationModeForAction({ type: 'REPRICE' }), 'DRAFT', 'REPRICE defaults to draft mode');
assertEqual(defaultAutomationModeForAction({ type: 'PAUSE' }), 'DRAFT', 'PAUSE defaults to draft mode');
assertEqual(defaultAutomationModeForAction({ type: 'BUY' }), 'ASSISTED', 'BUY defaults to assisted mode');

assertEqual(automationRiskScore({ type: 'VERIFY' }, 'VERIFY'), 20, 'VERIFY risk score');
assertEqual(automationRiskScore({ type: 'LIST' }, 'DRAFT'), 35, 'DRAFT listing risk score');
assertEqual(automationRiskScore({ type: 'BUY' }, 'ASSISTED'), 75, 'ASSISTED buy risk score');
assertEqual(automationRiskScore({ type: 'BUY' }, 'AUTOPILOT'), 95, 'AUTOPILOT buy risk score');

assertEqual(isTerminalAutomationStatus('COMPLETED'), true, 'COMPLETED is terminal');
assertEqual(isTerminalAutomationStatus('FAILED'), true, 'FAILED is terminal');
assertEqual(isTerminalAutomationStatus('RUNNING'), false, 'RUNNING is active');
assertEqual(isTerminalAutomationStatus('NEEDS_HUMAN_CONFIRMATION'), false, 'NEEDS_HUMAN_CONFIRMATION is active');

const artifacts = automationArtifactsFromResult({
  evidence: {
    amazonScreenshotPath: '/tmp/amazon.png',
    ebayScreenshotUrl: 'https://example.test/ebay.png'
  },
  artifacts: [
    { kind: 'TRACE', path: '/tmp/trace.json', sha256: 'abc' },
    { kind: 'TRACE', path: '/tmp/trace.json', sha256: 'abc' }
  ]
});
assertEqual(artifacts.length, 3, 'automation artifact extraction dedupes explicit artifacts');
assertEqual(artifacts.some((artifact) => artifact.path === '/tmp/amazon.png'), true, 'extracts screenshot path');
assertEqual(artifacts.some((artifact) => artifact.url === 'https://example.test/ebay.png'), true, 'extracts screenshot URL');

console.log('automation unit test passed');
