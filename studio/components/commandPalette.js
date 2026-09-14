import { openImportModal } from './importModal.js';

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
               placeholder="Search tables, views, or commands..." 
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
   if (window.gsap && modalEl) {
      gsap.fromTo(
         modalEl,
         { opacity: 0, scale: 0.95, y: -15 },
         { opacity: 1, scale: 1, y: 0, duration: 0.2, ease: 'power2.out' },
      );
   }

   renderResults('');
   setTimeout(() => inputEl?.focus(), 50);
}

export function closeCommandPalette() {
   if (!isOpen || !paletteContainer) return;
   isOpen = false;

   const modalEl = document.getElementById('command-palette-modal');
   if (window.gsap && modalEl) {
      gsap.to(modalEl, {
         opacity: 0,
         scale: 0.96,
         y: -10,
         duration: 0.15,
         ease: 'power2.in',
         onComplete: () => {
            paletteContainer.classList.remove('is-open');
         },
      });
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

   // 3. Quick Actions
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
   const q = query.toLowerCase();
   const allActions = getAvailableActions();

   currentItems = q
      ? allActions.filter(
           (item) =>
              item.title.toLowerCase().includes(q) ||
              item.desc.toLowerCase().includes(q) ||
              item.badge.toLowerCase().includes(q) ||
              item.group.toLowerCase().includes(q),
        )
      : allActions;

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

function escapeHtml(str) {
   return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
}
