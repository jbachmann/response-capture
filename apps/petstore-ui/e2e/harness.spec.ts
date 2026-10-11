import { test, expect } from '@playwright/test';
import { resolveRouting } from './support/systems';
import { catalogSelectionFromEnv } from './support/catalog';

test('Petstore owns routing defaults and environment selection', () => {
  const source = { systemName: 'petstore-api', selection: { latest: true } } as const;
  expect(resolveRouting(source, 'http://localhost:4202')).toEqual({
    origin: 'http://localhost:4202',
    pathPrefix: '',
    protectedPaths: ['/pet', '/store', '/training'],
  });
  expect(() => resolveRouting({ ...source, systemName: 'accounts-api' }, 'http://ui.test')).toThrow(
    'Register it in support/systems.ts',
  );
  expect(
    resolveRouting(
      {
        ...source,
        routing: { origin: 'http://accounts.test', pathPrefix: '/v1/', protectedPaths: ['/'] },
      },
      'http://ui.test',
    ).pathPrefix,
  ).toBe('/v1');
  expect(() =>
    resolveRouting(
      { ...source, routing: { origin: 'http://accounts.test/v1', protectedPaths: ['/'] } },
      'http://ui.test',
    ),
  ).toThrow('origin');
  expect(catalogSelectionFromEnv('  ')).toEqual({ latest: true });
  expect(catalogSelectionFromEnv('main')).toEqual({ selector: 'main' });
});
