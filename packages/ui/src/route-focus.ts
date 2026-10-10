import { DOCUMENT } from '@angular/common';
import { afterNextRender, Directive, ElementRef, inject, Injector } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

@Directive({ selector: '[appRouteFocus]' })
export class RouteFocus {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private lastPath = '';

  constructor() {
    const injector = inject(Injector);
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const path = event.urlAfterRedirects.split('?')[0];
        if (path === this.lastPath) return;
        this.lastPath = path;
        afterNextRender(
          () => {
            const content = this.host.nativeElement;
            // Keep focus if the user has already interacted with the new page.
            if (
              this.document.activeElement !== content &&
              content.contains(this.document.activeElement)
            )
              return;
            const target = content.querySelector<HTMLElement>('h1') ?? content;
            target.setAttribute('tabindex', '-1');
            target.focus();
          },
          { injector },
        );
      });
  }
}
