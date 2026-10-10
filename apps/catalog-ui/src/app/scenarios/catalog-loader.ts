import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { Scenario } from '@response-capture/contracts/scenarios';
import { Subscription } from 'rxjs';
import { CatalogService, CatalogSystem } from './catalog.service';

export type CatalogLoadState =
  'loading' | 'ready' | 'missing' | 'error' | 'invalid' | 'empty-inventory' | 'inventory-error';

/** One instance per browser component; leaving the route cancels both requests. */
@Injectable()
export class CatalogLoader {
  private readonly service = inject(CatalogService);
  private request?: Subscription;
  private inventoryRequest?: Subscription;
  readonly inventoryLoaded = signal(false);
  readonly inventoryLoading = signal(false);
  readonly systems = signal<CatalogSystem[]>([]);
  readonly scenarios = signal<Scenario[]>([]);
  readonly state = signal<CatalogLoadState>('loading');

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request?.unsubscribe();
      this.inventoryRequest?.unsubscribe();
    });
  }

  refreshInventory(onReady: () => void): void {
    this.inventoryRequest?.unsubscribe();
    this.request?.unsubscribe();
    this.inventoryLoading.set(true);
    this.scenarios.set([]);
    this.state.set('loading');
    this.inventoryRequest = this.service.inventory().subscribe({
      next: (inventory) => {
        this.systems.set(inventory.systems);
        this.inventoryLoaded.set(true);
        this.inventoryLoading.set(false);
        onReady();
      },
      error: () => {
        this.inventoryLoading.set(false);
        this.state.set('inventory-error');
      },
    });
  }

  load(system: string, commit: string, onReady: () => void): void {
    this.request?.unsubscribe();
    this.scenarios.set([]);
    if (!system) {
      this.state.set('empty-inventory');
      return;
    }
    this.state.set('loading');
    this.request = this.service.load(system, commit).subscribe({
      next: (catalog) => {
        this.scenarios.set(catalog.scenarios);
        this.state.set('ready');
        onReady();
      },
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse)) {
          this.state.set('invalid');
          return;
        }
        this.state.set(error.status === 404 ? 'missing' : 'error');
      },
    });
  }
}
