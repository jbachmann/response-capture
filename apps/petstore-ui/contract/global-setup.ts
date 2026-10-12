import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { prepareContractRun } from './load-catalog';

export default async function setup(project: Pick<TestProject, 'provide'>) {
  const workspace = fileURLToPath(new URL('../', import.meta.url));
  const { snapshot, directory } = await prepareContractRun(workspace);
  project.provide('contractSnapshot', snapshot);
  console.info(
    `Contract catalog: ${snapshot.source.url}\nsha256: ${snapshot.source.sha256}\nSnapshot: ${directory}`,
  );
}
