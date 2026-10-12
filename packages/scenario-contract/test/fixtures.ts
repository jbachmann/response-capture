import type { Catalog } from '@response-capture/contracts/scenarios';
import type { CatalogSnapshot } from '@response-capture/scenario-client';
import { catalogDigest } from '@response-capture/scenario-client/node';

export function fixtureCatalog(): Catalog {
  return {
    catalogVersion: 1,
    scenarios: [
      {
        schemaVersion: 1,
        id: 'widget.read',
        request: {
          method: 'GET',
          path: '/widgets/7',
          query: { labels: ['a b', 'a+b', ''] },
          body: null,
        },
        response: { status: 200, body: { id: 7, label: 'Example', details: { enabled: true } } },
      },
    ],
  };
}
export function fixtureSnapshot(catalog = fixtureCatalog()): CatalogSnapshot {
  return {
    catalog,
    source: {
      systemName: 'widgets-api',
      selector: null,
      url: 'file:///fixtures/widgets.json',
      sha256: catalogDigest(catalog),
    },
  };
}
