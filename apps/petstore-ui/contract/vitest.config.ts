import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['contract/**/*.contract.test.ts'],
    globalSetup: ['./contract/global-setup.ts'],
  },
});
