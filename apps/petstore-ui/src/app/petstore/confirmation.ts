import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-confirmation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="panel confirmation" aria-label="Confirm action">
    <h2>{{ title() }}</h2>
    <p>{{ message() }}</p>
    <div class="actions">
      <button #cancel type="button" (click)="cancelled.emit()" [disabled]="busy()">Cancel</button
      ><button type="button" class="danger" (click)="confirmed.emit()" [disabled]="busy()">
        {{ busy() ? 'Working…' : 'Confirm' }}
      </button>
    </div>
  </section>`,
})
export class Confirmation {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly busy = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  private readonly cancel = viewChild<ElementRef<HTMLButtonElement>>('cancel');
  constructor() {
    afterNextRender(() => this.cancel()?.nativeElement.focus());
  }
}
