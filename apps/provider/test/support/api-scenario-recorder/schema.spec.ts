import { bodyContains, validateCatalog, validateScenario } from './schema.js';
import type { Json } from './schema.js';
const sample = () => ({
  schemaVersion: 1,
  id: 'pet.create',
  request: { method: 'POST', path: '/pet/123', body: { a: 1 } },
  response: { status: 201, body: null },
});
describe('scenario schema', () => {
  it('matches recursive subsets with full ordered array equality', () => {
    expect(bodyContains({ a: { b: 1, c: 2 } }, { a: { b: 1 } })).toBe(true);
    expect(bodyContains([{ a: 1, b: 2 }], [{ a: 1 }])).toBe(false);
    expect(
      bodyContains([{ nested: { a: 1, b: 2 } }], [{ nested: { a: 1 } }]),
    ).toBe(false);
    expect(bodyContains([1, 2], [2, 1])).toBe(false);
    expect(bodyContains([1, 2], [1])).toBe(false);
    expect(bodyContains([1, { a: 2 }], [1, { a: 2 }])).toBe(true);
    expect(bodyContains({}, { toString: 'x' })).toBe(false);
  });
  it.each([
    ['schemaVersion', 2],
    ['id', ''],
    ['description', 42],
    ['request', { method: 'get', path: '/pet', body: null }],
    ['request', { method: 'TRACE', path: '/pet', body: null }],
    ...[
      'https://host/pet',
      '//host/pet',
      '/pet?q=x',
      '/pet#x',
      '/pet/:id',
      '/bad path',
      '/bad%xx',
      '/bad\u0000',
      '/café',
    ].map((path): [string, unknown] => [
      'request',
      { method: 'GET', path, body: null },
    ]),
    ['request', { method: 'GET', path: '/pet' }],
    ['response', { status: 99, body: null }],
    ['response', { status: 600, body: null }],
    ['response', { status: 200.5, body: null }],
    ['response', { status: 200, body: undefined }],
    [
      'response',
      { status: 200, body: {}, headers: { 'content-type': 'text/plain' } },
    ],
    ['response', { status: 200, body: {}, extra: true }],
  ])('rejects invalid %s with source and field', (field, value) => {
    expect(() =>
      validateScenario({ ...sample(), [field as string]: value }, 'bad.json'),
    ).toThrow(/bad.json.*(?:pet.create|unknown ID).*\w+/);
  });
  it('rejects non-JSON values, cycles and sparse arrays', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse: unknown[] = [];
    sparse.length = 2;
    for (const body of [
      NaN,
      Infinity,
      1n,
      () => 1,
      new Date(),
      cycle,
      sparse,
      { a: undefined },
    ]) {
      expect(() =>
        validateScenario({
          ...sample(),
          request: { ...sample().request, body },
        }),
      ).toThrow(/request.body/);
    }
  });
  it('validates catalogs and matching hints', () => {
    expect(() =>
      validateCatalog({ catalogVersion: 2, scenarios: [] }, 'catalog.json'),
    ).toThrow(/catalogVersion/);
    expect(() =>
      validateCatalog({ catalogVersion: 1, scenarios: {} }, 'catalog.json'),
    ).toThrow(/scenarios/);
    for (const bodyContains of [[], null, { a: 2 }]) {
      expect(() =>
        validateScenario({
          ...sample(),
          request: { ...sample().request, match: { bodyContains } },
        }),
      ).toThrow(/bodyContains/);
    }
    expect(() =>
      validateScenario({
        ...sample(),
        request: {
          ...sample().request,
          match: { bodyContains: { a: 1 } as Json },
        },
      }),
    ).not.toThrow();
  });
});
