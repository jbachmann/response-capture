import { defineConfig, mergeConfig } from 'vitest/config';
import { scenarioCapture } from '@response-capture/scenario-recorder/vitest';
import e2e from './vitest.config.e2e.js';

export default mergeConfig(
  e2e,
  defineConfig({
    test: scenarioCapture({ outputDirectory: 'artifacts/api-scenarios' }),
  }),
);
