import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { setupApp } from '../../src/setup-app.js';
import { createScenarioRecorder } from './api-scenario-recorder/index.js';

export const pet = {
  name: 'Milo',
  photoUrls: ['https://example.com/milo.jpg'],
};

// Suites use separate Vitest workers; tests within a suite must stay sequential
// because the database path is configured through the process environment.
export function usePetstoreFixture() {
  let app: INestApplication | undefined;
  let directory: string;
  let previousPath: string | undefined;

  function currentApp(): INestApplication {
    if (!app) {
      throw new Error('Petstore fixture has not been initialized');
    }
    return app;
  }

  async function open(): Promise<void> {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  }

  beforeEach(async () => {
    app = undefined;
    directory = mkdtempSync(join(tmpdir(), 'petstore-'));
    previousPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = join(directory, 'nested', 'test.sqlite');
    await open();
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      app = undefined;
      if (previousPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = previousPath;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  return {
    get app(): INestApplication {
      return currentApp();
    },
    api: () => request(currentApp().getHttpServer()),
    scenarios: (suiteId = 'petstore-e2e') =>
      createScenarioRecorder({
        app: currentApp().getHttpServer(),
        suiteId,
        outputDirectory: 'artifacts/api-scenarios',
      }),
    async reopen(): Promise<void> {
      await currentApp().close();
      app = undefined;
      await open();
    },
  };
}
