import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OrderList } from './order-list';
import { validId } from './models';

@Component({
  selector: 'app-order-lookup',
  imports: [ReactiveFormsModule, OrderList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-lookup.html',
})
export class OrderLookup {
  private readonly router = inject(Router);
  protected readonly id = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, (c) => (validId(c.value) !== null ? null : { id: true })],
  });
  protected readonly form = new FormGroup({ id: this.id });
  protected lookup(value: string) {
    // Browsers may restore or autofill a value without emitting an input event.
    this.id.setValue(value);
    this.id.markAsTouched();
    if (this.id.invalid) return;
    void this.router.navigate(['/orders', validId(this.id.value)]);
  }
}
