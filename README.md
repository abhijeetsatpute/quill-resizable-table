# quill-resizable-table

A [Quill.js](https://quilljs.com/) plugin for drag-resizable tables -- resize columns, rows, and the entire table. Add or remove rows and columns with a right-click context menu or floating edge buttons.

**[📺 Live Demo](https://abhijeetsatpute.github.io/quill-resizable-table/)**

<p align="center">
  <img src="" alt="quill-resizable-table demo" width="700" />
  <br />
  <em><!-- Add your demo GIF here --></em>
</p>

---

## Features

- **Drag to resize** columns, rows, or the entire table
- **Right-click context menu** to insert/delete rows and columns
- **Floating buttons** on table edges for quick row/column addition and **table deletion**
- **Delete table** via context menu or floating delete button
- **Toolbar button** with a table icon to insert new tables
- Works with **Quill 1.3+** and **Quill 2.x**
- Zero dependencies (only Quill as a peer dependency)
- Ships ESM, CJS, and UMD builds
- TypeScript types included
- **Comprehensive test coverage** (80%+ test coverage)

## Installation

```bash
npm install quill-resizable-table
```

## Quick Start

```js
import Quill from 'quill';
import { ResizableTable } from 'quill-resizable-table';
import 'quill-resizable-table/dist/quill-resizable-table.css';

Quill.register('modules/resizableTable', ResizableTable);

const quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    toolbar: [['bold', 'italic'], ['table']],
    resizableTable: true,
  },
});
```

Tables inside the editor are now resizable by drag, and you get a context menu and edge buttons for free.

## Usage Examples

### Toolbar table button

Register the built-in table icon so the toolbar renders a clickable grid button:

```js
import Quill from 'quill';
import { ResizableTable } from 'quill-resizable-table';
import 'quill-resizable-table/dist/quill-resizable-table.css';

// Register icon BEFORE creating the editor
const icons = Quill.import('ui/icons');
icons['table'] = ResizableTable.TABLE_ICON;

Quill.register('modules/resizableTable', ResizableTable);

const quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ header: [1, 2, 3, false] }],
      ['table'],
      ['clean'],
    ],
    resizableTable: true,
  },
});
```

Clicking the table button inserts a 3x3 table at the cursor position.

### Custom options

```js
const quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    resizableTable: {
      handleSize: 8,          // grab-zone width in px (default: 5)
      minColumnWidth: 50,     // minimum column width in px (default: 30)
      minRowHeight: 30,       // minimum row height in px (default: 20)
    },
  },
});
```

### UMD / CDN (no bundler)

```html
<link href="https://cdn.jsdelivr.net/npm/quill@2/dist/quill.snow.css" rel="stylesheet" />
<link href="https://cdn.jsdelivr.net/npm/quill-resizable-table/dist/quill-resizable-table.css" rel="stylesheet" />

<script src="https://cdn.jsdelivr.net/npm/quill@2/dist/quill.js"></script>
<script src="https://cdn.jsdelivr.net/npm/quill-resizable-table/dist/quill-resizable-table.umd.js"></script>

<div id="editor"></div>

<script>
  var ResizableTable = QuillResizableTable.ResizableTable;

  var icons = Quill.import('ui/icons');
  icons['table'] = ResizableTable.TABLE_ICON;

  Quill.register('modules/resizableTable', ResizableTable);

  var quill = new Quill('#editor', {
    theme: 'snow',
    modules: {
      toolbar: [['bold', 'italic'], ['table']],
      resizableTable: true,
    },
  });
</script>
```

### Programmatic table insertion

```js
const resizableTable = quill.getModule('resizableTable');

// Insert a 4x5 table at the cursor
resizableTable.insertNewTable(4, 5);
```

### Programmatic row/column/table manipulation

```js
const resizableTable = quill.getModule('resizableTable');
const table = document.querySelector('.ql-editor table');

resizableTable.insertColumn(table, 1, 'after');   // column right of index 1
resizableTable.insertColumn(table, 0, 'before');   // column left of index 0
resizableTable.insertRow(table, 0, 'after');        // row below index 0
resizableTable.insertRow(table, 2, 'before');       // row above index 2
resizableTable.deleteColumn(table, 2);              // remove column 2
resizableTable.deleteRow(table, 1);                 // remove row 1
resizableTable.deleteTable(table);                  // remove entire table
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `handleSize` | `number` | `5` | Width (px) of the invisible grab zone on cell borders |
| `minColumnWidth` | `number` | `30` | Minimum column width in px during resize |
| `minRowHeight` | `number` | `20` | Minimum row height in px during resize |

## How It Works

| Action | How |
|---|---|
| Resize a column | Drag the right edge of any cell |
| Resize a row | Drag the bottom edge of any cell |
| Resize the table | Drag the bottom-right corner of the table |
| Insert/delete rows & columns | Right-click any cell for the context menu |
| Quick-add row or column | Hover the right or bottom edge of a table, click **+** |
| Delete table | Right-click any cell → **Delete Table** or hover table and click red **✕** button |
| Insert a new table | Click the table icon in the toolbar |

## API

### `ResizableTable`

| Method | Description |
|---|---|
| `insertNewTable(rows?, cols?)` | Insert a new table at the cursor (default 3x3) |
| `insertColumn(table, colIndex, 'before' \| 'after')` | Insert a column |
| `deleteColumn(table, colIndex)` | Delete a column (min 1 enforced) |
| `insertRow(table, rowIndex, 'before' \| 'after')` | Insert a row |
| `deleteRow(table, rowIndex)` | Delete a row (min 1 enforced) |
| `deleteTable(table)` | Delete the entire table |
| `destroy()` | Remove all listeners and clean up |

### Static Properties

| Property | Description |
|---|---|
| `ResizableTable.TABLE_ICON` | SVG string for the Quill toolbar table icon |

## Development

```bash
git clone https://github.com/abhijeetsatpute/quill-resizable-table.git
cd quill-resizable-table
npm install
npm run dev       # start demo at localhost
npm test          # run tests
npm run build     # build dist/
```

### Test Coverage

The project maintains comprehensive test coverage:

- **42 tests** covering all core functionality
- **80%+ code coverage** (Statements: 80.39%, Branches: 52.79%, Functions: 75%, Lines: 83.46%)
- Tests for table resizing, row/column operations, table deletion, context menus, and edge button interactions

Run tests with coverage:
```bash
npm test -- --coverage
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) -- Abhijeet Satpute
