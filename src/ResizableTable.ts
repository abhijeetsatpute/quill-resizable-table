/**
 * quill-resizable-table
 * Drag-to-resize columns, rows, and entire tables inside a Quill editor.
 * Right-click context menu & floating edge buttons for adding/removing rows & columns.
 */

export interface ResizableTableOptions {
  /** Pixel width of the invisible grab zone on each border (default 5) */
  handleSize?: number;
  /** Minimum column width in px (default 30) */
  minColumnWidth?: number;
  /** Minimum row height in px (default 20) */
  minRowHeight?: number;
  /** Minimum table width in px (default 50) */
  minTableWidth?: number;
  /** Minimum table height in px (default 30) */
  minTableHeight?: number;
}

const DEFAULTS: Required<ResizableTableOptions> = {
  handleSize: 5,
  minColumnWidth: 30,
  minRowHeight: 20,
  minTableWidth: 50,
  minTableHeight: 30,
};

type Edge = 'col' | 'row' | 'corner';

interface DragState {
  edge: Edge;
  /** The table element being resized */
  table: HTMLTableElement;
  /** Starting mouse X */
  startX: number;
  /** Starting mouse Y */
  startY: number;
  /** Column index (for col / corner) */
  colIndex: number;
  /** Row index (for row / corner) */
  rowIndex: number;
  /** Snapshot of column widths at drag start (px) */
  colWidths: number[];
  /** Snapshot of row heights at drag start (px) */
  rowHeights: number[];
  /** Snapshot of table width at drag start */
  tableWidth: number;
  /** Snapshot of table height at drag start */
  tableHeight: number;
}

export class ResizableTable {
  private quill: any;
  private options: Required<ResizableTableOptions>;
  private drag: DragState | null = null;
  private overlay: HTMLDivElement | null = null;
  private doc: Document;

  // Context menu
  private contextMenu: HTMLDivElement | null = null;
  private contextCell: HTMLTableCellElement | null = null;

  // Edge buttons
  private addColBtn: HTMLDivElement | null = null;
  private addRowBtn: HTMLDivElement | null = null;
  private deleteTableBtn: HTMLDivElement | null = null;
  private hoveredTable: HTMLTableElement | null = null;
  private hideEdgeBtnTimer: ReturnType<typeof setTimeout> | null = null;

  // Bound handlers so we can remove them later
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onEditorMouseMoveBound: (e: MouseEvent) => void;
  private onEditorMouseDownBound: (e: MouseEvent) => void;
  private onContextMenuBound: (e: MouseEvent) => void;
  private onDismissMenuBound: (e: MouseEvent) => void;
  private onDismissMenuKeyBound: (e: KeyboardEvent) => void;
  private onEditorMouseOverBound: (e: MouseEvent) => void;
  private onEditorMouseOutBound: (e: MouseEvent) => void;
  private onScrollBound: () => void;

  constructor(quill: any, options: ResizableTableOptions | boolean = {}) {
    this.quill = quill;
    this.options = { ...DEFAULTS, ...(typeof options === 'object' ? options : {}) };
    this.doc = (quill.root as HTMLElement).ownerDocument;

    this.onMouseMoveBound = this.onDocumentMouseMove.bind(this);
    this.onMouseUpBound = this.onDocumentMouseUp.bind(this);
    this.onEditorMouseMoveBound = this.onEditorMouseMove.bind(this);
    this.onEditorMouseDownBound = this.onEditorMouseDown.bind(this);
    this.onContextMenuBound = this.onContextMenu.bind(this);
    this.onDismissMenuBound = this.dismissContextMenu.bind(this);
    this.onDismissMenuKeyBound = this.onKeyDown.bind(this);
    this.onEditorMouseOverBound = this.onEditorMouseOver.bind(this);
    this.onEditorMouseOutBound = this.onEditorMouseOut.bind(this);
    this.onScrollBound = this.onScroll.bind(this);

    this.attach();
    this.registerToolbarHandler();
  }

  /** Table icon SVG for the Quill toolbar */
  static TABLE_ICON = '<svg viewBox="0 0 18 18"><rect class="ql-stroke" height="12" width="12" x="3" y="3" fill="none"/><line class="ql-stroke" x1="3" y1="7" x2="15" y2="7"/><line class="ql-stroke" x1="3" y1="11" x2="15" y2="11"/><line class="ql-stroke" x1="7" y1="3" x2="7" y2="15"/><line class="ql-stroke" x1="11" y1="3" x2="11" y2="15"/></svg>';

  /** Hook into Quill's toolbar to handle the "table" button */
  private registerToolbarHandler(): void {
    const toolbar = this.quill.getModule?.('toolbar');
    if (toolbar) {
      toolbar.addHandler('table', () => this.insertNewTable());
    }
  }

  /** Wire up listeners on the editor root */
  private attach(): void {
    const root = this.quill.root as HTMLElement;
    root.addEventListener('mousemove', this.onEditorMouseMoveBound);
    root.addEventListener('mousedown', this.onEditorMouseDownBound);
    root.addEventListener('contextmenu', this.onContextMenuBound);
    root.addEventListener('mouseover', this.onEditorMouseOverBound);
    root.addEventListener('mouseout', this.onEditorMouseOutBound);
  }

  /** Remove all listeners (call if you ever destroy the module) */
  public destroy(): void {
    const root = this.quill.root as HTMLElement;
    root.removeEventListener('mousemove', this.onEditorMouseMoveBound);
    root.removeEventListener('mousedown', this.onEditorMouseDownBound);
    root.removeEventListener('contextmenu', this.onContextMenuBound);
    root.removeEventListener('mouseover', this.onEditorMouseOverBound);
    root.removeEventListener('mouseout', this.onEditorMouseOutBound);
    this.doc.removeEventListener('mousemove', this.onMouseMoveBound);
    this.doc.removeEventListener('mouseup', this.onMouseUpBound);
    this.doc.removeEventListener('scroll', this.onScrollBound, true);
    this.removeOverlay();
    this.dismissContextMenu();
    this.removeEdgeButtons();
  }

  // ─── Cursor & hit-testing ────────────────────────────────────────

  /**
   * Detect which resize edge (if any) the mouse is near.
   * Returns null when the cursor isn't on a resize boundary.
   */
  private detectEdge(
    e: MouseEvent,
  ): { edge: Edge; table: HTMLTableElement; colIndex: number; rowIndex: number } | null {
    const target = e.target as HTMLElement;
    const td = target.closest('td, th') as HTMLTableCellElement | null;
    if (!td) return null;

    const table = td.closest('table') as HTMLTableElement | null;
    if (!table) return null;

    const hs = this.options.handleSize;
    const rect = td.getBoundingClientRect();

    const nearRight = e.clientX >= rect.right - hs;
    const nearBottom = e.clientY >= rect.bottom - hs;

    if (!nearRight && !nearBottom) return null;

    // Determine col / row indices
    const colIndex = this.getCellColIndex(td);
    const rowIndex = this.getCellRowIndex(td, table);

    if (nearRight && nearBottom) {
      // Corner of a cell on the last row & last col → table resize
      const isLastCol = colIndex + (td.colSpan || 1) - 1 === this.getColumnCount(table) - 1;
      const isLastRow = rowIndex + (td.rowSpan || 1) - 1 === table.rows.length - 1;
      if (isLastCol && isLastRow) {
        return { edge: 'corner', table, colIndex, rowIndex };
      }
      // Otherwise prefer column resize (feels more natural)
      return { edge: 'col', table, colIndex: colIndex + (td.colSpan || 1) - 1, rowIndex };
    }

    if (nearRight) {
      return { edge: 'col', table, colIndex: colIndex + (td.colSpan || 1) - 1, rowIndex };
    }

    // nearBottom
    return { edge: 'row', table, colIndex, rowIndex: rowIndex + (td.rowSpan || 1) - 1 };
  }

  // ─── Mouse handlers (editor) ────────────────────────────────────

  /** Update cursor style as the mouse moves over cells */
  private onEditorMouseMove(e: MouseEvent): void {
    if (this.drag) return; // already dragging

    // Clear all resize cursor classes
    const cells = (this.quill.root as HTMLElement).querySelectorAll('td.qrt-resize-col, td.qrt-resize-row, td.qrt-resize-corner, th.qrt-resize-col, th.qrt-resize-row, th.qrt-resize-corner');
    cells.forEach(cell => {
      cell.classList.remove('qrt-resize-col', 'qrt-resize-row', 'qrt-resize-corner');
    });

    const hit = this.detectEdge(e);
    if (!hit) return;

    // Add the appropriate cursor class to the cell
    const target = e.target as HTMLElement;
    const cell = target.closest('td, th') as HTMLTableCellElement | null;
    if (!cell) return;

    switch (hit.edge) {
      case 'col':
        cell.classList.add('qrt-resize-col');
        break;
      case 'row':
        cell.classList.add('qrt-resize-row');
        break;
      case 'corner':
        cell.classList.add('qrt-resize-corner');
        break;
    }
  }

  /** Start a drag operation */
  private onEditorMouseDown(e: MouseEvent): void {
    const hit = this.detectEdge(e);
    if (!hit) return;

    e.preventDefault();
    e.stopPropagation();

    const { table } = hit;

    // Snapshot current geometry
    const colWidths = this.getColumnWidths(table);
    const rowHeights = this.getRowHeights(table);

    this.drag = {
      edge: hit.edge,
      table,
      startX: e.clientX,
      startY: e.clientY,
      colIndex: hit.colIndex,
      rowIndex: hit.rowIndex,
      colWidths,
      rowHeights,
      tableWidth: table.offsetWidth,
      tableHeight: table.offsetHeight,
    };

    // Apply explicit sizes so relative sizing doesn't shift
    this.applyColumnWidths(table, colWidths);
    this.applyRowHeights(table, rowHeights);

    this.addOverlay();

    this.doc.addEventListener('mousemove', this.onMouseMoveBound);
    this.doc.addEventListener('mouseup', this.onMouseUpBound);
  }

  // ─── Mouse handlers (document, during drag) ─────────────────────

  private onDocumentMouseMove(e: MouseEvent): void {
    if (!this.drag) return;
    e.preventDefault();

    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;

    const { edge, table, colIndex, rowIndex, colWidths, rowHeights } = this.drag;

    if (edge === 'col' || edge === 'corner') {
      const newWidth = Math.max(this.options.minColumnWidth, colWidths[colIndex] + dx);
      this.resizeColumnDirect(table, colIndex, newWidth);
    }

    if (edge === 'row' || edge === 'corner') {
      const newHeight = Math.max(this.options.minRowHeight, rowHeights[rowIndex] + dy);
      const updated = [...rowHeights];
      updated[rowIndex] = newHeight;
      this.applyRowHeights(table, updated);
    }
  }

  private onDocumentMouseUp(_e: MouseEvent): void {
    this.doc.removeEventListener('mousemove', this.onMouseMoveBound);
    this.doc.removeEventListener('mouseup', this.onMouseUpBound);
    this.drag = null;
    this.removeOverlay();
    (this.quill.root as HTMLElement).style.cursor = '';
  }

  // ─── Overlay (prevents text selection during drag) ──────────────

  private addOverlay(): void {
    if (this.overlay) return;
    this.overlay = this.doc.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '9999',
      cursor: this.drag
        ? this.drag.edge === 'col'
          ? 'col-resize'
          : this.drag.edge === 'row'
            ? 'row-resize'
            : 'nwse-resize'
        : 'default',
    });
    this.doc.body.appendChild(this.overlay);
  }

  private removeOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  // ─── Geometry helpers ───────────────────────────────────────────

  /** Get the visual column index of a cell accounting for previous colSpans */
  private getCellColIndex(td: HTMLTableCellElement): number {
    let index = 0;
    let sibling = td.previousElementSibling as HTMLTableCellElement | null;
    while (sibling) {
      index += sibling.colSpan || 1;
      sibling = sibling.previousElementSibling as HTMLTableCellElement | null;
    }
    return index;
  }

  /** Get the row index of a cell */
  private getCellRowIndex(td: HTMLTableCellElement, table: HTMLTableElement): number {
    const row = td.parentElement as HTMLTableRowElement;
    return Array.from(table.rows).indexOf(row);
  }

  /** Total number of visual columns in the first row */
  private getColumnCount(table: HTMLTableElement): number {
    if (table.rows.length === 0) return 0;
    const firstRow = table.rows[0];
    let count = 0;
    for (let i = 0; i < firstRow.cells.length; i++) {
      count += firstRow.cells[i].colSpan || 1;
    }
    return count;
  }

  /** Read current column widths from the first row's cells */
  private getColumnWidths(table: HTMLTableElement): number[] {
    if (table.rows.length === 0) return [];
    const firstRow = table.rows[0];
    const widths: number[] = [];
    for (let i = 0; i < firstRow.cells.length; i++) {
      const cell = firstRow.cells[i];
      const span = cell.colSpan || 1;
      const w = cell.offsetWidth / span;
      for (let s = 0; s < span; s++) {
        widths.push(w);
      }
    }
    return widths;
  }

  /** Read current row heights */
  private getRowHeights(table: HTMLTableElement): number[] {
    return Array.from(table.rows).map((row) => row.offsetHeight);
  }

  /** Apply column widths via a <colgroup> */
  private applyColumnWidths(table: HTMLTableElement, widths: number[]): void {
    // Ensure table has layout=fixed for predictable sizing
    table.style.tableLayout = 'fixed';
    table.style.width = widths.reduce((a, b) => a + b, 0) + 'px';

    const doc = table.ownerDocument;
    let colgroup = table.querySelector('colgroup');
    if (!colgroup) {
      colgroup = doc.createElement('colgroup');
      table.insertBefore(colgroup, table.firstChild);
    }

    // Sync <col> elements
    while (colgroup.children.length > widths.length) {
      colgroup.removeChild(colgroup.lastChild!);
    }
    while (colgroup.children.length < widths.length) {
      colgroup.appendChild(doc.createElement('col'));
    }

    for (let i = 0; i < widths.length; i++) {
      (colgroup.children[i] as HTMLElement).style.width = widths[i] + 'px';
    }
  }

  /** Resize a single column independently (only that column changes width) */
  private resizeColumnDirect(table: HTMLTableElement, colIndex: number, newWidth: number): void {
    const doc = table.ownerDocument;
    table.style.tableLayout = 'fixed';

    // Get or create colgroup
    let colgroup = table.querySelector('colgroup');
    if (!colgroup) {
      colgroup = doc.createElement('colgroup');
      table.insertBefore(colgroup, table.firstChild);

      // Initialize all cols with current widths
      const colWidths = this.getColumnWidths(table);
      for (const width of colWidths) {
        const col = doc.createElement('col');
        col.style.width = width + 'px';
        colgroup.appendChild(col);
      }
    }

    // Ensure we have enough col elements
    while (colgroup.children.length < colIndex + 1) {
      colgroup.appendChild(doc.createElement('col'));
    }

    // Resize just this column
    (colgroup.children[colIndex] as HTMLElement).style.width = newWidth + 'px';

    // Update table width to be sum of all columns
    const allCols = Array.from(colgroup.children) as HTMLElement[];
    const totalWidth = allCols.reduce((sum, col) => {
      const w = col.style.width;
      return sum + (w ? parseFloat(w) : 0);
    }, 0);
    table.style.width = totalWidth + 'px';

    this.syncQuill();
  }

  /** Apply row heights directly on <tr> elements */
  private applyRowHeights(table: HTMLTableElement, heights: number[]): void {
    const rows = table.rows;
    for (let i = 0; i < heights.length && i < rows.length; i++) {
      rows[i].style.height = heights[i] + 'px';
    }
  }

  // ─── Context menu ─────────────────────────────────────────────

  private onContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const td = target.closest('td, th') as HTMLTableCellElement | null;
    if (!td) return;

    const table = td.closest('table') as HTMLTableElement | null;
    if (!table) return;

    e.preventDefault();
    e.stopPropagation();

    this.contextCell = td;
    this.showContextMenu(e.clientX, e.clientY, td, table);
  }

  private showContextMenu(
    x: number,
    y: number,
    td: HTMLTableCellElement,
    table: HTMLTableElement,
  ): void {
    this.dismissContextMenu();

    const menu = this.doc.createElement('div');
    menu.className = 'qrt-context-menu';
    Object.assign(menu.style, {
      position: 'fixed',
      left: x + 'px',
      top: y + 'px',
      zIndex: '10000',
    });

    const colIndex = this.getCellColIndex(td);
    const rowIndex = this.getCellRowIndex(td, table);
    const colCount = this.getColumnCount(table);
    const rowCount = table.rows.length;

    const items: { label: string; action: () => void; dividerAfter?: boolean; disabled?: boolean }[] = [
      { label: 'Insert Column Left', action: () => this.insertColumn(table, colIndex, 'before') },
      { label: 'Insert Column Right', action: () => this.insertColumn(table, colIndex, 'after') },
      { label: 'Delete Column', action: () => this.deleteColumn(table, colIndex), dividerAfter: true, disabled: colCount <= 1 },
      { label: 'Insert Row Above', action: () => this.insertRow(table, rowIndex, 'before') },
      { label: 'Insert Row Below', action: () => this.insertRow(table, rowIndex, 'after') },
      { label: 'Delete Row', action: () => this.deleteRow(table, rowIndex), dividerAfter: true, disabled: rowCount <= 1 },
      { label: 'Delete Table', action: () => this.deleteTable(table) },
    ];

    for (const item of items) {
      const el = this.doc.createElement('div');
      el.className = 'qrt-context-menu-item' + (item.disabled ? ' qrt-disabled' : '');
      el.textContent = item.label;
      if (!item.disabled) {
        el.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          item.action();
          this.dismissContextMenu();
        });
      }
      menu.appendChild(el);

      if (item.dividerAfter) {
        const divider = this.doc.createElement('div');
        divider.className = 'qrt-context-menu-divider';
        menu.appendChild(divider);
      }
    }

    this.doc.body.appendChild(menu);
    this.contextMenu = menu;

    // Dismiss on click outside or Escape
    setTimeout(() => {
      this.doc.addEventListener('mousedown', this.onDismissMenuBound);
      this.doc.addEventListener('keydown', this.onDismissMenuKeyBound);
    }, 0);
  }

  private dismissContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
      this.contextCell = null;
      this.doc.removeEventListener('mousedown', this.onDismissMenuBound);
      this.doc.removeEventListener('keydown', this.onDismissMenuKeyBound);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.dismissContextMenu();
    }
  }

  // ─── Edge buttons (+ buttons on table hover) ─────────────────

  private cancelHideEdgeButtons(): void {
    if (this.hideEdgeBtnTimer) {
      clearTimeout(this.hideEdgeBtnTimer);
      this.hideEdgeBtnTimer = null;
    }
  }

  private scheduleHideEdgeButtons(): void {
    this.cancelHideEdgeButtons();
    this.hideEdgeBtnTimer = setTimeout(() => {
      this.removeEdgeButtons();
      this.hoveredTable = null;
    }, 200);
  }

  private onEditorMouseOver(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const table = target.closest('table') as HTMLTableElement | null;

    // Mouse re-entered the same table or a button — cancel any pending hide
    if (table && table === this.hoveredTable) {
      this.cancelHideEdgeButtons();
      return;
    }

    if (!table) return;

    this.cancelHideEdgeButtons();
    this.removeEdgeButtons();
    this.hoveredTable = table;
    this.showEdgeButtons(table);
  }

  private onEditorMouseOut(e: MouseEvent): void {
    const related = e.relatedTarget as HTMLElement | null;
    if (!this.hoveredTable) return;

    // Still inside the table or on a button? keep showing
    if (related && (
      this.hoveredTable.contains(related) ||
      this.addColBtn?.contains(related) ||
      this.addRowBtn?.contains(related) ||
      this.deleteTableBtn?.contains(related)
    )) {
      return;
    }

    // Delay removal so the user can cross the gap to reach the button
    this.scheduleHideEdgeButtons();
  }

  /** Update button positions on scroll to keep them anchored to the table */
  private onScroll(): void {
    if (!this.hoveredTable) return;

    const rect = this.hoveredTable.getBoundingClientRect();

    if (this.addColBtn) {
      Object.assign(this.addColBtn.style, {
        left: (rect.right + 4) + 'px',
        top: (rect.top + rect.height / 2 - 12) + 'px',
      });
    }

    if (this.addRowBtn) {
      Object.assign(this.addRowBtn.style, {
        left: (rect.left + rect.width / 2 - 12) + 'px',
        top: (rect.bottom + 4) + 'px',
      });
    }

    if (this.deleteTableBtn) {
      Object.assign(this.deleteTableBtn.style, {
        right: (window.innerWidth - rect.right + 4) + 'px',
        top: (rect.top - 20) + 'px',
      });
    }
  }

  private showEdgeButtons(table: HTMLTableElement): void {
    const rect = table.getBoundingClientRect();

    // Attach scroll listener to reposition buttons
    this.doc.addEventListener('scroll', this.onScrollBound, true);

    // + Column button (right edge, vertically centered)
    this.addColBtn = this.doc.createElement('div');
    this.addColBtn.className = 'qrt-edge-btn';
    this.addColBtn.textContent = '+';
    this.addColBtn.title = 'Add column';
    Object.assign(this.addColBtn.style, {
      position: 'fixed',
      left: (rect.right + 4) + 'px',
      top: (rect.top + rect.height / 2 - 12) + 'px',
      zIndex: '10000',
      cursor: 'pointer',
    });
    this.addColBtn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.cancelHideEdgeButtons();
      const colCount = this.getColumnCount(table);
      this.insertColumn(table, colCount - 1, 'after');
      this.removeEdgeButtons();
      this.showEdgeButtons(table);
    });
    this.addColBtn.addEventListener('mouseenter', () => {
      this.cancelHideEdgeButtons();
    });
    this.addColBtn.addEventListener('mouseleave', (ev) => {
      const related = ev.relatedTarget as HTMLElement | null;
      if (related && (table.contains(related) || this.addRowBtn?.contains(related))) return;
      this.scheduleHideEdgeButtons();
    });
    this.doc.body.appendChild(this.addColBtn);

    // + Row button (bottom edge, horizontally centered)
    this.addRowBtn = this.doc.createElement('div');
    this.addRowBtn.className = 'qrt-edge-btn';
    this.addRowBtn.textContent = '+';
    this.addRowBtn.title = 'Add row';
    Object.assign(this.addRowBtn.style, {
      position: 'fixed',
      left: (rect.left + rect.width / 2 - 12) + 'px',
      top: (rect.bottom + 4) + 'px',
      zIndex: '10000',
      cursor: 'pointer',
    });
    this.addRowBtn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.cancelHideEdgeButtons();
      this.insertRow(table, table.rows.length - 1, 'after');
      this.removeEdgeButtons();
      this.showEdgeButtons(table);
    });
    this.addRowBtn.addEventListener('mouseenter', () => {
      this.cancelHideEdgeButtons();
    });
    this.addRowBtn.addEventListener('mouseleave', (ev) => {
      const related = ev.relatedTarget as HTMLElement | null;
      if (related && (table.contains(related) || this.addColBtn?.contains(related))) return;
      this.scheduleHideEdgeButtons();
    });
    this.doc.body.appendChild(this.addRowBtn);

    // Delete Table button (top-right corner)
    this.deleteTableBtn = this.doc.createElement('div');
    this.deleteTableBtn.className = 'qrt-delete-table-btn';
    this.deleteTableBtn.innerHTML = '✕';
    this.deleteTableBtn.title = 'Delete table';
    Object.assign(this.deleteTableBtn.style, {
      position: 'fixed',
      right: (window.innerWidth - rect.right + 4) + 'px',
      top: (rect.top - 20) + 'px',
      zIndex: '10000',
      cursor: 'pointer',
    });
    this.deleteTableBtn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.cancelHideEdgeButtons();
      this.deleteTable(table);
      this.removeEdgeButtons();
    });
    this.deleteTableBtn.addEventListener('mouseenter', () => {
      this.cancelHideEdgeButtons();
    });
    this.deleteTableBtn.addEventListener('mouseleave', (ev) => {
      const related = ev.relatedTarget as HTMLElement | null;
      if (related && (table.contains(related) || this.addColBtn?.contains(related) || this.addRowBtn?.contains(related))) return;
      this.scheduleHideEdgeButtons();
    });
    this.doc.body.appendChild(this.deleteTableBtn);
  }

  private removeEdgeButtons(): void {
    this.cancelHideEdgeButtons();
    if (this.addColBtn) { this.addColBtn.remove(); this.addColBtn = null; }
    if (this.addRowBtn) { this.addRowBtn.remove(); this.addRowBtn = null; }
    if (this.deleteTableBtn) { this.deleteTableBtn.remove(); this.deleteTableBtn = null; }
    // Remove scroll listener
    this.doc.removeEventListener('scroll', this.onScrollBound, true);
  }

  // ─── Table creation ─────────────────────────────────────────

  /** Insert a new 3×3 table at the current cursor position */
  public insertNewTable(rows = 3, cols = 3): void {
    const range = this.quill.getSelection?.(true);
    if (!range) return;

    // Build table HTML
    const cellHTML = '<td><br></td>';
    const rowHTML = `<tr>${cellHTML.repeat(cols)}</tr>`;
    const tableHTML = `<table><tbody>${rowHTML.repeat(rows)}</tbody></table>`;

    // Insert at cursor via clipboard (preserves Quill delta consistency)
    this.quill.clipboard.dangerouslyPasteHTML(range.index, tableHTML, 'user');
    this.syncQuill();
  }

  // ─── Table mutation methods ───────────────────────────────────

  /**
   * Consume pending MutationObserver records so Quill's async handler
   * never processes our structural DOM changes (which it would corrupt).
   * Style-only changes (resize) don't need this — only structural ones.
   */
  private syncQuill(): void {
    try {
      const scroll = this.quill?.scroll;
      if (scroll?.observer) {
        // Grab and discard all pending mutation records before
        // Quill's microtask callback can process them
        scroll.observer.takeRecords();
      }
    } catch {
      // Quill internals not accessible — ignore silently
    }
  }

  /** Insert a column before or after colIndex */
  public insertColumn(table: HTMLTableElement, colIndex: number, position: 'before' | 'after'): void {
    const targetIndex = position === 'after' ? colIndex + 1 : colIndex;

    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      const newCell = row.insertCell(Math.min(targetIndex, row.cells.length));
      newCell.innerHTML = '<br>';
    }

    // Update colgroup if it exists
    const colgroup = table.querySelector('colgroup');
    if (colgroup) {
      const col = table.ownerDocument.createElement('col');
      col.style.width = this.options.minColumnWidth + 'px';
      if (targetIndex < colgroup.children.length) {
        colgroup.insertBefore(col, colgroup.children[targetIndex]);
      } else {
        colgroup.appendChild(col);
      }
      // Recalculate table width
      table.style.width = (table.offsetWidth + this.options.minColumnWidth) + 'px';
    }

    this.syncQuill();
  }

  /** Delete column at colIndex (no-op if only 1 column remains) */
  public deleteColumn(table: HTMLTableElement, colIndex: number): void {
    if (this.getColumnCount(table) <= 1) return;

    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      if (colIndex < row.cells.length) {
        row.deleteCell(colIndex);
      }
    }

    // Update colgroup if it exists
    const colgroup = table.querySelector('colgroup');
    if (colgroup && colIndex < colgroup.children.length) {
      colgroup.removeChild(colgroup.children[colIndex]);
      // Recalculate table width from remaining cols
      let total = 0;
      for (let i = 0; i < colgroup.children.length; i++) {
        total += parseInt((colgroup.children[i] as HTMLElement).style.width, 10) || this.options.minColumnWidth;
      }
      table.style.width = total + 'px';
    }

    this.syncQuill();
  }

  /** Insert a row before or after rowIndex */
  public insertRow(table: HTMLTableElement, rowIndex: number, position: 'before' | 'after'): void {
    const targetIndex = position === 'after' ? rowIndex + 1 : rowIndex;
    const colCount = this.getColumnCount(table);
    const newRow = table.insertRow(Math.min(targetIndex, table.rows.length));

    for (let c = 0; c < colCount; c++) {
      const cell = newRow.insertCell();
      cell.innerHTML = '<br>';
    }

    this.syncQuill();
  }

  /** Delete row at rowIndex (no-op if only 1 row remains) */
  public deleteRow(table: HTMLTableElement, rowIndex: number): void {
    if (table.rows.length <= 1) return;
    table.deleteRow(rowIndex);
    this.syncQuill();
  }

  /** Delete the entire table */
  public deleteTable(table: HTMLTableElement): void {
    table.remove();
    this.syncQuill();
  }
}
