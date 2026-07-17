/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the bridge-angular SDK unit tests. Uses the AnalogJS Angular
 * vite plugin so `.spec.ts` files can use Angular's TestBed with real template
 * compilation, running under jsdom. Scoped to the SDK's own `src/lib/**`.
 */
export default defineConfig({
  plugins: [angular({ tsconfig: 'tsconfig.spec.json' })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
  },
});
