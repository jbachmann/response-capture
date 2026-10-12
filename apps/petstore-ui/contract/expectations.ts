import { z } from 'zod';
import type { Method } from '@response-capture/contracts/scenarios';
import * as schemas from './schemas';

export interface ScenarioExpectation {
  id: string;
  method: Method;
  endpoint: string;
  status: number;
  request: z.ZodType;
  response?: z.ZodType;
  query?: z.ZodType;
}
const bodyless = z.null();
const emptyPets = z.array(schemas.pet).length(0);
const populatedPets = z.array(schemas.pet).min(1);
const emptyOrders = z.array(schemas.order).length(0);
const populatedOrders = z.array(schemas.order).min(1);

// Stable scenario IDs are the only provider-owned facts in this declaration.
export const expectations: ScenarioExpectation[] = [
  {
    id: 'pet.list.empty',
    method: 'GET',
    endpoint: '/pet',
    status: 200,
    request: bodyless,
    response: emptyPets,
  },
  {
    id: 'pet.list.success',
    method: 'GET',
    endpoint: '/pet',
    status: 200,
    request: bodyless,
    response: populatedPets,
  },
  {
    id: 'pet.filter.by-status.success',
    method: 'GET',
    endpoint: '/pet/findByStatus',
    status: 200,
    request: bodyless,
    query: schemas.statusQuery,
    response: populatedPets,
  },
  {
    id: 'pet.filter.by-tags.success',
    method: 'GET',
    endpoint: '/pet/findByTags',
    status: 200,
    request: bodyless,
    query: schemas.tagQuery,
    response: populatedPets,
  },
  {
    id: 'pet.read.after-order-deletion',
    method: 'GET',
    endpoint: '/pet/{id}',
    status: 200,
    request: bodyless,
    response: schemas.pet,
  },
  {
    id: 'pet.read.success',
    method: 'GET',
    endpoint: '/pet/{id}',
    status: 200,
    request: bodyless,
    response: schemas.nestedPet,
  },
  {
    id: 'pet.read.persisted',
    method: 'GET',
    endpoint: '/pet/{id}',
    status: 200,
    request: bodyless,
    response: schemas.nestedPet,
  },
  { id: 'pet.read.missing', method: 'GET', endpoint: '/pet/{id}', status: 404, request: bodyless },
  {
    id: 'pet.create.success',
    method: 'POST',
    endpoint: '/pet',
    status: 201,
    request: schemas.defaultPetRequest,
    response: schemas.pet,
  },
  {
    id: 'pet.create.with-category-and-tags',
    method: 'POST',
    endpoint: '/pet',
    status: 201,
    request: schemas.completePetRequest,
    response: schemas.nestedPet,
  },
  { id: 'pet.create.invalid', method: 'POST', endpoint: '/pet', status: 400, request: z.unknown() },
  {
    id: 'pet.replace.resets-defaults',
    method: 'PUT',
    endpoint: '/pet',
    status: 200,
    request: schemas.defaultReplacement,
    response: schemas.pet,
  },
  {
    id: 'pet.replace.complete',
    method: 'PUT',
    endpoint: '/pet',
    status: 200,
    request: schemas.completeReplacement,
    response: schemas.nestedPet,
  },
  {
    id: 'pet.replace.missing',
    method: 'PUT',
    endpoint: '/pet',
    status: 404,
    request: schemas.defaultReplacement,
  },
  {
    id: 'pet.delete.success',
    method: 'DELETE',
    endpoint: '/pet/{id}',
    status: 204,
    request: bodyless,
    response: z.null(),
  },
  {
    id: 'pet.delete.missing',
    method: 'DELETE',
    endpoint: '/pet/{id}',
    status: 404,
    request: bodyless,
  },
  {
    id: 'pet.delete.referenced-by-order',
    method: 'DELETE',
    endpoint: '/pet/{id}',
    status: 409,
    request: bodyless,
  },
  {
    id: 'store.inventory.empty',
    method: 'GET',
    endpoint: '/store/inventory',
    status: 200,
    request: bodyless,
    response: schemas.emptyInventory,
  },
  {
    id: 'store.inventory.with-order',
    method: 'GET',
    endpoint: '/store/inventory',
    status: 200,
    request: bodyless,
    response: schemas.populatedInventory,
  },
  {
    id: 'store.order.create.defaults',
    method: 'POST',
    endpoint: '/store/order',
    status: 201,
    request: schemas.defaultOrderRequest,
    response: schemas.order,
  },
  {
    id: 'store.order.create.with-shipping',
    method: 'POST',
    endpoint: '/store/order',
    status: 201,
    request: schemas.shippingOrderRequest,
    response: schemas.shippingOrder,
  },
  {
    id: 'store.order.create.missing-pet',
    method: 'POST',
    endpoint: '/store/order',
    status: 404,
    request: schemas.defaultOrderRequest,
  },
  {
    id: 'store.order.list.empty',
    method: 'GET',
    endpoint: '/store/order',
    status: 200,
    request: bodyless,
    response: emptyOrders,
  },
  {
    id: 'store.order.list.success',
    method: 'GET',
    endpoint: '/store/order',
    status: 200,
    request: bodyless,
    response: populatedOrders,
  },
  {
    id: 'store.order.read.success',
    method: 'GET',
    endpoint: '/store/order/{id}',
    status: 200,
    request: bodyless,
    response: schemas.order,
  },
  {
    id: 'store.order.read.persisted',
    method: 'GET',
    endpoint: '/store/order/{id}',
    status: 200,
    request: bodyless,
    response: schemas.shippingOrder,
  },
  {
    id: 'store.order.read.missing',
    method: 'GET',
    endpoint: '/store/order/{id}',
    status: 404,
    request: bodyless,
  },
  {
    id: 'store.order.delete.success',
    method: 'DELETE',
    endpoint: '/store/order/{id}',
    status: 204,
    request: bodyless,
    response: z.null(),
  },
  {
    id: 'store.order.delete.missing',
    method: 'DELETE',
    endpoint: '/store/order/{id}',
    status: 404,
    request: bodyless,
  },
  {
    id: 'training.seed.replaces-existing',
    method: 'POST',
    endpoint: '/training/seed',
    status: 200,
    request: bodyless,
    response: schemas.seedResult,
  },
];
