import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCatalog, validateScenario } from './schema.js';
import type { Scenario } from './schema.js';
import { atomicWrite, compareIds } from './writer.js';

export async function mergeScenarios(
  directory: string,
  diagnostic: (message: string) => void = console.info,
): Promise<string> {
  const filenames = (await readdir(directory))
    .filter((name) => name.endsWith('.json') && name !== 'catalog.json')
    .sort();
  const scenarios = new Map<string, { scenario: Scenario; filename: string }>();
  const routes = new Map<string, string[]>();
  for (const name of filenames) {
    const filename = join(directory, name);
    let data: unknown;
    try {
      data = JSON.parse(await readFile(filename, 'utf8'));
    } catch (error) {
      throw new Error(
        `${filename}: cannot read JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let entries: Scenario[];
    if (data !== null && typeof data === 'object' && 'catalogVersion' in data) {
      validateCatalog(data, filename);
      entries = data.scenarios;
    } else {
      validateScenario(data, filename);
      entries = [data];
    }
    for (const scenario of entries) {
      const previous = scenarios.get(scenario.id);
      if (previous) {
        throw new Error(
          `Duplicate scenario ID ${scenario.id} in ${filename} and ${previous.filename}`,
        );
      }
      scenarios.set(scenario.id, { scenario, filename });
      const route = `${scenario.request.method} ${scenario.request.path}`;
      routes.set(route, [...(routes.get(route) ?? []), scenario.id]);
    }
  }
  for (const [route, ids] of [...routes].sort()) {
    if (ids.length > 1) {
      diagnostic(`Shared method/path ${route}: ${ids.sort().join(', ')}`);
    }
  }
  const filename = join(directory, 'catalog.json');
  await atomicWrite(filename, {
    catalogVersion: 1,
    scenarios: [...scenarios.values()]
      .map((entry) => entry.scenario)
      .sort(compareIds),
  });
  return filename;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  import('./submission.js')
    .then(({ mergeAndSubmitScenarios }) =>
      mergeAndSubmitScenarios(process.argv[2] ?? 'artifacts/api-scenarios'),
    )
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
