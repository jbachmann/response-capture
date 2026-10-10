export type PetStatus = 'available' | 'pending' | 'sold';
export interface NamedEntity {
  id?: number;
  name?: string;
}
export interface Pet {
  id: number;
  name: string;
  status: PetStatus;
  photoUrls: string[];
  category?: NamedEntity;
  tags: NamedEntity[];
}
export type PetInput = Omit<Pet, 'id'>;
export interface Inventory {
  available: number;
  pending: number;
  sold: number;
}
export interface Order {
  id: number;
  petId: number;
  quantity: number;
  shipDate?: string;
  status: 'placed' | 'approved' | 'delivered';
  complete: boolean;
}
export interface OrderInput {
  petId: number;
  quantity: number;
  shipDate?: string;
}

export interface SeedResult {
  pets: number;
  orders: number;
  inventory: Inventory;
}
