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
import { catchError, of, switchMap, tap } from 'rxjs';
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
  constructor() {
    this.route.paramMap
      .pipe(
        tap(() => {
          this.order.set(null);
          this.loading.set(true);
          this.error.set('');
          this.confirmDelete.set(false);
        }),
        switchMap((params) => {
          const id = validId(params.get('id'));
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
      .subscribe((o) => {
        this.order.set(o);
        this.loading.set(false);
      });
  }
  protected load() {
    const id = validId(this.route.snapshot.paramMap.get('id'));
    if (!id) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .order(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (o) => {
          this.order.set(o);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(errorMessage(e));
          this.loading.set(false);
        },
      });
  }
  protected cancel() {
    this.confirmDelete.set(false);
    this.deleteButton()?.nativeElement.focus();
  }
  protected remove() {
    const o = this.order();
    if (!o || this.deleting()) return;
    this.deleting.set(true);
    this.error.set('');
    this.api
      .deleteOrder(o.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmDelete.set(false);
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
