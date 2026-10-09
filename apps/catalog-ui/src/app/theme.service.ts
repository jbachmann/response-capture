import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

type Theme = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'response-capture:catalog-ui:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly selected = signal<Theme>(this.readPreference());
  readonly preference = this.selected.asReadonly();

  constructor() {
    this.apply(this.preference());
  }

  setPreference(value: string): void {
    if (value !== 'system' && value !== 'light' && value !== 'dark') return;
    this.selected.set(value);
    this.apply(value);
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Keep the control usable when browser storage is unavailable.
    }
  }

  private readPreference(): Theme {
    try {
      const value = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      if (value === 'light' || value === 'dark') return value;
    } catch {
      // Follow the system when browser storage is unavailable.
    }
    return 'system';
  }

  private apply(value: Theme): void {
    if (value === 'system') this.document.documentElement.removeAttribute('data-theme');
    else this.document.documentElement.setAttribute('data-theme', value);
  }
}
