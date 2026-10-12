import type { ZodType } from 'zod';
import type { CatalogSnapshot } from '@response-capture/scenario-client';

export type { CatalogSnapshot } from '@response-capture/scenario-client';

/** Schemas validate entire wire request/response objects; omit a side to leave it unchecked. */
export type ScenarioContract =
  { request: ZodType; response?: ZodType } | { request?: ZodType; response: ZodType };

/** Synchronous, runner-independent assertion. Parsed output never replaces recorded data. */
export function assertScenarioContract(
  snapshot: CatalogSnapshot,
  scenarioId: string,
  contract: ScenarioContract,
): void {
  const context = `${snapshot.source.systemName}/${scenarioId} [source ${snapshot.source.url}; sha256 ${snapshot.source.sha256}]`;
  if (!contract.request && !contract.response) {
    throw new Error(`${context}: contract must supply at least one request or response schema`);
  }
  const scenario = snapshot.catalog.scenarios.find(({ id }) => id === scenarioId);
  if (!scenario) throw new Error(`${context}: scenario.id is missing from the catalog`);

  const errors: string[] = [];
  for (const field of ['request', 'response'] as const) {
    const schema = contract[field];
    if (!schema) continue;
    try {
      // Consumer refinements cannot mutate the shared recording or the other comparison side.
      const result = schema.safeParse(structuredClone(scenario[field]));
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push(
            `${context}: ${field}${issue.path.length ? `.${issue.path.map(String).join('.')}` : ''}: ${issue.message}`,
          );
        }
      }
    } catch (error) {
      errors.push(
        `${context}: ${field}: cannot apply synchronous Zod schema: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}
