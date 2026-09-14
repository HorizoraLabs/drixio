/**
 * SQL Console Query History Module
 * Handles local persistence, safely bounded storage, and history rendering.
 */
import { escapeHtml, truncateText } from '../../lib/utils.js';

const STORAGE_KEY = 'drixio_query_history';
const MAX_HISTORY_ITEMS = 50;
const MAX_SQL_LENGTH = 5000;

export function getStoredHistory() {
   try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
         const parsed = JSON.parse(stored);
         if (Array.isArray(parsed)) return parsed;
      }
   } catch {
      // ignore
   }
   return [];
}

export function saveHistory(historyList) {
   try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(historyList || []));
   } catch (err) {
      console.warn('Failed to save query history to localStorage:', err);
   }
}

export function recordQueryHistory(rawSql) {
   if (!rawSql || !rawSql.trim()) return;
   const trimmed = rawSql.trim();
   const safeSql = truncateText(trimmed, MAX_SQL_LENGTH);

   if (!window.AppState.queryHistory) {
      window.AppState.queryHistory = getStoredHistory();
   }

   // Remove duplicate of same query if already exists at head
   const list = window.AppState.queryHistory.filter((item) => item !== safeSql);
   list.unshift(safeSql);

   if (list.length > MAX_HISTORY_ITEMS) {
      list.length = MAX_HISTORY_ITEMS;
   }

   window.AppState.queryHistory = list;
   saveHistory(list);
   renderQueryHistory();
}

let onSelectQueryCallback = null;

export function initQueryHistory(onSelectQuery) {
   onSelectQueryCallback = onSelectQuery;
   window.AppState.queryHistory = getStoredHistory();

   const clearBtn = document.getElementById('console-clear-history-btn');
   if (clearBtn) {
      clearBtn.onclick = () => {
         if (confirm('Clear all recent query history?')) {
            window.AppState.queryHistory = [];
            saveHistory([]);
            renderQueryHistory();
         }
      };
   }

   // Automatically persist and re-render when a query finishes execution
   window.removeEventListener('query-history-updated', onHistoryUpdated);
   window.addEventListener('query-history-updated', onHistoryUpdated);

   renderQueryHistory();
}

function onHistoryUpdated() {
   saveHistory(window.AppState.queryHistory);
   renderQueryHistory();
}

export function renderQueryHistory() {
   const historyListEl = document.getElementById('console-recent-history-list');
   const clearBtn = document.getElementById('console-clear-history-btn');
   if (!historyListEl) return;

   const history = window.AppState.queryHistory || [];

   if (clearBtn) {
      if (history.length > 0) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
   }

   if (history.length === 0) {
      historyListEl.innerHTML = `<div class="sidebar-tree-empty">No recent queries</div>`;
      return;
   }

   historyListEl.innerHTML = history
      .slice(0, 20)
      .map(
         (sql, idx) => `
         <button type="button" class="table-btn query-item-btn history-item" data-idx="${idx}" title="${escapeHtml(sql)}">
           <div class="table-btn-label">
             <i class="material-symbols-outlined table-item-icon">history</i>
             <span class="table-name-text">${escapeHtml(sql.replace(/\s+/g, ' '))}</span>
           </div>
           <span class="query-item-delete-btn" title="Remove from history">
             <span class="material-symbols-outlined">close</span>
           </span>
         </button>
       `,
      )
      .join('');

   historyListEl.querySelectorAll('.history-item').forEach((el) => {
      const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
      const sql = history[idx];
      if (!sql) return;

      el.onclick = (e) => {
         if (e.target.closest('.query-item-delete-btn')) return;
         if (onSelectQueryCallback) {
            onSelectQueryCallback(sql);
         }
      };

      const delBtn = el.querySelector('.query-item-delete-btn');
      if (delBtn) {
         delBtn.onclick = (e) => {
            e.stopPropagation();
            window.AppState.queryHistory.splice(idx, 1);
            saveHistory(window.AppState.queryHistory);
            renderQueryHistory();
         };
      }
   });
}
