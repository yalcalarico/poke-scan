import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

import { resolveTestDatabaseUrl } from './test/test-env.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: resolveTestDatabaseUrl(),
      PRICE_QUEUE_ENABLED: 'false',
      ENABLE_CATALOG_SYNC_CRON: 'false',
      ENABLE_PRICE_BACKFILL_CRON: 'false',
      ENABLE_RETENTION_CRON: 'false',
      ADMIN_KEY: 'e2e-admin-key',
    },
    globalSetup: ['./test/global-setup.ts'],
  },
});
