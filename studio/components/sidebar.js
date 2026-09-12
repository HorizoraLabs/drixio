import {
   fetchTables,
   fetchTableStats,
   fetchConfig,
   fetchTableSchema,
   truncateTableApi,
   fetchSchemas,
   switchSchemaApi,
} from '../lib/api.js';
import { showContextMenu } from './contextMenu.js';
import { openMockDataModal } from '../app/data/modal.js';
import { openCreateTableModal } from '../app/schema/createTableModal.js';

window.openCreateTableModal = openCreateTableModal;
window.refreshTableList = initSidebar;

let isEventsBound = false;

export async function initSidebar(isRefresh = false) {
   try {
      const tableNav = document.getElementById('table-nav');
      if (!tableNav) return;

      // Show loading skeleton / indication if refresh
      if (isRefresh) {
         tableNav.innerHTML = /* html */ `
        <div class="sidebar-loading-state">
          <span class="material-symbols-outlined animate-spin icon-18">progress_activity</span>
          <span>Refreshing tables...</span>
        </div>
      `;
      }

      const res = await fetchTables();
      tableNav.innerHTML = '';

      // Update database status & type display
      await updateDatabaseStatus();

      // Update schema selector (PostgreSQL only)
      await updateSchemaSelector();

      if (res.success && res.data && res.data.length > 0) {
         const tables = res.data;
         const countBadge = document.getElementById('table-count-badge');
         if (countBadge) countBadge.textContent = tables.length.toString();

         tables.forEach((tableName) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'table-btn';
            btn.dataset.table = tableName;
            btn.title = tableName;

            const initial = (tableName[0] || 'T').toUpperCase();
            // Use <i> for icon to maintain backward compatibility with btn.querySelector("span")
            btn.innerHTML = /* html */ `
          <div class="table-btn-label">
            <i class="material-symbols-outlined table-item-icon">table</i>
            <span class="table-item-initial">${initial}</span>
            <span class="table-name-text">${tableName}</span>
            <span class="dirty-indicator-dot hidden" title="Unsaved changes"></span>
          </div>
          <span class="table-btn-badge hidden" id="badge-${tableName}"></span>
        `;

            btn.onclick = () => {
               if (
                  window.fkNavHistory &&
                  window.fkNavHistory.toTable !== tableName
               ) {
                  window.fkNavHistory = null;
               }
               window.AppState.currentTable = tableName;
               window.AppState.currentTableBtnElement = btn;

               // Highlight button
               document
                  .querySelectorAll('.table-btn')
                  .forEach((b) => b.classList.remove('active'));
               btn.classList.add('active');

               if (
                  window.AppState.currentTab === 'erd-btn' ||
                  window.AppState.currentTab === 'sql-btn' ||
                  window.AppState.currentTab === 'status-btn'
               ) {
                  window.handleSwitchTab('data-btn');
               } else {
                  window.renderCurrentView();
               }
            };

            // Bind Context Menu for Table Actions
            btn.oncontextmenu = (e) => {
               showContextMenu(e, [
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
                           window.showToast(`Copied "${tableName}"`, 'success');
                        }
                     },
                  },
                  {
                     icon: 'auto_fix_high',
                     label: 'Generate Mock Data...',
                     action: async () => {
                        const schemaRes = await fetchTableSchema(tableName);
                        const schema = schemaRes.success ? schemaRes.data : [];
                        openMockDataModal(tableName, schema, () => {
                           if (window.AppState.currentTable === tableName) {
                              window.renderCurrentView();
                           }
                        });
                     },
                  },
                  {
                     icon: 'table_chart',
                     label: 'View Data',
                     action: () => {
                        btn.click();
                        window.handleSwitchTab('data-btn');
                     },
                  },
                  {
                     icon: 'schema',
                     label: 'View Schema',
                     action: () => {
                        btn.click();
                        window.handleSwitchTab('schema-btn');
                     },
                  },
                  { type: 'divider' },
                  {
                     icon: 'download',
                     label: 'Export as CSV',
                     action: () => {
                        window.open(
                           `/api/tables/${tableName}/export?format=csv`,
                           '_blank',
                        );
                     },
                  },
                  {
                     icon: 'download',
                     label: 'Export as JSON',
                     action: () => {
                        window.open(
                           `/api/tables/${tableName}/export?format=json`,
                           '_blank',
                        );
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
                              `Are you sure you want to delete ALL data from table "${tableName}"? This cannot be undone!`,
                           )
                        ) {
                           const res = await truncateTableApi(tableName);
                           if (res.success) {
                              if (window.showToast)
                                 window.showToast(
                                    `Cleared all rows from "${tableName}"`,
                                    'info',
                                 );
                              if (window.AppState.currentTable === tableName) {
                                 window.renderCurrentView();
                              }
                              loadTableStats();
                           } else {
                              alert(`Failed to clear table: ${res.error}`);
                           }
                        }
                     },
                  },
               ]);
            };

            tableNav.appendChild(btn);
         });

         // Preserve active state or select first table
         if (window.AppState.currentTable) {
            const activeBtn = document.querySelector(
               `.table-btn[data-table="${window.AppState.currentTable}"]`,
            );
            if (activeBtn) {
               activeBtn.classList.add('active');
               window.AppState.currentTableBtnElement = activeBtn;
            }
         } else if (!isRefresh) {
            window.handleSwitchTab('data-btn');
         }

         // Fetch row count stats asynchronously
         loadTableStats();

         // Trigger search filter in case there's an existing query
         const searchInput = document.getElementById('search-input');
         if (searchInput && searchInput.value.trim()) {
            filterTableList(searchInput.value.trim());
         }
      } else {
         const countBadge = document.getElementById('table-count-badge');
         if (countBadge) countBadge.textContent = '0';
         tableNav.innerHTML = /* html */ `
        <div id="not-found-msg">
          <span class="material-symbols-outlined icon-20 text-soft">inventory_2</span>
          <span>No Tables Found</span>
        </div>
      `;
         if (!isRefresh) {
            if (window.AppState.dbType === 'none') {
               window.handleSwitchTab('connect-btn');
            } else {
               window.handleSwitchTab('sql-btn');
            }
         }
      }

      if (!isEventsBound) {
         bindSidebarEvents();
         isEventsBound = true;
      }
   } catch (err) {
      console.error('Failed to fetch tables:', err);
      const tableNav = document.getElementById('table-nav');
      if (tableNav) {
         tableNav.innerHTML = /* html */ `
        <div id="not-found-msg" class="text-error">
          <span class="material-symbols-outlined icon-20">warning</span>
          <span>Failed to load tables</span>
        </div>
      `;
      }
      // Mark status as error
      const dot = document.getElementById('sidebar-db-status-dot');
      const dbTypeEl = document.getElementById('brand-db-type');
      if (dot) {
         dot.classList.remove('status-connected');
         dot.classList.add('status-error');
      }
      if (dbTypeEl) dbTypeEl.textContent = 'ERROR';
   }
}

export async function loadTableStats() {
   try {
      const statsRes = await fetchTableStats();
      if (statsRes.success && statsRes.data) {
         Object.entries(statsRes.data).forEach(([tName, count]) => {
            const badge = document.getElementById(`badge-${tName}`);
            if (badge) {
               badge.textContent = Number(count).toLocaleString();
               badge.classList.remove('hidden');
               badge.style.display = 'inline-flex';
            }
         });
      }
   } catch (e) {
      console.error('Failed to load table stats:', e);
   }
}
window.loadTableStats = loadTableStats;

export function updateSidebarActiveTable(tableName) {
   const targetName = tableName || window.AppState?.currentTable;
   if (!targetName) return;
   const allBtns = document.querySelectorAll('.table-btn');
   allBtns.forEach((b) => b.classList.remove('active'));
   const activeBtn = document.querySelector(
      `.table-btn[data-table="${targetName}"]`,
   );
   if (activeBtn) {
      activeBtn.classList.add('active');
      if (window.AppState) window.AppState.currentTableBtnElement = activeBtn;
   }
}
window.updateSidebarActiveTable = updateSidebarActiveTable;
window.initSidebar = initSidebar;

async function updateDatabaseStatus() {
   const dot = document.getElementById('sidebar-db-status-dot');
   const dbTypeEl = document.getElementById('brand-db-type');
   try {
      if (!dbTypeEl) return;

      const cfg = await fetchConfig();
      if (
         cfg?.success &&
         cfg.data?.connected &&
         cfg.data?.dbType &&
         cfg.data.dbType !== 'none'
      ) {
         window.AppState.dbType = cfg.data.dbType;
         dbTypeEl.textContent = cfg.data.dbType.toUpperCase();
         if (dot) {
            dot.classList.remove('status-error', 'status-warning');
            dot.classList.add('status-connected');
         }
         window.setStudioConnectionMode?.(true);
      } else {
         window.AppState.dbType = 'none';
         dbTypeEl.textContent = 'NO DATABASE';
         if (dot) {
            dot.classList.remove('status-connected', 'status-error');
            dot.classList.add('status-warning');
         }
         window.setStudioConnectionMode?.(false);
      }
   } catch {
      if (dot) {
         dot.classList.remove('status-connected', 'status-warning');
         dot.classList.add('status-error');
      }
      if (dbTypeEl) dbTypeEl.textContent = 'DISCONNECTED';
      window.setStudioConnectionMode?.(false);
   }
}

let schemaSelectorBound = false;

async function updateSchemaSelector() {
   const wrap = document.getElementById('schema-selector-wrap');
   const select = document.getElementById('schema-select');
   if (!wrap || !select) return;

   try {
      const res = await fetchSchemas();
      if (!res?.success || !res.data?.supported) {
         wrap.classList.add('hidden');
         return;
      }

      const { schemas, currentSchema } = res.data;
      const display = document.getElementById('schema-current-display');
      if (display) {
         display.textContent = currentSchema || 'public';
      }

      // Populate options
      select.innerHTML = '';
      for (const s of schemas) {
         const opt = document.createElement('option');
         opt.value = s;
         opt.textContent = s;
         if (s === currentSchema) opt.selected = true;
         select.appendChild(opt);
      }

      wrap.classList.remove('hidden');

      // Bind change event once
      if (!schemaSelectorBound) {
         schemaSelectorBound = true;
         select.addEventListener('change', async () => {
            const chosen = select.value;
            if (display) display.textContent = chosen;
            select.disabled = true;

            try {
               const switchRes = await switchSchemaApi(chosen);
               if (switchRes.success) {
                  // Reset current table selection
                  window.AppState.currentTable = null;
                  window.AppState.currentTableBtnElement = null;

                  // Refresh sidebar tables
                  await initSidebar(true);

                  if (window.showToast) {
                     window.showToast(
                        `Switched to schema "${chosen}" (${switchRes.data?.tableCount ?? 0} tables)`,
                        'success',
                     );
                  }
               } else {
                  if (window.showToast) {
                     window.showToast(
                        `Failed to switch schema: ${switchRes.error}`,
                        'error',
                     );
                  }
                  // Revert dropdown
                  await updateSchemaSelector();
               }
            } catch (err) {
               if (window.showToast) {
                  window.showToast(
                     `Schema switch error: ${err.message}`,
                     'error',
                  );
               }
               await updateSchemaSelector();
            } finally {
               select.disabled = false;
            }
         });
      }
   } catch {
      wrap.classList.add('hidden');
   }
}

function filterTableList(query) {
   const aside = document.getElementById('sidebar-panel');
   // If sidebar is collapsed, ensure all tables remain visible and clear empty state
   if (aside?.classList.contains('collapsed')) {
      const btns = document.querySelectorAll('.table-btn');
      btns.forEach((btn) => (btn.style.display = 'flex'));
      document.getElementById('sidebar-no-match')?.remove();
      return;
   }

   const q = query.toLowerCase().trim();
   const btns = document.querySelectorAll('.table-btn');
   let visibleCount = 0;

   btns.forEach((btn) => {
      const tableName = (btn.dataset.table || '').toLowerCase();
      if (!q || tableName.includes(q)) {
         btn.style.display = 'flex';
         visibleCount++;
      } else {
         btn.style.display = 'none';
      }
   });

   const tableNav = document.getElementById('table-nav');
   let noMatchEl = document.getElementById('sidebar-no-match');

   if (visibleCount === 0 && btns.length > 0) {
      if (!noMatchEl) {
         noMatchEl = document.createElement('div');
         noMatchEl.id = 'sidebar-no-match';
         noMatchEl.className = 'sidebar-empty-state';
         noMatchEl.innerHTML = /* html */ `
        <span class="material-symbols-outlined icon-20 text-soft">search_off</span>
        <span>No matching tables</span>
      `;
         tableNav?.appendChild(noMatchEl);
      }
   } else if (noMatchEl) {
      noMatchEl.remove();
   }

   // Update section count badge if present
   const countBadge = document.getElementById('table-count-badge');
   if (countBadge) {
      countBadge.textContent = visibleCount.toString();
   }
}

function bindSidebarEvents() {
   const searchInput = document.getElementById('search-input');
   const clearBtn = document.getElementById('search-clear-btn');
   const refreshBtn = document.getElementById('refresh-tables-btn');
   const collapseBtn = document.getElementById('sidebar-collapse-btn');
   const aside = document.getElementById('sidebar-panel');

   // Search input live filtering
   if (searchInput) {
      searchInput.addEventListener('input', (e) => {
         const val = e.target.value;
         if (clearBtn) {
            if (val) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
         }
         filterTableList(val);
      });

      // Enter key to quickly open first matched table
      searchInput.addEventListener('keydown', (e) => {
         if (e.key === 'Enter') {
            e.preventDefault();
            const firstVisibleBtn = document.querySelector(
               '.table-btn:not([style*="display: none"])',
            );
            if (firstVisibleBtn) {
               firstVisibleBtn.click();
               searchInput.blur();
            }
         }
      });

      // Clear search button
      if (clearBtn) {
         clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.classList.add('hidden');
            filterTableList('');
            searchInput.focus();
         });
      }
   }

   // Add table button
   const addTableBtn = document.getElementById('add-table-btn');
   if (addTableBtn) {
      addTableBtn.addEventListener('click', () => {
         openCreateTableModal();
      });
   }

   // Refresh tables button
   if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
         refreshBtn.classList.add('animate-spin');
         await initSidebar(true);
         setTimeout(() => {
            refreshBtn.classList.remove('animate-spin');
            if (window.showToast)
               window.showToast('Tables refreshed', 'success');
         }, 300);
      });
   }

   // Collapsible sidebar support
   if (aside) {
      // Restore collapsed state
      const isCollapsed =
         localStorage.getItem('drixio_sidebar_collapsed') === 'true';
      if (isCollapsed) {
         aside.classList.add('collapsed');
         updateCollapseIcon(true);
      }

      if (collapseBtn) {
         collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            aside.classList.toggle('collapsed');
            const collapsed = aside.classList.contains('collapsed');
            localStorage.setItem(
               'drixio_sidebar_collapsed',
               collapsed.toString(),
            );
            updateCollapseIcon(collapsed);

            if (collapsed && searchInput) {
               searchInput.value = '';
               clearBtn?.classList.add('hidden');
               filterTableList('');
            }
         });
      }

      // Allow clicking the collapsed header to quickly expand
      const header = document.getElementById('sidebar-header');
      if (header) {
         header.addEventListener('click', () => {
            if (aside.classList.contains('collapsed')) {
               aside.classList.remove('collapsed');
               localStorage.setItem('drixio_sidebar_collapsed', 'false');
               updateCollapseIcon(false);
            }
         });
      }
   }

   // Keyboard shortcut: '/' to focus search, 'Escape' to clear and blur
   document.addEventListener('keydown', (e) => {
      if (
         e.key === '/' &&
         document.activeElement?.tagName !== 'INPUT' &&
         document.activeElement?.tagName !== 'TEXTAREA'
      ) {
         e.preventDefault();
         if (window.AppState?.currentTab === 'erd-btn') {
            const erdSearch = document.getElementById('erd-search-input');
            if (erdSearch) {
               erdSearch.focus();
               erdSearch.select();
               return;
            }
         }
         searchInput?.focus();
         searchInput?.select();
      } else if (e.key === 'Escape' && document.activeElement === searchInput) {
         if (searchInput.value) {
            searchInput.value = '';
            clearBtn?.classList.add('hidden');
            filterTableList('');
         }
         searchInput.blur();
      }
   });
}

function updateCollapseIcon(isCollapsed) {
   const icon = document.getElementById('sidebar-collapse-icon');
   const btn = document.getElementById('sidebar-collapse-btn');
   const header = document.getElementById('sidebar-header');
   if (icon) {
      icon.textContent = isCollapsed ? 'menu' : 'menu_open';
   }
   if (btn) {
      btn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
   }
   if (header) {
      header.title = isCollapsed ? 'Click to expand sidebar' : '';
   }
}
