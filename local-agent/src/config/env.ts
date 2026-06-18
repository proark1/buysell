import 'dotenv/config';

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const automationModeFromEnv = (value: string | undefined): 'VERIFY' | 'DRAFT' | 'ASSISTED' | 'AUTOPILOT' => {
  if (value === 'VERIFY' || value === 'DRAFT' || value === 'ASSISTED' || value === 'AUTOPILOT') return value;
  return 'ASSISTED';
};

const arrayFromEnv = (value: string | undefined): string[] => value
  ? value.split(',').map((item) => item.trim()).filter(Boolean)
  : [];

export const env = {
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:3000',
  sharedSecret: process.env.LOCAL_AGENT_SHARED_SECRET,
  computerUseVerifierCommand: process.env.COMPUTER_USE_VERIFIER_COMMAND,
  computerUseOperatorCommand: process.env.COMPUTER_USE_OPERATOR_COMMAND,
  computerUseDraftCommand: process.env.COMPUTER_USE_DRAFT_COMMAND,
  computerUseAssistedCommand: process.env.COMPUTER_USE_ASSISTED_COMMAND,
  computerUseAutopilotCommand: process.env.COMPUTER_USE_AUTOPILOT_COMMAND,
  automationMode: automationModeFromEnv(process.env.LOCAL_AGENT_AUTOMATION_MODE),
  computerUseTimeoutMs: numberFromEnv(process.env.COMPUTER_USE_TIMEOUT_MS, 10 * 60 * 1000),
  autoCompleteManualActions: process.env.LOCAL_AGENT_AUTOCOMPLETE_MANUAL_ACTIONS === 'true',
  allowedDomains: arrayFromEnv(process.env.LOCAL_AGENT_ALLOWED_DOMAINS),
  pollIntervalMs: numberFromEnv(process.env.LOCAL_AGENT_POLL_INTERVAL_MS, 30_000),
  runOnce: process.env.LOCAL_AGENT_RUN_ONCE === 'true'
};
