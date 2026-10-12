import { z } from 'zod';
import type { CatalogSnapshot } from '@response-capture/scenario-client';
import { expectations, type ScenarioExpectation } from './expectations';

function matchesEndpoint(path: string, endpoint: string): boolean {
  const actual = path.split('/');
  const expected = endpoint.split('/');
  return (
    actual.length === expected.length &&
    expected.every((part, index) => {
      if (part !== '{id}') return actual[index] === part;
      const id = actual[index];
      return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    })
  );
}

export function assertScenarioContract(
  snapshot: CatalogSnapshot,
  expectation: ScenarioExpectation,
): void {
  const context = `${expectation.id} [source ${snapshot.source.url}; sha256 ${snapshot.source.sha256}]`;
  const scenario = snapshot.catalog.scenarios.find(({ id }) => id === expectation.id);
  if (!scenario) throw new Error(`${context}: scenario.id is missing from the catalog`);
  function check(schema: z.ZodType, value: unknown, field: string) {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new Error(
        result.error.issues
          .map(
            (issue) =>
              `${context}: ${field}${issue.path.length ? `.${issue.path.join('.')}` : ''}: ${issue.message}`,
          )
          .join('\n'),
      );
    }
  }
  check(z.literal(expectation.method), scenario.request.method, 'request.method');
  if (!matchesEndpoint(scenario.request.path, expectation.endpoint)) {
    throw new Error(
      `${context}: request.path expected ${expectation.endpoint} with positive safe integer IDs; received ${scenario.request.path}`,
    );
  }
  check(z.literal(expectation.status), scenario.response.status, 'response.status');
  check(expectation.query ?? z.undefined(), scenario.request.query, 'request.query');
  check(expectation.request, scenario.request.body, 'request.body');
  if (expectation.response) check(expectation.response, scenario.response.body, 'response.body');
}

export function assertCatalogContract(snapshot: CatalogSnapshot): void {
  for (const expectation of expectations) assertScenarioContract(snapshot, expectation);
}
