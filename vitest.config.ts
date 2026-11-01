import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Workspace packages resolve to their TypeScript source.
    conditions: ['@jsondrop/source'],
  },
  ssr: {
    resolve: {
      conditions: ['@jsondrop/source'],
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'examples/**/*.test.ts'],
  },
});
