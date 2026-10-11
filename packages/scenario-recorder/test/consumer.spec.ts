import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);

it('consumes built entrypoints and declarations outside the workspace with an isolated core import', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scenario-consumer-'));
  try {
    const scope = join(directory, 'node_modules/@response-capture');
    await mkdir(scope, { recursive: true });
    const packageRoot = fileURLToPath(new URL('../', import.meta.url));
    const target = join(scope, 'scenario-recorder');
    await mkdir(target);
    for (const file of ['package.json', 'dist', 'bin'])
      await cp(join(packageRoot, file), join(target, file), { recursive: true });
    const contracts = join(scope, 'contracts');
    await mkdir(contracts);
    const contractsRoot = fileURLToPath(new URL('../../contracts/', import.meta.url));
    for (const file of ['package.json', 'dist'])
      await cp(join(contractsRoot, file), join(contracts, file), { recursive: true });
    for (const name of [
      'vitest',
      'supertest',
      '@mswjs/interceptors',
      '@types/node',
      '@types/supertest',
      '@types/superagent',
    ]) {
      const root =
        name === '@mswjs/interceptors'
          ? dirname(dirname(dirname(require.resolve(name))))
          : dirname(require.resolve(`${name}/package.json`, { paths: [packageRoot] }));
      const destination = join(directory, 'node_modules', name);
      await mkdir(dirname(destination), { recursive: true });
      await symlink(root, destination, 'dir');
    }
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(
      join(directory, 'check.mjs'),
      `
import { registerHooks } from 'node:module';
const stop = registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('vitest') || specifier.startsWith('@mswjs/') || specifier.startsWith('node:')) {
    throw new Error('Core imported forbidden dependency: ' + specifier);
  }
  return next(specifier, context);
} });
const core = await import('@response-capture/scenario-recorder');
if (!core.CaptureSession || !core.validateScenario) throw new Error('Missing core exports');
stop.deregister();
const marker = await import('@response-capture/scenario-recorder/supertest');
const node = await import('@response-capture/scenario-recorder/node');
const files = await import('@response-capture/scenario-recorder/files');
const vitest = await import('@response-capture/scenario-recorder/vitest');
if (!marker.capture || !node.startHttpCapture || !files.mergeScenarios || !vitest.scenarioCapture) throw new Error('Missing adapter exports');
`,
    );
    await execute(process.execPath, [join(directory, 'check.mjs')], { cwd: directory });
    const recordings = join(directory, 'recordings');
    await mkdir(recordings);
    await execute(process.execPath, [join(target, 'bin/merge.mjs'), recordings], {
      cwd: directory,
    });
    expect(JSON.parse(await readFile(join(recordings, 'catalog.json'), 'utf8'))).toEqual({
      catalogVersion: 1,
      scenarios: [],
    });
    await writeFile(
      join(directory, 'check.ts'),
      `
import { CaptureSession, type CaptureMetadata } from '@response-capture/scenario-recorder';
import { capture } from '@response-capture/scenario-recorder/supertest';
import { startHttpCapture, withCaptureSession } from '@response-capture/scenario-recorder/node';
import { scenarioCapture } from '@response-capture/scenario-recorder/vitest';
import { mergeScenarios } from '@response-capture/scenario-recorder/files';
import request from 'supertest';
const metadata: CaptureMetadata = {title: 'Example'};
request('http://localhost').get('/').use(capture('one', metadata));
scenarioCapture({outputDirectory: 'out'});
withCaptureSession(new CaptureSession(), async () => {});
startHttpCapture;
mergeScenarios;
`,
    );
    await execute(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2023',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        join(directory, 'check.ts'),
      ],
      { cwd: directory },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
