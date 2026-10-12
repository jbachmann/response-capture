import { inject } from 'vitest';
import type { TestProject } from 'vitest/node';
import type { CatalogSnapshot } from '@response-capture/scenario-client';
import { prepareContractRun, type ContractRunOptions } from './node.js';

export type { ContractCatalogSource, ContractRunOptions } from './node.js';

declare module 'vitest' {
  interface ProvidedContext {
    scenarioContractCatalogs: Record<string, CatalogSnapshot>;
  }
}

/** Export the returned function from a consumer global setup module. */
export function contractGlobalSetup(options: ContractRunOptions) {
  return async (project: Pick<TestProject, 'provide'>): Promise<void> => {
    const run = await prepareContractRun(options);
    project.provide('scenarioContractCatalogs', run.catalogs);
    for (const [name, snapshot] of Object.entries(run.catalogs)) {
      console.info(
        `Contract catalog ${name}: ${snapshot.source.url}\nsha256: ${snapshot.source.sha256}`,
      );
    }
    console.info(`Contract snapshots: ${run.directory}`);
  };
}

/** Every lookup returns an independent copy of the one run snapshot. */
export function getContractCatalog(name: string): CatalogSnapshot {
  const catalogs = inject('scenarioContractCatalogs');
  if (!catalogs) {
    throw new Error(
      'Configure contractGlobalSetup in Vitest global setup before calling getContractCatalog',
    );
  }
  if (!Object.hasOwn(catalogs, name)) {
    throw new Error(
      `Unknown contract catalog alias ${JSON.stringify(name)}; available catalogs: ${Object.keys(catalogs).join(', ')}`,
    );
  }
  return structuredClone(catalogs[name]);
}
