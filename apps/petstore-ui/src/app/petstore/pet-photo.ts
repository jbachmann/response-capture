import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-pet-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (safeUrl(); as url) {
      @if (failedUrl() !== url) {
        <img [src]="url" [alt]="name()" loading="lazy" (error)="failedUrl.set(url)" />
      } @else {
        <span class="placeholder" role="img" [attr.aria-label]="name() + ': photo unavailable'"
          >◇</span
        >
      }
    } @else {
      <span class="placeholder" role="img" [attr.aria-label]="name() + ': no photo'">◇</span>
    }`,
  styles: `
    :host {
      display: block;
      aspect-ratio: 4/3;
      overflow: hidden;
      background: var(--subtle);
      border-radius: 8px;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .placeholder {
      display: grid;
      place-items: center;
      height: 100%;
      font-size: 3rem;
      color: var(--accent);
    }
  `,
})
export class PetPhoto {
  readonly url = input<string>();
  readonly name = input.required<string>();
  protected readonly failedUrl = signal('');
  protected readonly safeUrl = computed(() => {
    const url = this.url();
    return url && /^https?:\/\//i.test(url) ? url : null;
  });
}
