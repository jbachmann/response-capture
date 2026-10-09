import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { Pet, validId } from './models';
import { errorMessage, PetstoreApiService } from './petstore-api.service';
import { PetPhoto } from './pet-photo';
import { Confirmation } from './confirmation';
import { OrderForm } from './order-form';
@Component({
  selector: 'app-pet-detail',
  imports: [RouterLink, PetPhoto, Confirmation, OrderForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pet-detail.html',
})
export class PetDetail {
  private readonly api = inject(PetstoreApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deleteButton = viewChild<ElementRef<HTMLButtonElement>>('deleteButton');
  private readonly orderButton = viewChild<ElementRef<HTMLButtonElement>>('orderButton');
  protected readonly pet = signal<Pet | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notice = signal(
    (this.router.getCurrentNavigation()?.extras.state?.['notice'] as string) ?? '',
  );
  protected readonly confirmDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly ordering = signal(false);
  constructor() {
    this.route.paramMap
      .pipe(
        tap(() => {
          this.pet.set(null);
          this.loading.set(true);
          this.error.set('');
          this.confirmDelete.set(false);
          this.ordering.set(false);
        }),
        switchMap((params) => {
          const id = validId(params.get('id'));
          if (!id) {
            this.error.set('Invalid pet ID.');
            return of(null);
          }
          return this.api.pet(id).pipe(
            catchError((e) => {
              this.error.set(errorMessage(e));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((p) => {
        this.pet.set(p);
        this.loading.set(false);
      });
  }
  protected load() {
    const id = validId(this.route.snapshot.paramMap.get('id'));
    if (!id) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .pet(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.pet.set(p);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(errorMessage(e));
          this.loading.set(false);
        },
      });
  }
  protected cancelDelete() {
    this.confirmDelete.set(false);
    this.deleteButton()?.nativeElement.focus();
  }
  protected closeOrder() {
    this.ordering.set(false);
    this.orderButton()?.nativeElement.focus();
  }
  protected remove() {
    const p = this.pet();
    if (!p || this.deleting()) return;
    this.deleting.set(true);
    this.error.set('');
    this.api
      .deletePet(p.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigate(['/pets'], { state: { notice: 'Pet deleted.' } });
        },
        error: (e) => {
          this.error.set(errorMessage(e));
          this.deleting.set(false);
        },
      });
  }
}
