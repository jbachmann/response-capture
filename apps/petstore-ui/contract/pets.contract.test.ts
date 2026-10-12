import { describe, it } from 'vitest';
import { z } from 'zod';
import { assertScenarioContract } from '@response-capture/scenario-contract';
import { getContractCatalog } from '@response-capture/scenario-contract/vitest';
import * as schemas from './schemas';

describe('List pets', () => {
  it('returns an empty pet list', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.list.empty', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: z.literal('/pet'),
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: z.array(schemas.pet).length(0),
      }),
    });
  });
  it('returns a populated pet list', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.list.success', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: z.literal('/pet'),
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: z.array(schemas.pet).min(1),
      }),
    });
  });
});

describe('Filter pets', () => {
  it('filters pets by one status', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.filter.by-status.success', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: z.literal('/pet/findByStatus'),
        query: schemas.statusQuery,
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: z.array(schemas.pet).min(1),
      }),
    });
  });
  it('filters pets by one tag', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.filter.by-tags.success', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: z.literal('/pet/findByTags'),
        query: schemas.tagQuery,
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: z.array(schemas.pet).min(1),
      }),
    });
  });
});

describe('Read pet', () => {
  it('reads a basic pet', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.read.after-order-deletion', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: schemas.petPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.pet,
      }),
    });
  });
  it('reads a pet with category and tags', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.read.success', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: schemas.petPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.nestedPet,
      }),
    });
  });
  it('reads a persisted nested pet', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.read.persisted', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: schemas.petPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.nestedPet,
      }),
    });
  });
  it('reports a missing pet', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.read.missing', {
      request: z.looseObject({
        method: z.literal('GET'),
        path: schemas.petPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(404),
      }),
    });
  });
});

describe('Create pet', () => {
  it('creates a pet using defaulted input', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.create.success', {
      request: z.looseObject({
        method: z.literal('POST'),
        path: z.literal('/pet'),
        query: z.undefined(),
        body: schemas.defaultPetRequest,
      }),
      response: z.looseObject({
        status: z.literal(201),
        body: schemas.pet,
      }),
    });
  });
  it('creates a fully populated pet', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.create.with-category-and-tags', {
      request: z.looseObject({
        method: z.literal('POST'),
        path: z.literal('/pet'),
        query: z.undefined(),
        body: schemas.completePetRequest,
      }),
      response: z.looseObject({
        status: z.literal(201),
        body: schemas.nestedPet,
      }),
    });
  });
  it('rejects invalid pet input', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.create.invalid', {
      request: z.looseObject({
        method: z.literal('POST'),
        path: z.literal('/pet'),
        query: z.undefined(),
        body: z.unknown(),
      }),
      response: z.looseObject({
        status: z.literal(400),
      }),
    });
  });
});

describe('Replace pet', () => {
  it('replaces a pet using defaulted input', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.replace.resets-defaults', {
      request: z.looseObject({
        method: z.literal('PUT'),
        path: z.literal('/pet'),
        query: z.undefined(),
        body: schemas.defaultReplacement,
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.pet,
      }),
    });
  });
  it('replaces a fully populated pet', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.replace.complete', {
      request: z.looseObject({
        method: z.literal('PUT'),
        path: z.literal('/pet'),
        query: z.undefined(),
        body: schemas.completeReplacement,
      }),
      response: z.looseObject({
        status: z.literal(200),
        body: schemas.nestedPet,
      }),
    });
  });
  it('reports a missing pet during replacement', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.replace.missing', {
      request: z.looseObject({
        method: z.literal('PUT'),
        path: z.literal('/pet'),
        query: z.undefined(),
        body: schemas.defaultReplacement,
      }),
      response: z.looseObject({
        status: z.literal(404),
      }),
    });
  });
});

describe('Delete pet', () => {
  it('deletes a pet without a response body', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.delete.success', {
      request: z.looseObject({
        method: z.literal('DELETE'),
        path: schemas.petPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(204),
        body: z.null(),
      }),
    });
  });
  it('reports a missing pet during deletion', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.delete.missing', {
      request: z.looseObject({
        method: z.literal('DELETE'),
        path: schemas.petPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(404),
      }),
    });
  });
  it('rejects deletion of a referenced pet', () => {
    assertScenarioContract(getContractCatalog('pets'), 'pet.delete.referenced-by-order', {
      request: z.looseObject({
        method: z.literal('DELETE'),
        path: schemas.petPath,
        query: z.undefined(),
        body: z.null(),
      }),
      response: z.looseObject({
        status: z.literal(409),
      }),
    });
  });
});
