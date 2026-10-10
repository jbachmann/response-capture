import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  afterNextRender,
  Injector,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogLoader } from './catalog-loader';
import { browserQueryParams, readBrowserState, sameQueryParams } from './browser-url';
import {
  emptyFilters,
  Filters,
  filterScenarios,
  groupScenarios,
  normalizeFilters,
  filterOptions,
  statusLabel,
} from './scenario-filters';
import { ScenarioDetail } from './scenario-detail';
import { ScenarioList } from './scenario-list';

@Component({
  selector: 'app-scenario-browser',
  providers: [CatalogLoader],
  imports: [DatePipe, ReactiveFormsModule, ScenarioDetail, ScenarioList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scenario-browser.html',
  styleUrl: './scenario-browser.css',
})
export class ScenarioBrowser {
  private readonly loader = inject(CatalogLoader);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly inventoryLoading = this.loader.inventoryLoading;
  protected readonly systems = this.loader.systems;
  protected readonly system = signal('');
  protected readonly commit = signal('');
  protected readonly versions = computed(
    () => this.systems().find((system) => system.name === this.system())?.catalogs ?? [],
  );
  private readonly detailRegion = viewChild<ElementRef<HTMLElement>>('detailRegion');
  protected readonly scenarios = this.loader.scenarios;
  protected readonly state = this.loader.state;
  protected readonly filters = signal<Filters>({ ...emptyFilters });
  protected readonly selectedId = signal('');
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly available = computed(() =>
    filterOptions(this.scenarios(), this.filters().category),
  );
  protected readonly visible = computed(() => filterScenarios(this.scenarios(), this.filters()));
  protected readonly categories = computed(() => groupScenarios(this.visible()));
  protected readonly selected = computed(() =>
    this.scenarios().find((s) => s.id === this.selectedId()),
  );
  protected readonly hasFilters = computed(() => Object.values(this.filters()).some(Boolean));
  protected readonly status = statusLabel;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const { system, commit, filters, selectedId } = readBrowserState(params);
      const catalogChanged = system !== this.system() || commit !== this.commit();
      this.system.set(system);
      this.commit.set(commit);
      this.filters.set(
        this.state() === 'ready' && !catalogChanged
          ? normalizeFilters(filters, this.scenarios())
          : filters,
      );
      this.selectedId.set(selectedId);
      this.search.setValue(this.filters().q, { emitEvent: false });
      if (catalogChanged && this.loader.inventoryLoaded() && !this.inventoryLoading()) {
        this.resolveSelection();
        this.loadCatalog();
      } else if (this.state() === 'ready') {
        this.reconcile();
      }
    });
    this.search.valueChanges.pipe(takeUntilDestroyed()).subscribe((q) => this.setFilter('q', q));
    this.refresh();
  }

  protected refresh(): void {
    this.loader.refreshInventory(() => {
      this.resolveSelection();
      this.loadCatalog();
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
    this.loader.load(this.system(), this.commit(), () => this.reconcile());
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
    afterNextRender(() => this.detailRegion()?.nativeElement.focus(), { injector: this.injector });
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
    const queryParams = browserQueryParams({
      system: this.system(),
      commit: this.commit(),
      filters: this.filters(),
      selectedId: this.selectedId(),
    });
    if (sameQueryParams(this.route.snapshot.queryParams, queryParams)) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl });
  }
}
