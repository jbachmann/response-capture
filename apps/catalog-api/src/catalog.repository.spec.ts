import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CatalogRepository } from './catalog.repository.js';

describe('catalog persistence', () => {
  let directory: string;
  let path: string;
  let repository: CatalogRepository;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'catalog-'));
    path = join(directory, 'nested', 'catalog.sqlite');
    vi.stubEnv('CATALOG_DATABASE_PATH', path);
    repository = new CatalogRepository();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  });

  afterEach(() => {
    repository.onModuleDestroy();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });

  it('groups inventory metadata by system and preserves ordering after replacements and reopening', () => {
    expect(repository.inventory()).toEqual({ systems: [] });
    const initialTime = '2026-10-09T12:00:00.000Z';
    repository.submit({
      systemName: 'z',
      commitHash: 'one',
      alias: 'main',
      catalog: { payload: true },
    });
    repository.submit({
      systemName: '__proto__',
      commitHash: 'one',
      alias: '',
      catalog: {},
    });
    repository.submit({ systemName: 'z', commitHash: 'two', catalog: {} });
    expect(repository.inventory()).toEqual({
      systems: [
        {
          name: '__proto__',
          catalogs: [{ commitHash: 'one', alias: '', submittedOn: initialTime }],
        },
        {
          name: 'z',
          catalogs: [
            { commitHash: 'two', submittedOn: initialTime },
            { commitHash: 'one', alias: 'main', submittedOn: initialTime },
          ],
        },
      ],
    });
    vi.setSystemTime(new Date('2026-10-09T11:00:00Z'));
    repository.submit({ systemName: 'z', commitHash: 'three', catalog: {} });
    vi.setSystemTime(new Date('2026-10-09T13:00:00Z'));
    repository.submit({ systemName: 'z', commitHash: 'one', catalog: {} });
    repository.onModuleDestroy();
    repository = new CatalogRepository();
    expect(repository.inventory()).toEqual({
      systems: [
        {
          name: '__proto__',
          catalogs: [{ commitHash: 'one', alias: '', submittedOn: initialTime }],
        },
        {
          name: 'z',
          catalogs: [
            {
              commitHash: 'one',
              submittedOn: '2026-10-09T13:00:00.000Z',
            },
            { commitHash: 'two', submittedOn: initialTime },
            {
              commitHash: 'three',
              submittedOn: '2026-10-09T11:00:00.000Z',
            },
          ],
        },
      ],
    });
  });

  it('lists all systems in timestamp and sequence order after replacements and reopening', () => {
    expect(repository.list()).toEqual([]);
    const first = {
      systemName: 's',
      commitHash: 'one',
      alias: 'main',
      catalog: { n: 1 },
    };
    const second = {
      systemName: 'other',
      commitHash: 'two',
      catalog: { n: 2 },
    };
    repository.submit(first);
    repository.submit(second);
    const initialTime = '2026-10-09T12:00:00.000Z';
    expect(repository.list()).toEqual([
      { ...second, submittedAt: initialTime },
      { ...first, submittedAt: initialTime },
    ]);
    vi.setSystemTime(new Date('2026-10-09T11:00:00Z'));
    const third = { systemName: 's', commitHash: 'three', catalog: { n: 3 } };
    repository.submit(third);
    vi.setSystemTime(new Date('2026-10-09T13:00:00Z'));
    const replacement = {
      systemName: 's',
      commitHash: 'one',
      catalog: { nested: [null, true] },
    };
    repository.submit(replacement);
    repository.onModuleDestroy();
    repository = new CatalogRepository();
    expect(repository.list()).toEqual([
      { ...replacement, submittedAt: '2026-10-09T13:00:00.000Z' },
      { ...second, submittedAt: initialTime },
      { ...third, submittedAt: '2026-10-09T11:00:00.000Z' },
    ]);
  });

  it('upserts, refreshes the timestamp, removes aliases, and isolates systems', () => {
    repository.submit({
      systemName: 'provider',
      commitHash: 'one',
      alias: 'main',
      catalog: { old: true },
    });
    repository.submit({
      systemName: 'other',
      commitHash: 'one',
      alias: 'main',
      catalog: { other: true },
    });
    vi.setSystemTime(new Date('2026-10-09T13:00:00Z'));
    repository.submit({
      systemName: 'provider',
      commitHash: 'one',
      catalog: { replacement: true },
    });
    expect(repository.latest('provider')).toEqual({ replacement: true });
    expect(repository.latest('provider', 'main')).toBeUndefined();
    expect(repository.latest('provider', 'one')).toEqual({ replacement: true });
    expect(repository.latest('other', 'main')).toEqual({ other: true });
    const db = new DatabaseSync(path);
    try {
      expect(db.prepare('SELECT count(*) AS count FROM catalog_submissions').get()?.count).toBe(2);
      expect(
        db
          .prepare("SELECT submitted_at FROM catalog_submissions WHERE system_name = 'provider'")
          .get()?.submitted_at,
      ).toBe('2026-10-09T13:00:00.000Z');
    } finally {
      db.close();
    }
  });

  it('breaks timestamp ties on inserts and updates, including after reopening', () => {
    repository.submit({
      systemName: 's',
      commitHash: 'first',
      alias: 'shared',
      catalog: { n: 1 },
    });
    repository.submit({
      systemName: 's',
      commitHash: 'second',
      alias: 'shared',
      catalog: { n: 2 },
    });
    expect(repository.latest('s', 'shared')).toEqual({ n: 2 });
    repository.onModuleDestroy();
    repository = new CatalogRepository();
    expect(repository.latest('s')).toEqual({ n: 2 });
    repository.submit({
      systemName: 's',
      commitHash: 'first',
      alias: 'shared',
      catalog: { n: 3 },
    });
    expect(repository.latest('s')).toEqual({ n: 3 });
    expect(repository.latest('s', 'shared')).toEqual({ n: 3 });
  });

  it('uses submission time before sequence and handles alias/commit collisions', () => {
    repository.submit({
      systemName: 's',
      commitHash: 'collision',
      catalog: { n: 1 },
    });
    vi.setSystemTime(new Date('2026-10-09T13:00:00Z'));
    repository.submit({
      systemName: 's',
      commitHash: 'second',
      alias: 'collision',
      catalog: { n: 2 },
    });
    vi.setSystemTime(new Date('2026-10-09T11:00:00Z'));
    repository.submit({
      systemName: 's',
      commitHash: 'third',
      catalog: { n: 3 },
    });
    expect(repository.latest('s')).toEqual({ n: 2 });
    expect(repository.latest('s', 'collision')).toEqual({ n: 2 });
    expect(repository.latest('S')).toBeUndefined();
    expect(repository.latest('s', 'COLLISION')).toBeUndefined();
  });
});
