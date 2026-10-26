import { defineConfig } from 'vitest/config';

// A relative base ('./') makes the build work at any URL path, including
// https://<user>.github.io/<repo>/, without knowing the repo name.
// Set VITE_BASE (e.g. VITE_BASE=/chess-coach/) if you prefer an absolute base.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  build: { target: 'es2022' },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
