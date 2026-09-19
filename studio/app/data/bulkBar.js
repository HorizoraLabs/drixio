/**
 * Bulk Selection and Actions Bar for Drixio Studio Data Grid
 * Manages multi-row selection, Shift+Click range selection, and floating batch operations (export, delete).
 */

import { mutateTableRecords } from '../../lib/api.js';

let bulkBarEl = null;

export function getSelectedRows(tableName) {
   if (!window.DataGrid) return [];
   const selectedIndices = window.DataGrid.selectedRowIndices || new Set();
   const rows = window.DataGrid.rows || [];
   return Array.from(selectedIndices)
      .filter((idx) => idx >= 0 && idx < rows.length)
      .map((idx) => ({ index: idx, data: rows[idx] }));
}

export function clearRowSelection(tableName) {
   if (!window.DataGrid) return;
   window.DataGrid.selectedRowIndices = new Set();
   window.DataGrid.lastSelectedRowIndex = null;

   // Uncheck all row checkboxes
   const tableEl = document.getElementById(`data-grid-table-${tableName}`);
   if (tableEl) {
      tableEl.querySelectorAll('.row-select-checkbox').forEach((cb) => {
         cb.checked = false;
         cb.closest('tr')?.classList.remove('row-selected');
      });
      const selectAll = document.getElementById(`select-all-rows-${tableName}`);
      if (selectAll) {
         selectAll.checked = false;
         selectAll.indeterminate = false;
      }
      const cornerTh = document.getElementById(`th-row-header-${tableName}`);
      cornerTh?.classList.remove('has-selection');
   }

   updateBulkBar(tableName);
}

export function selectAllRows(tableName, shouldSelect) {
   if (!window.DataGrid) return;
   const rows = window.DataGrid.rows || [];
   const set = new Set();
   if (shouldSelect) {
      for (let i = 0; i < rows.length; i++) set.add(i);
   }
   window.DataGrid.selectedRowIndices = set;

   const tableEl = document.getElementById(`data-grid-table-${tableName}`);
   if (tableEl) {
      tableEl.querySelectorAll('.row-select-checkbox').forEach((cb) => {
         cb.checked = shouldSelect;
         if (shouldSelect) {
            cb.closest('tr')?.classList.add('row-selected');
         } else {
            cb.closest('tr')?.classList.remove('row-selected');
         }
      });
      const cornerTh = document.getElementById(`th-row-header-${tableName}`);
      if (shouldSelect && rows.length > 0) {
         cornerTh?.classList.add('has-selection');
      } else {
         cornerTh?.classList.remove('has-selection');
      }
   }

   updateBulkBar(tableName);
}

export function handleRowCheckboxChange(
   tableName,
   rowIndex,
   isChecked,
   isShiftKey,
) {
   if (!window.DataGrid) return;
   if (!window.DataGrid.selectedRowIndices) {
      window.DataGrid.selectedRowIndices = new Set();
   }

   const indices = window.DataGrid.selectedRowIndices;
   const lastIdx = window.DataGrid.lastSelectedRowIndex;

   if (isShiftKey && lastIdx !== null && lastIdx !== undefined) {
      // Range selection
      const start = Math.min(lastIdx, rowIndex);
      const end = Math.max(lastIdx, rowIndex);
      const tableEl = document.getElementById(`data-grid-table-${tableName}`);

      for (let i = start; i <= end; i++) {
         if (isChecked) {
            indices.add(i);
         } else {
            indices.delete(i);
         }
         const cb = tableEl?.querySelector(`.row-select-checkbox[data-row-idx="${i}"]`);
         if (cb) {
            cb.checked = isChecked;
            if (isChecked) {
               cb.closest('tr')?.classList.add('row-selected');
            } else {
               cb.closest('tr')?.classList.remove('row-selected');
            }
         }
      }
   } else {
      if (isChecked) {
         indices.add(rowIndex);
      } else {
         indices.delete(rowIndex);
      }
      const tableEl = document.getElementById(`data-grid-table-${tableName}`);
      const cb = tableEl?.querySelector(`.row-select-checkbox[data-row-idx="${rowIndex}"]`);
      if (cb) {
         cb.checked = isChecked;
         if (isChecked) {
            cb.closest('tr')?.classList.add('row-selected');
         } else {
            cb.closest('tr')?.classList.remove('row-selected');
         }
      }
   }

   window.DataGrid.lastSelectedRowIndex = rowIndex;
   updateSelectAllCheckbox(tableName);
   updateBulkBar(tableName);
}

function updateSelectAllCheckbox(tableName) {
   const selectAll = document.getElementById(`select-all-rows-${tableName}`);
   const cornerTh = document.getElementById(`th-row-header-${tableName}`);
   if (!selectAll || !window.DataGrid) return;
   const totalRows = (window.DataGrid.rows || []).length;
   const selectedCount = (window.DataGrid.selectedRowIndices || new Set()).size;

   if (selectedCount === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      cornerTh?.classList.remove('has-selection');
   } else if (selectedCount === totalRows) {
      selectAll.checked = true;
      selectAll.indeterminate = false;
      cornerTh?.classList.add('has-selection');
   } else {
      selectAll.checked = false;
      selectAll.indeterminate = true;
      cornerTh?.classList.add('has-selection');
   }
}

export function updateBulkBar(tableName) {
   let mount = document.getElementById(`bulk-bar-mount-${tableName}`);
   if (!mount) return;

   const selected = getSelectedRows(tableName);
   const count = selected.length;

   if (count === 0) {
      mount.innerHTML = '';
      return;
   }

   mount.innerHTML = /* html */ `
     <div class="bulk-actions-floating-bar" id="bulk-bar-${tableName}">
       <div class="bulk-bar-info">
         <span class="bulk-bar-count-badge">${count}</span>
         <span class="bulk-bar-label">row${count > 1 ? 's' : ''} selected</span>
       </div>

       <div class="bulk-bar-actions">
         <button type="button" class="bulk-bar-btn" id="bulk-export-csv-${tableName}" title="Export selected rows as CSV">
           <span class="material-symbols-outlined icon-16">description</span>
           <span>Export CSV</span>
         </button>
         <button type="button" class="bulk-bar-btn" id="bulk-export-json-${tableName}" title="Export selected rows as JSON">
           <span class="material-symbols-outlined icon-16">data_object</span>
           <span>Export JSON</span>
         </button>
         <button type="button" class="bulk-bar-btn" id="bulk-export-masked-${tableName}" title="Export selected rows with PII Data Masking">
           <span class="material-symbols-outlined icon-16" style="color: #10b981;">enhanced_encryption</span>
           <span>Masked CSV</span>
         </button>
         
         <div class="bulk-bar-divider"></div>

         <button type="button" class="bulk-bar-btn bulk-btn-delete" id="bulk-delete-${tableName}" title="Delete selected rows">
           <span class="material-symbols-outlined icon-16">delete</span>
           <span>Delete (${count})</span>
         </button>

         <button type="button" class="bulk-bar-btn bulk-btn-cancel" id="bulk-cancel-${tableName}" title="Clear selection">
           <span class="material-symbols-outlined icon-16">close</span>
         </button>
       </div>
     </div>
   `;

   const cancelBtn = document.getElementById(`bulk-cancel-${tableName}`);
   if (cancelBtn) cancelBtn.onclick = () => clearRowSelection(tableName);

   const csvBtn = document.getElementById(`bulk-export-csv-${tableName}`);
   if (csvBtn) {
      csvBtn.onclick = () => {
         const dataRows = selected.map((s) => s.data);
         exportSelectedRows(tableName, dataRows, 'csv');
      };
   }

   const jsonBtn = document.getElementById(`bulk-export-json-${tableName}`);
   if (jsonBtn) {
      jsonBtn.onclick = () => {
         const dataRows = selected.map((s) => s.data);
         exportSelectedRows(tableName, dataRows, 'json');
      };
   }

   const maskedBtn = document.getElementById(`bulk-export-masked-${tableName}`);
   if (maskedBtn) {
      maskedBtn.onclick = () => {
         const dataRows = selected.map((s) => s.data);
         exportSelectedRows(tableName, dataRows, 'csv', true);
      };
   }

   const deleteBtn = document.getElementById(`bulk-delete-${tableName}`);
   if (deleteBtn) {
      if (window.AppState?.isReadOnly) {
         deleteBtn.disabled = true;
         deleteBtn.title = 'Read-Only Mode Active';
      } else {
         deleteBtn.onclick = async () => {
            const confirmed = confirm(
               `Are you sure you want to permanently delete these ${count} selected row(s)?`,
            );
            if (!confirmed) return;

            const dg = window.DataGrid;
            const pkCol = dg?.pkColumn;
            const pkCols = dg?.pkColumns;
            const isComp = dg?.isCompositePk;

            // Collect delete keys
            const deletes = [];
            for (const item of selected) {
               if (isComp && pkCols) {
                  const compKey = {};
                  pkCols.forEach((col) => {
                     compKey[col] = item.data[col];
                  });
                  deletes.push(JSON.stringify(compKey));
               } else if (pkCol) {
                  deletes.push(item.data[pkCol]);
               }
            }

            deleteBtn.disabled = true;
            deleteBtn.innerHTML =
               '<span class="material-symbols-outlined animate-spin icon-16">progress_activity</span><span>Deleting...</span>';

            try {
               const res = await mutateTableRecords(tableName, {
                  pkColumn: pkCol,
                  pkColumns: pkCols,
                  deletes,
                  schema: dg.schema,
               });

               if (res.success) {
                  window.showToast?.(
                     `Successfully deleted ${count} row(s)`,
                     'success',
                  );
                  clearRowSelection(tableName);
                  const refreshBtn = document.getElementById(
                     `btn-refresh-data-${tableName}`,
                  );
                  if (refreshBtn) refreshBtn.click();
               } else {
                  window.showToast?.(
                     res.error || 'Failed to delete rows',
                     'error',
                  );
                  deleteBtn.disabled = false;
                  deleteBtn.innerHTML = `<span class="material-symbols-outlined icon-16">delete</span><span>Delete (${count})</span>`;
               }
            } catch (err) {
               window.showToast?.(err.message || 'Network error', 'error');
               deleteBtn.disabled = false;
               deleteBtn.innerHTML = `<span class="material-symbols-outlined icon-16">delete</span><span>Delete (${count})</span>`;
            }
         };
      }
   }
}

function exportSelectedRows(tableName, rows, format, mask = false) {
   if (!rows || rows.length === 0) return;
   const processedRows = mask ? anonymizeSelectedRows(rows) : rows;
   let content = '';
   let mime = 'text/plain';
   let ext = 'txt';

   if (format === 'json') {
      content = JSON.stringify(processedRows, null, 2);
      mime = 'application/json';
      ext = 'json';
   } else {
      const headers = Object.keys(processedRows[0]);
      const csvRows = [
         headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
      ];
      for (const row of processedRows) {
         const values = headers.map((h) => {
            const v = row[h];
            if (v === null || v === undefined) return '';
            const s = String(v).replace(/"/g, '""');
            return `"${s}"`;
         });
         csvRows.push(values.join(','));
      }
      content = csvRows.join('\n');
      mime = 'text/csv';
      ext = 'csv';
   }

   const blob = new Blob([content], { type: mime });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `${tableName}_selected_${mask ? 'masked_' : ''}${Date.now()}.${ext}`;
   a.click();
   URL.revokeObjectURL(url);
   window.showToast?.(
      `Exported ${processedRows.length} ${mask ? 'masked ' : ''}rows as ${ext.toUpperCase()}`,
      'success',
   );
}

function anonymizeSelectedRows(rows) {
   if (!rows || rows.length === 0) return rows;
   const EMAIL_RE = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
   const PHONE_RE = /^(\+?\d{1,4}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}$/;
   const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
   const SENSITIVE_COLS = /password|secret|token|hash|salt|api_key|credit_card|card_num|ssn/i;

   function hashStr(str) {
      let hash = 5381;
      for (let i = 0; i < str.length; i++) {
         hash = ((hash << 5) + hash) + str.charCodeAt(i);
         hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
   }

   return rows.map((r) => {
      const cloned = { ...r };
      for (const [k, v] of Object.entries(cloned)) {
         if (v === null || v === undefined) continue;
         const s = String(v).trim();
         if (SENSITIVE_COLS.test(k)) {
            cloned[k] = '[PROTECTED]';
         } else if (EMAIL_RE.test(s)) {
            cloned[k] = `user_${hashStr(s).slice(0, 6)}@example.test`;
         } else if (IP_RE.test(s)) {
            cloned[k] = `10.0.${parseInt(hashStr(s).slice(0, 2) || '0', 36) % 255}.${parseInt(hashStr(s).slice(2, 4) || '0', 36) % 255}`;
         } else if (PHONE_RE.test(s) && s.length >= 7) {
            cloned[k] = `+1-555-${hashStr(s).slice(0, 4)}`;
         }
      }
      return cloned;
   });
}
