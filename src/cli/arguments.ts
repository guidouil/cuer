export function readOptionValue(args: string[], names: string[]): string | undefined {
  const index = args.findIndex((value) => names.includes(value));
  if (index < 0) {
    return undefined;
  }

  const value = args[index + 1];
  return value?.trim() || undefined;
}

export function readPositionalArgs(args: string[], optionsWithValues: string[]): string[] {
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current) {
      continue;
    }

    if (optionsWithValues.includes(current)) {
      index += 1;
      continue;
    }

    if (current.startsWith("-")) {
      continue;
    }

    values.push(current);
  }

  return values;
}
