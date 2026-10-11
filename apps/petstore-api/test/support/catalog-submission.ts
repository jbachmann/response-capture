import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCatalog } from '@response-capture/contracts/scenarios';

const execute = promisify(execFile);

async function git(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execute('git', args);
    return stdout.trim();
  } catch (error) {
    throw new Error(
      `Cannot resolve Git submission metadata (${args.join(' ')}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function submitScenarios(
  directory: string,
  diagnostic: (message: string) => void = console.info,
): Promise<string> {
  const filename = join(directory, 'catalog.json');
  const catalog: unknown = JSON.parse(await readFile(filename, 'utf8'));
  validateCatalog(catalog, filename);
  const commitHash = await git('rev-parse', 'HEAD');
  const alias = process.env.CATALOG_ALIAS ?? (await git('branch', '--show-current'));
  const baseUrl = process.env.CATALOG_API_URL ?? 'http://localhost:3001';
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/catalog-submissions`;
  try {
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemName: 'petstore-api',
        commitHash,
        ...(alias ? { alias } : {}),
        catalog,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    await response.body?.cancel();
  } catch (error) {
    throw new Error(
      `Catalog submission to ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}. Local catalog remains at ${filename}; check the catalog API and rerun scenarios:submit.`,
    );
  }
  diagnostic(`Submitted petstore-api catalog at commit ${commitHash}`);
  return filename;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  submitScenarios(process.argv[2] ?? 'artifacts/api-scenarios').catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
