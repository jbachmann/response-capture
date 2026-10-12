import { z } from 'zod';

// Consumer-owned wire expectations: no provider DTOs, coercion, defaults or transforms.
export const positiveInteger = z.int().positive();
const count = z.int().nonnegative();
const petStatus = z.enum(['available', 'pending', 'sold']);
const orderStatus = z.enum(['placed', 'approved', 'delivered']);
const shippingTimestamp = z.iso.datetime({ offset: true });
const namedEntity = z.looseObject({
  id: positiveInteger.optional(),
  name: z.string().optional(),
});
const petFields = {
  name: z.string(),
  photoUrls: z.array(z.string()),
  category: namedEntity.optional(),
  tags: z.array(namedEntity).optional(),
  status: petStatus.optional(),
};
export const defaultPetRequest = z.looseObject(petFields);
export const completePetRequest = z.looseObject({
  ...petFields,
  category: namedEntity,
  tags: z.array(namedEntity).min(1),
  status: petStatus,
});
export const defaultReplacement = defaultPetRequest.extend({ id: positiveInteger });
export const completeReplacement = completePetRequest.extend({ id: positiveInteger });
export const pet = z.looseObject({
  ...petFields,
  id: positiveInteger,
  tags: z.array(namedEntity),
  status: petStatus,
});
export const nestedPet = pet.extend({ category: namedEntity, tags: z.array(namedEntity).min(1) });
export const inventory = z.looseObject({ available: count, pending: count, sold: count });
export const emptyInventory = z.looseObject({
  available: z.literal(0),
  pending: z.literal(0),
  sold: z.literal(0),
});
export const populatedInventory = inventory.refine(
  (value) => value.available + value.pending + value.sold > 0,
  { message: 'Expected populated inventory' },
);
export const defaultOrderRequest = z.looseObject({
  petId: positiveInteger,
  quantity: positiveInteger.optional(),
  shipDate: shippingTimestamp.optional(),
  status: orderStatus.optional(),
  complete: z.boolean().optional(),
});
export const shippingOrderRequest = defaultOrderRequest.extend({
  quantity: positiveInteger,
  shipDate: shippingTimestamp,
});
export const order = z.looseObject({
  id: positiveInteger,
  petId: positiveInteger,
  quantity: positiveInteger,
  shipDate: shippingTimestamp.optional(),
  status: orderStatus,
  complete: z.boolean(),
});
export const shippingOrder = order.extend({ shipDate: shippingTimestamp });
export const seedResult = z.looseObject({ pets: count, orders: count, inventory });
export const statusQuery = z.strictObject({ status: z.array(petStatus).length(1) });
export const tagQuery = z.strictObject({ tags: z.array(z.string().min(1)).length(1) });

// Consumer route contracts validate shape and safe IDs without fixing recorded values.
export const petPath = z
  .string()
  .regex(/^\/pet\/\d+$/)
  .refine((path) => positiveInteger.safeParse(Number(path.split('/').at(-1))).success, {
    message: 'Expected /pet/{id} with a positive safe integer ID',
  });
export const orderPath = z
  .string()
  .regex(/^\/store\/order\/\d+$/)
  .refine((path) => positiveInteger.safeParse(Number(path.split('/').at(-1))).success, {
    message: 'Expected /store/order/{id} with a positive safe integer ID',
  });
