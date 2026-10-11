import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({ git: vi.fn(), fetch: vi.fn() }));
vi.mock('node:child_process', () => ({
  execFile: (
    command: string,
    args: string[],
    callback: (error: Error | null, result?: { stdout: string }) => void,
  ) => {
    try {
      callback(null, { stdout: mocks.git(command, args) });
    } catch (error) {
      callback(error as Error);
    }
  },
}));
import { submitScenarios } from './catalog-submission.js';

describe('catalog submission', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'submission-'));
    await writeFile(
      join(directory, 'catalog.json'),
      JSON.stringify({ catalogVersion: 1, scenarios: [] }),
    );
    vi.stubGlobal('fetch', mocks.fetch);
    vi.stubEnv('CATALOG_API_URL', 'http://localhost:3001/');
    vi.stubEnv('CATALOG_ALIAS', undefined);
    mocks.git.mockImplementation((_command, args) =>
      args[0] === 'rev-parse' ? 'a'.repeat(40) + '\n' : 'main\n',
    );
    mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('submits the captured file with the full HEAD and branch alias', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const filename = await submitScenarios(directory, () => undefined);
    const [endpoint, options] = mocks.fetch.mock.calls[0];
    expect(endpoint).toBe('http://localhost:3001/catalog-submissions');
    expect(options.method).toBe('PUT');
    expect(timeout).toHaveBeenCalledWith(30_000);
    timeout.mockRestore();
    expect(JSON.parse(options.body)).toEqual({
      systemName: 'petstore-api',
      commitHash: 'a'.repeat(40),
      alias: 'main',
      catalog: JSON.parse(await readFile(filename, 'utf8')),
    });
    expect(mocks.git).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD']);
  });

  it.each(['release', ''])('honors explicit alias override %j', async (alias) => {
    vi.stubEnv('CATALOG_ALIAS', alias);
    vi.stubEnv('CATALOG_API_URL', 'https://catalog.example');
    await submitScenarios(directory, () => undefined);
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(payload.alias).toBe(alias || undefined);
    expect(mocks.git).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe('https://catalog.example/catalog-submissions');
  });

  it('omits alias on detached HEAD and uses the default API URL', async () => {
    vi.stubEnv('CATALOG_API_URL', undefined);
    mocks.git.mockImplementation((_command, args) =>
      args[0] === 'rev-parse' ? 'a'.repeat(40) : '',
    );
    await submitScenarios(directory, () => undefined);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).not.toHaveProperty('alias');
    expect(mocks.fetch.mock.calls[0][0]).toBe('http://localhost:3001/catalog-submissions');
  });

  it.each([new Error('connection refused'), new DOMException('Timed out', 'TimeoutError')])(
    'retains the file on transport failure: %s',
    async (error) => {
      mocks.fetch.mockRejectedValue(error);
      await expect(submitScenarios(directory, () => undefined)).rejects.toThrow(
        /Local catalog remains/,
      );
      expect(JSON.parse(await readFile(join(directory, 'catalog.json'), 'utf8'))).toEqual({
        catalogVersion: 1,
        scenarios: [],
      });
    },
  );

  it('reports rejected HTTP submissions and retains the local file', async () => {
    mocks.fetch.mockResolvedValue(new Response('Invalid submission', { status: 400 }));
    await expect(submitScenarios(directory, () => undefined)).rejects.toThrow(
      /HTTP 400: Invalid submission/,
    );
    await expect(readFile(join(directory, 'catalog.json'))).resolves.toBeDefined();
  });

  it('fails on Git resolution errors before submitting and retains the file', async () => {
    mocks.git.mockImplementation(() => {
      throw new Error('no HEAD');
    });
    await expect(submitScenarios(directory, () => undefined)).rejects.toThrow(/Cannot resolve Git/);
    expect(mocks.fetch).not.toHaveBeenCalled();
    await expect(readFile(join(directory, 'catalog.json'))).resolves.toBeDefined();
  });

  it('rejects an invalid local catalog before resolving Git or submitting', async () => {
    const invalid = JSON.stringify({ catalogVersion: 2, scenarios: [] });
    await writeFile(join(directory, 'catalog.json'), invalid);
    await expect(submitScenarios(directory)).rejects.toThrow(/catalogVersion/);
    expect(mocks.git).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(await readFile(join(directory, 'catalog.json'), 'utf8')).toBe(invalid);
  });
});
