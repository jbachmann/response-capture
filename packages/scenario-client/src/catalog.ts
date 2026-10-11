import { parseCatalog, type Catalog, type Scenario } from '@response-capture/contracts/scenarios';

export type CatalogSelection =
  { latest: true; selector?: never } | { selector: string; latest?: never };
export interface CatalogSource {
  systemName: string;
  selection: CatalogSelection;
  /** Required by the snapshot loader; fetchCatalog also accepts an explicit base URL. */
  catalogApiUrl?: string;
}
export interface CatalogSnapshot {
  catalog: Catalog;
  source: { systemName: string; selector: string | null; url: string; sha256: string };
}
export interface ScenarioExample extends Scenario {
  source: CatalogSnapshot['source'] & { catalog: string };
}

/** Validated, privately owned recordings. Callers always receive independent examples. */
export class ScenarioCatalog {
  private readonly scenarios: ReadonlyMap<string, Scenario>;

  constructor(
    value: unknown,
    private readonly systemName: string,
  ) {
    this.scenarios = new Map(
      structuredClone(parseCatalog(value)).scenarios.map((scenario) => [scenario.id, scenario]),
    );
  }

  get(id: string): Scenario {
    const scenario = this.scenarios.get(id);
    if (!scenario) throw new Error(`Unknown ${this.systemName} scenario ID: ${id}`);
    return structuredClone(scenario);
  }
}
