export interface ParsedArguments {
  compact: boolean;
  options: Map<string, string>;
  positionals: string[];
}

export function parseArguments(
  arguments_: string[],
  allowedOptions: string[],
): ParsedArguments {
  const options = new Map<string, string>();
  const positionals: string[] = [];
  let compact = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--compact") {
      compact = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const equals = argument.indexOf("=");
    const option = equals < 0 ? argument : argument.slice(0, equals);
    if (!allowedOptions.includes(option)) {
      throw new Error(`Unknown option: ${option}`);
    }
    const inlineValue = equals < 0 ? undefined : argument.slice(equals + 1);
    const value = inlineValue ?? arguments_[index + 1];
    if (
      value === undefined ||
      value === "" ||
      (inlineValue === undefined && value.startsWith("--"))
    ) {
      throw new Error(`${option} requires a value`);
    }
    if (options.has(option))
      throw new Error(`${option} may be provided only once`);
    options.set(option, value);
    if (inlineValue === undefined) index += 1;
  }
  return { compact, options, positionals };
}

export function integerOption(
  options: Map<string, string>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = options.get(name) ?? String(fallback);
  if (!/^\d+$/u.test(raw))
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  return value;
}
