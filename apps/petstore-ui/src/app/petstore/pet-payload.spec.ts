import { petPayload, PetFormValue } from './pet-payload';
import type { Pet } from './models';

const original: Pet = {
  id: 1,
  name: 'Milo',
  status: 'available',
  photoUrls: [' https://example.com/one ', ''],
  category: { id: 5, name: 'Cats' },
  tags: [{ id: 8 }],
};
const value: PetFormValue = {
  name: ' Milo ',
  status: 'available',
  photos: original.photoUrls.join('\n'),
  category: 'Cats',
  categoryId: 5,
  tags: [{ id: 8, name: '' }],
};

describe('pet payload', () => {
  it('preserves IDs and unchanged photo arrays without sharing the original array', () => {
    const payload = petPayload(value, original);
    expect(payload).toEqual({
      name: 'Milo',
      status: 'available',
      photoUrls: original.photoUrls,
      category: { id: 5, name: 'Cats' },
      tags: [{ id: 8 }],
    });
    expect(payload.photoUrls).not.toBe(original.photoUrls);
  });
  it('clears named categories and removed tags while normalizing edited photo lines', () => {
    expect(
      petPayload(
        { ...value, category: ' ', tags: [], photos: ' https://example.com/new \n\n' },
        original,
      ),
    ).toEqual({
      name: 'Milo',
      status: 'available',
      photoUrls: ['https://example.com/new'],
      tags: [],
    });
  });
  it('preserves an ID-only category on an untouched edit', () => {
    expect(
      petPayload({ ...value, category: '' }, { ...original, category: { id: 5 } }).category,
    ).toEqual({ id: 5 });
  });
});
