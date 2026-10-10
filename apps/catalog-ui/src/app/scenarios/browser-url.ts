import type { ParamMap, Params } from '@angular/router';
import type { Filters } from './scenario-filters';

export interface BrowserState {
  system: string;
  commit: string;
  filters: Filters;
  selectedId: string;
}

export function readBrowserState(params: ParamMap): BrowserState {
  return {
    system: params.get('system') ?? '',
    commit: params.get('commit') ?? '',
    selectedId: params.get('scenario') ?? '',
    filters: {
      q: params.get('q') ?? '',
      category: params.get('category') ?? '',
      group: params.get('group') ?? '',
      tag: params.get('tag') ?? '',
      status: params.get('status') ?? '',
    },
  };
}

export function browserQueryParams(state: BrowserState): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      system: state.system,
      commit: state.commit,
      ...state.filters,
      scenario: state.selectedId,
    }).filter(([, value]) => value !== ''),
  );
}

export function sameQueryParams(current: Params, next: Record<string, string>): boolean {
  return (
    Object.keys(current).length === Object.keys(next).length &&
    Object.entries(next).every(([key, value]) => current[key] === value)
  );
}
