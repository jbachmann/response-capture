// Unlike IsOptional, this skips omitted fields but still validates null.
export const isProvided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;
