import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/quill-resizable-table.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    {
      file: 'dist/quill-resizable-table.esm.js',
      format: 'es',
      sourcemap: true,
    },
    {
      file: 'dist/quill-resizable-table.umd.js',
      format: 'umd',
      name: 'QuillResizableTable',
      sourcemap: true,
      exports: 'named',
      globals: {
        quill: 'Quill',
      },
    },
  ],
  external: ['quill'],
  plugins: [
    typescript({ tsconfig: './tsconfig.json' }),
  ],
};
