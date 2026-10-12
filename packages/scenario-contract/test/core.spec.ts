import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { assertScenarioContract, type ScenarioContract } from '@response-capture/scenario-contract';
import { fixtureSnapshot } from './fixtures.js';

const request = z.looseObject({
  method: z.literal('GET'),
  path: z.literal('/widgets/7'),
  query: z.strictObject({ labels: z.array(z.string()).length(3) }),
  body: z.null(),
});
const response = z.looseObject({
  status: z.literal(200),
  body: z.looseObject({
    id: z.int().positive(),
    label: z.string(),
    details: z.looseObject({ enabled: z.boolean() }),
  }),
});

it('compares a selected example without imposing requirements on unrelated scenarios', () => {
  const snapshot = fixtureSnapshot();
  snapshot.catalog.scenarios.push({ ...snapshot.catalog.scenarios[0], id: 'unrelated' });
  expect(() =>
    assertScenarioContract(snapshot, 'widget.read', { request, response }),
  ).not.toThrow();
});
it('supports request-only and response-only comparisons', () => {
  const snapshot = fixtureSnapshot();
  snapshot.catalog.scenarios[0].response.status = 404;
  expect(() => assertScenarioContract(snapshot, 'widget.read', { request })).not.toThrow();
  snapshot.catalog.scenarios[0].request.method = 'DELETE';
  expect(() =>
    assertScenarioContract(snapshot, 'widget.read', {
      response: z.looseObject({ status: z.literal(404) }),
    }),
  ).not.toThrow();
});
it('checks error statuses without constraining error bodies', () => {
  const snapshot = fixtureSnapshot();
  snapshot.catalog.scenarios[0].response = { status: 404, body: null };
  expect(() =>
    assertScenarioContract(snapshot, 'widget.read', {
      response: z.looseObject({ status: z.literal(404) }),
    }),
  ).not.toThrow();
});
it('rejects missing scenario IDs and no-op comparisons with provenance', () => {
  const snapshot = fixtureSnapshot();
  expect(() => assertScenarioContract(snapshot, 'missing', { request })).toThrow(
    /widgets-api\/missing.*source.*sha256.*scenario.id/,
  );
  // @ts-expect-error At least one comparison schema is required.
  expect(() => assertScenarioContract(snapshot, 'widget.read', {})).toThrow(
    /contract.*at least one/,
  );
});
it('reports all failing fields across both comparison sides with provenance', () => {
  const snapshot = fixtureSnapshot();
  const scenario = snapshot.catalog.scenarios[0];
  scenario.request.method = 'POST';
  scenario.request.path = '/other';
  delete scenario.request.query;
  scenario.response = { status: 201, body: { id: '7', label: null, details: { enabled: 'true' } } };
  let message = '';
  try {
    assertScenarioContract(snapshot, 'widget.read', { request, response });
  } catch (error) {
    message = (error as Error).message;
  }
  for (const field of [
    'request.method',
    'request.path',
    'request.query',
    'response.status',
    'response.body.id',
    'response.body.label',
    'response.body.details.enabled',
  ]) {
    expect(message).toContain(field);
  }
  expect(message).toContain('widgets-api/widget.read');
  expect(message).toContain(snapshot.source.url);
  expect(message).toContain(snapshot.source.sha256);
});
it('allows extra payload fields when consumer schemas allow them', () => {
  const snapshot = fixtureSnapshot();
  snapshot.catalog.scenarios[0].response.body = {
    id: 12,
    label: 'Changed',
    details: { enabled: false, extra: true },
    extra: [1, 2],
  };
  expect(() => assertScenarioContract(snapshot, 'widget.read', { response })).not.toThrow();
});
it('preserves snapshots even when a refinement mutates input or parsing transforms output', () => {
  const snapshot = fixtureSnapshot();
  const original = structuredClone(snapshot);
  const mutating = z
    .looseObject({ path: z.string() })
    .refine((value) => {
      value.path = '/mutated';
      return true;
    })
    .transform(() => ({ replacement: true }));
  assertScenarioContract(snapshot, 'widget.read', { request: mutating, response });
  expect(snapshot).toEqual(original);
});
it('wraps thrown refinements and asynchronous-schema errors in field diagnostics', () => {
  for (const schema of [
    z.unknown().refine(() => {
      throw new Error('refinement exploded');
    }),
    z.unknown().refine(async () => true),
  ]) {
    expect(() =>
      assertScenarioContract(fixtureSnapshot(), 'widget.read', { request: schema }),
    ).toThrow(/widgets-api\/widget.read.*request.*synchronous Zod schema/);
  }
});
it('imports the root entrypoint without Node, Vitest or Playwright dependencies', async () => {
  await promisify(execFile)(process.execPath, [
    '--input-type=module',
    '-e',
    `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (specifier.startsWith('node:') || /^(?:vitest|@vitest|playwright|@playwright)/.test(specifier)) throw new Error('Unexpected root dependency: ' + specifier);
      return next(specifier, context);
    } });
    const { assertScenarioContract } = await import('@response-capture/scenario-contract');
    if (typeof assertScenarioContract !== 'function') throw new Error('Missing assertion API');
  `,
  ]);
});

// Public type contract: invalid source combinations and empty comparisons must not compile.
const valid: ScenarioContract = { response: z.unknown() };
void valid;
