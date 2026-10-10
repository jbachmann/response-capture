import type { Scenario } from '@response-capture/contracts/scenarios';
export interface Filters {
  q: string;
  category: string;
  group: string;
  tag: string;
  status: string;
}
export const emptyFilters: Filters = { q: '', category: '', group: '', tag: '', status: '' };

export const displayTitle = (scenario: Scenario) => scenario.title ?? scenario.id;
export const compareText = (a: string, b: string) =>
  a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0);
export const uniqueSortedLabels = (items: (string | undefined)[]) =>
  [...new Set(items.filter((label): label is string => label !== undefined))].sort(compareText);
export function filterOptions(scenarios: Scenario[], category = '') {
  return {
    categories: uniqueSortedLabels(scenarios.map((scenario) => scenario.category)),
    groups: uniqueSortedLabels(
      scenarios
        .filter((scenario) => !category || scenario.category === category)
        .map((scenario) => scenario.group),
    ),
    tags: uniqueSortedLabels(scenarios.flatMap((scenario) => scenario.tags ?? [])),
    statuses: [...new Set(scenarios.map((scenario) => scenario.response.status))]
      .sort((a, b) => a - b)
      .map(String),
  };
}
export function normalizeFilters(filters: Filters, scenarios: Scenario[]): Filters {
  const available = filterOptions(scenarios);
  const category = available.categories.includes(filters.category) ? filters.category : '';
  return {
    q: filters.q,
    category,
    group: filterOptions(scenarios, category).groups.includes(filters.group) ? filters.group : '',
    tag: available.tags.includes(filters.tag) ? filters.tag : '',
    status: available.statuses.includes(filters.status) ? filters.status : '',
  };
}
export function filterScenarios(scenarios: Scenario[], filters: Filters): Scenario[] {
  const terms = filters.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return scenarios
    .filter((scenario) => {
      const text = [
        displayTitle(scenario),
        scenario.description,
        scenario.id,
        scenario.category,
        scenario.group,
        ...(scenario.tags ?? []),
        scenario.request.method,
        scenario.request.path,
      ]
        .join(' ')
        .toLocaleLowerCase();
      return (
        (!filters.category || scenario.category === filters.category) &&
        (!filters.group || scenario.group === filters.group) &&
        (!filters.tag || scenario.tags?.includes(filters.tag)) &&
        (!filters.status || String(scenario.response.status) === filters.status) &&
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
