import { validateScenario } from '@response-capture/contracts/scenarios';
import type {
  RequestExample,
  Scenario,
  ScenarioMetadata,
} from '@response-capture/contracts/scenarios';

export type CaptureMetadata = ScenarioMetadata & { requestMatch?: RequestExample['match'] };
export interface CaptureDefinition {
  id: string;
  metadata: CaptureMetadata;
}

/** Runner-independent transaction: observations stay private until finish succeeds. */
export class CaptureSession {
  private readonly definitions = new Map<string, CaptureDefinition>();
  private readonly scenarios = new Map<string, Scenario>();
  private readonly errors: string[] = [];
  private closed = false;

  reserve(id: string, metadata: CaptureMetadata = {}): CaptureDefinition {
    if (this.closed) throw new Error(`Scenario ${id}: capture session is closed`);
    if (this.definitions.has(id)) throw new Error(`Duplicate scenario ID ${id}`);
    for (const field of Object.keys(metadata)) {
      if (!['title', 'category', 'group', 'tags', 'description', 'requestMatch'].includes(field)) {
        throw new Error(`Scenario ${id}: metadata.${field} is unknown`);
      }
    }
    const { requestMatch, ...labels } = metadata;
    // Use the hint itself only to validate metadata here; validate against the
    // observed request when the exchange completes.
    validateScenario({
      schemaVersion: 1,
      id,
      ...labels,
      request: {
        method: 'GET',
        path: '/',
        body: requestMatch?.bodyContains ?? null,
        ...(requestMatch === undefined ? {} : { match: requestMatch }),
      },
      response: { status: 200, body: null },
    });
    const definition = { id, metadata: JSON.parse(JSON.stringify(metadata)) as CaptureMetadata };
    this.definitions.set(id, definition);
    return definition;
  }

  observe(
    definition: CaptureDefinition,
    request: RequestExample,
    response: Scenario['response'],
  ): void {
    if (this.closed) return;
    if (this.definitions.get(definition.id) !== definition) {
      throw new Error(`Scenario ${definition.id}: unknown capture definition`);
    }
    if (this.scenarios.has(definition.id))
      throw new Error(`Scenario ${definition.id}: multiple HTTP exchanges are unsupported`);
    const { requestMatch, ...labels } = definition.metadata;
    const scenario = {
      schemaVersion: 1,
      id: definition.id,
      ...labels,
      request: { ...request, ...(requestMatch === undefined ? {} : { match: requestMatch }) },
      response,
    };
    validateScenario(scenario);
    this.scenarios.set(definition.id, JSON.parse(JSON.stringify(scenario)) as Scenario);
  }

  fail(id: string, error: unknown): void {
    if (!this.closed)
      this.errors.push(`Scenario ${id}: ${error instanceof Error ? error.message : String(error)}`);
  }

  finish(): Scenario[] {
    if (this.closed) throw new Error('Capture session is closed');
    this.closed = true;
    for (const id of this.definitions.keys()) {
      if (!this.scenarios.has(id))
        this.errors.push(
          `Scenario ${id}: no complete HTTP exchange was observed; await the marked request`,
        );
    }
    if (this.errors.length) throw new Error(this.errors.join('\n'));
    return [...this.scenarios.values()];
  }

  discard(): void {
    this.closed = true;
    this.scenarios.clear();
  }
}
