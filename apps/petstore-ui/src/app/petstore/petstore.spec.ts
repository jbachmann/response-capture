import axe from 'axe-core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { Pet, Order, validId } from './models';
import { PetstoreApiService } from './petstore-api.service';

const pet: Pet = {
  id: 1,
  name: 'Milo',
  status: 'available',
  photoUrls: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
  category: { id: 5, name: 'Cats' },
  tags: [{ id: 7, name: 'cute' }, { id: 8 }],
};
const order: Order = { id: 3, petId: 1, quantity: 2, status: 'placed', complete: false };
describe('petstore', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  const root = () => harness.routeNativeElement!;
  const text = () => root().textContent!;
  async function settle() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  async function click(label: string) {
    const button = Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === label && !b.disabled,
    );
    expect(button).toBeDefined();
    button!.click();
    await settle();
  }
  function input(selector: string, value: string) {
    const el = root().querySelector<HTMLInputElement>(selector)!;
    el.value = value;
    el.dispatchEvent(new Event('input'));
    harness.detectChanges();
  }
  function flushList(pets: Pet[] = [pet]) {
    http.expectOne('/pet').flush(pets);
    http.expectOne('/store/inventory').flush({ available: pets.length, pending: 0, sold: 0 });
    harness.detectChanges();
  }
  async function audit() {
    expect(
      (
        await axe.run(root(), {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          rules: { 'color-contrast': { enabled: false } },
        })
      ).violations,
    ).toEqual([]);
  }
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => http.verify());
  it('lands on pets, renders inventory and safely searches names', async () => {
    await harness.navigateByUrl('/');
    flushList();
    expect(TestBed.inject(Router).url).toBe('/pets');
    expect(text()).toContain('Milo');
    input('input[type=search]', 'absent');
    expect(text()).toContain('No matching pets');
    expect(text()).not.toContain('Load demo data');
    await audit();
  });
  it('opens pet details from the photo card and exposes ordering', async () => {
    await harness.navigateByUrl('/pets');
    flushList();
    const card = root().querySelector<HTMLAnchorElement>('.pet-card')!;
    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toBe('/pets/1');
    await audit();
    card.querySelector<HTMLElement>('app-pet-photo')!.click();
    await settle();
    http.expectOne('/pet/1').flush(pet);
    await settle();
    expect(TestBed.inject(Router).url).toBe('/pets/1');
    await click('Place order');
    expect(root().querySelector('app-order-form')).not.toBeNull();
  });
  it('intersects server status/tag results and cancels obsolete requests', async () => {
    await harness.navigateByUrl('/pets');
    flushList();
    input('input[formcontrolname=tag]', 'cute');
    await click('Apply filters');
    const old = http.expectOne('/pet/findByTags?tags=cute');
    const oldInventory = http.expectOne('/store/inventory');
    const select = root().querySelector('select')!;
    select.value = 'available';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(old.cancelled).toBe(true);
    expect(oldInventory.cancelled).toBe(true);
    http.expectOne('/pet/findByStatus?status=available').flush([pet, { ...pet, id: 2 }]);
    http.expectOne('/pet/findByTags?tags=cute').flush([pet]);
    http.expectOne('/store/inventory').flush({ available: 2, pending: 0, sold: 0 });
    await settle();
    expect(root().querySelectorAll('.pet-card')).toHaveLength(1);
  });
  it('seeds only after empty inventory and confirmation, then refreshes', async () => {
    await harness.navigateByUrl('/pets');
    expect(text()).not.toContain('Load demo data');
    flushList([]);
    await click('Load demo data');
    http.expectNone('/training/seed');
    await audit();
    await click('Cancel');
    http.expectNone('/training/seed');
    await click('Load demo data');
    await click('Confirm');
    const req = http.expectOne('/training/seed');
    expect(req.request.method).toBe('POST');
    req.flush({ pets: 6, orders: 3, inventory: { available: 2, pending: 2, sold: 2 } });
    await settle();
    flushList();
    expect(text()).toContain('Demo data loaded');
  });
  it('recovers from list errors without seeding', async () => {
    await harness.navigateByUrl('/pets');
    http.expectOne('/pet').flush({}, { status: 500, statusText: 'Error' });
    http.expectOne('/store/inventory');
    await settle();
    expect(text()).toContain('Check your connection');
    expect(text()).not.toContain('Load demo data');
    await click('Try again');
    flushList();
    expect(text()).toContain('Milo');
  });
  it('validates create, preserves input after failure, and prevents duplicate submissions', async () => {
    await harness.navigateByUrl('/pets/new');
    await click('Save pet');
    http.expectNone('/pet');
    input('input[formcontrolname=name]', '  Milo  ');
    await audit();
    await click('Save pet');
    const req = http.expectOne('/pet');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Milo',
      status: 'available',
      photoUrls: [],
      tags: [],
    });
    expect(root().querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    req.flush({}, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(root().querySelector<HTMLInputElement>('input[formcontrolname=name]')!.value).toBe(
      '  Milo  ',
    );
    expect(text()).toContain('Check your entries');
  });
  it('sends complete replacement data preserving IDs and every photo', async () => {
    await harness.navigateByUrl('/pets/1/edit');
    http.expectOne('/pet/1').flush(pet);
    await settle();
    input('input[formcontrolname=name]', 'Luna');
    await click('Save pet');
    const req = http.expectOne('/pet');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ...pet, name: 'Luna' });
    req.flush(pet);
    await settle();
    http.expectOne('/pet/1').flush(pet);
    await settle();
    expect(TestBed.inject(Router).url).toBe('/pets/1');
  });
  it('confirms pet deletion and explains referencing orders', async () => {
    await harness.navigateByUrl('/pets/1');
    http.expectOne('/pet/1').flush(pet);
    await settle();
    await click('Delete pet');
    http.expectNone('/pet/1');
    await audit();
    await click('Confirm');
    const req = http.expectOne('/pet/1');
    expect(req.request.method).toBe('DELETE');
    req.flush({}, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(text()).toContain('Delete its referencing orders');
    await click('Cancel');
  });
  it('blocks orders for pending pets', async () => {
    await harness.navigateByUrl('/pets/1');
    http.expectOne('/pet/1').flush({ ...pet, status: 'pending' });
    await settle();
    expect(
      Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === 'Place order',
      )!.disabled,
    ).toBe(true);
    http.expectNone('/store/order');
  });
  it('rechecks availability before creating an order and uses provider defaults', async () => {
    await harness.navigateByUrl('/pets/1');
    http.expectOne('/pet/1').flush(pet);
    await settle();
    await click('Place order');
    await audit();
    input('input[formcontrolname=quantity]', '2');
    input('input[formcontrolname=shipDate]', '2026-10-10T12:00');
    await click('Place order');
    http.expectNone('/store/order');
    http.expectOne('/pet/1').flush(pet);
    const req = http.expectOne('/store/order');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      petId: 1,
      quantity: 2,
      shipDate: new Date('2026-10-10T12:00').toISOString(),
    });
    req.flush(order);
    await settle();
    http.expectOne('/store/order/3').flush(order);
    await settle();
    expect(text()).toContain('Order #3');
    await audit();
  });
  it('preserves order form when availability changes', async () => {
    await harness.navigateByUrl('/pets/1');
    http.expectOne('/pet/1').flush(pet);
    await settle();
    await click('Place order');
    input('input[formcontrolname=quantity]', '4');
    await click('Place order');
    http.expectOne('/pet/1').flush({ ...pet, status: 'sold' });
    await settle();
    http.expectNone('/store/order');
    expect(text()).toContain('no longer available');
    expect(root().querySelector<HTMLInputElement>('input[formcontrolname=quantity]')!.value).toBe(
      '4',
    );
  });
  it('lists submitted orders and opens their details', async () => {
    await harness.navigateByUrl('/orders');
    expect(text()).toContain('Loading orders');
    http
      .expectOne('/store/order')
      .flush([
        order,
        { ...order, id: 2, status: 'delivered', complete: true, shipDate: '2026-10-10T12:00:00Z' },
      ]);
    await settle();
    expect(root().querySelectorAll('tbody tr')).toHaveLength(2);
    expect(text()).toContain('Not specified');
    expect(text()).toContain('delivered');
    await audit();
    root().querySelector<HTMLAnchorElement>('a[href="/orders/3"]')!.click();
    await settle();
    http.expectOne('/store/order/3').flush(order);
    await settle();
    expect(TestBed.inject(Router).url).toBe('/orders/3');
    await click('Delete order');
    await click('Confirm');
    http.expectOne('/store/order/3').flush(null);
    await settle();
    root().querySelector<HTMLAnchorElement>('a[href="/orders"]')!.click();
    await settle();
    http.expectOne('/store/order').flush([]);
    await settle();
    expect(text()).toContain('No orders yet');
  });
  it('handles empty orders, list errors, retries, and refreshed submissions', async () => {
    await harness.navigateByUrl('/orders');
    http.expectOne('/store/order').flush([]);
    await settle();
    expect(text()).toContain('No orders yet');
    await audit();
    await click('Refresh orders');
    http.expectOne('/store/order').flush({}, { status: 500, statusText: 'Error' });
    await settle();
    expect(text()).toContain('Check your connection');
    await click('Try again');
    http.expectOne('/store/order').flush([order]);
    await settle();
    expect(text()).toContain('Order #3');
    await click('Refresh orders');
    http.expectOne('/store/order').flush([{ ...order, id: 4 }, order]);
    await settle();
    expect(root().querySelectorAll('tbody tr')).toHaveLength(2);
  });
  it('validates order IDs, looks up orders, and confirms deletion', async () => {
    await harness.navigateByUrl('/orders');
    http.expectOne('/store/order').flush([]);
    await settle();
    input('input', '1.5');
    await click('Find order');
    expect(TestBed.inject(Router).url).toBe('/orders');
    await audit();
    input('input', '3');
    await click('Find order');
    http.expectOne('/store/order/3').flush(order);
    await settle();
    await click('Delete order');
    http.expectNone('/store/order/3');
    await audit();
    await click('Confirm');
    const req = http.expectOne('/store/order/3');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await settle();
    expect(text()).toContain('Order deleted');
  });
  it('handles missing records and invalid route IDs without requests', async () => {
    await harness.navigateByUrl('/pets/invalid');
    expect(text()).toContain('Invalid pet ID');
    await harness.navigateByUrl('/orders/3');
    http.expectOne('/store/order/3').flush({}, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(text()).toContain('could not be found');
  });
  it('submits an order ID restored by the browser without an input event', async () => {
    await harness.navigateByUrl('/orders');
    http.expectOne('/store/order').flush([]);
    await settle();
    root().querySelector<HTMLInputElement>('input')!.value = '3';
    await click('Find order');
    http.expectOne('/store/order/3').flush(order);
    await settle();
    expect(text()).toContain('Order #3');
  });
  it('rejects fractional quantities and preserves shipping date after a failed order', async () => {
    await harness.navigateByUrl('/pets/1');
    http.expectOne('/pet/1').flush(pet);
    await settle();
    await click('Place order');
    input('input[formcontrolname=quantity]', '1.5');
    root()
      .querySelector('app-order-form form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectNone('/pet/1');
    http.expectNone('/store/order');
    input('input[formcontrolname=quantity]', '2');
    input('input[formcontrolname=shipDate]', '2026-10-10T12:00');
    await click('Place order');
    http.expectOne('/pet/1').flush(pet);
    http.expectOne('/store/order').flush({}, { status: 500, statusText: 'Error' });
    await settle();
    expect(root().querySelector<HTMLInputElement>('input[formcontrolname=shipDate]')!.value).toBe(
      '2026-10-10T12:00',
    );
    expect(text()).toContain('Check your connection');
  });
  it.each([
    ['/pets/1', '/pets/2', '/pet/1', '/pet/2', { ...pet, id: 2 }, 'Milo'],
    ['/orders/3', '/orders/4', '/store/order/3', '/store/order/4', { ...order, id: 4 }, 'Order #4'],
  ] as const)(
    'cancels a pending retry when navigating from %s',
    async (initial, next, initialApi, nextApi, record, expected) => {
      await harness.navigateByUrl(initial);
      http.expectOne(initialApi).flush({}, { status: 500, statusText: 'Error' });
      await settle();
      await click('Try again');
      const retry = http.expectOne(initialApi);
      await harness.navigateByUrl(next);
      expect(retry.cancelled).toBe(true);
      http.expectOne(nextApi).flush(record);
      await settle();
      expect(text()).toContain(expected);
    },
  );

  it('shows order-specific guidance after a relationship conflict', async () => {
    await harness.navigateByUrl('/pets/1');
    http.expectOne('/pet/1').flush(pet);
    await settle();
    await click('Place order');
    await click('Place order');
    http.expectOne('/pet/1').flush(pet);
    http.expectOne('/store/order').flush({}, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(text()).toContain('changed while the order was being placed');
    expect(text()).not.toContain('Delete its referencing orders');
    expect(
      root().querySelector<HTMLInputElement>('input[formcontrolname=quantity]')!.disabled,
    ).toBe(false);
  });

  it('uses exact relative API routes for all operations', () => {
    const api = TestBed.inject(PetstoreApiService);
    api.pets().subscribe();
    api.byStatus('sold').subscribe();
    api.byTag('small & cute').subscribe();
    api.pet(1).subscribe();
    api.createPet(pet).subscribe();
    api.updatePet(pet).subscribe();
    api.deletePet(1).subscribe();
    api.inventory().subscribe();
    api.createOrder({ petId: 1, quantity: 1 }).subscribe();
    api.orders().subscribe();
    api.order(3).subscribe();
    api.deleteOrder(3).subscribe();
    api.seed().subscribe();
    const requests = http.match(() => true);
    expect(requests.map((r) => [r.request.method, r.request.urlWithParams])).toEqual([
      ['GET', '/pet'],
      ['GET', '/pet/findByStatus?status=sold'],
      ['GET', '/pet/findByTags?tags=small%20%26%20cute'],
      ['GET', '/pet/1'],
      ['POST', '/pet'],
      ['PUT', '/pet'],
      ['DELETE', '/pet/1'],
      ['GET', '/store/inventory'],
      ['POST', '/store/order'],
      ['GET', '/store/order'],
      ['GET', '/store/order/3'],
      ['DELETE', '/store/order/3'],
      ['POST', '/training/seed'],
    ]);
    requests.forEach((r) => r.flush(null));
  });
  it.each(['0', '-1', '1.2', '9007199254740992', 'abc', ''])('rejects unsafe ID %s', (value) => {
    expect(validId(value)).toBeNull();
  });
});
