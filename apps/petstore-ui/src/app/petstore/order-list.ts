import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { Order } from './models';
import { errorMessage, PetstoreApiService } from './petstore-api.service';

@Component({
  selector: 'app-order-list',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-list.html',
  styles: `
    :host {
      display: block;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    caption {
      text-align: left;
      padding: 0.75rem 0;
      color: var(--muted);
    }
    th,
    td {
      padding: 0.85rem;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    th {
      font-weight: 600;
    }
  `,
})
export class OrderList {
  private readonly api = inject(PetstoreApiService);
  protected readonly orders = signal<Order[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly refresh = new Subject<void>();
  constructor() {
    this.refresh
      .pipe(
        startWith(undefined),
        tap(() => {
          this.loading.set(true);
          this.error.set('');
        }),
        switchMap(() =>
          this.api.orders().pipe(
            catchError((e) => {
              this.error.set(errorMessage(e));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((orders) => {
        if (orders) this.orders.set(orders);
        this.loading.set(false);
      });
  }
}
