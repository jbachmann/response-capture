import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test, expect } from '@playwright/test';
import { createNetworkFixture, type NetworkFixture } from '@msw/playwright';
import { getResponse, RequestHandler } from 'msw';
import type { Catalog, Scenario } from '@response-capture/contracts/scenarios';
import { fetchCatalog, readCatalogSnapshot, ScenarioCatalog } from './support/catalog';
import { ScenarioSession } from './support/scenarios';

const baseURL = 'http://localhost:4202';

function example(id = 'create'): Scenario {
  return {
    schemaVersion: 1,
    id,
    request: {
      method: 'POST',
      path: '/pet',
      body: { name: 'Milo' },
      match: { bodyContains: { name: 'Milo' } },
    },
    response: {
      status: 201,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { id: 1, name: 'Milo' },
    },
  };
}

function harness(...scenarios: Scenario[]) {
  let handlers: RequestHandler[] = [];
  const catalog = new ScenarioCatalog({ catalogVersion: 1, scenarios });
  const session = new ScenarioSession(catalog, baseURL, {
    resetHandlers: (...next) => {
      handlers = next.filter(
        (handler): handler is RequestHandler => handler instanceof RequestHandler,
      );
    },
  });
  return {
    catalog,
    session,
    send: (path: string, init?: RequestInit) =>
      getResponse(handlers, new Request(`${baseURL}${path}`, init)),
  };
}

test('load one selected catalog, encode its selector, and preserve a verified snapshot', async ({}, testInfo) => {
  let fetches = 0;
  let requestedUrl = '';
  const remote: Catalog = { catalogVersion: 1, scenarios: [example()] };
  const snapshot = await fetchCatalog('http://catalog.test/', 'feature/pets', async (url) => {
    fetches++;
    requestedUrl = String(url);
    return Response.json(remote);
  });
  expect(requestedUrl).toBe('http://catalog.test/catalogs/petstore-api/feature%2Fpets');
  expect(snapshot.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  const path = testInfo.outputPath('catalog.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(snapshot));
  remote.scenarios = [];
  const [first, retry] = await Promise.all([readCatalogSnapshot(path), readCatalogSnapshot(path)]);
  expect(first).toEqual(snapshot);
  expect(retry).toEqual(snapshot);
  expect(fetches).toBe(1);
  snapshot.catalog.scenarios = [];
  await writeFile(path, JSON.stringify(snapshot));
  await expect(readCatalogSnapshot(path)).rejects.toThrow('digest');
});

test('default unset or blank selectors to latest and preserve snapshot provenance', async ({}, testInfo) => {
  const path = testInfo.outputPath('latest-catalog.json');
  await mkdir(dirname(path), { recursive: true });
  for (const selector of [undefined, '', ' \t ']) {
    let requestedUrl = '';
    const snapshot = await fetchCatalog('http://catalog.test/', selector, async (url) => {
      requestedUrl = String(url);
      return Response.json({ catalogVersion: 1, scenarios: [example()] });
    });
    expect(requestedUrl).toBe('http://catalog.test/catalogs/petstore-api');
    expect(snapshot.source.selector).toBeNull();
    await writeFile(path, JSON.stringify(snapshot));
    expect(await readCatalogSnapshot(path)).toEqual(snapshot);
  }
});

test('fail catalog loading for HTTP failures or invalid payloads', async () => {
  for (const status of [404, 500]) {
    await expect(
      fetchCatalog('http://catalog.test', 'main', async () => new Response('missing', { status })),
    ).rejects.toThrow(`HTTP ${status}`);
  }
  await expect(
    fetchCatalog('http://catalog.test', 'main', async () => {
      throw new Error('offline');
    }),
  ).rejects.toThrow('offline');
  await expect(
    fetchCatalog('http://catalog.test', 'main', async () => Response.json({ catalogVersion: 9 })),
  ).rejects.toThrow('catalogVersion');
  expect(
    () => new ScenarioCatalog({ catalogVersion: 1, scenarios: [example(), example()] }),
  ).toThrow('duplicate scenario ID');
});

test('reject unknown and ambiguous selections without replacing the existing phase', async () => {
  const { session, send } = harness(example(), example('alternative'));
  session.use('create');
  expect(() => session.use('unknown')).toThrow('Unknown petstore-api scenario ID: unknown');
  expect(() => session.use('create', 'alternative')).toThrow('Ambiguous active scenarios');
  expect(
    (await send('/pet', { method: 'POST', body: JSON.stringify({ name: 'Milo' }) }))?.status,
  ).toBe(201);
  session.verify();
});

test('honor matching hints without imposing an exact example-body constraint', async () => {
  const { session, send } = harness(example());
  session.use('create');
  const body = { name: 'Milo', status: 'available', photoUrls: [], tags: [] };
  const response = await send('/pet', { method: 'POST', body: JSON.stringify(body) });
  expect(response?.status).toBe(201);
  expect(response?.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(await response?.json()).toEqual(example().response.body);
  expect(session.calls('create')[0]?.body).toEqual(body);
  session.assertUsed('create');
  session.verify();
});

test('preserve matching violations and unused scenarios across phases', async () => {
  const replacement = {
    ...example('replacement'),
    request: { method: 'GET' as const, path: '/pet/1', body: null },
    response: { status: 200, body: null },
  };
  const { session, send } = harness(example(), replacement);
  session.use('create');
  expect((await send('/pet', { method: 'POST', body: '{"name":"Different"}' }))?.status).toBe(0);
  session.use('replacement');
  expect((await send('/pet/1'))?.status).toBe(200);
  expect(() => session.verify()).toThrow('bodyContains');
  expect(() => session.verify()).toThrow('Unused scenario in phase 1: create');
  expect(session.calls('create')).toEqual([]);
});

test('reject malformed request JSON and unmodeled query inputs', async () => {
  const { session, send } = harness(example());
  session.use('create');
  expect((await send('/pet', { method: 'POST', body: 'not JSON' }))?.status).toBe(0);
  expect(
    (await send('/pet?unexpected=value', { method: 'POST', body: '{"name":"Milo"}' }))?.status,
  ).toBe(0);
  expect(() => session.verify()).toThrow('Invalid JSON request body');
  expect(() => session.verify()).toThrow('does not model queries');
});

test('replace responses explicitly, retain prior calls, and return empty 204 bodies', async () => {
  const read: Scenario = {
    ...example('read'),
    request: { method: 'GET', path: '/pet/1', body: null },
    response: { status: 200, body: { id: 1 } },
  };
  const missing: Scenario = {
    ...read,
    id: 'missing',
    response: { status: 404, body: { message: 'missing' } },
  };
  const remove: Scenario = {
    ...read,
    id: 'delete',
    request: { method: 'DELETE', path: '/pet/1', body: null },
    response: { status: 204, body: null },
  };
  const { session, send } = harness(read, missing, remove);
  session.use('read');
  expect((await send('/pet/1'))?.status).toBe(200);
  session.use('delete');
  const response = await send('/pet/1', { method: 'DELETE' });
  expect(response?.status).toBe(204);
  expect(await response?.text()).toBe('');
  session.use('missing');
  expect((await send('/pet/1'))?.status).toBe(404);
  session.assertUsed('read', 'delete', 'missing');
  session.verify();
});

test('abort unmatched API paths and methods while allowing UI assets', async () => {
  const { session, send } = harness(example());
  session.use('create');
  for (const path of ['/pet', '/store/order', '/training/seed']) {
    expect((await send(path))?.status).toBe(0);
  }
  const asset = await send('/main.js');
  expect(asset).toBeUndefined();
  expect(() => session.verify()).toThrow('Unmatched API request');
});

test('match recorded paths literally rather than as MSW route patterns', async () => {
  const read: Scenario = {
    ...example('literal'),
    request: { method: 'GET', path: '/pet/literal*', body: null },
    response: { status: 200, body: 'literal response' },
  };
  const { session, send } = harness(read);
  session.use(read.id);
  expect(await (await send('/pet/literal*'))?.json()).toBe('literal response');
  expect((await send('/pet/literal-other'))?.status).toBe(0);
  expect(session.calls(read.id)).toHaveLength(1);
  expect(() => session.verify()).toThrow('Unmatched API request');
});

const browserTest = test.extend<{ network: NetworkFixture }>({ network: createNetworkFixture() });

browserTest(
  'the real Playwright adapter aborts unmatched API requests',
  async ({ network, page }) => {
    const session = new ScenarioSession(
      new ScenarioCatalog({ catalogVersion: 1, scenarios: [] }),
      baseURL,
      network,
    );
    await page.goto('/pets/new');
    const blocked = await page.evaluate(async () => {
      try {
        await fetch('/pet');
        return false;
      } catch {
        return true;
      }
    });
    expect(blocked).toBe(true);
    expect(() => session.verify()).toThrow('Unmatched API request: GET');
  },
);

for (const name of ['first parallel context', 'second parallel context']) {
  browserTest(`isolate handlers and history in the ${name}`, async ({ network, page }) => {
    const read: Scenario = {
      ...example('read'),
      request: { method: 'GET', path: '/pet/1', body: null },
      response: { status: 200, body: { name } },
    };
    const session = new ScenarioSession(
      new ScenarioCatalog({ catalogVersion: 1, scenarios: [read] }),
      baseURL,
      network,
    );
    session.use('read');
    await page.goto('/pets/new');
    const body: unknown = await page.evaluate(async () => (await fetch('/pet/1')).json());
    expect(body).toEqual({ name });
    expect(session.calls('read')).toHaveLength(1);
    session.verify();
  });
}
