import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeControl } from '@response-capture/ui/theme';
import { RouteFocus } from '@response-capture/ui/route-focus';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeControl, RouteFocus],
  template: `<a class="skip-link" href="#page-content" (click)="skipToContent($event)"
      >Skip to content</a
    >
    <header class="app-header">
      <a routerLink="/pets" class="app-brand">Petstore<span>Response Capture</span></a>
      <div class="header-actions">
        <nav aria-label="Main navigation">
          <a routerLink="/pets" routerLinkActive="active" ariaCurrentWhenActive="page">Pets</a
          ><a routerLink="/orders" routerLinkActive="active" ariaCurrentWhenActive="page">Orders</a>
        </nav>
        <app-theme-control />
      </div>
    </header>
    <div id="page-content" tabindex="-1" appRouteFocus><router-outlet /></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.host.nativeElement.querySelector<HTMLElement>('#page-content')?.focus();
  }
}
