import axe from 'axe-core';
import referenceCatalog from '../../../../provider/docs/catalog.json';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { example, synthetic } from './catalog.fixtures';
import { parseCatalog, Scenario } from './catalog';

// No provider-domain metadata appears in these fixtures.
describe('scenario browser', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  const root = () => harness.routeNativeElement!;
  const text = () => root().textContent!;
  async function load(scenarios: Scenario[] = synthetic) {
    http.expectOne('/training/catalog').flush({ catalogVersion: 1, scenarios });
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
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => http.verify());
  it('browses all 55 annotated reference scenarios', async () => {
    await harness.navigateByUrl('/scenarios');
    await load(parseCatalog(referenceCatalog).scenarios);
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(55);
    expect(text()).toContain('Reject reading a pet with ID -1');
    expect(text()).toContain('Reject reading a pet with ID 1.5');
  });
  it('passes axe WCAG A/AA DOM checks for the list and selected details', async () => {
    await harness.navigateByUrl('/scenarios');
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
    await harness.navigateByUrl('/scenarios');
    expect(text()).toContain('Loading scenarios');
    await load();
    expect(TestBed.inject(Router).url).toBe('/scenarios');
    expect(text()).toContain('Astronomy');
    expect(text()).toContain('Weather');
    expect(text()).toContain('Uncategorized');
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(4);
  });
  it('restores query filters and details, and preserves nested JSON and explicit null', async () => {
    await harness.navigateByUrl(
      '/scenarios?category=Astronomy&group=Open%20a%20station&tag=night&status=201&scenario=z',
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
    await harness.navigateByUrl('/scenarios');
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
    expect(TestBed.inject(Router).url).toBe('/scenarios');
  });
  it('clears incompatible groups when category changes', async () => {
    await harness.navigateByUrl('/scenarios?category=Astronomy&group=Open%20a%20station');
    await load();
    const category = root().querySelector('select')!;
    category.value = 'Weather';
    category.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/scenarios?category=Weather');
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(1);
  });
  it('selects, closes, and restores details through route navigation', async () => {
    await harness.navigateByUrl('/scenarios');
    await load();
    await click('[data-scenario-id="z"]');
    expect(TestBed.inject(Router).url).toContain('scenario=z');
    await click('app-scenario-detail button');
    expect(root().querySelector('app-scenario-detail')).toBeNull();
    await harness.navigateByUrl('/scenarios?scenario=z');
    expect(root().querySelector('app-scenario-detail')).not.toBeNull();
  });
  it('removes stale URL state and discovers new metadata after refresh', async () => {
    await harness.navigateByUrl('/scenarios?category=Astronomy&tag=night&status=201&scenario=z');
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
    expect(TestBed.inject(Router).url).toBe('/scenarios');
    expect(text()).toContain('Shipping');
    expect(text()).toContain('express');
    expect(text()).not.toContain('Astronomy');
    expect(root().querySelector('app-scenario-detail')).toBeNull();
  });
  it('ignores invalid query values and hides unavailable metadata filters for legacy records', async () => {
    await harness.navigateByUrl(
      '/scenarios?category=missing&group=missing&tag=missing&status=999&scenario=missing',
    );
    await load([example('legacy')]);
    expect(TestBed.inject(Router).url).toBe('/scenarios');
    expect(root().querySelectorAll('select')).toHaveLength(1);
    expect(text()).toContain('legacy');
    expect(text()).toContain('Uncategorized');
  });
  it('escapes catalog content rather than rendering markup', async () => {
    await harness.navigateByUrl('/scenarios');
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
    await harness.navigateByUrl('/scenarios');
    http
      .expectOne('/training/catalog')
      .flush({}, { status: status as number, statusText: 'Error' });
    harness.detectChanges();
    expect(text()).toContain(message);
    await click('.primary');
    await load();
    expect(root().querySelectorAll('[data-scenario-id]')).toHaveLength(4);
  });
  it('handles invalid catalogs and an empty catalog after retry', async () => {
    await harness.navigateByUrl('/scenarios');
    http.expectOne('/training/catalog').flush({ catalogVersion: 2, scenarios: [] });
    harness.detectChanges();
    expect(text()).toContain('This catalog can’t be displayed');
    await click('.primary');
    await load([]);
    expect(text()).toContain('No scenarios yet');
  });
});
