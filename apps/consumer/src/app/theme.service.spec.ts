import axe from 'axe-core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { ThemeService } from './theme.service';

const STORAGE_KEY = 'response-capture:consumer:theme';

describe('Theme selection', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  it('follows the system by default and leaves CSS to react to system changes', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.preference()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it.each(['light', 'dark'] as const)('restores a saved %s preference', (value) => {
    localStorage.setItem(STORAGE_KEY, value);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(document.documentElement.getAttribute('data-theme')).toBe(value);
    expect(fixture.nativeElement.querySelector('.theme-control select').value).toBe(value);
  });

  it('applies and saves choices from the labeled header control, including returning to system', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector(
      '.theme-control select',
    ) as HTMLSelectElement;
    expect(select.closest('label')?.textContent).toContain('Theme');
    for (const value of ['dark', 'light', 'system']) {
      select.value = value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(TestBed.inject(ThemeService).preference()).toBe(value);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(value);
      expect(document.documentElement.getAttribute('data-theme')).toBe(
        value === 'system' ? null : value,
      );
    }
  });

  it.each(['light', 'dark'])('passes axe WCAG A/AA header checks in %s mode', async (value) => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(ThemeService).setPreference(value);
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      // jsdom has no layout engine; palette contrast is checked separately.
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it('ignores invalid stored preferences and selections', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid');
    const theme = TestBed.inject(ThemeService);
    theme.setPreference('invalid');
    expect(theme.preference()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('still changes theme when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    const theme = TestBed.inject(ThemeService);
    expect(theme.preference()).toBe('system');
    theme.setPreference('dark');
    expect(theme.preference()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
