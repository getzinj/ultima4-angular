import { defineConfig } from 'vitest/config';

// The lifter's gate runs on its own: it needs the lifted output, which is generated, not committed.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: '.',
    include: ['tools/lift/gate/*.spec.ts'],
    reporters: ['default'],
  },
});
