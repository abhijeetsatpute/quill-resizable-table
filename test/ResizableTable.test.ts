import { JSDOM } from 'jsdom';
import { ResizableTable } from '../src/ResizableTable';

/** Minimal Quill mock — just enough for the module constructor */
function createMockQuill(root: HTMLElement) {
  return { root };
}

/** Build a basic 3×2 table inside a container */
function createTable(doc: Document): { container: HTMLDivElement; table: HTMLTableElement } {
  const container = doc.createElement('div');
  container.innerHTML = `
    <table>
      <tbody>
        <tr><td>A1</td><td>B1</td><td>C1</td></tr>
        <tr><td>A2</td><td>B2</td><td>C2</td></tr>
      </tbody>
    </table>
  `;
  doc.body.appendChild(container);
  const table = container.querySelector('table')!;
  return { container, table };
}

/** Simulate a mouse event at given clientX / clientY on a target */
function fire(
  target: Element,
  type: string,
  opts: { clientX?: number; clientY?: number } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
  });
  target.dispatchEvent(event);
  return event;
}

describe('ResizableTable', () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      pretendToBeVisual: true,
    });
    doc = dom.window.document;
    // Patch global document for the module (it uses document.addEventListener)
    (global as any).document = doc;
    (global as any).MouseEvent = dom.window.MouseEvent;
  });

  afterEach(() => {
    delete (global as any).document;
    delete (global as any).MouseEvent;
  });

  it('should instantiate without errors', () => {
    const { container } = createTable(doc);
    const quill = createMockQuill(container);
    const plugin = new ResizableTable(quill);
    expect(plugin).toBeInstanceOf(ResizableTable);
  });

  it('should accept boolean true (default options)', () => {
    const { container } = createTable(doc);
    const quill = createMockQuill(container);
    const plugin = new ResizableTable(quill, true);
    expect(plugin).toBeInstanceOf(ResizableTable);
  });

  it('should accept custom options', () => {
    const { container } = createTable(doc);
    const quill = createMockQuill(container);
    const plugin = new ResizableTable(quill, {
      handleSize: 10,
      minColumnWidth: 50,
      minRowHeight: 40,
    });
    expect(plugin).toBeInstanceOf(ResizableTable);
  });

  it('should apply colgroup when columns are resized', () => {
    const { container, table } = createTable(doc);
    const quill = createMockQuill(container);

    // Give cells a measurable size via jsdom stubs
    stubCellGeometry(table, 100, 30);

    const _plugin = new ResizableTable(quill, { handleSize: 10 });

    // Target the first cell's right edge
    const td = table.rows[0].cells[0];
    const rect = td.getBoundingClientRect();

    // mousedown near the right edge
    fire(td, 'mousedown', { clientX: rect.right - 2, clientY: rect.top + 10 });

    // mousemove to drag 30px wider
    fire(doc.documentElement, 'mousemove', {
      clientX: rect.right - 2 + 30,
      clientY: rect.top + 10,
    });

    // mouseup to finish
    fire(doc.documentElement, 'mouseup', {
      clientX: rect.right - 2 + 30,
      clientY: rect.top + 10,
    });

    // A <colgroup> should now exist
    const colgroup = table.querySelector('colgroup');
    expect(colgroup).not.toBeNull();
    expect(colgroup!.children.length).toBe(3);

    // First col should be wider (100 + 30 = 130)
    const firstColWidth = parseInt((colgroup!.children[0] as HTMLElement).style.width, 10);
    expect(firstColWidth).toBe(130);
  });

  it('should apply row height when rows are resized', () => {
    const { container, table } = createTable(doc);
    const quill = createMockQuill(container);

    stubCellGeometry(table, 100, 30);

    const _plugin = new ResizableTable(quill, { handleSize: 10 });

    const td = table.rows[0].cells[0];
    const rect = td.getBoundingClientRect();

    // mousedown near the bottom edge
    fire(td, 'mousedown', { clientX: rect.left + 10, clientY: rect.bottom - 2 });

    // drag 20px taller
    fire(doc.documentElement, 'mousemove', {
      clientX: rect.left + 10,
      clientY: rect.bottom - 2 + 20,
    });
    fire(doc.documentElement, 'mouseup', {
      clientX: rect.left + 10,
      clientY: rect.bottom - 2 + 20,
    });

    // First row should be taller
    const rowHeight = parseInt(table.rows[0].style.height, 10);
    expect(rowHeight).toBe(50); // 30 + 20
  });

  it('should enforce minimum column width', () => {
    const { container, table } = createTable(doc);
    const quill = createMockQuill(container);

    stubCellGeometry(table, 60, 30);

    const _plugin = new ResizableTable(quill, { handleSize: 10, minColumnWidth: 40 });

    const td = table.rows[0].cells[0];
    const rect = td.getBoundingClientRect();

    fire(td, 'mousedown', { clientX: rect.right - 2, clientY: rect.top + 10 });
    // Try to shrink below minimum (60 - 50 = 10, but min is 40)
    fire(doc.documentElement, 'mousemove', {
      clientX: rect.right - 2 - 50,
      clientY: rect.top + 10,
    });
    fire(doc.documentElement, 'mouseup', {
      clientX: rect.right - 2 - 50,
      clientY: rect.top + 10,
    });

    const colgroup = table.querySelector('colgroup');
    const firstColWidth = parseInt((colgroup!.children[0] as HTMLElement).style.width, 10);
    expect(firstColWidth).toBe(40); // clamped to min
  });

  it('should enforce minimum row height', () => {
    const { container, table } = createTable(doc);
    const quill = createMockQuill(container);

    stubCellGeometry(table, 100, 30);

    const _plugin = new ResizableTable(quill, { handleSize: 10, minRowHeight: 25 });

    const td = table.rows[0].cells[0];
    const rect = td.getBoundingClientRect();

    fire(td, 'mousedown', { clientX: rect.left + 10, clientY: rect.bottom - 2 });
    // Try to shrink below minimum (30 - 20 = 10, but min is 25)
    fire(doc.documentElement, 'mousemove', {
      clientX: rect.left + 10,
      clientY: rect.bottom - 2 - 20,
    });
    fire(doc.documentElement, 'mouseup', {
      clientX: rect.left + 10,
      clientY: rect.bottom - 2 - 20,
    });

    const rowHeight = parseInt(table.rows[0].style.height, 10);
    expect(rowHeight).toBe(25); // clamped to min
  });

  it('destroy() should clean up without errors', () => {
    const { container } = createTable(doc);
    const quill = createMockQuill(container);
    const plugin = new ResizableTable(quill);
    expect(() => plugin.destroy()).not.toThrow();
  });

  // ─── Column / Row mutation tests ─────────────────────────────

  describe('insertColumn', () => {
    it('should insert a column to the right', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      expect(table.rows[0].cells.length).toBe(3);
      plugin.insertColumn(table, 1, 'after');
      expect(table.rows[0].cells.length).toBe(4);
      expect(table.rows[1].cells.length).toBe(4);
      // Original cells should still be in place
      expect(table.rows[0].cells[0].textContent).toBe('A1');
      expect(table.rows[0].cells[1].textContent).toBe('B1');
      // New cell at index 2
      expect(table.rows[0].cells[2].innerHTML).toBe('<br>');
      expect(table.rows[0].cells[3].textContent).toBe('C1');
    });

    it('should insert a column to the left', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      plugin.insertColumn(table, 1, 'before');
      expect(table.rows[0].cells.length).toBe(4);
      expect(table.rows[0].cells[0].textContent).toBe('A1');
      // New cell at index 1
      expect(table.rows[0].cells[1].innerHTML).toBe('<br>');
      expect(table.rows[0].cells[2].textContent).toBe('B1');
      expect(table.rows[0].cells[3].textContent).toBe('C1');
    });

    it('should insert at the end when position is after last column', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      plugin.insertColumn(table, 2, 'after');
      expect(table.rows[0].cells.length).toBe(4);
      expect(table.rows[0].cells[3].innerHTML).toBe('<br>');
    });

    it('should update colgroup if it exists', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);

      stubCellGeometry(table, 100, 30);
      const plugin = new ResizableTable(quill, { handleSize: 10 });

      // Trigger a resize to create the colgroup
      const td = table.rows[0].cells[0];
      const rect = td.getBoundingClientRect();
      fire(td, 'mousedown', { clientX: rect.right - 2, clientY: rect.top + 10 });
      fire(doc.documentElement, 'mouseup', { clientX: rect.right - 2, clientY: rect.top + 10 });

      const colgroup = table.querySelector('colgroup');
      expect(colgroup).not.toBeNull();
      expect(colgroup!.children.length).toBe(3);

      plugin.insertColumn(table, 0, 'after');
      expect(colgroup!.children.length).toBe(4);
    });
  });

  describe('deleteColumn', () => {
    it('should delete a column', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      plugin.deleteColumn(table, 1);
      expect(table.rows[0].cells.length).toBe(2);
      expect(table.rows[0].cells[0].textContent).toBe('A1');
      expect(table.rows[0].cells[1].textContent).toBe('C1');
      expect(table.rows[1].cells[0].textContent).toBe('A2');
      expect(table.rows[1].cells[1].textContent).toBe('C2');
    });

    it('should not delete the last column', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      plugin.deleteColumn(table, 0);
      plugin.deleteColumn(table, 0);
      // Now only 1 column left — should refuse
      expect(table.rows[0].cells.length).toBe(1);
      plugin.deleteColumn(table, 0);
      expect(table.rows[0].cells.length).toBe(1); // still 1
    });
  });

  describe('insertRow', () => {
    it('should insert a row below', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      expect(table.rows.length).toBe(2);
      plugin.insertRow(table, 0, 'after');
      expect(table.rows.length).toBe(3);
      // New row at index 1 with 3 cells
      expect(table.rows[1].cells.length).toBe(3);
      expect(table.rows[1].cells[0].innerHTML).toBe('<br>');
      // Original second row moved to index 2
      expect(table.rows[2].cells[0].textContent).toBe('A2');
    });

    it('should insert a row above', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      plugin.insertRow(table, 1, 'before');
      expect(table.rows.length).toBe(3);
      // New row at index 1
      expect(table.rows[1].cells.length).toBe(3);
      expect(table.rows[1].cells[0].innerHTML).toBe('<br>');
      // Original rows
      expect(table.rows[0].cells[0].textContent).toBe('A1');
      expect(table.rows[2].cells[0].textContent).toBe('A2');
    });

    it('should insert at the end when after last row', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      plugin.insertRow(table, 1, 'after');
      expect(table.rows.length).toBe(3);
      expect(table.rows[2].cells.length).toBe(3);
      expect(table.rows[2].cells[0].innerHTML).toBe('<br>');
    });
  });

  describe('deleteRow', () => {
    it('should delete a row', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      plugin.deleteRow(table, 0);
      expect(table.rows.length).toBe(1);
      expect(table.rows[0].cells[0].textContent).toBe('A2');
    });

    it('should not delete the last row', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const plugin = new ResizableTable(quill);

      plugin.deleteRow(table, 0);
      expect(table.rows.length).toBe(1);
      plugin.deleteRow(table, 0);
      expect(table.rows.length).toBe(1); // still 1
    });
  });

  describe('context menu', () => {
    it('should show context menu on right-click inside a cell', () => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const _plugin = new ResizableTable(quill);

      const td = table.rows[0].cells[1];
      fire(td, 'contextmenu', { clientX: 50, clientY: 20 });

      const menu = doc.querySelector('.qrt-context-menu');
      expect(menu).not.toBeNull();
      const items = menu!.querySelectorAll('.qrt-context-menu-item');
      expect(items.length).toBe(6);
    });

    it('should dismiss context menu on outside click', (done) => {
      const { container, table } = createTable(doc);
      const quill = createMockQuill(container);
      const _plugin = new ResizableTable(quill);

      const td = table.rows[0].cells[0];
      fire(td, 'contextmenu', { clientX: 10, clientY: 10 });

      expect(doc.querySelector('.qrt-context-menu')).not.toBeNull();

      // The dismiss listener is attached via setTimeout(fn, 0), so wait a tick
      setTimeout(() => {
        fire(doc.body, 'mousedown', { clientX: 500, clientY: 500 });
        expect(doc.querySelector('.qrt-context-menu')).toBeNull();
        done();
      }, 10);
    });

    it('should not show context menu outside a table cell', () => {
      const { container } = createTable(doc);
      const quill = createMockQuill(container);
      const _plugin = new ResizableTable(quill);

      fire(container, 'contextmenu', { clientX: 10, clientY: 10 });
      expect(doc.querySelector('.qrt-context-menu')).toBeNull();
    });
  });
});

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * JSDOM doesn't do layout, so we stub getBoundingClientRect and offsetWidth/Height
 * to simulate cells of given width × height arranged in a grid.
 */
function stubCellGeometry(table: HTMLTableElement, cellWidth: number, cellHeight: number) {
  const rows = Array.from(table.rows);
  rows.forEach((row, ri) => {
    // Stub row offsetHeight
    Object.defineProperty(row, 'offsetHeight', { value: cellHeight, configurable: true });

    const cells = Array.from(row.cells);
    cells.forEach((cell, ci) => {
      const left = ci * cellWidth;
      const top = ri * cellHeight;
      const right = left + cellWidth;
      const bottom = top + cellHeight;

      Object.defineProperty(cell, 'offsetWidth', { value: cellWidth, configurable: true });
      Object.defineProperty(cell, 'offsetHeight', { value: cellHeight, configurable: true });

      cell.getBoundingClientRect = () => ({
        left,
        top,
        right,
        bottom,
        width: cellWidth,
        height: cellHeight,
        x: left,
        y: top,
        toJSON: () => ({}),
      });
    });
  });

  // Stub table-level dimensions
  const totalWidth = (table.rows[0]?.cells.length ?? 0) * cellWidth;
  const totalHeight = rows.length * cellHeight;
  Object.defineProperty(table, 'offsetWidth', { value: totalWidth, configurable: true });
  Object.defineProperty(table, 'offsetHeight', { value: totalHeight, configurable: true });
}
