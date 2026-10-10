import type { CatalogSource } from './catalog';

export interface SystemRouting {
  /** 'ui' resolves to Playwright's baseURL origin. */
  origin: string;
  pathPrefix?: string;
  /** Recorded API roots, before applying pathPrefix. '/' protects the entire origin/prefix. */
  protectedPaths: readonly string[];
}
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
  const url = new URL(routing.origin === 'ui' ? new URL(uiUrl).origin : routing.origin);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Routing origin must be an HTTP(S) origin: ${routing.origin}`);
  }
  const prefix = routing.pathPrefix?.replace(/\/+$/, '') ?? '';
  for (const path of [prefix || '/', ...routing.protectedPaths]) {
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      /[?#]/.test(path) ||
      new URL(path, url).pathname !== path
    ) {
      throw new Error(`Routing paths must be concrete, normalized pathnames: ${path}`);
    }
  }
  if (!routing.protectedPaths.length)
    throw new Error('Routing requires at least one protected API path.');
  return { origin: url.origin, pathPrefix: prefix, protectedPaths: [...routing.protectedPaths] };
}
