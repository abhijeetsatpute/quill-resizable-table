import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  build: {
    outDir: '../gh-pages',
    emptyOutDir: true,
  },
});
