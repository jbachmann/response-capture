import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CatalogService } from './catalog.service';
import {
  emptyFilters,
  Filters,
  filterScenarios,
  groupScenarios,
  normalizeFilters,
  options,
  Scenario,
  statusLabel,
} from './catalog';
import { ScenarioDetail } from './scenario-detail';
import { ScenarioList } from './scenario-list';

type LoadState = 'loading' | 'ready' | 'missing' | 'error' | 'invalid';
@Component({
  selector: 'app-scenario-browser',
  imports: [ReactiveFormsModule, ScenarioDetail, ScenarioList, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scenario-browser.html',
  styleUrl: './scenario-browser.css',
})
export class ScenarioBrowser {
  private readonly service = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private request?: Subscription;
  private readonly detailRegion = viewChild<ElementRef<HTMLElement>>('detailRegion');
  protected readonly scenarios = signal<Scenario[]>([]);
  protected readonly state = signal<LoadState>('loading');
  protected readonly filters = signal<Filters>({ ...emptyFilters });
  protected readonly selectedId = signal('');
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly available = computed(() => options(this.scenarios(), this.filters().category));
  protected readonly visible = computed(() => filterScenarios(this.scenarios(), this.filters()));
  protected readonly categories = computed(() => groupScenarios(this.visible()));
  protected readonly selected = computed(() =>
    this.scenarios().find((s) => s.id === this.selectedId()),
  );
  protected readonly hasFilters = computed(() => Object.values(this.filters()).some(Boolean));
  protected readonly status = statusLabel;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const filters = {
        q: params.get('q') ?? '',
        category: params.get('category') ?? '',
        group: params.get('group') ?? '',
        tag: params.get('tag') ?? '',
        status: params.get('status') ?? '',
      };
      this.filters.set(
        this.state() === 'ready' ? normalizeFilters(filters, this.scenarios()) : filters,
      );
      this.selectedId.set(params.get('scenario') ?? '');
      this.search.setValue(this.filters().q, { emitEvent: false });
      if (this.state() === 'ready') this.reconcile();
    });
    this.search.valueChanges.pipe(takeUntilDestroyed()).subscribe((q) => this.setFilter('q', q));
    this.destroyRef.onDestroy(() => this.request?.unsubscribe());
    this.refresh();
  }

  protected refresh(): void {
    this.request?.unsubscribe();
    this.state.set('loading');
    this.request = this.service.load().subscribe({
      next: (catalog) => {
        this.scenarios.set(catalog.scenarios);
        this.state.set('ready');
        this.reconcile();
      },
      error: (error) =>
        this.state.set(
          error instanceof HttpErrorResponse
            ? error.status === 404
              ? 'missing'
              : 'error'
            : 'invalid',
        ),
    });
  }
  private reconcile(): void {
    this.filters.set(normalizeFilters(this.filters(), this.scenarios()));
    if (!this.scenarios().some((s) => s.id === this.selectedId())) this.selectedId.set('');
    this.writeUrl(true);
  }
  protected setFilter(key: keyof Filters, value: string): void {
    const next = { ...this.filters(), [key]: value };
    this.filters.set(normalizeFilters(next, this.scenarios()));
    this.writeUrl(true);
  }
  protected clearFilters(): void {
    this.filters.set({ ...emptyFilters });
    this.search.setValue('', { emitEvent: false });
    this.writeUrl(true);
  }
  protected select(id: string): void {
    this.selectedId.set(id);
    this.writeUrl(false);
    // Focus after Angular has rendered the newly selected detail region.
    setTimeout(() => this.detailRegion()?.nativeElement.focus());
  }
  protected closeDetails(): void {
    const previousId = this.selectedId();
    this.selectedId.set('');
    this.writeUrl(false);
    const button = [
      ...this.host.nativeElement.querySelectorAll<HTMLButtonElement>('[data-scenario-id]'),
    ].find((el) => el.dataset['scenarioId'] === previousId);
    (button ?? this.host.nativeElement.querySelector<HTMLButtonElement>('[data-refresh]'))?.focus();
  }
  private writeUrl(replaceUrl: boolean): void {
    const queryParams = Object.fromEntries(
      Object.entries({ ...this.filters(), scenario: this.selectedId() }).filter(
        ([, value]) => value !== '',
      ),
    );
    const current = this.route.snapshot.queryParams;
    if (
      Object.keys(current).length === Object.keys(queryParams).length &&
      Object.entries(queryParams).every(([key, value]) => current[key] === value)
    )
      return;
    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl });
  }
}
