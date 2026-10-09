import { CreatePetDto, OrderStatus, PetStatus } from './dto.js';

// Fixed examples cover every pet and order status for classroom exercises.
export const seedPets: CreatePetDto[] = [
  {
    name: 'Milo',
    photoUrls: ['https://example.com/pets/milo.jpg'],
    category: { id: 1, name: 'Cats' },
    tags: [{ id: 1, name: 'friendly' }],
    status: PetStatus.Available,
  },
  {
    name: 'Luna',
    photoUrls: [],
    category: { id: 1, name: 'Cats' },
    tags: [{ id: 2, name: 'quiet' }],
    status: PetStatus.Pending,
  },
  {
    name: 'Bella',
    photoUrls: ['https://example.com/pets/bella.jpg'],
    category: { id: 2, name: 'Dogs' },
    tags: [
      { id: 1, name: 'friendly' },
      { id: 3, name: 'playful' },
    ],
    status: PetStatus.Sold,
  },
  {
    name: 'Max',
    photoUrls: [],
    category: { id: 2, name: 'Dogs' },
    tags: [{ id: 3, name: 'playful' }],
    status: PetStatus.Available,
  },
  {
    name: 'Coco',
    photoUrls: [],
    category: { id: 3, name: 'Birds' },
    tags: [{ id: 2, name: 'quiet' }],
    status: PetStatus.Pending,
  },
  {
    name: 'Pip',
    photoUrls: [],
    category: { id: 4, name: 'Rabbits' },
    tags: [],
    status: PetStatus.Sold,
  },
];

// petIndex refers to the position in seedPets, not a pre-existing database ID.
export const seedOrders = [
  {
    petIndex: 0,
    quantity: 1,
    shipDate: '2026-01-10T12:00:00Z',
    status: OrderStatus.Placed,
    complete: false,
  },
  {
    petIndex: 1,
    quantity: 2,
    shipDate: '2026-01-11T12:00:00Z',
    status: OrderStatus.Approved,
    complete: false,
  },
  {
    petIndex: 2,
    quantity: 1,
    shipDate: '2026-01-12T12:00:00Z',
    status: OrderStatus.Delivered,
    complete: true,
  },
];
