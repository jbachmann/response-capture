import type { Inventory, Pet, PetInput } from '@response-capture/contracts/petstore';
import { test, expect } from './support/fixtures';
import { expectAccessible } from './support/accessibility';

test('browse pets and inventory from catalog examples', async ({ page, catalog, scenarios }) => {
  const pets = catalog.get('pet.list.success').response.body as unknown as Pet[];
  const inventory = catalog.get('store.inventory.with-order').response.body as unknown as Inventory;
  scenarios.use('pet.list.success', 'store.inventory.with-order');
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
    await expect(counts.getByText(`${inventory[status]} ${label}`, { exact: true })).toBeVisible();
  }
  await expectAccessible(page);
});

test('empty inventory offers an explicit demo reset with accessible confirmation', async ({
  page,
  scenarios,
}) => {
  scenarios.use('pet.list.empty', 'store.inventory.empty');
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
});

test('create a pet using the recorded input and display its saved details', async ({
  page,
  catalog,
  scenarios,
}) => {
  const create = catalog.get('pet.create.success');
  const input = create.request.body as unknown as PetInput;
  const saved = create.response.body as unknown as Pet;
  const detail = catalog.get('pet.read.after-order-deletion');
  // Recordings come from independent provider tests: choose a coherent follow-up exchange.
  expect(detail.response.body).toEqual(create.response.body);
  scenarios.use(create.id, detail.id);
  await page.goto('/pets/new');
  await page.getByLabel('Name', { exact: true }).fill(input.name);
  await page.getByLabel('Photo URLs (optional)').fill(input.photoUrls.join('\n'));
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page).toHaveURL(`/pets/${saved.id}`);
  await expect(page.getByRole('status')).toHaveText('Pet saved.');
  await expect(page.getByRole('heading', { name: saved.name, exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: `${saved.name}: photo unavailable` })).toBeVisible();
  scenarios.assertUsed(create.id, detail.id);
  expect(scenarios.calls(create.id)[0]?.body).toMatchObject({
    name: input.name,
    photoUrls: input.photoUrls,
  });
  await expectAccessible(page);
});

test('require a name without sending a create request', async ({ page, catalog, scenarios }) => {
  const create = catalog.get('pet.create.success');
  await page.goto('/pets/new');
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL('/pets/new');
  expect(scenarios.calls(create.id)).toEqual([]);
  await expectAccessible(page);
});

test('show the recorded missing-pet error', async ({ page, catalog, scenarios }) => {
  const missing = catalog.get('pet.read.missing');
  scenarios.use(missing.id);
  await page.goto(`/pets/${missing.request.path.split('/').at(-1)}`);
  await expect(page.getByRole('alert')).toHaveText(
    'This record could not be found. It may have been deleted.',
  );
  await expectAccessible(page);
});

test('delete a pet and explicitly switch to the empty list recordings', async ({
  page,
  catalog,
  scenarios,
}) => {
  const detail = catalog.get('pet.read.after-order-deletion');
  const pet = detail.response.body as unknown as Pet;
  scenarios.use(detail.id);
  await page.goto(`/pets/${pet.id}`);
  await expect(page.getByRole('heading', { name: pet.name, exact: true })).toBeVisible();
  scenarios.use('pet.delete.success', 'pet.list.empty', 'store.inventory.empty');
  await page.getByRole('button', { name: 'Delete pet' }).click();
  const confirmation = page.getByRole('region', { name: 'Confirm action' });
  await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectAccessible(page);
  await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page).toHaveURL('/pets');
  await expect(page.getByRole('status').filter({ hasText: 'Pet deleted.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No pets yet' })).toBeVisible();
  await expectAccessible(page);
});

test('explain the recorded conflict when a pet has referencing orders', async ({
  page,
  catalog,
  scenarios,
}) => {
  const detail = catalog.get('pet.read.after-order-deletion');
  const pet = detail.response.body as unknown as Pet;
  scenarios.use(detail.id, 'pet.delete.referenced-by-order');
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
});
