import type { Location, TestDetails } from '@playwright/test';

export type DeclarationKind = 'default' | 'only' | 'skip' | 'fixme' | 'fail' | 'fail.only';

// Playwright's public test() captures its immediate caller, which is a support
// module for custom declaration APIs. This small compatibility bridge preserves
// the author's location (including source maps) for reports, IDEs, and file:line
// filtering. It is covered by the real-run acceptance test. Keep Playwright pinned
// and verify this bridge when upgrading: _createTest is an internal API.
const transform = require('playwright/lib/transform/transform') as {
  wrapFunctionWithLocation(
    callback: (location: Location, ...args: unknown[]) => void,
  ): (...args: unknown[]) => void;
};
interface TestTypeImplementation {
  _createTest(
    kind: DeclarationKind,
    location: Location,
    title: string,
    details: TestDetails,
    body: unknown,
  ): void;
}

export function registerDeclaration(
  runner: object,
  kind: DeclarationKind,
  location: Location,
  title: string,
  details: TestDetails,
  body: unknown,
): void {
  const symbol = Object.getOwnPropertySymbols(runner).find((key) => key.description === 'testType');
  const implementation: unknown = symbol ? Reflect.get(runner, symbol) : undefined;
  if (
    !implementation ||
    typeof implementation !== 'object' ||
    !('_createTest' in implementation) ||
    typeof implementation._createTest !== 'function'
  ) {
    throw new Error(
      'Playwright declaration bridge is incompatible. Verify support/playwright-declaration.ts when upgrading Playwright.',
    );
  }
  (implementation as TestTypeImplementation)._createTest(kind, location, title, details, body);
}

export const withDeclarationLocation = transform.wrapFunctionWithLocation;
