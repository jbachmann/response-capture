import { describe, expect, it } from 'vitest';
import type { Json, Scenario } from '@response-capture/contracts/scenarios';
import { assertCatalogContract } from './assert-contract';
import { fixtureSnapshot } from './fixtures';
import { expectations } from './expectations';

function object(body: Json): Record<string, Json> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('Expected fixture object');
  return body;
}
type Mutation = [string, string, (scenario: Scenario) => void];
const mutations: Mutation[] = [
  [
    'pet.list.success',
    'request.method',
    (s) => {
      s.request.method = 'POST';
    },
  ],
  [
    'pet.read.success',
    'request.path',
    (s) => {
      s.request.path = '/pets/7';
    },
  ],
  ...['0', '-1', '1.5', '9007199254740992', 'abc', '7/extra'].map((id): Mutation => [
    'pet.read.success',
    'request.path',
    (s) => {
      s.request.path = `/pet/${id}`;
    },
  ]),
  [
    'pet.create.success',
    'response.status',
    (s) => {
      s.response.status = 200;
    },
  ],
  [
    'pet.filter.by-status.success',
    'request.query',
    (s) => {
      delete s.request.query;
    },
  ],
  [
    'pet.filter.by-status.success',
    'request.query.status',
    (s) => {
      s.request.query = { tags: ['Tag'] };
    },
  ],
  [
    'pet.filter.by-status.success',
    'request.query.status',
    (s) => {
      s.request.query = { status: ['lost'] };
    },
  ],
  [
    'pet.filter.by-status.success',
    'request.query.status',
    (s) => {
      s.request.query = { status: ['available', 'pending'] };
    },
  ],
  [
    'pet.filter.by-tags.success',
    'request.query.tags',
    (s) => {
      s.request.query = { tags: [''] };
    },
  ],
  [
    'pet.filter.by-tags.success',
    'request.query',
    (s) => {
      s.request.query = { tags: ['Tag'], extra: ['x'] };
    },
  ],
  [
    'pet.read.success',
    'response.body.category.id',
    (s) => {
      object(object(s.response.body)['category'])['id'] = '9';
    },
  ],
  [
    'pet.read.success',
    'response.body.category.name',
    (s) => {
      object(object(s.response.body)['category'])['name'] = null;
    },
  ],
  [
    'pet.read.success',
    'response.body.category',
    (s) => {
      delete object(s.response.body)['category'];
    },
  ],
  [
    'pet.read.success',
    'response.body.tags.0.name',
    (s) => {
      object(s.response.body)['tags'] = [{ name: 42 }];
    },
  ],
  [
    'pet.read.success',
    'response.body.tags',
    (s) => {
      delete object(s.response.body)['tags'];
    },
  ],
  [
    'pet.read.success',
    'response.body.status',
    (s) => {
      object(s.response.body)['status'] = 'lost';
    },
  ],
  [
    'pet.read.success',
    'response.body.name',
    (s) => {
      delete object(s.response.body)['name'];
    },
  ],
  [
    'pet.read.success',
    'response.body.photoUrls.0',
    (s) => {
      object(s.response.body)['photoUrls'] = [42];
    },
  ],
  [
    'pet.read.success',
    'response.body.id',
    (s) => {
      object(s.response.body)['id'] = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'pet.create.success',
    'request.body.photoUrls',
    (s) => {
      delete object(s.request.body)['photoUrls'];
    },
  ],
  [
    'pet.create.success',
    'request.body.status',
    (s) => {
      object(s.request.body)['status'] = null;
    },
  ],
  [
    'pet.replace.complete',
    'request.body.category',
    (s) => {
      delete object(s.request.body)['category'];
    },
  ],
  [
    'pet.replace.complete',
    'request.body.status',
    (s) => {
      delete object(s.request.body)['status'];
    },
  ],
  [
    'pet.replace.resets-defaults',
    'request.body.id',
    (s) => {
      object(s.request.body)['id'] = 0;
    },
  ],
  [
    'pet.delete.success',
    'response.body',
    (s) => {
      s.response.body = {};
    },
  ],
  [
    'pet.list.empty',
    'response.body',
    (s) => {
      s.response.body = null;
    },
  ],
  [
    'pet.list.success',
    'response.body',
    (s) => {
      s.response.body = [];
    },
  ],
  [
    'store.order.list.empty',
    'response.body',
    (s) => {
      s.response.body = {};
    },
  ],
  [
    'store.order.list.success',
    'response.body.0.quantity',
    (s) => {
      s.response.body = [{ ...object((s.response.body as Json[])[0]), quantity: -1 }];
    },
  ],
  [
    'store.order.create.with-shipping',
    'request.body.shipDate',
    (s) => {
      delete object(s.request.body)['shipDate'];
    },
  ],
  [
    'store.order.create.with-shipping',
    'request.body.shipDate',
    (s) => {
      object(s.request.body)['shipDate'] = '2030-02-30T12:00:00Z';
    },
  ],
  [
    'store.order.create.defaults',
    'request.body.petId',
    (s) => {
      object(s.request.body)['petId'] = '7';
    },
  ],
  [
    'store.order.read.success',
    'response.body.status',
    (s) => {
      object(s.response.body)['status'] = 'cancelled';
    },
  ],
  [
    'store.order.read.success',
    'response.body.complete',
    (s) => {
      object(s.response.body)['complete'] = 'false';
    },
  ],
  [
    'store.order.read.success',
    'response.body.quantity',
    (s) => {
      object(s.response.body)['quantity'] = 1.5;
    },
  ],
  [
    'store.order.read.persisted',
    'response.body.shipDate',
    (s) => {
      object(s.response.body)['shipDate'] = null;
    },
  ],
  [
    'store.inventory.with-order',
    'response.body.available',
    (s) => {
      object(s.response.body)['available'] = -1;
    },
  ],
  [
    'training.seed.replaces-existing',
    'response.body.inventory.sold',
    (s) => {
      delete object(object(s.response.body)['inventory'])['sold'];
    },
  ],
  [
    'training.seed.replaces-existing',
    'request.body',
    (s) => {
      s.request.body = {};
    },
  ],
];

describe('consumer contract compatibility', () => {
  it('accepts supplied examples for every declared scenario', () => {
    expect(() => assertCatalogContract(fixtureSnapshot())).not.toThrow();
  });
  it.each(expectations.map((e) => e.id))('requires stable ID %s', (id) => {
    const snapshot = fixtureSnapshot();
    snapshot.catalog.scenarios = snapshot.catalog.scenarios.filter((s) => s.id !== id);
    expect(() => assertCatalogContract(snapshot)).toThrow(`${id} [source`);
  });
  it.each(mutations)('rejects incompatible %s at %s', (id, field, mutate) => {
    const snapshot = fixtureSnapshot();
    mutate(snapshot.catalog.scenarios.find((s) => s.id === id)!);
    let message = '';
    try {
      assertCatalogContract(snapshot);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(id);
    expect(message).toContain(field);
    expect(message).toContain(snapshot.source.url);
    expect(message).toContain(snapshot.source.sha256);
  });
  it('accepts added payload fields, unrelated scenarios, reordered arrays and changed fixture values', () => {
    const snapshot = fixtureSnapshot();
    for (const scenario of snapshot.catalog.scenarios) {
      if (scenario.request.path === '/pet/7') scenario.request.path = '/pet/12345';
      if (scenario.request.path === '/store/order/8') scenario.request.path = '/store/order/456';
      const add = (value: Json): void => {
        if (Array.isArray(value)) {
          value.reverse();
          value.forEach(add);
        } else if (value && typeof value === 'object') {
          Object.values(value).forEach(add);
          value['futureField'] = { arbitrary: true };
          if ('id' in value) value['id'] = 54321;
          if ('name' in value) value['name'] = 'Changed fixture';
          if ('shipDate' in value) value['shipDate'] = '2040-12-31T23:59:59+01:00';
        }
      };
      add(scenario.request.body);
      add(scenario.response.body);
    }
    snapshot.catalog.scenarios.push({
      schemaVersion: 1,
      id: 'unrelated.example',
      request: { method: 'PATCH', path: '/other', body: null },
      response: { status: 202, body: 42 },
    });
    expect(() => assertCatalogContract(snapshot)).not.toThrow();
  });
  it('places no consumer requirements on error body fields', () => {
    const snapshot = fixtureSnapshot();
    for (const scenario of snapshot.catalog.scenarios)
      if (scenario.response.status >= 400) scenario.response.body = null;
    expect(() => assertCatalogContract(snapshot)).not.toThrow();
  });
});
