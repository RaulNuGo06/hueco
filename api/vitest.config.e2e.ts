import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Cada fichero arranca PGlite y aplica las migraciones: con varios a la vez, en un portátil pasa de 10 s
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
