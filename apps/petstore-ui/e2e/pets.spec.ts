import type { Inventory, Pet, PetInput } from '@response-capture/contracts/petstore';
import { test, expect, catalogSelectionFromEnv } from './support/fixtures';
import { expectAccessible } from './support/accessibility';

test(
  'browse pets and inventory from catalog examples',
  {
    catalogs: { pets: { systemName: 'petstore-api', selection: catalogSelectionFromEnv() } },
    scenarios: {
      list: { catalog: 'pets', id: 'pet.list.success' },
      inventory: { catalog: 'pets', id: 'store.inventory.with-order' },
    },
  },
  async ({ page, scenarios }) => {
    const pets = scenarios.list.response.body as unknown as Pet[];
    const inventory = scenarios.inventory.response.body as unknown as Inventory;
    await page.goto('/pets');
    for (const pet of pets) {
      await expect(
        page.getByRole('link').filter({
          has: page.getByRole('heading', { name: pet.name, exact: true }),
        }),
      ).toBeVisible();
    }
    const counts = page.getByRole('region', { name: 'Pet inventory' });
    for (const status of ['available', 'pending', 'sold'] as const) {
      const label = status[0].toUpperCase() + status.slice(1);
      await expect(
        counts.getByText(`${inventory[status]} ${label}`, { exact: true }),
      ).toBeVisible();
    }
    await expectAccessible(page);
  },
);

test(
  'empty inventory offers an explicit demo reset with accessible confirmation',
  {
    catalogs: { pets: { systemName: 'petstore-api', selection: catalogSelectionFromEnv() } },
    scenarios: {
      list: { catalog: 'pets', id: 'pet.list.empty' },
      inventory: { catalog: 'pets', id: 'store.inventory.empty' },
    },
  },
  async ({ page }) => {
    await page.goto('/pets');
    await expect(page.getByRole('heading', { name: 'No pets yet' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Pet inventory' })).toContainText('0 Available');
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Load demo data' }).click();
    const confirmation = page.getByRole('region', { name: 'Confirm action' });
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectAccessible(page);
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Load demo data' })).toBeFocused();
  },
);

test(
  'create a pet using the recorded input and display its saved details',
  {
    catalogs: { pets: { systemName: 'petstore-api', selection: catalogSelectionFromEnv() } },
    scenarios: {
      create: { catalog: 'pets', id: 'pet.create.success' },
      detail: { catalog: 'pets', id: 'pet.read.after-order-deletion' },
    },
  },
  async ({ page, scenarios: { create, detail } }) => {
    const input = create.request.body as unknown as PetInput;
    const saved = create.response.body as unknown as Pet;
    // Recordings come from independent provider tests: choose a coherent follow-up exchange.
    expect(detail.response.body).toEqual(create.response.body);
    await page.goto('/pets/new');
    await page.getByLabel('Name', { exact: true }).fill(input.name);
    await page.getByLabel('Photo URLs (optional)').fill(input.photoUrls.join('\n'));
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Save pet' }).click();
    await expect(page).toHaveURL(`/pets/${saved.id}`);
    await expect(page.getByRole('status')).toHaveText('Pet saved.');
    await expect(page.getByRole('heading', { name: saved.name, exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: `${saved.name}: photo unavailable` })).toBeVisible();
    create.assertUsed();
    detail.assertUsed();
    expect(create.calls()[0]?.body).toMatchObject({
      name: input.name,
      photoUrls: input.photoUrls,
    });
    await expectAccessible(page);
  },
);

test(
  'require a name without sending a create request',
  {
    catalogs: { pets: { systemName: 'petstore-api', selection: catalogSelectionFromEnv() } },
    scenarios: {},
  },
  async ({ page, mocks }) => {
    await page.goto('/pets/new');
    await page.getByRole('button', { name: 'Save pet' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL('/pets/new');
    expect(mocks.requests()).toEqual([]);
    await expectAccessible(page);
  },
);

test(
  'show the recorded missing-pet error',
  {
    catalogs: { pets: { systemName: 'petstore-api', selection: catalogSelectionFromEnv() } },
    scenarios: { missing: { catalog: 'pets', id: 'pet.read.missing' } },
  },
  async ({ page, scenarios: { missing } }) => {
    await page.goto(`/pets/${missing.request.path.split('/').at(-1)}`);
    await expect(page.getByRole('alert')).toHaveText(
      'This record could not be found. It may have been deleted.',
    );
    await expectAccessible(page);
  },
);

test(
  'delete a pet and explicitly switch to the empty list recordings',
  {
    catalogs: { pets: { systemName: 'petstore-api', selection: catalogSelectionFromEnv() } },
    scenarios: { detail: { catalog: 'pets', id: 'pet.read.after-order-deletion' } },
  },
  async ({ page, scenarios: { detail }, mocks }) => {
    const pet = detail.response.body as unknown as Pet;
    await page.goto(`/pets/${pet.id}`);
    await expect(page.getByRole('heading', { name: pet.name, exact: true })).toBeVisible();
    const { remove } = mocks.replaceScenarios({
      remove: { catalog: 'pets', id: 'pet.delete.success' },
      list: { catalog: 'pets', id: 'pet.list.empty' },
      inventory: { catalog: 'pets', id: 'store.inventory.empty' },
    });
    await page.getByRole('button', { name: 'Delete pet' }).click();
    const confirmation = page.getByRole('region', { name: 'Confirm action' });
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectAccessible(page);
    await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page).toHaveURL('/pets');
    await expect(page.getByRole('status').filter({ hasText: 'Pet deleted.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No pets yet' })).toBeVisible();
    remove.assertUsed();
    await expectAccessible(page);
  },
);

test(
  'explain the recorded conflict when a pet has referencing orders',
  {
    catalogs: { pets: { systemName: 'petstore-api', selection: catalogSelectionFromEnv() } },
    scenarios: {
      detail: { catalog: 'pets', id: 'pet.read.after-order-deletion' },
      remove: { catalog: 'pets', id: 'pet.delete.referenced-by-order' },
    },
  },
  async ({ page, scenarios: { detail } }) => {
    const pet = detail.response.body as unknown as Pet;
    await page.goto(`/pets/${pet.id}`);
    await page.getByRole('button', { name: 'Delete pet' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'This pet has an order. Delete its referencing orders before deleting the pet.',
    );
    await expect(page).toHaveURL(`/pets/${pet.id}`);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Delete pet' })).toBeFocused();
    await expectAccessible(page);
  },
);
