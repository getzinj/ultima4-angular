import angular from '@analogjs/vite-plugin-angular';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [angular({ tsconfig: path.resolve(import.meta.dirname, 'tsconfig.spec.json') })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts', 'tools/lift/*.spec.ts', 'tools/symbols/*.spec.ts'],
    reporters: ['default'],
    pool: 'forks',
    maxWorkers: 4,
    // A shared module registry is much faster, at the cost of vi.mock(), which nothing here needs.
    isolate: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.spec.ts',
        'src/test-setup.ts',
        'src/main.ts',
        '**/*.d.ts',
      ],
    },
  },
});
