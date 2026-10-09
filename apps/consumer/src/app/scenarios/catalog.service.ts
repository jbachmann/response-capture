import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { parseCatalog } from './catalog';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  load() {
    return this.http.get<unknown>('/training/catalog').pipe(map(parseCatalog));
  }
}
