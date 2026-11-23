import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'client', environment: 'node', include: ['src/**/*.test.ts'] } },
      './worker/vitest.config.ts'
    ]
  }
});
