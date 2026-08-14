import path from 'node:path';
import { cloudflareTest, readD1Migrations, type D1Migration } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// vitest-pool-workers 0.21+ is a Vite plugin, not a `defineWorkersConfig` wrapper.
// The old `test.poolOptions.workers` object is now the plugin's argument.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      let migrations: D1Migration[] = [];
      try {
        migrations = await readD1Migrations(migrationsDir);
      } catch {
        // Task 2 creates migrations/. Until then, run against an empty schema.
        migrations = [];
      }

      return {
        singleWorker: true,
        isolatedStorage: true,
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BOOTSTRAP_CODE: 'test-bootstrap-code',
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
