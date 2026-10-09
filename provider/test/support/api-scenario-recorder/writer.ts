import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Json, Scenario } from './schema.js';

export const compareIds = (a: Scenario, b: Scenario) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function canonical(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export async function atomicWrite(
  filename: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      JSON.stringify(canonical(value as Json), null, 2) + '\n',
      { flag: 'wx' },
    );
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
}
