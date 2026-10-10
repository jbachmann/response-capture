import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { parseCatalog } from '@response-capture/contracts/scenarios';

export type {
  CatalogVersion,
  CatalogSystem,
  CatalogInventory,
} from '@response-capture/contracts/catalog-api';
import type { CatalogInventory } from '@response-capture/contracts/catalog-api';
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  inventory() {
    return this.http.get<CatalogInventory>('/catalog-inventory');
  }

  load(system: string, commit = '') {
    const path = `/catalogs/${encodeURIComponent(system)}`;
    return this.http
      .get<unknown>(commit ? `${path}/${encodeURIComponent(commit)}` : path)
      .pipe(map(parseCatalog));
  }
}
