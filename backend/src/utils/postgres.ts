export const POSTGRES_INT_MIN = -2_147_483_648;
export const POSTGRES_INT_MAX = 2_147_483_647;

export function postgresInt(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  const integer = Math.trunc(value);
  if (integer < POSTGRES_INT_MIN || integer > POSTGRES_INT_MAX) return undefined;
  return integer;
}

