import {
  resolveRouting as resolveSystemRouting,
  type CatalogSource,
  type SystemRouting,
} from '@response-capture/scenario-client';
export type { SystemRouting } from '@response-capture/scenario-client';

export interface SourceDeclaration extends CatalogSource {
  routing?: SystemRouting;
}
export const systems: Readonly<Record<string, SystemRouting>> = {
  'petstore-api': { origin: 'ui', protectedPaths: ['/pet', '/store', '/training'] },
};

export function resolveRouting(source: SourceDeclaration, uiUrl: string): SystemRouting {
  const routing = source.routing ?? systems[source.systemName];
  if (!routing)
    throw new Error(
      `No routing for ${source.systemName}. Register it in support/systems.ts or provide catalogs.<name>.routing.`,
    );
  return resolveSystemRouting(routing, uiUrl);
}
