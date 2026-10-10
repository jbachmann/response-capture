import { bodyContains, type Json, type Scenario } from '@response-capture/contracts/scenarios';
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { NetworkFixture } from '@msw/playwright';
import { ScenarioCatalog, type CatalogSnapshot } from './catalog';
import type { SystemRouting } from './systems';

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
export interface LoadedSource {
  snapshot: CatalogSnapshot;
  routing: SystemRouting;
}
export interface ScenarioReference<C extends string = string> {
  catalog: C;
  id: string;
}
export type ScenarioReferences<C extends string = string> = Record<string, ScenarioReference<C>>;
export interface ScenarioHandle {
  readonly id: string;
  readonly request: Scenario['request'];
  readonly response: Scenario['response'];
  readonly source: CatalogSnapshot['source'] & { catalog: string };
  calls(): readonly ObservedRequest[];
  assertUsed(): void;
}
export type ScenarioHandles<S> = { readonly [K in keyof S]: ScenarioHandle };
export interface MockControls<C extends string = string> {
  replaceScenarios<const S extends ScenarioReferences<C>>(references: S): ScenarioHandles<S>;
  requests(): readonly ObservedRequest[];
}
interface Selection {
  name: string;
  catalog: string;
  scenario: Scenario;
  source: LoadedSource;
  url: string;
}
interface Phase {
  selections: Selection[];
  used: Set<string>;
}

function isWithin(path: string, root: string): boolean {
  const normalized = root.replace(/\/+$/, '') || '/';
  return normalized === '/' || path === normalized || path.startsWith(`${normalized}/`);
}
function protectedRequest(url: URL, routing: SystemRouting): boolean {
  return (
    url.origin === routing.origin &&
    routing.protectedPaths.some((path) =>
      isWithin(url.pathname, `${routing.pathPrefix ?? ''}${path}`),
    )
  );
}

/** One session per test. Each phase replays exchanges without inventing backend state. */
export class ScenarioSession implements MockControls {
  private readonly history: ObservedRequest[] = [];
  private readonly violations: string[] = [];
  private readonly phases: Phase[] = [];
  private readonly catalogs: ReadonlyMap<string, ScenarioCatalog>;
  private readonly uiOrigin: string;

  constructor(
    private readonly sources: Readonly<Record<string, LoadedSource>>,
    baseUrl: string,
    private readonly network: Pick<NetworkFixture, 'resetHandlers'>,
  ) {
    this.uiOrigin = new URL(baseUrl).origin;
    this.catalogs = new Map(
      Object.entries(sources).map(([name, source]) => [
        name,
        new ScenarioCatalog(source.snapshot.catalog, source.snapshot.source.systemName),
      ]),
    );
    this.network.resetHandlers(this.boundary());
  }

  replaceScenarios<const S extends ScenarioReferences>(references: S): ScenarioHandles<S> {
    const selections = Object.entries(references).map(([name, reference]): Selection => {
      const source = this.sources[reference.catalog];
      const catalog = this.catalogs.get(reference.catalog);
      if (!source || !catalog)
        throw new Error(`Unknown catalog source: ${reference.catalog}. Declare it in catalogs.`);
      const scenario = catalog.get(reference.id);
      const url = new URL(
        `${source.routing.pathPrefix ?? ''}${scenario.request.path}`,
        source.routing.origin,
      ).href;
      if (!protectedRequest(new URL(url), source.routing)) {
        throw new Error(
          `${reference.catalog}/${reference.id}: route ${url} is outside its protected API paths.`,
        );
      }
      return { name, catalog: reference.catalog, scenario, source, url };
    });
    const routes = new Map<string, Selection>();
    for (const selection of selections) {
      const route = `${selection.scenario.request.method} ${selection.url}`;
      const existing = routes.get(route);
      if (existing)
        throw new Error(
          `Ambiguous active scenarios for ${route}: ${existing.catalog}/${existing.scenario.id} (${existing.name}) and ${selection.catalog}/${selection.scenario.id} (${selection.name}). Select one per phase.`,
        );
      routes.set(route, selection);
    }
    const phase: Phase = { selections, used: new Set() };
    this.phases.push(phase);
    const phaseNumber = this.phases.length;
    this.network.resetHandlers(
      ...selections.map((selection) => this.handler(selection, phase, phaseNumber)),
      this.boundary(),
    );
    return Object.fromEntries(
      selections.map((selection) => {
        const { scenario, catalog, source, name } = selection;
        const handle: ScenarioHandle = {
          id: scenario.id,
          // Example data is independent of the immutable handler recording.
          request: structuredClone(scenario.request),
          response: structuredClone(scenario.response),
          source: { catalog, ...source.snapshot.source },
          calls: () =>
            structuredClone(
              this.history.filter(
                (request) =>
                  request.matched &&
                  request.catalog === catalog &&
                  request.scenarioId === scenario.id,
              ),
            ),
          assertUsed: () => {
            if (!phase.used.has(name))
              throw new Error(
                `Unused scenario in phase ${phaseNumber}: ${catalog}/${scenario.id} (${name})`,
              );
          },
        };
        return [name, handle];
      }),
    ) as ScenarioHandles<S>;
  }

  requests(): readonly ObservedRequest[] {
    return structuredClone(this.history);
  }

  verify(): void {
    const unused = this.phases.flatMap((phase, index) =>
      phase.selections
        .filter((selection) => !phase.used.has(selection.name))
        .map(
          (selection) =>
            `Unused scenario in phase ${index + 1}: ${selection.catalog}/${selection.scenario.id} (${selection.name})`,
        ),
    );
    const errors = [...this.violations, ...unused];
    if (errors.length) throw new Error(`Catalog mock failures:\n${errors.join('\n')}`);
  }

  diagnostics() {
    return {
      sources: Object.fromEntries(
        Object.entries(this.sources).map(([name, source]) => [
          name,
          { ...source.snapshot.source, routing: source.routing },
        ]),
      ),
      phases: this.phases.map((phase, index) => ({
        phase: index + 1,
        selections: phase.selections.map(({ name, catalog, scenario }) => ({
          name,
          catalog,
          id: scenario.id,
          used: phase.used.has(name),
        })),
      })),
      requests: this.requests(),
      violations: [...this.violations],
    };
  }

  private handler(selection: Selection, phase: Phase, phaseNumber: number): RequestHandler {
    const { scenario, catalog, source } = selection;
    return http.all('*', async ({ request }) => {
      const url = new URL(request.url);
      if (
        request.method !== scenario.request.method ||
        `${url.origin}${url.pathname}` !== selection.url
      )
        return undefined;
      const observed = await this.observe(
        request,
        phaseNumber,
        catalog,
        source.snapshot.source.systemName,
        scenario.id,
      );
      if (!observed) return HttpResponse.error();
      if (url.search)
        return this.reject(`Catalog v1 does not model queries: ${request.method} ${request.url}`);
      const hint = scenario.request.match?.bodyContains;
      if (hint && !bodyContains(observed.body, hint)) {
        return this.reject(
          `${catalog}/${scenario.id}: bodyContains ${JSON.stringify(hint)} did not match ${JSON.stringify(observed.body)}`,
        );
      }
      observed.matched = true;
      phase.used.add(selection.name);
      const { status, headers, body } = scenario.response;
      if (request.method === 'HEAD' || [204, 205, 304].includes(status))
        return new HttpResponse(null, { status, headers });
      return HttpResponse.json(body, { status, headers });
    });
  }

  private boundary(): RequestHandler {
    return http.all('*', async ({ request }) => {
      const url = new URL(request.url);
      const sources = Object.entries(this.sources).filter(([, source]) =>
        protectedRequest(url, source.routing),
      );
      if (sources.length) {
        await this.observe(
          request,
          this.phases.length,
          sources[0][0],
          sources[0][1].snapshot.source.systemName,
        );
        return this.reject(
          `Unmatched API request: ${request.method} ${request.url} (sources: ${sources.map(([name]) => name).join(', ')})`,
        );
      }
      // External photos consistently exercise the app's photo fallback.
      if (url.origin !== this.uiOrigin) return HttpResponse.error();
      // Adapter 0.4 uses getResponse(): no response lets Playwright continue the request.
      return undefined;
    });
  }

  private async observe(
    request: Request,
    phase: number,
    catalog?: string,
    systemName?: string,
    scenarioId?: string,
  ): Promise<ObservedRequest | undefined> {
    const text = await request.text();
    let body: Json = null;
    let rawBody: string | undefined;
    try {
      body = text ? (JSON.parse(text) as Json) : null;
    } catch {
      this.violations.push(`Invalid JSON request body: ${request.method} ${request.url}: ${text}`);
      rawBody = text;
    }
    const observed = {
      method: request.method,
      url: request.url,
      body,
      rawBody,
      catalog,
      systemName,
      scenarioId,
      phase,
      matched: false,
    };
    this.history.push(observed);
    return rawBody === undefined ? observed : undefined;
  }
  private reject(message: string) {
    this.violations.push(message);
    return HttpResponse.error();
  }
}
