import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import type { TestUserConfig } from 'vitest/config';
import type { Reporter, TestModule, TestRunEndReason } from 'vitest/node';
import type { Scenario } from '@response-capture/contracts/scenarios';
import { writeCatalog } from './files.js';

declare module 'vitest' {
  interface TaskMeta {
    scenarioRecorder?: Scenario[];
  }
}

export interface ScenarioCaptureOptions {
  outputDirectory: string;
}

export class ScenarioCaptureReporter implements Reporter {
  constructor(private readonly options: ScenarioCaptureOptions) {}

  async onTestRunEnd(
    modules: ReadonlyArray<TestModule>,
    errors: ReadonlyArray<unknown>,
    reason: TestRunEndReason,
  ): Promise<void> {
    if (reason !== 'passed' || errors.length) return;
    const scenarios: Scenario[] = [];
    const sources = new Map<string, string>();
    for (const module of modules) {
      for (const test of module.children.allTests()) {
        if (test.result().state !== 'passed' || test.options.fails) continue;
        for (const scenario of test.meta().scenarioRecorder ?? []) {
          const source = `${module.moduleId} > ${test.fullName}`;
          const previous = sources.get(scenario.id);
          if (previous)
            throw new Error(`Duplicate scenario ID ${scenario.id} in ${source} and ${previous}`);
          sources.set(scenario.id, source);
          scenarios.push(scenario);
        }
      }
    }
    const filename = join(this.options.outputDirectory, 'catalog.json');
    await writeCatalog(filename, scenarios);
    console.info(`Captured ${scenarios.length} scenarios in ${filename}`);
  }
}

/** Merge the returned test options into a dedicated capture configuration. */
export function scenarioCapture(options: ScenarioCaptureOptions): TestUserConfig {
  if (!options.outputDirectory.trim()) throw new Error('outputDirectory must be nonempty');
  return {
    setupFiles: [fileURLToPath(new URL('./vitest-setup.js', import.meta.url))],
    reporters: [
      'default',
      new ScenarioCaptureReporter({ outputDirectory: resolve(options.outputDirectory) }),
    ],
  };
}
