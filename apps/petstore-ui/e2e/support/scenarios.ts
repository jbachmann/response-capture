import type { Inventory, Pet, PetInput } from '@response-capture/contracts/petstore';
import { scenarioReferences } from '@response-capture/scenario-client';

// The create endpoint supplies defaults for fields omitted from its recorded input.
export type CreatePetRequest = Omit<PetInput, 'status' | 'tags'> &
  Partial<Pick<PetInput, 'status' | 'tags'>>;

const pets = scenarioReferences('pets');

export const petScenarios = {
  create: pets.define<CreatePetRequest, Pet>('pet.create.success'),
  detail: pets.define<null, Pet>('pet.read.after-order-deletion'),
  list: pets.define<null, Pet[]>('pet.list.success'),
  emptyList: pets.define<null, Pet[]>('pet.list.empty'),
  inventory: pets.define<null, Inventory>('store.inventory.with-order'),
  emptyInventory: pets.define<null, Inventory>('store.inventory.empty'),
  missing: pets.define<null>('pet.read.missing'),
  remove: pets.define<null, null>('pet.delete.success'),
  removeConflict: pets.define<null>('pet.delete.referenced-by-order'),
};
