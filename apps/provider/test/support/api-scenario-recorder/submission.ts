import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { mergeScenarios } from './merge.js';

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

export async function mergeAndSubmitScenarios(
  directory: string,
  diagnostic: (message: string) => void = console.info,
): Promise<string> {
  const filename = await mergeScenarios(directory, diagnostic);
  diagnostic(`Wrote ${filename}`);
  const commitHash = await git('rev-parse', 'HEAD');
  const alias =
    process.env.CATALOG_ALIAS ?? (await git('branch', '--show-current'));
  const catalog = JSON.parse(await readFile(filename, 'utf8')) as unknown;
  const baseUrl = process.env.CATALOG_API_URL ?? 'http://localhost:3001';
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/catalog-submissions`;
  try {
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemName: 'provider',
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
      `Catalog submission to ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}. Local catalog remains at ${filename}; check the catalog API and rerun scenarios:merge.`,
    );
  }
  diagnostic(`Submitted provider catalog at commit ${commitHash}`);
  return filename;
}
