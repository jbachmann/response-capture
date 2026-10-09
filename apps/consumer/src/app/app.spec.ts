import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  it('renders the feature route outlet', () => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
  it('shows only Pets and Orders in navigation', () => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = [...fixture.nativeElement.querySelectorAll('nav a')] as HTMLAnchorElement[];
    expect(links.map((link) => link.textContent?.trim())).toEqual(['Pets', 'Orders']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/pets', '/orders']);
  });

  it('redirects the former scenario route to pets without requesting catalogs', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/scenarios');
    const http = TestBed.inject(HttpTestingController);
    http.expectNone('/catalog-inventory');
    for (const request of http.match(() => true)) {
      request.flush(request.request.url === '/store/inventory' ? {} : []);
    }
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/pets');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain(
      'Find your next companion.',
    );
    http.verify();
  });
});
