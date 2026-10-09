import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { NamedEntity, Pet, PetInput, PetStatus, validId } from './models';
import { errorMessage, PetstoreApiService } from './petstore-api.service';
export function tagRow(tag: NamedEntity = {}) {
  return new FormGroup({
    id: new FormControl<number | null>(tag.id ?? null),
    name: new FormControl(tag.name ?? '', { nonNullable: true }),
  });
}
export function petPayload(form: PetEditor['form'], original: Pet | null = null): PetInput {
  const v = form.getRawValue();
  const category: NamedEntity = {
    ...(v.categoryId !== null && (v.category.trim() || !original?.category?.name)
      ? { id: v.categoryId }
      : {}),
    ...(v.category.trim() ? { name: v.category.trim() } : {}),
  };
  return {
    name: v.name.trim(),
    status: v.status,
    photoUrls:
      original && v.photos === original.photoUrls.join('\n')
        ? [...original.photoUrls]
        : v.photos
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
    ...(Object.keys(category).length ? { category } : {}),
    tags: v.tags.map((t) => ({
      ...(t.id !== null ? { id: t.id } : {}),
      ...(t.name.trim() ? { name: t.name.trim() } : {}),
    })),
  };
}
@Component({
  selector: 'app-pet-editor',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pet-editor.html',
})
export class PetEditor {
  private readonly api = inject(PetstoreApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly original = signal<Pet | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    status: new FormControl<PetStatus>('available', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    categoryId: new FormControl<number | null>(null),
    tags: new FormArray<ReturnType<typeof tagRow>>([]),
    photos: new FormControl('', { nonNullable: true }),
  });
  constructor() {
    this.route.paramMap
      .pipe(
        tap(() => {
          this.original.set(null);
          this.form.reset({
            name: '',
            status: 'available',
            category: '',
            categoryId: null,
            photos: '',
          });
          this.form.controls.tags.clear();
        }),
        switchMap((params) => {
          const raw = params.get('id');
          if (raw === null) return of(null);
          const id = validId(raw);
          if (id === null) {
            this.loadError.set('Invalid pet ID.');
            return of(null);
          }
          this.loading.set(true);
          this.loadError.set('');
          return this.api.pet(id).pipe(
            catchError((e) => {
              this.loadError.set(errorMessage(e));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((p) => this.populate(p));
  }
  private populate(p: Pet | null) {
    this.loading.set(false);
    if (!p) return;
    this.original.set(p);
    this.form.patchValue({
      name: p.name,
      status: p.status,
      category: p.category?.name ?? '',
      categoryId: p.category?.id ?? null,
      photos: p.photoUrls.join('\n'),
    });
    this.form.controls.tags.clear();
    p.tags.forEach((t) => this.form.controls.tags.push(tagRow(t)));
  }
  protected load() {
    const id = validId(this.route.snapshot.paramMap.get('id'));
    if (!id) return;
    this.loading.set(true);
    this.loadError.set('');
    this.api
      .pet(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => this.populate(p),
        error: (e) => {
          this.loading.set(false);
          this.loadError.set(errorMessage(e));
        },
      });
  }
  protected addTag() {
    this.form.controls.tags.push(tagRow());
  }
  protected save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.form.disable();
    this.error.set('');
    const original = this.original();
    const p = petPayload(this.form, original);
    const request = original
      ? this.api.updatePet({ ...p, id: original.id })
      : this.api.createPet(p);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (pet) => {
        void this.router.navigate(['/pets', pet.id], { state: { notice: 'Pet saved.' } });
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.saving.set(false);
        this.form.enable();
      },
    });
  }
}
