export function readOptionValue(args: string[], names: string[]): string | undefined {
  const index = args.findIndex((value) => names.includes(value));
  if (index < 0) {
    return undefined;
  }

  const value = args[index + 1];
  return value?.trim() || undefined;
}
