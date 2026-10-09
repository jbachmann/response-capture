import {
  ChangeDetectionStrategy,
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { switchMap, throwError } from 'rxjs';
import { Pet } from './models';
import { errorMessage, PetstoreApiService } from './petstore-api.service';
@Component({
  selector: 'app-order-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-form.html',
})
export class OrderForm {
  readonly pet = input.required<Pet>();
  readonly closed = output<void>();
  readonly refreshed = output<Pet>();
  private readonly api = inject(PetstoreApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  readonly form = new FormGroup({
    quantity: new FormControl(1, {
      nonNullable: true,
      validators: [
        Validators.required,
        (c) => (Number.isSafeInteger(c.value) && c.value > 0 ? null : { quantity: true }),
      ],
    }),
    shipDate: new FormControl('', {
      nonNullable: true,
      validators: [
        (c) => (!c.value || Number.isFinite(new Date(c.value).getTime()) ? null : { date: true }),
      ],
    }),
  });
  private readonly quantity = viewChild<ElementRef<HTMLInputElement>>('quantity');
  constructor() {
    afterNextRender(() => this.quantity()?.nativeElement.focus());
  }
  protected submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.form.disable();
    const v = this.form.getRawValue();
    this.api
      .pet(this.pet().id)
      .pipe(
        switchMap((p) => {
          this.refreshed.emit(p);
          if (p.status !== 'available') return throwError(() => new Error('unavailable'));
          return this.api.createOrder({
            petId: p.id,
            quantity: v.quantity,
            ...(v.shipDate ? { shipDate: new Date(v.shipDate).toISOString() } : {}),
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (o) => {
          void this.router.navigate(['/orders', o.id], {
            state: { notice: 'Order placed. Save this order ID to look it up later.' },
          });
        },
        error: (e) => {
          this.error.set(
            e instanceof Error && e.message === 'unavailable'
              ? 'This pet is no longer available. An order was not placed.'
              : errorMessage(e),
          );
          this.busy.set(false);
          this.form.enable();
        },
      });
  }
}
