import { openImportModal } from './importModal.js';
import { escapeHtml } from '../lib/utils.js';
import { installDesktopApp } from '../lib/api.js';
import { openAiConfigModal } from './aiConfigModal.js';
import { isSafeModeEnabled, setSafeModeEnabled } from '../app/console/safeModal.js';

let paletteContainer = null;
let inputEl = null;
let resultsEl = null;
let isOpen = false;
let currentItems = [];
let selectedIndex = 0;

export function initCommandPalette() {
   if (document.getElementById('command-palette-overlay')) return;

   paletteContainer = document.createElement('div');
   paletteContainer.id = 'command-palette-overlay';
   paletteContainer.className = 'command-palette-overlay';
   paletteContainer.innerHTML = /* html */ `
      <div class="command-palette-modal" id="command-palette-modal">
         <div class="command-palette-header">
            <span class="material-symbols-outlined search-icon">search</span>
            <input 
               type="text" 
               class="command-palette-input" 
               id="command-palette-input" 
               placeholder="Search tables, commands, or type SQL to run directly..." 
               autocomplete="off"
               spellcheck="false"
            />
            <span class="command-palette-close-badge" id="command-palette-esc-btn">ESC</span>
         </div>
         <div class="command-palette-results" id="command-palette-results"></div>
         <div class="command-palette-footer">
            <div class="command-palette-footer-keys">
               <span class="command-palette-footer-key-item"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
               <span class="command-palette-footer-key-item"><kbd>↵</kbd> select</span>
               <span class="command-palette-footer-key-item"><kbd>esc</kbd> close</span>
            </div>
            <span class="font-mono text-soft">Drixio Command</span>
         </div>
      </div>
   `;

   document.body.appendChild(paletteContainer);

   inputEl = document.getElementById('command-palette-input');
   resultsEl = document.getElementById('command-palette-results');
   const modalEl = document.getElementById('command-palette-modal');
   const escBtn = document.getElementById('command-palette-esc-btn');

   // Close on overlay background click
   paletteContainer.addEventListener('click', (e) => {
      if (e.target === paletteContainer) {
         closeCommandPalette();
      }
   });

   escBtn?.addEventListener('click', closeCommandPalette);

   // Input filtering
   inputEl.addEventListener('input', () => {
      renderResults(inputEl.value.trim());
   });

   // Key navigation
   inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
         e.preventDefault();
         if (currentItems.length > 0) {
            selectedIndex = (selectedIndex + 1) % currentItems.length;
            updateSelection();
         }
      } else if (e.key === 'ArrowUp') {
         e.preventDefault();
         if (currentItems.length > 0) {
            selectedIndex =
               (selectedIndex - 1 + currentItems.length) % currentItems.length;
            updateSelection();
         }
      } else if (e.key === 'Enter') {
         e.preventDefault();
         if (currentItems[selectedIndex]) {
            executeItem(currentItems[selectedIndex]);
         }
      } else if (e.key === 'Escape') {
         e.preventDefault();
         closeCommandPalette();
      }
   });

   window.openCommandPalette = openCommandPalette;
   window.closeCommandPalette = closeCommandPalette;
}

export function openCommandPalette() {
   if (!paletteContainer) initCommandPalette();
   isOpen = true;
   selectedIndex = 0;
   inputEl.value = '';

   paletteContainer.classList.add('is-open');

   const modalEl = document.getElementById('command-palette-modal');
   if (modalEl) {
      modalEl.animate(
         [
            { opacity: 0, transform: 'translateY(-15px) scale(0.95)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
         ],
         {
            duration: 200,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
         },
      );
   }

   renderResults('');
   setTimeout(() => inputEl?.focus(), 50);
}

export function closeCommandPalette() {
   if (!isOpen || !paletteContainer) return;
   isOpen = false;

   const modalEl = document.getElementById('command-palette-modal');
   if (modalEl) {
      const anim = modalEl.animate(
         [
            { opacity: 1, transform: 'translateY(0) scale(1)' },
            { opacity: 0, transform: 'translateY(-10px) scale(0.95)' },
         ],
         {
            duration: 150,
            easing: 'cubic-bezier(0.4, 0, 1, 1)',
            fill: 'forwards',
         },
      );
      anim.onfinish = () => {
         paletteContainer?.classList.remove('is-open');
      };
   } else {
      paletteContainer.classList.remove('is-open');
   }
}

function getAvailableActions() {
   const actions = [];

   // 1. Dynamic Tables
   const tableButtons = document.querySelectorAll('.table-btn');
   tableButtons.forEach((btn) => {
      const tableName = btn.dataset.table;
      if (tableName) {
         actions.push({
            group: 'Tables',
            id: `table-${tableName}`,
            icon: 'table',
            title: tableName,
            desc: `Open table in Data Editor`,
            badge: 'Table',
            action: () => {
               window.AppState.currentTable = tableName;
               window.AppState.currentTableBtnElement = btn;
               document
                  .querySelectorAll('.table-btn')
                  .forEach((b) => b.classList.remove('active'));
               btn.classList.add('active');
               window.handleSwitchTab('data-btn');
            },
         });
      }
   });

   // 2. Global Views
   actions.push(
      {
         group: 'Views',
         id: 'view-sql',
         icon: 'terminal',
         title: 'SQL Console',
         desc: 'Execute raw SQL queries & analyze execution plans',
         badge: 'Console',
         action: () => window.handleSwitchTab('sql-btn'),
      },
      {
         group: 'Views',
         id: 'view-status',
         icon: 'monitoring',
         title: 'Database Status & Metrics',
         desc: 'View real-time database metrics, performance and storage',
         badge: 'Dashboard',
         action: () => window.handleSwitchTab('status-btn'),
      },
      {
         group: 'Views',
         id: 'view-erd',
         icon: 'account_tree',
         title: 'Visual ERD Diagram',
         desc: 'Interactive schema relation diagram and canvas',
         badge: 'Diagram',
         action: () => window.handleSwitchTab('erd-btn'),
      },
      {
         group: 'Views',
         id: 'view-connect',
         icon: 'cable',
         title: 'Connect Database',
         desc: 'Configure connection string or switch database instances',
         badge: 'Connection',
         action: () => window.handleSwitchTab('connect-btn'),
      },
      {
         group: 'Views',
         id: 'view-schema',
         icon: 'schema',
         title: 'Schema Viewer',
         desc: 'Inspect columns, indexes, and constraints',
         badge: 'Schema',
         action: () => window.handleSwitchTab('schema-btn'),
      },
   );

   // 3. AI & Safety Tools
   actions.push(
      {
         group: 'AI & Safety',
         id: 'action-ask-ai',
         icon: 'auto_awesome',
         title: 'Ask AI SQL Assistant',
         desc: 'Open AI Copilot right panel to write or optimize SQL queries',
         badge: 'Ctrl+I',
         action: () => {
            if (window.handleSwitchTab) window.handleSwitchTab('sql-btn');
            setTimeout(() => {
               if (window.toggleConsoleAiBar) {
                  window.toggleConsoleAiBar();
               } else {
                  document.getElementById('console-ai-btn')?.click();
               }
            }, 80);
         },
      },
      {
         group: 'AI & Safety',
         id: 'action-ai-config',
         icon: 'tune',
         title: 'AI Configuration & Models',
         desc: 'Configure DeepSeek, Ollama, OpenAI API keys and provider presets',
         badge: 'AI Config',
         action: () => {
            openAiConfigModal();
         },
      },
      {
         group: 'AI & Safety',
         id: 'action-safe-mode',
         icon: 'security',
         title: 'Toggle Safe Mode (Production Guard)',
         desc: 'Protect against accidental UPDATE/DELETE/DROP queries without confirmation',
         badge: 'Safe Mode',
         action: () => {
            const current = isSafeModeEnabled();
            setSafeModeEnabled(!current);
            window.showToast?.(
               !current
                  ? 'Safe Mode enabled (Destructive query guard ON)'
                  : 'Safe Mode disabled (Guard OFF)',
               !current ? 'success' : 'info',
            );
         },
      },
      {
         group: 'AI & Safety',
         id: 'action-health-doctor',
         icon: 'health_and_safety',
         title: 'Run Schema Health Doctor',
         desc: 'Audit tables for missing PKs, unindexed foreign keys, and antipatterns',
         badge: 'Health Check',
         action: () => {
            import('./healthModal.js').then((m) => m.openHealthModal());
         },
      },
      {
         group: 'AI & Safety',
         id: 'action-recycle-bin',
         icon: 'delete',
         title: 'Open Table Recycle Bin',
         desc: 'View, restore, or purge soft-deleted database tables',
         badge: 'Recycle Bin',
         action: () => {
            import('./recycleBinModal.js').then((m) => m.openRecycleBinModal());
         },
      },
   );

   // 4. Quick Actions
   actions.push(
      {
         group: 'Actions',
         id: 'action-theme',
         icon: 'dark_mode',
         title: 'Toggle Color Theme',
         desc: 'Switch between light and dark visual modes',
         badge: 'Theme',
         action: () => document.getElementById('theme-toggle')?.click(),
      },
      {
         group: 'Actions',
         id: 'action-create-table',
         icon: 'add_box',
         title: 'Create New Table',
         desc: 'Design and create a new database table schema',
         badge: 'Schema',
         action: () => window.openCreateTableModal?.(),
      },
      {
         group: 'Actions',
         id: 'action-export-db',
         icon: 'download',
         title: 'Export Full Database Backup',
         desc: 'Download complete SQL schema & data dump',
         badge: '.sql',
         action: () => window.open('/api/database/export', '_blank'),
      },
      {
         group: 'Actions',
         id: 'action-create-app-launcher',
         icon: 'install_desktop',
         title: 'Install Desktop App Shortcut',
         desc: 'Create a 1-click desktop shortcut to launch Drixio directly without terminal commands',
         badge: 'Desktop App',
         action: async () => {
            const res = await installDesktopApp();
            if (res.success) {
               window.showToast?.(res.message, 'success');
            } else {
               window.showToast?.(`Failed: ${res.error}`, 'error');
            }
         },
      },
      {
         group: 'Actions',
         id: 'action-export-ddl',
         icon: 'description',
         title: 'Export Schema DDL Only',
         desc: 'Download CREATE TABLE statements without rows',
         badge: '.sql',
         action: () => window.open('/api/database/schema-only', '_blank'),
      },
      {
         group: 'Actions',
         id: 'action-export-dict',
         icon: 'menu_book',
         title: 'Export Data Dictionary',
         desc: 'Download schema markdown documentation',
         badge: '.md',
         action: () => window.open('/api/database/dictionary', '_blank'),
      },
      {
         group: 'Actions',
         id: 'action-import-data',
         icon: 'upload',
         title: 'Import & Restore Data',
         desc: 'Import SQL script or JSON dataset into database',
         badge: 'Import',
         action: () => openImportModal('records'),
      },
      {
         group: 'Actions',
         id: 'action-refresh',
         icon: 'refresh',
         title: 'Refresh Data & Tables',
         desc: 'Reload database schema and table rows',
         badge: 'Reload',
         action: () => {
            document.getElementById('header-refresh-btn')?.click();
         },
      },
   );

   return actions;
}

function renderResults(query) {
   const trimmed = (query || '').trim();
   const q = trimmed.toLowerCase();
   const allActions = getAvailableActions();

   let matched = q
      ? allActions.filter(
           (item) =>
              item.title.toLowerCase().includes(q) ||
              item.desc.toLowerCase().includes(q) ||
              item.badge.toLowerCase().includes(q) ||
              item.group.toLowerCase().includes(q),
        )
      : allActions;

   // Direct SQL Command execution if input looks like SQL or starts with >
   const isSqlPattern =
      /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|PRAGMA|EXPLAIN|SHOW)\b/i.test(trimmed) ||
      trimmed.startsWith('>');

   if (isSqlPattern) {
      const cleanSql = trimmed.replace(/^>\s*/, '');
      const directSqlAction = {
         group: 'Direct SQL Command',
         id: 'action-direct-sql-exec',
         icon: 'play_circle',
         title: `Execute SQL: "${cleanSql.length > 45 ? cleanSql.slice(0, 45) + '...' : cleanSql}"`,
         desc: 'Switch to SQL Editor and execute query immediately',
         badge: '↵ Run Query',
         action: () => {
            if (typeof window.runQueryInConsole === 'function') {
               window.runQueryInConsole(cleanSql, true);
            } else {
               if (window.handleSwitchTab) {
                  window.handleSwitchTab('sql-btn');
               }
               setTimeout(() => {
                  if (typeof window.runQueryInConsole === 'function') {
                     window.runQueryInConsole(cleanSql, true);
                  }
               }, 150);
            }
         },
      };
      matched = [directSqlAction, ...matched];
   }

   currentItems = matched;

   selectedIndex = Math.min(
      selectedIndex,
      Math.max(0, currentItems.length - 1),
   );

   if (currentItems.length === 0) {
      resultsEl.innerHTML = `
         <div class="command-palette-empty">
            <span class="material-symbols-outlined">search_off</span>
            <div class="command-palette-empty-text">No matching commands or tables found</div>
         </div>
      `;
      return;
   }

   // Group items
   const groups = {};
   currentItems.forEach((item, index) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push({ item, index });
   });

   let html = '';
   for (const [groupName, entries] of Object.entries(groups)) {
      html += `<div class="command-palette-group-title">${groupName}</div>`;
      for (const { item, index } of entries) {
         const isSelected = index === selectedIndex;
         html += `
            <div class="command-palette-item ${isSelected ? 'is-selected' : ''}" data-idx="${index}">
               <div class="command-palette-item-left">
                  <div class="command-palette-item-icon">
                     <span class="material-symbols-outlined">${item.icon}</span>
                  </div>
                  <div class="command-palette-item-info">
                     <div class="command-palette-item-title">${escapeHtml(item.title)}</div>
                     <div class="command-palette-item-desc">${escapeHtml(item.desc)}</div>
                  </div>
               </div>
               <span class="command-palette-item-badge">${item.badge}</span>
            </div>
         `;
      }
   }

   resultsEl.innerHTML = html;

   // Bind click events
   resultsEl.querySelectorAll('.command-palette-item').forEach((el) => {
      el.addEventListener('click', () => {
         const idx = parseInt(el.dataset.idx, 10);
         if (currentItems[idx]) {
            executeItem(currentItems[idx]);
         }
      });
      el.addEventListener('mouseenter', () => {
         selectedIndex = parseInt(el.dataset.idx, 10);
         updateSelection();
      });
   });

   scrollSelectedIntoView();
}

function updateSelection() {
   const items = resultsEl.querySelectorAll('.command-palette-item');
   items.forEach((el) => {
      const idx = parseInt(el.dataset.idx, 10);
      el.classList.toggle('is-selected', idx === selectedIndex);
   });
   scrollSelectedIntoView();
}

function scrollSelectedIntoView() {
   const selectedEl = resultsEl.querySelector(
      '.command-palette-item.is-selected',
   );
   if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
   }
}

function executeItem(item) {
   closeCommandPalette();
   setTimeout(() => {
      try {
         item.action();
      } catch (err) {
         console.error('Command execution failed:', err);
      }
   }, 100);
}
