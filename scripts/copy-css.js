const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'quill-resizable-table.css');
const dest = path.join(__dirname, '..', 'dist', 'quill-resizable-table.css');

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('CSS copied to dist/');
