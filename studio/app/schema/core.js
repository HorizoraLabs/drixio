import { mutateTableSchema, checkCascadeImpactApi } from '../../lib/api.js';
import { openCascadeConfirmModal } from './modals.js';

export async function saveSchemaEdits(forceOptions = {}) {
   if (!window.SchemaGrid) return;
   const {
      pendingEdits,
      pendingInserts,
      pendingDeletes,
      pendingIndexEdits,
      schema,
   } = window.SchemaGrid;
   const tableName = window.AppState.currentTable;

   if (!tableName) return;

   const hasColumnChanges =
      (pendingDeletes && pendingDeletes.size > 0) ||
      Object.keys(pendingEdits || {}).length > 0 ||
      (pendingInserts &&
         pendingInserts.some((r) => r.name && r.name.trim() !== ''));

   const hasIndexChanges =
      pendingIndexEdits &&
      (pendingIndexEdits.added.length > 0 ||
         pendingIndexEdits.dropped.length > 0);

   if (!hasColumnChanges && !hasIndexChanges) return;

   // Check if any PK column changed type and prompt for cascade confirmation
   if (!forceOptions.cascadeConfirmed) {
      let pkTypeChangeDetected = null;
      if (pendingEdits && schema) {
         for (const col of schema) {
            if (col.isPk && pendingEdits[col.name] && pendingEdits[col.name].type) {
               const newType = pendingEdits[col.name].type;
               if (newType.toLowerCase() !== (col.type || '').toLowerCase()) {
                  pkTypeChangeDetected = {
                     colName: col.name,
                     oldType: col.type,
                     newType,
                  };
                  break;
               }
            }
         }
      }

      if (pkTypeChangeDetected) {
         try {
            const checkRes = await checkCascadeImpactApi(
               tableName,
               pkTypeChangeDetected.colName,
               pkTypeChangeDetected.newType,
            );
            if (checkRes.success && checkRes.data && checkRes.data.hasDependents) {
               openCascadeConfirmModal({
                  tableName,
                  colName: pkTypeChangeDetected.colName,
                  oldType: pkTypeChangeDetected.oldType,
                  newType: pkTypeChangeDetected.newType,
                  dependents: checkRes.data.dependents,
                  needsReindexing: checkRes.data.needsReindexing,
                  onConfirm: () => {
                     saveSchemaEdits({
                        cascadeConfirmed: true,
                        cascadeFkTypes: true,
                        autoReindex: true,
                     });
                  },
               });
               return;
            }
         } catch (err) {
            console.error('Failed to check cascade impact:', err);
         }
      }
   }

   const deletesArray = pendingDeletes ? Array.from(pendingDeletes) : [];

   try {
      const res = await mutateTableSchema(tableName, {
         pendingEdits,
         pendingInserts,
         pendingDeletes: deletesArray,
         pendingIndexEdits,
         columns: schema,
         cascadeFkTypes: forceOptions.cascadeFkTypes ?? true,
         autoReindex: forceOptions.autoReindex ?? true,
      });

      if (res.success) {
         if (window.SchemaGrid) {
            window.SchemaGrid.pendingEdits = {};
            window.SchemaGrid.pendingInserts = [{}];
            window.SchemaGrid.pendingDeletes = new Set();
            window.SchemaGrid.pendingIndexEdits = { added: [], dropped: [] };
            window.SchemaGrid.history = [];
            window.SchemaGrid.currentTransaction = null;
         }

         if (window.TableStates?.[tableName]) {
            window.TableStates[tableName].dataGrid = null;
         }

         const refreshBtn = document.getElementById(
            `btn-refresh-schema-${tableName}`,
         );
         if (refreshBtn) refreshBtn.click();
         else window.renderCurrentView();

         window.updateSidebarDirtyState?.();
         window.loadTableStats?.();
         if (window.showToast) {
            window.showToast('Schema saved successfully!', 'success');
         }
      } else {
         const errorMsg = res.error || 'Failed to apply schema changes';
         if (window.showToast) {
            window.showToast(`Migration failed: ${errorMsg}`, 'error');
         } else {
            alert(`Migration failed: ${errorMsg}`);
         }
      }
   } catch (e) {
      const errorMsg = e.message || 'Network error';
      if (window.showToast) {
         window.showToast(`Migration failed: ${errorMsg}`, 'error');
      } else {
         alert(`Migration failed: ${errorMsg}`);
      }
   }
}

export function updateSchemaCell(td, newVal, columns, recordHistory = true) {
   if (recordHistory && window.SchemaGrid.currentTransaction) {
      let oldVal = td.textContent;
      if (oldVal === 'null' || td.classList.contains('ghost-row')) oldVal = '';
      if (oldVal !== newVal) {
         window.SchemaGrid.currentTransaction.push({ td, oldVal, newVal });
      }
   }

   const colKey = td.dataset.colKey;
   const colIdx = td.dataset.colIdx;
   const ghostPlaceholder =
      colIdx === '0' ? `<span class="ghost-cell-hint">+ Add Column</span>` : '';

   let displayHtml = newVal;
   if (colKey === 'isPk' && newVal) {
      const isPk = newVal.includes('PK') || newVal.includes('PFK');
      const fkMatch = newVal.match(
         /(?:FK|PFK)(?:\s*\(|:\s*|\s*→\s*|\s*->\s*)([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)(?:\s*\((CASCADE|SET NULL|RESTRICT|NO ACTION)\))?/i,
      );
      const actionTag =
         fkMatch && fkMatch[3] && fkMatch[3].toUpperCase() !== 'NO ACTION'
            ? ` (${fkMatch[3].toUpperCase()})`
            : '';
      if (isPk && fkMatch) {
         displayHtml = `<span class="col-badge badge-pfk" title="Primary Foreign Key (Composite Key referencing ${fkMatch[1]}.${fkMatch[2]}${actionTag ? ` [ON DELETE ${fkMatch[3]}]` : ''})">PFK &rarr; ${fkMatch[1]}.${fkMatch[2]}${actionTag}</span>`;
      } else if (isPk) {
         displayHtml = `<span class="col-badge badge-pk">PK</span>`;
      } else if (fkMatch) {
         displayHtml = `<span class="col-badge badge-fk" title="References ${fkMatch[1]}.${fkMatch[2]}${actionTag ? ` [ON DELETE ${fkMatch[3]}]` : ''}">FK &rarr; ${fkMatch[1]}.${fkMatch[2]}${actionTag}</span>`;
      }
   } else if (colKey === 'nullable' && newVal) {
      const isNull = newVal === 'Yes' || newVal === '1';
      displayHtml = isNull
         ? `<span class="badge-bool bool-true">Yes</span>`
         : `<span class="badge-bool bool-false">No</span>`;
   } else if (colKey === 'isUnique' && newVal) {
      const isUniq = newVal === 'Yes' || newVal === '1';
      displayHtml = isUniq
         ? `<span class="badge-unique">Yes</span>`
         : `<span class="text-soft">-</span>`;
   }

   td.innerHTML =
      displayHtml ||
      (td.dataset.insertIndex !== undefined
         ? ghostPlaceholder
         : `<span class="text-soft">-</span>`);

   if (td.dataset.insertIndex !== undefined) {
      const idx = parseInt(td.dataset.insertIndex);
      if (!window.SchemaGrid.pendingInserts[idx])
         window.SchemaGrid.pendingInserts[idx] = {};
      if (newVal) {
         window.SchemaGrid.pendingInserts[idx][colKey] = newVal;
         td.classList.add('cell-edited');
         td.classList.remove('ghost-row');

         if (idx === window.SchemaGrid.pendingInserts.length - 1) {
            td.closest('tr').classList.remove('ghost-row-tr');
            window.SchemaGrid.pendingInserts.push({});
            const tbody = document.querySelector(
               `#schema-grid-table-${window.AppState.currentTable} tbody`,
            );
            const tr = document.createElement('tr');
            tr.className = 'ghost-row-tr';
            const nextRowIdx = parseInt(td.dataset.rowIdx) + 1;
            tr.innerHTML += `<td class="row-header" data-row-idx="${nextRowIdx}">*</td>`;
            columns.forEach((c, cIdx) => {
               if (c === 'indexing') return;
               const hint =
                  cIdx === 0
                     ? `<span class="ghost-cell-hint">+ Add Column</span>`
                     : '';
               tr.innerHTML += `<td class="data-cell ghost-row" data-row-idx="${nextRowIdx}" data-col-idx="${cIdx}" data-insert-index="${idx + 1}" data-col-key="${c}">${hint}</td>`;
            });
            tbody.appendChild(tr);

            const manageCell = document.querySelector(
               `#schema-grid-table-${window.AppState.currentTable} .manage-indexes-cell`,
            );
            if (manageCell) {
               const currentSpan = parseInt(
                  manageCell.getAttribute('rowspan') || '1',
                  10,
               );
               manageCell.setAttribute('rowspan', String(currentSpan + 1));
            }
         }
      } else {
         if (window.SchemaGrid.pendingInserts[idx]) {
            delete window.SchemaGrid.pendingInserts[idx][colKey];
         }
         td.classList.remove('cell-edited');
         td.classList.add('ghost-row');
      }
   } else {
      const originalColName = td.dataset.pk;

      // Normalize dataset original for comparison (e.g. "-" is equivalent to "")
      let originalVal = td.dataset.original;
      if (originalVal === '-') originalVal = '';

      if (newVal !== originalVal) {
         if (!window.SchemaGrid.pendingEdits[originalColName])
            window.SchemaGrid.pendingEdits[originalColName] = {};
         window.SchemaGrid.pendingEdits[originalColName][colKey] = newVal;
         td.classList.add('cell-edited');
         td.classList.remove('cell-error');
      } else {
         td.classList.remove('cell-edited');
         td.classList.remove('cell-error');
         if (window.SchemaGrid.pendingEdits[originalColName]) {
            delete window.SchemaGrid.pendingEdits[originalColName][colKey];
            if (
               Object.keys(window.SchemaGrid.pendingEdits[originalColName])
                  .length === 0
            ) {
               delete window.SchemaGrid.pendingEdits[originalColName];
            }
         }
      }
   }
   window.updateSidebarDirtyState?.();
}

export function markSchemaRowDeleted(rowIdx, recordHistory = true) {
   const tr = document
      .querySelector(
         `#schema-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${rowIdx}"]`,
      )
      ?.closest('tr');
   if (!tr || tr.classList.contains('ghost-row-tr')) return;
   if (tr.classList.contains('row-deleted')) return;

   const firstCell = tr.querySelector('td.data-cell');
   const colName = firstCell?.dataset.pk;
   if (colName !== undefined) {
      if (recordHistory && window.SchemaGrid.currentTransaction) {
         window.SchemaGrid.currentTransaction.push({
            type: 'delete',
            rowIdx,
            pk: colName,
         });
      }
      window.SchemaGrid.pendingDeletes.add(colName);
      tr.classList.add('row-deleted');
   }
   window.updateSidebarDirtyState?.();
}

export function unmarkSchemaRowDeleted(rowIdx, colName) {
   const tr = document
      .querySelector(
         `#schema-grid-table-${window.AppState.currentTable} td.data-cell[data-row-idx="${rowIdx}"]`,
      )
      ?.closest('tr');
   if (tr) tr.classList.remove('row-deleted');
   window.SchemaGrid.pendingDeletes.delete(colName);
   window.updateSidebarDirtyState?.();
}
export function duplicateSchemaRows(rowIndices, columns) {
   rowIndices.forEach((rowIdx) => {
      const t = window.AppState.currentTable;
      const tr = document
         .querySelector(
            `#schema-grid-table-${t} td.data-cell[data-row-idx="${rowIdx}"]`,
         )
         ?.closest('tr');
      if (!tr || tr.classList.contains('ghost-row-tr')) return;

      let ghostTr = document.querySelector(
         `#schema-grid-table-${t} .ghost-row-tr`,
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
                  ? window.SchemaGrid.pendingInserts[
                       sourceTd.dataset.insertIndex
                    ][col]
                  : sourceTd.classList.contains('cell-edited')
                    ? window.SchemaGrid.pendingEdits[sourceTd.dataset.pk]?.[col]
                    : sourceTd.dataset.original;

            if (val !== undefined && val !== null && val !== 'null') {
               // Auto append _copy for the 'name' column to avoid immediate conflict
               if (col === 'name') {
                  val = val + '_copy';
               }
               updateSchemaCell(targetTd, val, columns, true);
            }
         }
      });
   });
}
