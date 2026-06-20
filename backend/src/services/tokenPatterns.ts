// Single source of truth for the spec/model token patterns shared by matchScorer,
// productIdentityMatcher, and productFamily. These had drifted into near-duplicate copies;
// consolidating prevents a token being treated as a spec in one stage and a model token in
// another. Per-stage token *sets* (genericModelTokens, variantWords) intentionally stay in
// their own modules — only the genuinely-common patterns live here.

/** Uppercase + strip non-alphanumerics for stable token comparison. */
export const tokenKey = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * True when a token is a measurement/spec/pack quantity (e.g. 5000MAH, 12V, 4PACK) rather
 * than a product model identifier. Mirrors the exact patterns matchScorer and
 * productIdentityMatcher previously duplicated.
 */
export function isSpecificationToken(token: string): boolean {
  if (/^\d{2,6}(?:MAH|AH|WH|W|KW|V|A|MM|CM|M|IN|INCH|HZ|KHZ|MHZ|GHZ|BIT|GB|TB|MB|DPI|P|K)$/.test(token)) return true;
  if (/^(?:STEREO|MONO|AUDIO|VIDEO)\d{2,6}$/.test(token)) return true;
  if (/^\d{2,6}(?:PCS|PC|PACK|CT|COUNT)$/.test(token)) return true;
  return false;
}

/**
 * Extract raw model-token candidates from free text, normalized via tokenKey. Callers apply
 * their own set-based filtering (genericModelTokens / isSpecificationToken / length).
 */
export function modelTokenCandidates(value: string | undefined): string[] {
  if (!value) return [];
  const matches = value.match(/\b[A-Z]{1,6}[-_/ ]?\d{2,6}[A-Z0-9]{0,5}\b|\b\d{2,6}[-_/ ]?[A-Z]{1,5}\b/gi) ?? [];
  return matches.map(tokenKey);
}
