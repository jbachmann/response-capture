import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { Inventory, Pet, PetStatus } from './models';
import { errorMessage, PetstoreApiService } from './petstore-api.service';
import { PetPhoto } from './pet-photo';
import { Confirmation } from './confirmation';

@Component({
  selector: 'app-pet-list',
  imports: [RouterLink, ReactiveFormsModule, PetPhoto, Confirmation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pet-list.html',
})
export class PetList {
  private readonly api = inject(PetstoreApiService);
  private readonly injector = inject(Injector);
  private readonly noticeRegion = viewChild<ElementRef<HTMLElement>>('noticeRegion');
  private readonly destroyRef = inject(DestroyRef);
  protected readonly refresh = new Subject<void>();
  protected readonly filters = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    status: new FormControl<PetStatus | ''>('', { nonNullable: true }),
    tag: new FormControl('', { nonNullable: true }),
  });
  protected readonly pets = signal<Pet[]>([]);
  protected readonly inventory = signal<Inventory | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notice = signal(
    (inject(Router).getCurrentNavigation()?.extras.state?.['notice'] as string) ?? '',
  );
  protected readonly confirmSeed = signal(false);
  protected readonly seeding = signal(false);
  private readonly search = signal('');
  private readonly seedButton = viewChild<ElementRef<HTMLButtonElement>>('seedButton');
  protected cancelSeed() {
    this.confirmSeed.set(false);
    this.seedButton()?.nativeElement.focus();
  }

  protected readonly visible = computed(() =>
    this.pets().filter((pet) =>
      pet.name.toLowerCase().includes(this.search().toLowerCase().trim()),
    ),
  );
  protected readonly emptyDatabase = computed(() => {
    const inventory = this.inventory();
    return inventory !== null && inventory.available + inventory.pending + inventory.sold === 0;
  });

  constructor() {
    this.filters.controls.name.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((name) => this.search.set(name));
    this.filters.controls.status.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.refresh.next());
    this.refresh
      .pipe(
        startWith(undefined),
        tap(() => {
          this.loading.set(true);
          this.error.set('');
          this.inventory.set(null);
        }),
        switchMap(() => {
          const { status, tag } = this.filters.getRawValue();
          const pets = this.loadMatchingPets(status, tag.trim());
          return forkJoin({ pets, inventory: this.api.inventory() }).pipe(
            catchError((e) => {
              this.error.set(errorMessage(e));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result) {
          this.pets.set(result.pets);
          this.inventory.set(result.inventory);
        }
        this.loading.set(false);
      });
  }

  private loadMatchingPets(status: PetStatus | '', tag: string) {
    if (status && tag) {
      return forkJoin([this.api.byStatus(status), this.api.byTag(tag)]).pipe(
        map(([statusMatches, tagMatches]) => {
          const matchingIds = new Set(tagMatches.map((pet) => pet.id));
          return statusMatches.filter((pet) => matchingIds.has(pet.id));
        }),
      );
    }
    if (status) return this.api.byStatus(status);
    if (tag) return this.api.byTag(tag);
    return this.api.pets();
  }

  protected clear() {
    this.filters.reset({ name: '', status: '', tag: '' }, { emitEvent: false });
    this.search.set('');
    this.refresh.next();
  }

  protected seed() {
    if (this.seeding()) return;
    this.seeding.set(true);
    this.error.set('');
    this.api
      .seed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.seeding.set(false);
          this.confirmSeed.set(false);
          this.notice.set('Demo data loaded.');
          afterNextRender(() => this.noticeRegion()?.nativeElement.focus(), {
            injector: this.injector,
          });
          this.refresh.next();
        },
        error: (e) => {
          this.error.set(errorMessage(e));
          this.seeding.set(false);
        },
      });
  }
}
