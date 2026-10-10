import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injectable,
  InjectionToken,
  signal,
} from '@angular/core';

type Theme = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = new InjectionToken<string>('theme storage key', {
  providedIn: 'root',
  factory: () => 'response-capture:consumer:theme',
});

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storageKey = inject(THEME_STORAGE_KEY);
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
      this.document.defaultView?.localStorage.setItem(this.storageKey, value);
    } catch {
      // Keep the control usable when browser storage is unavailable.
    }
  }

  private readPreference(): Theme {
    try {
      const value = this.document.defaultView?.localStorage.getItem(this.storageKey);
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

@Component({
  selector: 'app-theme-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="theme-control"
    >Theme
    <select #selection [value]="theme.preference()" (change)="theme.setPreference(selection.value)">
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`,
})
export class ThemeControl {
  protected readonly theme = inject(ThemeService);
}
