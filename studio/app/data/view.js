import {
   fetchTableSchema,
   fetchTableWithName,
   truncateTableApi,
   mutateTableSchema,
} from '../../lib/api.js';
import {
   bindColumnResizer,
   bindCellSelection,
   selectAllGridCells,
} from '../grid/view.js';
import { bindCellEditor } from './events.js';
import { getFilterQuery, generateRowHtml } from './utils.js';
import { bindFkPreview } from './fkPreview.js';
import { openMockDataModal } from './modal.js';
import { showContextMenu } from '../../components/contextMenu.js';
import { renderFilterBar, clearTableFilters } from './filterBar.js';
import {
   renderColumnVisibilityButton,
   applyColumnVisibility,
   getHiddenColumns,
} from './columnVisibility.js';
import { openCellDrawer } from './cellDrawer.js';
import {
   selectAllRows,
   handleRowCheckboxChange,
   clearRowSelection,
} from './bulkBar.js';
import { updateCell } from './core.js';

export { saveDataGridEdits } from './core.js';

export async function loadTableData(
   tableName,
   btnElement,
   whereClause = '',
   preserveState = false,
   container = null,
) {
   if (window.updateSidebarActiveTable) {
      window.updateSidebarActiveTable(tableName);
   } else {
      const allBtns = document.querySelectorAll('.table-btn');
      allBtns.forEach((b) => b.classList.remove('active'));
      const activeBtn =
         btnElement ||
         document.querySelector(`.table-btn[data-table="${tableName}"]`);
      if (activeBtn) {
         activeBtn.classList.add('active');
         if (window.AppState)
            window.AppState.currentTableBtnElement = activeBtn;
      }
   }

   const headerTableName = document.getElementById('table-name');
   if (headerTableName) headerTableName.textContent = tableName;

   const renderTarget = container || document.getElementById('main-content');
   if (!preserveState) {
      renderTarget.innerHTML = "<div class='p-6'>Loading...</div>";
   }

   try {
      const schemaRes = await fetchTableSchema(tableName);
      if (!schemaRes.success) throw new Error(schemaRes.error);
      const schema = schemaRes.data;
      const pkColumns = schema.filter((c) => c.isPk).map((c) => c.name);
      const pkColumn = pkColumns[0];
      const isCompositePk = pkColumns.length > 1;

      if (!preserveState || !window.DataGrid) {
         window.DataGrid = {
            schema,
            pkColumn,
            pkColumns,
            isCompositePk,
            pendingEdits: {},
            pendingInserts: [{}],
            pendingDeletes: new Set(),
            selectedCell: null,
            history: [],
            currentTransaction: null,
            sortState: { col: pkColumn || schema[0].name, asc: true },
            pagination: {
               limit: 50,
               offset: 0,
               isLoading: false,
               hasMore: true,
            },
            selection: {
               isDragging: false,
               isDraggingRow: false,
               startRow: -1,
               startCol: -1,
               endRow: -1,
               endCol: -1,
            },
         };
      }

      // Cache the grid reference
      if (window.TableStates && window.TableStates[tableName]) {
         window.TableStates[tableName].dataGrid = window.DataGrid;
      }

      const options = {
         where: whereClause,
         limit: window.DataGrid.pagination.limit,
         offset: window.DataGrid.pagination.offset,
         orderCol: window.DataGrid.sortState.col,
         orderAsc: window.DataGrid.sortState.asc,
      };

      const res = await fetchTableWithName(tableName, options);
      if (res.success && res.data) {
         window.loadTableStats?.();
         const rows = res.data.rows;
         const columns = res.data.columns;
         window.DataGrid.rows = rows;
         window.DataGrid.columns = columns;
         window.DataGrid.pagination.hasMore =
            rows.length === window.DataGrid.pagination.limit;

         if (!preserveState) {
            const hasFkNav =
               window.fkNavHistory && window.fkNavHistory.toTable === tableName;
            const backBtnHtml = hasFkNav
               ? `<button type="button" id="btn-fk-back-${tableName}" class="fk-back-btn" title="Back to table '${window.fkNavHistory.fromTable}'">
               <span class="material-symbols-outlined icon-14">arrow_back</span>
               <span>Back to ${window.fkNavHistory.fromTable}</span>
             </button>`
               : '';

            let html = `
          <div class="toolbar">
            ${backBtnHtml}
            <div id="filter-bar-mount-${tableName}" class="flex-1" style="height: 100%; display: flex; align-items: center; min-width: 0;"></div>
            <div id="col-visibility-mount-${tableName}" class="toolbar-item" style="display: flex; align-items: center;"></div>
            <div class="page-size-picker flex items-center gap-1.5" title="Rows per page">
              <span class="material-symbols-outlined icon-14 text-secondary">table_rows</span>
              <select id="select-page-size-${tableName}" class="page-size-select">
                <option value="25">25 / page</option>
                <option value="50" selected>50 / page</option>
                <option value="100">100 / page</option>
                <option value="200">200 / page</option>
              </select>
            </div>
            <button id="btn-refresh-data-${tableName}" class="refresh-btn" title="Refresh Data (F5)">
              <span class="material-symbols-outlined">refresh</span>
            </button>
          </div>
          <div id="bulk-bar-mount-${tableName}"></div>
          <div class="table-container" id="data-grid-container-${tableName}"></div>
        `;
            renderTarget.innerHTML = html;

            const filterBarMount = document.getElementById(
               `filter-bar-mount-${tableName}`,
            );
            if (filterBarMount) {
               renderFilterBar({
                  container: filterBarMount,
                  tableName,
                  schema,
                  onFilterChange: () => {
                     if (window.DataGrid) window.DataGrid.pagination.offset = 0;
                     loadTableData(
                        tableName,
                        btnElement,
                        getFilterQuery(tableName),
                        true,
                     );
                  },
               });
            }

            const colVisMount = document.getElementById(
               `col-visibility-mount-${tableName}`,
            );
            if (colVisMount) {
               renderColumnVisibilityButton({
                  container: colVisMount,
                  tableName,
                  schema,
               });
            }

            const pageSizeSelect = document.getElementById(
               `select-page-size-${tableName}`,
            );
            if (pageSizeSelect) {
               pageSizeSelect.value = String(window.DataGrid.pagination.limit || 50);
               pageSizeSelect.onchange = (e) => {
                  const newLimit = parseInt(e.target.value, 10);
                  if (newLimit && window.DataGrid) {
                     window.DataGrid.pagination.limit = newLimit;
                     window.DataGrid.pagination.offset = 0;
                     loadTableData(
                        tableName,
                        btnElement,
                        getFilterQuery(tableName),
                        true,
                     );
                  }
               };
            }
         }

         const tableContainer = document.getElementById(
            `data-grid-container-${tableName}`,
         );
         if (!tableContainer) {
            return;
         }

         const isTableEmpty =
            (!rows || rows.length === 0) && !window.forceEmptyGrid;

         if (isTableEmpty) {
            const isFiltered = !!whereClause;
            if (isFiltered) {
               tableContainer.innerHTML = /* html */ `
                  <div class="table-empty-container">
                     <div class="table-empty-card">
                        <div class="table-empty-icon-wrap">
                           <span class="material-symbols-outlined table-empty-icon">search_off</span>
                        </div>
                        <h3 class="table-empty-title">No matching records found</h3>
                        <p class="table-empty-desc">No records in "${tableName}" matched the current filter conditions.</p>
                        <div class="table-empty-actions">
                           <button type="button" class="table-empty-btn-primary" id="btn-empty-clear-filter-${tableName}">
                              <span class="material-symbols-outlined icon-16">filter_alt_off</span>
                              <span>Clear Filter</span>
                           </button>
                        </div>
                     </div>
                  </div>
               `;
               const clearBtn = document.getElementById(
                  `btn-empty-clear-filter-${tableName}`,
               );
               if (clearBtn) {
                  clearBtn.onclick = () => {
                     clearTableFilters(tableName);
                     loadTableData(tableName, btnElement, '', false);
                  };
               }
            } else {
               tableContainer.innerHTML = /* html */ `
                  <div class="table-empty-container">
                     <div class="table-empty-card">
                        <div class="table-empty-icon-wrap">
                           <span class="material-symbols-outlined table-empty-icon">dataset</span>
                        </div>
                        <h3 class="table-empty-title">Table "${tableName}" is empty</h3>
                        <p class="table-empty-desc">This table currently contains 0 records. You can insert a new row manually or generate realistic mock data with one click.</p>
                        <div class="table-empty-actions">
                           <button type="button" class="table-empty-btn-secondary" id="btn-empty-add-row-${tableName}">
                              <span class="material-symbols-outlined icon-16">add</span>
                              <span>Insert Row</span>
                           </button>
                           <button type="button" class="table-empty-btn-primary" id="btn-empty-mock-${tableName}">
                              <span class="material-symbols-outlined icon-16">auto_fix_high</span>
                              <span>Generate Mock Data</span>
                           </button>
                        </div>
                     </div>
                  </div>
               `;

               const emptyMockBtn = document.getElementById(
                  `btn-empty-mock-${tableName}`,
               );
               if (emptyMockBtn) {
                  emptyMockBtn.onclick = () => {
                     openMockDataModal(tableName, schema, () => {
                        window.forceEmptyGrid = false;
                        loadTableData(tableName, btnElement, '', true);
                     });
                  };
               }

               const emptyAddBtn = document.getElementById(
                  `btn-empty-add-row-${tableName}`,
               );
               if (emptyAddBtn) {
                  emptyAddBtn.onclick = () => {
                     window.forceEmptyGrid = true;
                     loadTableData(tableName, btnElement, '', true);
                  };
               }
            }
         } else {
            let tableHtml = `<table class="data-table" id="data-grid-table-${tableName}"><thead><tr>`;
            tableHtml += `<th class="row-header table-corner-header" id="th-row-header-${tableName}" title="Click to select all cells, right-click for table actions"><span class="corner-num">#</span><input type="checkbox" id="select-all-rows-${tableName}" class="row-select-checkbox corner-checkbox" title="Select all rows" /></th>`;
            columns.forEach((col) => {
               const colSchema = schema.find((c) => c.name === col);
               let colIcon = '';
               let typeText = colSchema?.type || '';
               if (colSchema) {
                  const isPk = !!colSchema.isPk;
                  const isFk = !!colSchema.fkTarget;
                  if (isPk) {
                     colIcon = `<span class="material-symbols-outlined col-pk-key-icon" title="Primary Key">key</span>`;
                  } else if (
                     isFk ||
                     colSchema.name.toLowerCase().includes('id')
                  ) {
                     colIcon = `<span class="material-symbols-outlined col-fk-icon" title="Foreign Key">link</span>`;
                  }
               }

               const isSorted = window.DataGrid.sortState.col === col;

               tableHtml += /* html */ `<th class="sortable ${isSorted ? 'sorted' : ''}" data-col="${col}" title="Click for column options">
                      <div class="th-content-wrapper">
                         <div class="th-main-group">
                            ${colIcon}
                            <span class="th-col-name">${col}</span>
                            ${typeText ? `<span class="th-col-type">${typeText.toLowerCase()}</span>` : ''}
                         </div>
                         <div class="th-actions-group">
                            <button type="button" class="th-menu-trigger ${isSorted ? 'is-sorted' : ''}" title="Column actions">
                               <span class="material-symbols-outlined th-chevron-icon">keyboard_arrow_down</span>
                            </button>
                         </div>
                      </div>
                    </th>`;
            });
            tableHtml += `</tr></thead><tbody>`;

            if (rows && rows.length > 0) {
               rows.forEach((row, rowIndex) => {
                  tableHtml += `<tr>${generateRowHtml(row, rowIndex, pkColumn, columns, schema)}</tr>`;
               });
            }

            if (!window.AppState?.isReadOnly) {
               tableHtml += `<tr class="ghost-row-tr">`;
               const ghostIdx = rows ? rows.length : 0;
               tableHtml += `<td class="row-header" data-row-idx="${ghostIdx}">*</td>`;
               columns.forEach((col, cIdx) => {
                  const cellHint =
                     cIdx === 0
                        ? `<span class="ghost-cell-hint">+ Add Row</span>`
                        : '';
                  tableHtml += `<td class="data-cell ghost-row" data-row-idx="${ghostIdx}" data-col-idx="${cIdx}" data-insert-index="0" data-col="${col}">${cellHint}</td>`;
               });
               tableHtml += `</tr>`;
            }
            tableHtml += `</tbody></table>`;

            tableContainer.innerHTML = tableHtml;

            const hiddenColsInit = getHiddenColumns(tableName);
            if (hiddenColsInit.size > 0) {
               applyColumnVisibility(tableName, hiddenColsInit);
            }

            tableContainer.querySelectorAll('th.sortable').forEach((th) => {
               const col = th.dataset.col;
               const currentTable = tableName;

               const openColumnMenu = (e) => {
                  if (window.DataGrid && window.DataGrid.isResizing) return;
                  if (e.target.closest('.resizer')) return;

                  const grid =
                     window.TableStates?.[currentTable]?.dataGrid ||
                     window.DataGrid;
                  const isSorted = grid?.sortState?.col === col;
                  const isAsc = isSorted && grid?.sortState?.asc;

                  const checkPendingChanges = () => {
                     const hasPending =
                        Object.keys(window.DataGrid.pendingEdits || {}).length >
                           0 ||
                        (window.DataGrid.pendingInserts || []).length > 1 ||
                        (window.DataGrid.pendingDeletes &&
                           window.DataGrid.pendingDeletes.size > 0);
                     if (hasPending) {
                        if (window.showToast) {
                           window.showToast(
                              'You have unsaved changes. Please save changes before sorting.',
                              'warning',
                           );
                        } else {
                           alert(
                              'You have unsaved changes. Please save changes before sorting.',
                           );
                        }
                        return false;
                     }
                     return true;
                  };

                  const applySort = (asc) => {
                     if (!checkPendingChanges()) return;
                     if (grid) {
                        grid.sortState.col = col;
                        grid.sortState.asc = asc;
                        grid.pagination.offset = 0;
                     }
                     loadTableData(
                        currentTable,
                        btnElement,
                        getFilterQuery(currentTable),
                        true,
                     );
                     if (window.showToast) {
                        window.showToast(
                           `Sorted by ${col} (${asc ? 'Ascending' : 'Descending'})`,
                           'info',
                        );
                     }
                  };

                  const clearSort = () => {
                     if (!checkPendingChanges()) return;
                     if (grid) {
                        grid.sortState.col = null;
                        grid.sortState.asc = true;
                        grid.pagination.offset = 0;
                     }
                     loadTableData(
                        currentTable,
                        btnElement,
                        getFilterQuery(currentTable),
                        true,
                     );
                     if (window.showToast) {
                        window.showToast(`Cleared sort on "${col}"`, 'info');
                     }
                  };

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

                  menuItems.push(
                     'divider',
                     {
                        icon: 'content_copy',
                        label: 'Copy name',
                        action: async () => {
                           try {
                              await navigator.clipboard.writeText(col);
                           } catch {
                              const ta = document.createElement('textarea');
                              ta.value = col;
                              document.body.appendChild(ta);
                              ta.select();
                              document.execCommand('copy');
                              ta.remove();
                           }
                           if (window.showToast) {
                              window.showToast(
                                 `Copied "${col}" to clipboard!`,
                                 'success',
                              );
                           }
                        },
                     },
                     {
                        icon: 'edit',
                        label: 'Edit column',
                        action: () => {
                           if (typeof window.handleSwitchTab === 'function') {
                              window.handleSwitchTab('schema-btn');
                              if (window.showToast) {
                                 window.showToast(
                                    `Switched to Schema Editor for "${col}"`,
                                    'info',
                                 );
                              }
                           }
                        },
                     },
                     {
                        icon: 'filter_alt',
                        label: 'Filter by this column',
                        action: () => {
                           const filterInput = document.getElementById(
                              `filter-bar-input-${currentTable}`,
                           );
                           if (filterInput) {
                              filterInput.focus();
                              filterInput.value = `${col} = `;
                              filterInput.dispatchEvent(
                                 new Event('input', { bubbles: true }),
                              );
                           }
                        },
                     },
                     'divider',
                     {
                        icon: 'delete',
                        label: 'Delete column',
                        danger: true,
                        action: async () => {
                           if (
                              confirm(
                                 `Are you sure you want to delete column "${col}" from table "${currentTable}"?\nThis action cannot be undone!`,
                              )
                           ) {
                              try {
                                 const res = await mutateTableSchema(
                                    currentTable,
                                    {
                                       pendingDeletes: [col],
                                       columns: schema,
                                    },
                                 );
                                 if (res.success) {
                                    if (window.showToast) {
                                       window.showToast(
                                          `Deleted column "${col}"`,
                                          'success',
                                       );
                                    }
                                    loadTableData(
                                       currentTable,
                                       btnElement,
                                       '',
                                       true,
                                    );
                                 } else {
                                    alert(
                                       `Failed to delete column: ${res.error}`,
                                    );
                                 }
                              } catch (err) {
                                 alert(`Error deleting column: ${err.message}`);
                              }
                           }
                        },
                     },
                  );

                  const triggerBtn = th.querySelector('.th-menu-trigger');
                  const targetRect = triggerBtn
                     ? triggerBtn.getBoundingClientRect()
                     : th.getBoundingClientRect();
                  const menuEvent = {
                     clientX: targetRect.left,
                     clientY: targetRect.bottom + 4,
                     preventDefault: () => {},
                     stopPropagation: () => {},
                  };

                  showContextMenu(menuEvent, menuItems);
               };

               th.onclick = openColumnMenu;
               th.oncontextmenu = (e) => {
                  e.preventDefault();
                  openColumnMenu(e);
               };

               bindColumnResizer(th, window.DataGrid);
            });

            bindCellSelection(
               tableContainer,
               `data-grid-table-${tableName}`,
               window.DataGrid,
               columns.length,
            );
            bindCellEditor(tableContainer, schema, columns);
            bindFkPreview(tableContainer, tableName);

            // Bind table corner header (#) Left-click (Select All) & Right-click (Context Menu)
            const cornerHeader = document.getElementById(
               `th-row-header-${tableName}`,
            );
            if (cornerHeader) {
               const handleCornerMenu = (e) => {
                  if (e.preventDefault) e.preventDefault();
                  if (e.stopPropagation) e.stopPropagation();

                  const filterQuery = getFilterQuery(tableName);
                  const sortState = window.DataGrid?.sortState;
                  const isFiltered = !!filterQuery;

                  const buildExportUrl = (fmt) => {
                     let url = `/api/tables/${encodeURIComponent(tableName)}/export?format=${fmt}`;
                     if (filterQuery) {
                        url += `&where=${encodeURIComponent(filterQuery)}`;
                     }
                     if (sortState && sortState.col) {
                        url += `&orderCol=${encodeURIComponent(sortState.col)}&orderAsc=${sortState.asc}`;
                     }
                     return url;
                  };

                  showContextMenu(e, [
                     {
                        icon: 'select_all',
                        label: 'Select All Cells',
                        shortcut: 'Ctrl+A',
                        action: () => {
                           selectAllGridCells(
                              `data-grid-table-${tableName}`,
                              window.DataGrid,
                              columns.length,
                           );
                        },
                     },
                     'divider',
                     {
                        icon: 'auto_fix_high',
                        label: 'Generate Mock Data...',
                        action: () => {
                           openMockDataModal(tableName, schema, () => {
                              loadTableData(
                                 tableName,
                                 btnElement,
                                 getFilterQuery(tableName),
                                 true,
                              );
                           });
                        },
                     },
                     {
                        icon: 'content_copy',
                        label: 'Copy Table Name',
                        action: async () => {
                           try {
                              await navigator.clipboard.writeText(tableName);
                           } catch {
                              const ta = document.createElement('textarea');
                              ta.value = tableName;
                              document.body.appendChild(ta);
                              ta.select();
                              document.execCommand('copy');
                              ta.remove();
                           }
                           if (window.showToast) {
                              window.showToast(
                                 `Copied "${tableName}"`,
                                 'success',
                              );
                           }
                        },
                     },
                     { type: 'divider' },
                     {
                        icon: 'download',
                        label: isFiltered
                           ? 'Export as CSV (Filtered)'
                           : 'Export as CSV',
                        action: () => {
                           window.open(buildExportUrl('csv'), '_blank');
                        },
                     },
                     {
                        icon: 'download',
                        label: isFiltered
                           ? 'Export as JSON (Filtered)'
                           : 'Export as JSON',
                        action: () => {
                           window.open(buildExportUrl('json'), '_blank');
                        },
                     },
                     { type: 'divider' },
                     {
                        icon: 'mop',
                        label: 'Truncate Table (Clear Rows)',
                        danger: true,
                        action: async () => {
                           if (
                              confirm(
                                 `Are you sure you want to delete ALL rows from table "${tableName}"? This cannot be undone!`,
                              )
                           ) {
                              const res = await truncateTableApi(tableName);
                              if (res.success) {
                                 if (window.showToast)
                                    window.showToast(
                                       `Cleared all rows from "${tableName}"`,
                                       'info',
                                    );
                                 loadTableData(tableName, btnElement, '', true);
                              } else {
                                 alert(`Failed to clear table: ${res.error}`);
                              }
                           }
                        },
                     },
                  ]);
               };

               // Left-click selects all cells in the table (unless checkbox was clicked)
               cornerHeader.addEventListener('click', (e) => {
                  if (e.target.closest('.row-select-checkbox')) return;
                  e.preventDefault();
                  e.stopPropagation();
                  selectAllGridCells(
                     `data-grid-table-${tableName}`,
                     window.DataGrid,
                     columns.length,
                  );
               });

               // Right-click opens the context menu
               cornerHeader.addEventListener('contextmenu', handleCornerMenu);

               const selectAllCb = document.getElementById(
                  `select-all-rows-${tableName}`,
               );
               if (selectAllCb) {
                  selectAllCb.onclick = (e) => {
                     e.stopPropagation();
                     selectAllRows(tableName, selectAllCb.checked);
                  };
               }
            }

            // Row Checkbox Selection Events
            tableContainer.addEventListener('change', (e) => {
               const cb = e.target.closest('.row-select-checkbox');
               if (cb && cb.dataset.rowIdx !== undefined) {
                  const rowIdx = parseInt(cb.dataset.rowIdx, 10);
                  handleRowCheckboxChange(
                     tableName,
                     rowIdx,
                     cb.checked,
                     e.shiftKey || window.DataGrid?._lastShiftKey,
                  );
               }
            });

            tableContainer.addEventListener('click', (e) => {
               const cb = e.target.closest('.row-select-checkbox');
               if (cb && cb.dataset.rowIdx !== undefined) {
                  if (window.DataGrid) {
                     window.DataGrid._lastShiftKey = e.shiftKey;
                  }
               }
            });

            // Cell Drawer Trigger Button Event
            tableContainer.addEventListener('click', (e) => {
               const trigger = e.target.closest('.cell-drawer-trigger-btn');
               if (trigger) {
                  e.stopPropagation();
                  e.preventDefault();
                  const td = trigger.closest('td.data-cell');
                  if (td) {
                     const colName = td.dataset.col;
                     const colSchema = schema.find((c) => c.name === colName);
                     openCellDrawer(td, colSchema);
                  }
               }
            });

            // Right-click on Data Cell Context Menu
            tableContainer.addEventListener('contextmenu', (e) => {
               const td = e.target.closest('td.data-cell');
               if (!td) return;
               e.preventDefault();
               e.stopPropagation();

               const colName = td.dataset.col;
               const colSchema = schema.find((c) => c.name === colName);
               let currentVal =
                  td.dataset.original !== undefined
                     ? td.dataset.original
                     : td.querySelector('.cell-text')?.textContent.trim() || '';
               if (currentVal === 'null') currentVal = '';

               showContextMenu(e, [
                  {
                     icon: 'open_in_full',
                     label: 'Inspect in Cell Drawer',
                     action: () => openCellDrawer(td, colSchema),
                  },
                  'divider',
                  {
                     icon: 'content_copy',
                     label: 'Copy Cell Value',
                     action: async () => {
                        try {
                           await navigator.clipboard.writeText(currentVal);
                        } catch {
                           const ta = document.createElement('textarea');
                           ta.value = currentVal;
                           document.body.appendChild(ta);
                           ta.select();
                           document.execCommand('copy');
                           ta.remove();
                        }
                        window.showToast?.('Copied cell value to clipboard', 'info');
                     },
                  },
                  {
                     icon: 'filter_alt',
                     label: `Filter by "${currentVal.length > 20 ? currentVal.slice(0, 20) + '...' : currentVal}"`,
                     action: () => {
                        const filterInput = document.getElementById(
                           `filter-bar-input-${tableName}`,
                        );
                        if (filterInput) {
                           filterInput.value = `${colName} = '${currentVal.replace(/'/g, "''")}'`;
                           filterInput.dispatchEvent(
                              new Event('input', { bubbles: true }),
                           );
                        }
                     },
                  },
                  'divider',
                  {
                     icon: 'block',
                     label: 'Set to NULL',
                     danger: true,
                     disabled:
                        window.AppState?.isReadOnly || (colSchema && colSchema.isPk),
                     action: () => {
                        if (window.AppState?.isReadOnly) return;
                        window.DataGrid.currentTransaction = [];
                        updateCell(td, '', columns);
                        if (window.DataGrid.currentTransaction.length > 0) {
                           window.DataGrid.history.push(
                              window.DataGrid.currentTransaction,
                           );
                        }
                        window.DataGrid.currentTransaction = null;
                     },
                  },
               ]);
            });
         }

         // Bind FK back button if present
         const fkBackBtn = document.getElementById(`btn-fk-back-${tableName}`);
         if (fkBackBtn) {
            fkBackBtn.onclick = () => {
               const fromTable = window.fkNavHistory?.fromTable;
               window.fkNavHistory = null;
               if (fromTable) {
                  const targetBtn =
                     document.querySelector(
                        `.table-btn[data-table="${fromTable}"]`,
                     ) ||
                     Array.from(document.querySelectorAll('.table-btn')).find(
                        (b) => b.textContent.includes(fromTable),
                     );

                  window.AppState.currentTable = fromTable;
                  window.AppState.currentTableBtnElement = targetBtn || null;
                  document
                     .querySelectorAll('.table-btn')
                     .forEach((b) => b.classList.remove('active'));
                  if (targetBtn) targetBtn.classList.add('active');

                  const viewId = `view-data-btn-${fromTable}`;
                  const c = document.getElementById(viewId);
                  if (c) c.innerHTML = '';
                  window.renderCurrentView();
               }
            };
         }

         if (!preserveState) {
            const refreshData = () => {
               const hasPending =
                  Object.keys(window.DataGrid.pendingEdits).length > 0 ||
                  window.DataGrid.pendingInserts.length > 1 ||
                  window.DataGrid.pendingDeletes.size > 0;
               if (hasPending) {
                  const confirmDiscard = confirm(
                     'You have unsaved changes. Are you sure you want to refresh and discard them?',
                  );
                  if (!confirmDiscard) return;
               }

               window.DataGrid.pendingEdits = {};
               window.DataGrid.pendingInserts = [{}];
               window.DataGrid.pendingDeletes = new Set();
               window.DataGrid.history = [];
               window.DataGrid.currentTransaction = null;
               clearRowSelection(tableName);
               window.updateSidebarDirtyState?.();

               if (window.DataGrid) window.DataGrid.pagination.offset = 0;
               loadTableData(
                  tableName,
                  btnElement,
                  getFilterQuery(tableName),
                  true,
               );
            };

            const refreshBtn = document.getElementById(
               `btn-refresh-data-${tableName}`,
            );
            if (refreshBtn) refreshBtn.onclick = refreshData;

            window.DataGrid.refreshData = refreshData;

            const loadMoreData = async () => {
               if (
                  window.DataGrid.pagination.isLoading ||
                  !window.DataGrid.pagination.hasMore
               )
                  return;
               window.DataGrid.pagination.isLoading = true;
               window.DataGrid.pagination.offset +=
                  window.DataGrid.pagination.limit;

               const opts = {
                  where: getFilterQuery(tableName),
                  limit: window.DataGrid.pagination.limit,
                  offset: window.DataGrid.pagination.offset,
                  orderCol: window.DataGrid.sortState.col,
                  orderAsc: window.DataGrid.sortState.asc,
               };

               try {
                  const resMore = await fetchTableWithName(tableName, opts);
                  window.DataGrid.pagination.isLoading = false;
                  if (resMore.success && resMore.data) {
                     const moreRows = resMore.data.rows;
                     window.DataGrid.pagination.hasMore =
                        moreRows.length === window.DataGrid.pagination.limit;

                     const tbody = document.querySelector(
                        `#data-grid-table-${tableName} tbody`,
                     );
                     if (!tbody) return;

                     const firstInsertRow = tbody
                        .querySelector('td[data-insert-index]')
                        ?.closest('tr');
                     const startIdx = window.DataGrid.pagination.offset;

                     moreRows.forEach((row, i) => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = generateRowHtml(
                           row,
                           startIdx + i,
                           pkColumn,
                           columns,
                           schema,
                        );
                        if (firstInsertRow) {
                           tbody.insertBefore(tr, firstInsertRow);
                        } else {
                           tbody.appendChild(tr);
                        }
                     });

                     let currentIdx = startIdx + moreRows.length;
                     const insertedTrs = tbody.querySelectorAll(
                        'td[data-insert-index]',
                     );
                     const processedTrs = new Set();
                     insertedTrs.forEach((td) => {
                        const tr = td.closest('tr');
                        if (processedTrs.has(tr)) return;
                        processedTrs.add(tr);

                        const rowHeader = tr.querySelector('.row-header');
                        if (rowHeader) rowHeader.dataset.rowIdx = currentIdx;
                        tr.querySelectorAll('td.data-cell').forEach(
                           (c) => (c.dataset.rowIdx = currentIdx),
                        );
                        currentIdx++;
                     });

                     const hiddenColsAfterMore = getHiddenColumns(tableName);
                     if (hiddenColsAfterMore.size > 0) {
                        applyColumnVisibility(tableName, hiddenColsAfterMore);
                     }
                  }
               } catch (e) {
                  window.DataGrid.pagination.isLoading = false;
               }
            };

            setTimeout(() => {
               const container = document.getElementById(
                  `data-grid-container-${tableName}`,
               );
               if (container) {
                  container.addEventListener('scroll', (e) => {
                     const { scrollTop, scrollHeight, clientHeight } = e.target;
                     if (scrollTop + clientHeight >= scrollHeight - 50) {
                        loadMoreData();
                     }
                  });
               }
            }, 50);
         }
      } else {
         renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Error: ${res.error}</div>`;
      }
   } catch (err) {
      renderTarget.innerHTML = /* html */ `<div class="p-6 text-error">Failed to load data: ${err.message}</div>`;
   }
}
