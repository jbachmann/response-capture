export interface SystemRouting {
  /** 'ui' resolves to the test's baseURL origin. */
  origin: string;
  pathPrefix?: string;
  /** Recorded API roots, before applying pathPrefix. */
  protectedPaths: readonly string[];
}

export function resolveRouting(routing: SystemRouting, baseURL?: string): SystemRouting {
  if (routing.origin === 'ui' && !baseURL)
    throw new Error('Routing origin "ui" requires a baseURL.');
  const url = new URL(routing.origin === 'ui' ? new URL(baseURL!).origin : routing.origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash)
    throw new Error(`Routing origin must be an HTTP(S) origin: ${routing.origin}`);
  const prefix = routing.pathPrefix?.replace(/\/+$/, '') ?? '';
  for (const path of [prefix || '/', ...routing.protectedPaths]) {
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      /[?#]/.test(path) ||
      new URL(path, url).pathname !== path
    )
      throw new Error(`Routing paths must be concrete, normalized pathnames: ${path}`);
  }
  if (!routing.protectedPaths.length)
    throw new Error('Routing requires at least one protected API path.');
  return { origin: url.origin, pathPrefix: prefix, protectedPaths: [...routing.protectedPaths] };
}

export function protectedRequest(url: URL, routing: SystemRouting): boolean {
  return (
    url.origin === routing.origin &&
    routing.protectedPaths.some((path) => {
      const root = `${routing.pathPrefix ?? ''}${path}`.replace(/\/+$/, '') || '/';
      return root === '/' || url.pathname === root || url.pathname.startsWith(`${root}/`);
    })
  );
}
