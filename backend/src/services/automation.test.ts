import {
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

console.log('automation unit test passed');
