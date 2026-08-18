// Minimal config exported as plain object to avoid importing 'vitest/config'
export default {
  // vite.config.ts injects __BUILD_STAMP__ via `define`, but this file is a
  // separate config and does not inherit it — without this, any component
  // rendering the build stamp throws ReferenceError under test.
  define: {
    __BUILD_STAMP__: JSON.stringify('test-build'),
  },
  test: {
    // Use jsdom so DOM-based component tests can run normally
    environment: 'jsdom',
    globals: true,
    // The jsdom render tests are not logically slow, but vitest runs files in
    // parallel and they get CPU-starved past the 5s default once the suite is
    // this size. Raising the ceiling avoids flaky timeouts without masking any
    // real failure - a genuinely hung test still fails, just later.
    testTimeout: 20000,
    hookTimeout: 20000,
    setupFiles: ['./src/__tests__/setupIndexedDb.ts'],
    include: [
      'src/__tests__/**/*.spec.ts',
      'src/__tests__/**/*.spec.tsx',
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
    ],
  },
};
