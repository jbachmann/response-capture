import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { parseCatalog } from './catalog';

export interface CatalogVersion {
  commitHash: string;
  alias?: string;
  submittedOn: string;
}

export interface CatalogSystem {
  name: string;
  catalogs: CatalogVersion[];
}

export interface CatalogInventory {
  systems: CatalogSystem[];
}

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
