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
   if (s.startRow === -1) return;

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

   // Highlight row headers if the whole row is selected
   if (s.isDraggingRow) {
      document.querySelectorAll(`#${tableId} td.row-header`).forEach((td) => {
         const r = parseInt(td.dataset.rowIdx);
         if (r >= minR && r <= maxR) {
            td.classList.add('row-header-selected');
         }
      });
   }
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
         gridState.selection = {
            isDragging: false,
            isDraggingRow: true,
            isRowSelection: true,
            startRow: r,
            endRow: r,
            startCol: 0,
            endCol: columnsLength - 1,
         };
         renderSelection(tableId, gridState);
         return;
      }

      const td = e.target.closest('td.data-cell');
      if (!td) return;

      const r = parseInt(td.dataset.rowIdx);
      const c = parseInt(td.dataset.colIdx);
      gridState.selection = {
         isDragging: true,
         isRowSelection: false,
         startRow: r,
         startCol: c,
         endRow: r,
         endCol: c,
      };
      renderSelection(tableId, gridState);
   });

   tableContainer.addEventListener('mouseover', (e) => {
      if (gridState.selection.isDraggingRow) {
         const rowHeader = e.target.closest('td.row-header');
         if (!rowHeader) return;
         gridState.selection.endRow = parseInt(rowHeader.dataset.rowIdx);
         renderSelection(tableId, gridState);
         return;
      }

      if (!gridState.selection.isDragging) return;
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

   // Handle Context Menu for Row Deletion is now in grid/events.js
}

export function bindColumnResizer(th, gridState) {
   const resizer = document.createElement('div');
   resizer.className = 'resizer';
   th.appendChild(resizer);
   resizer.addEventListener('click', (e) => e.stopPropagation());

   resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let startX = e.pageX;
      let startWidth = th.offsetWidth;
      let hasDragged = false;

      const onMouseMove = (e2) => {
         hasDragged = true;
         if (gridState) gridState.isResizing = true;
         const newWidth = startWidth + (e2.pageX - startX);
         th.style.width = newWidth + 'px';
         th.style.minWidth = newWidth + 'px';
         th.style.maxWidth = newWidth + 'px';
      };

      const onMouseUp = () => {
         document.removeEventListener('mousemove', onMouseMove);
         document.removeEventListener('mouseup', onMouseUp);
         document.body.style.cursor = '';
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
