import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@authx/core': resolve(import.meta.dirname, 'packages/core/src/index.ts'),
      '@keyrook/brand': resolve(import.meta.dirname, 'packages/brand/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/**/test/**/*.test.ts',
      'apps/server/test/**/*.test.ts',
      'apps/extension/test/**/*.test.ts',
    ],
  },
});
