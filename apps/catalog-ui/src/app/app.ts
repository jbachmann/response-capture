import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ThemeService } from './theme.service';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `<a class="skip-link" href="#page-content" (click)="skipToContent($event)"
      >Skip to content</a
    >
    <header class="app-header">
      <a routerLink="/" class="app-brand">Scenario library<span>Response Capture</span></a>
      <label class="theme-control"
        >Theme
        <select
          #themeSelect
          [value]="theme.preference()"
          (change)="theme.setPreference(themeSelect.value)"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </header>
    <div id="page-content" tabindex="-1"><router-outlet /></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly theme = inject(ThemeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    const injector = inject(Injector);
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        if (e instanceof NavigationEnd && e.urlAfterRedirects.split('?')[0] !== this.lastPath) {
          this.lastPath = e.urlAfterRedirects.split('?')[0];
          afterNextRender(
            () => {
              const content = this.host.nativeElement.querySelector<HTMLElement>('#page-content');
              // Keep focus if the user has already interacted with the new page.
              if (document.activeElement !== content && content?.contains(document.activeElement))
                return;
              const target = this.host.nativeElement.querySelector<HTMLElement>('h1') ?? content;
              target?.setAttribute('tabindex', '-1');
              target?.focus();
            },
            { injector },
          );
        }
      });
  }
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.host.nativeElement.querySelector<HTMLElement>('#page-content')?.focus();
  }

  private lastPath = '';
}
