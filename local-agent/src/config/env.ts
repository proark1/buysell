import 'dotenv/config';

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const env = {
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:3000',
  sharedSecret: process.env.LOCAL_AGENT_SHARED_SECRET,
  computerUseVerifierCommand: process.env.COMPUTER_USE_VERIFIER_COMMAND,
  autoCompleteManualActions: process.env.LOCAL_AGENT_AUTOCOMPLETE_MANUAL_ACTIONS === 'true',
  pollIntervalMs: numberFromEnv(process.env.LOCAL_AGENT_POLL_INTERVAL_MS, 30_000),
  runOnce: process.env.LOCAL_AGENT_RUN_ONCE === 'true'
};
