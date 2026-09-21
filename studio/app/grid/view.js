import { updateBulkBar, syncRowSelectedClasses } from '../data/bulkBar.js';

export function renderSelection(tableId, gridState) {
   document
      .querySelectorAll(
         `#${tableId} .cell-in-range, #${tableId} .cell-selected, #${tableId} .range-top, #${tableId} .range-bottom, #${tableId} .range-left, #${tableId} .range-right, #${tableId} .row-header-selected`,
      )
      .forEach((el) => {
         el.classList.remove(
            'cell-in-range',
            'cell-selected',
            'range-top',
            'range-bottom',
            'range-left',
            'range-right',
            'row-header-selected',
         );
      });

   const s = gridState.selection;
   if (!s || s.startRow === -1) return;

   const minR = Math.min(s.startRow, s.endRow);
   const maxR = Math.max(s.startRow, s.endRow);
   const minC = Math.min(s.startCol, s.endCol);
   const maxC = Math.max(s.startCol, s.endCol);

   document.querySelectorAll(`#${tableId} td.data-cell`).forEach((td) => {
      const r = parseInt(td.dataset.rowIdx);
      const c = parseInt(td.dataset.colIdx);
      if (r >= minR && r <= maxR && c >= minC && c <= maxC) {
         td.classList.add('cell-in-range');
         if (r === minR) td.classList.add('range-top');
         if (r === maxR) td.classList.add('range-bottom');
         if (c === minC) td.classList.add('range-left');
         if (c === maxC) td.classList.add('range-right');
         if (r === s.startRow && c === s.startCol) {
            td.classList.add('cell-selected');
            gridState.selectedCell = td;
         }
      }
   });

   // Highlight row headers if the whole row is selected (either during dragging or persisting)
   if (s.isRowSelection || s.isDraggingRow) {
      document.querySelectorAll(`#${tableId} td.row-header`).forEach((td) => {
         const r = parseInt(td.dataset.rowIdx);
         if (r >= minR && r <= maxR) {
            td.classList.add('row-header-selected');
         }
      });
   }
}
window.renderSelection = renderSelection;

export function selectAllGridCells(tableId, gridState, columnsLength) {
   const rowElements = document.querySelectorAll(
      `#${tableId} tbody tr:not(.ghost-row-tr)`,
   );
   const totalRows = rowElements.length;
   if (totalRows === 0) return;

   gridState.selection = {
      isDragging: false,
      isDraggingRow: false,
      isRowSelection: true,
      startRow: 0,
      endRow: totalRows - 1,
      startCol: 0,
      endCol: Math.max(0, columnsLength - 1),
   };
   renderSelection(tableId, gridState);
}

export function bindCellSelection(
   tableContainer,
   tableId,
   gridState,
   columnsLength,
) {
   tableContainer.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      const rowHeader = e.target.closest('td.row-header');
      if (rowHeader && e.button !== 2) {
         const r = parseInt(rowHeader.dataset.rowIdx);
         if (isNaN(r)) return;

         const tableName = tableId.replace(/^data-grid-table-/, '');
         if (!window.DataGrid) window.DataGrid = {};
         if (!window.DataGrid.selectedRowIndices) {
            window.DataGrid.selectedRowIndices = new Set();
         }

         if (
            e.shiftKey &&
            gridState.selection &&
            gridState.selection.startRow !== -1
         ) {
            // Extend existing row selection with Shift+Click
            gridState.selection.isDragging = false;
            gridState.selection.isDraggingRow = false;
            gridState.selection.isRowSelection = true;
            gridState.selection.endRow = r;
            gridState.selection.startCol = 0;
            gridState.selection.endCol = columnsLength - 1;

            const minR = Math.min(gridState.selection.startRow, r);
            const maxR = Math.max(gridState.selection.startRow, r);
            window.DataGrid.selectedRowIndices = new Set();
            for (let i = minR; i <= maxR; i++) {
               window.DataGrid.selectedRowIndices.add(i);
            }
         } else if (e.ctrlKey || e.metaKey) {
            // Toggle row in multi-selection with Ctrl/Cmd+Click
            if (window.DataGrid.selectedRowIndices.has(r)) {
               window.DataGrid.selectedRowIndices.delete(r);
            } else {
               window.DataGrid.selectedRowIndices.add(r);
            }
            gridState.selection = {
               isDragging: false,
               isDraggingRow: false,
               isRowSelection: true,
               startRow: r,
               endRow: r,
               startCol: 0,
               endCol: columnsLength - 1,
            };
         } else {
            // Click single row
            gridState.selection = {
               isDragging: false,
               isDraggingRow: true,
               isRowSelection: true,
               startRow: r,
               endRow: r,
               startCol: 0,
               endCol: columnsLength - 1,
            };
            window.DataGrid.selectedRowIndices = new Set([r]);
         }

         renderSelection(tableId, gridState);
         syncRowSelectedClasses(tableName, window.DataGrid.selectedRowIndices);
         updateBulkBar(tableName);
         return;
      }

      const td = e.target.closest('td.data-cell');
      if (!td) return;

      const tableName = tableId.replace(/^data-grid-table-/, '');
      if (window.DataGrid?.selectedRowIndices?.size > 0) {
         window.DataGrid.selectedRowIndices = new Set();
         syncRowSelectedClasses(tableName, window.DataGrid.selectedRowIndices);
         updateBulkBar(tableName);
      }

      const r = parseInt(td.dataset.rowIdx);
      const c = parseInt(td.dataset.colIdx);
      if (isNaN(r) || isNaN(c)) return;

      if (
         e.shiftKey &&
         gridState.selection &&
         gridState.selection.startRow !== -1
      ) {
         // Extend existing cell range selection with Shift+Click
         gridState.selection.isDragging = false;
         gridState.selection.isDraggingRow = false;
         gridState.selection.isRowSelection = false;
         gridState.selection.endRow = r;
         gridState.selection.endCol = c;
      } else {
         gridState.selection = {
            isDragging: true,
            isRowSelection: false,
            startRow: r,
            startCol: c,
            endRow: r,
            endCol: c,
         };
      }
      renderSelection(tableId, gridState);
   });

   tableContainer.addEventListener('mouseover', (e) => {
      if (gridState.selection?.isDraggingRow) {
         const rowHeader = e.target.closest('td.row-header');
         if (!rowHeader) return;
         const r = parseInt(rowHeader.dataset.rowIdx);
         if (isNaN(r)) return;
         gridState.selection.endRow = r;

         const minR = Math.min(gridState.selection.startRow, r);
         const maxR = Math.max(gridState.selection.startRow, r);
         window.DataGrid.selectedRowIndices = new Set();
         for (let i = minR; i <= maxR; i++) {
            window.DataGrid.selectedRowIndices.add(i);
         }

         renderSelection(tableId, gridState);
         const tableName = tableId.replace(/^data-grid-table-/, '');
         syncRowSelectedClasses(tableName, window.DataGrid.selectedRowIndices);
         updateBulkBar(tableName);
         return;
      }

      if (!gridState.selection?.isDragging) return;
      const td = e.target.closest('td.data-cell');
      if (!td) return;
      gridState.selection.endRow = parseInt(td.dataset.rowIdx);
      gridState.selection.endCol = parseInt(td.dataset.colIdx);
      renderSelection(tableId, gridState);
   });

   tableContainer.addEventListener('mouseup', () => {
      if (gridState.selection) {
         gridState.selection.isDragging = false;
         gridState.selection.isDraggingRow = false;
      }
   });
}

export function bindColumnResizer(th, gridState) {
   const resizer = document.createElement('div');
   resizer.className = 'resizer';
   th.appendChild(resizer);
   resizer.addEventListener('click', (e) => e.stopPropagation());

   // Double-click to auto-fit / reset column width to content
   resizer.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      th.style.width = '';
      th.style.minWidth = '';
      th.style.maxWidth = '';
   });

   resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.pageX;
      const startWidth = th.offsetWidth;
      let hasDragged = false;

      // Prevent text selection during column resize
      document.body.style.userSelect = 'none';

      const onMouseMove = (e2) => {
         hasDragged = true;
         if (gridState) gridState.isResizing = true;
         // Enforce a minimum column width of 60px to prevent disappearing columns
         const newWidth = Math.max(60, startWidth + (e2.pageX - startX));
         th.style.width = newWidth + 'px';
         th.style.minWidth = newWidth + 'px';
         th.style.maxWidth = newWidth + 'px';
      };

      const onMouseUp = () => {
         document.removeEventListener('mousemove', onMouseMove);
         document.removeEventListener('mouseup', onMouseUp);
         document.body.style.cursor = '';
         document.body.style.userSelect = '';
         if (hasDragged) {
            setTimeout(() => {
               if (gridState) gridState.isResizing = false;
            }, 100);
         }
      };

      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
   });
}
