export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function assertApprox(actual: number, expected: number, message: string, tolerance = 0.001): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

export function assertIncludes(values: string[], expected: string, message: string): void {
  if (!values.includes(expected)) {
    throw new Error(`${message}: expected ${expected} in [${values.join(', ')}]`);
  }
}
