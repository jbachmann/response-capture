import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, merge, of, Subject, switchMap, tap } from 'rxjs';
import { Order, validId } from './models';
import { errorMessage, PetstoreApiService } from './petstore-api.service';
import { Confirmation } from './confirmation';

@Component({
  selector: 'app-order-detail',
  imports: [RouterLink, DatePipe, Confirmation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-detail.html',
})
export class OrderDetail {
  private readonly api = inject(PetstoreApiService);
  private readonly injector = inject(Injector);
  private readonly noticeRegion = viewChild<ElementRef<HTMLElement>>('noticeRegion');
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deleteButton = viewChild<ElementRef<HTMLButtonElement>>('deleteButton');
  protected readonly order = signal<Order | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notice = signal(
    (this.router.getCurrentNavigation()?.extras.state?.['notice'] as string) ?? '',
  );
  protected readonly confirmDelete = signal(false);
  protected readonly deleting = signal(false);
  private readonly retry = new Subject<void>();

  constructor() {
    merge(
      this.route.paramMap.pipe(
        tap(() => {
          this.confirmDelete.set(false);
        }),
        map((params) => params.get('id')),
      ),
      this.retry.pipe(map(() => this.route.snapshot.paramMap.get('id'))),
    )
      .pipe(
        tap(() => {
          this.order.set(null);
          this.loading.set(true);
          this.error.set('');
        }),
        switchMap((rawId) => {
          const id = validId(rawId);
          if (!id) {
            this.error.set('Invalid order ID.');
            return of(null);
          }
          return this.api.order(id).pipe(
            catchError((e) => {
              this.error.set(errorMessage(e));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((order) => {
        this.order.set(order);
        this.loading.set(false);
      });
  }

  protected load() {
    this.retry.next();
  }

  protected cancel() {
    this.confirmDelete.set(false);
    this.deleteButton()?.nativeElement.focus();
  }

  protected remove() {
    const order = this.order();
    if (!order || this.deleting()) return;
    this.deleting.set(true);
    this.error.set('');
    this.api
      .deleteOrder(order.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.order.set(null);
          this.notice.set('Order deleted. Pet status is unchanged.');
          afterNextRender(() => this.noticeRegion()?.nativeElement.focus(), {
            injector: this.injector,
          });
          this.deleting.set(false);
        },
        error: (e) => {
          this.error.set(errorMessage(e));
          this.deleting.set(false);
        },
      });
  }
}
