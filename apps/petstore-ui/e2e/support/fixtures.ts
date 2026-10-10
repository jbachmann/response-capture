import {
  test as base,
  expect,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type TestDetails,
  type TestInfo,
} from '@playwright/test';
import { createNetworkFixture, type NetworkFixture } from '@msw/playwright';
import { loadSnapshot } from './snapshot-loader';
import { resolveRouting, type SourceDeclaration } from './systems';
import {
  ScenarioSession,
  type LoadedSource,
  type MockControls,
  type ScenarioHandles,
  type ScenarioReferences,
} from './scenarios';
import {
  registerDeclaration,
  withDeclarationLocation,
  type DeclarationKind,
} from './playwright-declaration';
export { catalogSelectionFromEnv } from './catalog';

type Catalogs = Record<string, SourceDeclaration>;
type Declaration<
  C extends Catalogs,
  S extends ScenarioReferences<Extract<keyof C, string>>,
> = TestDetails & { catalogs: C; scenarios: S };
interface Fixtures {
  network: NetworkFixture;
  mocks: ScenarioSession;
  scenarios: ScenarioHandles<ScenarioReferences>;
}
const annotationType = 'catalog-declaration';
const runner = base.extend<Fixtures>({
  network: createNetworkFixture(),
  mocks: [
    async ({ network, baseURL }, use, testInfo) => {
      if (!baseURL) throw new Error('The UI baseURL is required.');
      const annotation = testInfo.annotations
        .filter((entry) => entry.type === annotationType)
        .at(-1);
      if (!annotation?.description)
        throw new Error('Declare catalogs and scenarios in the test declaration.');
      const declaration = JSON.parse(annotation.description) as Declaration<
        Catalogs,
        ScenarioReferences
      >;
      // Resolve all routing before fetching, so unknown systems have an actionable error.
      const routed = Object.entries(declaration.catalogs).map(([name, source]) => ({
        name,
        source,
        routing: resolveRouting(source, baseURL),
      }));
      const sources = Object.fromEntries(
        await Promise.all(
          routed.map(async ({ name, source, routing }) => {
            const { snapshot, path } = await loadSnapshot(source);
            await testInfo.attach(`catalog-${name}`, { path, contentType: 'application/json' });
            testInfo.annotations.push({
              type: 'catalog-source',
              description: JSON.stringify({ catalog: name, ...snapshot.source }),
            });
            return [name, { snapshot, routing } satisfies LoadedSource] as const;
          }),
        ),
      );
      const session = new ScenarioSession(sources, baseURL, network);
      try {
        // The handles fixture consumes this phase without reactivating it.
        initialHandles.set(session, session.replaceScenarios(declaration.scenarios));
        await use(session);
        session.verify();
      } finally {
        initialHandles.delete(session);
        await testInfo.attach('catalog-requests', {
          body: JSON.stringify(session.diagnostics(), null, 2),
          contentType: 'application/json',
        });
      }
    },
    { auto: true, timeout: 40_000 },
  ],
  scenarios: async ({ mocks }, use) => {
    await use(initialHandles.get(mocks)!);
  },
});
const initialHandles = new WeakMap<ScenarioSession, ScenarioHandles<ScenarioReferences>>();

type BrowserFixtures = PlaywrightTestArgs &
  PlaywrightTestOptions &
  PlaywrightWorkerArgs &
  PlaywrightWorkerOptions;
type DeclareTest = <
  const C extends Catalogs,
  const S extends ScenarioReferences<Extract<keyof C, string>>,
>(
  title: string,
  declaration: Declaration<C, S>,
  body: (
    args: BrowserFixtures & {
      scenarios: ScenarioHandles<S>;
      mocks: MockControls<Extract<keyof C, string>>;
    },
    testInfo: TestInfo,
  ) => Promise<void> | void,
) => void;

/** Metadata travels with the test, including skipped declarations and reporter discovery. */
function declarationDetails(declaration: Declaration<Catalogs, ScenarioReferences>): TestDetails {
  const { catalogs, scenarios, annotation, ...details } = declaration;
  return {
    ...details,
    annotation: [
      ...(annotation ? (Array.isArray(annotation) ? annotation : [annotation]) : []),
      { type: annotationType, description: JSON.stringify({ catalogs, scenarios }) },
    ],
  };
}

const declare = withDeclarationLocation((location, title, declaration, body) => {
  // Preserve the original callback: Playwright reads its destructured fixture names.
  registerDeclaration(
    runner,
    'default',
    location,
    title as string,
    declarationDetails(declaration as Declaration<Catalogs, ScenarioReferences>),
    body,
  );
}) as DeclareTest;

function modifier<N extends (...args: never[]) => unknown>(
  native: N,
  kind: DeclarationKind,
): N & DeclareTest {
  return withDeclarationLocation((location, ...args) => {
    const [title, declaration, body] = args;
    if (
      typeof title === 'string' &&
      declaration &&
      typeof declaration === 'object' &&
      'catalogs' in declaration
    ) {
      registerDeclaration(
        runner,
        kind,
        location,
        title,
        declarationDetails(declaration as Declaration<Catalogs, ScenarioReferences>),
        body,
      );
    } else {
      Reflect.apply(native, runner, args);
    }
  }) as N & DeclareTest;
}

// Preserve Playwright grouping, hooks, test.use(), and runtime modifiers.
export const test = Object.assign(declare, {
  describe: runner.describe,
  beforeEach: runner.beforeEach,
  afterEach: runner.afterEach,
  beforeAll: runner.beforeAll,
  afterAll: runner.afterAll,
  use: runner.use,
  setTimeout: runner.setTimeout,
  slow: runner.slow,
  info: runner.info,
  step: runner.step,
  only: modifier(runner.only, 'only'),
  skip: modifier(runner.skip, 'skip'),
  fixme: modifier(runner.fixme, 'fixme'),
  fail: Object.assign(modifier(runner.fail, 'fail'), {
    only: modifier(runner.fail.only, 'fail.only'),
  }),
});
export { expect };
