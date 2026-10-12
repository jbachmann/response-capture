import type { Catalog, Json, Method, Scenario } from '@response-capture/contracts/scenarios';
import type { CatalogSnapshot } from '@response-capture/scenario-client';
import { catalogDigest } from '@response-capture/scenario-client/node';

// Supplied offline examples; these do not read provider types, DTOs or catalogs.
export const basicPet = { id: 7, name: 'Example', photoUrls: [], tags: [], status: 'available' };
export const richPet = {
  ...basicPet,
  category: { id: 9, name: 'Category' },
  tags: [{ id: 12, name: 'Tag' }],
};
const minimalPet = { name: 'Example', photoUrls: [] };
const fullPet = {
  ...minimalPet,
  category: richPet.category,
  tags: richPet.tags,
  status: 'pending',
};
export const basicOrder = { id: 8, petId: 7, quantity: 1, status: 'placed', complete: false };
export const datedOrder = { ...basicOrder, quantity: 3, shipDate: '2030-01-01T10:00:00Z' };
const inventory = { available: 2, pending: 1, sold: 0 };
const error = { providerDiagnostic: 'Consumer does not depend on this shape' };

type Example = [string, Method, string, Json, number, Json, Record<string, string[]>?];
const examples: Example[] = [
  ['pet.list.empty', 'GET', '/pet', null, 200, []],
  ['pet.list.success', 'GET', '/pet', null, 200, [basicPet, richPet]],
  [
    'pet.filter.by-status.success',
    'GET',
    '/pet/findByStatus',
    null,
    200,
    [basicPet],
    { status: ['available'] },
  ],
  ['pet.filter.by-tags.success', 'GET', '/pet/findByTags', null, 200, [richPet], { tags: ['Tag'] }],
  ['pet.read.after-order-deletion', 'GET', '/pet/7', null, 200, basicPet],
  ['pet.read.success', 'GET', '/pet/7', null, 200, richPet],
  ['pet.read.persisted', 'GET', '/pet/7', null, 200, richPet],
  ['pet.read.missing', 'GET', '/pet/999', null, 404, error],
  ['pet.create.success', 'POST', '/pet', minimalPet, 201, basicPet],
  ['pet.create.with-category-and-tags', 'POST', '/pet', fullPet, 201, richPet],
  ['pet.create.invalid', 'POST', '/pet', {}, 400, error],
  ['pet.replace.resets-defaults', 'PUT', '/pet', { ...minimalPet, id: 7 }, 200, basicPet],
  ['pet.replace.complete', 'PUT', '/pet', { ...fullPet, id: 7 }, 200, richPet],
  ['pet.replace.missing', 'PUT', '/pet', { ...minimalPet, id: 999 }, 404, error],
  ['pet.delete.success', 'DELETE', '/pet/7', null, 204, null],
  ['pet.delete.missing', 'DELETE', '/pet/999', null, 404, error],
  ['pet.delete.referenced-by-order', 'DELETE', '/pet/7', null, 409, error],
  [
    'store.inventory.empty',
    'GET',
    '/store/inventory',
    null,
    200,
    { available: 0, pending: 0, sold: 0 },
  ],
  ['store.inventory.with-order', 'GET', '/store/inventory', null, 200, inventory],
  ['store.order.create.defaults', 'POST', '/store/order', { petId: 7 }, 201, basicOrder],
  [
    'store.order.create.with-shipping',
    'POST',
    '/store/order',
    { petId: 7, quantity: 3, shipDate: datedOrder.shipDate },
    201,
    datedOrder,
  ],
  ['store.order.create.missing-pet', 'POST', '/store/order', { petId: 999 }, 404, error],
  ['store.order.list.empty', 'GET', '/store/order', null, 200, []],
  ['store.order.list.success', 'GET', '/store/order', null, 200, [basicOrder, datedOrder]],
  ['store.order.read.success', 'GET', '/store/order/8', null, 200, basicOrder],
  ['store.order.read.persisted', 'GET', '/store/order/8', null, 200, datedOrder],
  ['store.order.read.missing', 'GET', '/store/order/999', null, 404, error],
  ['store.order.delete.success', 'DELETE', '/store/order/8', null, 204, null],
  ['store.order.delete.missing', 'DELETE', '/store/order/999', null, 404, error],
  [
    'training.seed.replaces-existing',
    'POST',
    '/training/seed',
    null,
    200,
    { pets: 3, orders: 2, inventory },
  ],
];

export function fixtureCatalog(): Catalog {
  return {
    catalogVersion: 1,
    scenarios: examples.map(([id, method, path, body, status, response, query]): Scenario =>
      structuredClone({
        schemaVersion: 1,
        id,
        request: { method, path, body, ...(query ? { query } : {}) },
        response: { status, body: response },
      }),
    ),
  };
}
export function fixtureSnapshot(catalog = fixtureCatalog()): CatalogSnapshot {
  return {
    catalog,
    source: {
      systemName: 'petstore-api',
      selector: null,
      url: 'file:///offline/catalog.json',
      sha256: catalogDigest(catalog),
    },
  };
}
