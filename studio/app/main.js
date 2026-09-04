import { HeaderHTML } from '../components/header.js';
import { SideBarHTML } from '../components/sidebarHTML.js';
import { TabHTML } from '../components/tab.js';
import { initSidebar } from '../components/sidebar.js';
import { loadTableData, saveDataGridEdits } from './data/view.js';
import { loadTableSchema, saveSchemaEdits } from './schema/view.js';
import { loadSqlConsole } from './console/view.js';
import { loadErd } from './erd/view.js';
import { loadStatusDashboard, refreshStatusDashboard } from './status/view.js';
import { loadConnectView } from './connect/view.js';
import { fetchConfig } from '../lib/api.js';
import { initTheme } from '../components/theme.js';
import { initToast } from '../components/toast.js';
import { bindGridEvents } from './grid/events.js';
import { getFilterQuery } from './data/utils.js';
const header = document.getElementById('header-container');
const sidebar = document.getElementById('sidebar-container');
const tab = document.getElementById('tab-container');

header.innerHTML = HeaderHTML;
sidebar.innerHTML = SideBarHTML;
tab.innerHTML = TabHTML;

// Setup Export & Import Dropdowns
const exportBtn = document.getElementById('export-btn');
const exportDropdown = document.getElementById('export-dropdown');
const importBtn = document.getElementById('import-btn');
const importDropdown = document.getElementById('import-dropdown');

if (importBtn && importDropdown) {
   importBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpening = importDropdown.classList.contains('hidden');
      importDropdown.classList.toggle('hidden');
      importBtn.classList.toggle('is-open', isOpening);
      if (exportDropdown) {
         exportDropdown.classList.add('hidden');
         exportBtn?.classList.remove('is-open');
      }
   });

   // Helper for table data imports (CSV / JSON)
   const handleTableDataImport = (format) => {
      importDropdown.classList.add('hidden');
      importBtn.classList.remove('is-open');
      const tableName = window.AppState.currentTable;
      if (!tableName) {
         window.showToast(
            'Please select a table from the sidebar first.',
            'error',
         );
         return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = format === 'json' ? '.json' : '.csv';
      input.onchange = async (e) => {
         const file = e.target.files[0];
         if (!file) return;

         const confirmed = confirm(
            `⚠️ IMPORT DATA CONFIRMATION\n\n` +
               `Target Table: ${tableName}\n` +
               `File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)\n` +
               `Format: ${format.toUpperCase()}\n\n` +
               `Are you sure you want to insert records from this file into '${tableName}'?`,
         );
         if (!confirmed) return;

         const formData = new FormData();
         formData.append('file', file);
         formData.append('format', format);

         window.showToast(
            `Importing ${file.name} into '${tableName}'...`,
            'success',
         );

         try {
            const res = await fetch(
               `/api/tables/${encodeURIComponent(tableName)}/import`,
               {
                  method: 'POST',
                  body: formData,
               },
            );
            const result = await res.json();

            if (result.success) {
               window.showToast(
                  result.message || 'Import completed successfully',
                  'success',
               );
               // Refresh table data if currently looking at this table
               if (window.AppState.currentTab === 'data-btn') {
                  const viewId = `view-data-btn-${tableName}`;
                  const container = document.getElementById(viewId);
                  if (container) container.innerHTML = '';
                  window.renderCurrentView('', true);
               }
            } else {
               window.showToast(result.error || 'Import failed', 'error');
            }
         } catch (err) {
            window.showToast('Network error during data import', 'error');
         }
      };
      input.click();
   };

   document
      .getElementById('import-data-csv-btn')
      ?.addEventListener('click', () => {
         handleTableDataImport('csv');
      });

   document
      .getElementById('import-data-json-btn')
      ?.addEventListener('click', () => {
         handleTableDataImport('json');
      });

   // ERD Layout Import (.json)
   document
      .getElementById('import-erd-json-btn')
      ?.addEventListener('click', () => {
         importDropdown.classList.add('hidden');
         importBtn.classList.remove('is-open');
         const input = document.createElement('input');
         input.type = 'file';
         input.accept = '.json';
         input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const confirmed = confirm(
               `⚠️ IMPORT ERD LAYOUT CONFIRMATION\n\n` +
                  `File: ${file.name}\n\n` +
                  `Are you sure you want to import this ERD layout? This will update table coordinates on your diagram canvas.`,
            );
            if (!confirmed) return;

            try {
               const text = await file.text();
               const parsed = JSON.parse(text);
               if (typeof parsed !== 'object' || parsed === null) {
                  throw new Error('Invalid ERD layout JSON structure.');
               }

               const positions = parsed.positions || parsed;
               localStorage.setItem(
                  'drixio-erd-positions',
                  JSON.stringify(positions),
               );
               window.showToast('ERD layout imported successfully!', 'success');

               // Reload ERD view if open
               const erdContainer = document.getElementById('view-erd-btn');
               if (erdContainer) {
                  erdContainer.innerHTML = '';
                  if (window.AppState.currentTab === 'erd-btn') {
                     window.renderCurrentView();
                  }
               }
            } catch (err) {
               window.showToast(
                  `Failed to parse ERD layout: ${err.message}`,
                  'error',
               );
            }
         };
         input.click();
      });

   // Database (.sql) Restore
   document
      .getElementById('import-db-sql-btn')
      ?.addEventListener('click', () => {
         importDropdown.classList.add('hidden');
         importBtn.classList.remove('is-open');
         const input = document.createElement('input');
         input.type = 'file';
         input.accept = '.sql';
         input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const confirmed = confirm(
               `🚨 HIGH RISK ACTION: DATABASE RESTORE\n\n` +
                  `File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)\n\n` +
                  `Executing this SQL script directly against the database may modify, truncate, or drop existing tables and records.\n\n` +
                  `Are you sure you want to proceed?`,
            );
            if (!confirmed) return;

            const formData = new FormData();
            formData.append('file', file);

            window.showToast(
               `Executing ${file.name} on database...`,
               'success',
            );

            try {
               const res = await fetch('/api/database/import', {
                  method: 'POST',
                  body: formData,
               });
               const result = await res.json();

               if (result.success) {
                  window.showToast(
                     result.message || 'Database restored successfully',
                     'success',
                  );
                  setTimeout(() => location.reload(), 1500);
               } else {
                  window.showToast(result.error || 'Import failed', 'error');
               }
            } catch (err) {
               window.showToast(
                  'Network error during database import',
                  'error',
               );
            }
         };
         input.click();
      });
}

if (exportBtn && exportDropdown) {
   exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpening = exportDropdown.classList.contains('hidden');
      exportDropdown.classList.toggle('hidden');
      exportBtn.classList.toggle('is-open', isOpening);
      if (importDropdown) {
         importDropdown.classList.add('hidden');
         importBtn?.classList.remove('is-open');
      }

      // Dynamic visibility based on current tab
      const isDataTab = window.AppState.currentTab === 'data-btn';
      const isConsoleTab = window.AppState.currentTab === 'console-btn';

      document.querySelectorAll('.data-tab-only').forEach((el) => {
         el.style.display = isDataTab ? 'list-item' : 'none';
      });
      document.querySelectorAll('.console-tab-only').forEach((el) => {
         el.style.display = isConsoleTab ? 'list-item' : 'none';
      });
   });

   document.addEventListener('click', (e) => {
      if (
         !exportBtn.contains(e.target) &&
         !exportDropdown.contains(e.target) &&
         (!importBtn || !importBtn.contains(e.target)) &&
         (!importDropdown || !importDropdown.contains(e.target))
      ) {
         exportDropdown.classList.add('hidden');
         exportBtn.classList.remove('is-open');
         if (importDropdown) {
            importDropdown.classList.add('hidden');
            importBtn?.classList.remove('is-open');
         }
      }
   });

   const triggerExport = (endpoint, format, useQueries = false) => {
      exportDropdown.classList.add('hidden');
      exportBtn.classList.remove('is-open');
      if (endpoint === '/api/query/export') {
         const sqlEditor =
            document.querySelector('#sql-editor textarea') ||
            document.querySelector('#sql-editor');
         let sql = '';
         if (sqlEditor && sqlEditor.value) sql = sqlEditor.value;
         if (!sql && window.ViewCache && window.ViewCache.lastQuery)
            sql = window.ViewCache.lastQuery;

         if (!sql) {
            alert('No SQL query found to export.');
            return;
         }

         fetch(`/api/query/export?format=${format}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql }),
         })
            .then((res) => {
               if (!res.ok)
                  return res.json().then((j) => {
                     throw new Error(j.error || 'Export failed');
                  });
               return res.blob();
            })
            .then((blob) => {
               const url = URL.createObjectURL(blob);
               const a = document.createElement('a');
               a.href = url;
               a.download = `query_result_${new Date().getTime()}.${format}`;
               document.body.appendChild(a);
               a.click();
               a.remove();
            })
            .catch((err) => alert('Failed to export query: ' + err.message));
         return;
      }

      let url = `${endpoint}?format=${format}`;
      if (useQueries && window.DataGrid) {
         const whereClause = getFilterQuery ? getFilterQuery() : '';
         const orderCol = window.DataGrid.sortState?.col || '';
         const orderAsc = window.DataGrid.sortState?.asc ?? true;
         url += `&where=${encodeURIComponent(whereClause)}&orderCol=${orderCol}&orderAsc=${orderAsc}`;
      }
      window.open(url, '_blank');
   };

   document
      .getElementById('export-data-csv-btn')
      ?.addEventListener('click', () => {
         if (window.AppState.currentTable)
            triggerExport(
               `/api/tables/${window.AppState.currentTable}/export`,
               'csv',
            );
      });

   document
      .getElementById('export-data-json-btn')
      ?.addEventListener('click', () => {
         if (window.AppState.currentTable)
            triggerExport(
               `/api/tables/${window.AppState.currentTable}/export`,
               'json',
            );
      });

   document
      .getElementById('export-data-filtered-csv-btn')
      ?.addEventListener('click', () => {
         if (window.AppState.currentTable)
            triggerExport(
               `/api/tables/${window.AppState.currentTable}/export`,
               'csv',
               true,
            );
      });

   document
      .getElementById('export-data-filtered-json-btn')
      ?.addEventListener('click', () => {
         if (window.AppState.currentTable)
            triggerExport(
               `/api/tables/${window.AppState.currentTable}/export`,
               'json',
               true,
            );
      });

   document
      .getElementById('export-schema-dict-btn')
      ?.addEventListener('click', () => {
         window.open(`/api/database/dictionary`, '_blank');
         exportDropdown.classList.add('hidden');
         exportBtn.classList.remove('is-open');
      });

   document
      .getElementById('export-schema-sql-btn')
      ?.addEventListener('click', () => {
         window.open(`/api/database/schema-only`, '_blank');
         exportDropdown.classList.add('hidden');
         exportBtn.classList.remove('is-open');
      });

   document
      .getElementById('export-console-csv-btn')
      ?.addEventListener('click', () => {
         triggerExport(`/api/query/export`, 'csv');
      });

   document
      .getElementById('export-console-json-btn')
      ?.addEventListener('click', () => {
         triggerExport(`/api/query/export`, 'json');
      });

   document
      .getElementById('export-erd-json-btn')
      ?.addEventListener('click', () => {
         const data = localStorage.getItem('drixio_erd_drafts');
         if (!data) {
            alert('No ERD layout found to export.');
            return;
         }
         const blob = new Blob([data], { type: 'application/json' });
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `erd_layout_${new Date().getTime()}.json`;
         a.click();
         exportDropdown.classList.add('hidden');
         exportBtn.classList.remove('is-open');
      });

   document
      .getElementById('export-db-sql-btn')
      ?.addEventListener('click', () => {
         window.open(`/api/database/export`, '_blank');
         exportDropdown.classList.add('hidden');
         exportBtn.classList.remove('is-open');
      });
}

window.AppState = {
   currentTable: null,
   currentTab: 'data-btn',
   currentTableBtnElement: null,
   dbType: null,
};

window.setStudioConnectionMode = function (connected) {
   const dataBtn = document.getElementById('data-btn');
   const schemaBtn = document.getElementById('schema-btn');
   const erdBtn = document.getElementById('erd-btn');
   const statusBtn = document.getElementById('status-btn');
   const connectBtn = document.getElementById('connect-btn');

   const exportWrap = document
      .getElementById('export-btn')
      ?.closest('.header-dropdown-wrap');
   const importWrap = document
      .getElementById('import-btn')
      ?.closest('.header-dropdown-wrap');
   const slash = document.getElementById('slash');
   const currentTableCrumb = document.getElementById('current-table');
   const dbNameEl = document.getElementById('db-name');

   if (!connected) {
      dataBtn?.classList.add('hidden');
      schemaBtn?.classList.add('hidden');
      erdBtn?.classList.add('hidden');
      statusBtn?.classList.add('hidden');
      connectBtn?.classList.remove('hidden');

      if (exportWrap) exportWrap.classList.add('hidden');
      if (importWrap) importWrap.classList.add('hidden');
      if (slash) slash.classList.add('hidden');
      if (currentTableCrumb) currentTableCrumb.classList.add('hidden');
      if (dbNameEl) dbNameEl.textContent = 'No Database';

      if (
         window.AppState.currentTab !== 'connect-btn' &&
         window.AppState.currentTab !== 'sql-btn'
      ) {
         window.handleSwitchTab('connect-btn');
      }
   } else {
      dataBtn?.classList.remove('hidden');
      schemaBtn?.classList.remove('hidden');
      erdBtn?.classList.remove('hidden');
      statusBtn?.classList.remove('hidden');
      connectBtn?.classList.add('hidden');

      if (exportWrap) exportWrap.classList.remove('hidden');
      if (importWrap) importWrap.classList.remove('hidden');
      if (slash) slash.classList.remove('hidden');
      if (currentTableCrumb) currentTableCrumb.classList.remove('hidden');

      if (window.AppState.currentTab === 'connect-btn') {
         window.handleSwitchTab('data-btn');
      }
   }
};

fetchConfig().then((res) => {
   if (res && res.success && res.data) {
      window.AppState.dbType = res.data.dbType;
      if (res.data.dbName) {
         const dbNameEl = document.getElementById('db-name');
         if (dbNameEl) dbNameEl.textContent = res.data.dbName;
      }
      if (res.data.connected && res.data.dbType && res.data.dbType !== 'none') {
         window.setStudioConnectionMode(true);
      } else {
         window.setStudioConnectionMode(false);
      }
   } else {
      window.setStudioConnectionMode(false);
   }
});

window.TableStates = {};
window.ViewCache = {};

window.updateSidebarDirtyState = function () {
   const allBtns = document.querySelectorAll('.table-btn');
   allBtns.forEach((btn) => {
      const tableName = btn.dataset.table; // Assuming we add data-table to sidebar btns
      // Fallback if data-table is not present, use textContent
      const text = btn.querySelector('span').textContent;
      const tName = tableName || text.replace(/\s*\*$/, '');
      const state = window.TableStates[tName];

      let isDirty = false;
      if (state) {
         if (state.dataGrid) {
            const dg = state.dataGrid;
            if (
               Object.keys(dg.pendingEdits || {}).length > 0 ||
               (dg.pendingInserts &&
                  dg.pendingInserts.some(
                     (obj) => Object.keys(obj).length > 0,
                  )) ||
               (dg.pendingDeletes && dg.pendingDeletes.size > 0)
            ) {
               isDirty = true;
            }
         }
         if (state.schemaGrid) {
            const sg = state.schemaGrid;
            const hasIndexEdits =
               sg.pendingIndexEdits &&
               (sg.pendingIndexEdits.added.length > 0 ||
                  sg.pendingIndexEdits.dropped.length > 0);
            if (
               Object.keys(sg.pendingEdits || {}).length > 0 ||
               (sg.pendingInserts &&
                  sg.pendingInserts.some(
                     (obj) => Object.keys(obj).length > 0,
                  )) ||
               (sg.pendingDeletes && sg.pendingDeletes.size > 0) ||
               hasIndexEdits
            ) {
               isDirty = true;
            }
         }
      }

      const span = btn.querySelector('span');
      const baseText = span.textContent.replace(/\s*\*$/, '');
      const dirtyDot = btn.querySelector('.dirty-indicator-dot');

      span.textContent = baseText;
      if (isDirty) {
         span.style.fontWeight = '600';
         if (dirtyDot) dirtyDot.classList.remove('hidden');
      } else {
         span.style.fontWeight = '500';
         if (dirtyDot) dirtyDot.classList.add('hidden');
      }
   });
};

window.handleSwitchTab = function (tab) {
   const tabs = document.querySelectorAll('.tab-btn');
   tabs.forEach((btn) => btn.classList.remove('isCurrentTab'));
   const currentTab = document.getElementById(tab);
   if (currentTab) currentTab.classList.add('isCurrentTab');
   window.AppState.currentTab = tab;

   if (
      tab === 'erd-btn' ||
      tab === 'sql-btn' ||
      tab === 'status-btn' ||
      tab === 'connect-btn'
   ) {
      // These are global tabs, clear table selection
      window.AppState.currentTable = null;
      window.AppState.currentTableBtnElement = null;
      document
         .querySelectorAll('.table-btn')
         .forEach((b) => b.classList.remove('active'));
   } else if (tab === 'data-btn' || tab === 'schema-btn') {
      // These tabs require a table, auto-select first one if none selected
      if (!window.AppState.currentTable) {
         const firstTableBtn = document.querySelector('.table-btn');
         if (firstTableBtn) {
            window.AppState.currentTable =
               firstTableBtn.dataset.table ||
               firstTableBtn
                  .querySelector('span')
                  .textContent.replace(/\s*\*$/, '');
            window.AppState.currentTableBtnElement = firstTableBtn;
            firstTableBtn.classList.add('active');
         }
      } else {
         window.updateSidebarActiveTable?.(window.AppState.currentTable);
      }
   }

   window.renderCurrentView();
};

window.renderEmptyState = function (container) {
   container.innerHTML = /* html */ `
    <div class="empty-state">
      <div class="icon-container">
        <span class="material-symbols-outlined">database</span>
      </div>
      <h2>No Table Selected</h2>
      <p>Select a table from the sidebar to view its data, schema, or run SQL queries.</p>
    </div>
  `;
};

window.renderCurrentView = function (whereClause = '', preserveState = false) {
   const isGlobalTab = [
      'erd-btn',
      'sql-btn',
      'status-btn',
      'connect-btn',
   ].includes(window.AppState.currentTab);
   const mainContent = document.getElementById('main-content');

   // Hide all view containers
   document
      .querySelectorAll('.view-container')
      .forEach((el) => (el.style.display = 'none'));

   // Determine view ID
   const viewId = isGlobalTab
      ? `view-${window.AppState.currentTab}`
      : `view-${window.AppState.currentTab}-${window.AppState.currentTable}`;

   let container = document.getElementById(viewId);
   if (!container) {
      container = document.createElement('div');
      container.id = viewId;
      container.className = 'view-container';
      container.style.width = '100%';
      container.style.flex = '1';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.overflow = 'hidden';
      mainContent.appendChild(container);
   }

   container.style.display = 'flex';

   if (!window.AppState.currentTable && !isGlobalTab) {
      window.renderEmptyState(container);
      return;
   }

   const tableName = window.AppState.currentTable;
   if (tableName && !window.TableStates[tableName]) {
      window.TableStates[tableName] = { dataGrid: null, schemaGrid: null };
   }

   if (window.AppState.currentTab === 'data-btn') {
      // Restore state
      if (window.TableStates[tableName].dataGrid) {
         window.DataGrid = window.TableStates[tableName].dataGrid;
      }

      // Only fetch if it's new or not cached, unless refresh is triggered (preserveState handles sorting logic internally)
      if (
         !window.TableStates[tableName].dataGrid ||
         !container.hasChildNodes()
      ) {
         loadTableData(
            tableName,
            window.AppState.currentTableBtnElement,
            whereClause,
            preserveState,
            container,
         );
      } else {
         window.updateSidebarActiveTable?.(tableName);
      }
   } else if (window.AppState.currentTab === 'schema-btn') {
      if (window.TableStates[tableName].schemaGrid) {
         window.SchemaGrid = window.TableStates[tableName].schemaGrid;
      }
      if (
         !window.TableStates[tableName].schemaGrid ||
         !container.hasChildNodes()
      ) {
         loadTableSchema(
            tableName,
            window.AppState.currentTableBtnElement,
            container,
         );
      } else {
         window.updateSidebarActiveTable?.(tableName);
      }
   } else if (window.AppState.currentTab === 'sql-btn') {
      if (!container.hasChildNodes()) {
         loadSqlConsole(
            tableName,
            window.AppState.currentTableBtnElement,
            container,
         );
      }
   } else if (window.AppState.currentTab === 'erd-btn') {
      if (!container.hasChildNodes()) {
         loadErd(container);
      }
   } else if (window.AppState.currentTab === 'status-btn') {
      if (!container.hasChildNodes()) {
         loadStatusDashboard(container);
      } else {
         refreshStatusDashboard();
      }
   } else if (window.AppState.currentTab === 'connect-btn') {
      if (!container.hasChildNodes()) {
         loadConnectView(container);
      }
   }

   // Synchronize Header Breadcrumbs with active view
   const headerIcon = document.getElementById('table-icon');
   const headerName = document.getElementById('table-name');

   if (headerIcon && headerName) {
      if (tableName) {
         headerIcon.textContent = 'table_chart';
         headerName.textContent = tableName;
      } else {
         if (window.AppState.currentTab === 'erd-btn') {
            headerIcon.textContent = 'account_tree';
            headerName.textContent = 'ER Diagram';
         } else if (window.AppState.currentTab === 'sql-btn') {
            headerIcon.textContent = 'terminal';
            headerName.textContent = 'SQL Console';
         } else if (window.AppState.currentTab === 'status-btn') {
            headerIcon.textContent = 'monitoring';
            headerName.textContent = 'Dashboard';
         } else if (window.AppState.currentTab === 'connect-btn') {
            headerIcon.textContent = 'cable';
            headerName.textContent = 'Connect Database';
         } else {
            headerIcon.textContent = 'table_chart';
            headerName.textContent = 'none';
         }
      }
   }

   // Highlight active sidebar btn since DOM cache might lose active styling dynamically
   document
      .querySelectorAll('.table-btn')
      .forEach((b) => b.classList.remove('active'));
   if (window.AppState.currentTableBtnElement) {
      window.AppState.currentTableBtnElement.classList.add('active');
   }
};

window.saveDataGridEdits = saveDataGridEdits;
window.saveSchemaEdits = saveSchemaEdits;

document.addEventListener('DOMContentLoaded', () => {
   initSidebar();

   initTheme();
   initToast();
   bindGridEvents();

   // Header quick refresh button handler
   const headerRefreshBtn = document.getElementById('header-refresh-btn');
   if (headerRefreshBtn) {
      headerRefreshBtn.addEventListener('click', () => {
         const spinIcon = headerRefreshBtn.querySelector(
            '.material-symbols-outlined',
         );
         spinIcon?.classList.add('animate-spin');

         const currentTab = window.AppState.currentTab;
         const tableName = window.AppState.currentTable;

         if (tableName) {
            const viewId = `view-${currentTab}-${tableName}`;
            const container = document.getElementById(viewId);
            if (container) container.innerHTML = '';
         }

         window.renderCurrentView('', true);

         setTimeout(() => {
            spinIcon?.classList.remove('animate-spin');
            if (window.showToast) window.showToast('Data refreshed', 'success');
         }, 350);
      });
   }
});
