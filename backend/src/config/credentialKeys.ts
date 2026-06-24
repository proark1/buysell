export type CredentialType = 'secret' | 'text' | 'toggle';

export interface CredentialKeyDef {
  key: string;
  label: string;
  group: string;
  type: CredentialType;
  help?: string;
}

/**
 * Catalog of API keys and configuration values an operator can manage from the
 * dashboard. Values entered here are encrypted at rest in the Credential table
 * and take precedence over the matching environment variable.
 *
 * DATABASE_URL and BUYSELL_ENCRYPTION_KEY are intentionally excluded: they are
 * needed to reach and decrypt this table, so they must come from the environment.
 */
export const CREDENTIAL_KEYS: CredentialKeyDef[] = [
  { key: 'SERPAPI_API_KEY', label: 'SerpApi API Key', group: 'Discovery', type: 'secret', help: 'Used for eBay product discovery.' },
  { key: 'KEEPA_API_KEY', label: 'Keepa API Key', group: 'Discovery', type: 'secret', help: 'Used for Amazon matching and price monitoring.' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', group: 'AI', type: 'secret', help: 'Optional. Used for listing copy and decisions.' },
  { key: 'EBAY_CLIENT_ID', label: 'eBay Client ID', group: 'eBay', type: 'secret' },
  { key: 'EBAY_CLIENT_SECRET', label: 'eBay Client Secret', group: 'eBay', type: 'secret' },
  { key: 'EBAY_REFRESH_TOKEN', label: 'eBay Refresh Token', group: 'eBay', type: 'secret' },
  { key: 'EBAY_MARKETPLACE_ID', label: 'eBay Marketplace ID', group: 'eBay', type: 'text', help: 'e.g. EBAY_US' },
  { key: 'EBAY_SANDBOX', label: 'eBay Sandbox', group: 'eBay', type: 'toggle', help: 'Use eBay sandbox endpoints.' },
  { key: 'AMAZON_SP_API_CLIENT_ID', label: 'Amazon SP-API Client ID', group: 'Amazon SP-API', type: 'secret' },
  { key: 'AMAZON_SP_API_CLIENT_SECRET', label: 'Amazon SP-API Client Secret', group: 'Amazon SP-API', type: 'secret' },
  { key: 'AMAZON_SP_API_REFRESH_TOKEN', label: 'Amazon SP-API Refresh Token', group: 'Amazon SP-API', type: 'secret' },
  { key: 'AMAZON_SP_API_MARKETPLACE_ID', label: 'Amazon Marketplace ID', group: 'Amazon SP-API', type: 'text', help: 'Germany is A1PA6795UKMFR9.' },
  { key: 'AMAZON_SP_API_ENDPOINT', label: 'Amazon SP-API Endpoint', group: 'Amazon SP-API', type: 'text', help: 'Germany/EU default: https://sellingpartnerapi-eu.amazon.com' },
  { key: 'LOCAL_AGENT_SHARED_SECRET', label: 'Local Agent Shared Secret', group: 'Security', type: 'secret', help: 'Shared secret for the local agent and protected routes.' },
  { key: 'NOTIFICATION_WEBHOOK_URL', label: 'Notification Webhook URL', group: 'Notifications', type: 'text', help: 'Optional https:// endpoint that receives JSON alerts (failed runs, ready purchases).' }
];

const byKey = new Map(CREDENTIAL_KEYS.map((definition) => [definition.key, definition]));

export const isManagedCredential = (key: string): boolean => byKey.has(key);
export const getCredentialDef = (key: string): CredentialKeyDef | undefined => byKey.get(key);
