import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  root: 'demo',
  build: {
    outDir: '../gh-pages',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'copy-library',
      apply: 'build',
      async generateBundle() {
        // Copy the built CSS and JS to gh-pages
        mkdirSync(resolve('gh-pages'), { recursive: true });
        copyFileSync(
          resolve('dist/quill-resizable-table.css'),
          resolve('gh-pages/quill-resizable-table.css')
        );
      },
    },
  ],
});
