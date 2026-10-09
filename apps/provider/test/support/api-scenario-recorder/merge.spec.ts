import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeScenarios } from './merge.js';
import { atomicWrite } from './writer.js';
const scenario = (id: string) => ({
  schemaVersion: 1,
  id,
  request: { method: 'GET', path: '/pet/1', body: null },
  response: { status: 200, body: { b: 2, a: 1 } },
});
describe('catalog merging', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'merge-'));
  });
  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });
  it('preserves authored metadata alongside legacy records', async () => {
    const enriched = {
      ...scenario('enriched'),
      title: 'Open a station',
      description: 'Starts observing.',
      category: 'Astronomy',
      group: 'Open',
      tags: ['night'],
    };
    await atomicWrite(join(directory, 'a.json'), enriched);
    await atomicWrite(join(directory, 'b.json'), scenario('legacy'));
    const catalog = JSON.parse(
      await readFile(await mergeScenarios(directory, () => undefined), 'utf8'),
    );
    expect(catalog.scenarios).toEqual([enriched, scenario('legacy')]);
  });
  it('sorts scenarios, reports shared routes, ignores old catalogs/temp files, and is deterministic', async () => {
    await atomicWrite(join(directory, 'b.json'), {
      catalogVersion: 1,
      scenarios: [scenario('z')],
    });
    await atomicWrite(join(directory, 'a.json'), scenario('a'));
    await writeFile(join(directory, 'catalog.json'), 'old invalid catalog');
    await writeFile(join(directory, 'partial.json.tmp'), '{');
    const diagnostic = vi.fn();
    const filename = await mergeScenarios(directory, diagnostic);
    const first = await readFile(filename, 'utf8');
    expect(
      JSON.parse(first).scenarios.map((entry: { id: string }) => entry.id),
    ).toEqual(['a', 'z']);
    expect(diagnostic).toHaveBeenCalledWith(
      'Shared method/path GET /pet/1: a, z',
    );
    await mergeScenarios(directory, diagnostic);
    expect(await readFile(filename, 'utf8')).toBe(first);
    expect(first.endsWith('\n')).toBe(true);
  });
  it('rejects duplicates even when contents match and preserves the previous catalog', async () => {
    await atomicWrite(join(directory, 'a.json'), scenario('same'));
    const filename = await mergeScenarios(directory);
    const before = await readFile(filename, 'utf8');
    await atomicWrite(join(directory, 'b.json'), scenario('same'));
    await expect(mergeScenarios(directory)).rejects.toThrow(
      /Duplicate.*same.*b.json.*a.json/,
    );
    expect(await readFile(filename, 'utf8')).toBe(before);
  });
  it.each([
    '{',
    JSON.stringify({ ...scenario('bad'), schemaVersion: 2 }),
    JSON.stringify({ catalogVersion: 3, scenarios: [] }),
    JSON.stringify({
      catalogVersion: 1,
      scenarios: [
        scenario('ok'),
        { ...scenario('bad'), response: { status: 999, body: null } },
      ],
    }),
  ])('rejects invalid files with filename diagnostics', async (contents) => {
    await writeFile(join(directory, 'bad.json'), contents);
    await expect(mergeScenarios(directory)).rejects.toThrow(/bad.json/);
  });
  it('merges an empty directory into an empty catalog', async () => {
    expect(
      JSON.parse(await readFile(await mergeScenarios(directory), 'utf8')),
    ).toEqual({ catalogVersion: 1, scenarios: [] });
  });
});
