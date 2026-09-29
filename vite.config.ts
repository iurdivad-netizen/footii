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
    // Vite warns above 500 kB. This is a single-page game served as one bundle
    // (about 150 kB gzipped), and the default is a rule of thumb for apps that
    // could split by route — this one has nothing to split off that a player
    // would not need on the first screen. Raised rather than silenced: 600 still
    // trips if the bundle keeps growing, which is the signal worth keeping.
    chunkSizeWarningLimit: 600,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
