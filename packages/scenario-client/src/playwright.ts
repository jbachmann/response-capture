import type {
  Fixtures,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  Route,
} from '@playwright/test';
import { ScenarioCatalog, type CatalogSource, type ScenarioExample } from './catalog.js';
import {
  ReplaySession,
  type ReplayPolicy,
  type ReplayBinding,
  type ScenarioReferences,
  type ScenarioHandles,
  type ObservedRequest,
} from './replay.js';
import { resolveRouting, type SystemRouting } from './routing.js';
import { loadSnapshot, startCatalogRun } from './node.js';

export interface SourceDeclaration extends CatalogSource {
  routing?: SystemRouting;
}
export type CatalogSources = Record<string, SourceDeclaration>;
export interface CatalogAccess<C extends string = string> {
  get(catalog: C, id: string): Promise<ScenarioExample>;
}
export interface ReplayControls<C extends string = string> {
  replace<const S extends ScenarioReferences<C>>(references: S): Promise<ScenarioHandles<S>>;
  requests(): readonly ObservedRequest[];
}
export interface ScenarioFixtures<C extends string = string> {
  catalogs: CatalogAccess<C>;
  replay: ReplayControls<C>;
  scenarioReplayPolicy: ReplayPolicy;
}
type BrowserFixtures = PlaywrightTestArgs & PlaywrightTestOptions;
type BrowserWorkerFixtures = PlaywrightWorkerArgs & PlaywrightWorkerOptions;

/** Compose with an existing native test.extend(); both capabilities are lazy. */
export function scenarioFixtures<const C extends CatalogSources>(options: {
  catalogs: C;
}): Fixtures<
  ScenarioFixtures<Extract<keyof C, string>>,
  {},
  BrowserFixtures,
  BrowserWorkerFixtures
> {
  type Alias = Extract<keyof C, string>;
  // Own configuration without fetching data or resolving browser-specific routing.
  const sources = structuredClone(options.catalogs);
  return {
    scenarioReplayPolicy: ['fallback', { option: true }],
    catalogs: async ({}, use, testInfo) => {
      const loaded = new Map<
        string,
        Promise<{ catalog: ScenarioCatalog; source: ScenarioExample['source'] }>
      >();
      await use({
        get: async (name, id) => {
          const source = Object.hasOwn(sources, name) ? sources[name] : undefined;
          if (!source) throw new Error(`Unknown catalog source: ${name}. Declare it in catalogs.`);
          let pending = loaded.get(name);
          if (!pending) {
            pending = (async () => {
              const { snapshot, path } = await loadSnapshot(source);
              await testInfo.attach(`catalog-${name}`, { path, contentType: 'application/json' });
              testInfo.annotations.push({
                type: 'catalog-source',
                description: JSON.stringify({ catalog: name, ...snapshot.source }),
              });
              return {
                catalog: new ScenarioCatalog(snapshot.catalog, source.systemName),
                source: { catalog: name, ...snapshot.source },
              };
            })();
            loaded.set(name, pending);
          }
          const result = await pending;
          return { ...result.catalog.get(id), source: { ...result.source } };
        },
      });
    },
    replay: async (
      { catalogs, page, baseURL, serviceWorkers, scenarioReplayPolicy },
      use,
      testInfo,
    ) => {
      if (serviceWorkers !== 'block')
        throw new Error(
          'Scenario replay requires use.serviceWorkers = "block" in Playwright configuration.',
        );
      if (!['fallback', 'error'].includes(scenarioReplayPolicy))
        throw new Error('scenarioReplayPolicy must be "fallback" or "error".');
      const bindings: Record<string, ReplayBinding> = Object.create(null);
      for (const [name, source] of Object.entries(sources)) {
        if (source.routing)
          bindings[name] = {
            systemName: source.systemName,
            routing: resolveRouting(source.routing, baseURL),
          };
        else if (scenarioReplayPolicy === 'error')
          throw new Error(
            `No routing for ${name} (${source.systemName}). Provide catalogs.${name}.routing for strict replay.`,
          );
      }
      const session = new ReplaySession(bindings, scenarioReplayPolicy);
      // One stable handler reads the current phase. Replacing scenarios never resets other routes.
      const handler = async (route: Route) => {
        const request = route.request();
        const result = session.handle({
          method: request.method(),
          url: request.url(),
          body: request.postData() ?? undefined,
        });
        if (result.kind === 'fallback') await route.fallback();
        else if (result.kind === 'abort') await route.abort();
        else
          await route.fulfill({
            status: result.status,
            headers: result.headers,
            body: result.body ?? undefined,
          });
      };
      const pattern = /.+/;
      await page.route(pattern, handler);
      try {
        await use({
          replace: async <const S extends ScenarioReferences<Alias>>(
            references: S,
          ): Promise<ScenarioHandles<S>> => {
            // Validate routing and aliases before any catalog fetching. Commit after all lookups succeed.
            for (const reference of Object.values(references)) {
              if (!Object.hasOwn(sources, reference.catalog))
                throw new Error(
                  `Unknown catalog source: ${reference.catalog}. Declare it in catalogs.`,
                );
              if (!bindings[reference.catalog])
                throw new Error(
                  `No routing for ${reference.catalog}. Provide catalogs.${reference.catalog}.routing for replay.`,
                );
            }
            const examples = Object.fromEntries(
              await Promise.all(
                Object.entries(references).map(
                  async ([name, reference]) =>
                    [name, await catalogs.get(reference.catalog, reference.id)] as const,
                ),
              ),
            );
            return session.replace(examples) as ScenarioHandles<S>;
          },
          requests: () => session.requests(),
        });
        session.verify();
      } finally {
        try {
          if (!page.isClosed()) await page.unroute(pattern, handler);
        } finally {
          await testInfo.attach('catalog-requests', {
            body: JSON.stringify(session.diagnostics(), null, 2),
            contentType: 'application/json',
          });
        }
      }
    },
  };
}

/** Export the returned function from a globalSetup module; it also returns teardown. */
export function scenarioGlobalSetup(options: { outputDirectory: string }) {
  return async () => {
    const run = await startCatalogRun(options);
    return () => run.close();
  };
}
