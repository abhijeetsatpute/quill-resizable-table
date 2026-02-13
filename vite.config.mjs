import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  base: '/quill-resizable-table/',
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
        // Copy the built CSS and UMD JS to gh-pages
        mkdirSync(resolve('gh-pages'), { recursive: true });
        copyFileSync(
          resolve('dist/quill-resizable-table.css'),
          resolve('gh-pages/quill-resizable-table.css')
        );
        copyFileSync(
          resolve('dist/quill-resizable-table.umd.js'),
          resolve('gh-pages/quill-resizable-table-umd.js')
        );
      },
    },
  ],
});
