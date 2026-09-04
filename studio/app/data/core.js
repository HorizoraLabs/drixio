import { mutateTableRecords } from '../../lib/api.js';
import { formatDisplayVal } from './utils.js';

export async function saveDataGridEdits() {
   if (!window.DataGrid) return;
   const { pendingEdits, pendingInserts, pendingDeletes, pkColumn, schema } =
      window.DataGrid;
   const tableName = window.AppState.currentTable;

   if (!tableName || !pkColumn) {
      alert('Cannot save: No Primary Key detected for this table.');
      return;
   }

   const hasEdits = Object.keys(pendingEdits || {}).length > 0;
   const hasInserts = pendingInserts?.some((row) =>
      Object.values(row).some(
         (val) => val !== '' && val !== null && val !== undefined,
      ),
   );
   const hasDeletes = pendingDeletes && pendingDeletes.size > 0;

   if (!hasEdits && !hasInserts && !hasDeletes) return;

   const deletesArray = pendingDeletes ? Array.from(pendingDeletes) : [];

   try {
      const res = await mutateTableRecords(tableName, {
         pkColumn,
         edits: pendingEdits,
         inserts: pendingInserts,
         deletes: deletesArray,
         schema: schema || [],
      });

      if (res.success) {
         if (window.DataGrid) {
            window.DataGrid.pendingEdits = {};
            window.DataGrid.pendingInserts = [{}];
            window.DataGrid.pendingDeletes = new Set();
            window.DataGrid.history = [];
            window.DataGrid.currentTransaction = null;
            if (window.DataGrid.refreshData) {
               window.DataGrid.refreshData();
            } else {
               window.renderCurrentView();
            }
         }
         window.updateSidebarActiveTable?.();
         window.loadTableStats?.();
         if (window.showToast) window.showToast('Data saved successfully!');
      } else {
         const errorMsg = res.error || 'Failed to save changes';
         if (window.showToast)
            window.showToast('Save failed: ' + errorMsg, 'error');
         else alert('Save failed:\n' + errorMsg);
         document.querySelectorAll('.cell-edited').forEach((td) => {
            td.classList.remove('cell-edited');
            td.classList.add('cell-error');
         });
      }
   } catch (e) {
      const errorMsg = e.message || 'Network error';
      if (window.showToast)
         window.showToast('Save failed: ' + errorMsg, 'error');
      else alert('Save failed:\n' + errorMsg);
      document.querySelectorAll('.cell-edited').forEach((td) => {
         td.classList.remove('cell-edited');
         td.classList.add('cell-error');
      });
   }
   window.updateSidebarDirtyState?.();
}

export function updateCell(td, newVal, columns, recordHistory = true) {
   if (recordHistory && window.DataGrid.currentTransaction) {
      let oldVal = td.textContent;
      if (oldVal === 'null' || td.classList.contains('ghost-row')) oldVal = '';
      if (oldVal !== newVal) {
         window.DataGrid.currentTransaction.push({ td, oldVal, newVal });
      }
   }

   const colName = td.dataset.col;
   const colIdx = td.dataset.colIdx;
   const ghostPlaceholder =
      colIdx === '0' ? `<span class="ghost-cell-hint">+ Add Row</span>` : '';
   const schema = window.DataGrid?.schema || [];
   const colSchema = schema.find((c) => c.name === colName);
   const displayInfo = formatDisplayVal(newVal, colSchema);

   td.innerHTML = newVal
      ? `<span class="cell-text">${displayInfo.html}</span>`
      : td.dataset.insertIndex !== undefined
        ? ghostPlaceholder
        : '<em>null</em>';
   if (displayInfo.title) {
      td.title = displayInfo.title;
   } else {
      td.removeAttribute('title');
   }

   if (td.dataset.insertIndex !== undefined) {
      const idx = parseInt(td.dataset.insertIndex);
      if (!window.DataGrid.pendingInserts[idx])
         window.DataGrid.pendingInserts[idx] = {};
      if (newVal) {
         window.DataGrid.pendingInserts[idx][colName] = newVal;
         td.classList.add('cell-edited');
         td.classList.remove('ghost-row');

         if (idx === window.DataGrid.pendingInserts.length - 1) {
            td.closest('tr').classList.remove('ghost-row-tr');
            window.DataGrid.pendingInserts.push({});
            const tbody = document.querySelector(
               `#data-grid-table-${window.AppState.currentTable} tbody`,
            );
            const tr = document.createElement('tr');
            tr.className = 'ghost-row-tr';
            const nextRowIdx = parseInt(td.dataset.rowIdx) + 1;
            tr.innerHTML += `<td class="row-header" data-row-idx="${nextRowIdx}">*</td>`;
            columns.forEach((c, cIdx) => {
               const hint =
                  cIdx === 0
                     ? `<span class="ghost-cell-hint">+ Add Row</span>`
                     : '';
               tr.innerHTML += `<td class="data-cell ghost-row" data-row-idx="${nextRowIdx}" data-col-idx="${cIdx}" data-insert-index="${idx + 1}" data-col="${c}">${hint}</td>`;
            });
            tbody.appendChild(tr);
         }
      } else {
         if (window.DataGrid.pendingInserts[idx]) {
            delete window.DataGrid.pendingInserts[idx][colName];
         }
         td.classList.remove('cell-edited');
         td.classList.add('ghost-row');
      }
   } else {
      const pk = td.dataset.pk;
      if (newVal !== td.dataset.original) {
         if (!window.DataGrid.pendingEdits[pk])
            window.DataGrid.pendingEdits[pk] = {};
         window.DataGrid.pendingEdits[pk][colName] = newVal;
         td.classList.add('cell-edited');
         td.classList.remove('cell-error');
      } else {
         td.classList.remove('cell-edited');
         td.classList.remove('cell-error');
         if (window.DataGrid.pendingEdits[pk]) {
            delete window.DataGrid.pendingEdits[pk][colName];
            if (Object.keys(window.DataGrid.pendingEdits[pk]).length === 0) {
               delete window.DataGrid.pendingEdits[pk];
            }
         }
      }
   }
   window.updateSidebarDirtyState?.();
}

export function markRowDeleted(rowIdx, recordHistory = true) {
   const tr = document
      .querySelector(
         `#data-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${rowIdx}"]`,
      )
      ?.closest('tr');
   if (!tr || tr.classList.contains('ghost-row-tr')) return;

   if (tr.classList.contains('row-deleted')) return;

   const firstCell = tr.querySelector('td.data-cell');
   const pk = firstCell?.dataset.pk;
   if (pk !== undefined) {
      if (recordHistory && window.DataGrid.currentTransaction) {
         window.DataGrid.currentTransaction.push({
            type: 'delete',
            rowIdx,
            pk,
         });
      }
      window.DataGrid.pendingDeletes.add(pk);
      tr.classList.add('row-deleted');
   } else if (firstCell?.dataset.insertIndex !== undefined) {
      const idx = parseInt(firstCell.dataset.insertIndex);
      if (window.DataGrid.pendingInserts[idx]) {
         delete window.DataGrid.pendingInserts[idx];
      }
      tr.remove();
   }
   window.updateSidebarDirtyState?.();
}

export function unmarkRowDeleted(rowIdx, pk) {
   const tr = document
      .querySelector(
         `#data-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${rowIdx}"]`,
      )
      ?.closest('tr');
   if (tr) tr.classList.remove('row-deleted');
   window.DataGrid.pendingDeletes.delete(pk);
   window.updateSidebarDirtyState?.();
}

export function duplicateDataRows(rowIndices, columns) {
   rowIndices.forEach((rowIdx) => {
      const t = window.AppState.currentTable;
      const tr = document
         .querySelector(
            `#data-grid-table-${t} td.data-cell[data-row-idx="${rowIdx}"]`,
         )
         ?.closest('tr');
      if (!tr || tr.classList.contains('ghost-row-tr')) return;

      let ghostTr = document.querySelector(
         `#data-grid-table-${t} .ghost-row-tr`,
      );
      if (!ghostTr) return;

      columns.forEach((col, cIdx) => {
         const sourceTd = tr.querySelector(
            `td.data-cell[data-col-idx="${cIdx}"]`,
         );
         const targetTd = ghostTr.querySelector(
            `td.data-cell[data-col-idx="${cIdx}"]`,
         );
         if (sourceTd && targetTd) {
            let val =
               sourceTd.dataset.insertIndex !== undefined
                  ? window.DataGrid.pendingInserts[
                       sourceTd.dataset.insertIndex
                    ][col]
                  : sourceTd.classList.contains('cell-edited')
                    ? window.DataGrid.pendingEdits[sourceTd.dataset.pk]?.[col]
                    : sourceTd.dataset.original;

            if (val !== undefined && val !== null && val !== 'null') {
               updateCell(targetTd, val, columns, true);
            }
         }
      });
   });
}
