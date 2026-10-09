import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders the library branding, skip link, and route outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.app-brand')?.textContent).toContain('Scenario library');
    expect(root.querySelector('.app-brand')?.textContent).toContain('Response Capture');
    expect(root.querySelector('.skip-link')?.getAttribute('href')).toBe('#page-content');
    expect(root.querySelector('#page-content')?.getAttribute('tabindex')).toBe('-1');
    expect(root.querySelector('router-outlet')).not.toBeNull();
  });

  it('focuses content through the skip link without navigating', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    document.body.append(root);
    try {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      root.querySelector<HTMLAnchorElement>('.skip-link')!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(root.querySelector('#page-content'));
      expect(TestBed.inject(Router).url).toBe('/');
    } finally {
      root.remove();
    }
  });

  it.each(['/', '/unknown'])('loads the library at %s', async (path) => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl(path);
    TestBed.inject(HttpTestingController).expectOne('/catalog-inventory').flush({ systems: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Scenario library');
    expect(fixture.nativeElement.textContent).toContain('No catalogs yet');
  });
});
