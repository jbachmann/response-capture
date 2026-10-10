export const SQLITE_CONSTRAINT_FOREIGNKEY = 787;
export const SQLITE_CONSTRAINT_TRIGGER = 1811;

export function isSqliteConstraint(error: unknown, ...codes: number[]): boolean {
  return (
    error instanceof Error &&
    'errcode' in error &&
    typeof error.errcode === 'number' &&
    codes.includes(error.errcode)
  );
}
