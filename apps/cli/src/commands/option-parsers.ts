export function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return parsed;
}

export function parseCsvOption(value: string, optionName: string): string[] {
  const parsed = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (parsed.length === 0) {
    throw new Error(`${optionName} must include at least one value.`);
  }

  return parsed;
}
