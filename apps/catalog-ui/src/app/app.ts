import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ThemeControl } from '@response-capture/ui/theme';
import { RouteFocus } from '@response-capture/ui/route-focus';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ThemeControl, RouteFocus],
  template: `<a class="skip-link" href="#page-content" (click)="skipToContent($event)"
      >Skip to content</a
    >
    <header class="app-header">
      <a routerLink="/" class="app-brand">Scenario library<span>Response Capture</span></a>
      <app-theme-control />
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
