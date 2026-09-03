import { executeRawQuery } from '../../lib/api.js';

export async function saveSchemaEdits() {
   if (!window.SchemaGrid) return;
   const { pendingEdits, pendingInserts, pendingDeletes } = window.SchemaGrid;
   const tableName = window.AppState.currentTable;

   if (!tableName) return;

   const { pendingIndexEdits } = window.SchemaGrid;
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

   // Handle SQLite via Backend Table Re-creation
   if (window.AppState.dbType === 'sqlite' && hasColumnChanges) {
      try {
         const origSchema = window.SchemaGrid.schema || [];
         const renames = {};
         const updatedColumns = [];

         for (const col of origSchema) {
            if (pendingDeletes && pendingDeletes.has(col.name)) {
               continue; // Dropped column
            }

            const edits = pendingEdits[col.name] || {};
            let colName = col.name;
            if (edits.name && edits.name !== col.name) {
               renames[col.name] = edits.name;
               colName = edits.name;
            }

            let type = edits.type !== undefined ? edits.type : col.type;

            let isPk = col.isPk;
            let fkTarget = col.fkTarget;
            if (edits.isPk !== undefined) {
               const isPkStr = String(edits.isPk).toUpperCase();
               isPk =
                  isPkStr === '1' ||
                  isPkStr === 'TRUE' ||
                  isPkStr === 'YES' ||
                  isPkStr.includes('PK') ||
                  isPkStr === 'KEY';

               if (isPkStr.includes('FK:') || isPkStr.includes('PFK:')) {
                  const fkMatch = String(edits.isPk).match(
                     /(?:FK|PFK):\s*([^\s,]+)/i,
                  );
                  if (fkMatch && fkMatch[1]) {
                     const parts = fkMatch[1].split('.');
                     if (parts.length === 2) {
                        fkTarget = { table: parts[0], column: parts[1] };
                     }
                  }
               } else {
                  fkTarget = undefined;
               }
            }

            let nullable =
               edits.nullable !== undefined ? edits.nullable : col.nullable;
            const isNullable = !(
               nullable === '0' ||
               nullable === 'No' ||
               nullable === false
            );

            let defaultValue =
               edits.defaultValue !== undefined
                  ? edits.defaultValue
                  : col.defaultValue;

            let isUnique = col.isUnique;
            if (edits.isUnique !== undefined) {
               isUnique =
                  edits.isUnique === 'Yes' ||
                  edits.isUnique === '1' ||
                  edits.isUnique === true;
            }

            updatedColumns.push({
               name: colName,
               type: type || 'TEXT',
               isPk: !!isPk,
               nullable: isNullable,
               defaultValue: defaultValue || undefined,
               isUnique: !!isUnique,
               fkTarget,
            });
         }

         // Add newly inserted columns
         if (pendingInserts) {
            for (const row of pendingInserts) {
               if (!row.name || row.name.trim() === '') continue;
               const colName = row.name.trim();
               const type = row.type || 'TEXT';
               const isPkStr = String(row.isPk || '').toUpperCase();
               const isPk =
                  isPkStr === '1' ||
                  isPkStr === 'TRUE' ||
                  isPkStr === 'YES' ||
                  isPkStr.includes('PK') ||
                  isPkStr === 'KEY';

               let fkTarget = undefined;
               if (isPkStr.includes('FK:') || isPkStr.includes('PFK:')) {
                  const fkMatch = String(row.isPk).match(
                     /(?:FK|PFK):\s*([^\s,]+)/i,
                  );
                  if (fkMatch && fkMatch[1]) {
                     const parts = fkMatch[1].split('.');
                     if (parts.length === 2) {
                        fkTarget = { table: parts[0], column: parts[1] };
                     }
                  }
               }

               const isNullable = !(
                  row.nullable === '0' ||
                  row.nullable === 'false' ||
                  row.nullable === 'No'
               );
               const isUnique =
                  String(row.isUnique || '').toUpperCase() === 'YES' ||
                  row.isUnique === '1' ||
                  row.isUnique === true;

               updatedColumns.push({
                  name: colName,
                  type,
                  isPk,
                  nullable: isNullable,
                  defaultValue: row.defaultValue || undefined,
                  isUnique,
                  fkTarget,
               });
            }
         }

         // Call Backend API
         const res = await fetch(
            `/api/tables/${encodeURIComponent(tableName)}/schema`,
            {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ columns: updatedColumns, renames }),
            },
         );

         const json = await res.json();
         if (!json.success) {
            throw new Error(json.error || 'Failed to recreate table');
         }

         // Handle any separate Index drops / adds if present
         if (hasIndexChanges) {
            for (const idxName of pendingIndexEdits.dropped) {
               if (idxName) await executeRawQuery(`DROP INDEX "${idxName}";`);
            }
            for (const idx of pendingIndexEdits.added) {
               const nameStr = idx.name
                  ? `"${idx.name}"`
                  : `"idx_${tableName}_${idx.columns.join('_')}_${Date.now()}"`;
               const uniqueStr = idx.isUnique ? 'UNIQUE' : '';
               const colsStr = idx.columns.map((c) => `"${c}"`).join(', ');
               await executeRawQuery(
                  `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${nameStr} ON "${tableName}" (${colsStr});`,
               );
            }
         }

         // Success cleanup
         window.SchemaGrid.pendingEdits = {};
         window.SchemaGrid.pendingInserts = [{}];
         window.SchemaGrid.pendingDeletes = new Set();
         window.SchemaGrid.pendingIndexEdits = { added: [], dropped: [] };
         window.SchemaGrid.history = [];
         window.SchemaGrid.currentTransaction = null;

         // Invalidate data cache so data tab re-fetches new column schema
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
            window.showToast(
               'Schema saved successfully via Table Re-creation!',
               'success',
            );
         }
         return;
      } catch (e) {
         if (window.showToast) {
            window.showToast(`Migration failed: ${e.message}`, 'error');
         } else {
            alert(`Migration failed: ${e.message}`);
         }
         return;
      }
   }

   let sqls = [];

   // Handle Deletes
   if (pendingDeletes) {
      for (const colName of pendingDeletes) {
         sqls.push(`ALTER TABLE "${tableName}" DROP COLUMN "${colName}";`);
      }
   }

   // Handle Updates
   for (const [colName, edits] of Object.entries(pendingEdits)) {
      let newName = colName;
      if (edits.name && edits.name !== colName) {
         sqls.push(
            `ALTER TABLE "${tableName}" RENAME COLUMN "${colName}" TO "${edits.name}";`,
         );
         newName = edits.name;
      }

      const otherKeys = Object.keys(edits).filter((k) => k !== 'name');
      if (otherKeys.length > 0) {
         const origCol =
            window.SchemaGrid.schema?.find((c) => c.name === colName) || {};

         let type = edits.type !== undefined ? edits.type : origCol.type;
         let constraints = [];

         const isPkRaw = edits.isPk !== undefined ? edits.isPk : origCol.isPk;
         // isPkRaw might be boolean true, "1", "PK", "FK: table.col", or combination
         const isPkStr = String(isPkRaw).toUpperCase();

         if (
            isPkStr === '1' ||
            isPkStr === 'TRUE' ||
            isPkStr === 'YES' ||
            isPkStr.includes('PK') ||
            isPkStr === 'KEY'
         ) {
            constraints.push('PRIMARY KEY');
         }

         if (isPkStr.includes('FK:')) {
            const fkMatch = isPkStr.match(/FK:\s*([^\s,]+)/i);
            if (fkMatch && fkMatch[1]) {
               const target = fkMatch[1].split('.');
               if (target.length === 2) {
                  constraints.push(`REFERENCES "${target[0]}"("${target[1]}")`);
               }
            }
         }

         const nullable =
            edits.nullable !== undefined ? edits.nullable : origCol.nullable;
         if (nullable === '0' || nullable === 'No' || nullable === false)
            constraints.push('NOT NULL');

         const defVal =
            edits.defaultValue !== undefined
               ? edits.defaultValue
               : origCol.defaultValue;
         if (defVal)
            constraints.push(`DEFAULT '${String(defVal).replace(/'/g, "''")}'`);

         if (window.AppState.dbType === 'sqlite') {
            alert(
               'SQLite does not support altering column types directly. Please recreate the table or use Raw SQL.',
            );
            return;
         } else if (window.AppState.dbType === 'postgres') {
            sqls.push(
               `ALTER TABLE "${tableName}" ALTER COLUMN "${newName}" TYPE ${type};`,
            );
            if (constraints.includes('NOT NULL')) {
               sqls.push(
                  `ALTER TABLE "${tableName}" ALTER COLUMN "${newName}" SET NOT NULL;`,
               );
            }
            if (defVal) {
               sqls.push(
                  `ALTER TABLE "${tableName}" ALTER COLUMN "${newName}" SET DEFAULT '${String(defVal).replace(/'/g, "''")}';`,
               );
            }
         } else {
            sqls.push(
               `ALTER TABLE "${tableName}" MODIFY COLUMN "${newName}" ${type} ${constraints.join(' ')};`,
            );
         }
      }

      // Handle isUnique for existing columns via Unique Index
      if (edits.isUnique !== undefined) {
         const isUniqueVal =
            edits.isUnique === 'Yes' ||
            edits.isUnique === '1' ||
            edits.isUnique === true;
         const indexName = `idx_${tableName}_${newName}_unique`;
         if (isUniqueVal) {
            sqls.push(
               `CREATE UNIQUE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" ("${newName}");`,
            );
         } else {
            sqls.push(`DROP INDEX IF EXISTS "${indexName}";`);
         }
      }
   }

   // Handle Inserts
   for (let i = 0; i < pendingInserts.length; i++) {
      const row = pendingInserts[i];
      if (Object.keys(row).length === 0) continue;
      if (!row.name || row.name.trim() === '') continue;

      const colName = row.name.trim();
      let type = row.type || 'TEXT';
      let constraints = [];

      const isPkStr = String(row.isPk || '').toUpperCase();
      if (
         isPkStr === '1' ||
         isPkStr === 'TRUE' ||
         isPkStr === 'YES' ||
         isPkStr.includes('PK') ||
         isPkStr === 'KEY'
      ) {
         constraints.push('PRIMARY KEY');
      }

      if (isPkStr.includes('FK:')) {
         const fkMatch = isPkStr.match(/FK:\s*([^\s,]+)/i);
         if (fkMatch && fkMatch[1]) {
            const target = fkMatch[1].split('.');
            if (target.length === 2) {
               constraints.push(`REFERENCES "${target[0]}"("${target[1]}")`);
            }
         }
      }
      if (
         row.nullable === '0' ||
         row.nullable === 'false' ||
         row.nullable === 'No'
      ) {
         constraints.push('NOT NULL');
      }
      const isUniqueStr = String(row.isUnique || '').toUpperCase();
      if (
         isUniqueStr === 'YES' ||
         isUniqueStr === '1' ||
         isUniqueStr === 'TRUE'
      ) {
         constraints.push('UNIQUE');
      }
      if (row.defaultValue) {
         constraints.push(`DEFAULT '${row.defaultValue.replace(/'/g, "''")}'`);
      }

      sqls.push(
         `ALTER TABLE "${tableName}" ADD COLUMN "${colName}" ${type} ${constraints.join(' ')};`,
      );
   }

   // Handle Index Drops
   if (window.SchemaGrid.pendingIndexEdits) {
      for (const idxName of window.SchemaGrid.pendingIndexEdits.dropped) {
         if (idxName && idxName.trim() !== '') {
            sqls.push(`DROP INDEX "${idxName}";`);
         }
      }

      // Handle Index Creates
      for (const idx of window.SchemaGrid.pendingIndexEdits.added) {
         let nameStr = '';
         if (idx.name && idx.name.trim() !== '') {
            nameStr = `"${idx.name}"`;
         } else {
            nameStr = `"idx_${tableName}_${idx.columns.join('_')}_${Date.now()}"`;
         }

         const uniqueStr = idx.isUnique ? 'UNIQUE' : '';
         const colsStr = idx.columns.map((c) => `"${c}"`).join(', ');

         sqls.push(
            `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${nameStr} ON "${tableName}" (${colsStr});`,
         );
      }
   }

   if (sqls.length === 0) return;

   let allSuccess = true;
   let errorMsg = '';

   for (const sql of sqls) {
      try {
         const res = await executeRawQuery(sql);
         if (!res.success) {
            allSuccess = false;
            errorMsg = res.error;
            break;
         }
      } catch (e) {
         allSuccess = false;
         errorMsg = e.message;
         break;
      }
   }

   if (allSuccess) {
      if (window.SchemaGrid) {
         window.SchemaGrid.pendingEdits = {};
         window.SchemaGrid.pendingInserts = [{}];
         window.SchemaGrid.pendingDeletes = new Set();
         window.SchemaGrid.pendingIndexEdits = { added: [], dropped: [] };
         window.SchemaGrid.history = [];
         window.SchemaGrid.currentTransaction = null;
      }
      const refreshBtn = document.getElementById(
         `btn-refresh-schema-${tableName}`,
      );
      if (refreshBtn) refreshBtn.click();
      else window.renderCurrentView();

      if (window.showToast) window.showToast('Schema saved successfully!');
   } else {
      if (errorMsg.includes('near "MODIFY": syntax error')) {
         errorMsg =
            'SQLite: Currently does not support modifying existing column types or constraints directly. You can only Rename columns or Add new columns.';
      } else if (errorMsg.includes('syntax error')) {
         errorMsg = 'SQLite: ' + errorMsg;
      }

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
      colIdx === '0' ? `<span class="ghost-cell-hint">+ Add column</span>` : '';

   td.innerHTML =
      newVal ||
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
                     ? `<span class="ghost-cell-hint">+ Add column</span>`
                     : '';
               tr.innerHTML += `<td class="data-cell ghost-row" data-row-idx="${nextRowIdx}" data-col-idx="${cIdx}" data-insert-index="${idx + 1}" data-col-key="${c}">${hint}</td>`;
            });
            tbody.appendChild(tr);
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
