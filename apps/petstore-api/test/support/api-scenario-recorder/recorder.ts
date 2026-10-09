import request from 'supertest';
import type { Response, Test } from 'supertest';
import type { App } from 'supertest/types.js';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  isJsonContentType,
  validateRequest,
  validateScenario,
} from './schema.js';
import type {
  Json,
  RequestExample,
  Scenario,
  ScenarioMetadata,
} from './schema.js';
import { atomicWrite, compareIds } from './writer.js';

/** Only expectations and awaiting are exposed; callers cannot mutate the request. */
export interface ScenarioTest extends PromiseLike<Response> {
  expect(status: number, body?: unknown): ScenarioTest;
  expect(check: (response: Response) => unknown): ScenarioTest;
  expect(body: string | RegExp | object): ScenarioTest;
  expect(field: string, value: string | RegExp): ScenarioTest;
}

function expectations(test: Test): ScenarioTest {
  const wrapper: ScenarioTest = {
    expect(...args: unknown[]) {
      if (
        args.length > 2 ||
        (args.length === 2 && typeof args[1] === 'function')
      ) {
        throw new Error(
          'Use awaited expectations; callback-style .expect() is unsupported',
        );
      }
      (test.expect as (...args: unknown[]) => Test)(...args);
      return wrapper;
    },
    // oxlint-disable-next-line unicorn/no-thenable -- intentionally awaitable Supertest facade
    then: (fulfilled, rejected) => test.then(fulfilled, rejected),
  };
  return wrapper;
}

function snapshotRequest(example: RequestExample, id: string): RequestExample {
  // Snapshot before asynchronous assertions or fixture mutation can change it.
  const snapshot = JSON.parse(JSON.stringify(example)) as RequestExample;
  validateRequest(snapshot, `Scenario ${id}`);
  return snapshot;
}

function createManagedRequest(
  app: App,
  snapshot: RequestExample,
  hasBody: boolean,
): Test {
  const test = new request.Test(app, snapshot.method, snapshot.path).redirects(
    0,
  );
  if (hasBody) {
    test.type('json').send(JSON.stringify(snapshot.body));
  }
  return test;
}

function decodeResponse(observed: Response, id: string): Scenario['response'] {
  const contentType = observed.headers['content-type'] as string | undefined;
  if (contentType !== undefined && !isJsonContentType(contentType)) {
    throw new Error(
      `Scenario ${id}: response.content-type ${contentType} is unsupported; only JSON or absent empty bodies are supported`,
    );
  }
  let body: Json = null;
  if (observed.text !== undefined && observed.text !== '') {
    if (!contentType) {
      throw new Error(`Scenario ${id}: response.body has no JSON content type`);
    }
    try {
      body = JSON.parse(observed.text) as Json;
    } catch {
      throw new Error(`Scenario ${id}: response.body is not valid JSON`);
    }
  }
  return {
    status: observed.status,
    ...(contentType ? { headers: { 'content-type': contentType } } : {}),
    body,
  };
}

export function createScenarioRecorder(options: {
  app: App;
  suiteId: string;
  outputDirectory: string;
}) {
  if (!options.suiteId.trim()) {
    throw new Error('suiteId must be nonempty');
  }
  const suite = createHash('sha256')
    .update(options.suiteId)
    .digest('hex')
    .slice(0, 20);
  const outputFile = join(
    options.outputDirectory,
    `${suite}-${randomUUID()}.scenarios.json`,
  );
  const scenarios = new Map<string, Scenario>();
  const pendingIds = new Set<string>();
  let sealed = false;
  let flushing: Promise<string | undefined> | undefined;
  return {
    async recordScenario(
      id: string,
      descriptor: {
        method: RequestExample['method'];
        path: string;
        body?: Json;
      },
      assert: (test: ScenarioTest) => PromiseLike<Response>,
      metadata: ScenarioMetadata & {
        requestMatch?: RequestExample['match'];
      } = {},
    ): Promise<Response> {
      if (sealed) {
        throw new Error(`Scenario ${id}: recorder is closed after flush()`);
      }
      if (scenarios.has(id) || pendingIds.has(id)) {
        throw new Error(`Duplicate scenario ID ${id}`);
      }
      const example: RequestExample = {
        ...descriptor,
        body: descriptor.body === undefined ? null : descriptor.body,
        ...(metadata.requestMatch === undefined
          ? {}
          : { match: metadata.requestMatch }),
      };
      const candidate = {
        schemaVersion: 1,
        id,
        ...(metadata.title === undefined ? {} : { title: metadata.title }),
        ...(metadata.category === undefined
          ? {}
          : { category: metadata.category }),
        ...(metadata.group === undefined ? {} : { group: metadata.group }),
        ...(metadata.tags === undefined ? {} : { tags: metadata.tags }),
        ...(metadata.description === undefined
          ? {}
          : { description: metadata.description }),
        request: example,
        response: { status: 200, body: null },
      };
      validateScenario(candidate);
      if (candidate.tags !== undefined) candidate.tags = [...candidate.tags];
      const snapshot = snapshotRequest(example, id);
      pendingIds.add(id);
      try {
        const test = createManagedRequest(
          options.app,
          snapshot,
          descriptor.body !== undefined,
        );
        const response = await assert(expectations(test));
        // Always await the managed interaction even if the callback returned another response.
        const observed = await test;
        if (response !== observed) {
          throw new Error(
            `Scenario ${id}: assertion callback must return the managed request's response`,
          );
        }
        const scenario = {
          ...candidate,
          request: snapshot,
          response: decodeResponse(observed, id),
        };
        validateScenario(scenario);
        scenarios.set(id, scenario);
        return observed;
      } catch (error) {
        throw new Error(
          `Scenario ${id}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      } finally {
        pendingIds.delete(id);
      }
    },
    flush(): Promise<string | undefined> {
      if (flushing) {
        return flushing;
      }
      if (pendingIds.size) {
        return Promise.reject(
          new Error('Await all recordScenario calls before flush()'),
        );
      }
      sealed = true;
      flushing = (async () => {
        if (!scenarios.size) {
          return undefined;
        }
        await atomicWrite(outputFile, {
          catalogVersion: 1,
          scenarios: [...scenarios.values()].sort(compareIds),
        });
        return outputFile;
      })();
      return flushing;
    },
  };
}
