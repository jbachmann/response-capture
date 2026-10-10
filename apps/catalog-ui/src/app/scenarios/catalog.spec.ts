import { parseCatalog, type Scenario } from '@response-capture/contracts/scenarios';
import {
  emptyFilters,
  filterScenarios,
  groupScenarios,
  normalizeFilters,
  filterOptions,
} from './scenario-filters';

import { example, synthetic } from './catalog.fixtures';

describe('dynamic catalog model', () => {
  it('accepts legacy, partial, enriched, and empty catalogs', () => {
    expect(parseCatalog({ catalogVersion: 1, scenarios: synthetic }).scenarios).toHaveLength(4);
    expect(
      parseCatalog({
        catalogVersion: 1,
        scenarios: [example('partial', { group: 'Whatever comes next' })],
      }).scenarios,
    ).toHaveLength(1);
    expect(parseCatalog({ catalogVersion: 1, scenarios: [] }).scenarios).toEqual([]);
  });
  it.each([
    null,
    { catalogVersion: 2, scenarios: [] },
    { catalogVersion: 1, scenarios: [example('a'), example('a')] },
    ...[
      { title: ' ' },
      { extra: true },
      {
        request: {
          method: 'GET',
          path: '/a',
          body: { name: 'observed' },
          match: { bodyContains: { name: 'different' } },
        },
      },
      { category: 4 },
      { group: null },
      { tags: ['a', 'a'] },
      { tags: [' '] },
      { schemaVersion: 2 },
      { request: { method: 'GET', path: '/a' } },
      { response: { status: 999, body: null } },
      { response: { status: 200, body: { value: undefined } } },
      { request: { method: 'GET', path: '/a', body: null, match: { bodyContains: [] } } },
    ].map((metadata) => ({ catalogVersion: 1, scenarios: [{ ...example('bad'), ...metadata }] })),
  ])('rejects unsupported or malformed wire data', (value) =>
    expect(() => parseCatalog(value)).toThrow(),
  );
  it('discovers arbitrary metadata and statuses, and scopes groups by category', () => {
    expect(filterOptions(synthetic, 'Weather')).toEqual({
      categories: ['Astronomy', 'Weather'],
      groups: ['Launch'],
      tags: ['day', 'night'],
      statuses: ['201'],
    });
    expect(
      filterOptions([
        example('new', {
          category: 'Shipping',
          group: 'Dispatch',
          tags: ['express'],
          response: { status: 409, body: null },
        }),
      ]).tags,
    ).toEqual(['express']);
  });
  it('combines filters and searches metadata and paths without domain assumptions', () => {
    expect(
      filterScenarios(synthetic, {
        ...emptyFilters,
        category: 'Astronomy',
        tag: 'night',
        status: '201',
        q: 'sky observatories',
      }).map((s) => s.id),
    ).toEqual(['z']);
    expect(filterScenarios(synthetic, { ...emptyFilters, q: 'missing' })).toEqual([]);
  });
  it('sorts titles with IDs breaking ties and keeps missing groups directly in their category', () => {
    const sorted = filterScenarios(
      [example('z', { title: 'Same' }), example('a', { title: 'Same' }), ...synthetic],
      emptyFilters,
    );
    expect(sorted.filter((s) => s.title === 'Same').map((s) => s.id)).toEqual(['a', 'z']);
    const grouped = groupScenarios(filterScenarios(synthetic, emptyFilters));
    expect(grouped.map((c) => c.name)).toEqual(['Astronomy', null, 'Weather']);
    expect(grouped[1].groups[0]).toEqual({ name: null, scenarios: [synthetic[3]] });
  });
  it('drops unavailable filters after refresh and clears a group incompatible with its category', () => {
    expect(
      normalizeFilters(
        { q: 'keep', category: 'Weather', group: 'Open a station', tag: 'night', status: '404' },
        synthetic,
      ),
    ).toEqual({ q: 'keep', category: 'Weather', group: '', tag: 'night', status: '' });
    expect(
      normalizeFilters(
        { q: '', category: 'Astronomy', group: 'Open a station', tag: 'night', status: '201' },
        [],
      ),
    ).toEqual(emptyFilters);
  });
});
