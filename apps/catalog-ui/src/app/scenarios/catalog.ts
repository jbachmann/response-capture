export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Scenario {
  schemaVersion: 1;
  id: string;
  title?: string;
  description?: string;
  category?: string;
  group?: string;
  tags?: string[];
  request: {
    method: string;
    path: string;
    body: Json;
    match?: { bodyContains: { [key: string]: Json } };
  };
  response: { status: number; body: Json; headers?: { 'content-type': string } };
}
export interface Catalog {
  catalogVersion: 1;
  scenarios: Scenario[];
}
export interface Filters {
  q: string;
  category: string;
  group: string;
  tag: string;
  status: string;
}
export const emptyFilters: Filters = { q: '', category: '', group: '', tag: '', status: '' };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function json(value: unknown): value is Json {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return [...value].every(json);
  return typeof value === 'object' && Object.values(record(value)).every(json);
}
function label(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim();
}

/** Validate the wire contract without importing server or test-only code. */
export function parseCatalog(value: unknown): Catalog {
  const catalog = record(value);
  if (catalog['catalogVersion'] !== 1 || !Array.isArray(catalog['scenarios'])) {
    throw new Error('Unsupported or invalid catalog');
  }
  const ids = new Set<string>();
  for (const value of catalog['scenarios']) {
    const scenario = record(value);
    if (scenario['schemaVersion'] !== 1 || !label(scenario['id']) || ids.has(scenario['id'])) {
      throw new Error('Invalid scenario version or ID');
    }
    ids.add(scenario['id']);
    for (const key of ['title', 'category', 'group']) {
      if (scenario[key] !== undefined && !label(scenario[key])) throw new Error(`Invalid ${key}`);
    }
    if (scenario['description'] !== undefined && typeof scenario['description'] !== 'string') {
      throw new Error('Invalid description');
    }
    const tags = scenario['tags'];
    if (
      tags !== undefined &&
      (!Array.isArray(tags) || ![...tags].every(label) || new Set(tags).size !== tags.length)
    ) {
      throw new Error('Invalid tags');
    }
    const request = record(scenario['request']);
    if (
      !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(
        String(request['method']),
      ) ||
      typeof request['path'] !== 'string' ||
      !/^\/(?!\/)(?:[a-z0-9._~!$&'()*+,;=:@/-]|%[a-f0-9]{2})*$/i.test(request['path']) ||
      /(?:^|\/):[^/]+/.test(request['path']) ||
      !json(request['body'])
    ) {
      throw new Error('Invalid request');
    }
    if (request['match'] !== undefined) {
      const hint = record(record(request['match'])['bodyContains']);
      if (!json(hint)) throw new Error('Invalid matching rules');
    }
    const response = record(scenario['response']);
    const status = response['status'];
    if (
      typeof status !== 'number' ||
      !Number.isInteger(status) ||
      status < 100 ||
      status > 599 ||
      !json(response['body'])
    ) {
      throw new Error('Invalid response');
    }
    if (response['headers'] !== undefined) {
      const contentType = record(response['headers'])['content-type'];
      if (
        typeof contentType !== 'string' ||
        !/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|$)/i.test(contentType)
      ) {
        throw new Error('Invalid response headers');
      }
    }
  }
  return value as Catalog;
}

export const displayTitle = (scenario: Scenario) => scenario.title ?? scenario.id;
export const compareText = (a: string, b: string) =>
  a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0);
export const values = (items: (string | undefined)[]) =>
  [...new Set(items.filter((s): s is string => s !== undefined))].sort(compareText);
export function options(scenarios: Scenario[], category = '') {
  return {
    categories: values(scenarios.map((s) => s.category)),
    groups: values(
      scenarios.filter((s) => !category || s.category === category).map((s) => s.group),
    ),
    tags: values(scenarios.flatMap((s) => s.tags ?? [])),
    statuses: [...new Set(scenarios.map((s) => s.response.status))]
      .sort((a, b) => a - b)
      .map(String),
  };
}
export function normalizeFilters(filters: Filters, scenarios: Scenario[]): Filters {
  const available = options(scenarios);
  const category = available.categories.includes(filters.category) ? filters.category : '';
  return {
    q: filters.q,
    category,
    group: options(scenarios, category).groups.includes(filters.group) ? filters.group : '',
    tag: available.tags.includes(filters.tag) ? filters.tag : '',
    status: available.statuses.includes(filters.status) ? filters.status : '',
  };
}
export function filterScenarios(scenarios: Scenario[], filters: Filters): Scenario[] {
  const terms = filters.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return scenarios
    .filter((s) => {
      const text = [
        displayTitle(s),
        s.description,
        s.id,
        s.category,
        s.group,
        ...(s.tags ?? []),
        s.request.method,
        s.request.path,
      ]
        .join(' ')
        .toLocaleLowerCase();
      return (
        (!filters.category || s.category === filters.category) &&
        (!filters.group || s.group === filters.group) &&
        (!filters.tag || s.tags?.includes(filters.tag)) &&
        (!filters.status || String(s.response.status) === filters.status) &&
        terms.every((term) => text.includes(term))
      );
    })
    .sort((a, b) => compareText(displayTitle(a), displayTitle(b)) || compareText(a.id, b.id));
}
export interface ScenarioGroup {
  name: string | null;
  scenarios: Scenario[];
}
export interface ScenarioCategory {
  name: string | null;
  count: number;
  groups: ScenarioGroup[];
}
export function groupScenarios(scenarios: Scenario[]): ScenarioCategory[] {
  const categories = new Map<string | null, Map<string | null, Scenario[]>>();
  for (const scenario of scenarios) {
    const category = scenario.category ?? null;
    const group = scenario.group ?? null;
    if (!categories.has(category)) categories.set(category, new Map());
    const groups = categories.get(category)!;
    groups.set(group, [...(groups.get(group) ?? []), scenario]);
  }
  return [...categories]
    .sort(([a], [b]) => compareText(a ?? 'Uncategorized', b ?? 'Uncategorized'))
    .map(([name, groups]) => ({
      name,
      count: [...groups.values()].reduce((n, items) => n + items.length, 0),
      groups: [...groups]
        .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : compareText(a, b)))
        .map(([name, scenarios]) => ({ name, scenarios })),
    }));
}
export function statusLabel(status: number): string {
  const labels = ['Informational', 'Success', 'Redirect', 'Client error', 'Server error'];
  return `${status} · ${labels[Math.floor(status / 100) - 1]}`;
}
