import { describe, it } from 'vitest';
import { z } from 'zod';
import { assertScenarioContract } from '@response-capture/scenario-contract';
import { getContractCatalog } from '@response-capture/scenario-contract/vitest';
import * as schemas from './schemas';

describe('Inventory', () => {
  it('returns empty inventory', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.inventory.empty', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: z.literal('/store/inventory'),
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.emptyInventory,
      }),
    });
  });
  it('returns populated inventory', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.inventory.with-order', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: z.literal('/store/inventory'),
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.populatedInventory,
      }),
    });
  });
});

describe('Create order', () => {
  it('creates an order using defaulted input', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.create.defaults', {
      request: z.looseObject({
        method: z.literal('POST'),
        path: z.literal('/store/order'),
        query: z.undefined(),
        body: schemas.defaultOrderRequest,
      }),
      response: z.looseObject({
        status: z.literal(201),
        body: schemas.order,
      }),
    });
  });
  it('creates an order with quantity and shipping date', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.create.with-shipping', {
      request: z.looseObject({
        method: z.literal('POST'),
        path: z.literal('/store/order'),
        query: z.undefined(),
        body: schemas.shippingOrderRequest,
      }),
      response: z.looseObject({
        status: z.literal(201),
        body: schemas.shippingOrder,
      }),
    });
  });
  it('rejects an order for a missing pet', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.create.missing-pet', {
      request: z.looseObject({
        method: z.literal('POST'),
        path: z.literal('/store/order'),
        query: z.undefined(),
        body: schemas.defaultOrderRequest,
      }),
      response: z.looseObject({
        status: z.literal(404),
      }),
    });
  });
});

describe('List orders', () => {
  it('returns an empty order list', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.list.empty', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: z.literal('/store/order'),
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: z.array(schemas.order).length(0),
      }),
    });
  });
  it('returns a populated order list', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.list.success', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: z.literal('/store/order'),
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: z.array(schemas.order).min(1),
      }),
    });
  });
});

describe('Read order', () => {
  it('reads a basic order', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.read.success', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: schemas.orderPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.order,
      }),
    });
  });
  it('reads a persisted order with shipping date', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.read.persisted', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: schemas.orderPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.shippingOrder,
      }),
    });
  });
  it('reports a missing order', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.read.missing', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: schemas.orderPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(404),
      }),
    });
  });
});

describe('Delete order', () => {
  it('deletes an order without a response body', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.delete.success', {
      request: z.looseObject({
        method: z.literal('DELETE'),
        path: schemas.orderPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(204),
        body: z.null(),
      }),
    });
  });
  it('reports a missing order during deletion', () => {
    assertScenarioContract(getContractCatalog('pets'), 'store.order.delete.missing', {
      request: z.looseObject({
        method: z.literal('DELETE'),
        path: schemas.orderPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(404),
      }),
    });
  });
});

describe('Training seed', () => {
  it('seeds the training database', () => {
    assertScenarioContract(getContractCatalog('pets'), 'training.seed.replaces-existing', {
      request: z.looseObject({
        method: z.literal('POST'),
        path: z.literal('/training/seed'),
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.seedResult,
      }),
    });
  });
});
