import { defineConfig } from 'vitest/config';

// `base` matters for GitHub Pages: the site is served from
// https://<user>.github.io/<repo>/ so all asset URLs need the repo prefix.
// Locally (and on any root-served host) we want plain '/'.
// The deploy workflow sets GITHUB_PAGES=true.
const base = process.env.GITHUB_PAGES === 'true' ? '/footii/' : '/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
