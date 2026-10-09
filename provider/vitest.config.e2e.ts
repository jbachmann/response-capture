import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { typescriptMetadata } from './test/typescript-metadata.js';

export default defineConfig({
  plugins: [typescriptMetadata(), tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
