// Minimal config exported as plain object to avoid importing 'vitest/config'
export default {
  test: {
    // Use jsdom so DOM-based component tests can run normally
    environment: 'jsdom',
    globals: true,
    include: [
      'src/__tests__/**/*.spec.ts',
      'src/__tests__/**/*.spec.tsx',
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
    ],
  },
};
