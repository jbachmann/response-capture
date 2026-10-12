import { expect, it } from 'vitest';
import { petstoreCatalogSource } from './catalog-source';

it('gives file input precedence over API URL and selector', () => {
  expect(
    petstoreCatalogSource({
      CONTRACT_CATALOG_PATH: 'catalog.json',
      CATALOG_API_URL: 'invalid',
      CATALOG_SELECTOR: 'ignored',
    }),
  ).toEqual({ systemName: 'petstore-api', file: 'catalog.json' });
});
it.each([undefined, '', ' '])('defaults a blank selector to latest: %j', (CATALOG_SELECTOR) => {
  expect(petstoreCatalogSource({ CATALOG_SELECTOR })).toEqual({
    systemName: 'petstore-api',
    catalogApiUrl: 'http://localhost:3001',
    selection: { latest: true },
  });
});
it('uses the explicitly configured API and selector', () => {
  expect(
    petstoreCatalogSource({
      CATALOG_API_URL: 'https://catalog.example',
      CATALOG_SELECTOR: 'feature/a b',
    }),
  ).toEqual({
    systemName: 'petstore-api',
    catalogApiUrl: 'https://catalog.example',
    selection: { selector: 'feature/a b' },
  });
});
it('rejects blank file input instead of falling back', () => {
  expect(() => petstoreCatalogSource({ CONTRACT_CATALOG_PATH: '' })).toThrow(
    'CONTRACT_CATALOG_PATH',
  );
});
