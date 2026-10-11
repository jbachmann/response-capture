import { bodyContains, validateScenario, type Json } from '@response-capture/contracts/scenarios';
import type { ScenarioExample } from './catalog.js';
import { protectedRequest, resolveRouting, type SystemRouting } from './routing.js';

export type ReplayPolicy = 'fallback' | 'error';
export interface ScenarioReference<C extends string = string> {
  catalog: C;
  id: string;
}
export type ScenarioReferences<C extends string = string> = Record<string, ScenarioReference<C>>;
export interface ReplayBinding {
  systemName: string;
  routing: SystemRouting;
}
export interface ReplayRequest {
  method: string;
  url: string;
  body?: string;
}
export interface ObservedRequest {
  method: string;
  url: string;
  body: Json;
  rawBody?: string;
  catalog?: string;
  systemName?: string;
  scenarioId?: string;
  phase: number;
  matched: boolean;
}
export interface ScenarioHandle extends ScenarioExample {
  calls(): readonly ObservedRequest[];
  assertUsed(): void;
}
export type ScenarioHandles<S> = { readonly [K in keyof S]: ScenarioHandle };
export type ReplayResult =
  | { kind: 'fallback' }
  | { kind: 'abort' }
  | { kind: 'response'; status: number; headers: Record<string, string>; body: string | null };
interface Selection {
  name: string;
  example: ScenarioExample;
  url: string;
}
interface Phase {
  selections: Selection[];
  used: Set<string>;
}

/** Transport-independent state for one test. Replacements never invent backend state. */
export class ReplaySession {
  private readonly history: ObservedRequest[] = [];
  private readonly violations: string[] = [];
  private readonly phases: Phase[] = [];
  private readonly bindings: Readonly<Record<string, ReplayBinding>>;

  constructor(
    bindings: Readonly<Record<string, ReplayBinding>>,
    private readonly policy: ReplayPolicy = 'fallback',
  ) {
    this.bindings = Object.fromEntries(
      Object.entries(bindings).map(([name, binding]) => [
        name,
        {
          systemName: binding.systemName,
          routing: resolveRouting(binding.routing),
        },
      ]),
    );
  }

  replace<const S extends Record<string, ScenarioExample>>(examples: S): ScenarioHandles<S> {
    const selections = Object.entries(examples).map(([name, value]): Selection => {
      const example = structuredClone(value);
      const { source, ...scenario } = example;
      validateScenario(scenario);
      const binding = Object.hasOwn(this.bindings, source.catalog)
        ? this.bindings[source.catalog]
        : undefined;
      if (!binding)
        throw new Error(`Unknown catalog source: ${source.catalog}. Declare it in catalogs.`);
      if (binding.systemName !== source.systemName)
        throw new Error(`Scenario source does not match catalog ${source.catalog}.`);
      const url = new URL(
        `${binding.routing.pathPrefix ?? ''}${scenario.request.path}`,
        binding.routing.origin,
      ).href;
      if (!protectedRequest(new URL(url), binding.routing))
        throw new Error(
          `${source.catalog}/${scenario.id}: route ${url} is outside its protected API paths.`,
        );
      return { name, example, url };
    });
    const routes = new Map<string, Selection>();
    for (const selection of selections) {
      const route = `${selection.example.request.method} ${selection.url}`;
      const existing = routes.get(route);
      if (existing)
        throw new Error(
          `Ambiguous active scenarios for ${route}: ${existing.example.source.catalog}/${existing.example.id} (${existing.name}) and ${selection.example.source.catalog}/${selection.example.id} (${selection.name}). Select one per phase.`,
        );
      routes.set(route, selection);
    }
    // Commit only after the entire replacement has been validated.
    const phase: Phase = { selections, used: new Set() };
    this.phases.push(phase);
    const phaseNumber = this.phases.length;
    const handles: Record<string, ScenarioHandle> = Object.fromEntries(
      selections.map(({ name, example }) => [
        name,
        {
          ...structuredClone(example),
          calls: () =>
            structuredClone(
              this.history.filter(
                (request) =>
                  request.matched &&
                  request.catalog === example.source.catalog &&
                  request.scenarioId === example.id,
              ),
            ),
          assertUsed: () => {
            if (!phase.used.has(name))
              throw new Error(
                `Unused scenario in phase ${phaseNumber}: ${example.source.catalog}/${example.id} (${name})`,
              );
          },
        } satisfies ScenarioHandle,
      ]),
    );
    return handles as ScenarioHandles<S>;
  }

  handle(request: ReplayRequest): ReplayResult {
    const url = new URL(request.url);
    const phase = this.phases.at(-1);
    const selection = phase?.selections.find(
      ({ example, url: selectedURL }) =>
        request.method === example.request.method && `${url.origin}${url.pathname}` === selectedURL,
    );
    if (selection && phase) {
      const { example, name } = selection;
      const observed = this.observe(
        request,
        example.source.catalog,
        example.source.systemName,
        example.id,
      );
      if (observed.rawBody !== undefined) return { kind: 'abort' };
      if (url.search)
        return this.reject(`Catalog v1 does not model queries: ${request.method} ${request.url}`);
      const hint = example.request.match?.bodyContains;
      if (hint && !bodyContains(observed.body, hint))
        return this.reject(
          `${example.source.catalog}/${example.id}: bodyContains ${JSON.stringify(hint)} did not match ${JSON.stringify(observed.body)}`,
        );
      observed.matched = true;
      phase.used.add(name);
      const { status, headers, body } = example.response;
      const empty = request.method === 'HEAD' || [204, 205, 304].includes(status);
      return {
        kind: 'response',
        status,
        headers: headers ? { ...headers } : empty ? {} : { 'content-type': 'application/json' },
        body: empty ? null : JSON.stringify(body),
      };
    }
    const guarded = Object.entries(this.bindings).filter(([, binding]) =>
      protectedRequest(url, binding.routing),
    );
    if (this.policy === 'error' && guarded.length) {
      this.observe(request, guarded[0][0], guarded[0][1].systemName);
      return this.reject(
        `Unmatched API request: ${request.method} ${request.url} (sources: ${guarded.map(([name]) => name).join(', ')})`,
      );
    }
    return { kind: 'fallback' };
  }

  requests(): readonly ObservedRequest[] {
    return structuredClone(this.history);
  }

  verify(): void {
    const unused = this.phases.flatMap((phase, index) =>
      phase.selections
        .filter((selection) => !phase.used.has(selection.name))
        .map(
          ({ name, example }) =>
            `Unused scenario in phase ${index + 1}: ${example.source.catalog}/${example.id} (${name})`,
        ),
    );
    const errors = [...this.violations, ...unused];
    if (errors.length) throw new Error(`Catalog mock failures:\n${errors.join('\n')}`);
  }

  diagnostics() {
    return {
      bindings: structuredClone(this.bindings),
      phases: this.phases.map((phase, index) => ({
        phase: index + 1,
        selections: phase.selections.map(({ name, example }) => ({
          name,
          catalog: example.source.catalog,
          id: example.id,
          source: { ...example.source },
          used: phase.used.has(name),
        })),
      })),
      requests: this.requests(),
      violations: [...this.violations],
    };
  }

  private observe(
    request: ReplayRequest,
    catalog: string,
    systemName: string,
    scenarioId?: string,
  ): ObservedRequest {
    const text = request.body ?? '';
    let body: Json = null;
    let rawBody: string | undefined;
    try {
      body = text ? (JSON.parse(text) as Json) : null;
    } catch {
      this.violations.push(`Invalid JSON request body: ${request.method} ${request.url}: ${text}`);
      rawBody = text;
    }
    const observed: ObservedRequest = {
      method: request.method,
      url: request.url,
      body,
      rawBody,
      catalog,
      systemName,
      scenarioId,
      phase: this.phases.length,
      matched: false,
    };
    this.history.push(observed);
    return observed;
  }

  private reject(message: string): ReplayResult {
    this.violations.push(message);
    return { kind: 'abort' };
  }
}
