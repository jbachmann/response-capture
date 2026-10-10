import type { NamedEntity, Pet, PetInput, PetStatus } from './models';

export interface PetFormValue {
  name: string;
  status: PetStatus;
  category: string;
  categoryId: number | null;
  tags: { id: number | null; name: string }[];
  photos: string;
}

export function petPayload(value: PetFormValue, original: Pet | null = null): PetInput {
  const categoryName = value.category.trim();
  const category: NamedEntity = {};
  // Clearing a named category removes its ID too; ID-only categories survive untouched edits.
  if (value.categoryId !== null && (categoryName || !original?.category?.name)) {
    category.id = value.categoryId;
  }
  if (categoryName) category.name = categoryName;

  let photoUrls: string[];
  if (original && value.photos === original.photoUrls.join('\n')) {
    photoUrls = [...original.photoUrls];
  } else {
    photoUrls = value.photos
      .split('\n')
      .map((photo) => photo.trim())
      .filter(Boolean);
  }

  const payload: PetInput = {
    name: value.name.trim(),
    status: value.status,
    photoUrls,
    tags: value.tags.map((tag) => {
      const entity: NamedEntity = {};
      if (tag.id !== null) entity.id = tag.id;
      if (tag.name.trim()) entity.name = tag.name.trim();
      return entity;
    }),
  };
  if (Object.keys(category).length) payload.category = category;
  return payload;
}
