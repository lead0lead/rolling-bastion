import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['bench/**/*.perf.ts'], testTimeout: 120_000 },
});
