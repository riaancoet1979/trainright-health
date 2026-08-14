import type { D1Migration } from '@cloudflare/vitest-pool-workers';

// vitest-pool-workers 0.21+ dropped `ProvidedEnv`; the `env` seen by tests is
// typed by declaration-merging into the global `Cloudflare.Env` interface that
// `wrangler types` generates. Only test-only bindings belong here - real
// bindings come from worker-configuration.d.ts, secrets from src/env.ts.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      /** Bound by vitest.config.ts's miniflare bindings, so tests can pass
       *  `env` straight to handlers that expect the secret. */
      BOOTSTRAP_CODE: string;
    }
  }
}
