import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolveTestDatabaseUrl } from './test/test-env.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/password-recovery-harness.ts'],
    env: { DATABASE_URL: resolveTestDatabaseUrl() },
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
  },
});
