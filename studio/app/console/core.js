import {
   executeRawQuery,
   exportQueryResultApi,
   explainQueryApi,
} from '../../lib/api.js';
import {
   isSafeModeEnabled,
   analyzeDangerousQuery,
   showSafeQueryModal,
} from './safeModal.js';
import { showContextMenu } from '../../components/contextMenu.js';

let queryCounter = 0;

export function clearConsoleMessages() {
   window.AppState.consoleMessages = [];
   renderConsoleMessages();
}

export function appendConsoleMessage(entry) {
   if (!window.AppState.consoleMessages) {
      window.AppState.consoleMessages = [];
   }
   const now = new Date();
   const timeStr =
      now.toTimeString().split(' ')[0] +
      '.' +
      String(now.getMilliseconds()).padStart(3, '0');
   const logItem = {
      id:
         'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      time: timeStr,
      ...entry,
   };
   window.AppState.consoleMessages.push(logItem);
   if (window.AppState.consoleMessages.length > 200) {
      window.AppState.consoleMessages.shift();
   }
   renderConsoleMessages();
}

export function renderConsoleMessages() {
   const container = document.getElementById('console-messages-content');
   if (!container) return;

   const messages = window.AppState.consoleMessages || [];
   if (messages.length === 0) {
      container.innerHTML = `
         <div class="messages-empty-state">
            <span class="material-symbols-outlined messages-empty-icon">info</span>
            <p class="messages-empty-text">No messages yet. Query execution logs, rows affected, and error details will appear here.</p>
         </div>
      `;
      return;
   }

   container.innerHTML = messages
      .map((msg) => {
         const typeClass = msg.type || 'info';
         const badgeText = (msg.type || 'INFO').toUpperCase();

         return `
            <div class="messages-log-entry ${typeClass}">
               <div class="messages-log-header">
                  <span class="messages-badge badge-${typeClass}">${badgeText}</span>
                  <span class="messages-time">${msg.time}</span>
                  <span class="messages-title">${msg.title || ''}</span>
                  ${msg.ms ? `<span class="messages-duration">${msg.ms}ms</span>` : ''}
               </div>
               ${msg.sql ? `<pre class="messages-sql">${msg.sql.trim()}</pre>` : ''}
               ${msg.details ? `<div class="messages-detail">${msg.details}</div>` : ''}
            </div>
         `;
      })
      .join('');

   const parent = document.getElementById('console-messages-body');
   if (parent) {
      parent.scrollTop = parent.scrollHeight;
   }
}

/**
 * Render a query result or execution state into the console results pane.
 * Supports: Tabular data table, Mutation status banner, Error banner, and EXPLAIN query plan.
 */
export function renderQueryResultToBody(result, resultsBody) {
   if (!resultsBody) return;

   const metaCount = document.getElementById('results-meta-count');
   const exportWrapper = document.getElementById('results-export-wrapper');

   if (!result) {
      if (metaCount) metaCount.textContent = 'Ready to run query';
      if (exportWrapper) exportWrapper.style.display = 'none';
      resultsBody.innerHTML = /* html */ `
         <div class="console-welcome-msg" id="console-welcome-msg">
            <div class="console-welcome-icon-box">
               <span class="material-symbols-outlined">terminal</span>
            </div>
            <h2 class="console-welcome-heading">Drixio SQL Workstation</h2>
            <p class="console-welcome-sub">Write and execute queries with multi-tab support, syntax highlighting, and instant tabular results.</p>
            
            <div class="console-shortcuts-hint">
               <span class="shortcut-pill"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> Run</span>
               <span class="shortcut-pill"><kbd>Ctrl</kbd> + <kbd>S</kbd> Save</span>
               <span class="shortcut-pill"><kbd>Tab</kbd> Indent</span>
            </div>
         </div>
      `;
      return;
   }

   if (result.type === 'executing') {
      if (metaCount) {
         metaCount.innerHTML = `<span class="material-symbols-outlined animate-spin icon-12">sync</span> Executing query...`;
      }
      if (exportWrapper) exportWrapper.style.display = 'none';
      resultsBody.innerHTML = /* html */ `
         <div class="console-msg-executing">
            <span class="material-symbols-outlined animate-spin icon-20">sync</span>
            <span>Executing query...</span>
         </div>
      `;
      return;
   }

   if (result.type === 'error') {
      if (metaCount) {
         metaCount.innerHTML = `<span style="color: var(--color-error);">Error &middot; ${result.ms || 0}ms</span>`;
      }
      if (exportWrapper) exportWrapper.style.display = 'none';

      const isConnError = /database.*not found|no database connected|failed to find.*database|connection lost|connect.*failed|sqlite_error.*no such file/i.test(result.error || '');

      let actionsHtml = '';
      if (isConnError) {
         actionsHtml = /* html */ `
            <div style="display: flex; align-items: center; gap: 8px;">
               <button type="button" class="btn-ai-fix-error" id="btn-console-switch-db" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);" title="Open Connection Switcher">
                  <span class="material-symbols-outlined" style="font-size: 14px;">dns</span>
                  <span>Connect / Switch DB</span>
               </button>
               <button type="button" class="btn-ai-fix-error" id="btn-console-retry-query" style="background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); color: var(--color-text);" title="Retry executing current query">
                  <span class="material-symbols-outlined" style="font-size: 14px;">refresh</span>
                  <span>Retry</span>
               </button>
            </div>
         `;
      } else {
         actionsHtml = /* html */ `
            <button type="button" class="btn-ai-fix-error" id="btn-fix-with-ai" title="Diagnose error & generate fix with AI">
               <span class="material-symbols-outlined" style="font-size: 14px;">auto_fix_high</span>
               <span>Fix with AI</span>
            </button>
         `;
      }

      resultsBody.innerHTML = /* html */ `
         <div class="console-result-error">
            <div class="console-result-error-header">
               <div class="console-result-error-title">
                  <span class="material-symbols-outlined">${isConnError ? 'database_off' : 'error'}</span>
                  <span>${isConnError ? 'Database Connection Error' : 'Query Execution Failed'}</span>
               </div>
               ${actionsHtml}
            </div>
            <pre class="console-result-error-msg">${result.error}</pre>
            ${isConnError ? `
               <div class="console-result-error-hint" style="margin-top: 10px; font-size: 12px; color: var(--color-text-soft); display: flex; align-items: center; gap: 6px;">
                  <span class="material-symbols-outlined" style="font-size: 15px; color: #f59e0b;">info</span>
                  <span>The query syntax is valid, but the database file or server was unreachable. Please verify connection credentials or file path.</span>
               </div>
            ` : ''}
         </div>
      `;

      const fixBtn = resultsBody.querySelector('#btn-fix-with-ai');
      if (fixBtn) {
         fixBtn.dataset.sql = result.sql || window.AppState?.lastQuery || '';
         fixBtn.dataset.error = result.error || '';
      }

      const switchDbBtn = resultsBody.querySelector('#btn-console-switch-db');
      if (switchDbBtn) {
         switchDbBtn.onclick = () => {
            if (window.handleSwitchTab) {
               window.handleSwitchTab('connect-btn');
            } else {
               const cBtn = document.getElementById('connect-btn') || document.getElementById('header-connect-btn');
               if (cBtn) cBtn.click();
            }
         };
      }

      const retryBtn = resultsBody.querySelector('#btn-console-retry-query');
      if (retryBtn) {
         retryBtn.onclick = () => {
            const runBtn = document.getElementById('run-sql-btn');
            if (runBtn) runBtn.click();
         };
      }

      return;
   }

   if (result.type === 'connection') {
      if (metaCount) {
         metaCount.innerHTML = `<span style="color: #10b981;">Connected &middot; ${result.ms}ms</span>`;
      }
      if (exportWrapper) exportWrapper.style.display = 'none';
      resultsBody.innerHTML = /* html */ `
         <div class="console-mutation-banner" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.25);">
            <div class="console-mutation-info" style="color: #10b981;">
               <span class="material-symbols-outlined icon">check_circle</span>
               <span><b>${result.title}:</b> ${result.detail}</span>
               <span class="text-soft">&middot;</span>
               <span class="text-soft">${result.ms}ms</span>
            </div>
         </div>
      `;
      return;
   }

   if (result.type === 'mutation') {
      const affected = result.affectedRows ?? 0;
      if (metaCount) {
         metaCount.innerHTML = `Query OK, <b>${affected}</b> row${affected === 1 ? '' : 's'} affected &middot; ${result.ms}ms`;
      }
      if (exportWrapper) exportWrapper.style.display = 'none';
      resultsBody.innerHTML = /* html */ `
         <div class="console-mutation-banner">
            <div class="console-mutation-info">
               <span class="material-symbols-outlined icon">task_alt</span>
               <span>Query OK, <b>${affected}</b> row${affected === 1 ? '' : 's'} affected</span>
               <span class="text-soft">&middot;</span>
               <span class="text-soft">${result.ms}ms</span>
            </div>
         </div>
      `;
      return;
   }

   if (result.type === 'table') {
      const rows = result.rows || [];
      const rowCount = result.rowCount || rows.length;
      const ms = result.ms || '0.0';
      const cols = result.cols || (rows.length > 0 ? Object.keys(rows[0]) : []);

      if (metaCount) {
         const limitNotice = rowCount > 1000 ? ` (Showing first 1000)` : '';
         metaCount.innerHTML = `<b>${rowCount}</b> row${rowCount === 1 ? '' : 's'}${limitNotice} &middot; ${ms}ms`;
      }

      if (exportWrapper) {
         exportWrapper.style.display = 'flex';
         const exportBtn = document.getElementById('console-export-btn');
         if (exportBtn) {
            exportBtn.onclick = (e) => {
               showContextMenu(e, [
                  {
                     icon: 'description',
                     label: 'Export as CSV',
                     action: () => exportQueryResultApi({ rows }, 'csv'),
                  },
                  {
                     icon: 'data_object',
                     label: 'Export as JSON',
                     action: () => exportQueryResultApi({ rows }, 'json'),
                  },
               ]);
            };
         }
      }

      if (rows.length === 0) {
         resultsBody.innerHTML = /* html */ `
            <div class="console-mutation-banner">
               <div class="console-mutation-info">
                  <span class="material-symbols-outlined icon">task_alt</span>
                  <span>Query returned 0 rows &middot; ${ms}ms</span>
               </div>
            </div>
         `;
         return;
      }

      // Render full-featured elevated Data Table
      resultsBody.innerHTML = '';
      const tableContainer = document.createElement('div');
      tableContainer.className =
         'table-container console-results-table-container';

      const table = document.createElement('table');
      table.className = 'data-table';

      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');
      const thNum = document.createElement('th');
      thNum.className = 'row-header';
      thNum.textContent = '#';
      trHead.appendChild(thNum);

      cols.forEach((col) => {
         const th = document.createElement('th');
         th.innerHTML = `
            <div class="th-content-wrapper">
               <span class="th-col-name">${col}</span>
            </div>
         `;
         trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const displayRows = rows.slice(0, 1000);
      displayRows.forEach((row, idx) => {
         const tr = document.createElement('tr');
         const tdNum = document.createElement('td');
         tdNum.className = 'row-header';
         tdNum.textContent = String(idx + 1);
         tr.appendChild(tdNum);

         cols.forEach((col) => {
            const td = document.createElement('td');
            td.className = 'data-cell data-cell-truncate';
            const val = row[col];

            if (val === null || val === undefined) {
               td.innerHTML = `<em>NULL</em>`;
            } else if (typeof val === 'boolean') {
               td.innerHTML = `<span class="badge-bool ${val ? 'bool-true' : 'bool-false'}">${val ? 'true' : 'false'}</span>`;
            } else {
               const strVal = String(val);
               td.textContent = strVal;
               if (strVal.length > 50) {
                  td.title = strVal;
               }
            }

            td.ondblclick = async (e) => {
               e.stopPropagation();
               const copyVal =
                  val === null || val === undefined ? 'NULL' : String(val);
               try {
                  await navigator.clipboard.writeText(copyVal);
                  if (window.showToast)
                     window.showToast('Copied cell value', 'info');
               } catch {
                  // ignore
               }
            };

            td.oncontextmenu = (e) => {
               e.preventDefault();
               e.stopPropagation();
               const copyVal =
                  val === null || val === undefined ? 'NULL' : String(val);
               showContextMenu(e, [
                  {
                     icon: 'content_copy',
                     label: 'Copy Cell Value',
                     action: async () => {
                        await navigator.clipboard.writeText(copyVal);
                        if (window.showToast)
                           window.showToast('Copied cell value', 'info');
                     },
                  },
                  {
                     icon: 'data_object',
                     label: 'Copy Row as JSON',
                     action: async () => {
                        await navigator.clipboard.writeText(
                           JSON.stringify(row, null, 2),
                        );
                        if (window.showToast)
                           window.showToast('Copied row as JSON', 'info');
                     },
                  },
                  'divider',
                  {
                     icon: 'download',
                     label: 'Export All as CSV',
                     action: () => exportQueryResultApi({ rows }, 'csv'),
                  },
               ]);
            };

            tr.appendChild(td);
         });
         tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableContainer.appendChild(table);
      resultsBody.appendChild(tableContainer);
      return;
   }

   if (result.type === 'explain') {
      const rows = result.rows || [];
      const cols = result.cols || [];
      const ms = result.ms || '0.0';

      if (metaCount) {
         metaCount.innerHTML = `Execution Plan &middot; <b>${rows.length}</b> line${rows.length === 1 ? '' : 's'} &middot; ${ms}ms`;
      }
      if (exportWrapper) exportWrapper.style.display = 'none';

      resultsBody.innerHTML = '';
      const container = document.createElement('div');
      container.className = 'table-container console-results-table-container';

      const table = document.createElement('table');
      table.className = 'data-table';

      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');
      const thNum = document.createElement('th');
      thNum.className = 'row-header';
      thNum.textContent = '#';
      trHead.appendChild(thNum);

      cols.forEach((col) => {
         const th = document.createElement('th');
         th.textContent = col;
         trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      rows.forEach((row, idx) => {
         const tr = document.createElement('tr');
         const tdNum = document.createElement('td');
         tdNum.className = 'row-header';
         tdNum.textContent = String(idx + 1);
         tr.appendChild(tdNum);

         cols.forEach((col) => {
            const td = document.createElement('td');
            td.className = 'data-cell font-mono text-12';
            const val = row[col];
            td.textContent =
               val !== null && val !== undefined ? String(val) : 'NULL';
            tr.appendChild(td);
         });
         tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      container.appendChild(table);
      resultsBody.appendChild(container);
   }
}

/**
 * Executes a query and returns the structured result object.
 */
export async function runConsoleQuery(
   queryToRun,
   editor,
   resultsBody,
   bypassSafeCheck = false,
   onResultCallback = null,
) {
   let sql =
      queryToRun ||
      (editor
         ? editor.value
              .substring(editor.selectionStart, editor.selectionEnd)
              .trim()
         : '');
   if (!sql && editor) sql = editor.value.trim();
   if (!sql) return null;

   if (sql.toLowerCase() === 'clear' || sql.toLowerCase() === 'clear;') {
      renderQueryResultToBody(null, resultsBody);
      return null;
   }

   // Safe Mode Guard
   if (!bypassSafeCheck && isSafeModeEnabled()) {
      const danger = analyzeDangerousQuery(sql);
      if (danger.isDangerous) {
         showSafeQueryModal({
            dangerInfo: danger,
            fullSql: sql,
            onConfirm: () => {
               runConsoleQuery(
                  sql,
                  editor,
                  resultsBody,
                  true,
                  onResultCallback,
               );
            },
         });
         return null;
      }
   }

   window.AppState.lastQuery = sql;

   if (!window.AppState.queryHistory) window.AppState.queryHistory = [];
   const history = window.AppState.queryHistory;
   if (!history.includes(sql)) {
      history.unshift(sql);
      if (history.length > 20) history.pop();
      window.dispatchEvent(new Event('query-history-updated'));
   }

   queryCounter++;

   // Render executing status
   renderQueryResultToBody({ type: 'executing' }, resultsBody);

   try {
      const startTime = performance.now();
      const res = await executeRawQuery(sql);
      const ms = (performance.now() - startTime).toFixed(1);

      if (!res.success) {
         const errResult = {
            type: 'error',
            error: res.error,
            ms,
            sql,
         };
         appendConsoleMessage({
            type: 'error',
            title: 'Query Execution Failed',
            sql,
            ms,
            details: res.error,
         });
         renderQueryResultToBody(errResult, resultsBody);
         if (onResultCallback) onResultCallback(errResult);
         return errResult;
      }

      const rows = res.data.rows || [];
      const rowCount = rows.length;
      const isMutationResult =
         (rows.length === 1 &&
            rows[0].Result === 'Success' &&
            rows[0].AffectedRows !== undefined) ||
         (rowCount === 0 && res.data.affectedRows !== undefined);

      if (res.data?.connectionChanged) {
         if (window.showToast) {
            window.showToast(
               `Database updated: ${res.data.dbConfig?.dbName || 'Connected'}`,
               'success',
            );
         }
         if (window.initSidebar) {
            window.initSidebar(true);
         }
         const isConn =
            res.data.dbConfig?.type && res.data.dbConfig.type !== 'none';
         if (window.setStudioConnectionMode) {
            window.setStudioConnectionMode(Boolean(isConn));
         }
         if (res.data.dbConfig?.type) {
            window.AppState.dbType = res.data.dbConfig.type;
            const dbTypeEl = document.getElementById('brand-db-type');
            if (dbTypeEl) {
               dbTypeEl.textContent =
                  res.data.dbConfig.type === 'none'
                     ? 'NO DATABASE'
                     : res.data.dbConfig.type.toUpperCase();
            }
            const dot = document.getElementById('sidebar-db-status-dot');
            if (dot) {
               if (res.data.dbConfig.type === 'none') {
                  dot.classList.remove('status-connected', 'status-error');
                  dot.classList.add('status-warning');
               } else {
                  dot.classList.remove('status-error', 'status-warning');
                  dot.classList.add('status-connected');
               }
            }
         }

         const title = rows[0]?.Result || 'Connected';
         const detail =
            rows[0]?.Database ||
            rows[0]?.Target ||
            rows[0]?.Path ||
            'Database ready';

         const connResult = {
            type: 'connection',
            title,
            detail,
            ms,
            sql,
         };
         appendConsoleMessage({
            type: 'info',
            title: `Database: ${title}`,
            sql,
            ms,
            details: detail,
         });
         renderQueryResultToBody(connResult, resultsBody);
         if (onResultCallback) onResultCallback(connResult);
         return connResult;
      }

      if (/^\s*(CREATE|DROP|ALTER)\s+(TABLE|VIEW)/i.test(sql)) {
         window.initSidebar?.(true);
      }

      if (isMutationResult) {
         const affected = res.data.affectedRows ?? rows[0]?.AffectedRows ?? 0;
         const mutResult = {
            type: 'mutation',
            affectedRows: affected,
            ms,
            sql,
         };
         appendConsoleMessage({
            type: 'mutation',
            title: `Query OK, ${affected} row${affected === 1 ? '' : 's'} affected`,
            sql,
            ms,
            details: `${affected} row(s) updated/deleted/inserted`,
         });
         renderQueryResultToBody(mutResult, resultsBody);
         if (onResultCallback) onResultCallback(mutResult);
         return mutResult;
      }

      const tableResult = {
         type: 'table',
         rows,
         rowCount,
         cols: rows.length > 0 ? Object.keys(rows[0]) : [],
         ms,
         sql,
      };
      appendConsoleMessage({
         type: 'success',
         title: `Query OK, returned ${rowCount} row${rowCount === 1 ? '' : 's'}`,
         sql,
         ms,
         details: `Successfully fetched ${rowCount} row(s) with ${tableResult.cols.length} column(s)`,
      });
      renderQueryResultToBody(tableResult, resultsBody);
      if (onResultCallback) onResultCallback(tableResult);
      return tableResult;
   } catch (e) {
      const exResult = {
         type: 'error',
         error: e.message,
         ms: '0.0',
         sql,
      };
      appendConsoleMessage({
         type: 'error',
         title: 'Query Exception',
         sql,
         ms: '0.0',
         details: e.message,
      });
      renderQueryResultToBody(exResult, resultsBody);
      if (onResultCallback) onResultCallback(exResult);
      return exResult;
   }
}

/**
 * Analyzes query execution plan (EXPLAIN)
 */
export async function runExplainQuery(
   queryToRun,
   editor,
   resultsBody,
   onResultCallback = null,
) {
   let sql =
      queryToRun ||
      (editor
         ? editor.value
              .substring(editor.selectionStart, editor.selectionEnd)
              .trim()
         : '');
   if (!sql && editor) sql = editor.value.trim();
   if (!sql) return null;

   renderQueryResultToBody({ type: 'executing' }, resultsBody);

   try {
      const res = await explainQueryApi(sql);
      if (!res.success) throw new Error(res.error || 'Failed to explain query');

      const explainResult = {
         type: 'explain',
         rows: res.data.rows || [],
         cols: res.data.columns || [],
         ms: res.data.durationMs,
         dialect: res.data.dialect,
         sql,
      };
      appendConsoleMessage({
         type: 'info',
         title: 'Execution Plan (EXPLAIN)',
         sql,
         ms: res.data.durationMs,
         details: `${explainResult.rows.length} plan node(s) (Dialect: ${explainResult.dialect || 'SQL'})`,
      });
      renderQueryResultToBody(explainResult, resultsBody);
      if (onResultCallback) onResultCallback(explainResult);
      return explainResult;
   } catch (e) {
      const errResult = {
         type: 'error',
         error: e.message,
         ms: '0.0',
         sql,
      };
      appendConsoleMessage({
         type: 'error',
         title: 'EXPLAIN Failed',
         sql,
         ms: '0.0',
         details: e.message,
      });
      renderQueryResultToBody(errResult, resultsBody);
      if (onResultCallback) onResultCallback(errResult);
      return errResult;
   }
}
