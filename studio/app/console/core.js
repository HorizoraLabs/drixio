import { executeRawQuery, exportQueryResultApi } from '../../lib/api.js';
import {
   isSafeModeEnabled,
   analyzeDangerousQuery,
   showSafeQueryModal,
} from './safeModal.js';
import { openSaveSnippetModal } from './snippetsModal.js';

let queryCounter = 0;

export const runConsoleQuery = async (
   queryToRun,
   editor,
   historyPane,
   bypassSafeCheck = false,
) => {
   let sql =
      queryToRun ||
      editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();
   if (!sql) sql = editor.value.trim();
   if (!sql) return;

   if (sql.toLowerCase() === 'clear' || sql.toLowerCase() === 'clear;') {
      historyPane.innerHTML = '';
      if (!queryToRun) {
         editor.selectionStart = editor.selectionEnd;
         editor.value = '';
      }
      return;
   }

   // Safe Mode Guard: Check destructive queries (DELETE/UPDATE without WHERE, DROP, TRUNCATE)
   if (!bypassSafeCheck && isSafeModeEnabled()) {
      const danger = analyzeDangerousQuery(sql);
      if (danger.isDangerous) {
         const isDirectEditor = !queryToRun;
         showSafeQueryModal({
            dangerInfo: danger,
            fullSql: sql,
            onConfirm: () => {
               if (isDirectEditor) {
                  editor.selectionStart = editor.selectionEnd;
                  editor.value = '';
                  editor.dispatchEvent(new Event('input'));
               }
               runConsoleQuery(sql, editor, historyPane, true);
            },
         });
         return;
      }
   }

   window.AppState.lastQuery = sql;

   if (!window.AppState.queryHistory) window.AppState.queryHistory = [];
   const history = window.AppState.queryHistory;
   if (!history.includes(sql)) {
      history.unshift(sql);
      if (history.length > 10) history.pop();
      window.dispatchEvent(new Event('query-history-updated'));
   }

   queryCounter++;

   const blockId = `history-block-${queryCounter}`;

   const welcomeMsg = document.getElementById('console-welcome-msg');
   if (welcomeMsg) {
      welcomeMsg.style.display = 'none';
   }

   const block = document.createElement('div');
   block.className = 'console-history-block';

   block.innerHTML = /* html */ `
    <div class="console-history-header">
      <div class="console-history-sql">${sql.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <div class="console-history-actions">
        <button class="icon-btn save-snippet-btn" title="Save as Snippet"><span class="material-symbols-outlined" class="icon-16">bookmark_add</span></button>
        <button class="icon-btn copy-btn" title="Copy SQL"><span class="material-symbols-outlined" class="icon-16">content_copy</span></button>
        <button class="icon-btn rerun-btn" title="Re-run"><span class="material-symbols-outlined" class="icon-16">refresh</span></button>
      </div>
    </div>
    <div id="${blockId}-results" class="console-history-results">
      <div class="console-msg-executing">
        <span class="material-symbols-outlined" class="animate-spin">sync</span> Executing...
      </div>
    </div>
  `;

   historyPane.appendChild(block);

   const saveBtn = block.querySelector('.save-snippet-btn');
   if (saveBtn) {
      saveBtn.onclick = () => {
         openSaveSnippetModal({
            defaultSql: sql,
            onSaved: () => {
               window.dispatchEvent(new CustomEvent('drixio-snippets-updated'));
            },
         });
      };
   }

   block.querySelector('.copy-btn').onclick = () => {
      navigator.clipboard.writeText(sql);
      window.showToast
         ? window.showToast('SQL copied to clipboard')
         : alert('Copied');
   };
   block.querySelector('.rerun-btn').onclick = () =>
      runConsoleQuery(sql, editor, historyPane);

   historyPane.scrollTop = historyPane.scrollHeight;

   if (!queryToRun) {
      editor.selectionStart = editor.selectionEnd;
      editor.value = '';
   }

   try {
      const startTime = performance.now();
      const res = await executeRawQuery(sql);
      const ms = (performance.now() - startTime).toFixed(1);

      const resContainer = document.getElementById(`${blockId}-results`);

      if (!res.success) {
         resContainer.innerHTML = /* html */ `<div class="console-msg-error"><span class="material-symbols-outlined" class="icon-16 mt-2px">error</span><span>Error: ${res.error}</span></div>`;
         historyPane.scrollTop = historyPane.scrollHeight;
         return;
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
         resContainer.innerHTML = /* html */ `
        <div class="console-mutation-banner" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.25);">
          <div class="console-mutation-info" style="color: #10b981;">
            <span class="material-symbols-outlined icon">check_circle</span>
            <span><b>${title}:</b> ${detail}</span>
            <span class="text-soft">&middot;</span>
            <span class="text-soft">${ms}ms</span>
          </div>
        </div>
      `;
         historyPane.scrollTop = historyPane.scrollHeight;
         return;
      }

      if (/^\s*(CREATE|DROP|ALTER)\s+(TABLE|VIEW)/i.test(sql)) {
         window.initSidebar?.(true);
      }

      if (isMutationResult) {
         const affected = res.data.affectedRows ?? rows[0]?.AffectedRows ?? 0;
         resContainer.innerHTML = /* html */ `
        <div class="console-mutation-banner">
          <div class="console-mutation-info">
            <span class="material-symbols-outlined icon">task_alt</span>
            <span>Query OK, <b>${affected}</b> row${affected === 1 ? '' : 's'} affected</span>
            <span class="text-soft">&middot;</span>
            <span class="text-soft">${ms}ms</span>
          </div>
        </div>
      `;
         historyPane.scrollTop = historyPane.scrollHeight;
         return;
      }

      if (rowCount === 0) {
         resContainer.innerHTML = /* html */ `
        <div class="console-mutation-banner">
          <div class="console-mutation-info">
            <span class="material-symbols-outlined icon">task_alt</span>
            <span>Query OK, 0 rows returned</span>
            <span class="text-soft">&middot;</span>
            <span class="text-soft">${ms}ms</span>
          </div>
        </div>
      `;
         historyPane.scrollTop = historyPane.scrollHeight;
         return;
      }

      const cols = Object.keys(rows[0]);

      const statsHeader = document.createElement('div');
      statsHeader.className = 'console-stats-header console-stats-divider';

      const limitedRows = rows.slice(0, 1000);
      const limitNotice = rowCount > 1000 ? ` (Showing first 1000)` : '';
      const affectedNotice =
         res.data.affectedRows !== undefined && res.data.affectedRows > 0
            ? ` &middot; ${res.data.affectedRows} affected`
            : '';

      statsHeader.innerHTML = /* html */ `
      <div class="console-stats-info">
        <span class="material-symbols-outlined icon">check_circle</span> 
        <span>Query OK, <b>${rowCount}</b> row${rowCount === 1 ? '' : 's'}${limitNotice}${affectedNotice} &middot; ${ms}ms</span>
      </div>
      <button class="console-export-btn export-btn" title="Export current results as CSV">
        <span class="material-symbols-outlined" style="font-size: 15px;">download</span> CSV
      </button>
    `;

      resContainer.innerHTML = '';
      resContainer.appendChild(statsHeader);

      statsHeader.querySelector('.export-btn').onclick = () => {
         exportQueryResultApi({ rows }, 'csv');
      };

      const tableContainer = document.createElement('div');
      tableContainer.className = 'table-container';
      tableContainer.style.border = '1px solid var(--color-border)';
      tableContainer.style.borderRadius = '6px';
      tableContainer.style.overflow = 'auto';
      tableContainer.style.maxHeight = '320px';

      const table = document.createElement('table');
      table.className = 'data-table';

      const thead = document.createElement('thead');
      thead.style.position = 'sticky';
      thead.style.top = '0';
      thead.style.zIndex = '10';

      const trHead = document.createElement('tr');
      const thNum = document.createElement('th');
      thNum.className = 'row-header';
      thNum.textContent = '#';
      trHead.appendChild(thNum);

      cols.forEach((c) => {
         const th = document.createElement('th');
         th.textContent = c;
         trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      limitedRows.forEach((row, i) => {
         const tr = document.createElement('tr');
         const tdNum = document.createElement('td');
         tdNum.className = 'row-header';
         tdNum.textContent = i + 1;
         tr.appendChild(tdNum);

         cols.forEach((c) => {
            const td = document.createElement('td');
            td.className = 'data-cell data-cell-truncate';

            let val = row[c];
            if (val === null) {
               const nullSpan = document.createElement('span');
               nullSpan.textContent = 'NULL';
               nullSpan.classList.add('text-soft', 'italic');
               td.appendChild(nullSpan);
            } else {
               const strVal = String(val);
               td.textContent = strVal;
               if (strVal.length > 40) {
                  td.title = strVal;
               }
            }
            tr.appendChild(td);
         });
         tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableContainer.appendChild(table);
      resContainer.appendChild(tableContainer);

      setTimeout(() => (historyPane.scrollTop = historyPane.scrollHeight), 10);
   } catch (e) {
      const resContainer = document.getElementById(`${blockId}-results`);
      if (resContainer) {
         resContainer.innerHTML = /* html */ `<div class="console-msg-error"><span class="material-symbols-outlined" class="icon-16 mt-2px">error</span><span>Error: ${e.message}</span></div>`;
         historyPane.scrollTop = historyPane.scrollHeight;
      }
   }
};
