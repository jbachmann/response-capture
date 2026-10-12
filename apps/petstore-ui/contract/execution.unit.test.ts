import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import type { Json, Scenario } from '@response-capture/contracts/scenarios';
import { fixtureCatalog } from './fixtures';

function object(value: Json): Record<string, Json> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected fixture object');
  return value;
}

it('runs all explicit contracts offline and reports representative incompatibilities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'petstore-contract-'));
  try {
    const workspace = fileURLToPath(new URL('../', import.meta.url));
    const require = createRequire(import.meta.url);
    const runner = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
    const filename = join(directory, 'catalog.json');
    const env = {
      ...process.env,
      CONTRACT_CATALOG_PATH: relative(workspace, filename),
      CATALOG_API_URL: 'invalid',
      CATALOG_SELECTOR: 'ignored',
    };
    const execute = promisify(execFile);
    const run = () =>
      execute(process.execPath, [runner, 'run', '--config', 'contract/vitest.config.ts'], {
        cwd: workspace,
        env,
        timeout: 20_000,
      });
    await writeFile(filename, JSON.stringify(fixtureCatalog()));
    expect((await run()).stdout).toContain('30 passed');
    const cases: [string, string, (scenario: Scenario) => void][] = [
      [
        'pet.list.success',
        'request.method',
        (s) => {
          s.request.method = 'POST';
        },
      ],
      [
        'pet.read.success',
        'request.path',
        (s) => {
          s.request.path = '/pets/7';
        },
      ],
      [
        'store.order.create.defaults',
        'response.status',
        (s) => {
          s.response.status = 200;
        },
      ],
      [
        'pet.filter.by-status.success',
        'request.query',
        (s) => {
          delete s.request.query;
        },
      ],
      [
        'pet.read.success',
        'response.body.category.id',
        (s) => {
          object(object(s.response.body)['category'])['id'] = 'nine';
        },
      ],
      [
        'pet.read.success',
        'response.body.status',
        (s) => {
          object(s.response.body)['status'] = 'lost';
        },
      ],
      [
        'store.order.read.persisted',
        'response.body.shipDate',
        (s) => {
          object(s.response.body)['shipDate'] = null;
        },
      ],
    ];
    for (const [id, field, mutate] of cases) {
      const catalog = fixtureCatalog();
      mutate(catalog.scenarios.find((s) => s.id === id)!);
      await writeFile(filename, JSON.stringify(catalog));
      await expect(run()).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining(field),
      });
    }
    const missing = fixtureCatalog();
    missing.scenarios = missing.scenarios.filter((s) => s.id !== 'pet.list.success');
    await writeFile(filename, JSON.stringify(missing));
    await expect(run()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/petstore-api\/pet.list.success.*source.*sha256.*scenario.id/),
    });

    const compatible = fixtureCatalog();
    function extend(value: Json): void {
      if (Array.isArray(value)) {
        value.reverse();
        value.forEach(extend);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(extend);
        value['extraField'] = { future: true };
        if ('name' in value) value['name'] = 'Changed example';
        if ('id' in value) value['id'] = 12345;
        if ('shipDate' in value) value['shipDate'] = '2040-12-31T23:59:59+01:00';
      }
    }
    for (const scenario of compatible.scenarios) {
      extend(scenario.request.body);
      extend(scenario.response.body);
      if (/\/\d+$/.test(scenario.request.path))
        scenario.request.path = scenario.request.path.replace(/\d+$/, '54321');
    }
    compatible.scenarios.push({
      schemaVersion: 1,
      id: 'unrelated',
      request: { method: 'PATCH', path: '/other', body: null },
      response: { status: 202, body: null },
    });
    await writeFile(filename, JSON.stringify(compatible));
    expect((await run()).stdout).toContain('30 passed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
