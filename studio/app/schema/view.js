import { fetchTableSchema, fetchTableIndexes } from '../../lib/api.js';
import { bindSchemaCellEditor } from './events.js';
import {
   bindColumnResizer,
   bindCellSelection,
   selectAllGridCells,
} from '../grid/view.js';
import { openExportOrmModal } from './ormModal.js';
import { openSchemaDiffModal } from './diffModal.js';
import { showContextMenu } from '../../components/contextMenu.js';

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
          <div class="filter-bar-container" style="flex: 1; position: relative; min-width: 0;">
            <div class="filter-bar-input-box" id="schema-search-box-${tableName}">
              <span class="material-symbols-outlined filter-bar-search-icon">search</span>
              <input 
                type="text" 
                id="schema-search-val-${tableName}" 
                class="filter-bar-input" 
                placeholder="Search name, type, default, constraint..." 
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
            <div class="schema-autocomplete-popover hidden" id="schema-search-popover-${tableName}"></div>
          </div>
          <button id="btn-refresh-schema-${tableName}" class="refresh-btn" title="Refresh Schema (F5)">
            <span class="material-symbols-outlined">refresh</span>
          </button>
        </div>
        <div id="schema-grid-container-${tableName}" class="table-container"></div>
        <div class="data-grid-footer schema-grid-footer" id="schema-grid-footer-${tableName}">
          <div class="footer-left-group">
            <span class="footer-records-count" id="schema-columns-count-${tableName}"></span>
          </div>
          <div class="footer-right-group">
            <button type="button" id="btn-export-orm-${tableName}" class="footer-btn" title="Export Prisma / Drizzle ORM Schema">
              <span class="material-symbols-outlined" style="font-size: 12px; color: var(--color-primary);">bolt</span>
              <span>Export ORM</span>
            </button>
            <button type="button" id="btn-schema-diff-${tableName}" class="footer-btn" title="Compare Schemas & Generate Migration SQL">
              <span class="material-symbols-outlined" style="font-size: 12px; color: #10b981;">compare_arrows</span>
              <span>Schema Diff</span>
            </button>
          </div>
        </div>
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

            const countEl = document.getElementById(
               `schema-columns-count-${tableName}`,
            );
            if (countEl) {
               const totalCols = window.SchemaGrid.schema.length;
               if (
                  window.SchemaGrid.filterText &&
                  displaySchema.length !== totalCols
               ) {
                  countEl.textContent = `Showing ${displaySchema.length} of ${totalCols} columns`;
               } else {
                  countEl.textContent = `${totalCols} column${totalCols !== 1 ? 's' : ''}`;
               }
            }

            if (displaySchema.length === 0 && window.SchemaGrid.filterText) {
               tableContainer.innerHTML = /* html */ `
                  <div class="table-empty-container">
                     <div class="table-empty-card">
                        <div class="table-empty-icon-wrap">
                           <span class="material-symbols-outlined table-empty-icon">search_off</span>
                        </div>
                        <h3 class="table-empty-title">No matching columns found</h3>
                        <p class="table-empty-desc">No columns matched the filter condition "${window.SchemaGrid.filterText}".</p>
                        <div class="table-empty-actions">
                           <button type="button" class="table-empty-btn-primary" id="btn-empty-clear-schema-filter-${tableName}">
                              <span class="material-symbols-outlined icon-16">filter_alt_off</span>
                              <span>Clear Filter</span>
                           </button>
                        </div>
                     </div>
                  </div>
               `;
               const emptyClearBtn = document.getElementById(
                  `btn-empty-clear-schema-filter-${tableName}`,
               );
               if (emptyClearBtn) {
                  emptyClearBtn.onclick = () => {
                     window.SchemaGrid.filterText = '';
                     const sInput = document.getElementById(
                        `schema-search-val-${tableName}`,
                     );
                     if (sInput) sInput.value = '';
                     const cBtn = document.getElementById(
                        `btn-clear-schema-search-${tableName}`,
                     );
                     if (cBtn) cBtn.classList.add('hidden');
                     window.renderSchemaGrid();
                  };
               }
               return;
            }

            const columnDefs = [
               { key: 'name', label: 'Column Name' },
               { key: 'type', label: 'Data Type' },
               { key: 'isPk', label: 'Key' },
               { key: 'nullable', label: 'Nullable' },
               { key: 'isUnique', label: 'Unique' },
               { key: 'defaultValue', label: 'Default Value' },
               { key: 'indexing', label: 'Indexing' },
            ];
            const columns = columnDefs.map((c) => c.key);

            let tableHtml = `<table class="data-table" id="schema-grid-table-${tableName}"><thead><tr><th class="row-header table-corner-header" id="th-schema-row-header-${tableName}" title="Click to select all">#</th>`;
            columnDefs.forEach((colDef) => {
               if (colDef.key === 'indexing') {
                  tableHtml += `<th class="th-indexing" data-col-key="indexing">
                     <div class="th-content-wrapper">
                        <span class="th-col-name">${colDef.label}</span>
                     </div>
                  </th>`;
                  return;
               }

               const isSorted =
                  window.SchemaGrid.sortState.colKey === colDef.key;
               let sortIcon = 'keyboard_arrow_down';
               if (isSorted) {
                  sortIcon = window.SchemaGrid.sortState.asc
                     ? 'arrow_upward'
                     : 'arrow_downward';
               }

               tableHtml += /* html */ `
                  <th class="sortable ${isSorted ? 'sorted' : ''}" data-col-key="${colDef.key}" title="Column actions">
                     <div class="th-content-wrapper">
                        <div class="th-main-group">
                           <span class="th-col-name">${colDef.label}</span>
                        </div>
                        <div class="th-actions-group">
                           <button type="button" class="th-menu-trigger ${isSorted ? 'is-sorted' : ''}" title="Column actions">
                              <span class="material-symbols-outlined th-chevron-icon" style="font-size: 14px;">${sortIcon}</span>
                           </button>
                        </div>
                     </div>
                  </th>
               `;
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
                           const idxCount =
                              window.SchemaGrid.indexes?.length || 0;
                           const addedCount =
                              window.SchemaGrid.pendingIndexEdits?.added
                                 ?.length || 0;
                           const droppedCount =
                              window.SchemaGrid.pendingIndexEdits?.dropped
                                 ?.length || 0;
                           const total = idxCount + addedCount - droppedCount;

                           tableHtml += `<td class="manage-indexes-cell" rowspan="${numRows}">
                              <div class="manage-indexes-wrapper">
                                 <button type="button" class="btn-manage-indexes" title="Open Index Manager">
                                    <span class="material-symbols-outlined">key</span>
                                    <span>Manage Indexes</span>
                                    <span class="index-count-pill">${Math.max(0, total)}</span>
                                 </button>
                              </div>
                           </td>`;
                        }
                        return; // Skip rendering td for cKey === "indexing" for rowIndex > 0
                     }

                     let safeValForHtml = '';
                     let safeValForAttr = '';

                     if (cKey === 'name') {
                        safeValForAttr = String(col.name || '').replace(
                           /"/g,
                           '&quot;',
                        );
                        safeValForHtml = `<span class="cell-text">${String(col.name || '').replace(/</g, '&lt;')}</span>`;
                     } else if (cKey === 'type') {
                        safeValForAttr = String(col.type || '').replace(
                           /"/g,
                           '&quot;',
                        );
                        const hasEnum =
                           col.enumValues && col.enumValues.length > 0;
                        const enumBadgeHtml = hasEnum
                           ? ` <span class="badge-enum" style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(59, 130, 246, 0.15); color: var(--color-primary); border: 1px solid rgba(59, 130, 246, 0.3); margin-left: 4px; cursor: pointer;" title="Configured Enum values: ${col.enumValues.join(', ')}">ENUM</span>`
                           : '';
                        safeValForHtml = `<span class="schema-type-mono">${String(col.type || '').replace(/</g, '&lt;')}</span>${enumBadgeHtml}`;
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
                        if (isPk) {
                           safeValForHtml = `<span class="badge-bool bool-false badge-locked" title="Primary Key cannot be nullable"><span class="material-symbols-outlined" style="font-size: 11px;">lock</span> No</span>`;
                        } else {
                           safeValForHtml = isNull
                              ? `<span class="badge-bool bool-true">Yes</span>`
                              : `<span class="badge-bool bool-false">No</span>`;
                        }
                     } else if (cKey === 'isUnique') {
                        const isPk = !!col.isPk;
                        const isUniq = isPk || !!col.isUnique;
                        safeValForAttr = isUniq ? 'Yes' : 'No';
                        if (isPk) {
                           safeValForHtml = `<span class="badge-unique-pk" title="Primary Key is always unique"><span class="material-symbols-outlined" style="font-size: 11px;">lock</span> Yes</span>`;
                        } else if (isUniq) {
                           safeValForHtml = `<span class="badge-unique">Yes</span>`;
                        } else {
                           safeValForHtml = `<span class="text-soft">-</span>`;
                        }
                     } else if (cKey === 'defaultValue') {
                        let val = col.defaultValue;
                        if (
                           typeof val === 'string' &&
                           val.startsWith("'''") &&
                           val.endsWith("'''")
                        ) {
                           val = val.slice(2, -2);
                        }
                        safeValForAttr = String(
                           val !== undefined && val !== null ? val : '',
                        ).replace(/"/g, '&quot;');
                        safeValForHtml =
                           val !== undefined && val !== null && val !== ''
                              ? `<span class="cell-text text-soft">${String(val).replace(/</g, '&lt;')}</span>`
                              : `<span class="text-soft">-</span>`;
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
                  const colKey = th.dataset.colKey;
                  const colDef = columnDefs.find((c) => c.key === colKey);

                  const checkPendingChanges = () => {
                     const hasPending =
                        Object.keys(window.SchemaGrid.pendingEdits || {})
                           .length > 0 ||
                        (window.SchemaGrid.pendingInserts || []).length > 1 ||
                        (window.SchemaGrid.pendingDeletes &&
                           window.SchemaGrid.pendingDeletes.size > 0) ||
                        (window.SchemaGrid.pendingIndexEdits?.added || [])
                           .length > 0 ||
                        (window.SchemaGrid.pendingIndexEdits?.dropped || [])
                           .length > 0;

                     if (hasPending) {
                        if (window.showToast) {
                           window.showToast(
                              'You have unsaved changes! Please press Ctrl+S to save them before sorting.',
                              'warning',
                           );
                        } else {
                           alert(
                              'You have unsaved changes! Please press Ctrl+S to save them before sorting.',
                           );
                        }
                        return false;
                     }
                     return true;
                  };

                  const applySort = (asc) => {
                     if (!checkPendingChanges()) return;
                     window.SchemaGrid.sortState.colKey = colKey;
                     window.SchemaGrid.sortState.asc = asc;
                     window.SchemaGrid.selection = {
                        startRow: -1,
                        startCol: -1,
                        endRow: -1,
                        endCol: -1,
                        isDragging: false,
                     };
                     window.renderSchemaGrid();
                     if (window.showToast) {
                        window.showToast(
                           `Sorted by ${colDef ? colDef.label : colKey} (${asc ? 'Ascending' : 'Descending'})`,
                           'info',
                        );
                     }
                  };

                  const clearSort = () => {
                     if (!checkPendingChanges()) return;
                     window.SchemaGrid.sortState.colKey = null;
                     window.SchemaGrid.sortState.asc = true;
                     window.SchemaGrid.selection = {
                        startRow: -1,
                        startCol: -1,
                        endRow: -1,
                        endCol: -1,
                        isDragging: false,
                     };
                     window.renderSchemaGrid();
                     if (window.showToast) {
                        window.showToast(
                           `Cleared sort on "${colDef ? colDef.label : colKey}"`,
                           'info',
                        );
                     }
                  };

                  const openHeaderMenu = (e) => {
                     if (window.SchemaGrid.isResizing) return;
                     if (e.target.closest('.resizer')) return;

                     const isSorted =
                        window.SchemaGrid.sortState.colKey === colKey;
                     const isAsc = isSorted && window.SchemaGrid.sortState.asc;

                     const menuItems = [
                        {
                           icon: 'arrow_upward',
                           label: 'Sort Ascending',
                           checked: isSorted && isAsc,
                           action: () => applySort(true),
                        },
                        {
                           icon: 'arrow_downward',
                           label: 'Sort Descending',
                           checked: isSorted && !isAsc,
                           action: () => applySort(false),
                        },
                     ];

                     if (isSorted) {
                        menuItems.push({
                           icon: 'restart_alt',
                           label: 'Clear Sort',
                           action: () => clearSort(),
                        });
                     }

                     menuItems.push('divider', {
                        icon: 'content_copy',
                        label: 'Copy name',
                        action: async () => {
                           const titleToCopy = colDef ? colDef.label : colKey;
                           try {
                              await navigator.clipboard.writeText(titleToCopy);
                           } catch {
                              const ta = document.createElement('textarea');
                              ta.value = titleToCopy;
                              document.body.appendChild(ta);
                              ta.select();
                              document.execCommand('copy');
                              ta.remove();
                           }
                           if (window.showToast) {
                              window.showToast(
                                 `Copied "${titleToCopy}" to clipboard!`,
                                 'success',
                              );
                           }
                        },
                     });

                     const triggerBtn = th.querySelector('.th-menu-trigger');
                     const thRect = th.getBoundingClientRect();
                     const isContextMenu = e && e.type === 'contextmenu';

                     let menuX = thRect.left;
                     let menuY = thRect.bottom + 4;

                     if (triggerBtn) {
                        const triggerRect = triggerBtn.getBoundingClientRect();
                        menuX = triggerRect.left;
                        menuY = triggerRect.bottom + 4;
                     }

                     if (isContextMenu && e && typeof e.clientX === 'number') {
                        menuX = e.clientX;
                        menuY = e.clientY;
                     }

                     const menuEvent = {
                        clientX: menuX,
                        clientY: menuY,
                        preventDefault: () => {},
                        stopPropagation: () => {},
                     };

                     showContextMenu(menuEvent, menuItems);
                  };

                  th.onclick = openHeaderMenu;
                  th.oncontextmenu = (e) => {
                     e.preventDefault();
                     openHeaderMenu(e);
                  };

                  bindColumnResizer(th, window.SchemaGrid);
               });

            bindCellSelection(
               tableContainer,
               `schema-grid-table-${tableName}`,
               window.SchemaGrid,
               columns.length - 1,
            );
            bindSchemaCellEditor(tableContainer, columns);

            const schemaCornerHeader = document.getElementById(
               `th-schema-row-header-${tableName}`,
            );
            if (schemaCornerHeader) {
               schemaCornerHeader.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectAllGridCells(
                     `schema-grid-table-${tableName}`,
                     window.SchemaGrid,
                     columns.length - 1,
                  );
               });
            }
         };

         window.renderSchemaGrid();

         const searchInput = document.getElementById(
            `schema-search-val-${tableName}`,
         );
         const clearBtn = document.getElementById(
            `btn-clear-schema-search-${tableName}`,
         );
         const popoverEl = document.getElementById(
            `schema-search-popover-${tableName}`,
         );

         let activeSuggestionIdx = -1;
         let currentSuggestions = [];

         const updateClearBtn = () => {
            if (!clearBtn || !searchInput) return;
            if (searchInput.value.trim() !== '') {
               clearBtn.classList.remove('hidden');
            } else {
               clearBtn.classList.add('hidden');
            }
         };

         const hideSuggestions = () => {
            if (popoverEl) {
               popoverEl.classList.add('hidden');
               popoverEl.innerHTML = '';
            }
            activeSuggestionIdx = -1;
            currentSuggestions = [];
         };

         const escapeHtml = (str) =>
            String(str)
               .replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;');

         const highlightMatch = (text, q) => {
            if (!q) return escapeHtml(text);
            const lowerText = text.toLowerCase();
            const lowerQ = q.toLowerCase();
            const idx = lowerText.indexOf(lowerQ);
            if (idx === -1) return escapeHtml(text);
            const before = escapeHtml(text.slice(0, idx));
            const match = escapeHtml(text.slice(idx, idx + q.length));
            const after = escapeHtml(text.slice(idx + q.length));
            return `${before}<span class="schema-autocomplete-match-highlight">${match}</span>${after}`;
         };

         const applySuggestion = (val) => {
            if (!searchInput) return;
            searchInput.value = val;
            window.SchemaGrid.filterText = val;
            updateClearBtn();
            window.SchemaGrid.selection = {
               startRow: -1,
               startCol: -1,
               endRow: -1,
               endCol: -1,
               isDragging: false,
            };
            window.renderSchemaGrid();
            hideSuggestions();
            searchInput.focus();
         };

         const renderSuggestions = () => {
            if (!popoverEl || !searchInput) return;
            const q = searchInput.value.trim().toLowerCase();

            const schemaList = window.SchemaGrid?.schema || [];
            const colNames = Array.from(
               new Set(schemaList.map((c) => c.name).filter(Boolean)),
            );
            const dataTypes = Array.from(
               new Set(schemaList.map((c) => c.type).filter(Boolean)),
            );

            const matchingCols = q
               ? colNames.filter((name) => name.toLowerCase().includes(q))
               : colNames.slice(0, 6);
            const matchingTypes = q
               ? dataTypes.filter((t) => t.toLowerCase().includes(q))
               : dataTypes.slice(0, 4);

            currentSuggestions = [
               ...matchingCols.map((c) => ({
                  text: c,
                  type: 'column',
                  icon: 'view_column',
                  badge: 'Column',
               })),
               ...matchingTypes.map((t) => ({
                  text: t,
                  type: 'type',
                  icon: 'data_object',
                  badge: 'Type',
               })),
            ];

            if (currentSuggestions.length === 0) {
               popoverEl.innerHTML = /* html */ `
                  <div class="schema-autocomplete-empty">
                     <span>No matching columns or data types</span>
                  </div>
               `;
               popoverEl.classList.remove('hidden');
               return;
            }

            activeSuggestionIdx = -1;
            let html = `<div class="schema-autocomplete-scroll">`;

            if (matchingCols.length > 0) {
               html += `<div class="schema-autocomplete-section-title">Columns (${matchingCols.length})</div>`;
               matchingCols.forEach((colName) => {
                  const itemIdx = currentSuggestions.findIndex(
                     (item) => item.text === colName && item.type === 'column',
                  );
                  html += /* html */ `
                     <div class="schema-autocomplete-item" data-suggestion-idx="${itemIdx}">
                        <div class="schema-autocomplete-item-left">
                           <span class="material-symbols-outlined schema-autocomplete-item-icon">view_column</span>
                           <span>${highlightMatch(colName, q)}</span>
                        </div>
                        <span class="schema-autocomplete-type-badge">Column</span>
                     </div>
                  `;
               });
            }

            if (matchingTypes.length > 0) {
               html += `<div class="schema-autocomplete-section-title">Data Types (${matchingTypes.length})</div>`;
               matchingTypes.forEach((t) => {
                  const itemIdx = currentSuggestions.findIndex(
                     (item) => item.text === t && item.type === 'type',
                  );
                  html += /* html */ `
                     <div class="schema-autocomplete-item" data-suggestion-idx="${itemIdx}">
                        <div class="schema-autocomplete-item-left">
                           <span class="material-symbols-outlined schema-autocomplete-item-icon">data_object</span>
                           <span>${highlightMatch(t, q)}</span>
                        </div>
                        <span class="schema-autocomplete-type-badge">Type</span>
                     </div>
                  `;
               });
            }

            html += `</div>`;
            popoverEl.innerHTML = html;
            popoverEl.classList.remove('hidden');

            popoverEl
               .querySelectorAll('.schema-autocomplete-item')
               .forEach((el) => {
                  el.addEventListener('mousedown', (e) => {
                     e.preventDefault();
                     const idx = parseInt(el.dataset.suggestionIdx, 10);
                     if (currentSuggestions[idx]) {
                        applySuggestion(currentSuggestions[idx].text);
                     }
                  });
               });
         };

         const updateActiveSuggestion = () => {
            if (!popoverEl) return;
            const items = popoverEl.querySelectorAll(
               '.schema-autocomplete-item',
            );
            items.forEach((item, idx) => {
               if (idx === activeSuggestionIdx) {
                  item.classList.add('active');
                  item.scrollIntoView({ block: 'nearest' });
               } else {
                  item.classList.remove('active');
               }
            });
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
               renderSuggestions();
            });

            searchInput.addEventListener('focus', () => {
               renderSuggestions();
            });

            searchInput.addEventListener('keydown', (e) => {
               if (
                  popoverEl &&
                  !popoverEl.classList.contains('hidden') &&
                  currentSuggestions.length > 0
               ) {
                  if (e.key === 'ArrowDown') {
                     e.preventDefault();
                     activeSuggestionIdx =
                        (activeSuggestionIdx + 1) % currentSuggestions.length;
                     updateActiveSuggestion();
                  } else if (e.key === 'ArrowUp') {
                     e.preventDefault();
                     activeSuggestionIdx =
                        (activeSuggestionIdx - 1 + currentSuggestions.length) %
                        currentSuggestions.length;
                     updateActiveSuggestion();
                  } else if (e.key === 'Enter') {
                     if (
                        activeSuggestionIdx >= 0 &&
                        currentSuggestions[activeSuggestionIdx]
                     ) {
                        e.preventDefault();
                        applySuggestion(
                           currentSuggestions[activeSuggestionIdx].text,
                        );
                     }
                  } else if (e.key === 'Escape') {
                     e.preventDefault();
                     hideSuggestions();
                  }
               }
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
                  hideSuggestions();
                  window.renderSchemaGrid();
                  searchInput.focus();
               }
            };
         }

         document.addEventListener('click', (e) => {
            if (
               popoverEl &&
               !popoverEl.contains(e.target) &&
               searchInput &&
               !searchInput.contains(e.target)
            ) {
               hideSuggestions();
            }
         });

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

               loadTableSchema(tableName, btnElement, container);
            };
      } else {
         renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Error: ${res.error}</div>`;
      }
   } catch (err) {
      renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Failed to load schema: ${err.message}</div>`;
   }
}
