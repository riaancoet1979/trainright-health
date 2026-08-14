import type { Env as AppEnv } from '../src/env';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

// vitest-pool-workers 0.21+ dropped `ProvidedEnv`; the `env` seen by tests is
// now typed by declaration-merging into the global `Cloudflare.Env` interface.
declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
