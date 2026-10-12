import { expect, it } from 'vitest';
import * as schemas from './schemas';
import { basicPet, richPet, basicOrder, datedOrder } from './fixtures';

it('accepts consumer-owned basic and nested payload shapes', () => {
  for (const [schema, value] of [
    [schemas.pet, basicPet],
    [schemas.nestedPet, richPet],
    [schemas.order, basicOrder],
    [schemas.shippingOrder, datedOrder],
    [schemas.defaultPetRequest, { name: 'New', photoUrls: [] }],
    [schemas.defaultOrderRequest, { petId: 7 }],
  ] as const)
    expect(schema.safeParse(value).success).toBe(true);
});
it.each([0, -1, 1.5, '7', Number.MAX_SAFE_INTEGER + 1, null])(
  'rejects invalid IDs and quantities: %j',
  (value) => {
    expect(schemas.pet.safeParse({ ...basicPet, id: value }).success).toBe(false);
    expect(schemas.order.safeParse({ ...basicOrder, quantity: value }).success).toBe(false);
    expect(schemas.defaultOrderRequest.safeParse({ petId: value }).success).toBe(false);
  },
);
it.each([
  ['name', undefined],
  ['photoUrls', null],
  ['photoUrls', [42]],
  ['tags', null],
  ['tags', [{ id: -1 }]],
  ['tags', [{ name: 42 }]],
  ['status', 'lost'],
  ['category', null],
  ['category', { id: '9' }],
  ['category', { name: null }],
] as const)('rejects incompatible pet field %s = %j', (field, value) => {
  expect(schemas.pet.safeParse({ ...richPet, [field]: value }).success).toBe(false);
});
it('requires nested/complete fields and permits omitted optional fields without defaulting', () => {
  expect(schemas.nestedPet.safeParse(basicPet).success).toBe(false);
  expect(schemas.completePetRequest.safeParse({ name: 'New', photoUrls: [] }).success).toBe(false);
  expect(schemas.defaultReplacement.safeParse({ name: 'New', photoUrls: [] }).success).toBe(false);
  expect(schemas.shippingOrderRequest.safeParse({ petId: 7, quantity: 2 }).success).toBe(false);
  expect(schemas.shippingOrder.safeParse(basicOrder).success).toBe(false);
  const input = { name: 'New', photoUrls: [] };
  expect(schemas.defaultPetRequest.parse(input)).toEqual(input);
  expect(schemas.pet.safeParse({ ...basicPet, category: {}, tags: [{}] }).success).toBe(true);
});
it.each([
  ['status', 'cancelled'],
  ['complete', 'false'],
  ['shipDate', null],
  ['shipDate', 'tomorrow'],
  ['shipDate', '2030-02-30T12:00:00Z'],
  ['shipDate', '2030-01-01'],
] as const)('rejects incompatible order field %s = %j', (field, value) => {
  expect(schemas.order.safeParse({ ...datedOrder, [field]: value }).success).toBe(false);
});
it('validates inventory counts and nested seed results', () => {
  const inventory = { available: 0, pending: 0, sold: 0 };
  expect(schemas.emptyInventory.safeParse(inventory).success).toBe(true);
  expect(schemas.populatedInventory.safeParse(inventory).success).toBe(false);
  for (const value of [-1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1])
    expect(schemas.inventory.safeParse({ ...inventory, available: value }).success).toBe(false);
  expect(
    schemas.seedResult.safeParse({ pets: 2, orders: 1, inventory: { available: 2, pending: 0 } })
      .success,
  ).toBe(false);
});
it.each(['0', '-1', '1.5', '9007199254740992', 'abc', '7/extra', ''])(
  'rejects invalid parameterized route IDs: %s',
  (id) => {
    expect(schemas.petPath.safeParse(`/pet/${id}`).success).toBe(false);
    expect(schemas.orderPath.safeParse(`/store/order/${id}`).success).toBe(false);
  },
);
it('accepts changed safe IDs but rejects changed route structure', () => {
  expect(schemas.petPath.safeParse('/pet/12345').success).toBe(true);
  expect(schemas.orderPath.safeParse('/store/order/54321').success).toBe(true);
  expect(schemas.petPath.safeParse('/pets/7').success).toBe(false);
  expect(schemas.orderPath.safeParse('/order/7').success).toBe(false);
});
it('requires single-parameter filter shapes', () => {
  expect(schemas.statusQuery.safeParse({ status: ['available'] }).success).toBe(true);
  expect(schemas.tagQuery.safeParse({ tags: ['cute cat'] }).success).toBe(true);
  for (const query of [
    undefined,
    {},
    { status: ['lost'] },
    { status: ['available', 'pending'] },
    { status: ['available'], extra: ['x'] },
  ])
    expect(schemas.statusQuery.safeParse(query).success).toBe(false);
  for (const query of [
    {},
    { tags: [''] },
    { tags: ['one', 'two'] },
    { tags: ['one'], extra: ['x'] },
  ])
    expect(schemas.tagQuery.safeParse(query).success).toBe(false);
});
it('permits extra payload fields and changed names, dates and array order', () => {
  expect(
    schemas.nestedPet.safeParse({
      ...richPet,
      id: 99,
      name: 'Changed',
      tags: [{ name: 'Second' }, { ...richPet.tags[0], extra: true }],
      category: { ...richPet.category, extra: true },
      future: {},
    }).success,
  ).toBe(true);
  expect(
    schemas.shippingOrder.safeParse({
      ...datedOrder,
      shipDate: '2040-12-31T23:59:59+01:00',
      extra: true,
    }).success,
  ).toBe(true);
});
