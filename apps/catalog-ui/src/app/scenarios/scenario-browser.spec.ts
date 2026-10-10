import axe from 'axe-core';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import referenceCatalog from '../../../../petstore-api/docs/catalog.json';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { example, synthetic } from './catalog.fixtures';
import { parseCatalog, type Scenario } from '@response-capture/contracts/scenarios';

@Component({
  template: '<p>Test destination</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestDestination {}

// No provider-domain metadata appears in these fixtures.
describe('scenario browser', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  const root = () => harness.routeNativeElement!;
  const text = () => root().textContent!;
  const inventory = {
    systems: [
      {
        name: 'provider',
        catalogs: [
          { commitHash: 'new', alias: 'main', submittedOn: '2026-10-09T12:00:00.000Z' },
          { commitHash: 'old', submittedOn: '2026-10-08T12:00:00.000Z' },
        ],
      },
    ],
  };
  function loadInventory(value = inventory) {
    for (const request of http.match('/catalog-inventory')) request.flush(value);
  }
  async function load(scenarios: Scenario[] = synthetic, path = '/catalogs/provider') {
    loadInventory();
    http.expectOne(path).flush({ catalogVersion: 1, scenarios });
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  async function click(selector: string) {
    (root().querySelector(selector) as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'test-destination', component: TestDestination }, ...routes]),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => http.verify());
  it('browses all 55 annotated reference scenarios', async () => {
    await harness.navigateByUrl('/?system=provider');
    await load(parseCatalog(referenceCatalog).scenarios);
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(55);
    expect(text()).toContain('Reject reading a pet with ID -1');
    expect(text()).toContain('Reject reading a pet with ID 1.5');
  });
  it('passes axe WCAG A/AA DOM checks for the list and selected details', async () => {
    await harness.navigateByUrl('/?system=provider');
    await load();
    const audit = () =>
      axe.run(root(), {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        rules: { 'color-contrast': { enabled: false } },
      });
    expect((await audit()).violations).toEqual([]);
    await click('[data-scenario-id="z"]');
    expect((await audit()).violations).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Selected scenario details');
    await click('app-scenario-detail button');
    expect((document.activeElement as HTMLElement).dataset['scenarioId']).toBe('z');
  });
  it('displays arbitrary catalog content', async () => {
    await harness.navigateByUrl('/?system=provider');
    expect(text()).toContain('Loading scenarios');
    await load();
    expect(TestBed.inject(Router).url).toBe('/?system=provider');
    expect(text()).toContain('Astronomy');
    expect(text()).toContain('Weather');
    expect(text()).toContain('Uncategorized');
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(4);
  });
  it('restores query filters and details, and preserves nested JSON and explicit null', async () => {
    await harness.navigateByUrl(
      '/?system=provider&category=Astronomy&group=Open%20a%20station&tag=night&status=201&scenario=z',
    );
    await load();
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(1);
    expect(root().querySelector('[aria-label="Request body"]')?.textContent).toContain('true');
    expect(root().querySelector('[aria-label="Response body"]')?.textContent?.trim()).toBe('null');
    expect(root().querySelector('app-scenario-detail')?.textContent).toContain(
      'Start observing the sky.',
    );
  });
  it('updates URL search, combines filters, clears them, and handles no matches', async () => {
    await harness.navigateByUrl('/?system=provider');
    await load();
    const search = root().querySelector('input')!;
    search.value = 'observatories sky';
    search.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(1);
    expect(TestBed.inject(Router).url).toContain('q=observatories%20sky');
    search.value = 'no such scenario';
    search.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).toContain('No matching scenarios');
    await click('.results-bar button');
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(4);
    expect(TestBed.inject(Router).url).toBe('/?system=provider');
  });
  it('clears incompatible groups when category changes', async () => {
    await harness.navigateByUrl('/?system=provider&category=Astronomy&group=Open%20a%20station');
    await load();
    const category = root().querySelector<HTMLSelectElement>('.filters select')!;
    category.value = 'Weather';
    category.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/?system=provider&category=Weather');
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(1);
  });
  it('selects, closes, and restores details through route navigation', async () => {
    await harness.navigateByUrl('/?system=provider');
    await load();
    await click('[data-scenario-id="z"]');
    expect(TestBed.inject(Router).url).toContain('scenario=z');
    await click('app-scenario-detail button');
    expect(root().querySelector('app-scenario-detail')).toBeNull();
    await harness.navigateByUrl('/?system=provider&scenario=z');
    expect(root().querySelector('app-scenario-detail')).not.toBeNull();
  });
  it('removes stale URL state and discovers new metadata after refresh', async () => {
    await harness.navigateByUrl(
      '/?system=provider&category=Astronomy&tag=night&status=201&scenario=z',
    );
    await load();
    await click('[data-refresh]');
    await load([
      example('fresh', {
        title: 'Dispatch package',
        category: 'Shipping',
        group: 'Dispatch',
        tags: ['express'],
        response: { status: 202, body: {} },
      }),
    ]);
    expect(TestBed.inject(Router).url).toBe('/?system=provider');
    expect(text()).toContain('Shipping');
    expect(text()).toContain('express');
    expect(text()).not.toContain('Astronomy');
    expect(root().querySelector('app-scenario-detail')).toBeNull();
  });
  it('ignores invalid query values and hides unavailable metadata filters for legacy records', async () => {
    await harness.navigateByUrl(
      '/?system=provider&category=missing&group=missing&tag=missing&status=999&scenario=missing',
    );
    await load([example('legacy')]);
    expect(TestBed.inject(Router).url).toBe('/?system=provider');
    expect(root().querySelectorAll('.filters select')).toHaveLength(1);
    expect(text()).toContain('legacy');
    expect(text()).toContain('Uncategorized');
  });
  it('escapes catalog content rather than rendering markup', async () => {
    await harness.navigateByUrl('/?system=provider');
    await load([
      example('unsafe', {
        title: '<script>alert(1)</script>',
        response: { status: 200, body: '<img src=x onerror=alert(1)>' },
      }),
    ]);
    await click('[data-scenario-id="unsafe"]');
    expect(root().querySelector('script, img')).toBeNull();
    expect(text()).toContain('<img src=x onerror=alert(1)>');
  });
  it.each([
    [404, 'The catalog isn’t available yet'],
    [500, 'We couldn’t load the catalog'],
  ])('handles HTTP %s and retries', async (status, message) => {
    await harness.navigateByUrl('/?system=provider');
    loadInventory();
    http
      .expectOne('/catalogs/provider')
      .flush({}, { status: status as number, statusText: 'Error' });
    harness.detectChanges();
    expect(text()).toContain(message);
    await click('.primary');
    await load();
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(4);
  });
  it('handles invalid catalogs and an empty catalog after retry', async () => {
    await harness.navigateByUrl('/?system=provider');
    loadInventory();
    http.expectOne('/catalogs/provider').flush({ catalogVersion: 2, scenarios: [] });
    harness.detectChanges();
    expect(text()).toContain('This catalog can’t be displayed');
    await click('.primary');
    await load([]);
    expect(text()).toContain('No scenarios yet');
  });
  async function choose(selector: string, value: string) {
    harness.detectChanges();
    const select = root().querySelector<HTMLSelectElement>(selector)!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it('defaults to the first inventory system and lists commits with their metadata', async () => {
    await harness.navigateByUrl('/');
    loadInventory({
      systems: [{ name: 'alpha', catalogs: inventory.systems[0].catalogs }, ...inventory.systems],
    });
    await load(synthetic, '/catalogs/alpha');
    expect(TestBed.inject(Router).url).toBe('/?system=alpha');
    expect(root().querySelector<HTMLSelectElement>('[data-system]')!.value).toBe('alpha');
    const version = root().querySelector<HTMLSelectElement>('[data-version]')!;
    expect([...version.options].map((option) => option.value)).toEqual(['', 'new', 'old']);
    expect(version.textContent).toContain('main');
    expect(version.textContent).toContain('2026');
    expect(version.value).toBe('');
  });

  it('restores a commit and scenario state from the URL', async () => {
    await harness.navigateByUrl('/?system=provider&commit=old&tag=night&scenario=z');
    await load(synthetic, '/catalogs/provider/old');
    expect(root().querySelector<HTMLSelectElement>('[data-version]')!.value).toBe('old');
    expect(root().querySelector('app-scenario-detail')).not.toBeNull();
    expect(TestBed.inject(Router).url).toContain('commit=old');
  });

  it('clears scenario state on version change and restores it through history navigation', async () => {
    TestBed.inject(Router).setUpLocationChangeListener();
    await harness.navigateByUrl('/?system=provider&tag=night&scenario=z');
    await load();
    await choose('[data-version]', 'old');
    expect(root().querySelector('app-scenario-detail')).toBeNull();
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(0);
    await load(synthetic, '/catalogs/provider/old');
    expect(TestBed.inject(Router).url).toBe('/?system=provider&commit=old');
    TestBed.inject(Location).back();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.fixture.whenStable();
    await load();
    expect(root().querySelector('app-scenario-detail')).not.toBeNull();
    expect(TestBed.inject(Router).url).toContain('tag=night');
    TestBed.inject(Location).forward();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.fixture.whenStable();
    await load(synthetic, '/catalogs/provider/old');
    expect(root().querySelector('app-scenario-detail')).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/?system=provider&commit=old');
  });

  it('resets version on system change and cancels superseded catalog requests', async () => {
    await harness.navigateByUrl('/?system=provider&commit=old');
    loadInventory({
      systems: [{ name: 'alpha', catalogs: inventory.systems[0].catalogs }, ...inventory.systems],
    });
    const initial = http.expectOne('/catalogs/provider/old');
    await choose('[data-system]', 'alpha');
    expect(initial.cancelled).toBe(true);
    const alpha = http.expectOne('/catalogs/alpha');
    await choose('[data-system]', 'provider');
    expect(alpha.cancelled).toBe(true);
    await load();
    expect(TestBed.inject(Router).url).toBe('/?system=provider');
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(4);
  });

  it('normalizes unknown systems and commits to available defaults', async () => {
    await harness.navigateByUrl('/?system=unknown&commit=missing');
    await load();
    expect(TestBed.inject(Router).url).toBe('/?system=provider');
    await harness.navigateByUrl('/?system=provider&commit=missing');
    await load();
    expect(TestBed.inject(Router).url).toBe('/?system=provider');
  });

  it('preserves selected commits on refresh and falls back when they disappear', async () => {
    await harness.navigateByUrl('/?system=provider&commit=old');
    await load(synthetic, '/catalogs/provider/old');
    await click('[data-refresh]');
    await load(synthetic, '/catalogs/provider/old');
    expect(TestBed.inject(Router).url).toContain('commit=old');
    await click('[data-refresh]');
    loadInventory({
      systems: [{ name: 'provider', catalogs: [inventory.systems[0].catalogs[0]] }],
    });
    await load();
    expect(TestBed.inject(Router).url).toBe('/?system=provider');
    await click('[data-refresh]');
    loadInventory({ systems: [{ name: 'replacement', catalogs: [] }] });
    await load(synthetic, '/catalogs/replacement');
    expect(TestBed.inject(Router).url).toBe('/?system=replacement');
  });

  it('encodes system and commit path segments', async () => {
    await harness.navigateByUrl('/?system=space%20%2F%20name&commit=branch%2Fhash');
    loadInventory({
      systems: [
        {
          name: 'space / name',
          catalogs: [{ commitHash: 'branch/hash', submittedOn: '2026-10-09T12:00:00.000Z' }],
        },
      ],
    });
    await load(synthetic, '/catalogs/space%20%2F%20name/branch%2Fhash');
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(4);
  });

  it('shows an empty inventory and retries after catalog submission', async () => {
    await harness.navigateByUrl('/');
    loadInventory({ systems: [] });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).toContain('No catalogs yet');
    expect(root().querySelector('[data-system]')).toBeNull();
    http.expectNone((request) => request.url.startsWith('/catalogs/'));
    expect(
      (
        await axe.run(root(), {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          rules: { 'color-contrast': { enabled: false } },
        })
      ).violations,
    ).toEqual([]);
    await click('.primary');
    await load();
    expect(text()).toContain('Astronomy');
  });

  it('shows inventory failures separately and retries', async () => {
    await harness.navigateByUrl('/');
    http.expectOne('/catalog-inventory').flush({}, { status: 500, statusText: 'Error' });
    harness.detectChanges();
    expect(text()).toContain('We couldn’t load the catalog inventory');
    await click('.primary');
    await load();
    expect(text()).toContain('Astronomy');
  });

  it('allows another version to be selected after a catalog failure', async () => {
    await harness.navigateByUrl('/?system=provider');
    loadInventory();
    http.expectOne('/catalogs/provider').flush({}, { status: 404, statusText: 'Missing' });
    harness.detectChanges();
    expect(text()).toContain('The catalog isn’t available yet');
    expect(root().querySelector<HTMLSelectElement>('[data-version]')!.disabled).toBe(false);
    await choose('[data-version]', 'old');
    await load(synthetic, '/catalogs/provider/old');
    expect(text()).toContain('Astronomy');
  });

  it('uses current URL selection when navigation happens during inventory refresh', async () => {
    await harness.navigateByUrl('/?system=provider');
    await load();
    await click('[data-refresh]');
    await harness.navigateByUrl('/?system=provider&commit=old');
    await load(synthetic, '/catalogs/provider/old');
    expect(TestBed.inject(Router).url).toContain('commit=old');
    expect(text()).toContain('Astronomy');
  });

  it('cancels inventory and payload requests when leaving the library', async () => {
    await harness.navigateByUrl('/?system=provider');
    const pending = http.expectOne('/catalog-inventory');
    await harness.navigateByUrl('/test-destination');
    expect(pending.cancelled).toBe(true);
    await harness.navigateByUrl('/?system=provider');
    loadInventory();
    const catalog = http.expectOne('/catalogs/provider');
    await harness.navigateByUrl('/test-destination');
    expect(catalog.cancelled).toBe(true);
  });
});
