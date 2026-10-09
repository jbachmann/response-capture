import { DatePipe } from '@angular/common';
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
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CatalogService, CatalogSystem } from './catalog.service';
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

type LoadState =
  'loading' | 'ready' | 'missing' | 'error' | 'invalid' | 'empty-inventory' | 'inventory-error';
@Component({
  selector: 'app-scenario-browser',
  imports: [DatePipe, ReactiveFormsModule, ScenarioDetail, ScenarioList],
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
  private inventoryRequest?: Subscription;
  private inventoryLoaded = false;
  protected readonly inventoryLoading = signal(false);
  protected readonly systems = signal<CatalogSystem[]>([]);
  protected readonly system = signal('');
  protected readonly commit = signal('');
  protected readonly versions = computed(
    () => this.systems().find((system) => system.name === this.system())?.catalogs ?? [],
  );
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
      const system = params.get('system') ?? '';
      const commit = params.get('commit') ?? '';
      const catalogChanged = system !== this.system() || commit !== this.commit();
      this.system.set(system);
      this.commit.set(commit);
      const filters = {
        q: params.get('q') ?? '',
        category: params.get('category') ?? '',
        group: params.get('group') ?? '',
        tag: params.get('tag') ?? '',
        status: params.get('status') ?? '',
      };
      this.filters.set(
        this.state() === 'ready' && !catalogChanged
          ? normalizeFilters(filters, this.scenarios())
          : filters,
      );
      this.selectedId.set(params.get('scenario') ?? '');
      this.search.setValue(this.filters().q, { emitEvent: false });
      if (catalogChanged && this.inventoryLoaded && !this.inventoryLoading()) {
        this.resolveSelection();
        this.loadCatalog();
      } else if (this.state() === 'ready') {
        this.reconcile();
      }
    });
    this.search.valueChanges.pipe(takeUntilDestroyed()).subscribe((q) => this.setFilter('q', q));
    this.destroyRef.onDestroy(() => {
      this.request?.unsubscribe();
      this.inventoryRequest?.unsubscribe();
    });
    this.refresh();
  }

  protected refresh(): void {
    this.inventoryRequest?.unsubscribe();
    this.request?.unsubscribe();
    this.inventoryLoading.set(true);
    this.scenarios.set([]);
    this.state.set('loading');
    this.inventoryRequest = this.service.inventory().subscribe({
      next: (inventory) => {
        this.systems.set(inventory.systems);
        this.inventoryLoaded = true;
        this.inventoryLoading.set(false);
        this.resolveSelection();
        this.loadCatalog();
      },
      error: () => {
        this.inventoryLoading.set(false);
        this.state.set('inventory-error');
      },
    });
  }

  private resolveSelection(): void {
    if (!this.systems().some((system) => system.name === this.system())) {
      this.system.set(this.systems()[0]?.name ?? '');
      this.commit.set('');
    }
    if (!this.versions().some((version) => version.commitHash === this.commit())) {
      this.commit.set('');
    }
    this.writeUrl(true);
  }

  protected changeSystem(system: string): void {
    this.changeCatalog(system, '');
  }

  protected changeVersion(commit: string): void {
    this.changeCatalog(this.system(), commit);
  }

  private changeCatalog(system: string, commit: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { system, ...(commit ? { commit } : {}) },
    });
  }

  private loadCatalog(): void {
    this.request?.unsubscribe();
    this.scenarios.set([]);
    if (!this.system()) {
      this.state.set('empty-inventory');
      return;
    }
    this.state.set('loading');
    this.request = this.service.load(this.system(), this.commit()).subscribe({
      next: (catalog) => {
        this.scenarios.set(catalog.scenarios);
        this.state.set('ready');
        this.reconcile();
      },
      error: (error: unknown) =>
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
    this.search.setValue(this.filters().q, { emitEvent: false });
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
      Object.entries({
        system: this.system(),
        commit: this.commit(),
        ...this.filters(),
        scenario: this.selectedId(),
      }).filter(([, value]) => value !== ''),
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
