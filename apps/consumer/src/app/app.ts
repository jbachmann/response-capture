import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `<a class="skip-link" href="#page-content">Skip to content</a>
    <header class="app-header">
      <a routerLink="/pets" class="app-brand">Petstore<span>Response Capture</span></a>
      <nav aria-label="Main navigation">
        <a routerLink="/pets" routerLinkActive="active" ariaCurrentWhenActive="page">Pets</a
        ><a routerLink="/orders" routerLinkActive="active" ariaCurrentWhenActive="page">Orders</a
        ><a routerLink="/scenarios" routerLinkActive="active" ariaCurrentWhenActive="page"
          >Scenario library</a
        >
      </nav>
    </header>
    <div id="page-content" tabindex="-1"><router-outlet /></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
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
  private lastPath = '';
}
