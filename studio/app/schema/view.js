import { fetchTableSchema, fetchTableIndexes } from '../../lib/api.js';
import { bindSchemaCellEditor } from './events.js';
import { bindColumnResizer, bindCellSelection } from '../grid/view.js';
import { openExportOrmModal } from './ormModal.js';
import { openSchemaDiffModal } from './diffModal.js';

export { saveSchemaEdits } from './core.js';

export async function loadTableSchema(tableName, btnElement, container = null) {
   const allBtns = document.querySelectorAll('.table-btn');
   allBtns.forEach((b) => b.classList.remove('active'));
   if (btnElement) btnElement.classList.add('active');

   const headerTableName = document.getElementById('table-name');
   if (headerTableName) headerTableName.textContent = tableName + ' (Schema)';

   const renderTarget = container || document.getElementById('main-content');
   renderTarget.innerHTML = "<div class='p-6'>Loading Schema...</div>";

   try {
      const [res, indexesRes] = await Promise.all([
         fetchTableSchema(tableName),
         fetchTableIndexes(tableName),
      ]);

      if (res.success && res.data) {
         let schema = res.data;
         let indexes =
            indexesRes.success && indexesRes.data ? indexesRes.data : [];

         window.SchemaGrid = {
            schema,
            indexes,
            pendingEdits: {},
            pendingIndexEdits: { added: [], dropped: [] },
            pendingInserts: [{}],
            pendingDeletes: new Set(),
            selectedCell: null,
            history: [],
            currentTransaction: null,
            sortState: { colKey: null, asc: true },
            filterText: '',
            isResizing: false,
            selection: {
               startRow: -1,
               startCol: -1,
               endRow: -1,
               endCol: -1,
               isDragging: false,
            },
         };

         if (window.TableStates && window.TableStates[tableName]) {
            window.TableStates[tableName].schemaGrid = window.SchemaGrid;
         }

         renderTarget.innerHTML = /* html */ `
        <div class="toolbar">
          <div class="filter-bar-container" style="max-width: 320px;">
            <div class="filter-bar-input-box">
              <span class="material-symbols-outlined filter-bar-search-icon">search</span>
              <input 
                type="text" 
                id="schema-search-val-${tableName}" 
                class="filter-bar-input" 
                placeholder="Search name or type..." 
                value="${window.SchemaGrid.filterText}" 
                autocomplete="off"
                spellcheck="false"
              />
              <button 
                type="button" 
                id="btn-clear-schema-search-${tableName}" 
                class="filter-bar-clear-btn ${window.SchemaGrid.filterText ? '' : 'hidden'}" 
                title="Clear search"
              >
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>
          <div class="flex-1"></div>
          <button type="button" id="btn-export-orm-${tableName}" class="header-btn secondary" style="height: 30px; font-size: 12px; gap: 6px; padding: 0 12px;" title="Export Prisma / Drizzle ORM Schema">
            <span class="material-symbols-outlined" style="font-size: 16px; color: var(--color-primary);">bolt</span>
            <span>Export ORM</span>
          </button>
          <button type="button" id="btn-schema-diff-${tableName}" class="header-btn secondary" style="height: 30px; font-size: 12px; gap: 6px; padding: 0 12px;" title="Compare Schemas & Generate Migration SQL">
            <span class="material-symbols-outlined" style="font-size: 16px; color: #10b981;">compare_arrows</span>
            <span>Schema Diff</span>
          </button>
          <button id="btn-refresh-schema-${tableName}" class="refresh-btn" title="Refresh Schema (F5)"><span class="material-symbols-outlined">refresh</span></button>
        </div>
        <div id="schema-grid-container-${tableName}" class="table-container"></div>
      `;

         window.renderSchemaGrid = () => {
            const tableContainer = document.getElementById(
               `schema-grid-container-${tableName}`,
            );
            if (!tableContainer) return;

            let displaySchema = [...window.SchemaGrid.schema];

            if (window.SchemaGrid.filterText) {
               const lowerF = window.SchemaGrid.filterText.toLowerCase();
               displaySchema = displaySchema.filter(
                  (c) =>
                     (c.name && c.name.toLowerCase().includes(lowerF)) ||
                     (c.type && c.type.toLowerCase().includes(lowerF)),
               );
            }

            if (window.SchemaGrid.sortState.colKey) {
               displaySchema.sort((a, b) => {
                  const key = window.SchemaGrid.sortState.colKey;
                  let valA = a[key];
                  let valB = b[key];
                  if (valA === undefined || valA === null) valA = '';
                  if (valB === undefined || valB === null) valB = '';
                  if (valA < valB)
                     return window.SchemaGrid.sortState.asc ? -1 : 1;
                  if (valA > valB)
                     return window.SchemaGrid.sortState.asc ? 1 : -1;
                  return 0;
               });
            }

            const columns = [
               'name',
               'type',
               'isPk',
               'nullable',
               'isUnique',
               'defaultValue',
               'indexing',
            ];
            const columnLabels = [
               'Name',
               'Type',
               'PK / FK',
               'Nullable',
               'Unique',
               'Default Value',
               'Indexing',
            ];

            let tableHtml = `<table class="data-table" id="schema-grid-table-${tableName}"><thead><tr><th class="row-header">#</th>`;
            columns.forEach((cKey, i) => {
               if (cKey === 'indexing') {
                  tableHtml += `<th class="th-indexing" data-col-key="indexing">
                       <div class="th-content-wrapper">
                          <span class="th-name">${columnLabels[i]}</span>
                       </div>
                     </th>`;
                  return;
               }

               let sortIcon = '';
               if (window.SchemaGrid.sortState.colKey === cKey) {
                  const iconName = window.SchemaGrid.sortState.asc
                     ? 'arrow_upward'
                     : 'arrow_downward';
                  sortIcon = `<span class="material-symbols-outlined th-sort-icon">${iconName}</span>`;
               }
               tableHtml += `<th class="sortable" data-col-key="${cKey}">
                     <div class="th-content-wrapper">
                        <span class="th-name">${columnLabels[i]}</span>
                        ${sortIcon}
                     </div>
                   </th>`;
            });
            tableHtml += `</tr></thead><tbody>`;

            if (displaySchema && displaySchema.length > 0) {
               displaySchema.forEach((col, rowIndex) => {
                  tableHtml += `<tr><td class="row-header" data-row-idx="${rowIndex}">${rowIndex + 1}</td>`;

                  columns.forEach((cKey, cIdx) => {
                     if (cKey === 'indexing') {
                        if (rowIndex === 0) {
                           const numRows =
                              (displaySchema ? displaySchema.length : 0) + 1; // +1 for ghost row
                           const idxCount = window.SchemaGrid.indexes.length;
                           const addedCount =
                              window.SchemaGrid.pendingIndexEdits.added.length;
                           const droppedCount =
                              window.SchemaGrid.pendingIndexEdits.dropped
                                 .length;
                           const total = idxCount + addedCount - droppedCount;

                           tableHtml += `<td class="manage-indexes-cell" rowspan="${numRows}">
                    <div class="manage-indexes-wrapper">
                      <button type="button" class="btn-manage-indexes" title="Open Index Manager">
                        <span class="material-symbols-outlined">key</span>
                        <span>Manage Indexes</span>
                        <span class="index-count-pill">${total}</span>
                      </button>
                    </div>
                  </td>`;
                        }
                        return; // Skip rendering td for cKey === "indexing" if rowIndex > 0
                     }

                     let val = col[cKey];
                     let safeValForHtml = '';
                     let safeValForAttr = '';

                     if (cKey === 'name') {
                        safeValForAttr = String(val || '').replace(
                           /"/g,
                           '&quot;',
                        );
                        safeValForHtml = `<strong>${String(val || '').replace(/</g, '&lt;')}</strong>`;
                     } else if (cKey === 'type') {
                        safeValForAttr = String(val || '').replace(
                           /"/g,
                           '&quot;',
                        );
                        const hasEnum =
                           col.enumValues && col.enumValues.length > 0;
                        const enumBadgeHtml = hasEnum
                           ? ` <span class="badge-enum" style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(59, 130, 246, 0.15); color: var(--color-primary); border: 1px solid rgba(59, 130, 246, 0.3); margin-left: 4px; cursor: pointer;" title="Configured Enum values: ${col.enumValues.join(', ')}">ENUM</span>`
                           : '';
                        safeValForHtml = `<span class="schema-type-mono">${String(val || '').replace(/</g, '&lt;')}</span>${enumBadgeHtml}`;
                     } else if (cKey === 'isPk') {
                        const isPk = !!col.isPk;
                        const isFk = !!col.fkTarget;
                        if (isPk && isFk) {
                           const actionTag =
                              col.fkTarget.onDelete &&
                              col.fkTarget.onDelete !== 'NO ACTION'
                                 ? ` (${col.fkTarget.onDelete})`
                                 : '';
                           const tooltipRules = [
                              col.fkTarget.onDelete
                                 ? `ON DELETE ${col.fkTarget.onDelete}`
                                 : '',
                              col.fkTarget.onUpdate
                                 ? `ON UPDATE ${col.fkTarget.onUpdate}`
                                 : '',
                           ]
                              .filter(Boolean)
                              .join(', ');
                           const titleStr = `Primary Foreign Key (Composite Key referencing ${col.fkTarget.table}.${col.fkTarget.column}${tooltipRules ? ` [${tooltipRules}]` : ''})`;
                           safeValForAttr = `PFK: ${col.fkTarget.table}.${col.fkTarget.column}${actionTag}`;
                           safeValForHtml = `<span class="col-badge badge-pfk" title="${titleStr}">PFK &rarr; ${col.fkTarget.table}.${col.fkTarget.column}${actionTag}</span>`;
                        } else if (isPk) {
                           safeValForAttr = 'PK';
                           safeValForHtml = `<span class="col-badge badge-pk">PK</span>`;
                        } else if (isFk) {
                           const actionTag =
                              col.fkTarget.onDelete &&
                              col.fkTarget.onDelete !== 'NO ACTION'
                                 ? ` (${col.fkTarget.onDelete})`
                                 : '';
                           const tooltipRules = [
                              col.fkTarget.onDelete
                                 ? `ON DELETE ${col.fkTarget.onDelete}`
                                 : '',
                              col.fkTarget.onUpdate
                                 ? `ON UPDATE ${col.fkTarget.onUpdate}`
                                 : '',
                           ]
                              .filter(Boolean)
                              .join(', ');
                           const titleStr = `References ${col.fkTarget.table}.${col.fkTarget.column}${tooltipRules ? ` [${tooltipRules}]` : ''}`;
                           safeValForAttr = `FK: ${col.fkTarget.table}.${col.fkTarget.column}${actionTag}`;
                           safeValForHtml = `<span class="col-badge badge-fk" title="${titleStr}">FK &rarr; ${col.fkTarget.table}.${col.fkTarget.column}${actionTag}</span>`;
                        } else {
                           safeValForAttr = '-';
                           safeValForHtml = `<span class="text-soft">-</span>`;
                        }
                     } else if (cKey === 'nullable') {
                        const isPk = !!col.isPk;
                        const isNull = isPk ? false : !!col.nullable;
                        safeValForAttr = isNull ? 'Yes' : 'No';
                        safeValForHtml = isNull
                           ? `<span class="text-soft">Yes</span>`
                           : `<span class="badge-notnull">No</span>`;
                     } else if (cKey === 'isUnique') {
                        const isPk = !!col.isPk;
                        const isUniq = isPk || !!col.isUnique;
                        safeValForAttr = isUniq ? 'Yes' : 'No';
                        if (isPk) {
                           safeValForHtml = `<span class="badge-unique-pk" title="Primary Key is always unique"><span class="material-symbols-outlined text-12">lock</span> Yes</span>`;
                        } else if (isUniq) {
                           safeValForHtml = `<span class="badge-unique">Yes</span>`;
                        } else {
                           safeValForHtml = `<span class="text-soft">-</span>`;
                        }
                     } else if (cKey === 'defaultValue') {
                        safeValForAttr = String(
                           val !== undefined && val !== null ? val : '',
                        ).replace(/"/g, '&quot;');
                        safeValForHtml =
                           val !== undefined && val !== null && val !== ''
                              ? `<span class="schema-type-mono text-soft">${String(val).replace(/</g, '&lt;')}</span>`
                              : `<span class="text-soft">-</span>`;
                     } else {
                        safeValForAttr = String(val || '').replace(
                           /"/g,
                           '&quot;',
                        );
                        safeValForHtml = String(val || '').replace(
                           /</g,
                           '&lt;',
                        );
                     }

                     tableHtml += `<td class="data-cell" data-row-idx="${rowIndex}" data-col-idx="${cIdx}" data-pk="${col.name}" data-col-key="${cKey}" data-original="${safeValForAttr}">${safeValForHtml}</td>`;
                  });
                  tableHtml += `</tr>`;
               });
            }

            tableHtml += `<tr class="ghost-row-tr">`;
            const ghostIdx = displaySchema ? displaySchema.length : 0;
            tableHtml += `<td class="row-header" data-row-idx="${ghostIdx}">*</td>`;
            columns.forEach((cKey, cIdx) => {
               if (cKey === 'indexing') return;
               const hint =
                  cIdx === 0
                     ? `<span class="ghost-cell-hint">+ Add Column</span>`
                     : '';
               tableHtml += `<td class="data-cell ghost-row" data-row-idx="${ghostIdx}" data-col-idx="${cIdx}" data-insert-index="0" data-col-key="${cKey}">${hint}</td>`;
            });
            tableHtml += `</tr></tbody></table>`;
            tableContainer.innerHTML = tableHtml;

            document
               .querySelectorAll(`#schema-grid-table-${tableName} th.sortable`)
               .forEach((th) => {
                  th.onclick = (e) => {
                     if (window.SchemaGrid.isResizing) return;
                     const hasPending =
                        Object.keys(window.SchemaGrid.pendingEdits).length >
                           0 ||
                        window.SchemaGrid.pendingInserts.length > 1 ||
                        window.SchemaGrid.pendingDeletes.size > 0 ||
                        window.SchemaGrid.pendingIndexEdits.added.length > 0 ||
                        window.SchemaGrid.pendingIndexEdits.dropped.length > 0;
                     if (hasPending) {
                        alert(
                           'You have unsaved changes! Please press Ctrl+S to save them before sorting.',
                        );
                        return;
                     }
                     const colKey = th.dataset.colKey;
                     if (window.SchemaGrid.sortState.colKey === colKey) {
                        window.SchemaGrid.sortState.asc =
                           !window.SchemaGrid.sortState.asc;
                     } else {
                        window.SchemaGrid.sortState.colKey = colKey;
                        window.SchemaGrid.sortState.asc = true;
                     }
                     window.SchemaGrid.selection = {
                        startRow: -1,
                        startCol: -1,
                        endRow: -1,
                        endCol: -1,
                        isDragging: false,
                     };
                     window.renderSchemaGrid();
                  };
                  bindColumnResizer(th, window.SchemaGrid);
               });

            bindCellSelection(
               tableContainer,
               `schema-grid-table-${tableName}`,
               window.SchemaGrid,
               columns.length,
            );
            bindSchemaCellEditor(tableContainer, columns);
         };

         window.renderSchemaGrid();

         const searchInput = document.getElementById(
            `schema-search-val-${tableName}`,
         );
         const clearBtn = document.getElementById(
            `btn-clear-schema-search-${tableName}`,
         );

         const updateClearBtn = () => {
            if (!clearBtn || !searchInput) return;
            if (searchInput.value.trim() !== '') {
               clearBtn.classList.remove('hidden');
            } else {
               clearBtn.classList.add('hidden');
            }
         };

         if (searchInput) {
            searchInput.addEventListener('input', (e) => {
               window.SchemaGrid.filterText = e.target.value;
               updateClearBtn();
               window.SchemaGrid.selection = {
                  startRow: -1,
                  startCol: -1,
                  endRow: -1,
                  endCol: -1,
                  isDragging: false,
               };
               window.renderSchemaGrid();
            });
         }

         const inputBox = searchInput?.closest('.filter-bar-input-box');
         if (inputBox && searchInput) {
            inputBox.addEventListener('click', (e) => {
               if (e.target.closest('.filter-bar-clear-btn')) return;
               searchInput.focus();
            });
         }

         if (clearBtn) {
            clearBtn.onclick = () => {
               if (searchInput) {
                  searchInput.value = '';
                  window.SchemaGrid.filterText = '';
                  updateClearBtn();
                  window.renderSchemaGrid();
                  searchInput.focus();
               }
            };
         }

         const exportOrmBtn = document.getElementById(
            `btn-export-orm-${tableName}`,
         );
         if (exportOrmBtn) {
            exportOrmBtn.onclick = () => openExportOrmModal(tableName);
         }

         const schemaDiffBtn = document.getElementById(
            `btn-schema-diff-${tableName}`,
         );
         if (schemaDiffBtn) {
            schemaDiffBtn.onclick = () => openSchemaDiffModal();
         }

         const refreshBtn = document.getElementById(
            `btn-refresh-schema-${tableName}`,
         );
         if (refreshBtn)
            refreshBtn.onclick = () => {
               const hasPending =
                  Object.keys(window.SchemaGrid.pendingEdits).length > 0 ||
                  window.SchemaGrid.pendingInserts.length > 1 ||
                  window.SchemaGrid.pendingDeletes.size > 0 ||
                  window.SchemaGrid.pendingIndexEdits.added.length > 0 ||
                  window.SchemaGrid.pendingIndexEdits.dropped.length > 0;
               if (hasPending) {
                  if (
                     !confirm(
                        'You have unsaved changes. Are you sure you want to refresh and discard them?',
                     )
                  )
                     return;
               }

               window.SchemaGrid.pendingEdits = {};
               window.SchemaGrid.pendingInserts = [{}];
               window.SchemaGrid.pendingDeletes.clear();
               window.SchemaGrid.pendingIndexEdits = { added: [], dropped: [] };
               window.SchemaGrid.history = [];
               window.SchemaGrid.currentTransaction = null;
               window.updateSidebarDirtyState?.();

               loadTableSchema(
                  tableName,
                  btnElement,
                  document.getElementById(`view-schema-btn-${tableName}`),
               );
            };
      } else {
         renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Error: ${res.error}</div>`;
      }
   } catch (err) {
      renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Failed to load schema: ${err.message}</div>`;
   }
}
